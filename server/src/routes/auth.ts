import { Router } from 'express';
import { eq, sql, inArray } from 'drizzle-orm';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '../db/connection.js';
import {
  users,
  accounts,
  categories,
  transactions,
  templates,
  tags,
  savingsGoals,
  savingsContributions,
  debts,
  debtPayments,
  budgets,
  splitGroups,
  splitMembers,
  splitExpenses,
  splitSettlements,
  exchangeRates,
  passwordResets,
  recurringRules,
  creditCardStatements,
  styleVotes,
  type User,
} from '../db/schema.js';
import { provisionUserDefaults } from '../db/defaults.js';
import { asyncHandler, ApiError, isUniqueViolation } from '../middleware/errorHandler.js';
import {
  authenticate,
  signToken,
  userId,
  invalidateTokenVersionCache,
} from '../middleware/auth.js';
import { loginLimiter, registerLimiter, profileLimiter } from '../middleware/rateLimiter.js';
import { BCRYPT_ROUNDS, MIN_PASSWORD_LENGTH } from '../utils/constants.js';

export const authRouter = Router();

/** Datos públicos del usuario (nunca el hash de la contraseña). */
function publicUser(u: User) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    isAdmin: u.isAdmin,
    createdAt: u.createdAt,
  };
}

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('Correo inválido').max(255),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`)
    .max(200),
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(100),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Correo inválido').max(255),
  password: z.string().min(1, 'La contraseña es obligatoria').max(200),
});

const profileSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`)
      .max(200)
      .optional(),
    currentPassword: z.string().max(200).optional(),
  })
  .refine((d) => d.name !== undefined || d.password !== undefined, {
    message: 'No hay cambios para guardar',
  });

// POST /api/auth/register
authRouter.post(
  '/register',
  registerLimiter,
  asyncHandler(async (req, res) => {
    const data = registerSchema.parse(req.body);

    const [existing] = await db.select().from(users).where(eq(users.email, data.email));
    if (existing) throw new ApiError(409, 'Ya existe una cuenta con ese correo');

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    // El check previo es best-effort; la fuente de verdad es el UNIQUE de users.email.
    // Mapeamos la violación (SQLSTATE 23505) a 409 para cubrir el registro concurrente.
    let user: User;
    try {
      [user] = await db
        .insert(users)
        .values({ email: data.email, passwordHash, name: data.name, isAdmin: false })
        .returning();
    } catch (err) {
      if (isUniqueViolation(err)) throw new ApiError(409, 'Ya existe una cuenta con ese correo');
      throw err;
    }

    // Provisiona las categorías por defecto y la cuenta "Efectivo" del usuario.
    await provisionUserDefaults(user.id);

    const token = signToken(
      { id: user.id, email: user.email, isAdmin: user.isAdmin },
      user.tokenVersion,
    );
    res.status(201).json({ token, user: publicUser(user) });
  }),
);

// POST /api/auth/login
authRouter.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const data = loginSchema.parse(req.body);

    const [user] = await db.select().from(users).where(eq(users.email, data.email));
    // Mensaje genérico para no filtrar si el correo existe.
    if (!user) throw new ApiError(401, 'Credenciales inválidas');
    const ok = await bcrypt.compare(data.password, user.passwordHash);
    if (!ok) throw new ApiError(401, 'Credenciales inválidas');

    const token = signToken(
      { id: user.id, email: user.email, isAdmin: user.isAdmin },
      user.tokenVersion,
    );
    res.json({ token, user: publicUser(user) });
  }),
);

// GET /api/auth/me — datos del usuario autenticado
authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const [user] = await db.select().from(users).where(eq(users.id, userId(req)));
    if (!user) throw new ApiError(404, 'Usuario no encontrado');
    res.json(publicUser(user));
  }),
);

