import { useCallback, useEffect, useState } from 'react';
import { accountsApi, getErrorMessage } from '../api/client';
import { useAppStore } from '../stores/appStore';
import type { Account } from '../types';

export function useAccounts() {
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
      const rows = await accountsApi.list();
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

  const totalBalance = data.reduce((acc, a) => acc + parseFloat(a.currentBalance), 0);

  return { accounts: data, loading, refreshing, error, refetch: fetch, totalBalance };
}
