import { Router } from 'express';
import { and, asc, eq, gte, lte, desc, ilike, sql, count, inArray, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { transactions, accounts, categories, tags, transactionTags, debts, type Transaction } from '../db/schema.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { parseId } from '../utils/parseId.js';
import { userId } from '../middleware/auth.js';
import { PAGINATION_DEFAULT_LIMIT, PAGINATION_MAX_LIMIT, IMPORT_BATCH_SIZE } from '../utils/constants.js';
import { safeCompensate } from '../utils/safeCompensate.js';
import { buildFifoCardDebtPayment } from '../utils/creditCardDebt.js';
import { frenchInstallment } from '../utils/installments.js';
import { balanceStatements, assertDebitSufficient } from '../utils/balance.js';

/** yyyy-MM-dd de una fecha local. */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Primera fecha con día-del-mes === `day` (1-28) que sea >= `from` (próximo pago). */
function nextDateOnDay(day: number, from: Date): Date {
  const candidate = new Date(from.getFullYear(), from.getMonth(), day);
  if (from.getDate() > day) candidate.setMonth(candidate.getMonth() + 1);
  return candidate;
}

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
  // Monto recibido en la cuenta destino (transferencias entre monedas distintas).
  toAmount: z.coerce.number().positive().optional().nullable(),
  categoryId: z.number().int().optional().nullable(),
  notes: z.string().optional().nullable(),
  // Nombre del archivo de la foto del recibo (imagen local en el dispositivo).
  receiptFilename: z.string().max(255).optional().nullable(),
  tagIds: z.array(z.number().int()).optional(),
  // Compra a cuotas (solo gasto con tarjeta de crédito). El backend deriva
  // currentInstallment (=1) e installmentAmount (=amount/installments); el cliente
  // solo manda el nº total de cuotas (2–60). null/ausente = compra de contado.
  installments: z.coerce.number().int().min(2).max(60).optional().nullable(),
  // Interés de la compra a cuotas (% mensual del crédito) y de mora (% mensual).
  // Solo aplican a gasto con tarjeta a cuotas; se guardan en la deuda automática.
  monthlyInterestRate: z.coerce.number().min(0).max(999.99).optional().nullable(),
  lateInterestRate: z.coerce.number().min(0).max(999.99).optional().nullable(),
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
 * Verifica que las cuentas referenciadas pertenezcan al usuario (404 si no).
 * NOTA de diseño (Fase 5): `is_active` significa "fuera de selectores", NO un bloqueo
 * duro de operaciones. Una cuenta desactivada puede seguir recibiendo transacciones si
 * el cliente ya tiene su id (p. ej. reglas recurrentes ya creadas), por eso aquí solo
 * se valida la propiedad, no `is_active`. Congelar tarjeta SÍ bloquea gastos (ver POST).
 */
async function assertAccountsOwned(uid: number, ids: (number | null | undefined)[]): Promise<void> {
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

/** Verifica que las etiquetas referenciadas pertenezcan al usuario (400 si no). */
async function assertTagsOwned(uid: number, tagIds: number[] | undefined): Promise<void> {
  if (!tagIds || tagIds.length === 0) return;
  const unique = [...new Set(tagIds)];
  const owned = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.userId, uid), inArray(tags.id, unique)));
  if (owned.length !== unique.length) {
    throw new ApiError(400, 'Una o más etiquetas no existen');
  }
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
      limit = String(PAGINATION_DEFAULT_LIMIT),
    } = req.query as Record<string, string>;

    const conditions: SQL[] = [eq(transactions.userId, userId(req))];
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
    const limitNum = Math.min(PAGINATION_MAX_LIMIT, Math.max(1, Number(limit)));
    const offset = (pageNum - 1) * limitNum;

    const toAccounts = alias(accounts, 'to_accounts');

    // rows y count son independientes → en paralelo. Las tags dependen de los ids
    // de `rows`, así que se piden después.
    const [rows, [{ total }]] = await Promise.all([
      db
        .select({
          id: transactions.id,
          type: transactions.type,
          amount: transactions.amount,
          description: transactions.description,
          date: transactions.date,
          time: transactions.time,
          accountId: transactions.accountId,
          toAccountId: transactions.toAccountId,
          toAmount: transactions.toAmount,
          categoryId: transactions.categoryId,
          notes: transactions.notes,
          receiptFilename: transactions.receiptFilename,
          installments: transactions.installments,
          currentInstallment: transactions.currentInstallment,
          installmentAmount: transactions.installmentAmount,
          debtId: transactions.debtId,
          createdAt: transactions.createdAt,
          accountName: accounts.name,
          accountColor: accounts.color,
          accountIcon: accounts.icon,
          accountCurrency: accounts.currency,
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
        .offset(offset),
      db.select({ total: count() }).from(transactions).where(where),
    ]);

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

    const conditions: SQL[] = [eq(transactions.userId, userId(req))];
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

    const uid = userId(req);
    // Índices por nombre (case-insensitive) para resolver cuentas y categorías del usuario.
    const allAccounts = await db.select().from(accounts).where(eq(accounts.userId, uid));
    const accByName = new Map(allAccounts.map((a) => [a.name.trim().toLowerCase(), a]));
    const allCategories = await db.select().from(categories).where(eq(categories.userId, uid));
    const catByName = new Map<string, (typeof allCategories)[number]>();
    for (const c of allCategories) {
      const key = c.name.trim().toLowerCase();
      if (!catByName.has(key)) catByName.set(key, c);
    }

    let imported = 0;
    const errors: { row: number; reason: string }[] = [];

    // Acumula los statements de las filas válidas y los ejecuta en batches (en vez
    // de un round-trip HTTP por fila). La validación sigue siendo por fila. Cada
    // batch es atómico (neon-http): si un flush falla, ESE lote completo se revierte,
    // así que NO se suma a `imported` y se registra un error con su rango de filas.
    // Resultado parcial veraz: lo que sí entró se cuenta, lo que falló se reporta.
    const BATCH_ROWS = IMPORT_BATCH_SIZE;
    let pending: unknown[] = [];
    let batchRows: number[] = []; // nº de fila (1-based) de cada fila válida del lote actual
    const flush = async () => {
      if (pending.length === 0) return;
      const stmts = pending;
      const rowsInBatch = batchRows;
      pending = [];
      batchRows = [];
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await db.batch(stmts as any);
        imported += rowsInBatch.length; // solo se cuenta lo que realmente se commiteó
      } catch (err) {
        // Al cliente le reportamos solo el rango de filas; el error real de la DB se
        // loguea aquí para diagnosticar fallos sistemáticos (no se pierde).
        console.error('[import] falló el lote de filas', rowsInBatch[0], '–', rowsInBatch[rowsInBatch.length - 1], err);
        const first = rowsInBatch[0];
        const last = rowsInBatch[rowsInBatch.length - 1];
        errors.push({
          row: first,
          reason:
            first === last
              ? `No se pudo guardar (fila ${first})`
              : `No se pudo guardar el lote (filas ${first}–${last})`,
        });
      }
    };

    const accDeltas = new Map<number, number>();
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

      if ((type === 'expense' || type === 'transfer') && account.type !== 'credit_card') {
        const cumulative = accDeltas.get(account.id) ?? 0;
        const projected = Number(account.currentBalance) + cumulative - amount;
        if (projected < 0) {
          errors.push({ row: rowNum, reason: 'Saldo insuficiente en la cuenta' });
          continue;
        }
      }

      // Categoría opcional: subcategoría primero, luego categoría; si no existe, null
      const subName = str(row.subcategory).toLowerCase();
      const catName = str(row.category).toLowerCase();
      const category = (subName && catByName.get(subName)) || (catName && catByName.get(catName)) || null;
      const categoryId = category ? category.id : null;

      const description = str(row.description).slice(0, 255) || null;
      const notes = str(row.notes) || null;

      if (type === 'income') accDeltas.set(account.id, (accDeltas.get(account.id) ?? 0) + amount);
      else if (type === 'expense' || type === 'transfer') accDeltas.set(account.id, (accDeltas.get(account.id) ?? 0) - amount);
      if (type === 'transfer' && toAccountId != null) accDeltas.set(toAccountId, (accDeltas.get(toAccountId) ?? 0) + amount);

      const insertStmt = db
        .insert(transactions)
        .values({
          userId: uid,
          type,
          amount: amount.toFixed(2),
          description,
          date,
          time,
          accountId: account.id,
          toAccountId,
          categoryId,
          notes,
        });
      const balance = balanceStatements(uid, type, amount, account.id, toAccountId, 1);
      pending.push(insertStmt, ...balance);
      batchRows.push(rowNum);
      if (batchRows.length >= BATCH_ROWS) await flush();
    }
    await flush();

    res.json({ imported, errors });
  }),
);

