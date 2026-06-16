import { statsApi } from '../api/client';
import { useResource } from './useResource';
import type { StatsSummary, CategoryStat, TimelinePoint, BalancePoint } from '../types';

interface StatsData {
  summary: StatsSummary;
  byCategory: CategoryStat[];
  timeline: TimelinePoint[];
  balanceEvolution: BalancePoint[];
}

const EMPTY: StatsData = {
  summary: { income: 0, expense: 0, balance: 0 },
  byCategory: [],
  timeline: [],
  balanceEvolution: [],
};

/** Hook de estadísticas: fetch de summary, por categoría y series según rango/moneda. */
export function useStats(
  from: string,
  to: string,
  group: 'day' | 'week' | 'month' = 'day',
  displayCurrency = 'COP',
) {
  const { data, loading, refreshing, error, refetch } = useResource<StatsData>(
    () =>
      Promise.all([
        statsApi.summary(from, to, displayCurrency),
        statsApi.byCategory(from, to, 'expense', displayCurrency),
        statsApi.timeline(from, to, group, displayCurrency),
        statsApi.balanceEvolution(from, to, displayCurrency),
      ]).then(([summary, byCategory, timeline, balanceEvolution]) => ({
        summary,
        byCategory,
        timeline,
        balanceEvolution,
      })),
    [from, to, group, displayCurrency],
  );

  return { ...(data ?? EMPTY), loading, refreshing, error, refetch };
}
