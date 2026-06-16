import { budgetsApi } from '../api/client';
import { useResource } from './useResource';
import type { Budget, BudgetsSummary, BudgetHistoryMonth } from '../types';

/**
 * Presupuestos mensuales: lista (con gasto del mes), resumen agregado e
 * historial de cumplimiento. Mismo patrón que useDebts/useSavings.
 */
export function useBudgets(historyMonths = 6) {
  const { data, loading, refreshing, error, refetch } = useResource<
    [Budget[], BudgetsSummary, BudgetHistoryMonth[]]
  >(
    () => Promise.all([budgetsApi.list(), budgetsApi.summary(), budgetsApi.history(historyMonths)]),
    [historyMonths],
  );
  return {
    budgets: data?.[0] ?? [],
    summary: data?.[1] ?? null,
    history: data?.[2] ?? [],
    loading,
    refreshing,
    error,
    refetch,
  };
}
