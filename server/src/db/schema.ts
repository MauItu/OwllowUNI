import {
  pgTable,
  serial,
  varchar,
  decimal,
  boolean,
  integer,
  timestamp,
  date,
  time,
  text,
  unique,
  uniqueIndex,
  index,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// ─────────────────────────────── users ──────────────────────────────
// Multi-usuario: cada fila de datos pertenece a un usuario (FK user_id en las
// tablas padre). El email se guarda en minúsculas y sin espacios; la contraseña
// SIEMPRE hasheada con bcrypt (nunca en claro).
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  isAdmin: boolean('is_admin').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ────────────────────────── password_resets ─────────────────────────
// Recuperación de contraseña por email (código de 6 dígitos para móvil).
// El `code` se muestra al usuario en el email; el `token` (64 chars) es el
// secreto opaco que la app obtiene tras verificar el código y usa para cambiar
// la contraseña. Códigos/tokens de un solo uso, expiran a los 15 minutos.
export const passwordResets = pgTable('password_resets', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  code: varchar('code', { length: 6 }).notNull(),
  token: varchar('token', { length: 64 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  used: boolean('used').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  // El UNIQUE de `token` ya cubre el lookup por token (reset-password).
  // Índice compuesto para verify-reset-code y el rate limit (códigos vivos del usuario).
  userUsedExpiresIdx: index('password_resets_user_used_expires_idx').on(
    t.userId,
    t.used,
    t.expiresAt,
  ),
}));

// ───────────────────────────── accounts ─────────────────────────────
export const accounts = pgTable('accounts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  type: varchar('type', { length: 30 }).notNull(), // bank | cash | credit_card | digital_wallet
  currency: varchar('currency', { length: 3 }).default('COP').notNull(),
  initialBalance: decimal('initial_balance', { precision: 15, scale: 2 }).default('0').notNull(),
  currentBalance: decimal('current_balance', { precision: 15, scale: 2 }).default('0').notNull(),
  color: varchar('color', { length: 7 }).default('#4F46E5').notNull(),
  icon: varchar('icon', { length: 50 }).default('wallet').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  // ── Solo para tarjetas de crédito (type='credit_card'); nullable en el resto ──
  // Tope de crédito. null = no es tarjeta de crédito.
  creditLimit: decimal('credit_limit', { precision: 15, scale: 2 }),
  // Día del mes (1-28) en que cierra el corte. Ej: 15 = corte el 15 de cada mes.
  billingCycleDay: integer('billing_cycle_day'),
  // Día del mes (1-28) en que vence el pago (del mes siguiente al corte). Ej: 5.
  paymentDueDay: integer('payment_due_day'),
  // Si es true, se permite gastar por encima del crédito disponible (sin 400).
  allowOverdraft: boolean('allow_overdraft').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  userIdx: index('accounts_user_id_idx').on(t.userId),
}));

// ──────────────────────────── categories ────────────────────────────
export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  name: varchar('name', { length: 80 }).notNull(),
  type: varchar('type', { length: 10 }).notNull(), // income | expense
  icon: varchar('icon', { length: 50 }).notNull(),
  color: varchar('color', { length: 7 }).notNull(),
  parentId: integer('parent_id').references((): AnyPgColumn => categories.id, {
    onDelete: 'cascade',
  }),
  isActive: boolean('is_active').default(true).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  userIdx: index('categories_user_id_idx').on(t.userId),
  parentIdx: index('categories_parent_id_idx').on(t.parentId),
}));

