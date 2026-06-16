import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { env } from '../utils/validateEnv.js';

async function main() {
  const sql = neon(env.DATABASE_URL);
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
