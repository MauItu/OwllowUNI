import { useCallback, useEffect, useState } from 'react';
import { splitsApi, getErrorMessage } from '../api/client';
import { useAppStore } from '../stores/appStore';
import type { SplitGroup, SplitsSummary } from '../types';

export function useSplits() {
  const [groups, setGroups] = useState<SplitGroup[]>([]);
  const [summary, setSummary] = useState<SplitsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshKey = useAppStore((s) => s.refreshKey);

  const fetch = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const [rows, sum] = await Promise.all([splitsApi.list(), splitsApi.summary()]);
      setGroups(rows);
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

  return { groups, summary, loading, refreshing, error, refetch: fetch };
}
