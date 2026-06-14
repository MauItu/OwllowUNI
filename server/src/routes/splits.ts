import { Router } from 'express';
import { eq, desc, asc, and, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/connection.js';
import {
  splitGroups,
  splitMembers,
  splitExpenses,
  splitShares,
  splitSettlements,
  categories,
  accounts,
  transactions,
  type SplitMember,
  type SplitExpense,
  type Transaction,
} from '../db/schema.js';
import { asyncHandler, ApiError, isUniqueViolation } from '../middleware/errorHandler.js';
import { parseId } from '../utils/parseId.js';
import { userId } from '../middleware/auth.js';
import { safeCompensate } from '../utils/safeCompensate.js';
import { cacheResponse, SUMMARY_TTL_MS } from '../services/cache.js';

export const splitsRouter = Router();

/** Hora actual HH:mm:ss para las transacciones generadas automáticamente. */
function nowTime(): string {
  return new Date().toTimeString().slice(0, 8);
}

/** UPDATE de balance relativo para una cuenta (delta ya con signo, scoped por usuario). */
function balanceUpdate(uid: number, accountId: number, delta: number) {
  return db
    .update(accounts)
    .set({
      currentBalance: sql`${accounts.currentBalance} + ${delta.toFixed(2)}::numeric`,
      updatedAt: new Date(),
    })
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, uid)));
}

/** Verifica que el grupo pertenezca al usuario (404 si no). Devuelve el grupo. */
async function getOwnedGroup(uid: number, groupId: number) {
  const [group] = await db
    .select()
    .from(splitGroups)
    .where(and(eq(splitGroups.id, groupId), eq(splitGroups.userId, uid)));
  if (!group) throw new ApiError(404, 'Grupo no encontrado');
  return group;
}

/** Verifica que una cuenta pertenezca al usuario (404 si no). */
async function assertAccountOwned(uid: number, accountId: number): Promise<void> {
  const [acc] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, uid)));
  if (!acc) throw new ApiError(404, 'Cuenta no encontrada');
}

const groupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(255).optional().nullable(),
  icon: z.string().max(50).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  members: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        isMe: z.boolean().optional(),
      }),
    )
    .min(2)
    .optional(),
});

const memberSchema = z.object({
  name: z.string().min(1).max(100),
  isMe: z.boolean().optional(),
});

