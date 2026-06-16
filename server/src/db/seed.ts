import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { db } from './connection.js';
import { accounts, categories, users } from './schema.js';
import { eq, and, isNull } from 'drizzle-orm';
import { BCRYPT_ROUNDS } from '../utils/constants.js';
import { env } from '../utils/validateEnv.js';
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  type SeedCategory,
} from './defaults.js';

// ─────────────── Usuario admin por defecto ───────────────
// El email y el nombre son fijos; la CONTRASEÑA nunca se hardcodea (era un hallazgo
// de seguridad: credencial conocida en el repo). Se toma de `ADMIN_PASSWORD` y, si
// no está definida, se genera una aleatoria fuerte que se imprime UNA vez para que
// quede registro. En re-seeds sin `ADMIN_PASSWORD` NO se toca la contraseña ya
// establecida (no pisar una contraseña cambiada desde la app).
const ADMIN_EMAIL = 'mauiturriza@gmail.com';
const ADMIN_NAME = 'Mauricio';

/** Crea (o actualiza el hash de) el usuario admin y devuelve su id. */
async function seedAdminUser(): Promise<number> {
  const envPassword = env.ADMIN_PASSWORD?.trim();
  const [existing] = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL));

  if (existing) {
    // Asegura el rol admin y el nombre. La contraseña SOLO se reescribe si se pasó
    // `ADMIN_PASSWORD` explícitamente (si no, se conserva la actual intacta).
    const set: Partial<typeof users.$inferInsert> = {
      isAdmin: true,
      name: ADMIN_NAME,
      updatedAt: new Date(),
    };
    if (envPassword) set.passwordHash = await bcrypt.hash(envPassword, BCRYPT_ROUNDS);
    await db.update(users).set(set).where(eq(users.id, existing.id));
    console.log(
      `  ✓ Usuario admin: ${ADMIN_EMAIL} (id ${existing.id})` +
        (envPassword ? ' [contraseña actualizada desde ADMIN_PASSWORD]' : ' [contraseña conservada]'),
    );
    return existing.id;
  }

  // Usuario nuevo: necesita una contraseña. Usa la de env o genera una aleatoria.
  const generated = !envPassword;
  const password = envPassword ?? randomBytes(18).toString('base64url');
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const [created] = await db
    .insert(users)
    .values({ email: ADMIN_EMAIL, passwordHash, name: ADMIN_NAME, isAdmin: true })
    .returning();
  console.log(`  ✓ Usuario admin creado: ${ADMIN_EMAIL} (id ${created.id})`);
  if (generated) {
    console.log(
      `  ⚠️  ADMIN_PASSWORD no definida: se generó una contraseña aleatoria.\n` +
        `      Guárdala ahora (no se vuelve a mostrar): ${password}`,
    );
  }
  return created.id;
}

async function seedCategoriesOfType(
  list: SeedCategory[],
  type: 'income' | 'expense',
  userId: number,
) {
  for (let i = 0; i < list.length; i++) {
    const cat = list[i];

    // Evita duplicar si ya existe la categoría padre (de este usuario)
    const existing = await db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.userId, userId),
          eq(categories.name, cat.name),
          eq(categories.type, type),
          isNull(categories.parentId),
        ),
      );

    let parentId: number;
    if (existing.length > 0) {
      parentId = existing[0].id;
    } else {
      const [inserted] = await db
        .insert(categories)
        .values({
          userId,
          name: cat.name,
          type,
          icon: cat.icon,
          color: cat.color,
          sortOrder: i,
        })
        .returning();
      parentId = inserted.id;
      console.log(`  ✓ Categoría: ${cat.name} (${type})`);
    }

    if (cat.children) {
      for (let j = 0; j < cat.children.length; j++) {
        const child = cat.children[j];
        const existingChild = await db
          .select()
          .from(categories)
          .where(
            and(
              eq(categories.userId, userId),
              eq(categories.name, child.name),
              eq(categories.parentId, parentId),
            ),
          );
        if (existingChild.length === 0) {
          await db.insert(categories).values({
            userId,
            name: child.name,
            type,
            icon: child.icon,
            color: cat.color,
            parentId,
            sortOrder: j,
          });
          console.log(`     └ Subcategoría: ${child.name}`);
        }
      }
    }
  }
}

async function seedDefaultAccount(userId: number) {
  const existing = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.name, 'Efectivo')));
  if (existing.length === 0) {
    await db.insert(accounts).values({
      userId,
      name: 'Efectivo',
      type: 'cash',
      currency: 'COP',
      initialBalance: '0',
      currentBalance: '0',
      color: '#10B981',
      icon: 'banknote',
    });
    console.log('  ✓ Cuenta: Efectivo');
  }
}

async function main() {
  console.log('🌱 Insertando datos iniciales...');
  const adminId = await seedAdminUser();
  await seedCategoriesOfType(EXPENSE_CATEGORIES, 'expense', adminId);
  await seedCategoriesOfType(INCOME_CATEGORIES, 'income', adminId);
  await seedDefaultAccount(adminId);
  console.log('✅ Seed completado.');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error en el seed:', err);
  process.exit(1);
});
