import { Router } from 'express';
import { and, asc, eq, gte, lte, desc, ilike, sql, count, inArray, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { transactions, accounts, categories, tags, transactionTags, type Transaction } from '../db/schema.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';

export const transactionsRouter = Router();

// Etiquetas de tipo en español (export) y su mapeo inverso (import, case-insensitive).
const TYPE_LABELS: Record<string, string> = {
  income: 'Ingreso',
  expense: 'Gasto',
  transfer: 'Transferencia',
};
const TYPE_FROM_LABEL: Record<string, 'income' | 'expense' | 'transfer'> = {
  ingreso: 'income',
  income: 'income',
  gasto: 'expense',
  expense: 'expense',
  transferencia: 'transfer',
  transfer: 'transfer',
};

/** Columnas del CSV (mismo orden en export e import). */
const CSV_HEADERS = [
  'fecha',
  'hora',
  'tipo',
  'monto',
  'descripción',
  'cuenta',
  'cuenta destino',
  'categoría',
  'subcategoría',
  'etiquetas',
  'notas',
] as const;

/** Escapa un valor para CSV: comillas dobles si contiene coma, comilla o salto de línea. */
function csvEscape(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Forma normalizada de una transacción (export JSON e import comparten este shape). */
interface NormalizedRow {
  date: string;
  time: string;
  type: 'income' | 'expense' | 'transfer';
  amount: string;
  description: string;
  account: string;
  toAccount: string;
  category: string;
  subcategory: string;
  tags: string;
  notes: string;
}

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
  tagIds: z.array(z.number().int()).optional(),
});

/** Busca las etiquetas de un conjunto de transacciones y las agrupa por id. */
async function tagsByTransaction(txIds: number[]) {
  const map = new Map<number, { id: number; name: string; color: string; icon: string }[]>();
  if (txIds.length === 0) return map;
  const rows = await db
    .select({
      transactionId: transactionTags.transactionId,
      id: tags.id,
      name: tags.name,
      color: tags.color,
      icon: tags.icon,
    })
    .from(transactionTags)
    .innerJoin(tags, eq(transactionTags.tagId, tags.id))
    .where(inArray(transactionTags.transactionId, txIds));
  for (const r of rows) {
    if (!map.has(r.transactionId)) map.set(r.transactionId, []);
    map.get(r.transactionId)!.push({ id: r.id, name: r.name, color: r.color, icon: r.icon });
  }
  return map;
}

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
      tag_id,
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
    if (tag_id)
      conditions.push(
        sql`EXISTS (SELECT 1 FROM ${transactionTags} WHERE ${transactionTags.transactionId} = ${transactions.id} AND ${transactionTags.tagId} = ${Number(tag_id)})`,
      );
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

    const txTags = await tagsByTransaction(rows.map((r) => r.id));

    res.json({
      data: rows.map((r) => ({ ...r, tags: txTags.get(r.id) ?? [] })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / limitNum),
      },
    });
  }),
);

// GET /api/transactions/export — exporta a CSV o JSON (debe ir ANTES de /:id)
transactionsRouter.get(
  '/export',
  asyncHandler(async (req, res) => {
    const { format = 'csv', from, to, accountId, categoryId, type } = req.query as Record<
      string,
      string
    >;

    const conditions: SQL[] = [];
    if (from) conditions.push(gte(transactions.date, from));
    if (to) conditions.push(lte(transactions.date, to));
    if (accountId) conditions.push(eq(transactions.accountId, Number(accountId)));
    if (categoryId) conditions.push(eq(transactions.categoryId, Number(categoryId)));
    if (type) conditions.push(eq(transactions.type, type));
    const where = conditions.length ? and(...conditions) : undefined;

    const toAccounts = alias(accounts, 'to_accounts');
    const parentCat = alias(categories, 'parent_cat');

    const rows = await db
      .select({
        id: transactions.id,
        type: transactions.type,
        amount: transactions.amount,
        description: transactions.description,
        date: transactions.date,
        time: transactions.time,
        notes: transactions.notes,
        accountName: accounts.name,
        toAccountName: toAccounts.name,
        categoryName: categories.name,
        categoryParentId: categories.parentId,
        parentName: parentCat.name,
      })
      .from(transactions)
      .leftJoin(accounts, eq(transactions.accountId, accounts.id))
      .leftJoin(toAccounts, eq(transactions.toAccountId, toAccounts.id))
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .leftJoin(parentCat, eq(categories.parentId, parentCat.id))
      .where(where)
      .orderBy(asc(transactions.date), asc(transactions.time), asc(transactions.id));

    const txTags = await tagsByTransaction(rows.map((r) => r.id));

    const normalized: NormalizedRow[] = rows.map((r) => {
      const isSub = r.categoryParentId != null;
      return {
        date: r.date,
        time: r.time,
        type: r.type as NormalizedRow['type'],
        amount: r.amount,
        description: r.description ?? '',
        account: r.accountName ?? '',
        toAccount: r.toAccountName ?? '',
        category: isSub ? r.parentName ?? '' : r.categoryName ?? '',
        subcategory: isSub ? r.categoryName ?? '' : '',
        tags: (txTags.get(r.id) ?? []).map((t) => t.name).join(';'),
        notes: r.notes ?? '',
      };
    });

    const stamp = new Date().toISOString().slice(0, 10);

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="transacciones-${stamp}.json"`);
      res.send(JSON.stringify(normalized, null, 2));
      return;
    }

    // CSV: UTF-8 con BOM para que Excel respete tildes; CRLF entre filas.
    const lines = [CSV_HEADERS.join(',')];
    for (const n of normalized) {
      lines.push(
        [
          n.date,
          n.time,
          TYPE_LABELS[n.type] ?? n.type,
          n.amount,
          n.description,
          n.account,
          n.toAccount,
          n.category,
          n.subcategory,
          n.tags,
          n.notes,
        ]
          .map(csvEscape)
          .join(','),
      );
    }
    const csv = '﻿' + lines.join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="transacciones-${stamp}.csv"`);
    res.send(csv);
  }),
);

