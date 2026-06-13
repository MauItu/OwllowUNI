import { Router } from 'express';
import { eq, ne, and, asc, ilike, count } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { tags, transactionTags } from '../db/schema.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { userId } from '../middleware/auth.js';

export const tagsRouter = Router();

const tagSchema = z.object({
  name: z.string().min(1).max(50),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  icon: z.string().max(50).optional(),
});

// GET /api/tags — todas, con count de transacciones asociadas
tagsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await db
      .select({
        id: tags.id,
        name: tags.name,
        color: tags.color,
        icon: tags.icon,
        createdAt: tags.createdAt,
        transactionCount: count(transactionTags.id),
      })
      .from(tags)
      .leftJoin(transactionTags, eq(transactionTags.tagId, tags.id))
      .where(eq(tags.userId, userId(req)))
      .groupBy(tags.id)
      .orderBy(asc(tags.name));
    res.json(rows.map((r) => ({ ...r, transactionCount: Number(r.transactionCount) })));
  }),
);

// POST /api/tags — crear (nombre único, case-insensitive)
tagsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = tagSchema.parse(req.body);
    const [existing] = await db
      .select()
      .from(tags)
      .where(and(eq(tags.userId, userId(req)), ilike(tags.name, data.name)));
    if (existing) throw new ApiError(409, `Ya existe una etiqueta llamada "${existing.name}"`);

    const [row] = await db
      .insert(tags)
      .values({
        userId: userId(req),
        name: data.name.trim(),
        ...(data.color && { color: data.color }),
        ...(data.icon && { icon: data.icon }),
      })
      .returning();
    res.status(201).json(row);
  }),
);

// PUT /api/tags/:id — editar nombre/color/icon
tagsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const data = tagSchema.partial().parse(req.body);

    if (data.name) {
      const [conflict] = await db
        .select()
        .from(tags)
        .where(and(eq(tags.userId, userId(req)), ilike(tags.name, data.name), ne(tags.id, id)));
      if (conflict) throw new ApiError(409, `Ya existe una etiqueta llamada "${conflict.name}"`);
    }

    const [row] = await db
      .update(tags)
      .set({
        ...(data.name !== undefined && { name: data.name.trim() }),
        ...(data.color !== undefined && { color: data.color }),
        ...(data.icon !== undefined && { icon: data.icon }),
      })
      .where(and(eq(tags.id, id), eq(tags.userId, userId(req))))
      .returning();
    if (!row) throw new ApiError(404, 'Etiqueta no encontrada');
    res.json(row);
  }),
);

// DELETE /api/tags/:id — cascade en transaction_tags
tagsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const deleted = await db
      .delete(tags)
      .where(and(eq(tags.id, id), eq(tags.userId, userId(req))))
      .returning();
    if (deleted.length === 0) throw new ApiError(404, 'Etiqueta no encontrada');
    res.json({ success: true });
  }),
);