// PUT /api/auth/profile — cambiar nombre y/o contraseña (verifica la actual)
authRouter.put(
  '/profile',
  authenticate,
  profileLimiter,
  asyncHandler(async (req, res) => {
    const data = profileSchema.parse(req.body);
    const [user] = await db.select().from(users).where(eq(users.id, userId(req)));
    if (!user) throw new ApiError(404, 'Usuario no encontrado');

    const updates: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };

    if (data.name !== undefined) updates.name = data.name;

    const changesPassword = data.password !== undefined;
    if (changesPassword) {
      // Cambiar contraseña exige la contraseña actual correcta.
      const ok = data.currentPassword
        ? await bcrypt.compare(data.currentPassword, user.passwordHash)
        : false;
      if (!ok) throw new ApiError(401, 'La contraseña actual es incorrecta');
      updates.passwordHash = await bcrypt.hash(data.password!, BCRYPT_ROUNDS);
      // Revoca TODAS las sesiones emitidas antes del cambio de contraseña.
      updates.tokenVersion = sql`${users.tokenVersion} + 1` as unknown as number;
    }

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, user.id))
      .returning();

    if (changesPassword) {
      invalidateTokenVersionCache(user.id);
      // El token de ESTA sesión también quedó revocado: se devuelve uno nuevo
      // para que el cliente lo reemplace y no sea deslogueado.
      const token = signToken(
        { id: updated.id, email: updated.email, isAdmin: updated.isAdmin },
        updated.tokenVersion,
      );
      res.json({ ...publicUser(updated), token });
      return;
    }
    res.json(publicUser(updated));
  }),
);

// ───────────────────── Export completo y borrado de cuenta ─────────────────────
// Derechos del titular de los datos (habeas data / requisito de Play Store):
// el usuario puede llevarse TODOS sus datos y eliminar su cuenta por completo.

/** Subqueries de pertenencia (ids de las entidades padre del usuario). */
function ownedIds(uid: number) {
  return {
    debtIds: db.select({ id: debts.id }).from(debts).where(eq(debts.userId, uid)),
    goalIds: db.select({ id: savingsGoals.id }).from(savingsGoals).where(eq(savingsGoals.userId, uid)),
    groupIds: db.select({ id: splitGroups.id }).from(splitGroups).where(eq(splitGroups.userId, uid)),
  };
}

// GET /api/auth/export — descarga TODOS los datos del usuario en un JSON.
// Las imágenes de recibos NO están aquí (viven solo en el dispositivo).
authRouter.get(
  '/export',
  authenticate,
  profileLimiter,
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const { debtIds, goalIds, groupIds } = ownedIds(uid);

    const [user] = await db.select().from(users).where(eq(users.id, uid));
    if (!user) throw new ApiError(404, 'Usuario no encontrado');

    const [
      accountRows,
      categoryRows,
      transactionRows,
      templateRows,
      tagRows,
      goalRows,
      contributionRows,
      debtRows,
      paymentRows,
      budgetRows,
      groupRows,
      memberRows,
      expenseRows,
      settlementRows,
      rateRows,
      ruleRows,
      statementRows,
    ] = await Promise.all([
      db.select().from(accounts).where(eq(accounts.userId, uid)),
      db.select().from(categories).where(eq(categories.userId, uid)),
      db.select().from(transactions).where(eq(transactions.userId, uid)),
      db.select().from(templates).where(eq(templates.userId, uid)),
      db.select().from(tags).where(eq(tags.userId, uid)),
      db.select().from(savingsGoals).where(eq(savingsGoals.userId, uid)),
      db.select().from(savingsContributions).where(inArray(savingsContributions.goalId, goalIds)),
      db.select().from(debts).where(eq(debts.userId, uid)),
      db.select().from(debtPayments).where(inArray(debtPayments.debtId, debtIds)),
      db.select().from(budgets).where(eq(budgets.userId, uid)),
      db.select().from(splitGroups).where(eq(splitGroups.userId, uid)),
      db.select().from(splitMembers).where(inArray(splitMembers.groupId, groupIds)),
      db.select().from(splitExpenses).where(inArray(splitExpenses.groupId, groupIds)),
      db.select().from(splitSettlements).where(inArray(splitSettlements.groupId, groupIds)),
      db.select().from(exchangeRates).where(eq(exchangeRates.userId, uid)),
      db.select().from(recurringRules).where(eq(recurringRules.userId, uid)),
      db.select().from(creditCardStatements).where(eq(creditCardStatements.userId, uid)),
    ]);

    res.setHeader('Content-Disposition', 'attachment; filename="mis-datos-wallet.json"');
    res.json({
      exportedAt: new Date().toISOString(),
      user: publicUser(user),
      accounts: accountRows,
      categories: categoryRows,
      transactions: transactionRows,
      templates: templateRows,
      tags: tagRows,
      savingsGoals: goalRows,
      savingsContributions: contributionRows,
      debts: debtRows,
      debtPayments: paymentRows,
      budgets: budgetRows,
      splitGroups: groupRows,
      splitMembers: memberRows,
      splitExpenses: expenseRows,
      splitSettlements: settlementRows,
      exchangeRates: rateRows,
      recurringRules: ruleRows,
      creditCardStatements: statementRows,
    });
  }),
);