// POST /api/transactions/import — crea transacciones desde un arreglo normalizado
transactionsRouter.post(
  '/import',
  asyncHandler(async (req, res) => {
    const body = req.body;
    const rows: unknown[] = Array.isArray(body) ? body : body?.transactions;
    if (!Array.isArray(rows)) {
      throw new ApiError(400, 'Se esperaba un arreglo de transacciones (o { transactions: [...] })');
    }

    // Índices por nombre (case-insensitive) para resolver cuentas y categorías.
    const allAccounts = await db.select().from(accounts);
    const accByName = new Map(allAccounts.map((a) => [a.name.trim().toLowerCase(), a]));
    const allCategories = await db.select().from(categories);
    const catByName = new Map<string, (typeof allCategories)[number]>();
    for (const c of allCategories) {
      const key = c.name.trim().toLowerCase();
      if (!catByName.has(key)) catByName.set(key, c);
    }

    let imported = 0;
    const errors: { row: number; reason: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = (rows[i] ?? {}) as Record<string, unknown>;
      const rowNum = i + 1;
      const str = (v: unknown) => (v == null ? '' : String(v)).trim();

      // Tipo
      const type = TYPE_FROM_LABEL[str(row.type).toLowerCase()];
      if (!type) {
        errors.push({ row: rowNum, reason: `Tipo inválido: "${str(row.type)}"` });
        continue;
      }
      // Monto numérico > 0
      const amount = typeof row.amount === 'number' ? row.amount : parseFloat(str(row.amount));
      if (!Number.isFinite(amount) || amount <= 0) {
        errors.push({ row: rowNum, reason: `Monto inválido: "${str(row.amount)}" (debe ser > 0)` });
        continue;
      }
      // Fecha válida (yyyy-MM-dd)
      const date = str(row.date);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
        errors.push({ row: rowNum, reason: `Fecha inválida: "${str(row.date)}"` });
        continue;
      }
      // Hora opcional (default 00:00:00)
      let time = str(row.time);
      if (!/^\d{2}:\d{2}(:\d{2})?$/.test(time)) time = '00:00:00';
      else if (time.length === 5) time += ':00';
      // Cuenta existente (match por nombre)
      const account = accByName.get(str(row.account).toLowerCase());
      if (!account) {
        errors.push({ row: rowNum, reason: `Cuenta no encontrada: "${str(row.account)}"` });
        continue;
      }
      // Transferencia → cuenta destino debe existir
      let toAccountId: number | null = null;
      if (type === 'transfer') {
        const toAccount = accByName.get(str(row.toAccount).toLowerCase());
        if (!toAccount) {
          errors.push({ row: rowNum, reason: `Cuenta destino no encontrada: "${str(row.toAccount)}"` });
          continue;
        }
        toAccountId = toAccount.id;
      }
      // Categoría opcional: subcategoría primero, luego categoría; si no existe, null
      const subName = str(row.subcategory).toLowerCase();
      const catName = str(row.category).toLowerCase();
      const category = (subName && catByName.get(subName)) || (catName && catByName.get(catName)) || null;
      const categoryId = category ? category.id : null;

      const description = str(row.description).slice(0, 255) || null;
      const notes = str(row.notes) || null;

      const insertStmt = db
        .insert(transactions)
        .values({
          type,
          amount: amount.toFixed(2),
          description,
          date,
          time,
          accountId: account.id,
          toAccountId,
          categoryId,
          notes,
        })
        .returning();
      const balance = balanceStatements(type, amount, account.id, toAccountId, 1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.batch([insertStmt, ...balance] as any);
      imported++;
    }

    res.json({ imported, errors });
  }),
);

// GET /api/transactions/:id
transactionsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const [row] = await db.select().from(transactions).where(eq(transactions.id, id));
    if (!row) throw new ApiError(404, 'Transacción no encontrada');
    const txTags = await tagsByTransaction([id]);
    res.json({ ...row, tags: txTags.get(id) ?? [] });
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

    if (data.tagIds && data.tagIds.length > 0) {
      await db
        .insert(transactionTags)
        .values(data.tagIds.map((tagId) => ({ transactionId: created.id, tagId })));
    }
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

    const stmts: unknown[] = [...revert, ...apply, updateStmt];
    if (data.tagIds) {
      stmts.push(db.delete(transactionTags).where(eq(transactionTags.transactionId, id)));
      if (data.tagIds.length > 0) {
        stmts.push(
          db.insert(transactionTags).values(data.tagIds.map((tagId) => ({ transactionId: id, tagId }))),
        );
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = await db.batch(stmts as any);
    const updated = (results[revert.length + apply.length] as Transaction[])[0];
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
