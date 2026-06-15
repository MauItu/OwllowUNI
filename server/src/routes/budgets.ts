import { Router } from 'express';
import { and, eq, sql, desc } from 'drizzle-orm';
import { z } from 'zod';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { db } from '../db/connection.js';
import { budgets, categories, transactions } from '../db/schema.js';
import { asyncHandler, ApiError, isUniqueViolation } from '../middleware/errorHandler.js';
import { parseId } from '../utils/parseId.js';
import { userId } from '../middleware/auth.js';
import { cacheResponse, SUMMARY_TTL_MS } from '../services/cache.js';

export const budgetsRouter = Router();

/** Primer y último día (YYYY-MM-DD) del mes que contiene `d`. */
function monthBounds(d: Date): { start: string; end: string } {
  return { start: format(startOfMonth(d), 'yyyy-MM-dd'), end: format(endOfMonth(d), 'yyyy-MM-dd') };
}

/**
 * Subquery correlacionada del gasto del mes para una fila de `budgets`:
 *  - global (category_id IS NULL): suma TODOS los gastos del usuario en el rango.
 *  - de categoría: suma los gastos de esa categoría en el rango.
 */
function spentExpr(uid: number, start: string, end: string) {
  return sql<string>`COALESCE((
    SELECT SUM(${transactions.amount})
    FROM ${transactions}
    WHERE ${transactions.userId} = ${uid}
      AND ${transactions.type} = 'expense'
      AND ${transactions.date} >= ${start}
      AND ${transactions.date} <= ${end}
      AND (${budgets.categoryId} IS NULL OR ${transactions.categoryId} = ${budgets.categoryId})
  ), 0)`;
}

interface BudgetRow {
  id: number;
  categoryId: number | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  amount: string;
  spent: string;
  isActive: boolean;
}

/** Enriqura una fila con spent/remaining/percentage numéricos. */
function shapeBudget(r: BudgetRow) {
  const amount = Number(r.amount);
  const spent = Number(r.spent);
  return {
    id: r.id,
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    categoryIcon: r.categoryIcon,
    categoryColor: r.categoryColor,
    amount,
    spent,
    remaining: amount - spent,
    percentage: amount > 0 ? (spent / amount) * 100 : 0,
    isActive: r.isActive,
  };
}

/** Lee las filas de presupuesto del usuario con el gasto del mes ya calculado. */
async function fetchBudgets(uid: number, start: string, end: string): Promise<BudgetRow[]> {
  return db
    .select({
      id: budgets.id,
      categoryId: budgets.categoryId,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColor: categories.color,
      amount: budgets.amount,
      isActive: budgets.isActive,
      spent: spentExpr(uid, start, end),
    })
    .from(budgets)
    .leftJoin(categories, eq(budgets.categoryId, categories.id))
    .where(eq(budgets.userId, uid))
    .orderBy(desc(budgets.isActive), desc(budgets.createdAt))
    // TODO: paginar con load-more en mobile
    .limit(200);
}

const budgetSchema = z.object({
  categoryId: z.number().int().positive().optional().nullable(),
  amount: z.coerce.number().positive(),
});

/** Formato compacto para los mensajes de error (separador de miles es-CO). */
function fmtMoney(n: number): string {
  return `$${Math.round(n).toLocaleString('es-CO')}`;
}

/**
 * Invariante: un presupuesto de CATEGORÍA nunca puede exceder al GLOBAL, ni la
 * SUMA de todos los de categoría puede exceder al global. Lee todos los
 * presupuestos del usuario (una sola query) y valida el monto propuesto.
 * `excludeId` excluye la fila que se está editando de la suma.
 */
async function assertCategoryBudgetWithinGlobal(uid: number, amount: number, excludeId?: number) {
  const rows = await db
    .select({ id: budgets.id, categoryId: budgets.categoryId, amount: budgets.amount })
    .from(budgets)
    .where(eq(budgets.userId, uid));
  const global = rows.find((r) => r.categoryId == null);
  if (!global) {
    throw new ApiError(400, 'Primero crea un presupuesto global antes de crear presupuestos por categoría');
  }
  const globalAmount = Number(global.amount);
  if (amount > globalAmount) {
    throw new ApiError(400, 'El presupuesto de categoría no puede ser mayor al presupuesto global');
  }
  const othersSum = rows
    .filter((r) => r.categoryId != null && r.id !== excludeId)
    .reduce((s, r) => s + Number(r.amount), 0);
  const newSum = othersSum + amount;
  if (newSum > globalAmount) {
    throw new ApiError(
      400,
      `La suma de presupuestos por categoría (${fmtMoney(newSum)}) excedería el presupuesto global (${fmtMoney(globalAmount)})`,
    );
  }
}

