import { Router } from 'express';
import { eq, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { templates, accounts, categories } from '../db/schema.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';

export const templatesRouter = Router();

const templateSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['income', 'expense']),
  amount: z.coerce.number().positive().optional().nullable(),
  description: z.string().max(255).optional().nullable(),
  accountId: z.number().int().optional().nullable(),
  categoryId: z.number().int().optional().nullable(),
});

// GET /api/templates — orden por use_count DESC
templatesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await db
      .select({
        id: templates.id,
        name: templates.name,
        type: templates.type,
        amount: templates.amount,
        description: templates.description,
        accountId: templates.accountId,
        categoryId: templates.categoryId,
        isActive: templates.isActive,
        useCount: templates.useCount,
        createdAt: templates.createdAt,
        accountName: accounts.name,
        categoryName: categories.name,
        categoryColor: categories.color,
        categoryIcon: categories.icon,
      })
      .from(templates)
      .leftJoin(accounts, eq(templates.accountId, accounts.id))
      .leftJoin(categories, eq(templates.categoryId, categories.id))
      .where(eq(templates.isActive, true))
      .orderBy(desc(templates.useCount), desc(templates.id));
    res.json(rows);
  }),
);

// POST /api/templates
templatesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = templateSchema.parse(req.body);
    const [row] = await db
      .insert(templates)
      .values({
        name: data.name,
        type: data.type,
        amount: data.amount != null ? data.amount.toFixed(2) : null,
        description: data.description ?? null,
        accountId: data.accountId ?? null,
        categoryId: data.categoryId ?? null,
      })
      .returning();
    res.status(201).json(row);
  }),
);

// PUT /api/templates/:id
templatesRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const data = templateSchema.partial().parse(req.body);
    const [row] = await db
      .update(templates)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.amount !== undefined && { amount: data.amount != null ? data.amount.toFixed(2) : null }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.accountId !== undefined && { accountId: data.accountId }),
        ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
      })
      .where(eq(templates.id, id))
      .returning();
    if (!row) throw new ApiError(404, 'Plantilla no encontrada');
    res.json(row);
  }),
);

// POST /api/templates/:id/use — incrementa use_count
templatesRouter.post(
  '/:id/use',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [row] = await db
      .update(templates)
      .set({ useCount: sql`${templates.useCount} + 1` })
      .where(eq(templates.id, id))
      .returning();
    if (!row) throw new ApiError(404, 'Plantilla no encontrada');
    res.json(row);
  }),
);

// DELETE /api/templates/:id
templatesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const deleted = await db.delete(templates).where(eq(templates.id, id)).returning();
    if (deleted.length === 0) throw new ApiError(404, 'Plantilla no encontrada');
    res.json({ success: true });
  }),
);
