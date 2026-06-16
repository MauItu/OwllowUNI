import { useCallback } from 'react';
import { accountsApi } from '../api/client';
import { useResource } from './useResource';
import type { CreditCardStatement } from '../types';

/**
 * Estados de cuenta (cortes) de una tarjeta de crédito + acciones de pago y
 * generación de corte. El fetch sigue el patrón estándar (useResource: refetch
 * en cambios de refreshKey); encima añade dos acciones que mutan y re-fetchean.
 */
export function useCreditCard(accountId: number, limit = 12) {
  const { data, loading, refreshing, error, refetch } = useResource<CreditCardStatement[]>(
    () => accountsApi.statements(accountId, { limit, offset: 0 }),
    [accountId, limit],
  );

  const payStatement = useCallback(
    async (statementId: number, amount: number, paymentAccountId: number) => {
      const result = await accountsApi.payStatement(accountId, statementId, { amount, paymentAccountId });
      await refetch(true);
      return result;
    },
    [accountId, refetch],
  );

  const generateStatement = useCallback(async () => {
    const result = await accountsApi.generateStatement(accountId);
    await refetch(true);
    return result;
  }, [accountId, refetch]);

  return { statements: data ?? [], loading, refreshing, error, refetch, payStatement, generateStatement };
}
