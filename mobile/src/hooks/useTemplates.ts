import { templatesApi } from '../api/client';
import { useResource } from './useResource';
import type { Template } from '../types';

/** Hook de plantillas: fetch (orden por uso) con loading/refetch. */
export function useTemplates() {
  const { data, loading, refreshing, error, refetch } = useResource<Template[]>(() => templatesApi.list());
  return { templates: data ?? [], loading, refreshing, error, refetch };
}
