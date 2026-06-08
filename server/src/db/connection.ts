import { config } from 'dotenv';
import { resolve } from 'node:path';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema.js';

// Carga el .env de la raíz del repo (un nivel arriba de server/) y, como fallback, server/.env
config({ path: resolve(process.cwd(), '../.env') });
config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL no está definida. Crea un .env en la raíz con la connection string de Neon.');
}

const sql = neon(DATABASE_URL);
export const db = drizzle(sql, { schema });
export { schema };