// GET /api/transactions/:id
transactionsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const [row] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.userId, userId(req))));
    if (!row) throw new ApiError(404, 'Transacción no encontrada');
    const txTags = await tagsByTransaction([id]);
    res.json({ ...row, tags: txTags.get(id) ?? [] });
  }),
);

// POST /api/transactions — crea + actualiza balances atómicamente
transactionsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const data = txSchema.parse(req.body);
    if (data.type === 'transfer' && !data.toAccountId) {
      throw new ApiError(400, 'Una transferencia requiere cuenta destino (toAccountId)');
    }
    // Las cuentas y etiquetas referenciadas deben pertenecer al usuario.
    await assertAccountsOwned(uid, [data.accountId, data.toAccountId]);
    await assertTagsOwned(uid, data.tagIds);

    // Datos de las cuentas involucradas (origen y, si transfer, destino).
    const involvedIds = [data.accountId, data.toAccountId].filter((x): x is number => x != null);
    const accs = await db
      .select({
        id: accounts.id,
        type: accounts.type,
        name: accounts.name,
        color: accounts.color,
        paymentDueDay: accounts.paymentDueDay,
        currentBalance: accounts.currentBalance,
        allowOverdraft: accounts.allowOverdraft,
        isFrozen: accounts.isFrozen,
      })
      .from(accounts)
      .where(and(eq(accounts.userId, uid), inArray(accounts.id, involvedIds)));
    const srcAcc = accs.find((a) => a.id === data.accountId);
    const dstAcc = data.toAccountId != null ? accs.find((a) => a.id === data.toAccountId) : undefined;

    // Las tarjetas de crédito no reciben ingresos directos: lo único que entra a la
    // tarjeta es un pago (transferencia hacia ella). Bloquear income con tarjeta origen.
    if (data.type === 'income' && srcAcc?.type === 'credit_card') {
      throw new ApiError(400, 'No puedes registrar un ingreso en una tarjeta de crédito');
    }

    // ¿Gasto con tarjeta de crédito? Reduce el crédito disponible y genera una deuda
    // (1 por compra). NO afecta el saldo de débito del usuario.
    const isCardExpense = data.type === 'expense' && srcAcc?.type === 'credit_card';
    // Tarjeta congelada: bloquea gastos nuevos (pero permite pagos de deuda, que son
    // una transferencia HACIA la tarjeta, no un gasto con ella).
    if (isCardExpense && srcAcc!.isFrozen) {
      throw new ApiError(400, 'La tarjeta está congelada: no admite gastos nuevos');
    }
    if (isCardExpense && !srcAcc!.allowOverdraft) {
      // current_balance ES el crédito disponible: no se puede gastar más que eso.
      if (Number(srcAcc!.currentBalance) < data.amount) {
        throw new ApiError(400, 'Excede el crédito disponible de la tarjeta');
      }
    }
    if ((data.type === 'expense' || data.type === 'transfer') && !isCardExpense) {
      assertDebitSufficient(srcAcc!, data.amount);
    }

    // Cuotas: solo aplican a gasto con tarjeta. El backend deriva los valores
    // (cuota por amortización francesa con la tasa mensual del crédito, si la hay).
    const installments = isCardExpense && data.installments && data.installments > 1 ? data.installments : null;
    const monthlyRate = installments ? data.monthlyInterestRate ?? 0 : null;
    const installmentAmount = installments
      ? frenchInstallment(data.amount, monthlyRate ?? 0, installments)
      : null;

    const toAmount = data.type === 'transfer' ? data.toAmount ?? null : null;

    // Pago de tarjeta: transferencia hacia una tarjeta de crédito → libera crédito
    // (la lógica de transfer ya hace current_balance += monto) y abona FIFO a las
    // deudas automáticas de esa tarjeta (las más antiguas primero), en el mismo batch.
    const transferFifo =
      data.type === 'transfer' && dstAcc?.type === 'credit_card'
        ? await buildFifoCardDebtPayment(uid, dstAcc.id, toAmount != null ? toAmount : data.amount)
        : { apply: [] as unknown[], revert: [] as unknown[] };

    const insertStmt = db
      .insert(transactions)
      .values({
        userId: uid,
        type: data.type,
        amount: data.amount.toFixed(2),
        description: data.description ?? null,
        date: data.date,
        time: data.time,
        accountId: data.accountId,
        toAccountId: data.type === 'transfer' ? data.toAccountId ?? null : null,
        toAmount: toAmount != null ? toAmount.toFixed(2) : null,
        categoryId: data.categoryId ?? null,
        notes: data.notes ?? null,
        receiptFilename: data.receiptFilename ?? null,
        installments,
        currentInstallment: installments ? 1 : null,
        installmentAmount: installmentAmount != null ? installmentAmount.toFixed(2) : null,
      })
      .returning();

    const balance = balanceStatements(uid, data.type, data.amount, data.accountId, data.toAccountId, 1, toAmount);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = await db.batch([insertStmt, ...balance, ...transferFifo.apply] as any);
    const created = (results[0] as Transaction[])[0];

    // Post-batch (depende del id serial recién generado): deuda automática de la
    // compra con tarjeta y enlace de etiquetas. Cualquier fallo aquí compensa TODO
    // lo ya aplicado (saldo, FIFO de la transfer, deuda, transacción).
    let createdDebt: { id: number } | null = null;
    try {
      if (isCardExpense) {
        const dueDate = ymd(nextDateOnDay(srcAcc!.paymentDueDay ?? 20, new Date(`${data.date}T00:00:00`)));
        const baseName = data.description?.trim() || `Compra tarjeta ${srcAcc!.name}`;
        const name = installments ? `${baseName} (Cuota 1/${installments})` : baseName;
        const notes = installments
          ? `Compra a ${installments} cuotas de ${installmentAmount!.toFixed(2)} c/u` +
            (monthlyRate ? ` (interés ${monthlyRate}% mensual)` : '')
          : null;
        const [debt] = await db
          .insert(debts)
          .values({
            userId: uid,
            name,
            type: 'debt',
            totalAmount: data.amount.toFixed(2),
            remainingAmount: data.amount.toFixed(2),
            startDate: data.date,
            dueDate,
            accountId: srcAcc!.id,
            icon: 'credit-card',
            color: srcAcc!.color,
            notes,
            // Cuotas/interés del crédito (null en compras de contado).
            installments,
            installmentAmount: installmentAmount != null ? installmentAmount.toFixed(2) : null,
            monthlyInterestRate: monthlyRate != null ? monthlyRate.toFixed(2) : null,
            lateInterestRate:
              installments && data.lateInterestRate != null ? data.lateInterestRate.toFixed(2) : null,
          })
          .returning({ id: debts.id });
        createdDebt = debt;
        await db
          .update(transactions)
          .set({ debtId: debt.id })
          .where(and(eq(transactions.id, created.id), eq(transactions.userId, uid)));
        created.debtId = debt.id;
      }

      // Etiquetas (ya validadas como propias; se deduplican para no violar el UNIQUE).
      if (data.tagIds && data.tagIds.length > 0) {
        const uniqueTagIds = [...new Set(data.tagIds)];
        await db
          .insert(transactionTags)
          .values(uniqueTagIds.map((tagId) => ({ transactionId: created.id, tagId })));
      }
    } catch (err) {
      const revert = balanceStatements(uid, data.type, data.amount, data.accountId, data.toAccountId, -1, toAmount);
      const undo: unknown[] = [...revert, ...transferFifo.revert];
      if (createdDebt) undo.push(db.delete(debts).where(eq(debts.id, createdDebt.id)));
      // Borrar la transacción al final (su CASCADE limpia transaction_tags; ya sin
      // referencia a la deuda recién borrada).
      undo.push(db.delete(transactions).where(eq(transactions.id, created.id)));
      await safeCompensate(undo, {
        endpoint: 'POST /api/transactions',
        operation: 'create+debt+tags',
        userId: uid,
        entityId: created.id,
        txId: created.id,
      });
      throw err;
    }
    res.status(201).json(created);
  }),
);

