import { useCallback, useEffect, useState } from 'react';
import { accountsApi, getErrorMessage } from '../api/client';
import { useAppStore } from '../stores/appStore';
import type { CreditCardStatement } from '../types';

/**
 * Estados de cuenta (cortes) de una tarjeta de crédito + acciones de pago y
 * generación de corte. Mismo patrón que useDebts: refetch en cambios de
 * refreshKey (appStore).
 */
export function useCreditCard(accountId: number, limit = 12) {
  const [statements, setStatements] = useState<CreditCardStatement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshKey = useAppStore((s) => s.refreshKey);

  const fetchStatements = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);
        const rows = await accountsApi.statements(accountId, { limit, offset: 0 });
        setStatements(rows);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accountId, limit],
  );

  useEffect(() => {
    fetchStatements();
  }, [fetchStatements, refreshKey]);

  const payStatement = useCallback(
    async (statementId: number, amount: number, paymentAccountId: number) => {
      const result = await accountsApi.payStatement(accountId, statementId, { amount, paymentAccountId });
      await fetchStatements(true);
      return result;
    },
    [accountId, fetchStatements],
  );

  const generateStatement = useCallback(async () => {
    const result = await accountsApi.generateStatement(accountId);
    await fetchStatements(true);
    return result;
  }, [accountId, fetchStatements]);

  return { statements, loading, refreshing, error, refetch: fetchStatements, payStatement, generateStatement };
}
