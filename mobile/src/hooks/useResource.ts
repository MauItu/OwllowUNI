import { useCallback, useEffect, useState } from 'react';
import { getErrorMessage } from '../api/client';
import { useAppStore } from '../stores/appStore';

export interface Resource<T> {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refetch: (isRefresh?: boolean) => Promise<void>;
}

/**
 * Hook genérico de data-fetching que centraliza el patrón repetido en los ~18
 * hooks de recursos: estado de data/loading/refreshing/error + fetch con
 * try/catch/finally + re-fetch ante cambios de `deps` o del `refreshKey` global
 * (invalidación manual desde useAppStore, igual que hacían todos los hooks).
 *
 * - `fetcher`: función que trae los datos (un fetch o varios con Promise.all).
 * - `deps`: dependencias que, al cambiar, recrean el fetcher y disparan re-fetch.
 *
 * `refetch(true)` marca refresh (setRefreshing) en vez de carga inicial
 * (setLoading), para distinguir pull-to-refresh del primer render.
 *
 * Los hooks concretos envuelven esto y exponen su propia interfaz pública
 * (renombrando `data`, derivando memos, etc.) para no romper los screens.
 */
export function useResource<T>(fetcher: () => Promise<T>, deps: unknown[] = []): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshKey = useAppStore((s) => s.refreshKey);

  const load = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);
        setData(await fetcher());
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    // El fetcher se recrea según `deps` (mismo contrato que tenían los hooks).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps,
  );

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return { data, loading, refreshing, error, refetch: load };
}
