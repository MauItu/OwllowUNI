import { Router } from 'express';
import { and, eq, gte, lte, sql, desc, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import { format, addDays, subMonths } from 'date-fns';
import { db } from '../db/connection.js';
import { accounts, creditCardStatements, transactions, categories, recurringRules, savingsGoals, type Account } from '../db/schema.js';
import { asyncHandler, ApiError, isUniqueViolation } from '../middleware/errorHandler.js';
import { parseId } from '../utils/parseId.js';
import { userId } from '../middleware/auth.js';
import { safeCompensate } from '../utils/safeCompensate.js';
import { buildFifoCardDebtPayment } from '../utils/creditCardDebt.js';
import { getConversionMap } from '../services/exchangeRates.js';
import { cacheResponse, ACCOUNTS_SUMMARY_TTL_MS } from '../services/cache.js';

export const accountsRouter = Router();

const accountSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['bank', 'cash', 'credit_card', 'digital_wallet']),
  currency: z.string().length(3).default('COP'),
  initialBalance: z.coerce.number().default(0),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#4F46E5'),
  icon: z.string().max(50).default('wallet'),
  // Solo para credit_card (ignorados/validados según el tipo en cada handler).
  creditLimit: z.coerce.number().positive().optional().nullable(),
  billingCycleDay: z.coerce.number().int().min(1).max(28).optional().nullable(),
  paymentDueDay: z.coerce.number().int().min(1).max(28).optional().nullable(),
  allowOverdraft: z.boolean().optional(),
  // Cuota de manejo (cualquier tipo de cuenta). Enviar ambos para activarla;
  // managementFeeAmount: null la desactiva. Se materializa como regla recurrente mensual.
  managementFeeAmount: z.coerce.number().positive().optional().nullable(),
  managementFeeDay: z.coerce.number().int().min(1).max(28).optional().nullable(),
});

/** Hora actual HH:mm:ss para las transacciones generadas automáticamente. */
function nowTime(): string {
  return new Date().toTimeString().slice(0, 8);
}

/** UPDATE de balance relativo (delta ya con signo, scoped por usuario). */
function balanceUpdate(uid: number, accountId: number, delta: number) {
  return db
    .update(accounts)
    .set({
      currentBalance: sql`${accounts.currentBalance} + ${delta.toFixed(2)}::numeric`,
      updatedAt: new Date(),
    })
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, uid)));
}

const ymd = (d: Date) => format(d, 'yyyy-MM-dd');

/** Primera fecha con día-del-mes === `day` (1-28) que sea >= `from`. */
function nextDateOnDay(day: number, from: Date): Date {
  const candidate = new Date(from.getFullYear(), from.getMonth(), day);
  if (from.getDate() > day) candidate.setMonth(candidate.getMonth() + 1);
  return candidate;
}

/** Categoría de gasto "Comisiones bancarias" del usuario; la crea si no existe. */
async function getOrCreateExpenseCategory(uid: number, name: string): Promise<{ id: number }> {
  const [existing] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.userId, uid),
        eq(categories.type, 'expense'),
        sql`lower(${categories.name}) = ${name.toLowerCase()}`,
      ),
    )
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(categories)
    .values({ userId: uid, name, type: 'expense', icon: 'receipt', color: '#6C757D' })
    .returning({ id: categories.id });
  return created;
}

/** Campos de cuota de manejo que se persisten en `accounts`. */
type FeeFields = {
  managementFeeAmount: string | null;
  managementFeeDay: number | null;
  managementFeeRuleId: number | null;
};

/**
 * Sincroniza la cuota de manejo de una cuenta con su regla recurrente vinculada
 * (la cuota es un caso especial de regla recurrente, no un sistema aparte):
 *  - activar/actualizar: crea o actualiza una regla mensual (categoría "Comisiones
 *    bancarias").
 *  - desactivar (feeAmount null): pausa la regla (isActive=false) SIN borrar las
 *    transacciones ya generadas y limpia el monto/día, pero CONSERVA el vínculo
 *    (managementFeeRuleId) para reutilizar la misma regla si se reactiva (evita
 *    acumular reglas pausadas huérfanas).
 * Devuelve los campos listos para el UPDATE de `accounts` y, si creó una regla NUEVA,
 * su id en `createdRuleId` (para compensar si el UPDATE de accounts falla luego).
 */
