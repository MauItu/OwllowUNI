import { useCallback, useEffect, useState } from 'react';
import { insightsApi, getErrorMessage } from '../api/client';
import { useAppStore } from '../stores/appStore';
import type { Insight } from '../types';

export function useInsights() {
  const [data, setData] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshKey = useAppStore((s) => s.refreshKey);

  const fetch = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const rows = await insightsApi.list();
      setData(rows);
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

  return { insights: data, loading, refreshing, error, refetch: fetch };
}
