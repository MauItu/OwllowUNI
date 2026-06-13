import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authApi, setAuthToken, setUnauthorizedHandler } from '../api/client';
import { saveToken, getToken, removeToken } from '../services/auth';
import { loadSettingsForUser } from '../stores/settingsStore';
import { useAppStore } from '../stores/appStore';
import type { User } from '../types';

interface AuthValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

function useProvideAuth(): AuthValue {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /** Aplica una sesión: cachea el token y carga las preferencias del usuario. */
  const applySession = useCallback(async (token: string, u: User) => {
    setAuthToken(token);
    await saveToken(token);
    await loadSettingsForUser(u.id);
    setUser(u);
  }, []);

  /** Limpia toda la sesión (token, stores) y vuelve al estado deslogueado. */
  const clearSession = useCallback(async () => {
    setAuthToken(null);
    await removeToken();
    setUser(null);
    // Limpia el estado en memoria de la app (filtros, plantilla pendiente) y
    // fuerza un refresh para que las pantallas no muestren datos del anterior.
    const appStore = useAppStore.getState();
    appStore.resetFilters();
    appStore.setPendingTemplate(null);
    appStore.triggerRefresh();
    await loadSettingsForUser(null);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const { token, user: u } = await authApi.login({ email, password });
      await applySession(token, u);
    },
    [applySession],
  );

  const register = useCallback(
    async (email: string, password: string, name: string) => {
      const { token, user: u } = await authApi.register({ email, password, name });
      await applySession(token, u);
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    await clearSession();
  }, [clearSession]);

  const refreshUser = useCallback(async () => {
    try {
      const u = await authApi.me();
      await loadSettingsForUser(u.id);
      setUser(u);
    } catch {
      // El interceptor 401 ya limpia el token; aseguramos estado deslogueado.
      await clearSession();
    }
  }, [clearSession]);

  // Al montar: intenta restaurar la sesión desde el token guardado.
  useEffect(() => {
    let active = true;
    (async () => {
      const token = await getToken();
      if (!token) {
        await loadSettingsForUser(null);
        if (active) setIsLoading(false);
        return;
      }
      setAuthToken(token);
      try {
        const u = await authApi.me();
        if (!active) return;
        await loadSettingsForUser(u.id);
        setUser(u);
      } catch {
        await clearSession();
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [clearSession]);

  // El backend respondió 401 (token vencido): cierra sesión en la UI.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    refreshUser,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const value = useProvideAuth();
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return v;
}
