import { config } from 'dotenv';
import { resolve } from 'node:path';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';

config({ path: resolve(process.cwd(), '../.env') });
config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL no está definida.');
}

async function main() {
  const sql = neon(DATABASE_URL!);
  const db = drizzle(sql);
  console.log('⏳ Aplicando migraciones...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('✅ Migraciones aplicadas correctamente.');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error aplicando migraciones:', err);
  process.exit(1);
});
