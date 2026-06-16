import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { accounts } from '../db/schema.js';
import { ApiError } from '../middleware/errorHandler.js';

export function assertDebitSufficient(
  account: { type: string; currentBalance: string | number },
  amount: number,
) {
  if (account.type === 'credit_card') return;
  if (Number(account.currentBalance) < amount) {
    throw new ApiError(400, 'Saldo insuficiente en la cuenta');
  }
}

/**
 * Genera los UPDATE de balance para una transacción.
 * sign = 1 aplica el efecto, sign = -1 lo revierte.
 *
 * Extraído de `routes/transactions.ts` para reusarlo desde el motor de pagos
 * recurrentes (`services/recurring.ts`) sin duplicar la lógica de saldos.
 * Recuerda que en tarjetas de crédito `current_balance` ES el crédito disponible:
 * un `expense` lo baja (consume crédito) y un `transfer` hacia ella lo sube.
 */
export function balanceStatements(
  uid: number,
  type: string,
  amount: number,
  accountId: number,
  toAccountId: number | null | undefined,
  sign: 1 | -1,
  toAmount?: number | null,
) {
  const stmts = [];
  // Efecto sobre la cuenta origen
  let fromDelta = 0;
  if (type === 'income') fromDelta = amount;
  else if (type === 'expense') fromDelta = -amount;
  else if (type === 'transfer') fromDelta = -amount;
  fromDelta *= sign;

  stmts.push(
    db
      .update(accounts)
      .set({
        currentBalance: sql`${accounts.currentBalance} + ${fromDelta.toFixed(2)}::numeric`,
        updatedAt: new Date(),
      })
      .where(and(eq(accounts.id, accountId), eq(accounts.userId, uid))),
  );

  // Cuenta destino (solo transferencias). Se mueve en SU propia moneda: usa
  // `toAmount` cuando la transferencia cruza monedas (si no, el mismo `amount`).
  if (type === 'transfer' && toAccountId) {
    const toDelta = (toAmount != null ? toAmount : amount) * sign;
    stmts.push(
      db
        .update(accounts)
        .set({
          currentBalance: sql`${accounts.currentBalance} + ${toDelta.toFixed(2)}::numeric`,
          updatedAt: new Date(),
        })
        .where(and(eq(accounts.id, toAccountId), eq(accounts.userId, uid))),
    );
  }
  return stmts;
}
