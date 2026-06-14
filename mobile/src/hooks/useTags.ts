import { useCallback, useEffect, useState } from 'react';
import { tagsApi, getErrorMessage } from '../api/client';
import { useAppStore } from '../stores/appStore';
import type { Tag } from '../types';

/** Hook de etiquetas: fetch (con conteo de transacciones) y loading/refetch. */
export function useTags() {
  const [data, setData] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshKey = useAppStore((s) => s.refreshKey);

  const fetch = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const rows = await tagsApi.list();
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

  return { tags: data, loading, refreshing, error, refetch: fetch };
}
