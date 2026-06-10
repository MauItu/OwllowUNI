import { useCallback, useEffect, useState } from 'react';
import { debtsApi, getErrorMessage } from '../api/client';
import { useAppStore } from '../stores/appStore';
import type { Debt, DebtsSummary } from '../types';

export function useDebts() {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [summary, setSummary] = useState<DebtsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshKey = useAppStore((s) => s.refreshKey);

  const fetch = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const [rows, sum] = await Promise.all([debtsApi.list(), debtsApi.summary()]);
      setDebts(rows);
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

  return { debts, summary, loading, refreshing, error, refetch: fetch };
}
