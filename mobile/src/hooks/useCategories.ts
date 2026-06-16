import { categoriesApi } from '../api/client';
import { useResource } from './useResource';
import type { Category } from '../types';

/** Hook de categorías (opcionalmente por tipo): fetch con loading/refetch. */
export function useCategories(type?: 'income' | 'expense') {
  const { data, loading, refreshing, error, refetch } = useResource<Category[]>(
    () => (type ? categoriesApi.byType(type) : categoriesApi.list()),
    [type],
  );
  return { categories: data ?? [], loading, refreshing, error, refetch };
}
