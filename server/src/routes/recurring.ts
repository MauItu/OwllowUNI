import { Router } from 'express';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/connection.js';
import {
  recurringRules,
  recurringRuleTags,
  accounts,
  categories,
  tags,
  type RecurringRule,
} from '../db/schema.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { parseId } from '../utils/parseId.js';
import { userId } from '../middleware/auth.js';
import { getOwnedAccount, assertCategoryOwned, assertTagsOwned } from '../utils/ownership.js';
import { nextOccurrence, parseYmd, ymd, type Frequency } from '../utils/recurrence.js';
import { materializeRecurringCharges } from '../services/recurring.js';
import { accountDisplayName } from '../utils/accountDisplay.js';

export const recurringRouter = Router();

/**
 * Router de acciones recurrentes (montado en /api/recurring). Separado de
 * /api/recurring-rules porque opera sobre el motor, no sobre el CRUD de reglas.
 */
export const recurringActionsRouter = Router();

// POST /api/recurring/catch-up — materializa los cargos pendientes del usuario.
// Lo llama el mobile UNA vez al abrir la app (Render free puede dormir y el cron
// no corrió). Idempotente: si no hay nada pendiente devuelve generatedCount: 0.
recurringActionsRouter.post(
  '/catch-up',
  asyncHandler(async (req, res) => {
    const generatedCount = await materializeRecurringCharges(userId(req));
    res.json({ generatedCount });
  }),
);

const FREQUENCIES = ['daily', 'weekly', 'biweekly', 'monthly', 'yearly'] as const;

const ruleSchema = z.object({
  accountId: z.number().int(),
  type: z.enum(['expense', 'income']),
  amount: z.coerce.number().positive(),
  description: z.string().max(255).optional().nullable(),
  categoryId: z.number().int().optional().nullable(),
  frequency: z.enum(FREQUENCIES),
  dayOfMonth: z.coerce.number().int().min(1).max(31).optional().nullable(),
  dayOfWeek: z.coerce.number().int().min(0).max(6).optional().nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  tagIds: z.array(z.number().int()).optional(),
});
type RuleInput = z.infer<typeof ruleSchema>;

/** Etiquetas de un conjunto de reglas, agrupadas por id de regla. */
async function tagsByRule(ruleIds: number[]) {
  const map = new Map<number, { id: number; name: string; color: string; icon: string }[]>();
  if (ruleIds.length === 0) return map;
  const rows = await db
    .select({
      ruleId: recurringRuleTags.ruleId,
      id: tags.id,
      name: tags.name,
      color: tags.color,
      icon: tags.icon,
    })
    .from(recurringRuleTags)
    .innerJoin(tags, eq(recurringRuleTags.tagId, tags.id))
    .where(inArray(recurringRuleTags.ruleId, ruleIds));
  for (const r of rows) {
    if (!map.has(r.ruleId)) map.set(r.ruleId, []);
    map.get(r.ruleId)!.push({ id: r.id, name: r.name, color: r.color, icon: r.icon });
  }
  return map;
}

/**
 * Normaliza los campos de día según la frecuencia y valida coherencia:
 *  - monthly/yearly usan dayOfMonth (default = día de startDate); dayOfWeek = null.
 *  - weekly/biweekly usan dayOfWeek (default = día de la semana de startDate); dayOfMonth = null.
 *  - daily: ambos null.
 * Valida también que endDate (si viene) no sea anterior a startDate.
 */
function normalizeDays(data: RuleInput): { dayOfMonth: number | null; dayOfWeek: number | null } {
  if (data.endDate && data.endDate < data.startDate) {
    throw new ApiError(400, 'La fecha de fin no puede ser anterior a la de inicio');
  }
  const startDay = parseYmd(data.startDate);
  switch (data.frequency as Frequency) {
    case 'monthly':
    case 'yearly':
      return { dayOfMonth: data.dayOfMonth ?? startDay.getDate(), dayOfWeek: null };
    case 'weekly':
    case 'biweekly':
      return { dayOfMonth: null, dayOfWeek: data.dayOfWeek ?? startDay.getDay() };
    default:
      return { dayOfMonth: null, dayOfWeek: null };
  }
}

/** Cursor inicial: el día ANTERIOR a startDate (permite backfill desde startDate). */
function initialCursor(startDate: string): string {
  const d = parseYmd(startDate);
  return ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
}

/** Enriquecimiento común: tags + próxima fecha de cobro. */
function decorate(rule: RecurringRule, tagsForRule: { id: number; name: string; color: string; icon: string }[]) {
  return {
    ...rule,
    tags: tagsForRule,
    // Una regla pausada no se materializa: no anunciar un "próximo cobro" engañoso.
    nextDate: rule.isActive
      ? nextOccurrence(
          {
            frequency: rule.frequency as Frequency,
            dayOfMonth: rule.dayOfMonth,
            dayOfWeek: rule.dayOfWeek,
            startDate: rule.startDate,
            endDate: rule.endDate,
          },
          ymd(new Date()),
        )
      : null,
  };
}

// GET /api/recurring-rules — lista del usuario (activas e inactivas)
recurringRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const rows = await db
      .select({
        rule: recurringRules,
        accountName: accountDisplayName(accounts.name, accounts.isActive),
        accountType: accounts.type,
        categoryName: categories.name,
        categoryColor: categories.color,
        categoryIcon: categories.icon,
      })
      .from(recurringRules)
      .leftJoin(accounts, eq(recurringRules.accountId, accounts.id))
      .leftJoin(categories, eq(recurringRules.categoryId, categories.id))
      .where(eq(recurringRules.userId, uid))
      .orderBy(desc(recurringRules.isActive), desc(recurringRules.createdAt))
      .limit(200);

    const ruleTags = await tagsByRule(rows.map((r) => r.rule.id));
    res.json(
      rows.map((r) => ({
        ...decorate(r.rule, ruleTags.get(r.rule.id) ?? []),
        accountName: r.accountName,
        accountType: r.accountType,
        categoryName: r.categoryName,
        categoryColor: r.categoryColor,
        categoryIcon: r.categoryIcon,
      })),
    );
  }),
);

