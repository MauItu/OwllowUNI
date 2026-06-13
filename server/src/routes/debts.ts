import { Router } from 'express';
import { and, eq, desc, asc, sql, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/connection.js';
import {
  debts,
  debtPayments,
  accounts,
  transactions,
  type Debt,
  type Transaction,
} from '../db/schema.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { userId } from '../middleware/auth.js';
import { safeCompensate } from '../utils/safeCompensate.js';

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

/** Verifica que una cuenta pertenezca al usuario (404 si no). */
async function assertAccountOwned(uid: number, accountId: number): Promise<void> {
  const [acc] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, uid)));
  if (!acc) throw new ApiError(404, 'Cuenta no encontrada');
}

const debtSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['debt', 'loan']),
  totalAmount: z.coerce.number().positive(),
  interestRate: z.coerce.number().min(0).max(999.99).optional().nullable(),
  creditorDebtor: z.string().max(100).optional().nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z
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
        color: debts.color,
        icon: debts.icon,
        isPaidOff: debts.isPaidOff,
        paidOffAt: debts.paidOffAt,
        notes: debts.notes,
        accountId: debts.accountId,
        createdAt: debts.createdAt,
        updatedAt: debts.updatedAt,
        accountName: accounts.name,
      })
      .from(debts)
      .leftJoin(accounts, eq(debts.accountId, accounts.id))
      .where(eq(debts.userId, userId(req)))
      .orderBy(asc(debts.isPaidOff), desc(debts.createdAt));
    res.json(rows);
  }),
);

// GET /api/debts/summary — total deudas, total préstamos, balance neto
debtsRouter.get(
  '/summary',
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
    const id = Number(req.params.id);
    const [debt] = await db
      .select()
      .from(debts)
      .where(and(eq(debts.id, id), eq(debts.userId, userId(req))));
    if (!debt) throw new ApiError(404, 'Deuda no encontrada');

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
        accountName: accounts.name,
      })
      .from(debtPayments)
      .leftJoin(accounts, eq(debtPayments.accountId, accounts.id))
      .where(eq(debtPayments.debtId, id))
      .orderBy(desc(debtPayments.date), desc(debtPayments.id));

    res.json({ ...debt, payments });
  }),
);

// POST /api/debts
debtsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const data = debtSchema.parse(req.body);
    if (data.accountId != null) await assertAccountOwned(uid, data.accountId);
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
        ...(data.color && { color: data.color }),
        ...(data.icon && { icon: data.icon }),
        notes: data.notes ?? null,
        accountId: data.accountId ?? null,
      })
      .returning();

    // Desembolso inicial opcional: el dinero que entra (pedí prestado) o sale (yo presté).
    if (data.registerInitialTransaction && data.accountId) {
      const txType = data.type === 'debt' ? 'income' : 'expense';
      const delta = txType === 'income' ? data.totalAmount : -data.totalAmount;
      const insertTx = db
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
        });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.batch([insertTx, balanceUpdate(uid, data.accountId, delta)] as any);
    }

    res.status(201).json(row);
  }),
);

// PUT /api/debts/:id
debtsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const data = debtSchema.partial().parse(req.body);

    const [old] = await db
      .select()
      .from(debts)
      .where(and(eq(debts.id, id), eq(debts.userId, userId(req))));
    if (!old) throw new ApiError(404, 'Deuda no encontrada');

    // Si cambia el total, ajustar el restante manteniendo lo ya pagado
    let remaining = Number(old.remainingAmount);
    if (data.totalAmount != null) {
      const paid = Number(old.totalAmount) - Number(old.remainingAmount);
      remaining = Math.max(0, data.totalAmount - paid);
    }
    const paidOff = remaining <= 0;

    const [row] = await db
      .update(debts)
      .set({
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
        ...(data.color !== undefined && { color: data.color }),
        ...(data.icon !== undefined && { icon: data.icon }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.accountId !== undefined && { accountId: data.accountId }),
        ...(data.totalAmount !== undefined && {
          isPaidOff: paidOff,
          paidOffAt: paidOff ? old.paidOffAt ?? new Date() : null,
        }),
        updatedAt: new Date(),
      })
      .where(and(eq(debts.id, id), eq(debts.userId, userId(req))))
      .returning();
    res.json(row);
  }),
);

// DELETE /api/debts/:id — cascade en pagos + revierte las transacciones vinculadas
debtsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const id = Number(req.params.id);
    const [debt] = await db
      .select()
      .from(debts)
      .where(and(eq(debts.id, id), eq(debts.userId, uid)));
    if (!debt) throw new ApiError(404, 'Deuda no encontrada');

    // Transacciones generadas por los abonos de esta deuda (las del FK transaction_id).
    const payments = await db.select().from(debtPayments).where(eq(debtPayments.debtId, id));
    const txIds = payments.map((p) => p.transactionId).filter((t): t is number => t != null);
    const txs =
      txIds.length > 0
        ? await db.select().from(transactions).where(inArray(transactions.id, txIds))
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
    const id = Number(req.params.id);
    const data = paymentSchema.parse(req.body);

    const [debt] = await db
      .select()
      .from(debts)
      .where(and(eq(debts.id, id), eq(debts.userId, uid)));
    if (!debt) throw new ApiError(404, 'Deuda no encontrada');
    if (debt.isPaidOff) throw new ApiError(400, 'Esta deuda ya está saldada');
    if (data.accountId != null) await assertAccountOwned(uid, data.accountId);

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const txRes = await db.batch([insertTx, balanceUpdate(uid, data.accountId, delta)] as any);
      transactionId = (txRes[0] as Transaction[])[0].id;
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