const expenseSchema = z.object({
  description: z.string().min(1).max(255),
  totalAmount: z.coerce.number().positive(),
  paidByMemberId: z.number().int(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  categoryId: z.number().int().optional().nullable(),
  // Solo válida si el pagador es el miembro "Yo": cuenta de la que salió el dinero.
  accountId: z.number().int().optional().nullable(),
  shares: z
    .array(
      z.object({
        memberId: z.number().int(),
        amount: z.coerce.number().min(0),
      }),
    )
    .min(1),
});

const settleSchema = z.object({
  fromMemberId: z.number().int(),
  toMemberId: z.number().int(),
  amount: z.coerce.number().positive(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  // Cuenta del usuario cuando la liquidación lo involucra.
  accountId: z.number().int().optional().nullable(),
});

/**
 * Balance por miembro a partir de los shares NO liquidados:
 * lo que pagó por otros (crédito) menos lo que le corresponde de
 * gastos pagados por otros (débito). Los self-shares no afectan.
 */
async function computeBalances(groupId: number) {
  const members = await db
    .select()
    .from(splitMembers)
    .where(eq(splitMembers.groupId, groupId))
    .orderBy(asc(splitMembers.id));

  const rows = await db
    .select({
      memberId: splitShares.memberId,
      amount: splitShares.amount,
      paidByMemberId: splitExpenses.paidByMemberId,
    })
    .from(splitShares)
    .innerJoin(splitExpenses, eq(splitShares.expenseId, splitExpenses.id))
    .where(and(eq(splitExpenses.groupId, groupId), eq(splitShares.isSettled, false)));

  const balances = new Map<number, number>(members.map((m) => [m.id, 0]));
  for (const r of rows) {
    if (r.memberId === r.paidByMemberId) continue;
    const amt = Number(r.amount);
    balances.set(r.paidByMemberId, (balances.get(r.paidByMemberId) ?? 0) + amt);
    balances.set(r.memberId, (balances.get(r.memberId) ?? 0) - amt);
  }
  return { members, balances };
}

/**
 * Igual que `computeBalances` pero para VARIOS grupos en **3 queries totales**
 * (grupos + miembros + shares), evitando el N+1 de iterar `computeBalances` por
 * grupo en los listados. Devuelve un mapa groupId → { members, balances }.
 */
async function computeBalancesForGroups(groupIds: number[]) {
  const result = new Map<number, { members: SplitMember[]; balances: Map<number, number> }>();
  if (groupIds.length === 0) return result;

  const members = await db
    .select()
    .from(splitMembers)
    .where(inArray(splitMembers.groupId, groupIds))
    .orderBy(asc(splitMembers.id));

  const rows = await db
    .select({
      groupId: splitExpenses.groupId,
      memberId: splitShares.memberId,
      amount: splitShares.amount,
      paidByMemberId: splitExpenses.paidByMemberId,
    })
    .from(splitShares)
    .innerJoin(splitExpenses, eq(splitShares.expenseId, splitExpenses.id))
    .where(and(inArray(splitExpenses.groupId, groupIds), eq(splitShares.isSettled, false)));

  const membersByGroup = new Map<number, SplitMember[]>();
  for (const m of members) {
    const list = membersByGroup.get(m.groupId);
    if (list) list.push(m);
    else membersByGroup.set(m.groupId, [m]);
  }
  for (const gid of groupIds) {
    const gMembers = membersByGroup.get(gid) ?? [];
    result.set(gid, { members: gMembers, balances: new Map(gMembers.map((m) => [m.id, 0])) });
  }
  for (const r of rows) {
    if (r.memberId === r.paidByMemberId) continue;
    const entry = result.get(r.groupId);
    if (!entry) continue;
    const amt = Number(r.amount);
    entry.balances.set(r.paidByMemberId, (entry.balances.get(r.paidByMemberId) ?? 0) + amt);
    entry.balances.set(r.memberId, (entry.balances.get(r.memberId) ?? 0) - amt);
  }
  return result;
}

/**
 * Simplificación greedy: el mayor deudor le paga al mayor acreedor,
 * repetir hasta saldar. Minimiza el número de transferencias.
 */
function simplifyTransfers(balances: Map<number, number>) {
  const creditors: { id: number; amount: number }[] = [];
  const debtors: { id: number; amount: number }[] = [];
  for (const [id, bal] of balances) {
    const rounded = Math.round(bal * 100) / 100;
    if (rounded > 0.009) creditors.push({ id, amount: rounded });
    else if (rounded < -0.009) debtors.push({ id, amount: -rounded });
  }
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const transfers: { fromMemberId: number; toMemberId: number; amount: number }[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const pay = Math.min(creditors[ci].amount, debtors[di].amount);
    transfers.push({
      fromMemberId: debtors[di].id,
      toMemberId: creditors[ci].id,
      amount: Math.round(pay * 100) / 100,
    });
    creditors[ci].amount -= pay;
    debtors[di].amount -= pay;
    if (creditors[ci].amount < 0.009) ci++;
    if (debtors[di].amount < 0.009) di++;
  }
  return transfers;
}

// GET /api/splits — grupos activos con miembros y mi balance
splitsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const groups = await db
      .select()
      .from(splitGroups)
      .where(and(eq(splitGroups.userId, userId(req)), eq(splitGroups.isActive, true)))
      .orderBy(desc(splitGroups.createdAt));

    const balancesByGroup = await computeBalancesForGroups(groups.map((g) => g.id));
    const result = groups.map((g) => {
      const { members, balances } = balancesByGroup.get(g.id) ?? { members: [], balances: new Map() };
      const me = members.find((m) => m.isMe);
      return {
        ...g,
        members,
        myBalance: me ? Math.round((balances.get(me.id) ?? 0) * 100) / 100 : 0,
      };
    });
    res.json(result);
  }),
);

