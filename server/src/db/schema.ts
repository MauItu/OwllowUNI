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
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ───────────────────────────── accounts ─────────────────────────────
export const accounts = pgTable('accounts', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  type: varchar('type', { length: 30 }).notNull(), // bank | cash | credit_card | digital_wallet
  currency: varchar('currency', { length: 3 }).default('COP').notNull(),
  initialBalance: decimal('initial_balance', { precision: 15, scale: 2 }).default('0').notNull(),
  currentBalance: decimal('current_balance', { precision: 15, scale: 2 }).default('0').notNull(),
  color: varchar('color', { length: 7 }).default('#4F46E5').notNull(),
  icon: varchar('icon', { length: 50 }).default('wallet').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ──────────────────────────── categories ────────────────────────────
export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
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
});

// ─────────────────────────── transactions ───────────────────────────
export const transactions = pgTable('transactions', {
  id: serial('id').primaryKey(),
  type: varchar('type', { length: 10 }).notNull(), // income | expense | transfer
  amount: decimal('amount', { precision: 15, scale: 2 }).notNull(),
  description: varchar('description', { length: 255 }),
  date: date('date').notNull(),
  time: time('time').notNull(),
  accountId: integer('account_id')
    .references(() => accounts.id)
    .notNull(),
  toAccountId: integer('to_account_id').references(() => accounts.id),
  categoryId: integer('category_id').references(() => categories.id),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ───────────────────────────── templates ────────────────────────────
export const templates = pgTable('templates', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  type: varchar('type', { length: 10 }).notNull(), // income | expense
  amount: decimal('amount', { precision: 15, scale: 2 }),
  description: varchar('description', { length: 255 }),
  accountId: integer('account_id').references(() => accounts.id),
  categoryId: integer('category_id').references(() => categories.id),
  isActive: boolean('is_active').default(true).notNull(),
  useCount: integer('use_count').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─────────────────────────────── tags ───────────────────────────────
export const tags = pgTable('tags', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 50 }).notNull().unique(),
  color: varchar('color', { length: 7 }).default('#6C757D').notNull(),
  icon: varchar('icon', { length: 50 }).default('tag').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

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
  }),
);

// ───────────────────────────── relations ────────────────────────────
export const accountsRelations = relations(accounts, ({ many }) => ({
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

// ─────────────────────────────── types ──────────────────────────────
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
