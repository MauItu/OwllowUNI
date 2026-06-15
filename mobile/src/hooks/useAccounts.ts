import { useCallback, useEffect, useMemo, useState } from 'react';
import { accountsApi, getErrorMessage } from '../api/client';
import { useAppStore } from '../stores/appStore';
import type { Account } from '../types';

/**
 * Hook de cuentas: fetch de cuentas + balance total, con loading/refetch.
 * `includeInactive` (default false) trae también las desactivadas — usar SOLO en la
 * pantalla de lista; los selectores deben usar `useAccounts()` (solo activas).
 */
export function useAccounts(includeInactive = false) {
  const [data, setData] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshKey = useAppStore((s) => s.refreshKey);

  const fetch = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const rows = await accountsApi.list(includeInactive);
      setData(rows);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    fetch();
  }, [fetch, refreshKey]);

  const totalBalance = useMemo(
    () => data.reduce((acc, a) => acc + parseFloat(a.currentBalance), 0),
    [data],
  );

  return { accounts: data, loading, refreshing, error, refetch: fetch, totalBalance };
}
