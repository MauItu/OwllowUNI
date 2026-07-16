import { Router } from 'express';
import { and, eq, desc, asc, sql, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/connection.js';
import {
  debts,
  debtPayments,
  accounts,
  transactions,
  type Transaction,
} from '../db/schema.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { parseId } from '../utils/parseId.js';
import { userId } from '../middleware/auth.js';
import { safeCompensate } from '../utils/safeCompensate.js';
import { assertDebitSufficient } from '../utils/balance.js';
import { getOwnedAccount } from '../utils/ownership.js';
import { cacheResponse, SUMMARY_TTL_MS } from '../services/cache.js';
import { frenchInstallment, computeDueInfo } from '../utils/installments.js';
import { accountDisplayName } from '../utils/accountDisplay.js';

export const debtsRouter = Router();

/** Hora actual HH:mm:ss para las transacciones generadas automáticamente. */
function nowTime(): string {
  return new Date().toTimeString().slice(0, 8);
}

/**
 * UPDATE de balance relativo para una cuenta.
 * delta positivo suma, negativo resta (ya con el signo aplicado).
 */
function balanceUpdate(uid: number, accountId: number, delta: number) {
  return db
    .update(accounts)
    .set({
      currentBalance: sql`${accounts.currentBalance} + ${delta.toFixed(2)}::numeric`,
      updatedAt: new Date(),
    })
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, uid)));
}

/**
 * Si la deuda está asociada a una tarjeta de crédito (deuda automática de una
 * compra), devuelve el id de esa tarjeta; null en cualquier otro caso. Abonar a
 * estas deudas restaura el crédito disponible de la tarjeta (`current_balance`).
 */
async function creditCardOfDebt(uid: number, debtAccountId: number | null): Promise<number | null> {
  if (debtAccountId == null) return null;
  const [acc] = await db
    .select({ id: accounts.id, type: accounts.type })
    .from(accounts)
    .where(and(eq(accounts.id, debtAccountId), eq(accounts.userId, uid)));
  return acc?.type === 'credit_card' ? acc.id : null;
}

/** Deuda + historial de pagos (cap 200) + derivados de vencimiento. null si no existe. */
async function loadDebtDetail(uid: number, id: number) {
  const [debt] = await db
    .select()
    .from(debts)
    .where(and(eq(debts.id, id), eq(debts.userId, uid)));
  if (!debt) return null;

  const payments = await db
    .select({
      id: debtPayments.id,
      debtId: debtPayments.debtId,
      amount: debtPayments.amount,
      date: debtPayments.date,
      description: debtPayments.description,
      accountId: debtPayments.accountId,
      transactionId: debtPayments.transactionId,
      createdAt: debtPayments.createdAt,
      accountName: accountDisplayName(accounts.name, accounts.isActive),
    })
    .from(debtPayments)
    .leftJoin(accounts, eq(debtPayments.accountId, accounts.id))
    .where(eq(debtPayments.debtId, id))
    .orderBy(desc(debtPayments.date), desc(debtPayments.id))
    // Cap defensivo del peor caso (sin cambiar contrato): los más recientes.
    // TODO: paginar con load-more en mobile
    .limit(200);

  const due = computeDueInfo({
    remaining: Number(debt.remainingAmount),
    installmentAmount: debt.installmentAmount != null ? Number(debt.installmentAmount) : null,
    lateRatePct: debt.lateInterestRate != null ? Number(debt.lateInterestRate) : null,
    dueDate: debt.dueDate,
    isPaidOff: debt.isPaidOff,
  });

  return { ...debt, payments, ...due };
}

/**
 * Columnas de cuotas derivadas para insert/update de `debts`. Sin `installments`
 * válidos (>=2), todas quedan null (deuda de un solo pago). `installmentAmount` se
 * calcula por amortización francesa con la tasa mensual del crédito.
 */
function installmentColumns(
  total: number,
  installments: number | null | undefined,
  monthlyRate: number | null | undefined,
  lateRate: number | null | undefined,
) {
  if (!installments || installments < 2) {
    return {
      installments: null,
      installmentAmount: null,
      monthlyInterestRate: null,
      lateInterestRate: null,
    };
  }
  return {
    installments,
    installmentAmount: frenchInstallment(total, monthlyRate ?? 0, installments).toFixed(2),
    monthlyInterestRate: monthlyRate != null ? monthlyRate.toFixed(2) : null,
    lateInterestRate: lateRate != null ? lateRate.toFixed(2) : null,
  };
}

const debtSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['debt', 'loan']),
  totalAmount: z.coerce.number().positive(),
  interestRate: z.coerce.number().min(0).max(999.99).optional().nullable(),
  // ── Cuotas a crédito (opcional). El backend deriva installmentAmount ──
  installments: z.coerce.number().int().min(2).max(60).optional().nullable(),
  monthlyInterestRate: z.coerce.number().min(0).max(999.99).optional().nullable(),
  lateInterestRate: z.coerce.number().min(0).max(999.99).optional().nullable(),
  creditorDebtor: z.string().max(100).optional().nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  // Fecha de corte (statement). Informativa, opcional.
  cutoffDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  icon: z.string().max(50).optional(),
  notes: z.string().optional().nullable(),
  accountId: z.number().int().optional().nullable(),
  // Si es true y hay accountId, registra el desembolso inicial como transacción:
  // type='debt' (pedí prestado → me depositaron) = income; type='loan' (yo presté) = expense.
  registerInitialTransaction: z.boolean().optional(),
});

const paymentSchema = z.object({
  amount: z.coerce.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().max(255).optional().nullable(),
  // Cuenta a la que entra (loan) o de la que sale (debt) el dinero del abono.
  accountId: z.number().int().optional().nullable(),
});

// GET /api/debts — activas primero, luego saldadas
debtsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await db
      .select({
        id: debts.id,
        name: debts.name,
        type: debts.type,
        totalAmount: debts.totalAmount,
        remainingAmount: debts.remainingAmount,
        interestRate: debts.interestRate,
        creditorDebtor: debts.creditorDebtor,
        startDate: debts.startDate,
        dueDate: debts.dueDate,
        cutoffDate: debts.cutoffDate,
        installments: debts.installments,
        installmentAmount: debts.installmentAmount,
        monthlyInterestRate: debts.monthlyInterestRate,
        lateInterestRate: debts.lateInterestRate,
        color: debts.color,
        icon: debts.icon,
        isPaidOff: debts.isPaidOff,
        paidOffAt: debts.paidOffAt,
        notes: debts.notes,
        accountId: debts.accountId,
        createdAt: debts.createdAt,
        updatedAt: debts.updatedAt,
        accountName: accountDisplayName(accounts.name, accounts.isActive),
        accountType: accounts.type,
      })
      .from(debts)
      .leftJoin(accounts, eq(debts.accountId, accounts.id))
      .where(eq(debts.userId, userId(req)))
      .orderBy(asc(debts.isPaidOff), desc(debts.createdAt))
      // TODO: paginar con load-more en mobile
      .limit(200);
    // Campos derivados de vencimiento/próximo pago (cuota + mora si aplica).
    res.json(
      rows.map((d) => ({
        ...d,
        ...computeDueInfo({
          remaining: Number(d.remainingAmount),
          installmentAmount: d.installmentAmount != null ? Number(d.installmentAmount) : null,
          lateRatePct: d.lateInterestRate != null ? Number(d.lateInterestRate) : null,
          dueDate: d.dueDate,
          isPaidOff: d.isPaidOff,
        }),
      })),
    );
  }),
);

// GET /api/debts/summary — total deudas, total préstamos, balance neto
debtsRouter.get(
  '/summary',
  cacheResponse(SUMMARY_TTL_MS),
  asyncHandler(async (req, res) => {
    const [row] = await db
      .select({
        totalDebt: sql<string>`COALESCE(SUM(CASE WHEN ${debts.type} = 'debt' AND ${debts.isPaidOff} = false THEN ${debts.remainingAmount} ELSE 0 END), 0)`,
        totalLoan: sql<string>`COALESCE(SUM(CASE WHEN ${debts.type} = 'loan' AND ${debts.isPaidOff} = false THEN ${debts.remainingAmount} ELSE 0 END), 0)`,
        activeDebts: sql<string>`COUNT(CASE WHEN ${debts.type} = 'debt' AND ${debts.isPaidOff} = false THEN 1 END)`,
        activeLoans: sql<string>`COUNT(CASE WHEN ${debts.type} = 'loan' AND ${debts.isPaidOff} = false THEN 1 END)`,
      })
      .from(debts)
      .where(eq(debts.userId, userId(req)));

    const totalDebt = Number(row.totalDebt);
    const totalLoan = Number(row.totalLoan);
    res.json({
      totalDebt,
      totalLoan,
      netBalance: totalLoan - totalDebt,
      activeDebts: Number(row.activeDebts),
      activeLoans: Number(row.activeLoans),
    });
  }),
);

