import { Router } from 'express';
import { and, eq, gte, lte, sql, desc } from 'drizzle-orm';
import {
  startOfMonth,
  endOfMonth,
  subMonths,
  subWeeks,
  subDays,
  getDate,
  getDaysInMonth,
  differenceInCalendarDays,
  parseISO,
  format,
} from 'date-fns';
import { db } from '../db/connection.js';
import { transactions, categories } from '../db/schema.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export const insightsRouter = Router();

/**
 * Insights financieros automáticos — agregación SQL determinística (sin IA).
 *
 * El shape de cada insight está pensado para que, a futuro, un LLM pueda
 * reemplazar/enriquecer el campo `message` a partir de los demás campos
 * (type, severity, value, categoryId) sin tocar el resto del contrato.
 *
 * Convención de `value` (números crudos; el cliente formatea):
 *  - comparativa_categoria → monto gastado en la categoría (moneda)
 *  - proyeccion_mes        → gasto proyectado al cierre (moneda)
 *  - top_crecimiento       → gasto actual de la categoría (moneda)
 *  - patron_semanal        → gasto promedio de ese día (moneda)
 *  - balance_salud         → % del ingreso ya gastado (porcentaje)
 *  - racha_registro        → cantidad de días (entero)
 */

type Severity = 'info' | 'warning' | 'positive';
type InsightType =
  | 'comparativa_categoria'
  | 'proyeccion_mes'
  | 'racha_registro'
  | 'top_crecimiento'
  | 'patron_semanal'
  | 'balance_salud';

interface Insight {
  id: string;
  type: InsightType;
  severity: Severity;
  title: string;
  message: string;
  value?: number;
  categoryId?: number;
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd');
const round = (n: number) => Math.round(n);

// EXTRACT(DOW): 0 = domingo … 6 = sábado
const WEEKDAYS_PLURAL = [
  'domingos',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábados',
];

// GET /api/insights — insights del mes actual
insightsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const mStart = iso(startOfMonth(now));
    const mEnd = iso(endOfMonth(now));
    const prevStart = iso(startOfMonth(subMonths(now, 1)));
    const prevEnd = iso(endOfMonth(subMonths(now, 1)));
    const threeStart = iso(startOfMonth(subMonths(now, 3))); // 3 meses previos completos…
    const threeEnd = prevEnd; // …hasta el fin del mes pasado
    const eightWeeksAgo = iso(subWeeks(now, 8));
    const sixtyDaysAgo = iso(subDays(now, 60));

    const dayOfMonth = getDate(now); // días transcurridos (incluye hoy)
    const daysInMonth = getDaysInMonth(now);

