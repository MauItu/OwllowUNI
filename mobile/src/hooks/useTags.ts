import { tagsApi } from '../api/client';
import { useResource } from './useResource';
import type { Tag } from '../types';

/** Hook de etiquetas: fetch (con conteo de transacciones) y loading/refetch. */
export function useTags() {
  const { data, loading, refreshing, error, refetch } = useResource<Tag[]>(() => tagsApi.list());
  return { tags: data ?? [], loading, refreshing, error, refetch };
}