async function syncManagementFee(
  uid: number,
  account: { id: number; name: string; managementFeeRuleId: number | null },
  feeAmount: number | null,
  feeDay: number | null,
): Promise<{ fields: FeeFields; createdRuleId: number | null }> {
  const enabling = feeAmount != null && feeAmount > 0;
  if (enabling) {
    // Activar exige día (el monto sin día no se puede materializar como mensual).
    if (feeDay == null) {
      throw new ApiError(400, 'La cuota de manejo requiere un día de cobro');
    }
    const cat = await getOrCreateExpenseCategory(uid, 'Comisiones bancarias');
    const amountStr = feeAmount.toFixed(2);
    const description = `Cuota de manejo ${account.name}`;
    if (account.managementFeeRuleId != null) {
      // Actualiza (y reactiva) la regla ya vinculada.
      await db
        .update(recurringRules)
        .set({
          accountId: account.id,
          type: 'expense',
          amount: amountStr,
          description,
          categoryId: cat.id,
          frequency: 'monthly',
          dayOfMonth: feeDay,
          dayOfWeek: null,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(and(eq(recurringRules.id, account.managementFeeRuleId), eq(recurringRules.userId, uid)));
      return {
        fields: { managementFeeAmount: amountStr, managementFeeDay: feeDay, managementFeeRuleId: account.managementFeeRuleId },
        createdRuleId: null,
      };
    }
    // Crea la regla. Cursor = día anterior a hoy (backfilea desde hoy en adelante).
    const today = ymd(new Date());
    const cursor = ymd(addDays(new Date(), -1));
    const [rule] = await db
      .insert(recurringRules)
      .values({
        userId: uid,
        accountId: account.id,
        type: 'expense',
        amount: amountStr,
        description,
        categoryId: cat.id,
        frequency: 'monthly',
        dayOfMonth: feeDay,
        startDate: today,
        lastGeneratedDate: cursor,
      })
      .returning({ id: recurringRules.id });
    return {
      fields: { managementFeeAmount: amountStr, managementFeeDay: feeDay, managementFeeRuleId: rule.id },
      createdRuleId: rule.id,
    };
  }
  // Desactivar: pausa la regla vinculada (no borra registros) y limpia monto/día,
  // pero CONSERVA el vínculo para reutilizarla si se reactiva.
  if (account.managementFeeRuleId != null) {
    await db
      .update(recurringRules)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(recurringRules.id, account.managementFeeRuleId), eq(recurringRules.userId, uid)));
  }
  return {
    fields: { managementFeeAmount: null, managementFeeDay: null, managementFeeRuleId: account.managementFeeRuleId },
    createdRuleId: null,
  };
}

/**
 * Da forma a una cuenta para la respuesta. Para tarjetas de crédito agrega los
 * campos calculados (crédito usado/disponible, utilización, próximas fechas);
 * para el resto de cuentas OMITE las columnas de tarjeta para no contaminar.
 */
// `reservedSavings`: monto de metas de ahorro vinculadas a esta cuenta (earmark).
// El dinero no se mueve; queda reservado dentro del saldo. El mobile muestra
// "disponible = saldo − ahorro reservado".
function shapeAccount(row: Account, reservedSavings = 0) {
  const reserved = Math.round(reservedSavings * 100) / 100;
  const { creditLimit, billingCycleDay, paymentDueDay, allowOverdraft, ...base } = row;
  if (row.type !== 'credit_card') return { ...base, reservedSavings: reserved };

  const limit = creditLimit != null ? Number(creditLimit) : 0;
  // Nuevo modelo: current_balance ES el crédito DISPONIBLE (positivo), no la deuda.
  const balance = Number(row.currentBalance);
  const creditAvailable = Math.max(0, Math.min(limit, balance));
  // Usado/adeudado = límite − disponible (lo consumido). Topado a [0, límite].
  const creditUsed = Math.max(0, limit - balance);
  const cycleDay = billingCycleDay ?? 1;
  const payDay = paymentDueDay ?? 20;
  const today = new Date();
  const nextBilling = nextDateOnDay(cycleDay, today);
  // El pago vence el `payDay` que cae tras el próximo corte.
  const nextPayment = nextDateOnDay(payDay, nextBilling);

  return {
    ...base,
    reservedSavings: reserved,
    allowOverdraft,
    creditLimit: limit,
    creditUsed: Math.round(creditUsed * 100) / 100,
    creditAvailable: Math.round(creditAvailable * 100) / 100,
    utilizationPercentage: limit > 0 ? Math.round((creditUsed / limit) * 10000) / 100 : 0,
    billingCycleDay: cycleDay,
    paymentDueDay: payDay,
    nextBillingDate: ymd(nextBilling),
    nextPaymentDueDate: ymd(nextPayment),
  };
}