    const expenseByCat = (from: string, to: string) =>
      db
        .select({
          categoryId: transactions.categoryId,
          name: sql<string>`COALESCE(${categories.name}, 'Sin categoría')`,
          total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)`,
        })
        .from(transactions)
        .leftJoin(categories, eq(transactions.categoryId, categories.id))
        .where(
          and(eq(transactions.type, 'expense'), gte(transactions.date, from), lte(transactions.date, to)),
        )
        .groupBy(transactions.categoryId, categories.name);

    const dowExpr = sql`EXTRACT(DOW FROM ${transactions.date})`;

    const [
      monthTotals,
      curByCat,
      prevByCat,
      threeByCat,
      distinctDays,
      dowRows,
      minDateRow,
    ] = await Promise.all([
      // Totales del mes actual por tipo (ingreso/gasto)
      db
        .select({
          type: transactions.type,
          total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)`,
        })
        .from(transactions)
        .where(and(gte(transactions.date, mStart), lte(transactions.date, mEnd)))
        .groupBy(transactions.type),
      expenseByCat(mStart, mEnd),
      expenseByCat(prevStart, prevEnd),
      expenseByCat(threeStart, threeEnd),
      // Días distintos con al menos una transacción (últimos 60 días)
      db
        .select({ date: transactions.date })
        .from(transactions)
        .where(gte(transactions.date, sixtyDaysAgo))
        .groupBy(transactions.date)
        .orderBy(desc(transactions.date)),
      // Gasto por día de la semana (últimas 8 semanas)
      db
        .select({
          dow: sql<number>`${dowExpr}::int`,
          total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)`,
          days: sql<number>`COUNT(DISTINCT ${transactions.date})::int`,
        })
        .from(transactions)
        .where(and(eq(transactions.type, 'expense'), gte(transactions.date, eightWeeksAgo)))
        .groupBy(dowExpr),
      // Fecha de la primera transacción (tamaño del historial)
      db.select({ minDate: sql<string | null>`MIN(${transactions.date})` }).from(transactions),
    ]);

    const insights: Insight[] = [];

    const historyDays = minDateRow[0]?.minDate
      ? differenceInCalendarDays(now, parseISO(minDateRow[0].minDate)) + 1
      : 0;

    // Sin historial → no hay nada que decir todavía.
    if (historyDays < 1) {
      res.json(insights);
      return;
    }

    let curIncome = 0;
    let curExpense = 0;
    for (const r of monthTotals) {
      if (r.type === 'income') curIncome = Number(r.total);
      else if (r.type === 'expense') curExpense = Number(r.total);
    }

    const curMap = new Map<number | null, { name: string; total: number }>();
    for (const r of curByCat) curMap.set(r.categoryId, { name: r.name, total: Number(r.total) });
    const prevMap = new Map<number | null, { name: string; total: number }>();
    for (const r of prevByCat) prevMap.set(r.categoryId, { name: r.name, total: Number(r.total) });
    const threeMap = new Map<number | null, number>();
    for (const r of threeByCat) threeMap.set(r.categoryId, Number(r.total));

    const prevExpenseTotal = prevByCat.reduce((acc, r) => acc + Number(r.total), 0);
    const threeTotal = threeByCat.reduce((acc, r) => acc + Number(r.total), 0);

    // ─── comparativa_categoria ───────────────────────────────────────────
    // Categorías cuyo gasto del mes supera en ≥20% el promedio de los 3 meses
    // previos. Solo si hay historial suficiente en ese rango.
    if (threeTotal > 0) {
      const candidates: { categoryId: number; name: string; total: number; variation: number }[] = [];
      for (const [categoryId, cur] of curMap) {
        if (categoryId == null) continue; // ignora "Sin categoría"
        const avg3 = (threeMap.get(categoryId) ?? 0) / 3;
        if (avg3 <= 0) continue;
        const variation = (cur.total / avg3 - 1) * 100;
        if (variation >= 20) {
          candidates.push({ categoryId, name: cur.name, total: cur.total, variation });
        }
      }
      candidates
        .sort((a, b) => b.variation - a.variation)
        .slice(0, 3)
        .forEach((c) => {
          insights.push({
            id: `comparativa_categoria-${c.categoryId}`,
            type: 'comparativa_categoria',
            severity: 'warning',
            title: `Gasto alto en ${c.name}`,
            message: `Este mes gastaste un ${round(c.variation)}% más que tu promedio de los últimos 3 meses en ${c.name}.`,
            value: c.total,
            categoryId: c.categoryId,
          });
        });
    }

    // ─── proyeccion_mes ──────────────────────────────────────────────────
    // Requiere ≥7 días de historia y ≥7 días transcurridos del mes (evita
    // proyectar con ruido al inicio del mes o en cuentas nuevas).
    if (historyDays >= 7 && dayOfMonth >= 7 && curExpense > 0) {
      const dailyRate = curExpense / dayOfMonth;
      const projected = dailyRate * daysInMonth;
      let severity: Severity = 'info';
      let message: string;
      if (prevExpenseTotal > 0) {
        const diffPct = (projected / prevExpenseTotal - 1) * 100;
        if (diffPct > 5) {
          severity = 'warning';
          message = `Al ritmo actual, cerrarás el mes con un gasto ~${round(diffPct)}% mayor que el mes pasado.`;
        } else if (diffPct < -5) {
          severity = 'positive';
          message = `Vas camino a gastar ~${round(-diffPct)}% menos que el mes pasado. ¡Bien hecho!`;
        } else {
          message = 'Tu gasto proyectado es similar al del mes pasado.';
        }
      } else {
        message = 'Según tu ritmo de gasto actual, este sería tu gasto total al cierre del mes.';
      }
      insights.push({
        id: 'proyeccion_mes',
        type: 'proyeccion_mes',
        severity,
        title: 'Proyección del mes',
        message,
        value: Math.round(projected),
      });
    }

    // ─── racha_registro ──────────────────────────────────────────────────
    if (distinctDays.length > 0) {
      const dates = distinctDays.map((d) => parseISO(d.date)); // orden desc
      const daysSinceLast = differenceInCalendarDays(now, dates[0]);
      let streak = 1;
      for (let i = 1; i < dates.length; i++) {
        if (differenceInCalendarDays(dates[i - 1], dates[i]) === 1) streak++;
        else break;
      }
      if (daysSinceLast >= 3) {
        insights.push({
          id: 'racha_registro',
          type: 'racha_registro',
          severity: 'warning',
          title: 'Llevas días sin registrar',
          message: `Han pasado ${daysSinceLast} días desde tu último movimiento. Registra tus gastos para no perder el control.`,
          value: daysSinceLast,
        });
      } else if (streak >= 3) {
        insights.push({
          id: 'racha_registro',
          type: 'racha_registro',
          severity: 'positive',
          title: `¡Racha de ${streak} días!`,
          message: `Llevas ${streak} días seguidos registrando tus movimientos. ¡Sigue así!`,
          value: streak,
        });
      }
    }

    // ─── top_crecimiento ─────────────────────────────────────────────────
    // Categoría con el mayor aumento de gasto vs el mes anterior.
    {
      let best: { categoryId: number; name: string; current: number; delta: number; prev: number } | null = null;
      for (const [categoryId, cur] of curMap) {
        if (categoryId == null) continue;
        const prev = prevMap.get(categoryId)?.total ?? 0;
        const delta = cur.total - prev;
        if (delta > 0 && (!best || delta > best.delta)) {
          best = { categoryId, name: cur.name, current: cur.total, delta, prev };
        }
      }
      if (best) {
        const message =
          best.prev > 0
            ? `${best.name} creció ${round((best.delta / best.prev) * 100)}% respecto al mes anterior, el mayor aumento entre tus categorías.`
            : `${best.name} es la categoría que más creció este mes respecto al anterior.`;
        insights.push({
          id: 'top_crecimiento',
          type: 'top_crecimiento',
          severity: 'info',
          title: `Mayor crecimiento: ${best.name}`,
          message,
          value: best.current,
          categoryId: best.categoryId,
        });
      }
    }

    // ─── patron_semanal ──────────────────────────────────────────────────
    // Día de la semana con mayor gasto promedio (últimas 8 semanas).
    if (historyDays >= 14) {
      let best: { dow: number; avg: number } | null = null;
      for (const r of dowRows) {
        if (r.days < 2) continue; // evita que un único día con un gasto grande domine
        const avg = Number(r.total) / r.days;
        if (!best || avg > best.avg) best = { dow: r.dow, avg };
      }
      if (best) {
        const weekday = WEEKDAYS_PLURAL[best.dow] ?? 'días';
        insights.push({
          id: 'patron_semanal',
          type: 'patron_semanal',
          severity: 'info',
          title: 'Tu día de mayor gasto',
          message: `Los ${weekday} sueles gastar más que cualquier otro día de la semana.`,
          value: Math.round(best.avg),
        });
      }
    }

    // ─── balance_salud ───────────────────────────────────────────────────
    if (curIncome > 0) {
      const pctSpent = (curExpense / curIncome) * 100;
      let severity: Severity;
      let message: string;
      if (pctSpent > 90) {
        severity = 'warning';
        message = `Ya gastaste el ${round(pctSpent)}% de tus ingresos del mes. Cuida tu presupuesto.`;
      } else if (pctSpent <= 60) {
        severity = 'positive';
        message = `Llevas el ${round(pctSpent)}% de tus ingresos gastado. Vas bien este mes.`;
      } else {
        severity = 'info';
        message = `Has gastado el ${round(pctSpent)}% de tus ingresos del mes.`;
      }
      insights.push({
        id: 'balance_salud',
        type: 'balance_salud',
        severity,
        title: 'Salud de tu balance',
        message,
        value: Math.round(pctSpent * 10) / 10,
      });
    }

    // Orden para el carrusel del Home: warning → positive → info.
    const rank: Record<Severity, number> = { warning: 0, positive: 1, info: 2 };
    insights.sort((a, b) => rank[a.severity] - rank[b.severity]);

    res.json(insights);
  }),
);