// ─────────────────────────── transactions ───────────────────────────
export const transactions = pgTable('transactions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  type: varchar('type', { length: 10 }).notNull(), // income | expense | transfer
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  description: varchar('description', { length: 255 }),
  date: date('date').notNull(),
  time: time('time').notNull(),
  accountId: integer('account_id')
    .references(() => accounts.id)
    .notNull(),
  toAccountId: integer('to_account_id').references(() => accounts.id),
  // Monto recibido en la cuenta destino cuando la transferencia cruza monedas
  // (nullable; si es null se asume igual a `amount`, misma moneda).
  toAmount: decimal('to_amount', { precision: 15, scale: 2 }),
  categoryId: integer('category_id').references(() => categories.id),
  notes: text('notes'),
  // Nombre del archivo de la foto del recibo (la imagen vive LOCAL en el
  // dispositivo: documentDirectory/receipts/<filename>; en DB solo el nombre).
  receiptFilename: varchar('receipt_filename', { length: 255 }),
  // ── Compras a cuotas (solo gastos con tarjeta de crédito; null en el resto) ──
  // Nº total de cuotas (ej: 36). null = compra de contado.
  installments: integer('installments'),
  // Nº de cuota actual (al crear siempre 1).
  currentInstallment: integer('current_installment'),
  // Valor de cada cuota (= amount / installments).
  installmentAmount: decimal('installment_amount', { precision: 15, scale: 2 }),
  // Deuda generada automáticamente al gastar con tarjeta de crédito (1 por compra).
  debtId: integer('debt_id').references((): AnyPgColumn => debts.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  // Lista paginada + casi todas las queries de stats/insights: filtran user_id
  // + rango de fechas y ordenan por fecha (scan hacia atrás cubre el ORDER BY DESC).
  userDateIdx: index('transactions_user_date_idx').on(t.userId, t.date, t.id),
  // stats by-category/summary/timeline e insights filtran además por `type`.
  userTypeDateIdx: index('transactions_user_type_date_idx').on(t.userId, t.type, t.date),
  accountIdx: index('transactions_account_id_idx').on(t.accountId),
  toAccountIdx: index('transactions_to_account_id_idx').on(t.toAccountId),
  categoryIdx: index('transactions_category_id_idx').on(t.categoryId),
  debtIdx: index('transactions_debt_id_idx').on(t.debtId),
}));

// ──────────────────────────── exchange_rates ────────────────────────
// Tasas de cambio cacheadas. Las `is_manual` las fija el usuario y NUNCA se
// sobreescriben con el refresco automático (API gratuita).
export const exchangeRates = pgTable(
  'exchange_rates',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    baseCurrency: varchar('base_currency', { length: 3 }).notNull(),
    targetCurrency: varchar('target_currency', { length: 3 }).notNull(),
    rate: decimal('rate', { precision: 18, scale: 8 }).notNull(),
    isManual: boolean('is_manual').default(false).notNull(),
    fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
  },
  (t) => ({
    uniquePair: unique().on(t.userId, t.baseCurrency, t.targetCurrency),
  }),
);

// ───────────────────────────── templates ────────────────────────────
export const templates = pgTable('templates', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  type: varchar('type', { length: 10 }).notNull(), // income | expense
  amount: decimal('amount', { precision: 15, scale: 2 }),
  description: varchar('description', { length: 255 }),
  accountId: integer('account_id').references(() => accounts.id),
  categoryId: integer('category_id').references(() => categories.id),
  isActive: boolean('is_active').default(true).notNull(),
  useCount: integer('use_count').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  userIdx: index('templates_user_id_idx').on(t.userId),
}));

// ─────────────────────────────── tags ───────────────────────────────
export const tags = pgTable(
  'tags',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    name: varchar('name', { length: 50 }).notNull(),
    color: varchar('color', { length: 7 }).default('#6C757D').notNull(),
    icon: varchar('icon', { length: 50 }).default('tag').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    // El nombre es único por usuario (dos usuarios pueden tener la misma etiqueta).
    uniqueUserName: unique().on(t.userId, t.name),
  }),
);

