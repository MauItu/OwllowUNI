import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import type { View } from 'react-native';

/**
 * Rectángulo de un elemento en coordenadas de ventana (lo que devuelve
 * `measureInWindow`). El tour lo usa para recortar el foco (spotlight).
 */
export interface TargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** API mínima de una pantalla con scroll para llevar un objetivo a la vista. */
export interface TourScroller {
  /** Desplaza el contenido `dy` px (positivo = hacia abajo). */
  scrollBy: (dy: number) => void;
}

interface TourRegistry {
  /** Registra el nodo medible de un objetivo del tour bajo una clave estable. */
  register: (key: string, ref: React.RefObject<View | null>) => void;
  /** Quita el objetivo (al desmontar la pantalla que lo contiene). */
  unregister: (key: string) => void;
  /**
   * Mide el objetivo `key` en coordenadas de ventana. Devuelve `null` si el nodo
   * no está montado o aún no tiene tamaño (la pantalla puede estar en transición).
   */
  measure: (key: string) => Promise<TargetRect | null>;
  /** Registra el scroller de una pantalla (para auto-scroll a objetivos largos). */
  registerScroller: (key: string, scroller: TourScroller) => void;
  unregisterScroller: (key: string) => void;
  /** Devuelve el scroller registrado o null. */
  getScroller: (key: string) => TourScroller | null;
}

const Ctx = createContext<TourRegistry | null>(null);

/**
 * Provee el registro de objetivos del tour guiado. Las pantallas registran sus
 * elementos "señalables" con `useTourTarget(key)`; el overlay del tour los mide
 * bajo demanda para dibujar el foco sobre el botón/sección real. Vive en la raíz
 * de la app (siempre montado), de modo que el registro persiste aunque el overlay
 * del tour aún no se muestre.
 */
export function TourProvider({ children }: { children: React.ReactNode }) {
  const refs = useRef(new Map<string, React.RefObject<View | null>>());
  const scrollers = useRef(new Map<string, TourScroller>());

  const register = useCallback((key: string, ref: React.RefObject<View | null>) => {
    refs.current.set(key, ref);
  }, []);

  const unregister = useCallback((key: string) => {
    refs.current.delete(key);
  }, []);

  const registerScroller = useCallback((key: string, scroller: TourScroller) => {
    scrollers.current.set(key, scroller);
  }, []);

  const unregisterScroller = useCallback((key: string) => {
    scrollers.current.delete(key);
  }, []);

  const getScroller = useCallback((key: string) => scrollers.current.get(key) ?? null, []);

  const measure = useCallback((key: string): Promise<TargetRect | null> => {
    return new Promise((resolve) => {
      const node = refs.current.get(key)?.current;
      if (!node) {
        resolve(null);
        return;
      }
      node.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) resolve({ x, y, width, height });
        else resolve(null);
      });
    });
  }, []);

  const value = useMemo<TourRegistry>(
    () => ({ register, unregister, measure, registerScroller, unregisterScroller, getScroller }),
    [register, unregister, measure, registerScroller, unregisterScroller, getScroller],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function useTourRegistry(): TourRegistry {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTourTarget/useTourRegistry deben usarse dentro de <TourProvider>');
  return v;
}

export { useTourRegistry };

/**
 * Marca un elemento como objetivo del tour guiado. Devuelve un `ref` que debes
 * pasar al `View`/`Pressable` que quieres resaltar. Si la clave no está en el
 * guion del tour no pasa nada: registrar de más es inofensivo.
 */
export function useTourTarget(key: string): React.RefObject<View | null> {
  const { register, unregister } = useTourRegistry();
  const ref = useRef<View | null>(null);
  useEffect(() => {
    register(key, ref);
    return () => unregister(key);
  }, [key, register, unregister]);
  return ref;
}