// GET /api/debts/:id — deuda con su historial de pagos
debtsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const detail = await loadDebtDetail(userId(req), id);
    if (!detail) throw new ApiError(404, 'Deuda no encontrada');
    res.json(detail);
  }),
);

// POST /api/debts
debtsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const data = debtSchema.parse(req.body);
    let accountInfo: { type: string; currentBalance: string } | null = null;
    if (data.accountId != null) accountInfo = await getOwnedAccount(uid, data.accountId);
    const accountType = accountInfo?.type ?? null;
    if (data.registerInitialTransaction && data.type === 'loan' && accountInfo && accountType !== 'credit_card') {
      assertDebitSufficient(accountInfo, data.totalAmount);
    }
    const [row] = await db
      .insert(debts)
      .values({
        userId: uid,
        name: data.name,
        type: data.type,
        totalAmount: data.totalAmount.toFixed(2),
        remainingAmount: data.totalAmount.toFixed(2),
        interestRate: data.interestRate != null ? data.interestRate.toFixed(2) : null,
        creditorDebtor: data.creditorDebtor ?? null,
        startDate: data.startDate,
        dueDate: data.dueDate ?? null,
        cutoffDate: data.cutoffDate ?? null,
        ...installmentColumns(
          data.totalAmount,
          data.installments,
          data.monthlyInterestRate,
          data.lateInterestRate,
        ),
        ...(data.color && { color: data.color }),
        ...(data.icon && { icon: data.icon }),
        notes: data.notes ?? null,
        accountId: data.accountId ?? null,
      })
      .returning();

    // Desembolso inicial opcional (solo deuda NORMAL, no tarjeta de crédito): el
    // dinero que entra (pedí prestado → income) o sale (yo presté → expense). Se
    // crea como transacción REAL y se enlaza a la deuda (`initialTransactionId`)
    // para poder revertir el saldo al eliminar la deuda.
    if (data.registerInitialTransaction && data.accountId && accountType !== 'credit_card') {
      const txType = data.type === 'debt' ? 'income' : 'expense';
      const delta = txType === 'income' ? data.totalAmount : -data.totalAmount;
      // La deuda ya está persistida; la tx necesita su id para enlazarse → saga.
      const [tx] = await db
        .insert(transactions)
        .values({
          userId: uid,
          type: txType,
          amount: data.totalAmount.toFixed(2),
          description:
            data.type === 'debt' ? `Préstamo recibido: ${data.name}` : `Préstamo otorgado: ${data.name}`,
          date: data.startDate,
          time: nowTime(),
          accountId: data.accountId,
        })
        .returning({ id: transactions.id });
      try {
        await db.batch([
          balanceUpdate(uid, data.accountId, delta),
          db
            .update(debts)
            .set({ initialTransactionId: tx.id, updatedAt: new Date() })
            .where(and(eq(debts.id, row.id), eq(debts.userId, uid))),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ] as any);
        row.initialTransactionId = tx.id;
      } catch (err) {
        await safeCompensate([db.delete(transactions).where(eq(transactions.id, tx.id))], {
          endpoint: 'POST /api/debts',
          operation: 'initial-disbursement',
          userId: uid,
          entityId: row.id,
          txId: tx.id,
        });
        throw err;
      }
    }

    res.status(201).json(row);
  }),
);

