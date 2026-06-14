import { format, parseISO, startOfWeek } from 'date-fns';
import type { Transaction, StatsSummary, CategoryStat, TimelinePoint, BalancePoint } from '../types';

export interface AggregatedStats {
  summary: StatsSummary;
  byCategory: CategoryStat[];
  timeline: TimelinePoint[];
  balanceEvolution: BalancePoint[];
}

function parse(date: string): Date {
  return parseISO(date.length <= 10 ? `${date}T00:00:00` : date);
}

/** Clave de bucket para la línea de tiempo, según la granularidad pedida. */
function bucketKey(date: string, group: 'day' | 'week' | 'month'): string {
  const d = parse(date);
  if (group === 'month') return format(d, 'yyyy-MM-01');
  if (group === 'week') return format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  return format(d, 'yyyy-MM-dd');
}

/**
 * Agrega un conjunto de transacciones (ya filtradas por tipo de cuenta) en los
 * mismos datasets que consumen los gráficos de Estadísticas. Se usa cuando el
 * filtro débito/crédito está activo y el endpoint de stats (que no acepta tipo
 * de cuenta) no sirve. Suma en el monto nativo de cada transacción (sin conversión
 * de moneda): exacto en el caso mono-moneda (COP), aproximado si hay multi-moneda.
 */
export function aggregateStats(txs: Transaction[], group: 'day' | 'week' | 'month'): AggregatedStats {
  let income = 0;
  let expense = 0;
  const catMap = new Map<number, { name: string; color: string; icon: string; total: number }>();
  const timeMap = new Map<string, { income: number; expense: number }>();

  for (const t of txs) {
    if (t.type === 'transfer') continue; // las transferencias no son ingreso ni gasto
    const amt = Number(t.amount) || 0;
    const key = bucketKey(t.date, group);
    const tm = timeMap.get(key) ?? { income: 0, expense: 0 };

    if (t.type === 'income') {
      income += amt;
      tm.income += amt;
    } else {
      expense += amt;
      tm.expense += amt;
      const id = t.categoryId ?? 0;
      const cur = catMap.get(id) ?? {
        name: t.categoryName ?? 'Sin categoría',
        color: t.categoryColor ?? '#9CA3AF',
        icon: t.categoryIcon ?? 'circle',
        total: 0,
      };
      cur.total += amt;
      catMap.set(id, cur);
    }
    timeMap.set(key, tm);
  }

  const byCategory: CategoryStat[] = Array.from(catMap.entries())
    .map(([categoryId, c]) => ({
      categoryId: categoryId || null,
      name: c.name,
      color: c.color,
      icon: c.icon,
      total: c.total,
      percentage: expense > 0 ? Math.round((c.total / expense) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const timeline: TimelinePoint[] = Array.from(timeMap.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, v]) => ({ date, income: v.income, expense: v.expense }));

  let running = 0;
  const balanceEvolution: BalancePoint[] = timeline.map((t) => {
    running += t.income - t.expense;
    return { date: t.date, balance: running };
  });

  return { summary: { income, expense, balance: income - expense }, byCategory, timeline, balanceEvolution };
}
