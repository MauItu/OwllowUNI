import type { Request, Response, NextFunction } from 'express';
import { CACHE_TTL_STATS, CACHE_TTL_INSIGHTS, CACHE_TTL_SUMMARY } from '../utils/constants.js';

/**
 * Caché en memoria del proceso Express (un solo proceso de larga vida; sin Redis
 * ni infraestructura extra). Mismo espíritu que el cache 24h de exchange_rates,
 * pero para respuestas caras y deterministas (insights, stats, accounts/summary).
 *
 * Invalidación por **sello de versión por usuario**: cada clave incluye
 * `getUserVersion(uid)`; cualquier mutación 2xx del usuario llama
 * `bumpUserVersion(uid)` (vía el middleware `invalidateOnMutation`), de modo que
 * las claves viejas dejan de leerse y expiran solas. Sin invalidación clara, no
 * se cachea: por eso solo se cachean GET y se invalida en TODA mutación del uid.
 */

// TTLs (ms) derivados de los valores canónicos en segundos (utils/constants.ts).
// Insights cambian poco dentro del mismo periodo; stats/summary algo más.
export const INSIGHTS_TTL_MS = CACHE_TTL_INSIGHTS * 1000; // 10 min
export const STATS_TTL_MS = CACHE_TTL_STATS * 1000; // 5 min
export const ACCOUNTS_SUMMARY_TTL_MS = CACHE_TTL_SUMMARY * 1000; // 5 min
// Summaries de debts/savings/splits: agregaciones baratas pero pedidas en cada
// render del Home. Misma ventana que el resto (la versión por usuario las invalida
// ante cualquier mutación, así que el TTL solo acota datos sin tocar).
export const SUMMARY_TTL_MS = CACHE_TTL_SUMMARY * 1000; // 5 min

interface Entry {
  value: unknown;
  expires: number;
}

const store = new Map<string, Entry>();
const userVersion = new Map<number, number>();
const MAX_ENTRIES = 1000;

/** Versión de datos del usuario; cambia en cada mutación para invalidar su caché. */
export function getUserVersion(uid: number): number {
  return userVersion.get(uid) ?? 0;
}

/** Invalida toda la caché del usuario (incrementa su sello de versión). */
export function bumpUserVersion(uid: number): void {
  userVersion.set(uid, getUserVersion(uid) + 1);
}

function sweep(): void {
  const now = Date.now();
  for (const [k, e] of store) if (e.expires <= now) store.delete(k);
}

export function cacheGet<T>(key: string): T | undefined {
  const e = store.get(key);
  if (!e) return undefined;
  if (e.expires <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return e.value as T;
}

export function cacheSet(key: string, value: unknown, ttlMs: number): void {
  if (store.size >= MAX_ENTRIES) {
    sweep();
    if (store.size >= MAX_ENTRIES) store.clear(); // tope duro defensivo
  }
  store.set(key, { value, expires: Date.now() + ttlMs });
}

/** Querystring determinista (claves ordenadas) para construir claves estables. */
function stableQuery(query: Request['query']): string {
  const keys = Object.keys(query).sort();
  return keys.map((k) => `${k}=${String(query[k])}`).join('&');
}

/**
 * Middleware: cachea la respuesta JSON de un GET por `uid + url + querystring +
 * versión del usuario`. Se salta si no hay usuario, no es GET, o trae `refresh`
 * (para que un refresco explícito siempre recompute). Solo cachea respuestas 2xx.
 */
export function cacheResponse(ttlMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const uid = req.user?.id;
    const wantsRefresh = req.query.refresh === 'true' || req.query.refresh === '1';
    if (!uid || req.method !== 'GET' || wantsRefresh) {
      next();
      return;
    }
    const key = `resp:${uid}:${req.baseUrl}${req.path}?${stableQuery(req.query)}:v${getUserVersion(uid)}`;
    const hit = cacheGet<unknown>(key);
    if (hit !== undefined) {
      res.json(hit);
      return;
    }
    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (res.statusCode >= 200 && res.statusCode < 300) cacheSet(key, body, ttlMs);
      return originalJson(body);
    }) as Response['json'];
    next();
  };
}

/**
 * Middleware: tras una mutación (POST/PUT/PATCH/DELETE) que responde 2xx, sube el
 * sello de versión del usuario para invalidar toda su caché. Se engancha a
 * `finish` para invalidar DESPUÉS de que la respuesta (y el commit) se completen.
 */
export function invalidateOnMutation(req: Request, res: Response, next: NextFunction): void {
  const uid = req.user?.id;
  if (uid && req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) bumpUserVersion(uid);
    });
  }
  next();
}
