import { Router } from 'express';
import { and, gte, lte, eq, sql, desc } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { transactions, categories, accounts } from '../db/schema.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getConversionMap } from '../services/exchangeRates.js';

export const statsRouter = Router();

/** Lee from/to de la query; si faltan usa un rango amplio. */
function range(req: { query: Record<string, unknown> }) {
  const from = (req.query.from as string) || '1900-01-01';
  const to = (req.query.to as string) || '2999-12-31';
  return { from, to };
}

function displayCurrencyOf(req: { query: Record<string, unknown> }) {
  return ((req.query.displayCurrency as string) || 'COP').toUpperCase();
}

// GET /api/stats/summary — totales ingresos, gastos, balance (en displayCurrency)
statsRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const { from, to } = range(req);
    const display = displayCurrencyOf(req);

    // Sumas por moneda de la cuenta + tipo. Cada transacción está en la moneda
    // de su cuenta; se convierten a la moneda de visualización en memoria.
    const rows = await db
      .select({
        currency: accounts.currency,
        type: transactions.type,
        total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)`,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(and(gte(transactions.date, from), lte(transactions.date, to)))
      .groupBy(accounts.currency, transactions.type);

    const { map } = await getConversionMap(display, rows.map((r) => r.currency));

    let income = 0;
    let expense = 0;
    for (const r of rows) {
      const rate = map.get(r.currency.toUpperCase()) ?? 1;
      const value = Number(r.total) * rate;
      if (r.type === 'income') income += value;
      else if (r.type === 'expense') expense += value;
    }
    res.json({ income, expense, balance: income - expense, displayCurrency: display });
  }),
);

// GET /api/stats/by-category — gastos por categoría (en displayCurrency)
statsRouter.get(
  '/by-category',
  asyncHandler(async (req, res) => {
    const { from, to } = range(req);
    const display = displayCurrencyOf(req);
    const type = (req.query.type as string) || 'expense';

    const rows = await db
      .select({
        categoryId: transactions.categoryId,
        categoryName: sql<string>`COALESCE(${categories.name}, 'Sin categoría')`,
        categoryColor: sql<string>`COALESCE(${categories.color}, '#6B7280')`,
        categoryIcon: sql<string>`COALESCE(${categories.icon}, 'circle-help')`,
        currency: accounts.currency,
        total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)`,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(eq(transactions.type, type), gte(transactions.date, from), lte(transactions.date, to)))
      .groupBy(
        transactions.categoryId,
        categories.name,
        categories.color,
        categories.icon,
        accounts.currency,
      );

    const { map } = await getConversionMap(display, rows.map((r) => r.currency));

    // Agrega por categoría tras convertir (una categoría puede tener varias monedas).
    const byCat = new Map<
      string,
      { categoryId: number | null; name: string; color: string; icon: string; total: number }
    >();
    for (const r of rows) {
      const rate = map.get(r.currency.toUpperCase()) ?? 1;
      const value = Number(r.total) * rate;
      const key = String(r.categoryId);
      const entry =
        byCat.get(key) ??
        { categoryId: r.categoryId, name: r.categoryName, color: r.categoryColor, icon: r.categoryIcon, total: 0 };
      entry.total += value;
      byCat.set(key, entry);
    }

    const list = Array.from(byCat.values()).sort((a, b) => b.total - a.total);
    const total = list.reduce((acc, r) => acc + r.total, 0);
    res.json(
      list.map((r) => ({
        categoryId: r.categoryId,
        name: r.name,
        color: r.color,
        icon: r.icon,
        total: r.total,
        percentage: total > 0 ? Math.round((r.total / total) * 1000) / 10 : 0,
      })),
    );
  }),
);

// GET /api/stats/timeline — serie temporal ingresos vs gastos (en displayCurrency)
statsRouter.get(
  '/timeline',
  asyncHandler(async (req, res) => {
    const { from, to } = range(req);
    const display = displayCurrencyOf(req);
    const group = (req.query.group as string) || 'day'; // day | week | month
    const trunc = group === 'month' ? 'month' : group === 'week' ? 'week' : 'day';

    // `trunc` ya está saneado a 'day'|'week'|'month': inyectarlo con sql.raw
    // para que SELECT y GROUP BY compartan exactamente la misma expresión.
    const bucketExpr = sql`DATE_TRUNC(${sql.raw(`'${trunc}'`)}, ${transactions.date}::timestamp)`;
    const rows = await db
      .select({
        bucket: sql<string>`TO_CHAR(${bucketExpr}, 'YYYY-MM-DD')`,
        type: transactions.type,
        currency: accounts.currency,
        total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)`,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(and(gte(transactions.date, from), lte(transactions.date, to)))
      .groupBy(bucketExpr, transactions.type, accounts.currency)
      .orderBy(bucketExpr);

    const { map } = await getConversionMap(display, rows.map((r) => r.currency));

    const byBucket = new Map<string, { date: string; income: number; expense: number }>();
    for (const r of rows) {
      const rate = map.get(r.currency.toUpperCase()) ?? 1;
      const value = Number(r.total) * rate;
      const entry = byBucket.get(r.bucket) ?? { date: r.bucket, income: 0, expense: 0 };
      if (r.type === 'income') entry.income += value;
      else if (r.type === 'expense') entry.expense += value;
      byBucket.set(r.bucket, entry);
    }
    res.json(Array.from(byBucket.values()));
  }),
);

// GET /api/stats/balance-evolution — evolución acumulada del balance (en displayCurrency)
statsRouter.get(
  '/balance-evolution',
  asyncHandler(async (req, res) => {
    const { from, to } = range(req);
    const display = displayCurrencyOf(req);

    const rows = await db
      .select({
        date: transactions.date,
        currency: accounts.currency,
        net: sql<string>`COALESCE(SUM(
          CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amount}
               WHEN ${transactions.type} = 'expense' THEN -${transactions.amount}
               ELSE 0 END
        ), 0)`,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(and(gte(transactions.date, from), lte(transactions.date, to)))
      .groupBy(transactions.date, accounts.currency)
      .orderBy(transactions.date);

    const { map } = await getConversionMap(display, rows.map((r) => r.currency));

    // Suma neta por día (ya convertida) y acumulado.
    const byDate = new Map<string, number>();
    for (const r of rows) {
      const rate = map.get(r.currency.toUpperCase()) ?? 1;
      byDate.set(r.date, (byDate.get(r.date) ?? 0) + Number(r.net) * rate);
    }
    let running = 0;
    const result = Array.from(byDate.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, net]) => {
        running += net;
        return { date, balance: running };
      });
    res.json(result);
  }),
);
