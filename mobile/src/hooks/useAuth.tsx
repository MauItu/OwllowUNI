import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authApi, setAuthToken, setUnauthorizedHandler } from '../api/client';
import { saveToken, getToken, removeToken } from '../services/auth';
import { loadSettingsForUser } from '../stores/settingsStore';
import { useAppStore } from '../stores/appStore';
import { isPinEnabled } from '../services/security';
import type { User } from '../types';

interface AuthValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /**
   * true cuando el usuario acaba de hacer login/registro y aún NO tiene PIN:
   * dispara el onboarding obligatorio de PIN (SetupPinScreen) antes del Home.
   * Solo se activa en login/registro, NO al restaurar sesión en cold-start.
   */
  needsPinSetup: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  /** Marca el onboarding de PIN como completado (revela el Home). */
  completePinSetup: () => void;
}

const Ctx = createContext<AuthValue | null>(null);

function useProvideAuth(): AuthValue {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsPinSetup, setNeedsPinSetup] = useState(false);

  /**
   * Aplica una sesión nueva (login/registro): cachea el token, carga las
   * preferencias del usuario y, si todavía no hay PIN configurado, dispara el
   * onboarding obligatorio de PIN. NO se usa al restaurar sesión en cold-start.
   */
  const applySession = useCallback(async (token: string, u: User) => {
    setAuthToken(token);
    await saveToken(token);
    await loadSettingsForUser(u.id);
    const hasPin = await isPinEnabled();
    setNeedsPinSetup(!hasPin);
    setUser(u);
  }, []);

  /** Limpia toda la sesión (token, stores) y vuelve al estado deslogueado. */
  const clearSession = useCallback(async () => {
    setAuthToken(null);
    await removeToken();
    setUser(null);
    setNeedsPinSetup(false);
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

  const completePinSetup = useCallback(() => {
    setNeedsPinSetup(false);
  }, []);

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
    needsPinSetup,
    login,
    register,
    logout,
    refreshUser,
    completePinSetup,
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