// PUT /api/debts/:id
debtsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const uid = userId(req);
    const data = debtSchema.partial().parse(req.body);

    const [old] = await db
      .select()
      .from(debts)
      .where(and(eq(debts.id, id), eq(debts.userId, uid)));
    if (!old) throw new ApiError(404, 'Deuda no encontrada');

    // Si cambia el total, ajustar el restante manteniendo lo ya pagado
    let remaining = Number(old.remainingAmount);
    if (data.totalAmount != null) {
      const paid = Number(old.totalAmount) - Number(old.remainingAmount);
      remaining = Math.max(0, data.totalAmount - paid);
    }
    const paidOff = remaining <= 0;

    // Recalcula las columnas de cuotas con los valores efectivos (lo que envía el
    // cliente o, si no, lo que ya tenía la deuda). `undefined` = no tocado; `null` = limpiar.
    const effTotal = data.totalAmount != null ? data.totalAmount : Number(old.totalAmount);
    const effInstallments = data.installments !== undefined ? data.installments : old.installments;
    const effMonthly =
      data.monthlyInterestRate !== undefined
        ? data.monthlyInterestRate
        : old.monthlyInterestRate != null
          ? Number(old.monthlyInterestRate)
          : null;
    const effLate =
      data.lateInterestRate !== undefined
        ? data.lateInterestRate
        : old.lateInterestRate != null
          ? Number(old.lateInterestRate)
          : null;

    // Campos del UPDATE de la deuda (el `initial_transaction_id` se decide abajo
    // según el switch del desembolso).
    const debtSet = {
      ...installmentColumns(effTotal, effInstallments, effMonthly, effLate),
      ...(data.name !== undefined && { name: data.name }),
      ...(data.type !== undefined && { type: data.type }),
      ...(data.totalAmount !== undefined && {
        totalAmount: data.totalAmount.toFixed(2),
        remainingAmount: remaining.toFixed(2),
      }),
      ...(data.interestRate !== undefined && {
        interestRate: data.interestRate != null ? data.interestRate.toFixed(2) : null,
      }),
      ...(data.creditorDebtor !== undefined && { creditorDebtor: data.creditorDebtor }),
      ...(data.startDate !== undefined && { startDate: data.startDate }),
      ...(data.dueDate !== undefined && { dueDate: data.dueDate }),
      ...(data.cutoffDate !== undefined && { cutoffDate: data.cutoffDate }),
      ...(data.color !== undefined && { color: data.color }),
      ...(data.icon !== undefined && { icon: data.icon }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.accountId !== undefined && { accountId: data.accountId }),
      ...(data.totalAmount !== undefined && {
        isPaidOff: paidOff,
        paidOffAt: paidOff ? old.paidOffAt ?? new Date() : null,
      }),
      updatedAt: new Date(),
    };
    const debtWhere = and(eq(debts.id, id), eq(debts.userId, uid));

    // ── Desembolso inicial EDITABLE (switch del mobile, C8) ──────────────
    // Solo deuda NORMAL (no tarjeta). Permite prender/apagar el registro del
    // movimiento en la cuenta también al editar, y mantenerlo en sincronía con
    // el monto/cuenta efectivos.
    const effType = (data.type ?? old.type) as 'debt' | 'loan';
    const effName = data.name !== undefined ? data.name : old.name;
    const effStartDate = data.startDate !== undefined ? data.startDate : old.startDate;
    const effAccountId = data.accountId !== undefined ? data.accountId : old.accountId;

    // Transacción del desembolso anterior (si la había).
    let oldTx: { id: number; type: string; amount: string; accountId: number | null } | null = null;
    if (old.initialTransactionId != null) {
      const [t] = await db
        .select({
          id: transactions.id,
          type: transactions.type,
          amount: transactions.amount,
          accountId: transactions.accountId,
        })
        .from(transactions)
        .where(and(eq(transactions.id, old.initialTransactionId), eq(transactions.userId, uid)));
      oldTx = t ?? null;
    }

    // Si el cliente manda el flag, manda; si no, se conserva el estado actual.
    const wantRegister =
      data.registerInitialTransaction !== undefined
        ? data.registerInitialTransaction
        : oldTx != null;

    // Tipo de la cuenta efectiva (las tarjetas de crédito no llevan desembolso).
    let effAccountInfo: { type: string; currentBalance: string } | null = null;
    if (effAccountId != null) effAccountInfo = await getOwnedAccount(uid, effAccountId);
    const effAccountType = effAccountInfo?.type ?? null;
    const canRegister = wantRegister && effAccountId != null && effAccountType !== 'credit_card';

    const txType = effType === 'debt' ? 'income' : 'expense';
    const disbursementDesc =
      effType === 'debt' ? `Préstamo recibido: ${effName}` : `Préstamo otorgado: ${effName}`;
    // UPDATE de saldo que revierte el efecto de la tx vieja (income suma → restar).
    const revertOldTx = oldTx
      ? balanceUpdate(
          uid,
          oldTx.accountId!,
          oldTx.type === 'income' ? -Number(oldTx.amount) : Number(oldTx.amount),
        )
      : null;

    if (canRegister && txType === 'expense' && effAccountInfo) {
      let available = Number(effAccountInfo.currentBalance);
      if (oldTx && oldTx.accountId === effAccountId) {
        available += oldTx.type === 'income' ? -Number(oldTx.amount) : Number(oldTx.amount);
      }
      assertDebitSufficient({ ...effAccountInfo, currentBalance: available }, effTotal);
    }

    let row: typeof old | undefined;
    if (canRegister && oldTx == null) {
      // (A) No había desembolso y ahora sí: crear la tx, ajustar saldo y enlazar (saga).
      const delta = txType === 'income' ? effTotal : -effTotal;
      const [tx] = await db
        .insert(transactions)
        .values({
          userId: uid,
          type: txType,
          amount: effTotal.toFixed(2),
          description: disbursementDesc,
          date: effStartDate,
          time: nowTime(),
          accountId: effAccountId!,
        })
        .returning({ id: transactions.id });
      try {
        const r = await db.batch([
          db.update(debts).set({ ...debtSet, initialTransactionId: tx.id }).where(debtWhere).returning(),
          balanceUpdate(uid, effAccountId!, delta),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ] as any);
        row = (r[0] as (typeof old)[])[0];
      } catch (err) {
        await safeCompensate([db.delete(transactions).where(eq(transactions.id, tx.id))], {
          endpoint: 'PUT /api/debts/:id',
          operation: 'edit-add-disbursement',
          userId: uid,
          entityId: id,
          txId: tx.id,
        });
        throw err;
      }
    } else if (!canRegister && oldTx != null) {
      // (B) Había desembolso y ahora no (switch off / sin cuenta / tarjeta):
      // revertir el saldo, desenlazar y borrar la tx (atómico).
      const r = await db.batch([
        db.update(debts).set({ ...debtSet, initialTransactionId: null }).where(debtWhere).returning(),
        revertOldTx!,
        db.delete(transactions).where(and(eq(transactions.id, oldTx.id), eq(transactions.userId, uid))),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any);
      row = (r[0] as (typeof old)[])[0];
    } else if (canRegister && oldTx != null) {
      // (C) Sigue registrado: reconciliar la tx (monto/cuenta/tipo/fecha) y el saldo.
      const newDelta = txType === 'income' ? effTotal : -effTotal;
      const r = await db.batch([
        db.update(debts).set({ ...debtSet, initialTransactionId: oldTx.id }).where(debtWhere).returning(),
        revertOldTx!,
        balanceUpdate(uid, effAccountId!, newDelta),
        db
          .update(transactions)
          .set({
            type: txType,
            amount: effTotal.toFixed(2),
            description: disbursementDesc,
            date: effStartDate,
            accountId: effAccountId!,
            updatedAt: new Date(),
          })
          .where(and(eq(transactions.id, oldTx.id), eq(transactions.userId, uid))),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any);
      row = (r[0] as (typeof old)[])[0];
    } else {
      // (D) Sin desembolso involucrado.
      const [r] = await db.update(debts).set(debtSet).where(debtWhere).returning();
      row = r;
    }

    res.json(row);
  }),
);

