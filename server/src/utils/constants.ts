/**
 * Constantes del backend: centraliza números mágicos que estaban repetidos en las
 * rutas, para tener una sola fuente de verdad.
 *
 * Fuera de aquí a propósito:
 *  - `JWT_EXPIRATION` vive en `utils/validateEnv.ts` (es configurable por env).
 *  - El bloqueo con PIN (`AUTO_LOCK_MS`, `PIN_LENGTH`, `MAX_ATTEMPTS`, `LOCKOUT_MS`)
 *    vive en `mobile/src/services/security.ts` (es de cliente).
 */

/** Rondas de bcrypt para hashear contraseñas (`auth.ts`, `password-reset.ts`). */
export const BCRYPT_ROUNDS = 12;

/**
 * Largo mínimo de contraseña, ÚNICO para todos los flujos (registro, cambio en
 * perfil y reset). Antes el reset permitía 6 y el registro 8 (inconsistente).
 */
export const MIN_PASSWORD_LENGTH = 8;

/** Paginación de `GET /api/transactions`: `limit` por defecto y tope máximo. */
export const PAGINATION_DEFAULT_LIMIT = 30;
export const PAGINATION_MAX_LIMIT = 100;

/** Filas por lote en `POST /api/transactions/import` (cada lote es un batch atómico). */
export const IMPORT_BATCH_SIZE = 50;

/**
 * TTLs de caché en SEGUNDOS (fuente canónica). `services/cache.ts` deriva las
 * versiones en ms (`*_TTL_MS = CACHE_TTL_* * 1000`) que consumen `index.ts` y las rutas.
 */
export const CACHE_TTL_STATS = 5 * 60; // 5 min
export const CACHE_TTL_INSIGHTS = 10 * 60; // 10 min
export const CACHE_TTL_SUMMARY = 5 * 60; // 5 min