/** Mapa accountId → ahorro reservado (suma de metas vinculadas) del usuario. */
async function reservedSavingsByAccount(uid: number): Promise<Map<number, number>> {
  const goals = await db
    .select({ accountId: savingsGoals.accountId, currentAmount: savingsGoals.currentAmount })
    .from(savingsGoals)
    .where(and(eq(savingsGoals.userId, uid), isNotNull(savingsGoals.accountId)));
  const map = new Map<number, number>();
  for (const g of goals) {
    if (g.accountId == null) continue;
    map.set(g.accountId, (map.get(g.accountId) ?? 0) + Number(g.currentAmount));
  }
  return map;
}

// GET /api/accounts — cuentas activas. Con ?includeInactive=true devuelve también
// las desactivadas (para la pantalla de lista, que las muestra con indicador). Los
// selectores usan el GET normal (solo activas).
accountsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const includeInactive = req.query.includeInactive === 'true' || req.query.includeInactive === '1';
    const where = includeInactive
      ? eq(accounts.userId, userId(req))
      : and(eq(accounts.userId, userId(req)), eq(accounts.isActive, true));
    const rows = await db
      .select()
      .from(accounts)
      .where(where)
      // Activas primero (las inactivas al final de la lista).
      .orderBy(desc(accounts.isActive), accounts.id)
      // TODO: paginar con load-more en mobile
      .limit(200);
    const reserved = await reservedSavingsByAccount(userId(req));
    res.json(rows.map((r) => shapeAccount(r, reserved.get(r.id) ?? 0)));
  }),
);

// GET /api/accounts/summary?displayCurrency=COP[&refresh=true]
// Balance consolidado convertido a la moneda de visualización (debe ir ANTES de /:id).
accountsRouter.get(
  '/summary',
  cacheResponse(ACCOUNTS_SUMMARY_TTL_MS),
  asyncHandler(async (req, res) => {
    const displayCurrency = ((req.query.displayCurrency as string) || 'COP').toUpperCase();
    const force = req.query.refresh === 'true' || req.query.refresh === '1';

    // Trae las cuentas (pocas filas) para separar débito vs crédito y calcular
    // los agregados de tarjeta, que no se reducen a un simple SUM del saldo.
    const accts = await db
      .select({
        currency: accounts.currency,
        currentBalance: accounts.currentBalance,
        type: accounts.type,
        creditLimit: accounts.creditLimit,
      })
      .from(accounts)
      .where(and(eq(accounts.userId, userId(req)), eq(accounts.isActive, true)));

    const currencies = [...new Set(accts.map((a) => a.currency))];
    const { map, stale, oldestFetchedAt } = await getConversionMap(
      userId(req),
      displayCurrency,
      currencies,
      force,
    );
    const rateOf = (cur: string) => map.get(cur.toUpperCase()) ?? 1;
    const r2 = (n: number) => Math.round(n * 100) / 100;

    let debitTotal = 0;
    let creditAvailable = 0;
    let creditLimit = 0;
    let creditUsed = 0;
    // Contribución NETA al patrimonio por moneda (débito = saldo; tarjeta = −deuda).
    const byCur = new Map<string, number>();
    for (const a of accts) {
      const bal = Number(a.currentBalance);
      const rate = rateOf(a.currency);
      if (a.type === 'credit_card') {
        const limit = a.creditLimit != null ? Number(a.creditLimit) : 0;
        const available = Math.max(0, Math.min(limit, bal));
        const used = Math.max(0, limit - bal);
        creditAvailable += available * rate;
        creditLimit += limit * rate;
        creditUsed += used * rate;
        // La tarjeta resta del patrimonio por lo adeudado (−used), no por su saldo.
        byCur.set(a.currency, (byCur.get(a.currency) ?? 0) - used);
      } else {
        debitTotal += bal * rate;
        byCur.set(a.currency, (byCur.get(a.currency) ?? 0) + bal);
      }
    }

    const byCurrency = [...byCur.entries()].map(([currency, raw]) => ({
      currency,
      total: r2(raw),
      converted: r2(raw * rateOf(currency)),
    }));

    res.json({
      displayCurrency,
      // Patrimonio neto líquido = lo que tengo (débito) − lo que debo (crédito usado).
      total: r2(debitTotal - creditUsed),
      debitTotal: r2(debitTotal),
      // Contribución neta de las tarjetas al patrimonio (deuda en negativo).
      creditTotal: r2(-creditUsed),
      creditLimit: r2(creditLimit),
      creditUsed: r2(creditUsed),
      // Crédito disponible agregado = suma de saldos (disponibles) de las tarjetas.
      creditAvailable: r2(creditAvailable),
      // "Dinero posible" = saldo de débito + crédito disponible.
      possibleMoney: r2(debitTotal + creditAvailable),
      byCurrency,
      stale,
      ratesUpdatedAt: oldestFetchedAt,
    });
  }),
);

