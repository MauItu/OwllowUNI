import { Router } from 'express';
import { eq, desc, asc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { debts, debtPayments, accounts, type Debt } from '../db/schema.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';

export const debtsRouter = Router();

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
});

const paymentSchema = z.object({
  amount: z.coerce.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().max(255).optional().nullable(),
});

// GET /api/debts — activas primero, luego saldadas
debtsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
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
      .orderBy(asc(debts.isPaidOff), desc(debts.createdAt));
    res.json(rows);
  }),
);

// GET /api/debts/summary — total deudas, total préstamos, balance neto
debtsRouter.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    const [row] = await db
      .select({
        totalDebt: sql<string>`COALESCE(SUM(CASE WHEN ${debts.type} = 'debt' AND ${debts.isPaidOff} = false THEN ${debts.remainingAmount} ELSE 0 END), 0)`,
        totalLoan: sql<string>`COALESCE(SUM(CASE WHEN ${debts.type} = 'loan' AND ${debts.isPaidOff} = false THEN ${debts.remainingAmount} ELSE 0 END), 0)`,
        activeDebts: sql<string>`COUNT(CASE WHEN ${debts.type} = 'debt' AND ${debts.isPaidOff} = false THEN 1 END)`,
        activeLoans: sql<string>`COUNT(CASE WHEN ${debts.type} = 'loan' AND ${debts.isPaidOff} = false THEN 1 END)`,
      })
      .from(debts);

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
    const [debt] = await db.select().from(debts).where(eq(debts.id, id));
    if (!debt) throw new ApiError(404, 'Deuda no encontrada');

    const payments = await db
      .select()
      .from(debtPayments)
      .where(eq(debtPayments.debtId, id))
      .orderBy(desc(debtPayments.date), desc(debtPayments.id));

    res.json({ ...debt, payments });
  }),
);

// POST /api/debts
debtsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = debtSchema.parse(req.body);
    const [row] = await db
      .insert(debts)
      .values({
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
    res.status(201).json(row);
  }),
);

// PUT /api/debts/:id
debtsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const data = debtSchema.partial().parse(req.body);

    const [old] = await db.select().from(debts).where(eq(debts.id, id));
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
      .where(eq(debts.id, id))
      .returning();
    res.json(row);
  }),
);

// DELETE /api/debts/:id — cascade en pagos
debtsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const deleted = await db.delete(debts).where(eq(debts.id, id)).returning();
    if (deleted.length === 0) throw new ApiError(404, 'Deuda no encontrada');
    res.json({ success: true });
  }),
);

// POST /api/debts/:id/pay — registra un pago y descuenta del restante
debtsRouter.post(
  '/:id/pay',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const data = paymentSchema.parse(req.body);

    const [debt] = await db.select().from(debts).where(eq(debts.id, id));
    if (!debt) throw new ApiError(404, 'Deuda no encontrada');
    if (debt.isPaidOff) throw new ApiError(400, 'Esta deuda ya está saldada');

    const remaining = Number(debt.remainingAmount);
    if (data.amount > remaining) {
      throw new ApiError(400, 'El pago supera el monto restante');
    }

    const newRemaining = remaining - data.amount;
    const paidOff = newRemaining <= 0;

    const insertStmt = db
      .insert(debtPayments)
      .values({
        debtId: id,
        amount: data.amount.toFixed(2),
        date: data.date,
        description: data.description ?? null,
      })
      .returning();

    const updateStmt = db
      .update(debts)
      .set({
        remainingAmount: newRemaining.toFixed(2),
        isPaidOff: paidOff,
        paidOffAt: paidOff ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(debts.id, id))
      .returning();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = await db.batch([insertStmt, updateStmt] as any);
    const updated = (results[1] as Debt[])[0];
    res.status(201).json(updated);
  }),
);
