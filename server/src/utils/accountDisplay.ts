import { sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

/**
 * Nombre de cuenta a mostrar en historial (transacciones, deudas, plantillas,
 * reglas recurrentes, splits): si la cuenta fue eliminada (is_active=false) se
 * muestra "Cuenta eliminada" en vez del nombre real. NULL si el LEFT JOIN no
 * encontró cuenta (no confundir "sin cuenta" con "cuenta eliminada").
 */
export function accountDisplayName(nameCol: PgColumn, isActiveCol: PgColumn): SQL<string | null> {
  return sql<string | null>`CASE WHEN ${nameCol} IS NULL THEN NULL WHEN ${isActiveCol} THEN ${nameCol} ELSE 'Cuenta eliminada' END`;
}