// GET /api/accounts/:id
accountsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const [row] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, id), eq(accounts.userId, userId(req))));
    if (!row) throw new ApiError(404, 'Cuenta no encontrada');
    const reserved = await reservedSavingsByAccount(userId(req));
    res.json(shapeAccount(row, reserved.get(row.id) ?? 0));
  }),
);

// POST /api/accounts
accountsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = accountSchema.parse(req.body);

    const isCredit = data.type === 'credit_card';
    if (isCredit && (data.creditLimit == null || data.creditLimit <= 0)) {
      throw new ApiError(400, 'Una tarjeta de crédito requiere un límite de crédito mayor a 0');
    }

    // En una tarjeta de crédito, el initialBalance que envía el usuario es la
    // DEUDA preexistente. El saldo guardado es el CRÉDITO DISPONIBLE = límite − deuda
    // (0 deuda → disponible = límite; deuda 1M con límite 5.5M → disponible 4.5M).
    const startBalance = isCredit ? data.creditLimit! - data.initialBalance : data.initialBalance;

    const [row] = await db
      .insert(accounts)
      .values({
        userId: userId(req),
        name: data.name,
        type: data.type,
        currency: data.currency,
        initialBalance: startBalance.toFixed(2),
        currentBalance: startBalance.toFixed(2),
        color: data.color,
        icon: data.icon,
        ...(isCredit && {
          creditLimit: data.creditLimit!.toFixed(2),
          billingCycleDay: data.billingCycleDay ?? 1,
          paymentDueDay: data.paymentDueDay ?? 20,
          allowOverdraft: data.allowOverdraft ?? false,
        }),
      })
      .returning();

    // Cuota de manejo: si se envió, crea la regla recurrente vinculada y guarda los campos.
    let result = row;
    if (data.managementFeeAmount != null) {
      const { fields, createdRuleId } = await syncManagementFee(
        userId(req),
        { id: row.id, name: row.name, managementFeeRuleId: null },
        data.managementFeeAmount,
        data.managementFeeDay ?? null,
      );
      try {
        [result] = await db
          .update(accounts)
          .set({ ...fields, updatedAt: new Date() })
          .where(and(eq(accounts.id, row.id), eq(accounts.userId, userId(req))))
          .returning();
      } catch (err) {
        // Si el UPDATE falla, la regla recién creada quedaría huérfana (generando
        // cargos sin que la cuenta la referencie): la borramos (saga).
        if (createdRuleId != null) {
          await safeCompensate([db.delete(recurringRules).where(eq(recurringRules.id, createdRuleId))], {
            endpoint: 'POST /api/accounts',
            operation: 'managementFee',
            userId: userId(req),
            entityId: row.id,
          });
        }
        throw err;
      }
    }
    res.status(201).json(shapeAccount(result));
  }),
);