// ──────────────────────── transaction_tags ──────────────────────────
export const transactionTags = pgTable(
  'transaction_tags',
  {
    id: serial('id').primaryKey(),
    transactionId: integer('transaction_id')
      .references(() => transactions.id, { onDelete: 'cascade' })
      .notNull(),
    tagId: integer('tag_id')
      .references(() => tags.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (t) => ({
    uniqueTransactionTag: unique().on(t.transactionId, t.tagId),
    // El unique ya cubre lookups por transaction_id (columna líder); falta tag_id
    // para el filtro EXISTS por tag y el conteo en GET /tags.
    tagIdx: index('transaction_tags_tag_id_idx').on(t.tagId),
  }),
);

// ─────────────────────────── savings_goals ──────────────────────────
export const savingsGoals = pgTable('savings_goals', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  targetAmount: decimal('target_amount', { precision: 15, scale: 2 }).notNull(),
  currentAmount: decimal('current_amount', { precision: 15, scale: 2 }).default('0').notNull(),
  deadline: date('deadline'),
  color: varchar('color', { length: 7 }).default('#2E8B57').notNull(),
  icon: varchar('icon', { length: 50 }).default('piggy-bank').notNull(),
  isCompleted: boolean('is_completed').default(false).notNull(),
  completedAt: timestamp('completed_at'),
  accountId: integer('account_id').references(() => accounts.id),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  userIdx: index('savings_goals_user_id_idx').on(t.userId),
}));

// ──────────────────────── savings_contributions ─────────────────────
export const savingsContributions = pgTable('savings_contributions', {
  id: serial('id').primaryKey(),
  goalId: integer('goal_id')
    .references(() => savingsGoals.id, { onDelete: 'cascade' })
    .notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  type: varchar('type', { length: 10 }).notNull(), // deposit | withdrawal
  description: varchar('description', { length: 255 }),
  date: date('date').notNull(),
  transactionId: integer('transaction_id').references(() => transactions.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  goalIdx: index('savings_contributions_goal_id_idx').on(t.goalId),
}));

// ─────────────────────────────── debts ──────────────────────────────
export const debts = pgTable('debts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  type: varchar('type', { length: 10 }).notNull(), // debt (yo debo) | loan (me deben)
  totalAmount: decimal('total_amount', { precision: 15, scale: 2 }).notNull(),
  remainingAmount: decimal('remaining_amount', { precision: 15, scale: 2 }).notNull(),
  interestRate: decimal('interest_rate', { precision: 5, scale: 2 }), // % anual, informativo
  creditorDebtor: varchar('creditor_debtor', { length: 100 }),
  startDate: date('start_date').notNull(),
  dueDate: date('due_date'),
  color: varchar('color', { length: 7 }).default('#C1437A').notNull(),
  icon: varchar('icon', { length: 50 }).default('landmark').notNull(),
  isPaidOff: boolean('is_paid_off').default(false).notNull(),
  paidOffAt: timestamp('paid_off_at'),
  notes: text('notes'),
  accountId: integer('account_id').references(() => accounts.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  userIdx: index('debts_user_id_idx').on(t.userId),
}));

// ─────────────────────────── debt_payments ──────────────────────────
export const debtPayments = pgTable('debt_payments', {
  id: serial('id').primaryKey(),
  debtId: integer('debt_id')
    .references(() => debts.id, { onDelete: 'cascade' })
    .notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  date: date('date').notNull(),
  description: varchar('description', { length: 255 }),
  // Cuenta a la que entró/salió el dinero del abono (nullable: pagos históricos o sin registrar)
  accountId: integer('account_id').references(() => accounts.id),
  transactionId: integer('transaction_id').references(() => transactions.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  debtIdx: index('debt_payments_debt_id_idx').on(t.debtId),
}));

// ─────────────────────────────── budgets ────────────────────────────
// Presupuestos mensuales. Un presupuesto por categoría por usuario; además un
// único presupuesto GLOBAL (category_id IS NULL) por usuario. Postgres trata los
// NULL como distintos en UNIQUE, así que el UNIQUE(user_id, category_id) NO impide
// dos globales: para eso va el índice único PARCIAL sobre (user_id) WHERE
// category_id IS NULL. El gasto del mes NO se persiste; se calcula on-the-fly
// sumando transactions (type='expense') del mes en curso.
export const budgets = pgTable(
  'budgets',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    // null = presupuesto global (límite de gasto total del mes).
    categoryId: integer('category_id').references(() => categories.id),
    amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    // Un presupuesto por categoría por usuario (los globales escapan al NULL).
    uniqueUserCategory: unique().on(t.userId, t.categoryId),
    // Un único presupuesto global por usuario.
    oneGlobalPerUser: uniqueIndex('budgets_one_global_per_user')
      .on(t.userId)
      .where(sql`${t.categoryId} IS NULL`),
    userIdx: index('budgets_user_id_idx').on(t.userId),
  }),
);