// GET /api/splits/summary — mis balances en todos los grupos activos
splitsRouter.get(
  '/summary',
  cacheResponse(SUMMARY_TTL_MS),
  asyncHandler(async (req, res) => {
    const groups = await db
      .select()
      .from(splitGroups)
      .where(and(eq(splitGroups.userId, userId(req)), eq(splitGroups.isActive, true)));

    let totalOwedToMe = 0;
    let totalIOwe = 0;
    const perGroup = [];
    const balancesByGroup = await computeBalancesForGroups(groups.map((g) => g.id));
    for (const g of groups) {
      const { members, balances } = balancesByGroup.get(g.id) ?? { members: [], balances: new Map() };
      const me = members.find((m) => m.isMe);
      const myBalance = me ? Math.round((balances.get(me.id) ?? 0) * 100) / 100 : 0;
      if (myBalance > 0) totalOwedToMe += myBalance;
      else totalIOwe += -myBalance;
      perGroup.push({ groupId: g.id, groupName: g.name, myBalance });
    }
    res.json({
      totalOwedToMe: Math.round(totalOwedToMe * 100) / 100,
      totalIOwe: Math.round(totalIOwe * 100) / 100,
      netBalance: Math.round((totalOwedToMe - totalIOwe) * 100) / 100,
      groups: perGroup,
    });
  }),
);

// GET /api/splits/:id — grupo con miembros
splitsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const group = await getOwnedGroup(userId(req), id);

    const members = await db
      .select()
      .from(splitMembers)
      .where(eq(splitMembers.groupId, id))
      .orderBy(asc(splitMembers.id));

    res.json({ ...group, members });
  }),
);

// POST /api/splits — crea el grupo (opcionalmente con sus miembros)
splitsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = groupSchema.parse(req.body);
    if (data.members) {
      const meCount = data.members.filter((m) => m.isMe).length;
      if (meCount !== 1) throw new ApiError(400, 'Exactamente un miembro debe ser "Yo"');
      const names = new Set(data.members.map((m) => m.name.trim().toLowerCase()));
      if (names.size !== data.members.length) {
        throw new ApiError(400, 'Los nombres de los miembros deben ser únicos');
      }
    }

    const [group] = await db
      .insert(splitGroups)
      .values({
        userId: userId(req),
        name: data.name,
        description: data.description ?? null,
        ...(data.icon && { icon: data.icon }),
        ...(data.color && { color: data.color }),
      })
      .returning();

    let members: SplitMember[] = [];
    if (data.members) {
      members = await db
        .insert(splitMembers)
        .values(
          data.members.map((m) => ({
            groupId: group.id,
            name: m.name.trim(),
            isMe: m.isMe ?? false,
          })),
        )
        .returning();
    }
    res.status(201).json({ ...group, members });
  }),
);

// PUT /api/splits/:id
splitsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const data = groupSchema.omit({ members: true }).partial().parse(req.body);
    const [row] = await db
      .update(splitGroups)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.icon !== undefined && { icon: data.icon }),
        ...(data.color !== undefined && { color: data.color }),
        updatedAt: new Date(),
      })
      .where(and(eq(splitGroups.id, id), eq(splitGroups.userId, userId(req))))
      .returning();
    if (!row) throw new ApiError(404, 'Grupo no encontrado');
    res.json(row);
  }),
);

// DELETE /api/splits/:id — cascade en miembros, gastos, shares y liquidaciones;
// además revierte las transacciones de cuenta que el grupo hubiera generado.
splitsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const id = parseId(req.params.id);
    await getOwnedGroup(uid, id);

    // Transacciones generadas por gastos pagados por mí y por liquidaciones.
    const exps = await db
      .select({ transactionId: splitExpenses.transactionId })
      .from(splitExpenses)
      .where(eq(splitExpenses.groupId, id));
    const setts = await db
      .select({ transactionId: splitSettlements.transactionId })
      .from(splitSettlements)
      .where(eq(splitSettlements.groupId, id));
    const txIds = [...exps, ...setts]
      .map((r) => r.transactionId)
      .filter((t): t is number => t != null);
    const txs =
      txIds.length > 0
        ? await db
            .select({
              id: transactions.id,
              type: transactions.type,
              amount: transactions.amount,
              accountId: transactions.accountId,
              toAccountId: transactions.toAccountId,
              toAmount: transactions.toAmount,
            })
            .from(transactions)
            .where(inArray(transactions.id, txIds))
        : [];

    const stmts: unknown[] = [];
    for (const tx of txs) {
      const revert = tx.type === 'income' ? -Number(tx.amount) : Number(tx.amount);
      stmts.push(balanceUpdate(uid, tx.accountId, revert));
    }
    // Borrar el grupo primero (CASCADE borra expenses/settlements que referencian las transacciones)…
    stmts.push(db.delete(splitGroups).where(and(eq(splitGroups.id, id), eq(splitGroups.userId, uid))));
    // …y luego las transacciones, ya sin referencias.
    if (txIds.length > 0) {
      stmts.push(db.delete(transactions).where(inArray(transactions.id, txIds)));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.batch(stmts as any);
    res.json({ success: true });
  }),
);