// PUT /api/accounts/:id
accountsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const data = accountSchema.partial().parse(req.body);

    const [existing] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, id), eq(accounts.userId, userId(req))));
    if (!existing) throw new ApiError(404, 'Cuenta no encontrada');

    // Si cambia el saldo inicial, ajusta el balance actual por la diferencia.
    let currentBalance = existing.currentBalance;
    if (data.initialBalance !== undefined) {
      const diff = data.initialBalance - Number(existing.initialBalance);
      currentBalance = (Number(existing.currentBalance) + diff).toFixed(2);
    }

    // Cuota de manejo: solo se toca si el request la incluye (crear/modificar/eliminar).
    // Mantiene la regla recurrente vinculada en sincronía con los campos de la cuenta.
    let feeFields: FeeFields | undefined;
    let feeCreatedRuleId: number | null = null;
    if (data.managementFeeAmount !== undefined || data.managementFeeDay !== undefined) {
      const feeAmount =
        data.managementFeeAmount !== undefined
          ? data.managementFeeAmount
          : existing.managementFeeAmount != null
            ? Number(existing.managementFeeAmount)
            : null;
      const feeDay = data.managementFeeDay !== undefined ? data.managementFeeDay : existing.managementFeeDay;
      const sync = await syncManagementFee(
        userId(req),
        { id: existing.id, name: data.name ?? existing.name, managementFeeRuleId: existing.managementFeeRuleId },
        feeAmount,
        feeDay,
      );
      feeFields = sync.fields;
      feeCreatedRuleId = sync.createdRuleId;
    }

    let row: Account;
    try {
      [row] = await db
      .update(accounts)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.currency !== undefined && { currency: data.currency }),
        ...(data.initialBalance !== undefined && {
          initialBalance: data.initialBalance.toFixed(2),
          currentBalance,
        }),
        ...(data.color !== undefined && { color: data.color }),
        ...(data.icon !== undefined && { icon: data.icon }),
        // Parámetros de tarjeta (el cambio de límite es inmediato; no afecta
        // estados de cuenta pasados). El schema ya valida límite > 0 y días 1-28.
        ...(data.creditLimit !== undefined && { creditLimit: data.creditLimit != null ? data.creditLimit.toFixed(2) : null }),
        ...(data.billingCycleDay !== undefined && { billingCycleDay: data.billingCycleDay }),
        ...(data.paymentDueDay !== undefined && { paymentDueDay: data.paymentDueDay }),
        ...(data.allowOverdraft !== undefined && { allowOverdraft: data.allowOverdraft }),
        ...(feeFields && feeFields),
        updatedAt: new Date(),
      })
      .where(and(eq(accounts.id, id), eq(accounts.userId, userId(req))))
      .returning();
    } catch (err) {
      // Si el UPDATE de la cuenta falla tras crear una regla NUEVA de cuota, la
      // borramos para no dejarla huérfana generando cargos (saga).
      if (feeCreatedRuleId != null) {
        await safeCompensate([db.delete(recurringRules).where(eq(recurringRules.id, feeCreatedRuleId))], {
          endpoint: 'PUT /api/accounts/:id',
          operation: 'managementFee',
          userId: userId(req),
          entityId: id,
        });
      }
      throw err;
    }
    res.json(shapeAccount(row));
  }),
);

// DELETE /api/accounts/:id — soft delete
accountsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const [row] = await db
      .update(accounts)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(accounts.id, id), eq(accounts.userId, userId(req))))
      .returning();
    if (!row) throw new ApiError(404, 'Cuenta no encontrada');
    res.json({ success: true });
  }),
);

// PATCH /api/accounts/:id/toggle-active — desactiva/reactiva una cuenta. Desactivada:
// no aparece en selectores (GET sin includeInactive) pero sí en lista/historial/reportes.
accountsRouter.patch(
  '/:id/toggle-active',
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const id = parseId(req.params.id);
    const [row] = await db
      .update(accounts)
      .set({ isActive: sql`NOT ${accounts.isActive}`, updatedAt: new Date() })
      .where(and(eq(accounts.id, id), eq(accounts.userId, uid)))
      .returning();
    if (!row) throw new ApiError(404, 'Cuenta no encontrada');
    res.json(shapeAccount(row));
  }),
);

