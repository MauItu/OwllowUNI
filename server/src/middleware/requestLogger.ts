import type { Request, Response, NextFunction } from 'express';
import { env } from '../utils/validateEnv.js';

/**
 * Logging HTTP mínimo, sin dependencias (nada de morgan/winston). Mide el tiempo
 * de cada request con `Date.now()` y loguea al terminar la respuesta:
 *   [HTTP] GET /api/transactions 200 42ms
 *
 * En producción solo loguea lo relevante (requests lentas >1000ms o con error
 * >=400) para no inundar los logs; en desarrollo loguea todo.
 */
const isProd = env.NODE_ENV === 'production';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    if (isProd && ms <= 1000 && res.statusCode < 400) return;
    console.log(`[HTTP] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });
  next();
}
