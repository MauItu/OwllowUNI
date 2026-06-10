import { Router } from 'express';
import { eq, desc, asc, and, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/connection.js';
import {
  splitGroups,
  splitMembers,
  splitExpenses,
  splitShares,
  categories,
  type SplitMember,
} from '../db/schema.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';

export const splitsRouter = Router();

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
  asyncHandler(async (_req, res) => {
    const groups = await db
      .select()
      .from(splitGroups)
      .where(eq(splitGroups.isActive, true))
      .orderBy(desc(splitGroups.createdAt));

    const result = [];
    for (const g of groups) {
      const { members, balances } = await computeBalances(g.id);
      const me = members.find((m) => m.isMe);
      result.push({
        ...g,
        members,
        myBalance: me ? Math.round((balances.get(me.id) ?? 0) * 100) / 100 : 0,
      });
    }
    res.json(result);
  }),
);

// GET /api/splits/summary — mis balances en todos los grupos activos
splitsRouter.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    const groups = await db.select().from(splitGroups).where(eq(splitGroups.isActive, true));

    let totalOwedToMe = 0;
    let totalIOwe = 0;
    const perGroup = [];
    for (const g of groups) {
      const { members, balances } = await computeBalances(g.id);
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
    const id = Number(req.params.id);
    const [group] = await db.select().from(splitGroups).where(eq(splitGroups.id, id));
    if (!group) throw new ApiError(404, 'Grupo no encontrado');

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
    const id = Number(req.params.id);
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
      .where(eq(splitGroups.id, id))
      .returning();
    if (!row) throw new ApiError(404, 'Grupo no encontrado');
    res.json(row);
  }),
);

// DELETE /api/splits/:id — cascade en miembros, gastos y shares
splitsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const deleted = await db.delete(splitGroups).where(eq(splitGroups.id, id)).returning();
    if (deleted.length === 0) throw new ApiError(404, 'Grupo no encontrado');
    res.json({ success: true });
  }),
);

// POST /api/splits/:groupId/members
splitsRouter.post(
  '/:groupId/members',
  asyncHandler(async (req, res) => {
    const groupId = Number(req.params.groupId);
    const data = memberSchema.parse(req.body);

    const [group] = await db.select().from(splitGroups).where(eq(splitGroups.id, groupId));
    if (!group) throw new ApiError(404, 'Grupo no encontrado');

    if (data.isMe) {
      const existing = await db
        .select()
        .from(splitMembers)
        .where(and(eq(splitMembers.groupId, groupId), eq(splitMembers.isMe, true)));
      if (existing.length > 0) throw new ApiError(400, 'El grupo ya tiene un miembro "Yo"');
    }

    const [row] = await db
      .insert(splitMembers)
      .values({ groupId, name: data.name.trim(), isMe: data.isMe ?? false })
      .returning();
    res.status(201).json(row);
  }),
);

// DELETE /api/splits/:groupId/members/:id — solo si no tiene gastos ni shares
splitsRouter.delete(
  '/:groupId/members/:id',
  asyncHandler(async (req, res) => {
    const groupId = Number(req.params.groupId);
    const id = Number(req.params.id);

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
    const groupId = Number(req.params.groupId);
    const expenses = await db
      .select({
        id: splitExpenses.id,
        groupId: splitExpenses.groupId,
        description: splitExpenses.description,
        totalAmount: splitExpenses.totalAmount,
        paidByMemberId: splitExpenses.paidByMemberId,
        date: splitExpenses.date,
        transactionId: splitExpenses.transactionId,
        categoryId: splitExpenses.categoryId,
        createdAt: splitExpenses.createdAt,
        updatedAt: splitExpenses.updatedAt,
        paidByName: splitMembers.name,
        categoryName: categories.name,
        categoryIcon: categories.icon,
        categoryColor: categories.color,
      })
      .from(splitExpenses)
      .innerJoin(splitMembers, eq(splitExpenses.paidByMemberId, splitMembers.id))
      .leftJoin(categories, eq(splitExpenses.categoryId, categories.id))
      .where(eq(splitExpenses.groupId, groupId))
      .orderBy(desc(splitExpenses.date), desc(splitExpenses.id));

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
    const groupId = Number(req.params.groupId);
    const data = expenseSchema.parse(req.body);

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

    const [expense] = await db
      .insert(splitExpenses)
      .values({
        groupId,
        description: data.description,
        totalAmount: data.totalAmount.toFixed(2),
        paidByMemberId: data.paidByMemberId,
        date: data.date,
        categoryId: data.categoryId ?? null,
      })
      .returning();

    try {
      const shares = await db
        .insert(splitShares)
        .values(
          data.shares
            .filter((s) => s.amount > 0)
            .map((s) => ({
              expenseId: expense.id,
              memberId: s.memberId,
              amount: s.amount.toFixed(2),
              // El share del pagador nace liquidado (se pagó a sí mismo)
              isSettled: s.memberId === data.paidByMemberId,
              settledAt: s.memberId === data.paidByMemberId ? new Date() : null,
            })),
        )
        .returning();
      res.status(201).json({ ...expense, shares });
    } catch (err) {
      // Compensación: si fallan los shares, no dejar el gasto huérfano
      await db.delete(splitExpenses).where(eq(splitExpenses.id, expense.id));
      throw err;
    }
  }),
);

// GET /api/splits/:groupId/balances — balances por miembro + transferencias simplificadas
splitsRouter.get(
  '/:groupId/balances',
  asyncHandler(async (req, res) => {
    const groupId = Number(req.params.groupId);
    const [group] = await db.select().from(splitGroups).where(eq(splitGroups.id, groupId));
    if (!group) throw new ApiError(404, 'Grupo no encontrado');

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
    const groupId = Number(req.params.groupId);
    const data = settleSchema.parse(req.body);

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

    if (toSettle.length > 0) {
      await db
        .update(splitShares)
        .set({ isSettled: true, settledAt: new Date() })
        .where(inArray(splitShares.id, toSettle));
    }

    if (remaining > 0.009) {
      const [expense] = await db
        .insert(splitExpenses)
        .values({
          groupId,
          description: `Liquidación: ${from.name} → ${to.name}`,
          totalAmount: remaining.toFixed(2),
          paidByMemberId: from.id,
          date: data.date ?? new Date().toISOString().slice(0, 10),
        })
        .returning();
      await db.insert(splitShares).values({
        expenseId: expense.id,
        memberId: to.id,
        amount: remaining.toFixed(2),
      });
    }

    res.json({ success: true, settledShares: toSettle.length });
  }),
);
