import { useMemo } from 'react';
import { accountsApi } from '../api/client';
import { useResource } from './useResource';
import type { Account } from '../types';

/**
 * Hook de cuentas: fetch de cuentas + balance total, con loading/refetch.
 * `includeInactive` (default false) trae también las desactivadas — usar SOLO en la
 * pantalla de lista; los selectores deben usar `useAccounts()` (solo activas).
 */
export function useAccounts(includeInactive = false) {
  const { data, loading, refreshing, error, refetch } = useResource<Account[]>(
    () => accountsApi.list(includeInactive),
    [includeInactive],
  );

  const accounts = useMemo(() => data ?? [], [data]);
  const totalBalance = useMemo(
    () => accounts.reduce((acc, a) => acc + parseFloat(a.currentBalance), 0),
    [accounts],
  );

  return { accounts, loading, refreshing, error, refetch, totalBalance };
}
