import { ApiError } from '../middleware/errorHandler.js';

/**
 * Parsea un id de ruta (`req.params.*`) a entero positivo o lanza `ApiError(400)`.
 * `Number()` a secas acepta basura: `Number('abc')` → NaN, `Number('1.5')` → 1.5,
 * `Number('-1')` → -1. Aquí solo pasan enteros > 0.
 *
 * Acepta el tipo de `req.params.*` de Express 5 (`string | string[]`): cualquier
 * cosa que no sea un único string (array, undefined) es un id inválido → 400.
 */
export function parseId(raw: string | string[] | undefined): number {
  if (typeof raw !== 'string') {
    throw new ApiError(400, 'ID inválido');
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ApiError(400, 'ID inválido');
  }
  return n;
}
