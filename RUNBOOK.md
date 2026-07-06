# RUNBOOK — Operación de Wallet en producción

> Guía operativa: deploy, migraciones, rollback, backups, alertas y reconciliación.
> Complementa `DEPLOY_AND_APK.md` (setup inicial de Render/EAS con valores reales).

## Mapa del entorno

| Pieza | Dónde | Notas |
|---|---|---|
| API | Render — `https://wallet-7v82.onrender.com` | Auto-deploy desde `main`; build `tsc` → `node dist/index.js` |
| DB | Neon PostgreSQL | `DATABASE_URL` (env de Render y `.env` local) |
| App | APK vía EAS Build (perfil `preview`/`production`) | Ambos perfiles inyectan `EXPO_PUBLIC_API_URL` |
| CI | GitHub Actions (`.github/workflows/ci.yml`) | Typecheck server+mobile y tests del server en PRs y push a `main` |

### Variables de entorno del server (Render)

| Var | Obligatoria | Efecto |
|---|---|---|
| `DATABASE_URL` | ✅ | Neon. El server NO arranca sin ella |
| `JWT_SECRET` | ✅ (≥32 chars) | Firma de sesiones. **Rotarla desloguea a todos** |
| `JWT_EXPIRATION` | no (default `7d`) | Vida del token |
| `NODE_ENV` | `production` | Rate limits reales, logs mínimos, CORS cerrado |
| `CORS_ORIGINS` | no | Orígenes web permitidos. Si falta en producción, se niega CORS de navegador; el APK no se afecta |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | no mientras reset esté apagado | Recuperación de contraseña deshabilitada temporalmente; configurar solo al reactivarla |
| `ALERT_WEBHOOK_URL` | recomendada | Webhook (Discord/Slack/ntfy) para alertas críticas |
| `ADMIN_PASSWORD` | solo para `db:seed` | No la usa el runtime |

## Deploy (código)

1. PR hacia `main` → CI debe pasar (typecheck ×2 + tests).
2. Merge a `main` → Render despliega automáticamente.
3. Verificar: `curl https://wallet-7v82.onrender.com/api/health` → `{"status":"ok",...}`.
4. El deploy drena requests en vuelo (graceful shutdown, 10 s) y detiene el cron antes de cerrar.

## Migraciones de DB

Las migraciones (`server/drizzle/`) son **aditivas por convención** (solo `ADD COLUMN`/`CREATE INDEX`/tablas nuevas): el código viejo tolera el schema nuevo, así que **la migración se aplica ANTES del deploy** y sin ventana de mantenimiento.

```bash
cd server
pnpm db:generate     # tras cambiar src/db/schema.ts
# revisar el SQL generado en drizzle/NNNN_*.sql (¡que sea aditivo!)
pnpm db:migrate      # aplica contra la DATABASE_URL del .env raíz
```

- Quién: el desarrollador, desde local, con la `DATABASE_URL` de producción en el `.env` raíz.
- Estado del repo al 2026-07-04: migraciones versionadas hasta `0024_regular_drax.sql`. No asumir
  documentación antigua que hable solo de `0000`→`0009`.
- Si una migración necesita ser destructiva (DROP/ALTER TYPE): plan aparte con backup previo y deploy coordinado. Hasta hoy nunca ha hecho falta.
- Estado aplicado: tabla `drizzle.__drizzle_migrations` (o comparar contra `drizzle/meta/_journal.json`).
- Pendiente conocido: `accounts_balance_nonnegative` (0021) está `NOT VALID` (verificado 2026-07-04);
  las cuentas 11 y 15 (ambas "Efectivo", usuarios 5 y 6) siguen con saldo negativo histórico.
  Reparación recomendada — `allow_overdraft = true` preserva la historia de transacciones y mantiene
  la reconciliación consistente (poner el saldo en 0 la rompería):

  ```sql
  -- 1. Confirmar que siguen siendo solo estas dos:
  SELECT id, user_id, current_balance FROM accounts
   WHERE allow_overdraft = false AND current_balance::numeric < 0;
  -- 2. Reparar sin tocar saldos ni transacciones:
  UPDATE accounts SET allow_overdraft = true, updated_at = now() WHERE id IN (11, 15);
  -- 3. Activar la protección para TODAS las filas:
  ALTER TABLE accounts VALIDATE CONSTRAINT accounts_balance_nonnegative;
  -- 4. Verificar (convalidated debe ser t):
  SELECT conname, convalidated FROM pg_constraint
   WHERE conname = 'accounts_balance_nonnegative';
  ```

## Rollback

**Código:** Render → Deploys → *Rollback* al deploy anterior (o revert del commit en `main`). Seguro siempre, porque las migraciones son aditivas: el código viejo ignora columnas/tablas nuevas.

