import { db } from './connection.js';
import { accounts, categories } from './schema.js';

/**
 * Datos por defecto que recibe CADA usuario nuevo: el catálogo de categorías
 * (gastos + ingresos, con subcategorías) y una cuenta "Efectivo". Lo usan el
 * seed (usuario admin) y el registro de nuevos usuarios (`/api/auth/register`).
 */

export type SeedCategory = {
  name: string;
  icon: string;
  color: string;
  children?: { name: string; icon: string }[];
};

export const EXPENSE_CATEGORIES: SeedCategory[] = [
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

export const INCOME_CATEGORIES: SeedCategory[] = [
  { name: 'Salario', icon: 'briefcase', color: '#10B981' },
  { name: 'Freelance', icon: 'laptop', color: '#6C5CE7' },
  { name: 'Inversiones', icon: 'trending-up', color: '#F59E0B' },
  { name: 'Regalos', icon: 'gift', color: '#EC4899' },
  { name: 'Reembolsos', icon: 'rotate-ccw', color: '#3B82F6' },
];

/**
 * Inserta las categorías por defecto de un tipo para un usuario (padres + hijas)
 * en 2 round-trips: primero TODOS los padres en un solo insert, luego TODAS las
 * hijas en otro. Las hijas se enlazan al padre por **clave de negocio (name)** —
 * NO por el orden del RETURNING, que Postgres no garantiza.
 */
async function insertCategoriesOfType(
  userId: number,
  list: SeedCategory[],
  type: 'income' | 'expense',
): Promise<void> {
  // 1) Todos los padres en un solo insert. `sort_order` = posición en la lista.
  const parents = await db
    .insert(categories)
    .values(
      list.map((cat, i) => ({
        userId,
        name: cat.name,
        type,
        icon: cat.icon,
        color: cat.color,
        sortOrder: i,
      })),
    )
    .returning();

  // Mapa name→id de los padres recién creados (el `type` es constante en esta
  // llamada, así que el name basta como clave; no se asume orden del RETURNING).
  const parentIdByName = new Map(parents.map((p) => [p.name, p.id]));

  // 2) Todas las hijas (de todos los padres) en un solo insert.
  const children = list.flatMap((cat) =>
    (cat.children ?? []).map((child, j) => ({
      userId,
      name: child.name,
      type,
      icon: child.icon,
      color: cat.color,
      parentId: parentIdByName.get(cat.name)!,
      sortOrder: j,
    })),
  );
  if (children.length > 0) {
    await db.insert(categories).values(children);
  }
}

/** Crea la cuenta "Efectivo" por defecto para un usuario. */
export async function createDefaultAccount(userId: number): Promise<void> {
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
}

/**
 * Provisiona TODO lo que un usuario recién registrado necesita: las categorías
 * default (gastos + ingresos) y la cuenta "Efectivo". Pensado para un usuario
 * nuevo y vacío (no hace deduplicación).
 */
export async function provisionUserDefaults(userId: number): Promise<void> {
  // Las tres provisiones son independientes (filas distintas) → en paralelo. Con
  // los inserts por lote de arriba quedan ~5 round-trips concurrentes, no ~25 seriales.
  await Promise.all([
    insertCategoriesOfType(userId, EXPENSE_CATEGORIES, 'expense'),
    insertCategoriesOfType(userId, INCOME_CATEGORIES, 'income'),
    createDefaultAccount(userId),
  ]);
}
