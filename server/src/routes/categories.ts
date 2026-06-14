import { Router } from 'express';
import { and, eq, asc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { categories, type Category } from '../db/schema.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { parseId } from '../utils/parseId.js';
import { userId } from '../middleware/auth.js';

export const categoriesRouter = Router();

const categorySchema = z.object({
  name: z.string().min(1).max(80),
  type: z.enum(['income', 'expense']),
  icon: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  parentId: z.number().int().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

type CategoryWithChildren = Category & { children: Category[] };

/** Anida subcategorías dentro de su padre. */
function nest(rows: Category[]): CategoryWithChildren[] {
  const parents = rows
    .filter((c) => c.parentId === null)
    .map((p) => ({ ...p, children: [] as Category[] }));
  const byId = new Map(parents.map((p) => [p.id, p]));
  for (const c of rows) {
    if (c.parentId !== null) {
      const parent = byId.get(c.parentId);
      if (parent) parent.children.push(c);
    }
  }
  return parents;
}

// GET /api/categories — todas, con subcategorías anidadas
categoriesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await db
      .select()
      .from(categories)
      .where(and(eq(categories.userId, userId(req)), eq(categories.isActive, true)))
      .orderBy(asc(categories.sortOrder), asc(categories.id))
      // TODO: paginar con load-more en mobile
      .limit(200);
    res.json(nest(rows));
  }),
);

// GET /api/categories/:type — income | expense
categoriesRouter.get(
  '/:type',
  asyncHandler(async (req, res) => {
    const type = req.params.type;
    if (type !== 'income' && type !== 'expense') {
      throw new ApiError(400, "El tipo debe ser 'income' o 'expense'");
    }
    const rows = await db
      .select()
      .from(categories)
      .where(and(eq(categories.userId, userId(req)), eq(categories.type, type)))
      .orderBy(asc(categories.sortOrder), asc(categories.id))
      // TODO: paginar con load-more en mobile
      .limit(200);
    res.json(nest(rows.filter((r) => r.isActive)));
  }),
);

// POST /api/categories
categoriesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = categorySchema.parse(req.body);
    const [row] = await db
      .insert(categories)
      .values({
        userId: userId(req),
        name: data.name,
        type: data.type,
        icon: data.icon,
        color: data.color,
        parentId: data.parentId ?? null,
        sortOrder: data.sortOrder ?? 0,
      })
      .returning();
    res.status(201).json(row);
  }),
);

// PUT /api/categories/:id
categoriesRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const data = categorySchema.partial().parse(req.body);
    const [row] = await db
      .update(categories)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.icon !== undefined && { icon: data.icon }),
        ...(data.color !== undefined && { color: data.color }),
        ...(data.parentId !== undefined && { parentId: data.parentId }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      })
      .where(and(eq(categories.id, id), eq(categories.userId, userId(req))))
      .returning();
    if (!row) throw new ApiError(404, 'Categoría no encontrada');
    res.json(row);
  }),
);

// DELETE /api/categories/:id — CASCADE subcategorías (definido en el FK)
categoriesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const deleted = await db
      .delete(categories)
      .where(and(eq(categories.id, id), eq(categories.userId, userId(req))))
      .returning();
    if (deleted.length === 0) throw new ApiError(404, 'Categoría no encontrada');
    res.json({ success: true });
  }),
);
