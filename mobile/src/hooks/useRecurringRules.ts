import { useCallback, useEffect, useState } from 'react';
import { recurringApi, getErrorMessage } from '../api/client';
import { useAppStore } from '../stores/appStore';
import type { RecurringRule } from '../types';

/** Reglas de pagos recurrentes del usuario (mismo patrón que useDebts). */
export function useRecurringRules() {
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshKey = useAppStore((s) => s.refreshKey);

  const fetch = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const rows = await recurringApi.list();
      setRules(rows);
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

  return { rules, loading, refreshing, error, refetch: fetch };
}
