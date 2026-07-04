import { sql } from 'drizzle-orm';
import { db } from '../db/connection.js';

/**
 * Reconciliación de saldos: recalcula el saldo ESPERADO de cada cuenta a partir
 * de su historial y lo compara con el `current_balance` materializado. Es la red
 * de seguridad del modelo de saldos acumulados: si una saga quedó a medias (el
 * caso "COMPENSACIÓN FALLIDA" de safeCompensate), aquí aparece el diff.
 *
 * Fórmula (todas las cuentas):
 *   esperado = initial_balance
 *            + Σ income            (account_id = cuenta)
 *            − Σ expense           (account_id = cuenta)
 *            − Σ transfer salientes (account_id = cuenta, por `amount`)
 *            + Σ transfer entrantes (to_account_id = cuenta, por `to_amount ?? amount`)
 *            − Σ depósitos de ahorro financiados por la cuenta   (modelo 0020: mueven saldo sin tx)
 *            + Σ retiros de ahorro devueltos a la cuenta
 *
 * Tarjetas de crédito (modelo 0014: current_balance = crédito disponible) suman
 * además Σ debt_payments de sus deudas automáticas: el abono directo a una deuda
 * de tarjeta restaura el cupo SIN crear transacción en la tarjeta (C7). El abono
 * FIFO de una transferencia hacia la tarjeta NO inserta filas en debt_payments
 * (solo baja `debts.remaining_amount`), así que no hay doble conteo: ese cupo ya
 * entra por la transferencia entrante.
 *
 * NOTA: para tarjetas el chequeo es más débil que para débito — la edición del
 * límite y casos históricos previos a 0014 pueden introducir diffs legítimos.
 * Por eso cada fila lleva `accountType`: un diff en débito es un bug casi seguro;
 * en tarjeta amerita revisión manual antes de alarmar.
 */
export interface AccountReconciliation {
  accountId: number;
  userId: number;
  name: string;
  type: string;
  currentBalance: string;
  expectedBalance: string;
  /** current − expected (0.00 = consistente). */
  diff: string;
  ok: boolean;
}

const TOLERANCE = 0.01;

export async function reconcileBalances(userId?: number): Promise<AccountReconciliation[]> {
  const filter = userId !== undefined ? sql`WHERE a.user_id = ${userId}` : sql``;
  const result = await db.execute(sql`
    SELECT
      a.id,
      a.user_id,
      a.name,
      a.type,
      a.current_balance::numeric(15,2) AS current_balance,
      ROUND((
        a.initial_balance
        + COALESCE((SELECT SUM(t.amount) FROM transactions t
                    WHERE t.account_id = a.id AND t.type = 'income'), 0)
        - COALESCE((SELECT SUM(t.amount) FROM transactions t
                    WHERE t.account_id = a.id AND t.type = 'expense'), 0)
        - COALESCE((SELECT SUM(t.amount) FROM transactions t
                    WHERE t.account_id = a.id AND t.type = 'transfer'), 0)
        + COALESCE((SELECT SUM(COALESCE(t.to_amount, t.amount)) FROM transactions t
                    WHERE t.to_account_id = a.id AND t.type = 'transfer'), 0)
        - COALESCE((SELECT SUM(sc.amount) FROM savings_contributions sc
                    WHERE sc.account_id = a.id AND sc.type = 'deposit'), 0)
        + COALESCE((SELECT SUM(sc.amount) FROM savings_contributions sc
                    WHERE sc.account_id = a.id AND sc.type = 'withdrawal'), 0)
        + CASE WHEN a.type = 'credit_card' THEN
            COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp
                      JOIN debts d ON d.id = dp.debt_id
                      WHERE d.account_id = a.id AND d.type = 'debt' AND d.user_id = a.user_id), 0)
          ELSE 0 END
      )::numeric, 2) AS expected_balance
    FROM accounts a
    ${filter}
    ORDER BY a.user_id, a.id
  `);

  const rows = (result as unknown as { rows: Array<Record<string, unknown>> }).rows;
  return rows.map((r) => {
    const current = Number(r.current_balance);
    const expected = Number(r.expected_balance);
    const diff = current - expected;
    return {
      accountId: Number(r.id),
      userId: Number(r.user_id),
      name: String(r.name),
      type: String(r.type),
      currentBalance: current.toFixed(2),
      expectedBalance: expected.toFixed(2),
      diff: diff.toFixed(2),
      ok: Math.abs(diff) < TOLERANCE,
    };
  });
}