// ──────────────────────── credit_card_statements ────────────────────
// Estados de cuenta (cortes) de una tarjeta de crédito. Cada corte agrega el
// gasto del periodo y genera una deuda automática (debt_id) con su fecha de pago.
export const creditCardStatements = pgTable(
  'credit_card_statements',
  {
    id: serial('id').primaryKey(),
    accountId: integer('account_id')
      .references(() => accounts.id, { onDelete: 'cascade' })
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(), // fecha de corte
    paymentDueDate: date('payment_due_date').notNull(),
    totalAmount: decimal('total_amount', { precision: 15, scale: 2 }).notNull(),
    paidAmount: decimal('paid_amount', { precision: 15, scale: 2 }).default('0').notNull(),
    isPaid: boolean('is_paid').default(false).notNull(),
    isOverdue: boolean('is_overdue').default(false).notNull(),
    debtId: integer('debt_id').references(() => debts.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    // Un solo estado de cuenta por corte por tarjeta.
    uniqueAccountPeriod: unique().on(t.accountId, t.periodEnd),
    userAccountPaidIdx: index('credit_card_statements_user_account_paid_idx').on(
      t.userId,
      t.accountId,
      t.isPaid,
    ),
  }),
);

// ─────────────────────────── split_groups ───────────────────────────
export const splitGroups = pgTable('split_groups', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  description: varchar('description', { length: 255 }),
  icon: varchar('icon', { length: 50 }).default('users').notNull(),
  color: varchar('color', { length: 7 }).default('#3A60A1').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  userIdx: index('split_groups_user_id_idx').on(t.userId),
}));

// ─────────────────────────── split_members ──────────────────────────
export const splitMembers = pgTable(
  'split_members',
  {
    id: serial('id').primaryKey(),
    groupId: integer('group_id')
      .references(() => splitGroups.id, { onDelete: 'cascade' })
      .notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    // Exactamente uno por grupo debe ser is_me=true (representa al usuario)
    isMe: boolean('is_me').default(false).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({
    uniqueGroupMemberName: unique().on(t.groupId, t.name),
    // Un solo miembro "Yo" (is_me=true) por grupo: índice único PARCIAL.
    oneMePerGroup: uniqueIndex('split_members_one_me_per_group')
      .on(t.groupId)
      .where(sql`${t.isMe} = true`),
  }),
);

// ────────────────────────── split_expenses ──────────────────────────
export const splitExpenses = pgTable('split_expenses', {
  id: serial('id').primaryKey(),
  groupId: integer('group_id')
    .references(() => splitGroups.id, { onDelete: 'cascade' })
    .notNull(),
  description: varchar('description', { length: 255 }).notNull(),
  totalAmount: decimal('total_amount', { precision: 15, scale: 2 }).notNull(),
  paidByMemberId: integer('paid_by_member_id')
    .references(() => splitMembers.id)
    .notNull(),
  date: date('date').notNull(),
  // Cuenta de la que salió el dinero cuando el gasto lo pagó el usuario (nullable)
  accountId: integer('account_id').references(() => accounts.id),
  transactionId: integer('transaction_id').references(() => transactions.id),
  categoryId: integer('category_id').references(() => categories.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  groupIdx: index('split_expenses_group_id_idx').on(t.groupId),
}));

// ─────────────────────────── split_shares ───────────────────────────
export const splitShares = pgTable(
  'split_shares',
  {
    id: serial('id').primaryKey(),
    expenseId: integer('expense_id')
      .references(() => splitExpenses.id, { onDelete: 'cascade' })
      .notNull(),
    memberId: integer('member_id')
      .references(() => splitMembers.id, { onDelete: 'cascade' })
      .notNull(),
    amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
    isSettled: boolean('is_settled').default(false).notNull(),
    settledAt: timestamp('settled_at'),
  },
  (t) => ({
    uniqueExpenseMember: unique().on(t.expenseId, t.memberId),
  }),
);

// ───────────────────────── split_settlements ────────────────────────
// Liquidaciones entre dos miembros de un grupo. Persisten el pago y, cuando
// involucran al usuario (is_me), enlazan la transacción de cuenta generada.
export const splitSettlements = pgTable('split_settlements', {
  id: serial('id').primaryKey(),
  groupId: integer('group_id')
    .references(() => splitGroups.id, { onDelete: 'cascade' })
    .notNull(),
  fromMemberId: integer('from_member_id')
    .references(() => splitMembers.id)
    .notNull(),
  toMemberId: integer('to_member_id')
    .references(() => splitMembers.id)
    .notNull(),
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  date: date('date').notNull(),
  accountId: integer('account_id').references(() => accounts.id),
  transactionId: integer('transaction_id').references(() => transactions.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  groupIdx: index('split_settlements_group_id_idx').on(t.groupId),
}));

// ───────────────────────────── relations ────────────────────────────
export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  categories: many(categories),
  transactions: many(transactions),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
  transactions: many(transactions),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: 'category_parent',
  }),
  children: many(categories, { relationName: 'category_parent' }),
  transactions: many(transactions),
}));