// POST /api/recurring-rules — crea una regla recurrente
recurringRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const data = ruleSchema.parse(req.body);

    const acc = await getOwnedAccount(uid, data.accountId);
    await assertCategoryOwned(uid, data.categoryId);
    await assertTagsOwned(uid, data.tagIds);
    if (data.type === 'income' && acc.type === 'credit_card') {
      throw new ApiError(400, 'No puedes registrar un ingreso recurrente en una tarjeta de crédito');
    }
    const { dayOfMonth, dayOfWeek } = normalizeDays(data);

    const [rule] = await db
      .insert(recurringRules)
      .values({
        userId: uid,
        accountId: data.accountId,
        type: data.type,
        amount: data.amount.toFixed(2),
        description: data.description ?? null,
        categoryId: data.categoryId ?? null,
        frequency: data.frequency,
        dayOfMonth,
        dayOfWeek,
        startDate: data.startDate,
        endDate: data.endDate ?? null,
        lastGeneratedDate: initialCursor(data.startDate),
      })
      .returning();

    if (data.tagIds && data.tagIds.length > 0) {
      const uniqueTagIds = [...new Set(data.tagIds)];
      try {
        await db
          .insert(recurringRuleTags)
          .values(uniqueTagIds.map((tagId) => ({ ruleId: rule.id, tagId })));
      } catch (err) {
        // La regla aún no tiene transacciones generadas: borrarla deja todo limpio.
        await db.delete(recurringRules).where(eq(recurringRules.id, rule.id));
        throw err;
      }
    }

    const ruleTags = await tagsByRule([rule.id]);
    res.status(201).json(decorate(rule, ruleTags.get(rule.id) ?? []));
  }),
);

// PUT /api/recurring-rules/:id — edita una regla. NO toca el cursor
// (last_generated_date) ni los registros ya generados: así cambiar
// frequency/dayOfMonth/dayOfWeek no duplica cargos. Nota: mover startDate hacia
// atrás NO hace backfill retroactivo (el cursor ya pasó esa fecha); para regenerar
// histórico habría que crear una regla nueva.
recurringRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const id = parseId(req.params.id);
    const data = ruleSchema.parse(req.body);

    const [existing] = await db
      .select()
      .from(recurringRules)
      .where(and(eq(recurringRules.id, id), eq(recurringRules.userId, uid)));
    if (!existing) throw new ApiError(404, 'Regla recurrente no encontrada');

    const acc = await getOwnedAccount(uid, data.accountId);
    await assertCategoryOwned(uid, data.categoryId);
    await assertTagsOwned(uid, data.tagIds);
    if (data.type === 'income' && acc.type === 'credit_card') {
      throw new ApiError(400, 'No puedes registrar un ingreso recurrente en una tarjeta de crédito');
    }
    const { dayOfMonth, dayOfWeek } = normalizeDays(data);

    const [rule] = await db
      .update(recurringRules)
      .set({
        accountId: data.accountId,
        type: data.type,
        amount: data.amount.toFixed(2),
        description: data.description ?? null,
        categoryId: data.categoryId ?? null,
        frequency: data.frequency,
        dayOfMonth,
        dayOfWeek,
        startDate: data.startDate,
        endDate: data.endDate ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(recurringRules.id, id), eq(recurringRules.userId, uid)))
      .returning();

    if (data.tagIds) {
      const stmts: unknown[] = [
        db.delete(recurringRuleTags).where(eq(recurringRuleTags.ruleId, id)),
      ];
      if (data.tagIds.length > 0) {
        const uniqueTagIds = [...new Set(data.tagIds)];
        stmts.push(
          db.insert(recurringRuleTags).values(uniqueTagIds.map((tagId) => ({ ruleId: id, tagId }))),
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.batch(stmts as any);
    }

    const ruleTags = await tagsByRule([id]);
    res.json(decorate(rule, ruleTags.get(id) ?? []));
  }),
);

// PATCH /api/recurring-rules/:id/toggle — pausa/activa
recurringRouter.patch(
  '/:id/toggle',
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const id = parseId(req.params.id);
    const [rule] = await db
      .update(recurringRules)
      .set({ isActive: sql`NOT ${recurringRules.isActive}`, updatedAt: new Date() })
      .where(and(eq(recurringRules.id, id), eq(recurringRules.userId, uid)))
      .returning();
    if (!rule) throw new ApiError(404, 'Regla recurrente no encontrada');
    const ruleTags = await tagsByRule([id]);
    res.json(decorate(rule, ruleTags.get(id) ?? []));
  }),
);

// DELETE /api/recurring-rules/:id — borra la regla. NO borra las transacciones ya
// generadas (transactions.recurring_rule_id queda en NULL por el FK SET NULL); las
// filas de recurring_rule_tags se borran por CASCADE.
recurringRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const id = parseId(req.params.id);
    const [deleted] = await db
      .delete(recurringRules)
      .where(and(eq(recurringRules.id, id), eq(recurringRules.userId, uid)))
      .returning({ id: recurringRules.id });
    if (!deleted) throw new ApiError(404, 'Regla recurrente no encontrada');
    res.json({ success: true });
  }),
);
