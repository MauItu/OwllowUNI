import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { exchangeRates } from '../db/schema.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { getRates, setManualRate } from '../services/exchangeRates.js';

export const ratesRouter = Router();

// GET /api/rates?base=COP&targets=USD,EUR,VES[&refresh=true]
// Si no se pasan targets, devuelve las tasas cacheadas para esa base (sin refrescar).
ratesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const base = ((req.query.base as string) || 'COP').toUpperCase();
    const targetsParam = (req.query.targets as string) || '';
    const force = req.query.refresh === 'true' || req.query.refresh === '1';
    const targets = targetsParam
      .split(',')
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);

    if (targets.length === 0) {
      // Sin targets explícitos: devolver lo cacheado para esa base.
      const cached = await db
        .select()
        .from(exchangeRates)
        .where(eq(exchangeRates.baseCurrency, base));
      res.json({
        base,
        rates: cached.map((c) => ({
          base,
          target: c.targetCurrency,
          rate: Number(c.rate),
          stale: false,
          isManual: c.isManual,
          fetchedAt: c.fetchedAt.toISOString(),
        })),
        stale: false,
      });
      return;
    }

    const rates = await getRates(base, targets, force);
    res.json({ base, rates, stale: rates.some((r) => r.stale) });
  }),
);

const manualSchema = z.object({
  base: z.string().length(3),
  target: z.string().length(3),
  rate: z.coerce.number().positive(),
});

// PUT /api/rates/manual — fija una tasa a mano (no se sobreescribe en el refresco automático)
ratesRouter.put(
  '/manual',
  asyncHandler(async (req, res) => {
    const data = manualSchema.parse(req.body);
    if (data.base.toUpperCase() === data.target.toUpperCase()) {
      throw new ApiError(400, 'La moneda base y la destino deben ser distintas');
    }
    const row = await setManualRate(data.base, data.target, data.rate);
    res.json(row);
  }),
);

// DELETE /api/rates/manual?base=COP&target=VES — quita la tasa manual (volverá a refrescarse de la API)
ratesRouter.delete(
  '/manual',
  asyncHandler(async (req, res) => {
    const base = ((req.query.base as string) || '').toUpperCase();
    const target = ((req.query.target as string) || '').toUpperCase();
    if (!base || !target) throw new ApiError(400, 'Faltan base y target');
    await db
      .delete(exchangeRates)
      .where(
        and(
          eq(exchangeRates.baseCurrency, base),
          eq(exchangeRates.targetCurrency, target),
          eq(exchangeRates.isManual, true),
        ),
      );
    res.json({ success: true });
  }),
);
