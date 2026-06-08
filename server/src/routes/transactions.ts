import { Router } from 'express';
import { and, eq, gte, lte, desc, ilike, sql, count, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { transactions, accounts, categories, type Transaction } from '../db/schema.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';

export const transactionsRouter = Router();

const txSchema = z.object({
  type: z.enum(['income', 'expense', 'transfer']),
  amount: z.coerce.number().positive(),
  description: z.string().max(255).optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  accountId: z.number().int(),
  toAccountId: z.number().int().optional().nullable(),
  categoryId: z.number().int().optional().nullable(),
  notes: z.string().optional().nullable(),
});

/**
 * Genera los UPDATE de balance para una transacción.
 * sign = 1 aplica el efecto, sign = -1 lo revierte.
 */
function balanceStatements(
  type: string,
  amount: number,
  accountId: number,
  toAccountId: number | null | undefined,
  sign: 1 | -1,
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
      .where(eq(accounts.id, accountId)),
  );

  // Cuenta destino (solo transferencias)
  if (type === 'transfer' && toAccountId) {
    const toDelta = amount * sign;
    stmts.push(
      db
        .update(accounts)
        .set({
          currentBalance: sql`${accounts.currentBalance} + ${toDelta.toFixed(2)}::numeric`,
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, toAccountId)),
    );
  }
  return stmts;
}

// GET /api/transactions — lista con filtros + paginación
transactionsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const {
      account_id,
      category_id,
      type,
      from_date,
      to_date,
      search,
      page = '1',
      limit = '30',
    } = req.query as Record<string, string>;

    const conditions: SQL[] = [];
    if (account_id) conditions.push(eq(transactions.accountId, Number(account_id)));
    if (category_id) conditions.push(eq(transactions.categoryId, Number(category_id)));
    if (type) conditions.push(eq(transactions.type, type));
    if (from_date) conditions.push(gte(transactions.date, from_date));
    if (to_date) conditions.push(lte(transactions.date, to_date));
    if (search) conditions.push(ilike(transactions.description, `%${search}%`));

    const where = conditions.length ? and(...conditions) : undefined;
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));
    const offset = (pageNum - 1) * limitNum;

    const toAccounts = alias(accounts, 'to_accounts');

    const rows = await db
      .select({
        id: transactions.id,
        type: transactions.type,
        amount: transactions.amount,
        description: transactions.description,
        date: transactions.date,
        time: transactions.time,
        accountId: transactions.accountId,
        toAccountId: transactions.toAccountId,
        categoryId: transactions.categoryId,
        notes: transactions.notes,
        createdAt: transactions.createdAt,
        accountName: accounts.name,
        accountColor: accounts.color,
        accountIcon: accounts.icon,
        toAccountName: toAccounts.name,
        categoryName: categories.name,
        categoryColor: categories.color,
        categoryIcon: categories.icon,
      })
      .from(transactions)
      .leftJoin(accounts, eq(transactions.accountId, accounts.id))
      .leftJoin(toAccounts, eq(transactions.toAccountId, toAccounts.id))
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(where)
      .orderBy(desc(transactions.date), desc(transactions.time), desc(transactions.id))
      .limit(limitNum)
      .offset(offset);

    const [{ total }] = await db
      .select({ total: count() })
      .from(transactions)
      .where(where);

    res.json({
      data: rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / limitNum),
      },
    });
  }),
);

// GET /api/transactions/:id
transactionsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [row] = await db.select().from(transactions).where(eq(transactions.id, id));
    if (!row) throw new ApiError(404, 'Transacción no encontrada');
    res.json(row);
  }),
);

// POST /api/transactions — crea + actualiza balances atómicamente
transactionsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const data = txSchema.parse(req.body);
    if (data.type === 'transfer' && !data.toAccountId) {
      throw new ApiError(400, 'Una transferencia requiere cuenta destino (toAccountId)');
    }

    const insertStmt = db
      .insert(transactions)
      .values({
        type: data.type,
        amount: data.amount.toFixed(2),
        description: data.description ?? null,
        date: data.date,
        time: data.time,
        accountId: data.accountId,
        toAccountId: data.type === 'transfer' ? data.toAccountId ?? null : null,
        categoryId: data.categoryId ?? null,
        notes: data.notes ?? null,
      })
      .returning();

    const balance = balanceStatements(data.type, data.amount, data.accountId, data.toAccountId, 1);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = await db.batch([insertStmt, ...balance] as any);
    const created = (results[0] as Transaction[])[0];
    res.status(201).json(created);
  }),
);

// PUT /api/transactions/:id — recalcula balances
transactionsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const data = txSchema.parse(req.body);

    const [old] = await db.select().from(transactions).where(eq(transactions.id, id));
    if (!old) throw new ApiError(404, 'Transacción no encontrada');
    if (data.type === 'transfer' && !data.toAccountId) {
      throw new ApiError(400, 'Una transferencia requiere cuenta destino (toAccountId)');
    }

    // Revierte el efecto anterior y aplica el nuevo.
    const revert = balanceStatements(
      old.type,
      Number(old.amount),
      old.accountId,
      old.toAccountId,
      -1,
    );
    const apply = balanceStatements(data.type, data.amount, data.accountId, data.toAccountId, 1);

    const updateStmt = db
      .update(transactions)
      .set({
        type: data.type,
        amount: data.amount.toFixed(2),
        description: data.description ?? null,
        date: data.date,
        time: data.time,
        accountId: data.accountId,
        toAccountId: data.type === 'transfer' ? data.toAccountId ?? null : null,
        categoryId: data.categoryId ?? null,
        notes: data.notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, id))
      .returning();

    const stmts = [...revert, ...apply, updateStmt];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = await db.batch(stmts as any);
    const updated = (results[results.length - 1] as Transaction[])[0];
    res.json(updated);
  }),
);

// DELETE /api/transactions/:id — recalcula balance
transactionsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [old] = await db.select().from(transactions).where(eq(transactions.id, id));
    if (!old) throw new ApiError(404, 'Transacción no encontrada');

    const revert = balanceStatements(
      old.type,
      Number(old.amount),
      old.accountId,
      old.toAccountId,
      -1,
    );
    const deleteStmt = db.delete(transactions).where(eq(transactions.id, id));

    const stmts = [...revert, deleteStmt];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.batch(stmts as any);
    res.json({ success: true });
  }),
);
