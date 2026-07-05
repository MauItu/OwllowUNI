import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { styleVoteApi } from '../api/client';
import { useAuth } from './useAuth';
import type { StyleVoteChoice, StyleVoteState } from '../types';

/**
 * Estado global de la votación A/B del estilo. Un solo fetch por sesión
 * autenticada, compartido por el banner de Home y la pantalla de votación
 * (así votar en un lado actualiza el otro). `dismissed` es de SESIÓN (no se
 * persiste): el banner se oculta al descartarlo pero reaparece en el próximo
 * arranque mientras el usuario no haya votado.
 */
interface StyleVoteValue {
  loading: boolean;
  myVote: StyleVoteChoice | null;
  tallies: StyleVoteState['tallies'];
  total: number;
  /** true si hay que mostrar el banner: no votó y no lo descartó esta sesión. */
  showBanner: boolean;
  dismissBanner: () => void;
  vote: (choice: StyleVoteChoice) => Promise<void>;
  refetch: () => Promise<void>;
}

const EMPTY_TALLIES: StyleVoteState['tallies'] = { professional: 0, indigo: 0 };
const Ctx = createContext<StyleVoteValue | null>(null);

export function StyleVoteProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const [state, setState] = useState<StyleVoteState | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  const refetch = useCallback(async () => {
    try {
      const s = await styleVoteApi.get();
      setState(s);
    } catch {
      // Silencioso: la votación es una feature secundaria; si falla, no molesta.
      setState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Carga al autenticarse; limpia al cerrar sesión (para el próximo usuario).
  useEffect(() => {
    if (!isAuthenticated) {
      setState(null);
      setLoading(false);
      setDismissed(false);
      return;
    }
    setLoading(true);
    refetch();
  }, [isAuthenticated, refetch]);

  const vote = useCallback(async (choice: StyleVoteChoice) => {
    const s = await styleVoteApi.cast(choice);
    setState(s);
  }, []);

  const value: StyleVoteValue = {
    loading,
    myVote: state?.myVote ?? null,
    tallies: state?.tallies ?? EMPTY_TALLIES,
    total: state?.total ?? 0,
    showBanner:
      isAuthenticated &&
      user?.isAdmin !== true &&
      !loading &&
      state != null &&
      state.myVote == null &&
      !dismissed,
    dismissBanner: () => setDismissed(true),
    vote,
    refetch,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStyleVote(): StyleVoteValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStyleVote debe usarse dentro de <StyleVoteProvider>');
  return ctx;
}
