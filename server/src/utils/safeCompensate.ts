import { db } from '../db/connection.js';
import { sendAlert } from './alerting.js';

/** Datos para identificar la operación al loguear una compensación fallida. */
export interface CompensationContext {
  /** Endpoint afectado, p. ej. 'POST /api/splits/:groupId/settle'. */
  endpoint: string;
  /** Operación lógica, p. ej. 'settle', 'pay', 'addExpense'. */
  operation: string;
  userId: number;
  /** Id de la entidad principal (grupo, deuda, meta, transacción…), si aplica. */
  entityId?: number;
  /** Id de la transacción de cuenta involucrada, si la hubo. */
  txId?: number;
}

/**
 * Ejecuta un batch de COMPENSACIÓN (rollback manual del patrón saga) de forma
 * TOLERANTE A FALLOS. El driver `neon-http` no tiene transacción interactiva: si
 * un paso posterior de una saga falla, el caller arma el `undoBatch` que revierte
 * lo ya aplicado y lo ejecuta con este helper DENTRO de su `catch`, e
 * inmediatamente después hace `throw err` (el ERROR ORIGINAL que disparó la
 * compensación — nunca el de la compensación).
 *
 * Si la compensación MISMA falla, el estado queda inconsistente y no hay forma
 * automática de arreglarlo: se loguea un mensaje estructurado y explícito
 * ("COMPENSACIÓN FALLIDA — reconciliación manual necesaria") con el contexto y el
 * error, para poder reconciliar a mano. Este helper NUNCA relanza el error de la
 * compensación: no debe pisar el error original que el caller va a propagar.
 */
export async function safeCompensate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  undoBatch: any[],
  context: CompensationContext,
): Promise<void> {
  if (undoBatch.length === 0) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.batch(undoBatch as any);
  } catch (compErr) {
    const e = compErr instanceof Error ? compErr : new Error(String(compErr));
    const detail = {
      endpoint: context.endpoint,
      operation: context.operation,
      userId: context.userId,
      entityId: context.entityId,
      txId: context.txId,
      error: e.message,
    };
    console.error(
      'COMPENSACIÓN FALLIDA — reconciliación manual necesaria',
      JSON.stringify(detail),
      e.stack,
    );
    // Este es EL evento que exige intervención humana (saldo movido sin registro
    // o viceversa): además del log, se notifica al webhook de alertas si existe.
    // `GET /api/admin/reconcile` encuentra el diff resultante.
    sendAlert('COMPENSACIÓN FALLIDA — reconciliación manual necesaria', detail);
  }
}