// DELETE /api/debts/:id — cascade en pagos + revierte las transacciones vinculadas
debtsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const id = parseId(req.params.id);
    const [debt] = await db
      .select()
      .from(debts)
      .where(and(eq(debts.id, id), eq(debts.userId, uid)));
    if (!debt) throw new ApiError(404, 'Deuda no encontrada');

    // Transacciones a revertir: las de los abonos (FK transaction_id) + el
    // desembolso inicial (deuda normal con cuenta), si lo hubo.
    const payments = await db.select().from(debtPayments).where(eq(debtPayments.debtId, id));
    const txIds = payments.map((p) => p.transactionId).filter((t): t is number => t != null);
    if (debt.initialTransactionId != null) txIds.push(debt.initialTransactionId);
    const txs =
      txIds.length > 0
        ? await db
            .select({
              id: transactions.id,
              type: transactions.type,
              amount: transactions.amount,
              accountId: transactions.accountId,
              toAccountId: transactions.toAccountId,
              toAmount: transactions.toAmount,
            })
            .from(transactions)
            .where(inArray(transactions.id, txIds))
        : [];

    const stmts: unknown[] = [];
    // Revertir el balance de cada transacción vinculada (income suma → restar; expense resta → sumar).
    for (const tx of txs) {
      const revert = tx.type === 'income' ? -Number(tx.amount) : Number(tx.amount);
      stmts.push(balanceUpdate(uid, tx.accountId, revert));
    }
    // Borrar la deuda primero (CASCADE borra debt_payments, que referencian las transacciones)…
    stmts.push(db.delete(debts).where(and(eq(debts.id, id), eq(debts.userId, uid))));
    // …y recién entonces las transacciones, ya sin referencias.
    if (txIds.length > 0) {
      stmts.push(db.delete(transactions).where(inArray(transactions.id, txIds)));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.batch(stmts as any);
    res.json({ success: true });
  }),
);

