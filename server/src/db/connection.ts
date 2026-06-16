import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema.js';
import { env } from '../utils/validateEnv.js';

// `env` (utils/validateEnv) es la única fuente de verdad: carga el .env y valida
// DATABASE_URL al arrancar. Importarlo aquí garantiza esa validación antes de
// abrir la conexión, sin cargar dotenv ni re-chequear process.env por separado.
const sql = neon(env.DATABASE_URL);
export const db = drizzle(sql, { schema });
export { schema };