// PUT /api/transactions/:id — recalcula balances
transactionsRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const id = parseId(req.params.id);
    const data = txSchema.parse(req.body);

    const [old] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.userId, uid)));
    if (!old) throw new ApiError(404, 'Transacción no encontrada');
    if (data.type === 'transfer' && !data.toAccountId) {
      throw new ApiError(400, 'Una transferencia requiere cuenta destino (toAccountId)');
    }
    await assertAccountsOwned(uid, [data.accountId, data.toAccountId]);
    await assertTagsOwned(uid, data.tagIds);

    // ¿La transacción editada sigue siendo un gasto con tarjeta de crédito?
    const [srcAcc] = await db
      .select({ type: accounts.type, isFrozen: accounts.isFrozen, currentBalance: accounts.currentBalance })
      .from(accounts)
      .where(and(eq(accounts.id, data.accountId), eq(accounts.userId, uid)));
    if (data.type === 'income' && srcAcc?.type === 'credit_card') {
      throw new ApiError(400, 'No puedes registrar un ingreso en una tarjeta de crédito');
    }
    const newCardExpense = data.type === 'expense' && srcAcc?.type === 'credit_card';
    if (newCardExpense && srcAcc?.isFrozen) {
      throw new ApiError(400, 'La tarjeta está congelada: no admite gastos nuevos');
    }
    if ((data.type === 'expense' || data.type === 'transfer') && !newCardExpense && srcAcc) {
      let available = Number(srcAcc.currentBalance);
      if (old.accountId === data.accountId) {
        if (old.type === 'expense' || old.type === 'transfer') available += Number(old.amount);
        else if (old.type === 'income') available -= Number(old.amount);
      }
      if (old.type === 'transfer' && old.toAccountId === data.accountId) {
        available -= Number(old.toAmount ?? old.amount);
      }
      assertDebitSufficient({ ...srcAcc, currentBalance: available }, data.amount);
    }
    const installments = newCardExpense && data.installments && data.installments > 1 ? data.installments : null;
    const monthlyRate = installments ? data.monthlyInterestRate ?? 0 : null;
    const installmentAmount = installments
      ? frenchInstallment(data.amount, monthlyRate ?? 0, installments)
      : null;

    // Deuda automática enlazada (si la había). Se actualiza/borra junto con la tx.
    const oldDebt =
      old.debtId != null
        ? (
            await db
              .select()
              .from(debts)
              .where(and(eq(debts.id, old.debtId), eq(debts.userId, uid)))
          )[0] ?? null
        : null;

    // Revierte el efecto anterior y aplica el nuevo.
    const revert = balanceStatements(
      uid,
      old.type,
      Number(old.amount),
      old.accountId,
      old.toAccountId,
      -1,
      old.toAmount != null ? Number(old.toAmount) : null,
    );
    const newToAmount = data.type === 'transfer' ? data.toAmount ?? null : null;
    const apply = balanceStatements(
      uid,
      data.type,
      data.amount,
      data.accountId,
      data.toAccountId,
      1,
      newToAmount,
    );

    // Estado de la deuda enlazada tras la edición:
    //  - sigue siendo gasto con tarjeta y ya tenía deuda → conservar y actualizarla.
    //  - ya NO es gasto con tarjeta y tenía deuda → borrarla y limpiar el enlace.
    //  - antes no tenía deuda → no se crea aquí (caso poco común; sin saga en PUT).
    const keepDebt = newCardExpense && oldDebt != null;
    const dropDebt = !newCardExpense && oldDebt != null;

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
        toAmount: newToAmount != null ? newToAmount.toFixed(2) : null,
        categoryId: data.categoryId ?? null,
        notes: data.notes ?? null,
        receiptFilename: data.receiptFilename ?? null,
        installments,
        currentInstallment: installments ? old.currentInstallment ?? 1 : null,
        installmentAmount: installmentAmount != null ? installmentAmount.toFixed(2) : null,
        debtId: keepDebt ? old.debtId : null,
        updatedAt: new Date(),
      })
      .where(and(eq(transactions.id, id), eq(transactions.userId, uid)))
      .returning();

    const stmts: unknown[] = [...revert, ...apply, updateStmt];
    // Actualizar/borrar la deuda enlazada (tras el updateStmt: si se borra, la tx ya
    // dejó de referenciarla; respeta el FK no-action).
    if (keepDebt && oldDebt) {
      const paid = Number(oldDebt.totalAmount) - Number(oldDebt.remainingAmount);
      const newRemaining = Math.max(0, data.amount - paid);
      const paidOff = newRemaining <= 0;
      const baseName = data.description?.trim() || oldDebt.name.replace(/ \(Cuota .*\)$/, '');
      stmts.push(
        db
          .update(debts)
          .set({
            name: installments ? `${baseName} (Cuota 1/${installments})` : baseName,
            totalAmount: data.amount.toFixed(2),
            remainingAmount: newRemaining.toFixed(2),
            notes: installments
              ? `Compra a ${installments} cuotas de ${installmentAmount!.toFixed(2)} c/u` +
                (monthlyRate ? ` (interés ${monthlyRate}% mensual)` : '')
              : null,
            installments,
            installmentAmount: installmentAmount != null ? installmentAmount.toFixed(2) : null,
            monthlyInterestRate: monthlyRate != null ? monthlyRate.toFixed(2) : null,
            lateInterestRate:
              installments && data.lateInterestRate != null ? data.lateInterestRate.toFixed(2) : null,
            isPaidOff: paidOff,
            paidOffAt: paidOff ? oldDebt.paidOffAt ?? new Date() : null,
            updatedAt: new Date(),
          })
          .where(and(eq(debts.id, oldDebt.id), eq(debts.userId, uid))),
      );
    } else if (dropDebt && oldDebt) {
      stmts.push(db.delete(debts).where(and(eq(debts.id, oldDebt.id), eq(debts.userId, uid))));
    }
    if (data.tagIds) {
      stmts.push(db.delete(transactionTags).where(eq(transactionTags.transactionId, id)));
      if (data.tagIds.length > 0) {
        const uniqueTagIds = [...new Set(data.tagIds)];
        stmts.push(
          db.insert(transactionTags).values(uniqueTagIds.map((tagId) => ({ transactionId: id, tagId }))),
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
    const uid = userId(req);
    const id = parseId(req.params.id);
    const [old] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.userId, uid)));
    if (!old) throw new ApiError(404, 'Transacción no encontrada');

    const revert = balanceStatements(
      uid,
      old.type,
      Number(old.amount),
      old.accountId,
      old.toAccountId,
      -1,
      old.toAmount != null ? Number(old.toAmount) : null,
    );
    const deleteStmt = db.delete(transactions).where(and(eq(transactions.id, id), eq(transactions.userId, uid)));

    // Primero borra la transacción (libera el FK debt_id) y luego su deuda automática.
    const stmts: unknown[] = [...revert, deleteStmt];
    if (old.debtId != null) {
      stmts.push(db.delete(debts).where(and(eq(debts.id, old.debtId), eq(debts.userId, uid))));
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.batch(stmts as any);
    res.json({ success: true });
  }),
);
