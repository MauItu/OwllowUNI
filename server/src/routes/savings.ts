import { Router } from 'express';
import { and, eq, desc, asc, sql, count } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { savingsGoals, savingsContributions, accounts, type SavingsGoal } from '../db/schema.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { parseId } from '../utils/parseId.js';
import { userId } from '../middleware/auth.js';
import { safeCompensate } from '../utils/safeCompensate.js';
import { cacheResponse, SUMMARY_TTL_MS } from '../services/cache.js';

export const savingsRouter = Router();

const goalSchema = z.object({
  name: z.string().min(1).max(100),
  targetAmount: z.coerce.number().positive(),
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  icon: z.string().max(50).optional(),
  accountId: z.number().int().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const contributionSchema = z.object({
  amount: z.coerce.number().positive(),
  type: z.enum(['deposit', 'withdrawal']),
  description: z.string().max(255).optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// GET /api/savings — metas (activas primero, luego completadas)
savingsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await db
      .select({
        id: savingsGoals.id,
        name: savingsGoals.name,
        targetAmount: savingsGoals.targetAmount,
        currentAmount: savingsGoals.currentAmount,
        deadline: savingsGoals.deadline,
        color: savingsGoals.color,
        icon: savingsGoals.icon,
        isCompleted: savingsGoals.isCompleted,
        completedAt: savingsGoals.completedAt,
        accountId: savingsGoals.accountId,
        notes: savingsGoals.notes,
        createdAt: savingsGoals.createdAt,
        updatedAt: savingsGoals.updatedAt,
        accountName: accounts.name,
      })
      .from(savingsGoals)
      .leftJoin(accounts, eq(savingsGoals.accountId, accounts.id))
      .where(eq(savingsGoals.userId, userId(req)))
      .orderBy(asc(savingsGoals.isCompleted), desc(savingsGoals.createdAt));
    res.json(rows);
  }),
);

// GET /api/savings/summary — totales y conteo de metas
savingsRouter.get(
  '/summary',
  cacheResponse(SUMMARY_TTL_MS),
  asyncHandler(async (req, res) => {
    const [row] = await db
      .select({
        totalSaved: sql<string>`COALESCE(SUM(${savingsGoals.currentAmount}), 0)`,
        totalTarget: sql<string>`COALESCE(SUM(${savingsGoals.targetAmount}), 0)`,
        activeGoals: count(sql`CASE WHEN ${savingsGoals.isCompleted} = false THEN 1 END`),
        completedGoals: count(sql`CASE WHEN ${savingsGoals.isCompleted} = true THEN 1 END`),
      })
      .from(savingsGoals)
      .where(eq(savingsGoals.userId, userId(req)));

    const totalSaved = Number(row.totalSaved);
    const totalTarget = Number(row.totalTarget);
    res.json({
      totalSaved,
      totalTarget,
      totalRemaining: Math.max(0, totalTarget - totalSaved),
      activeGoals: Number(row.activeGoals),
      completedGoals: Number(row.completedGoals),
    });
  }),
);

// GET /api/savings/:id — meta con sus contribuciones
savingsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const [goal] = await db
      .select()
      .from(savingsGoals)
      .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId(req))));
    if (!goal) throw new ApiError(404, 'Meta de ahorro no encontrada');

    const contributions = await db
      .select()
      .from(savingsContributions)
      .where(eq(savingsContributions.goalId, id))
      .orderBy(desc(savingsContributions.date), desc(savingsContributions.id))
      // Cap defensivo del peor caso (sin cambiar contrato): las más recientes.
      // TODO: paginar con load-more en mobile
      .limit(200);

    res.json({ ...goal, contributions });
  }),
);

// POST /api/savings
savingsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = goalSchema.parse(req.body);
    const [row] = await db
      .insert(savingsGoals)
      .values({
        userId: userId(req),
        name: data.name,
        targetAmount: data.targetAmount.toFixed(2),
        deadline: data.deadline ?? null,
        ...(data.color && { color: data.color }),
        ...(data.icon && { icon: data.icon }),
        accountId: data.accountId ?? null,
        notes: data.notes ?? null,
      })
      .returning();
    res.status(201).json(row);
  }),
);