// PATCH /api/accounts/:id/toggle-frozen — congela/descongela una tarjeta de crédito.
// Congelada: bloquea gastos nuevos (POST /api/transactions), permite pagos de deuda.
accountsRouter.patch(
  '/:id/toggle-frozen',
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const id = parseId(req.params.id);
    const [acc] = await db
      .select({ type: accounts.type })
      .from(accounts)
      .where(and(eq(accounts.id, id), eq(accounts.userId, uid)));
    if (!acc) throw new ApiError(404, 'Cuenta no encontrada');
    if (acc.type !== 'credit_card') {
      throw new ApiError(400, 'Solo se pueden congelar tarjetas de crédito');
    }
    const [row] = await db
      .update(accounts)
      .set({ isFrozen: sql`NOT ${accounts.isFrozen}`, updatedAt: new Date() })
      .where(and(eq(accounts.id, id), eq(accounts.userId, uid)))
      .returning();
    if (!row) throw new ApiError(404, 'Cuenta no encontrada');
    res.json(shapeAccount(row));
  }),
);

// ──────────────────── Tarjetas de crédito: estados de cuenta ────────────────────

/** Trae una tarjeta de crédito del usuario (404 si no existe, 400 si no es credit_card). */
async function getOwnedCreditCard(uid: number, id: number): Promise<Account> {
  const [acc] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.userId, uid)));
  if (!acc) throw new ApiError(404, 'Cuenta no encontrada');
  if (acc.type !== 'credit_card') throw new ApiError(400, 'La cuenta no es una tarjeta de crédito');
  return acc;
}

const payStatementSchema = z.object({
  amount: z.coerce.number().positive(),
  paymentAccountId: z.number().int(),
});

// GET /api/accounts/:id/statements — historial de estados de cuenta (paginado)
accountsRouter.get(
  '/:id/statements',
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const id = parseId(req.params.id);
    await getOwnedCreditCard(uid, id);

    const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 12));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    const rows = await db
      .select()
      .from(creditCardStatements)
      .where(and(eq(creditCardStatements.userId, uid), eq(creditCardStatements.accountId, id)))
      .orderBy(desc(creditCardStatements.periodEnd))
      .limit(limit)
      .offset(offset);
    res.json(rows);
  }),
);