export const savingsGoalsRelations = relations(savingsGoals, ({ one, many }) => ({
  account: one(accounts, {
    fields: [savingsGoals.accountId],
    references: [accounts.id],
  }),
  contributions: many(savingsContributions),
}));

export const savingsContributionsRelations = relations(savingsContributions, ({ one }) => ({
  goal: one(savingsGoals, {
    fields: [savingsContributions.goalId],
    references: [savingsGoals.id],
  }),
  transaction: one(transactions, {
    fields: [savingsContributions.transactionId],
    references: [transactions.id],
  }),
}));

export const debtsRelations = relations(debts, ({ one, many }) => ({
  account: one(accounts, {
    fields: [debts.accountId],
    references: [accounts.id],
  }),
  payments: many(debtPayments),
}));

export const debtPaymentsRelations = relations(debtPayments, ({ one }) => ({
  debt: one(debts, {
    fields: [debtPayments.debtId],
    references: [debts.id],
  }),
  transaction: one(transactions, {
    fields: [debtPayments.transactionId],
    references: [transactions.id],
  }),
}));

export const budgetsRelations = relations(budgets, ({ one }) => ({
  category: one(categories, {
    fields: [budgets.categoryId],
    references: [categories.id],
  }),
}));

export const creditCardStatementsRelations = relations(creditCardStatements, ({ one }) => ({
  account: one(accounts, {
    fields: [creditCardStatements.accountId],
    references: [accounts.id],
  }),
  debt: one(debts, {
    fields: [creditCardStatements.debtId],
    references: [debts.id],
  }),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  transactionTags: many(transactionTags),
}));

export const transactionTagsRelations = relations(transactionTags, ({ one }) => ({
  transaction: one(transactions, {
    fields: [transactionTags.transactionId],
    references: [transactions.id],
  }),
  tag: one(tags, {
    fields: [transactionTags.tagId],
    references: [tags.id],
  }),
}));

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
  transactionTags: many(transactionTags),
  account: one(accounts, {
    fields: [transactions.accountId],
    references: [accounts.id],
  }),
  toAccount: one(accounts, {
    fields: [transactions.toAccountId],
    references: [accounts.id],
  }),
  category: one(categories, {
    fields: [transactions.categoryId],
    references: [categories.id],
  }),
  debt: one(debts, {
    fields: [transactions.debtId],
    references: [debts.id],
  }),
}));

export const templatesRelations = relations(templates, ({ one }) => ({
  account: one(accounts, {
    fields: [templates.accountId],
    references: [accounts.id],
  }),
  category: one(categories, {
    fields: [templates.categoryId],
    references: [categories.id],
  }),
}));

