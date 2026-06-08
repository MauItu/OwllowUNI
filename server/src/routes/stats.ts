import { Router } from 'express';
import { and, gte, lte, eq, sql, desc } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { transactions, categories } from '../db/schema.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export const statsRouter = Router();

/** Lee from/to de la query; si faltan usa un rango amplio. */
function range(req: { query: Record<string, unknown> }) {
  const from = (req.query.from as string) || '1900-01-01';
  const to = (req.query.to as string) || '2999-12-31';
  return { from, to };
}

// GET /api/stats/summary — totales ingresos, gastos, balance
statsRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const { from, to } = range(req);
    const rows = await db
      .select({
        type: transactions.type,
        total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)`,
      })
      .from(transactions)
      .where(and(gte(transactions.date, from), lte(transactions.date, to)))
      .groupBy(transactions.type);

    let income = 0;
    let expense = 0;
    for (const r of rows) {
      if (r.type === 'income') income = Number(r.total);
      else if (r.type === 'expense') expense = Number(r.total);
    }
    res.json({ income, expense, balance: income - expense });
  }),
);

// GET /api/stats/by-category — gastos agrupados por categoría
statsRouter.get(
  '/by-category',
  asyncHandler(async (req, res) => {
    const { from, to } = range(req);
    const type = (req.query.type as string) || 'expense';

    const rows = await db
      .select({
        categoryId: transactions.categoryId,
        categoryName: sql<string>`COALESCE(${categories.name}, 'Sin categoría')`,
        categoryColor: sql<string>`COALESCE(${categories.color}, '#6B7280')`,
        categoryIcon: sql<string>`COALESCE(${categories.icon}, 'circle-help')`,
        total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)`,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(
        and(
          eq(transactions.type, type),
          gte(transactions.date, from),
          lte(transactions.date, to),
        ),
      )
      .groupBy(
        transactions.categoryId,
        categories.name,
        categories.color,
        categories.icon,
      )
      .orderBy(desc(sql`SUM(${transactions.amount})`));

    const total = rows.reduce((acc, r) => acc + Number(r.total), 0);
    res.json(
      rows.map((r) => ({
        categoryId: r.categoryId,
        name: r.categoryName,
        color: r.categoryColor,
        icon: r.categoryIcon,
        total: Number(r.total),
        percentage: total > 0 ? Math.round((Number(r.total) / total) * 1000) / 10 : 0,
      })),
    );
  }),
);

// GET /api/stats/timeline — serie temporal ingresos vs gastos
statsRouter.get(
  '/timeline',
  asyncHandler(async (req, res) => {
    const { from, to } = range(req);
    const group = (req.query.group as string) || 'day'; // day | week | month
    const trunc = group === 'month' ? 'month' : group === 'week' ? 'week' : 'day';

    const rows = await db
      .select({
        bucket: sql<string>`TO_CHAR(DATE_TRUNC(${trunc}, ${transactions.date}::timestamp), 'YYYY-MM-DD')`,
        type: transactions.type,
        total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)`,
      })
      .from(transactions)
      .where(and(gte(transactions.date, from), lte(transactions.date, to)))
      .groupBy(
        sql`DATE_TRUNC(${trunc}, ${transactions.date}::timestamp)`,
        transactions.type,
      )
      .orderBy(sql`DATE_TRUNC(${trunc}, ${transactions.date}::timestamp)`);

    const map = new Map<string, { date: string; income: number; expense: number }>();
    for (const r of rows) {
      const entry = map.get(r.bucket) ?? { date: r.bucket, income: 0, expense: 0 };
      if (r.type === 'income') entry.income = Number(r.total);
      else if (r.type === 'expense') entry.expense = Number(r.total);
      map.set(r.bucket, entry);
    }
    res.json(Array.from(map.values()));
  }),
);

// GET /api/stats/balance-evolution — evolución acumulada del balance
statsRouter.get(
  '/balance-evolution',
  asyncHandler(async (req, res) => {
    const { from, to } = range(req);

    // Balance neto por día (income - expense), ignorando transferencias.
    const rows = await db
      .select({
        date: transactions.date,
        net: sql<string>`COALESCE(SUM(
          CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amount}
               WHEN ${transactions.type} = 'expense' THEN -${transactions.amount}
               ELSE 0 END
        ), 0)`,
      })
      .from(transactions)
      .where(and(gte(transactions.date, from), lte(transactions.date, to)))
      .groupBy(transactions.date)
      .orderBy(transactions.date);

    let running = 0;
    const result = rows.map((r) => {
      running += Number(r.net);
      return { date: r.date, balance: running };
    });
    res.json(result);
  }),
);
