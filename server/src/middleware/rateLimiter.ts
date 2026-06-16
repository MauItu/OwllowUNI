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

// Flujo de recuperación de contraseña (forgot/verify/reset) → 10 intentos / 15 min
// por IP. Acota la fuerza bruta del código de 6 dígitos en verify-reset-code (junto
// con el TTL de 15 min y el límite por-usuario en forgot-password).
export const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10 * factor,
  standardHeaders: true,
  legacyHeaders: false,
  message: DEMASIADOS,
});

// PUT /api/auth/profile (cambio de contraseña: verifica la actual) → 10 / 15 min por IP.
export const profileLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10 * factor,
  standardHeaders: true,
  legacyHeaders: false,
  message: DEMASIADOS,
});

// Backstop GLOBAL por IP para toda la API: frena abuso/scripted-DoS sin estorbar el
// uso normal de un cliente. Generoso a propósito porque varios usuarios móviles
// pueden compartir IP tras un NAT de operador. Los endpoints sensibles tienen
// además su propio limiter más estricto (login/register/reset/profile).
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isProd ? 1000 : 100_000,
  standardHeaders: true,
  legacyHeaders: false,
  message: DEMASIADOS,
});