export const splitGroupsRelations = relations(splitGroups, ({ many }) => ({
  members: many(splitMembers),
  expenses: many(splitExpenses),
}));

export const splitMembersRelations = relations(splitMembers, ({ one, many }) => ({
  group: one(splitGroups, {
    fields: [splitMembers.groupId],
    references: [splitGroups.id],
  }),
  shares: many(splitShares),
}));

export const splitExpensesRelations = relations(splitExpenses, ({ one, many }) => ({
  group: one(splitGroups, {
    fields: [splitExpenses.groupId],
    references: [splitGroups.id],
  }),
  paidBy: one(splitMembers, {
    fields: [splitExpenses.paidByMemberId],
    references: [splitMembers.id],
  }),
  category: one(categories, {
    fields: [splitExpenses.categoryId],
    references: [categories.id],
  }),
  transaction: one(transactions, {
    fields: [splitExpenses.transactionId],
    references: [transactions.id],
  }),
  shares: many(splitShares),
}));

export const splitSharesRelations = relations(splitShares, ({ one }) => ({
  expense: one(splitExpenses, {
    fields: [splitShares.expenseId],
    references: [splitExpenses.id],
  }),
  member: one(splitMembers, {
    fields: [splitShares.memberId],
    references: [splitMembers.id],
  }),
}));

export const splitSettlementsRelations = relations(splitSettlements, ({ one }) => ({
  group: one(splitGroups, {
    fields: [splitSettlements.groupId],
    references: [splitGroups.id],
  }),
  fromMember: one(splitMembers, {
    fields: [splitSettlements.fromMemberId],
    references: [splitMembers.id],
  }),
  toMember: one(splitMembers, {
    fields: [splitSettlements.toMemberId],
    references: [splitMembers.id],
  }),
  transaction: one(transactions, {
    fields: [splitSettlements.transactionId],
    references: [transactions.id],
  }),
}));

// ─────────────────────────────── types ──────────────────────────────
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type PasswordReset = typeof passwordResets.$inferSelect;
export type NewPasswordReset = typeof passwordResets.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Template = typeof templates.$inferSelect;
export type NewTemplate = typeof templates.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type TransactionTag = typeof transactionTags.$inferSelect;
export type NewTransactionTag = typeof transactionTags.$inferInsert;
export type SavingsGoal = typeof savingsGoals.$inferSelect;
export type NewSavingsGoal = typeof savingsGoals.$inferInsert;
export type SavingsContribution = typeof savingsContributions.$inferSelect;
export type NewSavingsContribution = typeof savingsContributions.$inferInsert;
export type Debt = typeof debts.$inferSelect;
export type NewDebt = typeof debts.$inferInsert;
export type DebtPayment = typeof debtPayments.$inferSelect;
export type NewDebtPayment = typeof debtPayments.$inferInsert;
export type SplitGroup = typeof splitGroups.$inferSelect;
export type NewSplitGroup = typeof splitGroups.$inferInsert;
export type SplitMember = typeof splitMembers.$inferSelect;
export type NewSplitMember = typeof splitMembers.$inferInsert;
export type SplitExpense = typeof splitExpenses.$inferSelect;
export type NewSplitExpense = typeof splitExpenses.$inferInsert;
export type SplitShare = typeof splitShares.$inferSelect;
export type NewSplitShare = typeof splitShares.$inferInsert;
export type SplitSettlement = typeof splitSettlements.$inferSelect;
export type NewSplitSettlement = typeof splitSettlements.$inferInsert;
export type ExchangeRate = typeof exchangeRates.$inferSelect;
export type NewExchangeRate = typeof exchangeRates.$inferInsert;
export type Budget = typeof budgets.$inferSelect;
export type NewBudget = typeof budgets.$inferInsert;
export type CreditCardStatement = typeof creditCardStatements.$inferSelect;
export type NewCreditCardStatement = typeof creditCardStatements.$inferInsert;
