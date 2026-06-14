import { useCallback, useEffect, useState } from 'react';
import { categoriesApi, getErrorMessage } from '../api/client';
import { useAppStore } from '../stores/appStore';
import type { Category } from '../types';

/** Hook de categorías (opcionalmente por tipo): fetch con loading/refetch. */
export function useCategories(type?: 'income' | 'expense') {
  const [data, setData] = useState<Category[]>([]);
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
        const rows = type ? await categoriesApi.byType(type) : await categoriesApi.list();
        setData(rows);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [type],
  );

  useEffect(() => {
    fetch();
  }, [fetch, refreshKey]);

  return { categories: data, loading, refreshing, error, refetch: fetch };
}
