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
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ name: 'Wallet Clone API', status: 'ok', version: '1.0.0' });
});
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/accounts', accountsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/stats', statsRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/savings', savingsRouter);
app.use('/api/debts', debtsRouter);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 API escuchando en http://localhost:${PORT}`);
});
