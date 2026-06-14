import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { debts } from '../db/schema.js';

/**
 * Construye los statements para abonar `amount` a las deudas automáticas (type
 * 'debt') de una tarjeta de crédito, empezando por las más antiguas (FIFO).
 *
 * El reparto se calcula en memoria a partir del `remaining_amount` actual de cada
 * deuda abierta (lectura previa). Devuelve además los statements de REVERSIÓN, para
 * que el caller pueda compensar si un paso posterior de la saga falla (los `apply`
 * van en el mismo batch atómico que el movimiento de saldo; los `revert` solo se
 * usan en `safeCompensate`). En personal-finance el TOCTOU del reparto es aceptable.
 */
export async function buildFifoCardDebtPayment(
  uid: number,
  cardId: number,
  amount: number,
): Promise<{ apply: unknown[]; revert: unknown[] }> {
  if (amount <= 0) return { apply: [], revert: [] };

  const open = await db
    .select({
      id: debts.id,
      remainingAmount: debts.remainingAmount,
      paidOffAt: debts.paidOffAt,
    })
    .from(debts)
    .where(
      and(
        eq(debts.userId, uid),
        eq(debts.accountId, cardId),
        eq(debts.type, 'debt'),
        eq(debts.isPaidOff, false),
      ),
    )
    .orderBy(asc(debts.startDate), asc(debts.id));

  const apply: unknown[] = [];
  const revert: unknown[] = [];
  let left = amount;
  for (const d of open) {
    if (left <= 0.001) break;
    const rem = Number(d.remainingAmount);
    const pay = Math.min(rem, left);
    if (pay <= 0) continue;
    left -= pay;
    const newRem = Math.max(0, rem - pay);
    const paidOff = newRem <= 0.001;

    apply.push(
      db
        .update(debts)
        .set({
          remainingAmount: newRem.toFixed(2),
          isPaidOff: paidOff,
          paidOffAt: paidOff ? new Date() : d.paidOffAt,
          updatedAt: new Date(),
        })
        .where(and(eq(debts.id, d.id), eq(debts.userId, uid))),
    );
    // Reversión: vuelve a sumar lo abonado y restaura el estado pagado/no pagado.
    revert.push(
      db
        .update(debts)
        .set({
          remainingAmount: sql`${debts.remainingAmount} + ${pay.toFixed(2)}::numeric`,
          isPaidOff: false,
          paidOffAt: d.paidOffAt,
          updatedAt: new Date(),
        })
        .where(and(eq(debts.id, d.id), eq(debts.userId, uid))),
    );
  }
  return { apply, revert };
}
