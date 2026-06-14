import { useCallback, useEffect, useState } from 'react';
import { budgetsApi, getErrorMessage } from '../api/client';
import { useAppStore } from '../stores/appStore';
import type { Budget, BudgetsSummary, BudgetHistoryMonth } from '../types';

/**
 * Presupuestos mensuales: lista (con gasto del mes), resumen agregado e
 * historial de cumplimiento. Mismo patrón que useDebts/useSavings.
 */
export function useBudgets(historyMonths = 6) {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [summary, setSummary] = useState<BudgetsSummary | null>(null);
  const [history, setHistory] = useState<BudgetHistoryMonth[]>([]);
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
        const [rows, sum, hist] = await Promise.all([
          budgetsApi.list(),
          budgetsApi.summary(),
          budgetsApi.history(historyMonths),
        ]);
        setBudgets(rows);
        setSummary(sum);
        setHistory(hist);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [historyMonths],
  );

  useEffect(() => {
    fetch();
  }, [fetch, refreshKey]);

  return { budgets, summary, history, loading, refreshing, error, refetch: fetch };
}
