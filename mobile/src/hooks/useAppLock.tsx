import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { isPinEnabled, AUTO_LOCK_MS } from '../services/security';

interface AppLockValue {
  /** true cuando ya leímos el estado del PIN desde SecureStore. */
  ready: boolean;
  /** ¿Hay bloqueo por PIN configurado? */
  enabled: boolean;
  /** ¿La app está bloqueada ahora mismo? */
  locked: boolean;
  /** Marca la app como desbloqueada (lo llama la LockScreen al autenticar). */
  unlock: () => void;
  /** Re-lee si hay PIN (tras activar/desactivar en Seguridad). No bloquea en sesión. */
  refresh: () => Promise<void>;
}

const Ctx = createContext<AppLockValue | null>(null);

/**
 * Encapsula el estado de bloqueo + el listener de AppState.
 *  - Bloquea al abrir la app (cold start) si hay PIN.
 *  - Re-bloquea al volver de background SOLO si pasaron > AUTO_LOCK_MS (60s).
 */
function useProvideAppLock(): AppLockValue {
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [locked, setLocked] = useState(false);

  const enabledRef = useRef(false);
  const lockedRef = useRef(false);
  const backgroundAt = useRef<number | null>(null);

  const setLockedBoth = useCallback((v: boolean) => {
    lockedRef.current = v;
    setLocked(v);
  }, []);
  const setEnabledBoth = useCallback((v: boolean) => {
    enabledRef.current = v;
    setEnabled(v);
  }, []);

  // Lectura inicial: si hay PIN, arranca bloqueada.
  useEffect(() => {
    let active = true;
    (async () => {
      const on = await isPinEnabled();
      if (!active) return;
      setEnabledBoth(on);
      setLockedBoth(on);
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, [setEnabledBoth, setLockedBoth]);

  // Auto-lock al volver de background tras > 60s.
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') {
        if (
          enabledRef.current &&
          !lockedRef.current &&
          backgroundAt.current != null &&
          Date.now() - backgroundAt.current > AUTO_LOCK_MS
        ) {
          setLockedBoth(true);
        }
        backgroundAt.current = null;
      } else if (state === 'background' || state === 'inactive') {
        if (backgroundAt.current == null) backgroundAt.current = Date.now();
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [setLockedBoth]);

  const unlock = useCallback(() => {
    backgroundAt.current = null;
    setLockedBoth(false);
  }, [setLockedBoth]);

  const refresh = useCallback(async () => {
    const on = await isPinEnabled();
    setEnabledBoth(on);
    // En sesión: si se desactivó, desbloquea; si se activó, NO bloquea de inmediato.
    if (!on) setLockedBoth(false);
  }, [setEnabledBoth, setLockedBoth]);

  return { ready, enabled, locked, unlock, refresh };
}

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const value = useProvideAppLock();
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Hook del bloqueo por PIN/biometría: estado locked/ready y acciones de desbloqueo. */
export function useAppLock(): AppLockValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppLock debe usarse dentro de <AppLockProvider>');
  return v;
}
