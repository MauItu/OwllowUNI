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

export function useStats(from: string, to: string, group: 'day' | 'week' | 'month' = 'day') {
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
          statsApi.summary(from, to),
          statsApi.byCategory(from, to, 'expense'),
          statsApi.timeline(from, to, group),
          statsApi.balanceEvolution(from, to),
        ]);
        setData({ summary, byCategory, timeline, balanceEvolution });
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [from, to, group],
  );

  useEffect(() => {
    fetch();
  }, [fetch, refreshKey]);

  return { ...data, loading, refreshing, error, refetch: fetch };
}
