import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { reconcileBalances } from '../utils/reconcile.js';
import { parseId } from '../utils/parseId.js';

/**
 * Rutas de administración. Se montan en `index.ts` con `authenticate` +
 * `requireAdmin` (primer uso real de ese guard; el flag `isAdmin` ya viaja en
 * el JWT). Solo lectura por ahora.
 */
export const adminRouter = Router();

// GET /api/admin/reconcile[?userId=N] — reconciliación de saldos de TODAS las
// cuentas (o solo las de un usuario): saldo materializado vs suma del historial.
// `mismatches` > 0 = hay cuentas cuyo saldo no cuadra → revisar logs de
// "COMPENSACIÓN FALLIDA" y reparar a mano.
adminRouter.get(
  '/reconcile',
  asyncHandler(async (req, res) => {
    const userId =
      req.query.userId !== undefined ? parseId(String(req.query.userId)) : undefined;
    const accounts = await reconcileBalances(userId);
    const mismatches = accounts.filter((a) => !a.ok);
    res.json({
      checkedAt: new Date().toISOString(),
      totalAccounts: accounts.length,
      mismatchCount: mismatches.length,
      mismatches,
      accounts,
    });
  }),
);
