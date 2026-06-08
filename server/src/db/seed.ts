import { db } from './connection.js';
import { accounts, categories } from './schema.js';
import { eq, and, isNull } from 'drizzle-orm';

type SeedCategory = {
  name: string;
  icon: string;
  color: string;
  children?: { name: string; icon: string }[];
};

// ─────────────── Categorías por defecto ───────────────
const EXPENSE_CATEGORIES: SeedCategory[] = [
  {
    name: 'Alimentación',
    icon: 'utensils',
    color: '#EF4444',
    children: [
      { name: 'Restaurantes', icon: 'chef-hat' },
      { name: 'Mercado', icon: 'shopping-cart' },
      { name: 'Snacks', icon: 'cookie' },
    ],
  },
  {
    name: 'Transporte',
    icon: 'bus',
    color: '#F59E0B',
    children: [
      { name: 'Bus', icon: 'bus-front' },
      { name: 'Taxi', icon: 'car-taxi-front' },
      { name: 'Gasolina', icon: 'fuel' },
    ],
  },
  {
    name: 'Vivienda',
    icon: 'home',
    color: '#6C5CE7',
    children: [
      { name: 'Arriendo', icon: 'key-round' },
      { name: 'Servicios', icon: 'plug-zap' },
      { name: 'Internet', icon: 'wifi' },
    ],
  },
  {
    name: 'Entretenimiento',
    icon: 'party-popper',
    color: '#EC4899',
    children: [
      { name: 'Streaming', icon: 'tv' },
      { name: 'Juegos', icon: 'gamepad-2' },
      { name: 'Salidas', icon: 'beer' },
    ],
  },
  {
    name: 'Salud',
    icon: 'heart-pulse',
    color: '#10B981',
    children: [
      { name: 'Medicamentos', icon: 'pill' },
      { name: 'Consultas', icon: 'stethoscope' },
      { name: 'Gym', icon: 'dumbbell' },
    ],
  },
  {
    name: 'Educación',
    icon: 'graduation-cap',
    color: '#3B82F6',
    children: [
      { name: 'Matrícula', icon: 'school' },
      { name: 'Libros', icon: 'book-open' },
      { name: 'Cursos', icon: 'monitor-play' },
    ],
  },
  { name: 'Ropa', icon: 'shirt', color: '#14B8A6' },
  { name: 'Tecnología', icon: 'smartphone', color: '#8B5CF6' },
];

const INCOME_CATEGORIES: SeedCategory[] = [
  { name: 'Salario', icon: 'briefcase', color: '#10B981' },
  { name: 'Freelance', icon: 'laptop', color: '#6C5CE7' },
  { name: 'Inversiones', icon: 'trending-up', color: '#F59E0B' },
  { name: 'Regalos', icon: 'gift', color: '#EC4899' },
  { name: 'Reembolsos', icon: 'rotate-ccw', color: '#3B82F6' },
];

async function seedCategoriesOfType(
  list: SeedCategory[],
  type: 'income' | 'expense',
) {
  for (let i = 0; i < list.length; i++) {
    const cat = list[i];

    // Evita duplicar si ya existe la categoría padre
    const existing = await db
      .select()
      .from(categories)
      .where(
        and(
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
          .where(and(eq(categories.name, child.name), eq(categories.parentId, parentId)));
        if (existingChild.length === 0) {
          await db.insert(categories).values({
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

async function seedDefaultAccount() {
  const existing = await db.select().from(accounts).where(eq(accounts.name, 'Efectivo'));
  if (existing.length === 0) {
    await db.insert(accounts).values({
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
  await seedCategoriesOfType(EXPENSE_CATEGORIES, 'expense');
  await seedCategoriesOfType(INCOME_CATEGORIES, 'income');
  await seedDefaultAccount();
  console.log('✅ Seed completado.');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error en el seed:', err);
  process.exit(1);
});
