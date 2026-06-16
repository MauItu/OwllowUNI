import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authApi, recurringApi, setAuthToken, setUnauthorizedHandler } from '../api/client';
import { saveToken, getToken, removeToken } from '../services/auth';
import { loadSettingsForUser } from '../stores/settingsStore';
import { useAppStore } from '../stores/appStore';
import { isPinEnabled } from '../services/security';
import { hasSeenTutorial, markTutorialSeen } from '../services/tutorial';
import { getUserRole } from '../utils/roles';
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
  /**
   * Mensaje de bienvenida épico que se muestra UNA vez tras un login/registro
   * (NO al restaurar sesión en cold-start) para usuarios con rol especial.
   * null = no mostrar. Lo limpia `dismissWelcome` cuando termina la animación.
   */
  welcome: { name: string; role: string } | null;
  /**
   * true cuando el usuario ve la app por primera vez (primer login/registro y
   * aún no ha visto/saltado el tutorial): dispara el GuidedTour de "cómo se usa
   * la app". Como `welcome`, NO se activa al restaurar sesión en cold-start.
   */
  needsTutorial: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  /** Marca el onboarding de PIN como completado (revela el Home). */
  completePinSetup: () => void;
  /** Oculta el mensaje de bienvenida (al terminar su animación). */
  dismissWelcome: () => void;
  /** Marca el tutorial como visto/saltado y lo oculta (no vuelve a aparecer). */
  completeTutorial: () => void;
  /** Relanza el tutorial bajo demanda (p.ej. Más → Cómo usar la app). */
  startTutorial: () => void;
}

const Ctx = createContext<AuthValue | null>(null);

function useProvideAuth(): AuthValue {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsPinSetup, setNeedsPinSetup] = useState(false);
  const [welcome, setWelcome] = useState<{ name: string; role: string } | null>(null);
  const [needsTutorial, setNeedsTutorial] = useState(false);

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
    // Tutorial de "cómo se usa la app" la PRIMERA vez (login/registro). Como la
    // bienvenida, el cold-start no pasa por aquí, así que no se reabre en cada
    // arranque; el flag namespaceado por usuario evita repetirlo.
    setNeedsTutorial(!(await hasSeenTutorial(u.id)));
    // Bienvenida épica SOLO en login/registro (applySession) y solo para usuarios
    // con rol especial. El cold-start NO pasa por aquí, así que no la dispara.
    const role = getUserRole(u.email);
    if (role) setWelcome({ name: u.name, role });
    setUser(u);
  }, []);

  /** Limpia toda la sesión (token, stores) y vuelve al estado deslogueado. */
  const clearSession = useCallback(async () => {
    setAuthToken(null);
    await removeToken();
    setUser(null);
    setNeedsPinSetup(false);
    setWelcome(null);
    setNeedsTutorial(false);
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

  const dismissWelcome = useCallback(() => {
    setWelcome(null);
  }, []);

  const completeTutorial = useCallback(() => {
    setNeedsTutorial(false);
    // Persiste el "ya visto" para el usuario activo (fire-and-forget).
    const id = user?.id;
    if (id != null) markTutorialSeen(id).catch(() => {});
  }, [user?.id]);

  const startTutorial = useCallback(() => {
    setNeedsTutorial(true);
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

  // Al quedar autenticado (login/registro o restauración en cold-start), dispara
  // UNA vez el catch-up de pagos recurrentes en BACKGROUND (Render free puede haber
  // dormido y el cron no corrió). Sin UI bloqueante y silenciando errores: si falla
  // se reintenta al próximo arranque o en el cron horario. Si generó cargos, refresca
  // las pantallas para que aparezcan.
  useEffect(() => {
    if (!user) return;
    let active = true;
    recurringApi
      .catchUp()
      .then((res) => {
        if (active && res.generatedCount > 0) useAppStore.getState().triggerRefresh();
      })
      .catch((err) => {
        // Background, sin UI: el cron horario del server es la red de seguridad.
        // En dev dejamos rastro para no perder de vista errores reales en QA.
        if (__DEV__) console.warn('[recurring] catch-up falló (silenciado):', err?.message ?? err);
      });
    return () => {
      active = false;
    };
  }, [user?.id]);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    needsPinSetup,
    welcome,
    needsTutorial,
    login,
    register,
    logout,
    refreshUser,
    completePinSetup,
    dismissWelcome,
    completeTutorial,
    startTutorial,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const value = useProvideAuth();
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Hook de autenticación: sesión, login/registro/logout y onboarding de PIN. */
export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return v;
}
