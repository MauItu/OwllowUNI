import { Router } from 'express';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { accounts } from '../db/schema.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { getConversionMap } from '../services/exchangeRates.js';

export const accountsRouter = Router();

const accountSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['bank', 'cash', 'credit_card', 'digital_wallet']),
  currency: z.string().length(3).default('COP'),
  initialBalance: z.coerce.number().default(0),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#4F46E5'),
  icon: z.string().max(50).default('wallet'),
});

// GET /api/accounts — cuentas activas
accountsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await db.select().from(accounts).where(eq(accounts.isActive, true));
    res.json(rows);
  }),
);

// GET /api/accounts/summary?displayCurrency=COP[&refresh=true]
// Balance consolidado convertido a la moneda de visualización (debe ir ANTES de /:id).
accountsRouter.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const displayCurrency = ((req.query.displayCurrency as string) || 'COP').toUpperCase();
    const force = req.query.refresh === 'true' || req.query.refresh === '1';

    const rows = await db
      .select({
        currency: accounts.currency,
        total: sql<string>`COALESCE(SUM(${accounts.currentBalance}), 0)`,
      })
      .from(accounts)
      .where(eq(accounts.isActive, true))
      .groupBy(accounts.currency);

    const { map, stale, oldestFetchedAt } = await getConversionMap(
      displayCurrency,
      rows.map((r) => r.currency),
      force,
    );

    let total = 0;
    const byCurrency = rows.map((r) => {
      const rate = map.get(r.currency.toUpperCase()) ?? 1;
      const converted = Number(r.total) * rate;
      total += converted;
      return { currency: r.currency, total: Number(r.total), converted };
    });

    res.json({
      displayCurrency,
      total,
      byCurrency,
      stale,
      ratesUpdatedAt: oldestFetchedAt,
    });
  }),
);

// GET /api/accounts/:id
accountsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [row] = await db.select().from(accounts).where(eq(accounts.id, id));
    if (!row) throw new ApiError(404, 'Cuenta no encontrada');
    res.json(row);
  }),
);

// POST /api/accounts
accountsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = accountSchema.parse(req.body);
    const [row] = await db
      .insert(accounts)
      .values({
        name: data.name,
        type: data.type,
        currency: data.currency,
        initialBalance: data.initialBalance.toFixed(2),
        currentBalance: data.initialBalance.toFixed(2),
        color: data.color,
        icon: data.icon,
      })
      .returning();
    res.status(201).json(row);
  }),
);

// PUT /api/accounts/:id
accountsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const data = accountSchema.partial().parse(req.body);

    const [existing] = await db.select().from(accounts).where(eq(accounts.id, id));
    if (!existing) throw new ApiError(404, 'Cuenta no encontrada');

    // Si cambia el saldo inicial, ajusta el balance actual por la diferencia.
    let currentBalance = existing.currentBalance;
    if (data.initialBalance !== undefined) {
      const diff = data.initialBalance - Number(existing.initialBalance);
      currentBalance = (Number(existing.currentBalance) + diff).toFixed(2);
    }

    const [row] = await db
      .update(accounts)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.currency !== undefined && { currency: data.currency }),
        ...(data.initialBalance !== undefined && {
          initialBalance: data.initialBalance.toFixed(2),
          currentBalance,
        }),
        ...(data.color !== undefined && { color: data.color }),
        ...(data.icon !== undefined && { icon: data.icon }),
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, id))
      .returning();
    res.json(row);
  }),
);

// DELETE /api/accounts/:id — soft delete
accountsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [row] = await db
      .update(accounts)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(accounts.id, id))
      .returning();
    if (!row) throw new ApiError(404, 'Cuenta no encontrada');
    res.json({ success: true });
  }),
);