/**
 * Simétrico al anterior: al EDITAR el global no puede quedar por debajo de la
 * suma de los presupuestos de categoría (rompería la invariante por el otro lado).
 */
async function assertGlobalNotBelowCategories(uid: number, globalAmount: number) {
  const rows = await db
    .select({ categoryId: budgets.categoryId, amount: budgets.amount })
    .from(budgets)
    .where(eq(budgets.userId, uid));
  const catSum = rows
    .filter((r) => r.categoryId != null)
    .reduce((s, r) => s + Number(r.amount), 0);
  if (catSum > globalAmount) {
    throw new ApiError(
      400,
      `El presupuesto global no puede ser menor a la suma de presupuestos por categoría (${fmtMoney(catSum)})`,
    );
  }
}

// GET /api/budgets — presupuestos del usuario con gasto del mes actual
budgetsRouter.get(
  '/',
  cacheResponse(SUMMARY_TTL_MS),
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const { start, end } = monthBounds(new Date());
    const rows = await fetchBudgets(uid, start, end);
    res.json(rows.map(shapeBudget));
  }),
);

// GET /api/budgets/summary — totales agregados de los presupuestos activos
budgetsRouter.get(
  '/summary',
  cacheResponse(SUMMARY_TTL_MS),
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const { start, end } = monthBounds(new Date());
    const rows = (await fetchBudgets(uid, start, end)).filter((r) => r.isActive);

    let totalBudgeted = 0;
    let totalSpent = 0;
    let overBudgetCount = 0;
    for (const r of rows) {
      const amount = Number(r.amount);
      const spent = Number(r.spent);
      totalBudgeted += amount;
      totalSpent += spent;
      if (spent > amount) overBudgetCount += 1;
    }
    res.json({
      totalBudgeted,
      totalSpent,
      totalRemaining: totalBudgeted - totalSpent,
      overBudgetCount,
      onTrackCount: rows.length - overBudgetCount,
    });
  }),
);

// GET /api/budgets/history?months=6 — cumplimiento de los últimos N meses
budgetsRouter.get(
  '/history',
  cacheResponse(SUMMARY_TTL_MS),
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const months = Math.min(12, Math.max(1, Number(req.query.months) || 6));

    // Rango: desde el primer día del mes más antiguo hasta hoy.
    const now = new Date();
    const rangeStart = format(startOfMonth(subMonths(now, months - 1)), 'yyyy-MM-dd');
    const monthExpr = sql<string>`TO_CHAR(${transactions.date}, 'YYYY-MM')`;

    // Dos lecturas independientes (presupuestos activos + gasto por mes/categoría) en paralelo.
    const [activeBudgets, byCatRows] = await Promise.all([
      // Presupuestos activos (su amount actual se compara contra cada mes).
      db
        .select({
          id: budgets.id,
          categoryId: budgets.categoryId,
          categoryName: categories.name,
          amount: budgets.amount,
        })
        .from(budgets)
        .leftJoin(categories, eq(budgets.categoryId, categories.id))
        .where(and(eq(budgets.userId, uid), eq(budgets.isActive, true))),
      // Gasto por (mes, categoría) y gasto total por mes (para los globales).
      db
        .select({
          month: monthExpr,
          categoryId: transactions.categoryId,
          spent: sql<string>`COALESCE(SUM(${transactions.amount}), 0)`,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, uid),
            eq(transactions.type, 'expense'),
            sql`${transactions.date} >= ${rangeStart}`,
          ),
        )
        .groupBy(monthExpr, transactions.categoryId),
    ]);

    // Mapas: total del mes y total por (mes|categoría).
    const monthTotal = new Map<string, number>();
    const monthCat = new Map<string, number>();
    for (const r of byCatRows) {
      const v = Number(r.spent);
      monthTotal.set(r.month, (monthTotal.get(r.month) ?? 0) + v);
      if (r.categoryId != null) monthCat.set(`${r.month}|${r.categoryId}`, v);
    }

    // Lista de meses (YYYY-MM), del más reciente al más antiguo.
    const result = [];
    for (let i = 0; i < months; i++) {
      const month = format(subMonths(now, i), 'yyyy-MM');
      const items = activeBudgets.map((b) => {
        const spent =
          b.categoryId == null
            ? monthTotal.get(month) ?? 0
            : monthCat.get(`${month}|${b.categoryId}`) ?? 0;
        const amount = Number(b.amount);
        return {
          categoryId: b.categoryId,
          categoryName: b.categoryName,
          amount,
          spent,
          met: spent <= amount,
        };
      });
      const totalMet = items.filter((it) => it.met).length;
      const totalBudgets = items.length;
      result.push({
        month,
        budgets: items,
        summary: {
          month,
          totalMet,
          totalBudgets,
          complianceRate: totalBudgets > 0 ? (totalMet / totalBudgets) * 100 : 0,
        },
      });
    }
    res.json(result);
  }),
);