// POST /api/splits/:groupId/members
splitsRouter.post(
  '/:groupId/members',
  asyncHandler(async (req, res) => {
    const groupId = parseId(req.params.groupId);
    const data = memberSchema.parse(req.body);

    await getOwnedGroup(userId(req), groupId);

    if (data.isMe) {
      const existing = await db
        .select()
        .from(splitMembers)
        .where(and(eq(splitMembers.groupId, groupId), eq(splitMembers.isMe, true)));
      if (existing.length > 0) throw new ApiError(400, 'El grupo ya tiene un miembro "Yo"');
    }

    // El check previo es best-effort; la fuente de verdad son los UNIQUE de la tabla
    // (nombre por grupo, y el índice parcial de un solo "Yo"). Mapeamos la violación
    // (SQLSTATE 23505) a 409 para cubrir la carrera entre el check y el insert.
    try {
      const [row] = await db
        .insert(splitMembers)
        .values({ groupId, name: data.name.trim(), isMe: data.isMe ?? false })
        .returning();
      res.status(201).json(row);
    } catch (err) {
      if (isUniqueViolation(err)) {
        const constraint = (err as { constraint?: string }).constraint ?? '';
        throw new ApiError(
          409,
          constraint.includes('one_me')
            ? 'El grupo ya tiene un miembro "Yo"'
            : 'Ya existe un miembro con ese nombre en el grupo',
        );
      }
      throw err;
    }
  }),
);

// DELETE /api/splits/:groupId/members/:id — solo si no tiene gastos ni shares
splitsRouter.delete(
  '/:groupId/members/:id',
  asyncHandler(async (req, res) => {
    const groupId = parseId(req.params.groupId);
    const id = parseId(req.params.id);

    await getOwnedGroup(userId(req), groupId);

    const [member] = await db
      .select()
      .from(splitMembers)
      .where(and(eq(splitMembers.id, id), eq(splitMembers.groupId, groupId)));
    if (!member) throw new ApiError(404, 'Miembro no encontrado');

    const [paid] = await db
      .select({ id: splitExpenses.id })
      .from(splitExpenses)
      .where(eq(splitExpenses.paidByMemberId, id))
      .limit(1);
    const [share] = await db
      .select({ id: splitShares.id })
      .from(splitShares)
      .where(eq(splitShares.memberId, id))
      .limit(1);
    if (paid || share) {
      throw new ApiError(400, 'No se puede eliminar: el miembro tiene gastos asociados');
    }

    await db.delete(splitMembers).where(eq(splitMembers.id, id));
    res.json({ success: true });
  }),
);

// GET /api/splits/:groupId/expenses — cronológico descendente, con shares
splitsRouter.get(
  '/:groupId/expenses',
  asyncHandler(async (req, res) => {
    const groupId = parseId(req.params.groupId);
    await getOwnedGroup(userId(req), groupId);
    const expenses = await db
      .select({
        id: splitExpenses.id,
        groupId: splitExpenses.groupId,
        description: splitExpenses.description,
        totalAmount: splitExpenses.totalAmount,
        paidByMemberId: splitExpenses.paidByMemberId,
        date: splitExpenses.date,
        accountId: splitExpenses.accountId,
        transactionId: splitExpenses.transactionId,
        categoryId: splitExpenses.categoryId,
        createdAt: splitExpenses.createdAt,
        updatedAt: splitExpenses.updatedAt,
        paidByName: splitMembers.name,
        accountName: accounts.name,
        categoryName: categories.name,
        categoryIcon: categories.icon,
        categoryColor: categories.color,
      })
      .from(splitExpenses)
      .innerJoin(splitMembers, eq(splitExpenses.paidByMemberId, splitMembers.id))
      .leftJoin(categories, eq(splitExpenses.categoryId, categories.id))
      .leftJoin(accounts, eq(splitExpenses.accountId, accounts.id))
      .where(eq(splitExpenses.groupId, groupId))
      .orderBy(desc(splitExpenses.date), desc(splitExpenses.id))
      // Cap defensivo del peor caso (sin cambiar contrato): los más recientes.
      // TODO: paginar con load-more en mobile
      .limit(200);

    const ids = expenses.map((e) => e.id);
    const shares =
      ids.length > 0
        ? await db.select().from(splitShares).where(inArray(splitShares.expenseId, ids))
        : [];

    res.json(
      expenses.map((e) => ({
        ...e,
        shares: shares.filter((s) => s.expenseId === e.id),
      })),
    );
  }),
);