// POST /api/debts/:id/pay — registra un pago y descuenta del restante
debtsRouter.post(
  '/:id/pay',
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const id = parseId(req.params.id);
    const data = paymentSchema.parse(req.body);

    const [debt] = await db
      .select()
      .from(debts)
      .where(and(eq(debts.id, id), eq(debts.userId, uid)));
    if (!debt) throw new ApiError(404, 'Deuda no encontrada');
    if (debt.isPaidOff) throw new ApiError(400, 'Esta deuda ya está saldada');
    if (data.accountId != null) {
      const payAcc = await getOwnedAccount(uid, data.accountId);
      if (payAcc.type === 'credit_card') {
        throw new ApiError(400, 'No puedes pagar una deuda con una tarjeta de crédito');
      }
      if (debt.type === 'debt') {
        assertDebitSufficient(payAcc, data.amount);
      }
    }

    // Si la deuda es de una tarjeta de crédito (deuda automática de una compra),
    // abonarla libera/restaura el crédito disponible de esa tarjeta.
    const cardAccountId = await creditCardOfDebt(uid, debt.accountId);

    // Decremento CONDICIONAL del restante (elimina el TOCTOU: dos pagos concurrentes
    // que leyeran el mismo `remaining` pasarían ambos una validación en memoria y
    // sobre-pagarían). El guard `remaining_amount >= amount` va en el WHERE y es
    // atómico; si afecta 0 filas, otro pago se adelantó o el monto excede → 400.
    const amountStr = data.amount.toFixed(2);
    const [updated] = await db
      .update(debts)
      .set({
        remainingAmount: sql`${debts.remainingAmount} - ${amountStr}::numeric`,
        isPaidOff: sql`${debts.remainingAmount} - ${amountStr}::numeric <= 0`,
        paidOffAt: sql`CASE WHEN ${debts.remainingAmount} - ${amountStr}::numeric <= 0 THEN COALESCE(${debts.paidOffAt}, now()) ELSE NULL END`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(debts.id, id),
          eq(debts.userId, uid),
          eq(debts.isPaidOff, false),
          sql`${debts.remainingAmount} >= ${amountStr}::numeric`,
        ),
      )
      .returning();
    if (!updated) throw new ApiError(400, 'El pago supera el monto restante');

    // Si hay cuenta, el abono se registra como movimiento real:
    //  - loan (me deben): me pagan → income en la cuenta.
    //  - debt (yo debo):  yo pago  → expense desde la cuenta.
    let transactionId: number | null = null;
    if (data.accountId) {
      const delta = debt.type === 'loan' ? data.amount : -data.amount;
      const insertTx = db
        .insert(transactions)
        .values({
          userId: uid,
          type: debt.type === 'loan' ? 'income' : 'expense',
          amount: amountStr,
          description: data.description ?? `Abono: ${debt.name}`,
          date: data.date,
          time: nowTime(),
          accountId: data.accountId,
        })
        .returning();
      const stmts: unknown[] = [insertTx, balanceUpdate(uid, data.accountId, delta)];
      // Restaurar el crédito disponible de la tarjeta (en el mismo batch atómico).
      if (cardAccountId != null) stmts.push(balanceUpdate(uid, cardAccountId, data.amount));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const txRes = await db.batch(stmts as any);
      transactionId = (txRes[0] as Transaction[])[0].id;
    } else if (cardAccountId != null) {
      // Abono sin cuenta de pago, pero deuda de tarjeta: igual restaura el crédito.
      await balanceUpdate(uid, cardAccountId, data.amount);
    }

    // Registrar el pago. Si falla (o ya falló la tx), compensar TODO lo aplicado:
    // re-sumar el restante y restaurar los flags del decremento, y revertir la tx.
    try {
      await db.insert(debtPayments).values({
        debtId: id,
        amount: amountStr,
        date: data.date,
        description: data.description ?? null,
        accountId: data.accountId ?? null,
        transactionId,
      });
      res.status(201).json(updated);
    } catch (err) {
      const undo: unknown[] = [
        db
          .update(debts)
          .set({
            remainingAmount: sql`${debts.remainingAmount} + ${amountStr}::numeric`,
            isPaidOff: false,
            paidOffAt: debt.paidOffAt,
            updatedAt: new Date(),
          })
          .where(and(eq(debts.id, id), eq(debts.userId, uid))),
      ];
      if (transactionId != null && data.accountId) {
        undo.push(db.delete(transactions).where(eq(transactions.id, transactionId)));
        undo.push(balanceUpdate(uid, data.accountId, debt.type === 'loan' ? -data.amount : data.amount));
      }
      // Revertir la restauración de crédito de la tarjeta (se aplicó en ambas ramas).
      if (cardAccountId != null) {
        undo.push(balanceUpdate(uid, cardAccountId, -data.amount));
      }
      await safeCompensate(undo, {
        endpoint: 'POST /api/debts/:id/pay',
        operation: 'pay',
        userId: uid,
        entityId: id,
        txId: transactionId ?? undefined,
      });
      throw err;
    }
  }),
);

