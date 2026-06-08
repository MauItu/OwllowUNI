import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';
import { resolve } from 'node:path';

// El .env vive en la raíz del repo (un nivel arriba de server/)
config({ path: resolve(process.cwd(), '../.env') });
config(); // fallback a server/.env si existe

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL no está definida. Revisa el archivo .env en la raíz.');
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: DATABASE_URL },
  verbose: true,
  strict: true,
});