// POST /api/splits/:groupId/expenses — los shares deben sumar el total
splitsRouter.post(
  '/:groupId/expenses',
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const groupId = parseId(req.params.groupId);
    const data = expenseSchema.parse(req.body);

    await getOwnedGroup(uid, groupId);
    const members = await db.select().from(splitMembers).where(eq(splitMembers.groupId, groupId));
    if (members.length === 0) throw new ApiError(404, 'Grupo no encontrado o sin miembros');

    const memberIds = new Set(members.map((m) => m.id));
    if (!memberIds.has(data.paidByMemberId)) {
      throw new ApiError(400, 'El pagador no pertenece al grupo');
    }
    for (const s of data.shares) {
      if (!memberIds.has(s.memberId)) throw new ApiError(400, 'Un share no pertenece al grupo');
    }
    const shareIds = new Set(data.shares.map((s) => s.memberId));
    if (shareIds.size !== data.shares.length) {
      throw new ApiError(400, 'Hay miembros repetidos en la división');
    }
    const sum = data.shares.reduce((acc, s) => acc + s.amount, 0);
    if (Math.abs(sum - data.totalAmount) > 0.01) {
      throw new ApiError(400, 'La división debe sumar el total del gasto');
    }

    // La cuenta solo aplica cuando el gasto lo paga el usuario (miembro is_me).
    const paidByMember = members.find((m) => m.id === data.paidByMemberId);
    if (data.accountId != null && !paidByMember?.isMe) {
      throw new ApiError(400, 'Solo puedes asignar cuenta a gastos pagados por ti');
    }

    // Si pago yo y hay cuenta: registrar el egreso real como transacción.
    let transactionId: number | null = null;
    if (data.accountId != null && paidByMember?.isMe) {
      await assertAccountOwned(uid, data.accountId);
      const insertTx = db
        .insert(transactions)
        .values({
          userId: uid,
          type: 'expense',
          amount: data.totalAmount.toFixed(2),
          description: data.description,
          date: data.date,
          time: nowTime(),
          accountId: data.accountId,
          categoryId: data.categoryId ?? null,
        })
        .returning();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const txRes = await db.batch([insertTx, balanceUpdate(uid, data.accountId, -data.totalAmount)] as any);
      transactionId = (txRes[0] as Transaction[])[0].id;
    }

    // El gasto, sus shares y (si pago yo) la transacción de cuenta forman una saga:
    // neon-http no da transacción interactiva, así que ante un fallo compensamos a
    // mano. El insert del gasto va DENTRO del try para que su propio fallo dispare
    // la reversión de la transacción de cuenta ya creada (no dejar movimiento huérfano).
    let expense: SplitExpense | undefined;
    try {
      const [created] = await db
        .insert(splitExpenses)
        .values({
          groupId,
          description: data.description,
          totalAmount: data.totalAmount.toFixed(2),
          paidByMemberId: data.paidByMemberId,
          date: data.date,
          categoryId: data.categoryId ?? null,
          accountId: data.accountId ?? null,
          transactionId,
        })
        .returning();
      expense = created;

      const shares = await db
        .insert(splitShares)
        .values(
          data.shares
            .filter((s) => s.amount > 0)
            .map((s) => ({
              expenseId: created.id,
              memberId: s.memberId,
              amount: s.amount.toFixed(2),
              // El share del pagador nace liquidado (se pagó a sí mismo)
              isSettled: s.memberId === data.paidByMemberId,
              settledAt: s.memberId === data.paidByMemberId ? new Date() : null,
            })),
        )
        .returning();
      res.status(201).json({ ...created, shares });
    } catch (err) {
      // Compensación: borrar el gasto si llegó a crearse (su CASCADE borra los
      // shares) y revertir la transacción de cuenta para no dejar movimientos
      // huérfanos. Todo en un único batch atómico, tolerante a fallos.
      const undo: unknown[] = [];
      if (expense) undo.push(db.delete(splitExpenses).where(eq(splitExpenses.id, expense.id)));
      if (transactionId != null && data.accountId != null) {
        undo.push(db.delete(transactions).where(eq(transactions.id, transactionId)));
        undo.push(balanceUpdate(uid, data.accountId, data.totalAmount));
      }
      await safeCompensate(undo, {
        endpoint: 'POST /api/splits/:groupId/expenses',
        operation: 'addExpense',
        userId: uid,
        entityId: groupId,
        txId: transactionId ?? undefined,
      });
      throw err;
    }
  }),
);

