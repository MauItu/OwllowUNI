// Validación de entorno: PRIMERO de todo. Si falta/está mal, el proceso muere
// con un mensaje claro antes de levantar nada (ver utils/validateEnv.ts).
import './utils/validateEnv.js';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import { sql } from 'drizzle-orm';
import { db } from './db/connection.js';
import { requestLogger } from './middleware/requestLogger.js';
import { accountsRouter } from './routes/accounts.js';
import { categoriesRouter } from './routes/categories.js';
import { transactionsRouter } from './routes/transactions.js';
import { templatesRouter } from './routes/templates.js';
import { statsRouter } from './routes/stats.js';
import { tagsRouter } from './routes/tags.js';
import { savingsRouter } from './routes/savings.js';
import { debtsRouter } from './routes/debts.js';
import { budgetsRouter } from './routes/budgets.js';
import { splitsRouter } from './routes/splits.js';
import { insightsRouter } from './routes/insights.js';
import { ratesRouter } from './routes/rates.js';
import { authRouter } from './routes/auth.js';
import { passwordResetRouter } from './routes/password-reset.js';
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

// Detrás del proxy de Render (1 hop): permite que `req.ip` (y por tanto el rate
// limiting por IP) use el X-Forwarded-For real. Valor numérico, no `true`, para no
// disparar la validación de "trust proxy permisivo" de express-rate-limit.
app.set('trust proxy', 1);

// Headers de seguridad (X-Content-Type-Options, X-Frame-Options, HSTS, etc.).
// Va ANTES de CORS para que aplique a todas las respuestas.
app.use(helmet());

// Logging HTTP mínimo (mide el tiempo de cada request). En prod solo lo lento/errores.
app.use(requestLogger);

// Compresión gzip de las respuestas (threshold 1kb por defecto): aligera mucho los
// payloads grandes (export, listas largas, insights). Después de helmet, antes de rutas.
app.use(compression());

// CORS: si `CORS_ORIGINS` (lista separada por comas) está definida, se restringe
// a esos orígenes; si no, se permite cualquiera (default de dev). Las apps nativas
// no envían header Origin, así que el móvil no se ve afectado en ningún caso.
const corsOrigins = process.env.CORS_ORIGINS?.split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors(corsOrigins && corsOrigins.length ? { origin: corsOrigins } : {}));
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ name: 'Wallet Clone API', status: 'ok', version: '1.0.0' });
});
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Health check con verificación de DB (sin auth): para monitoreo y health checks
// de deploy (Render). Un SELECT 1 confirma la conectividad con Neon.
app.get('/api/health', async (_req, res) => {
  try {
    await db.execute(sql`SELECT 1`);
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[health] verificación de DB falló:', err);
    res.status(503).json({ status: 'degraded', error: 'Database unreachable' });
  }
});

// Autenticación (público).
app.use('/api/auth', authRouter);
// Recuperación de contraseña por email (público): forgot/verify/reset.
app.use('/api/auth', passwordResetRouter);

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
app.use('/api/budgets', authenticate, invalidateOnMutation, budgetsRouter);
app.use('/api/splits', authenticate, invalidateOnMutation, splitsRouter);
app.use('/api/insights', authenticate, cacheResponse(INSIGHTS_TTL_MS), insightsRouter);
app.use('/api/rates', authenticate, invalidateOnMutation, ratesRouter);

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 API escuchando en http://localhost:${PORT}`);
});

// ── Graceful shutdown ──
// Ante SIGTERM/SIGINT (deploy en Render, Ctrl-C): dejar de aceptar conexiones
// nuevas y esperar hasta 10s a que terminen las requests en vuelo (no cortar una
// saga a la mitad). Si no terminan a tiempo, salida forzada.
let shuttingDown = false;
function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Recibido ${signal}: cerrando servidor (drenando requests en vuelo)…`);
  server.close(() => {
    console.log('Servidor cerrado limpiamente');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Cierre forzado: requests en vuelo no terminaron en 10s');
    process.exit(1);
  }, 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ── Handlers de último recurso a nivel de proceso ──
// Una promesa rechazada sin catch o una excepción no atrapada matarían el proceso
// sin rastro. Los logueamos con todo el detalle. En `uncaughtException` el estado
// del proceso es indeterminado: se sale con código 1 tras 1s para que el log
// alcance a flushear (y un orquestador/PM2/Render reinicie el server).
process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection — promesa rechazada sin catch:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('uncaughtException — excepción no atrapada:', err);
  setTimeout(() => process.exit(1), 1000).unref();
});
