import { recurringApi } from '../api/client';
import { useResource } from './useResource';
import type { RecurringRule } from '../types';

/** Reglas de pagos recurrentes del usuario (mismo patrón que useDebts). */
export function useRecurringRules() {
  const { data, loading, refreshing, error, refetch } = useResource<RecurringRule[]>(() => recurringApi.list());
  return { rules: data ?? [], loading, refreshing, error, refetch };
}