// PUT /api/savings/:id
savingsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const data = goalSchema.partial().parse(req.body);

    const [old] = await db
      .select()
      .from(savingsGoals)
      .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId(req))));
    if (!old) throw new ApiError(404, 'Meta de ahorro no encontrada');

    // Si cambia el objetivo, recalcular el estado de completitud
    const target = data.targetAmount != null ? data.targetAmount : Number(old.targetAmount);
    const completedNow = Number(old.currentAmount) >= target;

    const [row] = await db
      .update(savingsGoals)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.targetAmount !== undefined && { targetAmount: data.targetAmount.toFixed(2) }),
        ...(data.deadline !== undefined && { deadline: data.deadline }),
        ...(data.color !== undefined && { color: data.color }),
        ...(data.icon !== undefined && { icon: data.icon }),
        ...(data.accountId !== undefined && { accountId: data.accountId }),
        ...(data.notes !== undefined && { notes: data.notes }),
        isCompleted: completedNow,
        completedAt: completedNow ? old.completedAt ?? new Date() : null,
        updatedAt: new Date(),
      })
      .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId(req))))
      .returning();
    res.json(row);
  }),
);

// DELETE /api/savings/:id — cascade en contribuciones
savingsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const deleted = await db
      .delete(savingsGoals)
      .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId(req))))
      .returning();
    if (deleted.length === 0) throw new ApiError(404, 'Meta de ahorro no encontrada');
    res.json({ success: true });
  }),
);

// POST /api/savings/:id/contribute — depósito o retiro
savingsRouter.post(
  '/:id/contribute',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const data = contributionSchema.parse(req.body);

    const [goal] = await db
      .select()
      .from(savingsGoals)
      .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId(req))));
    if (!goal) throw new ApiError(404, 'Meta de ahorro no encontrada');

    const uid = userId(req);
    const isWithdrawal = data.type === 'withdrawal';
    // `signedStr` ya lleva el signo: suma en depósito, resta en retiro.
    const amountStr = data.amount.toFixed(2);
    const signedStr = (isWithdrawal ? -data.amount : data.amount).toFixed(2);
    const newAmountExpr = sql`${savingsGoals.currentAmount} + ${signedStr}::numeric`;

    // Update CONDICIONAL del saldo. En retiro, el guard `current_amount >= amount`
    // va en el WHERE y es atómico (elimina el TOCTOU de leer→validar→escribir): si
    // afecta 0 filas, otro movimiento se adelantó o el monto excede → 400.
    const conds = [eq(savingsGoals.id, id), eq(savingsGoals.userId, uid)];
    if (isWithdrawal) conds.push(sql`${savingsGoals.currentAmount} >= ${amountStr}::numeric`);

    const [updated] = await db
      .update(savingsGoals)
      .set({
        currentAmount: newAmountExpr,
        isCompleted: sql`(${newAmountExpr}) >= ${savingsGoals.targetAmount}`,
        completedAt: sql`CASE WHEN (${newAmountExpr}) >= ${savingsGoals.targetAmount} THEN COALESCE(${savingsGoals.completedAt}, now()) ELSE NULL END`,
        updatedAt: new Date(),
      })
      .where(and(...conds))
      .returning();
    if (!updated) throw new ApiError(400, 'No puedes retirar más de lo ahorrado');

    // Registrar la contribución. Si falla, compensar el saldo (restar lo sumado y
    // restaurar los flags previos) para no dejar la meta descuadrada.
    try {
      await db.insert(savingsContributions).values({
        goalId: id,
        amount: amountStr,
        type: data.type,
        description: data.description ?? null,
        date: data.date,
      });
      res.status(201).json(updated);
    } catch (err) {
      await safeCompensate(
        [
          db
            .update(savingsGoals)
            .set({
              currentAmount: sql`${savingsGoals.currentAmount} - ${signedStr}::numeric`,
              isCompleted: goal.isCompleted,
              completedAt: goal.completedAt,
              updatedAt: new Date(),
            })
            .where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, uid))),
        ],
        {
          endpoint: 'POST /api/savings/:id/contribute',
          operation: 'contribute',
          userId: uid,
          entityId: id,
        },
      );
      throw err;
    }
  }),
);
