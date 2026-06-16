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
  // Orígenes permitidos para CORS de navegador (lista separada por comas). Opcional:
  // si falta, en prod se niega el cross-origin de navegador y en dev se refleja cualquiera.
  CORS_ORIGINS: z.string().optional(),
  // Contraseña inicial del usuario admin para `db:seed`: opcional (si falta, el seed
  // genera una aleatoria fuerte). NO la usa el runtime de la API, solo el script de seed.
  ADMIN_PASSWORD: z.string().optional(),
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

/**
 * Entorno validado y tipado: ÚNICA fuente de verdad para la configuración del
 * server. Todo el código debe importar `env` de aquí (DATABASE_URL, JWT_SECRET,
 * JWT_EXPIRATION, NODE_ENV, PORT, GMAIL_*, CORS_ORIGINS, ADMIN_PASSWORD) en vez de
 * leer `process.env.*` o cargar dotenv por su cuenta.
 */
export const env = parsed.data;

// Recuperación de contraseña requiere AMBAS credenciales de Gmail. Si falta alguna,
// el server arranca igual pero esos endpoints quedan deshabilitados (devuelven 503).
if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) {
  console.warn('⚠️  Recuperación de contraseña deshabilitada: faltan GMAIL_*');
}
