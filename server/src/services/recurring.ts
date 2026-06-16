import { and, asc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { db } from '../db/connection.js';
import {
  recurringRules,
  recurringRuleTags,
  transactions,
  transactionTags,
  debts,
  accounts,
  type RecurringRule,
} from '../db/schema.js';
import { balanceStatements } from '../utils/balance.js';
import { safeCompensate } from '../utils/safeCompensate.js';
import { computeOccurrences, parseYmd, ymd, type Frequency } from '../utils/recurrence.js';

/** Hora fija para las transacciones generadas por el worker (mediodía local). */
const GENERATED_TIME = '12:00:00';

/** Primera fecha con día-del-mes === `day` que sea >= `from` (próximo pago de tarjeta). */
function nextDateOnDay(day: number, from: Date): Date {
  const candidate = new Date(from.getFullYear(), from.getMonth(), day);
  if (from.getDate() > day) candidate.setMonth(candidate.getMonth() + 1);
  return candidate;
}

/**
 * Materializa los cargos pendientes de UNA regla. Idempotente vía
 * `last_generated_date`: solo genera ocurrencias en `(last_generated_date, hoy]`.
 *
 * El insert de cada transacción, el ajuste de saldo y el avance del cursor van en
 * UN `db.batch` atómico (rollback automático): re-ejecutar no duplica porque el
 * cursor ya habrá avanzado. Los pasos que dependen del id recién generado (tags y
 * deuda automática de tarjeta) van post-batch con compensación (patrón saga del
 * repo, ya que neon-http no tiene transacción interactiva).
 *
 * Devuelve cuántas transacciones generó.
 */
async function materializeRule(uid: number, rule: RecurringRule, today: string): Promise<number> {
  const occ = computeOccurrences(
    {
      frequency: rule.frequency as Frequency,
      dayOfMonth: rule.dayOfMonth,
      dayOfWeek: rule.dayOfWeek,
      startDate: rule.startDate,
      endDate: rule.endDate,
    },
    rule.lastGeneratedDate,
    today,
  );
  if (occ.length === 0) return 0;

  // Cuenta de la regla. Si fue borrada o está DESACTIVADA, no generamos cargos y
  // NO avanzamos el cursor (se materializarán cuando se reactive). Congelar tarjeta
  // (is_frozen) se contempla en la Fase 5; aquí basta con is_active.
  const [acc] = await db
    .select({
      id: accounts.id,
      type: accounts.type,
      name: accounts.name,
      color: accounts.color,
      currentBalance: accounts.currentBalance,
      paymentDueDay: accounts.paymentDueDay,
      isActive: accounts.isActive,
      isFrozen: accounts.isFrozen,
    })
    .from(accounts)
    .where(and(eq(accounts.id, rule.accountId), eq(accounts.userId, uid)));
  if (!acc || !acc.isActive) return 0;

  // Coherencia con C1: una regla 'income' sobre una cuenta que LUEGO se convirtió en
  // tarjeta de crédito (el tipo de cuenta es editable) no debe materializarse: sumaría
  // crédito disponible de forma incorrecta. Se salta sin avanzar el cursor (se retomará
  // si la cuenta deja de ser tarjeta).
  if (rule.type === 'income' && acc.type === 'credit_card') return 0;

  const amountStr = Number(rule.amount).toFixed(2);
  // Monto por fila ya con 2 decimales: el delta de saldo agregado es exactamente la
  // suma de las filas insertadas (evita drift de centavos en backfills largos).
  const perRow = Number(amountStr);
  const isCardExpense = rule.type === 'expense' && acc.type === 'credit_card';

  // Tarjeta congelada: no se generan gastos nuevos (igual que POST /api/transactions).
  // Se salta sin avanzar el cursor: los cargos se materializarán al descongelarla.
  if (isCardExpense && acc.isFrozen) return 0;

  if (rule.type === 'expense' && acc.type !== 'credit_card') {
    const needed = perRow * occ.length;
    if (Number(acc.currentBalance) < needed) return 0;
  }

  // Etiquetas de la regla (se copian a cada transacción generada).
  const tagRows = await db
    .select({ tagId: recurringRuleTags.tagId })
    .from(recurringRuleTags)
    .where(eq(recurringRuleTags.ruleId, rule.id));
  const tagIds = tagRows.map((r) => r.tagId);

  // ── Batch principal (atómico) ──
  // inserts (con returning) + UN ajuste de saldo agregado (n × monto, misma cuenta)
  // + avance del cursor a la última ocurrencia.
  const lastOcc = occ[occ.length - 1];
  const insertStmts = occ.map((date) =>
    db
      .insert(transactions)
      .values({
        userId: uid,
        type: rule.type,
        amount: amountStr,
        description: rule.description ?? null,
        date,
        time: GENERATED_TIME,
        accountId: rule.accountId,
        categoryId: rule.categoryId ?? null,
        recurringRuleId: rule.id,
      })
      .returning({ id: transactions.id }),
  );
  const balanceApply = balanceStatements(uid, rule.type, perRow * occ.length, rule.accountId, null, 1);
  const cursorUpdate = db
    .update(recurringRules)
    .set({ lastGeneratedDate: lastOcc, updatedAt: new Date() })
    .where(and(eq(recurringRules.id, rule.id), eq(recurringRules.userId, uid)));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results = await db.batch([...insertStmts, ...balanceApply, cursorUpdate] as any);
  const createdIds = occ.map((_, i) => (results[i] as { id: number }[])[0].id);

  // ── Post-batch (saga) ──
  const createdDebtIds: number[] = [];
  try {
    if (tagIds.length > 0) {
      const values = createdIds.flatMap((txId) => tagIds.map((tagId) => ({ transactionId: txId, tagId })));
      await db.insert(transactionTags).values(values);
    }
    // Gasto recurrente con tarjeta de crédito: igual que una compra manual, genera
    // una deuda automática por cada cargo (el saldo/crédito disponible ya bajó en el
    // batch). NO se valida el cupo: un cargo recurrente (p. ej. cuota de manejo) se
    // cobra aunque supere el límite (la utilización quedará >100%).
    if (isCardExpense) {
      // En DOS batches (no 2×N round-trips secuenciales): primero inserta todas las
      // deudas, luego enlaza cada transacción a su deuda. Acota el peor caso de un
      // backfill largo sobre tarjeta de crédito.
      const debtInserts = occ.map((date) =>
        db
          .insert(debts)
          .values({
            userId: uid,
            name: rule.description?.trim() || `Cargo recurrente ${acc.name}`,
            type: 'debt',
            totalAmount: amountStr,
            remainingAmount: amountStr,
            startDate: date,
            dueDate: ymd(nextDateOnDay(acc.paymentDueDay ?? 20, parseYmd(date))),
            accountId: acc.id,
            icon: 'credit-card',
            color: acc.color,
          })
          .returning({ id: debts.id }),
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const debtResults = await db.batch(debtInserts as any);
      const debtIds = debtResults.map((r) => (r as { id: number }[])[0].id);
      createdDebtIds.push(...debtIds);
      const linkStmts = createdIds.map((txId, i) =>
        db
          .update(transactions)
          .set({ debtId: debtIds[i] })
          .where(and(eq(transactions.id, txId), eq(transactions.userId, uid))),
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.batch(linkStmts as any);
    }
    return occ.length;
  } catch (err) {
    // Compensación: revertir saldo, restaurar el cursor, borrar las tx (CASCADE de
    // transaction_tags) y luego las deudas. Las tx se borran ANTES que las deudas
    // para no violar el FK transactions.debt_id.
    const undo: unknown[] = [
      ...balanceStatements(uid, rule.type, perRow * occ.length, rule.accountId, null, -1),
      db
        .update(recurringRules)
        .set({ lastGeneratedDate: rule.lastGeneratedDate, updatedAt: new Date() })
        .where(and(eq(recurringRules.id, rule.id), eq(recurringRules.userId, uid))),
      ...createdIds.map((id) => db.delete(transactions).where(eq(transactions.id, id))),
      ...createdDebtIds.map((id) => db.delete(debts).where(eq(debts.id, id))),
    ];
    await safeCompensate(undo, {
      endpoint: 'materializeRecurringCharges',
      operation: 'materialize-rule',
      userId: uid,
      entityId: rule.id,
    });
    throw err;
  }
}

/**
 * Lock por usuario EN PROCESO. El cursor `last_generated_date` garantiza
 * idempotencia entre llamadas SECUENCIALES, pero no entre CONCURRENTES sobre la
 * misma regla (dos corridas leerían el mismo cursor y ambas insertarían las mismas
 * ocurrencias). El cron horario y el catch-up del mobile corren en el MISMO proceso
 * Express (la app ya asume un único proceso, igual que la caché en memoria), así que
 * un lock en proceso por usuario los serializa: si ya hay una materialización en
 * curso para el usuario, la segunda llamada no hace nada (devuelve 0).
 */
const inFlight = new Set<number>();

/**
 * Materializa TODOS los cargos recurrentes pendientes de un usuario. Idempotente:
 * llamarla N veces produce el mismo resultado (el cursor por regla evita duplicar y
 * el lock en proceso evita duplicación por concurrencia). Devuelve el total generado.
 */
export async function materializeRecurringCharges(uid: number): Promise<number> {
  if (inFlight.has(uid)) return 0;
  inFlight.add(uid);
  try {
    return await materializeUser(uid);
  } finally {
    inFlight.delete(uid);
  }
}

async function materializeUser(uid: number): Promise<number> {
  const today = ymd(new Date());
  const rules = await db
    .select()
    .from(recurringRules)
    .where(
      and(
        eq(recurringRules.userId, uid),
        eq(recurringRules.isActive, true),
        lte(recurringRules.startDate, today),
        or(isNull(recurringRules.endDate), gte(recurringRules.endDate, today)),
      ),
    )
    .orderBy(asc(recurringRules.id));

  let total = 0;
  for (const rule of rules) {
    total += await materializeRule(uid, rule, today);
  }
  return total;
}

/**
 * Ids de usuarios con al menos una regla recurrente activa (para el cron, que
 * recorre todos los usuarios).
 */
export async function usersWithActiveRules(): Promise<number[]> {
  const rows = await db
    .selectDistinct({ userId: recurringRules.userId })
    .from(recurringRules)
    .where(eq(recurringRules.isActive, true));
  return rows.map((r) => r.userId);
}
