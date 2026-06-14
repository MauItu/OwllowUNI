import { useCallback, useEffect, useState } from 'react';
import { templatesApi, getErrorMessage } from '../api/client';
import { useAppStore } from '../stores/appStore';
import type { Template } from '../types';

/** Hook de plantillas: fetch (orden por uso) con loading/refetch. */
export function useTemplates() {
  const [data, setData] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshKey = useAppStore((s) => s.refreshKey);

  const fetch = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const rows = await templatesApi.list();
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

  return { templates: data, loading, refreshing, error, refetch: fetch };
}