// POST /api/budgets — crea un presupuesto (de categoría o global)
budgetsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const data = budgetSchema.parse(req.body);

    // Si trae categoría: debe existir, ser del usuario y de tipo 'expense', y
    // respetar la invariante frente al presupuesto global.
    if (data.categoryId != null) {
      const [cat] = await db
        .select({ id: categories.id, type: categories.type })
        .from(categories)
        .where(and(eq(categories.id, data.categoryId), eq(categories.userId, uid)));
      if (!cat) throw new ApiError(404, 'Categoría no encontrada');
      if (cat.type !== 'expense') throw new ApiError(400, 'La categoría debe ser de tipo gasto');
      await assertCategoryBudgetWithinGlobal(uid, data.amount);
    } else {
      // Crear el global: no puede nacer por debajo de la suma de categorías ya existentes.
      await assertGlobalNotBelowCategories(uid, data.amount);
    }

    try {
      const [row] = await db
        .insert(budgets)
        .values({
          userId: uid,
          categoryId: data.categoryId ?? null,
          amount: data.amount.toFixed(2),
        })
        .returning();
      res.status(201).json(row);
    } catch (err) {
      // UNIQUE(user_id, category_id) o el parcial del global → ya existe.
      if (isUniqueViolation(err)) {
        throw new ApiError(409, 'Ya tienes un presupuesto para esta categoría');
      }
      throw err;
    }
  }),
);

// PUT /api/budgets/:id — actualiza monto y/o estado (solo el dueño)
budgetsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const id = parseId(req.params.id);
    const data = z
      .object({ amount: z.coerce.number().positive().optional(), isActive: z.boolean().optional() })
      .parse(req.body);

    // Al cambiar el monto, validar la invariante categoría↔global según el tipo
    // del presupuesto editado.
    if (data.amount !== undefined) {
      const [existing] = await db
        .select({ id: budgets.id, categoryId: budgets.categoryId })
        .from(budgets)
        .where(and(eq(budgets.id, id), eq(budgets.userId, uid)));
      if (!existing) throw new ApiError(404, 'Presupuesto no encontrado');
      if (existing.categoryId != null) {
        await assertCategoryBudgetWithinGlobal(uid, data.amount, existing.id);
      } else {
        await assertGlobalNotBelowCategories(uid, data.amount);
      }
    }

    const [row] = await db
      .update(budgets)
      .set({
        ...(data.amount !== undefined && { amount: data.amount.toFixed(2) }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        updatedAt: new Date(),
      })
      .where(and(eq(budgets.id, id), eq(budgets.userId, uid)))
      .returning();
    if (!row) throw new ApiError(404, 'Presupuesto no encontrado');
    res.json(row);
  }),
);

// DELETE /api/budgets/:id — hard delete (solo el dueño)
budgetsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const id = parseId(req.params.id);
    const [row] = await db
      .delete(budgets)
      .where(and(eq(budgets.id, id), eq(budgets.userId, uid)))
      .returning({ id: budgets.id });
    if (!row) throw new ApiError(404, 'Presupuesto no encontrado');
    res.json({ success: true });
  }),
);
