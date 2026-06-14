import rateLimit from 'express-rate-limit';

/**
 * Rate limiting por IP para los endpoints de autenticación (fuerza bruta /
 * abuso de registro). En desarrollo (`NODE_ENV !== 'production'`) los límites son
 * 10x más permisivos para no estorbar en testing.
 *
 * La respuesta 429 usa el shape `{ error }` del resto de la API (el mobile lee
 * `data.error` en `getErrorMessage`).
 */
const isProd = process.env.NODE_ENV === 'production';
const factor = isProd ? 1 : 10;

const DEMASIADOS = { error: 'Demasiados intentos. Intenta de nuevo en unos minutos.' };

// POST /api/auth/login → 5 intentos / 15 min por IP.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5 * factor,
  standardHeaders: true,
  legacyHeaders: false,
  message: DEMASIADOS,
});

// POST /api/auth/register → 3 intentos / hora por IP.
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3 * factor,
  standardHeaders: true,
  legacyHeaders: false,
  message: DEMASIADOS,
});
