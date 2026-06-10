import { useCallback, useEffect, useState } from 'react';
import { savingsApi, getErrorMessage } from '../api/client';
import { useAppStore } from '../stores/appStore';
import type { SavingsGoal, SavingsSummary } from '../types';

export function useSavings() {
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [summary, setSummary] = useState<SavingsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshKey = useAppStore((s) => s.refreshKey);

  const fetch = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const [rows, sum] = await Promise.all([savingsApi.list(), savingsApi.summary()]);
      setGoals(rows);
      setSummary(sum);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch, refreshKey]);

  return { goals, summary, loading, refreshing, error, refetch: fetch };
}