**DB:** no hay rollback de migraciones (drizzle no genera down). Opciones:
1. Si la migración era aditiva y el problema es el código → rollback solo de código.
2. Si hay corrupción de datos → restore de Neon (abajo) o reparación manual guiada por la reconciliación.

## Backups y restore (Neon)

- Neon mantiene point-in-time restore según el plan (free: ventana corta, ~24 h). Restore: consola de Neon → Branches → *Restore* / crear branch desde un punto en el tiempo, verificar, y promover o re-apuntar `DATABASE_URL`.
- Para retención larga (recomendado antes de crecer la base de usuarios): dump lógico periódico
  `pg_dump "$DATABASE_URL" -Fc -f wallet-$(date +%F).dump` (cron local o GitHub Action con secret).
- **Probar el restore al menos una vez** antes de la beta pública (crear branch desde ayer y correr la reconciliación sobre él).

## Alertas y monitoreo

- **Health checks:** `GET /health` (liveness) y `GET /api/health` (hace `SELECT 1` a Neon; 503 = DB caída). Configurar un monitor externo gratuito (UptimeRobot/BetterStack) hacia `/api/health`.
- **Webhook de alertas (`ALERT_WEBHOOK_URL`):** el server envía eventos críticos (sin dependencias):
  - `COMPENSACIÓN FALLIDA` — una saga no pudo revertirse: **hay que reconciliar a mano** (ver abajo). Es la alerta más importante del sistema.
  - `uncaughtException` / `unhandledRejection` — el proceso crasheó/reinició.
  - Crear un webhook de Discord (Server Settings → Integrations → Webhooks) o un topic de ntfy.sh y pegar la URL en Render.
- **Logs:** Render → Logs. En producción el `requestLogger` solo imprime requests lentos (>1 s) o con status ≥400.
- **Siguiente paso (pendiente):** Sentry (`@sentry/node` + `sentry-expo`) para agrupación de errores y crashes del APK. Requiere cuenta/DSN y rebuild del APK; el webhook cubre lo crítico mientras tanto.

## Reconciliación de saldos

`GET /api/admin/reconcile` (requiere JWT de un usuario `is_admin`; opcional `?userId=N`) compara el `current_balance` de cada cuenta contra la suma de su historial. Correrla:
- Tras una alerta de `COMPENSACIÓN FALLIDA`.
- Periódicamente (p. ej. 1×/semana durante la beta).

Interpretación: `diff ≠ 0` en cuenta de **débito** = inconsistencia real (buscar la operación en logs y corregir el saldo con un UPDATE manual documentado). En **tarjeta** puede haber diffs legítimos (edición de límite, historia pre-modelo-0014): revisar antes de tocar.

Estado conocido (2026-07-04): 19/20 cuentas en 0.00; 1 tarjeta (`accounts.id=18`, user 4) con diff −2.9M por revisar (histórico).

## Incidentes comunes

| Síntoma | Causa probable | Acción |
|---|---|---|
| App muestra "Conectando con el servidor…" y tarda | Cold start de Render free (~10-30 s) | Normal; el cliente reintenta solo. Solución de fondo: instancia de pago |
| 503 en `/api/auth/forgot-password` | Recuperación deshabilitada temporalmente | Esperado mientras `PASSWORD_RESET_ENABLED=false`; reactivar y configurar `GMAIL_*` cuando se retome |
| Todos los usuarios deslogueados | Se rotó `JWT_SECRET` o bump masivo de `token_version` | Esperado tras rotación; comunicar |
| 429 masivos | Rate limit global (1000/15min/IP) — NAT de operador | Subir `limit` del `globalLimiter` con criterio |
| Cargos recurrentes no aparecen | Render free durmió y el usuario no abrió la app (catch-up) | Esperado en free; el cron corre al despertar. Fondo: instancia de pago |
| `password authentication failed` al migrar | Credenciales de Neon rotadas | Copiar la connection string vigente del dashboard de Neon al `.env` |

## Checklist antes de ampliar la beta

- [ ] Antes de reactivar recuperación: `GMAIL_*` configuradas y flujo de reset probado E2E en prod.
- [ ] `ALERT_WEBHOOK_URL` configurada y alerta de prueba recibida.
- [ ] Monitor externo sobre `/api/health`.
- [ ] Reconciliación en 0 diffs (o diffs documentados).
- [ ] `VALIDATE CONSTRAINT accounts_balance_nonnegative` tras reparar los saldos históricos.
- [ ] Restore de Neon probado una vez.
- [ ] APK `preview` reciente distribuido con el backend actual.