// POST /api/accounts/:id/generate-statement — genera el corte del periodo actual
// (manual; en producción lo haría un cron). Suma los gastos del periodo y crea
// una deuda automática con la fecha de pago.
accountsRouter.post(
  '/:id/generate-statement',
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const id = parseId(req.params.id);
    const card = await getOwnedCreditCard(uid, id);

    const cycleDay = card.billingCycleDay ?? 1;
    const payDay = card.paymentDueDay ?? 20;
    const today = new Date();
    // Corte más reciente (<= hoy) y su periodo (día siguiente al corte anterior → corte).
    let periodEnd = new Date(today.getFullYear(), today.getMonth(), cycleDay);
    if (today.getDate() < cycleDay) periodEnd = subMonths(periodEnd, 1);
    const periodStart = addDays(subMonths(periodEnd, 1), 1);
    const paymentDue = nextDateOnDay(payDay, addDays(periodEnd, 1));

    // Un solo estado de cuenta por corte (best-effort; el UNIQUE es la verdad).
    const [dup] = await db
      .select({ id: creditCardStatements.id })
      .from(creditCardStatements)
      .where(and(eq(creditCardStatements.accountId, id), eq(creditCardStatements.periodEnd, ymd(periodEnd))));
    if (dup) throw new ApiError(409, 'Ya existe un estado de cuenta para este periodo');

    const [{ total }] = await db
      .select({ total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)` })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, uid),
          eq(transactions.accountId, id),
          eq(transactions.type, 'expense'),
          gte(transactions.date, ymd(periodStart)),
          lte(transactions.date, ymd(periodEnd)),
        ),
      );
    const totalAmount = Number(total);
    const settled = totalAmount <= 0; // sin gasto en el periodo → ya "pagado"

    // El corte es solo INFORMATIVO: NO genera deuda. La deuda ya se crea por cada
    // compra con tarjeta en POST /api/transactions (1 deuda por compra), así que
    // generar deuda también al corte la contaría doble.
    try {
      const [stmt] = await db
        .insert(creditCardStatements)
        .values({
          accountId: id,
          userId: uid,
          periodStart: ymd(periodStart),
          periodEnd: ymd(periodEnd),
          paymentDueDate: ymd(paymentDue),
          totalAmount: totalAmount.toFixed(2),
          paidAmount: '0',
          isPaid: settled,
          debtId: null,
        })
        .returning();
      res.status(201).json(stmt);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ApiError(409, 'Ya existe un estado de cuenta para este periodo');
      }
      throw err;
    }
  }),
);

// POST /api/accounts/:id/statements/:statementId/pay — abona al estado de cuenta
// vía transferencia (cuenta de pago → tarjeta) y reduce la deuda asociada.
accountsRouter.post(
  '/:id/statements/:statementId/pay',
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const id = parseId(req.params.id);
    const statementId = parseId(req.params.statementId);
    const data = payStatementSchema.parse(req.body);

    const card = await getOwnedCreditCard(uid, id);
    if (data.paymentAccountId === id) {
      throw new ApiError(400, 'La cuenta de pago debe ser distinta a la tarjeta');
    }

    const [stmt] = await db
      .select()
      .from(creditCardStatements)
      .where(
        and(
          eq(creditCardStatements.id, statementId),
          eq(creditCardStatements.userId, uid),
          eq(creditCardStatements.accountId, id),
        ),
      );
    if (!stmt) throw new ApiError(404, 'Estado de cuenta no encontrado');

    const [payAcc] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.id, data.paymentAccountId), eq(accounts.userId, uid)));
    if (!payAcc) throw new ApiError(404, 'Cuenta de pago no encontrada');

    const amountStr = data.amount.toFixed(2);

    // Decremento CONDICIONAL anti-TOCTOU: solo paga si cabe en el saldo del statement.
    const [updatedStmt] = await db
      .update(creditCardStatements)
      .set({
        paidAmount: sql`${creditCardStatements.paidAmount} + ${amountStr}::numeric`,
        isPaid: sql`${creditCardStatements.totalAmount} <= ${creditCardStatements.paidAmount} + ${amountStr}::numeric`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(creditCardStatements.id, statementId),
          eq(creditCardStatements.userId, uid),
          sql`${creditCardStatements.totalAmount} - ${creditCardStatements.paidAmount} >= ${amountStr}::numeric`,
        ),
      )
      .returning();
    if (!updatedStmt) throw new ApiError(400, 'El pago supera el saldo del estado de cuenta');

    // Batch B (atómico): transferencia cuenta de pago → tarjeta + saldos + deuda.
    // (asume misma moneda entre la cuenta de pago y la tarjeta).
    const insertTx = db.insert(transactions).values({
      userId: uid,
      type: 'transfer',
      amount: amountStr,
      description: `Pago tarjeta ${card.name}`,
      date: ymd(new Date()),
      time: nowTime(),
      accountId: data.paymentAccountId,
      toAccountId: id,
    });
    // Libera crédito en la tarjeta (saldo += pago) y abona a las deudas automáticas
    // de la tarjeta por orden FIFO (las más antiguas primero), todo en el mismo batch.
    const fifo = await buildFifoCardDebtPayment(uid, id, data.amount);
    const stmts: unknown[] = [
      insertTx,
      balanceUpdate(uid, data.paymentAccountId, -data.amount), // sale de la cuenta de pago
      balanceUpdate(uid, id, data.amount), // entra a la tarjeta (libera crédito)
      ...fifo.apply,
    ];

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.batch(stmts as any);
    } catch (err) {
      // Compensa el decremento condicional del statement (revierte paid_amount/is_paid).
      await safeCompensate(
        [
          db
            .update(creditCardStatements)
            .set({
              paidAmount: sql`${creditCardStatements.paidAmount} - ${amountStr}::numeric`,
              isPaid: false,
              updatedAt: new Date(),
            })
            .where(eq(creditCardStatements.id, statementId)),
        ],
        {
          endpoint: 'POST /api/accounts/:id/statements/:statementId/pay',
          operation: 'payStatement',
          userId: uid,
          entityId: statementId,
        },
      );
      throw err;
    }

    res.json({ success: true, statement: updatedStmt });
  }),
);
