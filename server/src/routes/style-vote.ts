import { Router } from 'express';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { styleVotes } from '../db/schema.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { userId } from '../middleware/auth.js';

/**
 * Votación A/B del rediseño visual. Cada usuario vota una vez por la paleta que
 * prefiere como estilo definitivo; puede cambiar su voto (upsert por user_id).
 * Router montado con `authenticate` en index.ts. Feature temporal de producto.
 */
export const styleVoteRouter = Router();

// Los valores válidos son los paletteId candidatos (estables aunque cambie el
// label mostrado). Deben coincidir con VOTE_PALETTE_IDS del mobile.
const CHOICES = ['professional', 'indigo'] as const;
type Choice = (typeof CHOICES)[number];

const voteSchema = z.object({ choice: z.enum(CHOICES) });

/** Conteo por opción + mi voto, en la forma que consume el mobile. */
async function tally(uid: number) {
  const [mine] = await db
    .select({ choice: styleVotes.choice })
    .from(styleVotes)
    .where(eq(styleVotes.userId, uid));

  const rows = await db
    .select({ choice: styleVotes.choice, count: sql<number>`count(*)::int` })
    .from(styleVotes)
    .groupBy(styleVotes.choice);

  const tallies: Record<Choice, number> = { professional: 0, indigo: 0 };
  let total = 0;
  for (const r of rows) {
    if (r.choice === 'professional' || r.choice === 'indigo') {
      tallies[r.choice] = r.count;
      total += r.count;
    }
  }
  return { myVote: (mine?.choice as Choice | undefined) ?? null, tallies, total };
}

// GET /api/style-vote — mi voto + resultados en vivo.
styleVoteRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await tally(userId(req)));
  }),
);

// POST /api/style-vote — registra o cambia mi voto (upsert por user_id).
styleVoteRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { choice } = voteSchema.parse(req.body);
    const uid = userId(req);
    await db
      .insert(styleVotes)
      .values({ userId: uid, choice })
      .onConflictDoUpdate({
        target: styleVotes.userId,
        set: { choice, updatedAt: new Date() },
      });
    res.json(await tally(uid));
  }),
);
