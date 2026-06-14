import { useCallback, useEffect, useState } from 'react';
import { statsApi, getErrorMessage } from '../api/client';
import { useAppStore } from '../stores/appStore';
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
  const [data, setData] = useState<StatsData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshKey = useAppStore((s) => s.refreshKey);

  const fetch = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);
        const [summary, byCategory, timeline, balanceEvolution] = await Promise.all([
          statsApi.summary(from, to, displayCurrency),
          statsApi.byCategory(from, to, 'expense', displayCurrency),
          statsApi.timeline(from, to, group, displayCurrency),
          statsApi.balanceEvolution(from, to, displayCurrency),
        ]);
        setData({ summary, byCategory, timeline, balanceEvolution });
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [from, to, group, displayCurrency],
  );

  useEffect(() => {
    fetch();
  }, [fetch, refreshKey]);

  return { ...data, loading, refreshing, error, refetch: fetch };
}
