import { Router } from 'express';
import { and, eq, gte, lte, sql, desc } from 'drizzle-orm';
import { z } from 'zod';
import { format, addDays, subMonths } from 'date-fns';
import { db } from '../db/connection.js';
import { accounts, creditCardStatements, debts, transactions, type Account } from '../db/schema.js';
import { asyncHandler, ApiError, isUniqueViolation } from '../middleware/errorHandler.js';
import { parseId } from '../utils/parseId.js';
import { userId } from '../middleware/auth.js';
import { safeCompensate } from '../utils/safeCompensate.js';
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

/**
 * Da forma a una cuenta para la respuesta. Para tarjetas de crédito agrega los
 * campos calculados (crédito usado/disponible, utilización, próximas fechas);
 * para el resto de cuentas OMITE las columnas de tarjeta para no contaminar.
 */
function shapeAccount(row: Account) {
  const { creditLimit, billingCycleDay, paymentDueDay, allowOverdraft, ...base } = row;
  if (row.type !== 'credit_card') return base;

  const limit = creditLimit != null ? Number(creditLimit) : 0;
  const balance = Number(row.currentBalance);
  const creditUsed = Math.abs(Math.min(balance, 0));
  // Disponible = límite + saldo (saldo negativo = deuda). Si pagó de más (saldo
  // positivo), se topa al límite.
  const creditAvailable = Math.min(limit, limit + balance);
  const cycleDay = billingCycleDay ?? 1;
  const payDay = paymentDueDay ?? 20;
  const today = new Date();
  const nextBilling = nextDateOnDay(cycleDay, today);
  // El pago vence el `payDay` que cae tras el próximo corte.
  const nextPayment = nextDateOnDay(payDay, nextBilling);

  return {
    ...base,
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

// GET /api/accounts — cuentas activas
accountsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.userId, userId(req)), eq(accounts.isActive, true)))
      // TODO: paginar con load-more en mobile
      .limit(200);
    res.json(rows.map(shapeAccount));
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
    let creditTotal = 0;
    let creditLimit = 0;
    let creditUsed = 0;
    const byCur = new Map<string, number>(); // saldo crudo por moneda
    for (const a of accts) {
      const bal = Number(a.currentBalance);
      const rate = rateOf(a.currency);
      const converted = bal * rate;
      byCur.set(a.currency, (byCur.get(a.currency) ?? 0) + bal);
      if (a.type === 'credit_card') {
        creditTotal += converted;
        if (a.creditLimit != null) creditLimit += Number(a.creditLimit) * rate;
        creditUsed += Math.abs(Math.min(bal, 0)) * rate;
      } else {
        debitTotal += converted;
      }
    }

    const byCurrency = [...byCur.entries()].map(([currency, raw]) => ({
      currency,
      total: r2(raw),
      converted: r2(raw * rateOf(currency)),
    }));

    res.json({
      displayCurrency,
      total: r2(debitTotal + creditTotal),
      debitTotal: r2(debitTotal),
      creditTotal: r2(creditTotal),
      creditLimit: r2(creditLimit),
      creditUsed: r2(creditUsed),
      // Disponible agregado = límite − usado (equivale a topar cada tarjeta a su límite).
      creditAvailable: r2(creditLimit - creditUsed),
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
    res.json(shapeAccount(row));
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
    // DEUDA preexistente: se guarda como saldo NEGATIVO (-deuda). 0 = no debe nada.
    const startBalance = isCredit ? -data.initialBalance : data.initialBalance;

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
    res.status(201).json(shapeAccount(row));
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

    const [row] = await db
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
        updatedAt: new Date(),
      })
      .where(and(eq(accounts.id, id), eq(accounts.userId, userId(req))))
      .returning();
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

    // Deuda automática (NO mueve saldo: el saldo de la tarjeta ya refleja el gasto).
    // Saga: insert deuda → insert statement con debt_id; si el statement falla
    // (carrera del UNIQUE) se compensa borrando la deuda.
    const [debt] = await db
      .insert(debts)
      .values({
        userId: uid,
        name: `Estado de cuenta ${card.name} - ${format(periodEnd, 'MM/yyyy')}`,
        type: 'debt',
        totalAmount: totalAmount.toFixed(2),
        remainingAmount: totalAmount.toFixed(2),
        startDate: ymd(periodEnd),
        dueDate: ymd(paymentDue),
        accountId: id,
        isPaidOff: settled,
        paidOffAt: settled ? new Date() : null,
      })
      .returning();

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
          debtId: debt.id,
        })
        .returning();
      res.status(201).json({ ...stmt, debt });
    } catch (err) {
      await safeCompensate([db.delete(debts).where(eq(debts.id, debt.id))], {
        endpoint: 'POST /api/accounts/:id/generate-statement',
        operation: 'generateStatement',
        userId: uid,
        entityId: id,
      });
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
    const stmts: unknown[] = [
      insertTx,
      balanceUpdate(uid, data.paymentAccountId, -data.amount), // sale de la cuenta de pago
      balanceUpdate(uid, id, data.amount), // entra a la tarjeta (reduce la deuda)
    ];
    if (stmt.debtId != null) {
      stmts.push(
        db
          .update(debts)
          .set({
            remainingAmount: sql`GREATEST(0, ${debts.remainingAmount} - ${amountStr}::numeric)`,
            isPaidOff: sql`${debts.remainingAmount} - ${amountStr}::numeric <= 0`,
            paidOffAt: sql`CASE WHEN ${debts.remainingAmount} - ${amountStr}::numeric <= 0 THEN COALESCE(${debts.paidOffAt}, now()) ELSE ${debts.paidOffAt} END`,
            updatedAt: new Date(),
          })
          .where(and(eq(debts.id, stmt.debtId), eq(debts.userId, uid))),
      );
    }

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
