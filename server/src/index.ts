import express from 'express';
import cors from 'cors';
import { accountsRouter } from './routes/accounts.js';
import { categoriesRouter } from './routes/categories.js';
import { transactionsRouter } from './routes/transactions.js';
import { templatesRouter } from './routes/templates.js';
import { statsRouter } from './routes/stats.js';
import { tagsRouter } from './routes/tags.js';
import { savingsRouter } from './routes/savings.js';
import { debtsRouter } from './routes/debts.js';
import { splitsRouter } from './routes/splits.js';
import { insightsRouter } from './routes/insights.js';
import { ratesRouter } from './routes/rates.js';
import { authRouter } from './routes/auth.js';
import { authenticate } from './middleware/auth.js';
import {
  invalidateOnMutation,
  cacheResponse,
  STATS_TTL_MS,
  INSIGHTS_TTL_MS,
} from './services/cache.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ name: 'Wallet Clone API', status: 'ok', version: '1.0.0' });
});
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Autenticación (público).
app.use('/api/auth', authRouter);

// Todas las demás rutas requieren un JWT válido (inyecta req.user).
// `invalidateOnMutation` sube el sello de versión del usuario tras cada mutación
// 2xx → invalida su caché en proceso. `cacheResponse` cachea los GET caros.
app.use('/api/accounts', authenticate, invalidateOnMutation, accountsRouter);
app.use('/api/categories', authenticate, invalidateOnMutation, categoriesRouter);
app.use('/api/transactions', authenticate, invalidateOnMutation, transactionsRouter);
app.use('/api/templates', authenticate, invalidateOnMutation, templatesRouter);
app.use('/api/stats', authenticate, cacheResponse(STATS_TTL_MS), statsRouter);
app.use('/api/tags', authenticate, invalidateOnMutation, tagsRouter);
app.use('/api/savings', authenticate, invalidateOnMutation, savingsRouter);
app.use('/api/debts', authenticate, invalidateOnMutation, debtsRouter);
app.use('/api/splits', authenticate, invalidateOnMutation, splitsRouter);
app.use('/api/insights', authenticate, cacheResponse(INSIGHTS_TTL_MS), insightsRouter);
app.use('/api/rates', authenticate, invalidateOnMutation, ratesRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 API escuchando en http://localhost:${PORT}`);
});
