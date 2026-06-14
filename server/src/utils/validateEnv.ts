import { config } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

/**
 * Validación de entorno AL ARRANCAR. Se importa primero en `index.ts` (antes que
 * cualquier otra cosa): si falta algo o es inseguro, el proceso muere con un
 * mensaje claro en vez de arrancar en estado roto. Carga el `.env` de la raíz del
 * repo (un nivel arriba de `server/`) y, como fallback, `server/.env`.
 */
config({ path: resolve(process.cwd(), '../.env') });
config();

const envSchema = z.object({
  // Connection string de Neon (obligatoria).
  DATABASE_URL: z.string().url('debe ser una URL de conexión válida'),
  // Secreto de firma del JWT: mínimo 32 chars (un secreto corto es inseguro).
  JWT_SECRET: z
    .string()
    .min(32, 'debe tener al menos 32 caracteres (un secreto corto es inseguro)'),
  // Expiración del JWT, configurable. Formato `ms` (p. ej. '30d', '12h', '3600').
  JWT_EXPIRATION: z.string().default('30d'),
  // Credenciales de Gmail para recuperación de contraseña: opcionales.
  GMAIL_USER: z.string().optional(),
  GMAIL_APP_PASSWORD: z.string().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Configuración de entorno inválida. La API no puede arrancar:\n');
  for (const issue of parsed.error.issues) {
    console.error(`  · ${issue.path.join('.') || '(env)'}: ${issue.message}`);
  }
  console.error('\nRevisa el archivo .env en la raíz del repo y vuelve a intentar.');
  process.exit(1);
}

export const env = parsed.data;

// Recuperación de contraseña requiere AMBAS credenciales de Gmail. Si falta alguna,
// el server arranca igual pero esos endpoints quedan deshabilitados (devuelven 503).
if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) {
  console.warn('⚠️  Recuperación de contraseña deshabilitada: faltan GMAIL_*');
}

/** Expiración del JWT (configurable vía `JWT_EXPIRATION`, default '30d'). */
export const JWT_EXPIRATION = env.JWT_EXPIRATION;
