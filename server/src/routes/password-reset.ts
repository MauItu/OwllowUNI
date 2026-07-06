import { Router } from 'express';
import { and, eq, gt, sql } from 'drizzle-orm';
import { randomBytes, randomInt } from 'node:crypto';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '../db/connection.js';
import { users, passwordResets } from '../db/schema.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { passwordResetLimiter } from '../middleware/rateLimiter.js';
import { BCRYPT_ROUNDS, MIN_PASSWORD_LENGTH } from '../utils/constants.js';
import { invalidateTokenVersionCache } from '../middleware/auth.js';

// Router público (sin JWT): se monta bajo /api/auth junto al authRouter.
export const passwordResetRouter = Router();

const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutos
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hora
const RATE_LIMIT_MAX = 3; // máx. solicitudes por email por hora
const PASSWORD_RESET_ENABLED = false; // Temporal: desactivado mientras no se use Gmail SMTP.

// Mensaje genérico: no revela si el email existe (anti-enumeración).
const GENERIC_MESSAGE = 'Si el email existe, recibirás un código.';

const forgotSchema = z.object({
  email: z.string().trim().toLowerCase().email('Correo inválido').max(255),
});

const verifySchema = z.object({
  email: z.string().trim().toLowerCase().email('Correo inválido').max(255),
  code: z.string().trim().length(6, 'El código debe tener 6 dígitos').regex(/^\d{6}$/, 'Código inválido'),
});

const resetSchema = z.object({
  token: z.string().trim().length(64, 'Token inválido'),
  newPassword: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`)
    .max(200),
});

/** Genera un código numérico de 6 dígitos (000000–999999) con CSPRNG. */
function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function assertPasswordResetEnabled(): void {
  if (!PASSWORD_RESET_ENABLED) {
    throw new ApiError(503, 'Recuperación de contraseña temporalmente deshabilitada.');
  }
}

// POST /api/auth/forgot-password
passwordResetRouter.post(
  '/forgot-password',
  passwordResetLimiter,
  asyncHandler(async (req, res) => {
    const { email } = forgotSchema.parse(req.body);

    assertPasswordResetEnabled();

    const [user] = await db.select().from(users).where(eq(users.email, email));
    // Si el email no existe respondemos 200 igualmente (anti-enumeración).
    if (!user) {
      res.json({ message: GENERIC_MESSAGE });
      return;
    }

    // Rate limit: máx. 3 solicitudes por usuario en la última hora.
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(passwordResets)
      .where(and(eq(passwordResets.userId, user.id), gt(passwordResets.createdAt, since)));
    if (count >= RATE_LIMIT_MAX) {
      throw new ApiError(429, 'Demasiadas solicitudes. Esperá un momento e intentá de nuevo.');
    }

    const code = generateCode();
    const token = randomBytes(32).toString('hex'); // 64 chars hex
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);

    // Invalida cualquier código previo no usado del mismo usuario.
    await db
      .update(passwordResets)
      .set({ used: true })
      .where(and(eq(passwordResets.userId, user.id), eq(passwordResets.used, false)));

    await db.insert(passwordResets).values({ userId: user.id, code, token, expiresAt });

    res.json({ message: GENERIC_MESSAGE });
  }),
);

// POST /api/auth/verify-reset-code
passwordResetRouter.post(
  '/verify-reset-code',
  passwordResetLimiter,
  asyncHandler(async (req, res) => {
    const { email, code } = verifySchema.parse(req.body);

    assertPasswordResetEnabled();

    const [match] = await db
      .select({ token: passwordResets.token })
      .from(passwordResets)
      .innerJoin(users, eq(passwordResets.userId, users.id))
      .where(
        and(
          eq(users.email, email),
          eq(passwordResets.code, code),
          eq(passwordResets.used, false),
          gt(passwordResets.expiresAt, new Date()),
        ),
      );

    if (!match) throw new ApiError(400, 'Código inválido o expirado');

    // No se marca como usado todavía (se marca al cambiar la contraseña).
    res.json({ token: match.token });
  }),
);

// POST /api/auth/reset-password
passwordResetRouter.post(
  '/reset-password',
  passwordResetLimiter,
  asyncHandler(async (req, res) => {
    const { token, newPassword } = resetSchema.parse(req.body);

    assertPasswordResetEnabled();

    const [reset] = await db
      .select()
      .from(passwordResets)
      .where(
        and(
          eq(passwordResets.token, token),
          eq(passwordResets.used, false),
          gt(passwordResets.expiresAt, new Date()),
        ),
      );

    if (!reset) throw new ApiError(400, 'Token inválido o expirado');

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    // Cambio de contraseña + consumo del token de forma atómica (db.batch).
    // El bump de token_version revoca TODAS las sesiones previas (si alguien
    // tenía la contraseña vieja y una sesión abierta, la pierde).
    await db.batch([
      db
        .update(users)
        .set({
          passwordHash,
          tokenVersion: sql`${users.tokenVersion} + 1` as unknown as number,
          updatedAt: new Date(),
        })
        .where(eq(users.id, reset.userId)),
      db.update(passwordResets).set({ used: true }).where(eq(passwordResets.id, reset.id)),
    ] as any);
    invalidateTokenVersionCache(reset.userId);

    res.json({ message: 'Contraseña actualizada' });
  }),
);
