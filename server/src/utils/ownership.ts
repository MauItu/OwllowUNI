import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { accounts, categories, tags } from '../db/schema.js';
import { ApiError } from '../middleware/errorHandler.js';

/**
 * Guardas de propiedad centralizadas (multiusuario). Antes cada ruta reimplementaba
 * su propia versión de "¿esta cuenta/categoría/etiqueta es del usuario?", con
 * variantes casi idénticas y riesgo de copy-paste incompleto. Aquí viven en un solo
 * sitio para que el contrato (status + mensaje) sea consistente.
 *
 * Convención de status: 404 cuando el recurso se pidió directamente (p. ej. una
 * cuenta por su id en la ruta) y 400 cuando es una FK referenciada en un body
 * (categoría/etiquetas). Las cuentas usadas como FK en un body se mantienen en 404
 * para no cambiar el comportamiento previo de esas rutas; `assertAccountOwned`
 * acepta un override de status/mensaje para los casos que ya devolvían 400.
 *
 * NOTA: `getOwnedGroup` y las verificaciones de miembros de splits son específicas
 * de ese dominio y NO viven aquí a propósito.
 */

/** Cuenta del usuario con los campos que más se consumen en las rutas. */
export interface OwnedAccount {
  id: number;
  type: string;
  currentBalance: string;
  isActive: boolean;
  isFrozen: boolean;
}

interface NotFoundOpts {
  /** Status a lanzar si la cuenta no existe/no es del usuario (default 404). */
  status?: number;
  /** Mensaje a lanzar (default 'Cuenta no encontrada'). */
  message?: string;
}

/**
 * Devuelve la cuenta del usuario (id, type, currentBalance, isActive, isFrozen) o
 * lanza ApiError(404, 'Cuenta no encontrada'). Es la versión que más se usa: las
 * rutas necesitan `type` y `currentBalance` para validar saldo / tipo de cuenta.
 */
export async function getOwnedAccount(
  uid: number,
  accountId: number,
  notFound: NotFoundOpts = {},
): Promise<OwnedAccount> {
  const [acc] = await db
    .select({
      id: accounts.id,
      type: accounts.type,
      currentBalance: accounts.currentBalance,
      isActive: accounts.isActive,
      isFrozen: accounts.isFrozen,
    })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, uid)));
  if (!acc) throw new ApiError(notFound.status ?? 404, notFound.message ?? 'Cuenta no encontrada');
  return acc;
}

/**
 * Variante para FK nullable que NO necesita los datos de vuelta: si `accountId` es
 * null/undefined no hace nada; si viene, valida con `getOwnedAccount`. Acepta un
 * override de status/mensaje (p. ej. templates valida una FK de body con 400).
 */
export async function assertAccountOwned(
  uid: number,
  accountId?: number | null,
  notFound?: NotFoundOpts,
): Promise<void> {
  if (accountId == null) return;
  await getOwnedAccount(uid, accountId, notFound);
}

/**
 * Verifica que TODAS las cuentas (no nulas) del array pertenezcan al usuario con una
 * sola query (inArray + conteo). Lanza 404 si alguna no existe/no es del usuario.
 *
 * NOTA de diseño (Fase 5): solo valida la PROPIEDAD, no `is_active`. Una cuenta
 * desactivada ("fuera de selectores") puede seguir recibiendo transacciones si el
 * cliente ya tiene su id (p. ej. reglas recurrentes ya creadas); desactivar no es un
 * bloqueo duro de operaciones. Congelar una tarjeta SÍ bloquea gastos (ver POST).
 */
export async function assertAccountsOwned(
  uid: number,
  ids: (number | null | undefined)[],
): Promise<void> {
  const unique = [...new Set(ids.filter((id): id is number => id != null))];
  if (unique.length === 0) return;
  const owned = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, uid), inArray(accounts.id, unique)));
  if (owned.length !== unique.length) {
    throw new ApiError(404, 'Cuenta no encontrada');
  }
}

/** Verifica que la categoría (si se envió) sea del usuario. FK de body → 400. */
export async function assertCategoryOwned(
  uid: number,
  categoryId?: number | null,
): Promise<void> {
  if (categoryId == null) return;
  const [cat] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, uid)));
  if (!cat) throw new ApiError(400, 'La categoría no pertenece al usuario');
}

/**
 * Verifica que TODAS las etiquetas referenciadas pertenezcan al usuario (inArray +
 * conteo, deduplicando). Si el array está vacío/undefined no hace nada. FK de body → 400.
 */
export async function assertTagsOwned(uid: number, tagIds?: number[]): Promise<void> {
  if (!tagIds || tagIds.length === 0) return;
  const unique = [...new Set(tagIds)];
  const owned = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.userId, uid), inArray(tags.id, unique)));
  if (owned.length !== unique.length) {
    throw new ApiError(400, 'Una o más etiquetas no pertenecen al usuario');
  }
}
