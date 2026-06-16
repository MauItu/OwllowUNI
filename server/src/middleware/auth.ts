import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { ApiError } from './errorHandler.js';
import { JWT_EXPIRATION } from '../utils/validateEnv.js';

// Asegura que el .env de la raíz esté cargado sin depender del orden de imports.
config({ path: resolve(process.cwd(), '../.env') });
config();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error(
    '❌ JWT_SECRET no está definida en el .env. La API no puede arrancar de forma segura.',
  );
  throw new Error('JWT_SECRET no está definida.');
}
// A partir de aquí JWT_SECRET es string (TS lo estrecha tras el guard).
const SECRET: string = JWT_SECRET;

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

/** Firma un JWT con los datos del usuario (expira según `JWT_EXPIRATION`, default 30d). */
export function signToken(user: AuthUser): string {
  return jwt.sign(user, SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: JWT_EXPIRATION as jwt.SignOptions['expiresIn'],
  });
}

/**
 * Middleware: exige `Authorization: Bearer <token>` válido. Inyecta
 * `req.user = { id, email, isAdmin }`. Responde 401 si falta o es inválido.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new ApiError(401, 'No autorizado: falta el token');
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    const payload = jwt.verify(token, SECRET, {
      algorithms: [JWT_ALGORITHM],
    }) as jwt.JwtPayload & Partial<AuthUser>;
    if (typeof payload.id !== 'number' || typeof payload.email !== 'string') {
      throw new ApiError(401, 'Token inválido');
    }
    req.user = { id: payload.id, email: payload.email, isAdmin: !!payload.isAdmin };
    next();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(401, 'Token inválido o expirado');
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