// GET /api/splits/:groupId/balances — balances por miembro + transferencias simplificadas
splitsRouter.get(
  '/:groupId/balances',
  asyncHandler(async (req, res) => {
    const groupId = parseId(req.params.groupId);
    await getOwnedGroup(userId(req), groupId);

    const { members, balances } = await computeBalances(groupId);
    res.json({
      members: members.map((m) => ({
        ...m,
        balance: Math.round((balances.get(m.id) ?? 0) * 100) / 100,
      })),
      transfers: simplifyTransfers(balances),
    });
  }),
);

// POST /api/splits/:groupId/settle — liquida deuda entre dos miembros.
// Marca shares pendientes (from debe → to pagó) de más antiguo a más reciente;
// si la simplificación redirigió deudas y queda un remanente, se registra como
// gasto "Liquidación" (pagado por from con share único de to) para que los
// balances queden exactos.
splitsRouter.post(
  '/:groupId/settle',
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const groupId = parseId(req.params.groupId);
    const data = settleSchema.parse(req.body);

    await getOwnedGroup(uid, groupId);
    const members = await db.select().from(splitMembers).where(eq(splitMembers.groupId, groupId));
    const from = members.find((m) => m.id === data.fromMemberId);
    const to = members.find((m) => m.id === data.toMemberId);
    if (!from || !to || from.id === to.id) {
      throw new ApiError(400, 'Miembros inválidos para liquidar');
    }

    const pending = await db
      .select({
        id: splitShares.id,
        amount: splitShares.amount,
        date: splitExpenses.date,
      })
      .from(splitShares)
      .innerJoin(splitExpenses, eq(splitShares.expenseId, splitExpenses.id))
      .where(
        and(
          eq(splitExpenses.groupId, groupId),
          eq(splitShares.memberId, from.id),
          eq(splitExpenses.paidByMemberId, to.id),
          eq(splitShares.isSettled, false),
        ),
      )
      .orderBy(asc(splitExpenses.date), asc(splitShares.id));

    let remaining = data.amount;
    const toSettle: number[] = [];
    for (const s of pending) {
      const amt = Number(s.amount);
      if (amt <= remaining + 0.009) {
        toSettle.push(s.id);
        remaining = Math.round((remaining - amt) * 100) / 100;
      }
    }

    // ── Saga en 2 batches. Con neon-http `db.batch` es atómico pero NO hay
    // transacción interactiva: el Batch B depende de los ids generados en el
    // Batch A, así que si B falla compensamos TODO el Batch A a mano. ──
    const settleDate = data.date ?? new Date().toISOString().slice(0, 10);
    const involvesMe = from.isMe || to.isMe;
    // La cuenta solo aplica si la liquidación involucra al usuario (`is_me`).
    const accountId = involvesMe ? data.accountId ?? null : null;
    if (accountId != null) await assertAccountOwned(uid, accountId);

    // El usuario RECIBE (es "to") → income en su cuenta; PAGA (es "from") → expense.
    const meReceives = to.isMe;
    const delta = meReceives ? data.amount : -data.amount;

    // Batch A: marcar shares settled + gasto "Liquidación" (remanente) + tx de
    // cuenta + update de balance. Pedimos `.returning()` de expense.id y tx.id.
    const settledAt = new Date();
    const batchA: unknown[] = [];
    if (toSettle.length > 0) {
      batchA.push(
        db.update(splitShares).set({ isSettled: true, settledAt }).where(inArray(splitShares.id, toSettle)),
      );
    }
    let expenseIdx = -1;
    if (remaining > 0.009) {
      expenseIdx = batchA.length;
      batchA.push(
        db
          .insert(splitExpenses)
          .values({
            groupId,
            description: `Liquidación: ${from.name} → ${to.name}`,
            totalAmount: remaining.toFixed(2),
            paidByMemberId: from.id,
            date: settleDate,
          })
          .returning(),
      );
    }
    let txIdx = -1;
    if (accountId != null) {
      txIdx = batchA.length;
      batchA.push(
        db
          .insert(transactions)
          .values({
            userId: uid,
            type: meReceives ? 'income' : 'expense',
            amount: data.amount.toFixed(2),
            description: meReceives ? `Pago recibido de ${from.name}` : `Pago a ${to.name}`,
            date: settleDate,
            time: nowTime(),
            accountId,
          })
          .returning(),
      );
      batchA.push(balanceUpdate(uid, accountId, delta));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resultsA = batchA.length > 0 ? await db.batch(batchA as any) : [];
    const expenseId = expenseIdx >= 0 ? (resultsA[expenseIdx] as SplitExpense[])[0].id : null;
    const transactionId = txIdx >= 0 ? (resultsA[txIdx] as Transaction[])[0].id : null;

    // Batch B: lo que depende de los ids del Batch A → el share de la Liquidación
    // (usa expense.id) y la fila de settlement (con su transactionId, nunca null
    // cuando hubo movimiento de cuenta).
    const batchB: unknown[] = [];
    if (expenseId != null) {
      batchB.push(
        db.insert(splitShares).values({ expenseId, memberId: to.id, amount: remaining.toFixed(2) }),
      );
    }
    batchB.push(
      db.insert(splitSettlements).values({
        groupId,
        fromMemberId: from.id,
        toMemberId: to.id,
        amount: data.amount.toFixed(2),
        date: settleDate,
        accountId,
        transactionId,
      }),
    );

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.batch(batchB as any);
    } catch (err) {
      // Compensación COMPLETA del Batch A (un solo batch atómico): des-liquidar los
      // shares, borrar el gasto de Liquidación (su CASCADE borra el share si llegó
      // a entrar) y borrar la tx revirtiendo el balance. Así nada queda a medias.
      const undo: unknown[] = [];
      if (toSettle.length > 0) {
        undo.push(
          db
            .update(splitShares)
            .set({ isSettled: false, settledAt: null })
            .where(inArray(splitShares.id, toSettle)),
        );
      }
      if (expenseId != null) {
        undo.push(db.delete(splitExpenses).where(eq(splitExpenses.id, expenseId)));
      }
      if (transactionId != null && accountId != null) {
        undo.push(db.delete(transactions).where(eq(transactions.id, transactionId)));
        undo.push(balanceUpdate(uid, accountId, -delta));
      }
      await safeCompensate(undo, {
        endpoint: 'POST /api/splits/:groupId/settle',
        operation: 'settle',
        userId: uid,
        entityId: groupId,
        txId: transactionId ?? undefined,
      });
      throw err;
    }

    res.json({ success: true, settledShares: toSettle.length });
  }),
);

// GET /api/splits/:groupId/settlements — historial de liquidaciones del grupo
splitsRouter.get(
  '/:groupId/settlements',
  asyncHandler(async (req, res) => {
    const groupId = parseId(req.params.groupId);
    await getOwnedGroup(userId(req), groupId);
    const rows = await db
      .select()
      .from(splitSettlements)
      .where(eq(splitSettlements.groupId, groupId))
      .orderBy(desc(splitSettlements.date), desc(splitSettlements.id))
      // Cap defensivo del peor caso (sin cambiar contrato): las más recientes.
      // TODO: paginar con load-more en mobile
      .limit(200);
    res.json(rows);
  }),
);