const deleteAccountSchema = z.object({
  password: z.string().min(1, 'La contraseña es obligatoria').max(200),
});

// DELETE /api/auth/account — elimina la cuenta y TODOS los datos del usuario.
// Exige la contraseña actual. Un solo db.batch (transacción atómica): o se borra
// todo o no se borra nada. El orden respeta los FK sin CASCADE:
// hijas con FK a transactions → transactions → debts → padres → users.
authRouter.delete(
  '/account',
  authenticate,
  profileLimiter,
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const { password } = deleteAccountSchema.parse(req.body ?? {});

    const [user] = await db.select().from(users).where(eq(users.id, uid));
    if (!user) throw new ApiError(404, 'Usuario no encontrado');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new ApiError(401, 'Contraseña incorrecta');

    const { debtIds, goalIds, groupIds } = ownedIds(uid);

    await db.batch([
      // Hijas que referencian `transactions` sin CASCADE (deben ir antes).
      db.delete(debtPayments).where(inArray(debtPayments.debtId, debtIds)),
      db.delete(savingsContributions).where(inArray(savingsContributions.goalId, goalIds)),
      db.delete(splitSettlements).where(inArray(splitSettlements.groupId, groupIds)),
      db.delete(splitExpenses).where(inArray(splitExpenses.groupId, groupIds)), // shares por CASCADE
      db.delete(splitMembers).where(inArray(splitMembers.groupId, groupIds)),
      db.delete(splitGroups).where(eq(splitGroups.userId, uid)),
      db.delete(creditCardStatements).where(eq(creditCardStatements.userId, uid)),
      // transactions referencia debts (debt_id): va ANTES que debts.
      // transaction_tags cae por CASCADE; debts.initial_transaction_id es SET NULL.
      db.delete(transactions).where(eq(transactions.userId, uid)),
      db.delete(debts).where(eq(debts.userId, uid)),
      db.delete(savingsGoals).where(eq(savingsGoals.userId, uid)),
      // recurring_rules referencia accounts: va antes; rule_tags por CASCADE y
      // accounts.management_fee_rule_id es SET NULL.
      db.delete(recurringRules).where(eq(recurringRules.userId, uid)),
      db.delete(templates).where(eq(templates.userId, uid)),
      db.delete(budgets).where(eq(budgets.userId, uid)),
      db.delete(tags).where(eq(tags.userId, uid)),
      db.delete(accounts).where(eq(accounts.userId, uid)),
      db.delete(exchangeRates).where(eq(exchangeRates.userId, uid)),
      db.delete(passwordResets).where(eq(passwordResets.userId, uid)),
      db.delete(styleVotes).where(eq(styleVotes.userId, uid)),
      db.delete(categories).where(eq(categories.userId, uid)),
      db.delete(users).where(eq(users.id, uid)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);

    // Revocación inmediata: cualquier token vivo del usuario deja de valer.
    invalidateTokenVersionCache(uid);

    res.json({ message: 'Cuenta eliminada. Todos tus datos fueron borrados.' });
  }),
);
