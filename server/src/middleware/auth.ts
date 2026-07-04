import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { ApiError } from './errorHandler.js';
import { env } from '../utils/validateEnv.js';
import { db } from '../db/connection.js';
import { users } from '../db/schema.js';

// `env` (utils/validateEnv) es la única fuente de verdad: carga el .env y valida
// JWT_SECRET (≥32 chars) al arrancar, así que aquí ya es un string seguro.
const SECRET: string = env.JWT_SECRET;

export interface AuthUser {
  id: number;
  email: string;
  isAdmin: boolean;
}

// Tipa req.user en toda la app.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// Algoritmo de firma fijado (secreto simétrico). Anclarlo en firma y verificación
// evita la confusión de algoritmos y rechaza tokens con `alg` distinto (incl. "none").
const JWT_ALGORITHM: jwt.Algorithm = 'HS256';

/**
 * Revocación de sesiones por versión (`users.token_version`). El JWT lleva el
 * claim `v`; al autenticar se compara contra la columna. Cambiar/resetear la
 * contraseña (o borrar la cuenta) incrementa la versión → los tokens viejos
 * devuelven 401. La lectura va con un caché en memoria de 60s por usuario para
 * no pagar un round-trip a la DB en cada request (mismo supuesto de proceso
 * único que `services/cache.ts`); dentro del proceso, `invalidateTokenVersionCache`
 * hace la revocación inmediata.
 */
const TOKEN_VERSION_TTL_MS = 60_000;
const versionCache = new Map<number, { v: number; expiresAt: number }>();

async function currentTokenVersion(userId: number): Promise<number> {
  const hit = versionCache.get(userId);
  if (hit && hit.expiresAt > Date.now()) return hit.v;
  const [row] = await db
    .select({ v: users.tokenVersion })
    .from(users)
    .where(eq(users.id, userId));
  // Usuario inexistente (cuenta borrada) → -1: nunca matchea un claim válido.
  if (!row) return -1;
  versionCache.set(userId, { v: row.v, expiresAt: Date.now() + TOKEN_VERSION_TTL_MS });
  return row.v;
}

/** Invalida el caché de versión de un usuario (revocación inmediata en proceso). */
export function invalidateTokenVersionCache(userId: number): void {
  versionCache.delete(userId);
}

/** Firma un JWT con los datos del usuario (expira según `JWT_EXPIRATION`, default 7d). */
export function signToken(user: AuthUser, tokenVersion: number): string {
  return jwt.sign({ ...user, v: tokenVersion }, SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: env.JWT_EXPIRATION as jwt.SignOptions['expiresIn'],
  });
}

/**
 * Middleware: exige `Authorization: Bearer <token>` válido y con la versión de
 * sesión vigente. Inyecta `req.user = { id, email, isAdmin }`. Responde 401 si
 * falta, es inválido o fue revocado.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new ApiError(401, 'No autorizado: falta el token');
    }
    const token = header.slice('Bearer '.length).trim();
    let payload: jwt.JwtPayload & Partial<AuthUser> & { v?: number };
    try {
      payload = jwt.verify(token, SECRET, {
        algorithms: [JWT_ALGORITHM],
      }) as jwt.JwtPayload & Partial<AuthUser> & { v?: number };
    } catch {
      throw new ApiError(401, 'Token inválido o expirado');
    }
    if (typeof payload.id !== 'number' || typeof payload.email !== 'string') {
      throw new ApiError(401, 'Token inválido');
    }
    // Tokens emitidos antes de la revocación por versión no llevan `v` → 0
    // (compatibles mientras el usuario no haya cambiado la contraseña).
    const claimVersion = typeof payload.v === 'number' ? payload.v : 0;
    if (claimVersion !== (await currentTokenVersion(payload.id))) {
      throw new ApiError(401, 'Sesión revocada. Vuelve a iniciar sesión.');
    }
    req.user = { id: payload.id, email: payload.email, isAdmin: !!payload.isAdmin };
    next();
  } catch (err) {
    next(err instanceof ApiError ? err : new ApiError(401, 'Token inválido o expirado'));
  }
}

/** Helper para obtener el id del usuario autenticado (lanza si falta). */
export function userId(req: Request): number {
  if (!req.user) throw new ApiError(401, 'No autorizado');
  return req.user.id;
}

/** Middleware: exige que el usuario autenticado sea admin (403 si no). */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) throw new ApiError(401, 'No autorizado');
  if (!req.user.isAdmin) throw new ApiError(403, 'Requiere privilegios de administrador');
  next();
}