// PUT /api/debts/:id/payments/:paymentId — edita un abono existente
//
// Revierte por completo el efecto del pago viejo y aplica el nuevo, dejando
// consistentes: el restante de la deuda (recalculado), la transacción enlazada
// (su saldo de cuenta) y, si la deuda es de una tarjeta de crédito, el crédito
// disponible de la tarjeta. Devuelve la deuda con su historial actualizado.
debtsRouter.put(
  '/:id/payments/:paymentId',
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const id = parseId(req.params.id);
    const paymentId = parseId(req.params.paymentId);
    const data = paymentSchema.parse(req.body);

    const [debt] = await db
      .select()
      .from(debts)
      .where(and(eq(debts.id, id), eq(debts.userId, uid)));
    if (!debt) throw new ApiError(404, 'Deuda no encontrada');

    const [payment] = await db
      .select()
      .from(debtPayments)
      .where(and(eq(debtPayments.id, paymentId), eq(debtPayments.debtId, id)));
    if (!payment) throw new ApiError(404, 'Pago no encontrado');

    if (data.accountId != null) {
      const payAcc = await getOwnedAccount(uid, data.accountId);
      if (payAcc.type === 'credit_card') {
        throw new ApiError(400, 'No puedes pagar una deuda con una tarjeta de crédito');
      }
    }

    const cardAccountId = await creditCardOfDebt(uid, debt.accountId);

    const oldAmount = Number(payment.amount);
    const newAmount = data.amount;

    // Nuevo restante = restante actual + monto viejo (revertido) − monto nuevo.
    // No puede quedar negativo (no se puede sobre-pagar la deuda).
    const newRemaining = Number(debt.remainingAmount) + oldAmount - newAmount;
    if (newRemaining < 0) {
      throw new ApiError(400, 'El pago supera el monto restante de la deuda');
    }
    const paidOff = newRemaining <= 0;

    // Efecto de un abono sobre su cuenta: loan (me pagan) = income (+); debt (yo
    // pago) = expense (−).
    const txType = debt.type === 'loan' ? 'income' : 'expense';
    const signedDelta = (amount: number) => (txType === 'income' ? amount : -amount);

    const oldAcc = payment.accountId;
    const oldTxId = payment.transactionId;
    const newAcc = data.accountId ?? null;
    const description = data.description ?? null;
    const txDescription = data.description ?? `Abono: ${debt.name}`;

    const debtUpdate = db
      .update(debts)
      .set({
        remainingAmount: newRemaining.toFixed(2),
        isPaidOff: paidOff,
        paidOffAt: paidOff ? debt.paidOffAt ?? new Date() : null,
        updatedAt: new Date(),
      })
      .where(and(eq(debts.id, id), eq(debts.userId, uid)));

    const cardDelta = newAmount - oldAmount; // crédito a restaurar por la diferencia

    if (oldTxId == null && newAcc != null) {
      // Antes no movía dinero y ahora sí: hay que insertar la transacción para
      // obtener su id y enlazarla (saga de dos pasos con compensación).
      const [tx] = await db
        .insert(transactions)
        .values({
          userId: uid,
          type: txType,
          amount: newAmount.toFixed(2),
          description: txDescription,
          date: data.date,
          time: nowTime(),
          accountId: newAcc,
        })
        .returning({ id: transactions.id });
      try {
        const stmts: unknown[] = [
          debtUpdate,
          balanceUpdate(uid, newAcc, signedDelta(newAmount)),
          db
            .update(debtPayments)
            .set({
              amount: newAmount.toFixed(2),
              date: data.date,
              description,
              accountId: newAcc,
              transactionId: tx.id,
            })
            .where(eq(debtPayments.id, paymentId)),
        ];
        if (cardAccountId != null && cardDelta !== 0) {
          stmts.push(balanceUpdate(uid, cardAccountId, cardDelta));
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await db.batch(stmts as any);
      } catch (err) {
        await safeCompensate([db.delete(transactions).where(eq(transactions.id, tx.id))], {
          endpoint: 'PUT /api/debts/:id/payments/:paymentId',
          operation: 'edit-payment',
          userId: uid,
          entityId: id,
          txId: tx.id,
        });
        throw err;
      }
    } else {
      // Resto de casos: no hace falta un id nuevo → todo en un único batch atómico.
      const stmts: unknown[] = [debtUpdate];

      // Revertir el saldo de la transacción vieja (si la había).
      if (oldTxId != null && oldAcc != null) {
        stmts.push(balanceUpdate(uid, oldAcc, -signedDelta(oldAmount)));
      }

      // Actualizar el registro del pago ANTES de borrar la transacción (desenlaza el
      // FK transaction_id para no violar la restricción al eliminarla).
      stmts.push(
        db
          .update(debtPayments)
          .set({
            amount: newAmount.toFixed(2),
            date: data.date,
            description,
            accountId: newAcc,
            transactionId: newAcc != null ? oldTxId : null,
          })
          .where(eq(debtPayments.id, paymentId)),
      );

      if (oldTxId != null && newAcc != null) {
        // Sigue moviendo dinero: actualizar la transacción en sitio y aplicar el
        // saldo nuevo (la cuenta puede haber cambiado).
        stmts.push(
          db
            .update(transactions)
            .set({
              type: txType,
              amount: newAmount.toFixed(2),
              description: txDescription,
              date: data.date,
              accountId: newAcc,
              updatedAt: new Date(),
            })
            .where(and(eq(transactions.id, oldTxId), eq(transactions.userId, uid))),
        );
        stmts.push(balanceUpdate(uid, newAcc, signedDelta(newAmount)));
      } else if (oldTxId != null && newAcc == null) {
        // Ya no mueve dinero: borrar la transacción (ya desenlazada arriba).
        stmts.push(db.delete(transactions).where(and(eq(transactions.id, oldTxId), eq(transactions.userId, uid))));
      }

      // Ajustar el crédito de la tarjeta por la diferencia de monto del abono.
      if (cardAccountId != null && cardDelta !== 0) {
        stmts.push(balanceUpdate(uid, cardAccountId, cardDelta));
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.batch(stmts as any);
    }

    const detail = await loadDebtDetail(uid, id);
    res.json(detail);
  }),
);
