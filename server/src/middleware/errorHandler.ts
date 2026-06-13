import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Envuelve handlers async para que los errores lleguen al errorHandler. */
export function asyncHandler<T extends (req: Request, res: Response, next: NextFunction) => Promise<unknown>>(
  fn: T,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: 'Recurso no encontrado' });
}

/**
 * ¿El error es una violación de UNIQUE de Postgres (SQLSTATE 23505)? El driver
 * neon-http expone el `code` del error de Postgres. Útil para mapear una carrera
 * (check previo + insert) a un 409 en vez de confiar solo en el check.
 */
export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === '23505'
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Datos inválidos',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message });
  }
  // El detalle se loguea en el servidor; al cliente solo un mensaje genérico
  // (no filtrar mensajes internos, p. ej. errores de Postgres).
  console.error('Error no controlado:', err);
  return res.status(500).json({ error: 'Error interno del servidor' });
}
