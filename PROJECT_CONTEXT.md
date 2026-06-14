# PROJECT_CONTEXT.md — Wallet Clone (App de Gestión de Gastos)

> **Lee SOLO este archivo para tener todo el contexto del proyecto en futuras sesiones.**

Clon de la app "Wallet by BudgetBakers". Gestión de gastos personales.
APK Android con **React Native + Expo**, backend **Node.js + Express + Drizzle ORM**,
base de datos **PostgreSQL en NeonDB** (`DATABASE_URL` en `.env` raíz).
Package manager: **pnpm** en todo el monorepo. Toda la app en **español**. Moneda default: **COP**.

---

## ARQUITECTURA

```
wallet/                         ← raíz del repo
├── PROJECT_CONTEXT.md
├── .env                        ← DATABASE_URL (compartido por el backend)
├── server/                     ← Backend API REST (Express + Drizzle + Neon)
└── mobile/                     ← App React Native (Expo)
```

- El backend expone una API REST en `/api/*`.
- El mobile consume la API vía Axios. La base URL se configura en `mobile/src/api/client.ts`
  mediante la constante `API_BASE_URL` (o `EXPO_PUBLIC_API_URL`).

---

## AUTENTICACIÓN Y MULTIUSUARIO (JWT)

> El sistema **NO es single-user**: hay registro/login con JWT y **cada fila de datos pertenece a
> un usuario** (`user_id`). Todas las rutas `/api/*` (salvo `/api/auth/*`) exigen
> `Authorization: Bearer <token>`.

- Tabla **`users`**: `id` · `email` (único, minúsculas) · `password_hash` (bcrypt, 12 rounds) ·
  `name` · `is_admin` bool def false · `created_at`/`updated_at`. Admin: `mauiturriza@gmail.com`.
- **`user_id` (FK→users, NOT NULL)** en todas las tablas **padre**: `accounts`, `categories`,
  `transactions`, `templates`, `tags`, `savings_goals`, `debts`, `split_groups`, `exchange_rates`.
  Las tablas **hijas** (`transaction_tags`, `savings_contributions`, `debt_payments`, `split_*`)
  heredan la propiedad vía su FK al padre; los endpoints verifican propiedad del padre antes de operar
  (`getOwnedGroup`, `assertAccountsOwned`, `assertTagsOwned`).
- **Endpoints (`server/src/routes/auth.ts`, públicos):**
  - `POST /api/auth/register` — `{ email, password(≥8), name }` → `{ token, user }`. Provisiona
    categorías default + cuenta "Efectivo" (`db/defaults.ts → provisionUserDefaults`).
  - `POST /api/auth/login` — `{ email, password }` → `{ token, user }` (error genérico si fallan).
  - `GET /api/auth/me` (auth) · `PUT /api/auth/profile` (auth) — cambia nombre/contraseña (exige la actual).
  - **Recuperación de contraseña por email** (`routes/password-reset.ts`, públicos; código de 6 dígitos
    pensado para móvil, no link). Requiere `GMAIL_USER` y `GMAIL_APP_PASSWORD` (envío vía **Gmail SMTP** con **Nodemailer**).
    - ⚠️ **TEMPORALMENTE DESHABILITADO:** los 3 endpoints están bypaseados al inicio de su handler y devuelven
      **503** `{ error: "Función temporalmente deshabilitada." }`. El código se conserva intacto (solo un `return`
      temprano); para reactivar, quitar ese `return` en cada handler de `password-reset.ts`. En mobile el link
      "¿Olvidaste tu contraseña?" de `LoginScreen` está comentado (no borrado). El comportamiento documentado
      abajo es el original/al reactivar.
    - `POST /api/auth/forgot-password` — `{ email }`. Si el email existe: genera código de 6 dígitos
      (`crypto.randomInt`) + token de 64 chars (`crypto.randomBytes`), expiración 15 min, invalida códigos
      previos no usados del usuario y envía el código por email. **Siempre responde 200** con mensaje genérico
      (anti-enumeración). Rate limit **3/hora por email** (cuenta filas en `password_resets`, sin Redis) → 429.
      Si faltan `GMAIL_USER`/`GMAIL_APP_PASSWORD` responde 503 con mensaje claro (no crashea).
    - `POST /api/auth/verify-reset-code` — `{ email, code }` → `{ token }` si el código es válido/no usado/no
      expirado (JOIN con `users`); 400 si no. **No** marca el código como usado todavía.
    - `POST /api/auth/reset-password` — `{ token, newPassword(≥6) }`. Rehashea con bcrypt 12 y, en un `db.batch`
      atómico, actualiza `users.password_hash` y marca el reset `used=true` (token de un solo uso). 400 si el
      token es inválido/expirado/usado.
- **Middleware `server/src/middleware/auth.ts`:** `authenticate` valida el Bearer e inyecta
  `req.user = { id, email, isAdmin }`; `userId(req)` y `requireAdmin`. La expiración del token sale de
  `JWT_EXPIRATION` (default **30d**, configurable por env), centralizada en `utils/validateEnv.ts`.
  `JWT_SECRET` es **obligatorio** en el `.env` raíz (el server no arranca sin él).
- **Hardening de producción (server):**
  - **Rate limiting (`middleware/rateLimiter.ts`, `express-rate-limit`):** por IP, montado ANTES del
    handler en `auth.ts`. `POST /api/auth/login` = 5/15 min; `POST /api/auth/register` = 3/hora; 429 con
    `{ error: 'Demasiados intentos. Intenta de nuevo en unos minutos.' }`. En dev (`NODE_ENV !== 'production'`)
    los límites son **10x** más permisivos. (El throttle de `forgot-password` sigue siendo 3/hora por email
    en DB, aparte.) `index.ts` hace `app.set('trust proxy', 1)` para keying por IP real detrás del proxy de Render.
  - **Helmet (`helmet()` en `index.ts`, ANTES de CORS):** headers de seguridad por defecto
    (X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security, Cross-Origin-*, quita X-Powered-By).
  - **Validación de entorno al arrancar (`utils/validateEnv.ts`, Zod):** importado PRIMERO en `index.ts`.
    Valida `DATABASE_URL` (url), `JWT_SECRET` (≥32 chars), `JWT_EXPIRATION` (default '30d'), `NODE_ENV`
    (default 'development'), `PORT` (default 3000); `GMAIL_USER`/`GMAIL_APP_PASSWORD` opcionales (si faltan,
    `console.warn` "Recuperación de contraseña deshabilitada: faltan GMAIL_*"). Si algo falla → `process.exit(1)`
    con el detalle, NO arranca en estado roto.
  - **Sanitización de ids (`utils/parseId.ts`):** TODAS las rutas usan `parseId(req.params.id|groupId)` en vez
    de `Number(...)`. Exige entero > 0 (rechaza `NaN`, decimales, negativos y arrays de Express 5) → `ApiError(400, 'ID inválido')`.
- **Mobile:** `LoginScreen`/`RegisterScreen`, `hooks/useAuth.tsx`, `services/auth.ts` (JWT en
  **expo-secure-store**, nunca AsyncStorage). `api/client.ts` inyecta el Bearer y, ante 401, limpia
  el token y redirige al login. Paletas restringidas a admin (resto: `professional`). El stack de auth
  incluye además el flujo de recuperación: `ForgotPasswordScreen` (pide email) → `VerifyResetCodeScreen`
  (6 inputs OTP, timer de 15 min, reenviar con throttle de 60 s) → `ResetPasswordScreen` (nueva contraseña).
  `LoginScreen` enlazaba con "¿Olvidaste tu contraseña?", pero ese link está **comentado** mientras el
  flujo esté deshabilitado (ver ⚠️ arriba); las pantallas siguen en el stack para reactivar sin reescribir.

---

## RENDIMIENTO: ÍNDICES, CACHÉ Y CORS (post-auditoría jun 2026)

- **Índices (migración `0009_complex_morg.sql`, aditiva).** Definidos como `index()` en `schema.ts`:
  `transactions(user_id,date,id)` y `(user_id,type,date)` (lista, stats, insights),
  `transactions(account_id|to_account_id|category_id)`, `transaction_tags(tag_id)`,
  `categories(user_id|parent_id)`, `accounts(user_id)`, y `user_id`/`group_id`/`goal_id`/`debt_id`
  en `templates`/`debts`/`savings_goals`/`split_groups`/`split_expenses`/`split_settlements`/
  `savings_contributions`/`debt_payments`. (Las UNIQUE ya cubrían `tags(user_id,…)`,
  `split_members(group_id,…)`, `split_shares(expense_id,…)`, `transaction_tags(transaction_id,…)`,
  `exchange_rates(user_id,base,…)` por su columna líder.)
- **Caché en proceso (`server/src/services/cache.ts`, sin Redis).** Caché en memoria del único
  proceso Express con **invalidación por sello de versión por usuario**:
  - `cacheResponse(ttl)` cachea la respuesta JSON de GET caros por `uid+url+querystring+versión`:
    **`/api/stats/*`** (5 min), **`/api/insights`** (10 min), **`/api/accounts/summary`** (5 min) y los
    summaries de **`/api/debts/summary`**, **`/api/savings/summary`** y **`/api/splits/summary`** (5 min,
    `SUMMARY_TTL_MS`). `refresh=true` siempre hace bypass; solo cachea respuestas 2xx.
  - `invalidateOnMutation` sube `dataVersion[uid]` tras CADA mutación 2xx del usuario (en `finish`,
    post-commit) → invalida toda su caché. Montado en todos los routers de datos.
- **CORS:** `CORS_ORIGINS` (lista separada por comas) restringe orígenes; sin ella, se permite
  cualquiera (default de dev). Las apps nativas no envían `Origin`, así que el móvil no se afecta.
- **N+1 splits resuelto:** `GET /api/splits` y `/summary` usan `computeBalancesForGroups` (3 queries
  totales) en vez de iterar `computeBalances` por grupo.
- **Provisión de defaults por lote (`db/defaults.ts → provisionUserDefaults`):** el registro ya NO
  hace ~25 round-trips seriales. Gastos, ingresos y la cuenta "Efectivo" corren en paralelo
  (`Promise.all`); dentro de cada tipo se insertan TODOS los padres en un `insert([...]).returning()`
  y luego TODAS las hijas en otro insert (~5 round-trips concurrentes). Las hijas se enlazan al padre
  por **clave de negocio (name)**, nunca por el orden del `RETURNING` (Postgres no lo garantiza).
- **Menos round-trips en transacciones:** `assertAccountsOwned` usa un único `inArray(accounts.id, …)`
  comparando conteos (en vez de una query por id, igual que `assertTagsOwned`); en `GET /api/transactions`
  las queries de `rows` y de `count` van en `Promise.all` (las tags dependen de `rows`, van después).
- **Cap defensivo en colecciones hijas:** los GET de detalle que devuelven hijos sin paginar acotan el
  peor caso con `.limit(200)` silencioso (los más recientes, sin cambiar el contrato de respuesta):
  `GET /api/debts/:id` (`payments`), `GET /api/savings/:id` (`contributions`),
  `GET /api/splits/:groupId/expenses` y `/settlements`. TODO pendiente: load-more en mobile.
- **Selects acotados en los DELETE con reversión de balance:** `DELETE /api/debts/:id` y `/api/splits/:id`
  traen de `transactions` solo las columnas usadas para revertir (`id,type,amount,accountId,toAccountId,toAmount`),
  no la fila completa.
- **Errores 500:** el `errorHandler` responde mensaje genérico (el detalle se loguea en el servidor).

---

## ESTRUCTURA DE ARCHIVOS

### server/
```
server/
├── package.json                ← scripts: dev, build, start, db:generate, db:migrate, db:push, db:seed
├── tsconfig.json
├── drizzle.config.ts           ← apunta a src/db/schema.ts, lee DATABASE_URL del .env raíz
├── src/
│   ├── index.ts                ← Entry point Express (CORS, JSON, rutas, errorHandler,
│   │                             handlers process-level unhandledRejection/uncaughtException)
│   ├── db/
│   │   ├── connection.ts       ← Neon + drizzle-orm (carga ../.env)
│   │   ├── schema.ts           ← Tablas: accounts, categories, transactions, templates,
│   │   │                          tags, transaction_tags, savings_goals, savings_contributions,
│   │   │                          debts, debt_payments, split_groups/members/expenses/shares/settlements,
│   │   │                          exchange_rates
│   │   ├── migrate.ts          ← Aplica migraciones de ./drizzle
│   │   └── seed.ts             ← Inserta categorías default + cuenta "Efectivo"
│   ├── routes/
│   │   ├── accounts.ts          ← incluye GET /summary (balance consolidado convertido)
│   │   ├── categories.ts
│   │   ├── transactions.ts
│   │   ├── templates.ts
│   │   ├── stats.ts            ← acepta displayCurrency (convierte por moneda de cuenta)
│   │   ├── tags.ts
│   │   ├── savings.ts
│   │   ├── debts.ts
│   │   ├── splits.ts
│   │   ├── insights.ts        ← insights financieros (agregación SQL determinística)
│   │   └── rates.ts           ← tasas de cambio (GET /, PUT/DELETE /manual)
│   ├── services/
│   │   └── exchangeRates.ts    ← Frankfurter + open.er-api.com, cache 24h, stale, manuales
│   ├── middleware/
│   │   ├── errorHandler.ts
│   │   ├── auth.ts            ← authenticate/userId/requireAdmin + signToken (JWT)
│   │   └── rateLimiter.ts    ← express-rate-limit: loginLimiter (5/15m), registerLimiter (3/h) por IP
│   └── utils/
│       ├── safeCompensate.ts ← rollback de saga tolerante a fallos (log estructurado, no pisa el error original)
│       ├── validateEnv.ts    ← validación de env con Zod al arrancar (import PRIMERO en index.ts) + JWT_EXPIRATION
│       └── parseId.ts        ← parseId(req.params.*) → entero > 0 o ApiError(400)
└── drizzle/                    ← migraciones generadas por drizzle-kit
```

### mobile/
```
mobile/
├── package.json
├── app.json
├── eas.json                    ← build.preview.android.buildType = "apk"
├── tsconfig.json
├── babel.config.js             ← reanimated plugin
├── App.tsx
└── src/
    ├── api/client.ts           ← Axios + endpoints tipados + API_BASE_URL
    ├── services/notifications.ts ← Notificaciones LOCALES (permisos, programar/cancelar/
    │                              reprogramar por entidad con identifiers determinísticos, sync global)
    ├── services/security.ts    ← Bloqueo con PIN (hash SHA-256+salt en SecureStore) + biometría + lockout
    ├── hooks/                  ← useAccounts, useTransactions, useCategories, useTemplates,
    │                              useStats, useTags, useSavings, useDebts, useSplits,
    │                              useNotificationSettings, useInsights, useAccountsSummary,
    │                              useAppLock (provider de bloqueo + AppState)
    ├── stores/appStore.ts      ← Zustand (filtros, refresh triggers, plantilla seleccionada)
    ├── stores/settingsStore.ts ← Zustand + persist/AsyncStorage (mainCurrency)
    ├── screens/                ← Home, Transactions, AddTransaction, Accounts, AddAccount,
    │                              Categories, Templates, Stats, Tags, Savings, AddSavingsGoal,
    │                              SavingsDetail, Debts, AddDebt, DebtDetail, Splits,
    │                              AddSplitGroup, SplitGroupDetail, AddSplitExpense, More,
    │                              SettingsNotifications, ImportExport, Insights, Rates, Security, LockScreen
    ├── components/             ← Calculator, CalculatorSheet, TransactionCard, AccountCard,
    │                              AccountPicker, CategoryPicker, DateRangePicker, BalanceSummary,
    │                              StatChart, TemplateCard, TagChip, TagPicker, SavingsGoalCard,
    │                              DebtCard, HomeSummaryCard, InsightCard, CurrencyPicker,
    │                              PinDots, PinKeypad, PinModal, ReceiptViewer, BottomSheet, Icon, common
    ├── navigation/AppNavigator.tsx  ← Bottom tabs + native stacks
    ├── theme/index.ts          ← lightTheme + darkTheme (colores, spacing, radius, fontSize)
    ├── theme/ThemeContext.tsx  ← ThemeProvider, useTheme(), useThemedStyles()
    ├── utils/                  ← formatCurrency (Intl + fallback manual), currencies (catálogo curado),
    │                              formatDate, calculatorEngine, csv (parser propio + csvToImportRows),
    │                              receiptStorage (fotos de recibos locales: comprimir/guardar/borrar/rutas)
    └── types/index.ts          ← tipos compartidos
```

---

## ESQUEMA DE BASE DE DATOS (Drizzle + PostgreSQL)

### accounts
`id` serial PK · `name` varchar(100) NN · `type` varchar(30) NN (`bank|cash|credit_card|digital_wallet`)
· `currency` varchar(3) def `COP` · `initial_balance` decimal(15,2) def 0 · `current_balance` decimal(15,2) def 0
· `color` varchar(7) def `#4F46E5` · `icon` varchar(50) def `wallet` · `is_active` bool def true
· `created_at` / `updated_at` timestamp def now()

### categories
`id` serial PK · `name` varchar(80) NN · `type` varchar(10) NN (`income|expense`)
· `icon` varchar(50) NN · `color` varchar(7) NN · `parent_id` int FK→categories(id) ON DELETE CASCADE (NULL = padre)
· `is_active` bool def true · `sort_order` int def 0 · `created_at` timestamp def now()
> Subcategorías = filas con `parent_id` apuntando al padre.

### transactions
`id` serial PK · `type` varchar(10) NN (`income|expense|transfer`) · `amount` decimal(15,2) NN
· `description` varchar(255) · `date` date NN · `time` time NN (editable desde `AddTransaction` con `TimePicker`)
· `account_id` int FK→accounts NN
· `to_account_id` int FK→accounts (solo transfers) · `to_amount` decimal(15,2) (nullable; monto recibido
  en la cuenta destino cuando la transferencia cruza monedas — si es null se asume = `amount`)
· `category_id` int FK→categories
· `notes` text · `receipt_filename` varchar(255) (nullable; nombre del archivo de la foto del recibo —
  la imagen vive LOCAL en el dispositivo, NO en la DB; migración `0007_hard_red_shift.sql`)
· `created_at` / `updated_at` timestamp def now()
> **Multi-moneda:** cada transacción se guarda SIEMPRE en la moneda de su cuenta. En transferencias entre
> cuentas de distinta moneda, la cuenta origen se mueve por `amount` (su moneda) y la destino por `to_amount`
> (su moneda); la conversión es solo para visualización/consolidación.

### templates
`id` serial PK · `name` varchar(100) NN · `type` varchar(10) NN (`income|expense`)
· `amount` decimal(15,2) (nullable) · `description` varchar(255) · `account_id` int FK→accounts
· `category_id` int FK→categories · `is_active` bool def true · `use_count` int def 0 · `created_at` timestamp def now()

### tags
`id` serial PK · `name` varchar(50) NN UNIQUE · `color` varchar(7) def `#6C757D` · `icon` varchar(50) def `tag`
· `created_at` timestamp def now()

### transaction_tags
`id` serial PK · `transaction_id` int FK→transactions ON DELETE CASCADE NN · `tag_id` int FK→tags ON DELETE CASCADE NN
· UNIQUE(transaction_id, tag_id)

### savings_goals
`id` serial PK · `name` varchar(100) NN · `target_amount` decimal(15,2) NN · `current_amount` decimal(15,2) def 0
· `deadline` date · `color` varchar(7) def `#2E8B57` · `icon` varchar(50) def `piggy-bank`
· `is_completed` bool def false · `completed_at` timestamp · `account_id` int FK→accounts · `notes` text
· `created_at` / `updated_at` timestamp def now()

### savings_contributions
`id` serial PK · `goal_id` int FK→savings_goals ON DELETE CASCADE NN · `amount` decimal(15,2) NN
· `type` varchar(10) NN (`deposit|withdrawal`) · `description` varchar(255) · `date` date NN
· `transaction_id` int FK→transactions · `created_at` timestamp def now()

### debts
`id` serial PK · `name` varchar(100) NN · `type` varchar(10) NN (`debt`=yo debo | `loan`=me deben)
· `total_amount` decimal(15,2) NN · `remaining_amount` decimal(15,2) NN · `interest_rate` decimal(5,2) (% anual, informativo)
· `creditor_debtor` varchar(100) · `start_date` date NN · `due_date` date · `color` varchar(7) def `#C1437A`
· `icon` varchar(50) def `landmark` · `is_paid_off` bool def false · `paid_off_at` timestamp · `notes` text
· `account_id` int FK→accounts · `created_at` / `updated_at` timestamp def now()

### debt_payments
`id` serial PK · `debt_id` int FK→debts ON DELETE CASCADE NN · `amount` decimal(15,2) NN · `date` date NN
· `description` varchar(255) · `account_id` int FK→accounts (nullable; cuenta del abono) · `transaction_id` int FK→transactions · `created_at` timestamp def now()
> Un abono con `account_id` genera una transacción `income` (loan) / `expense` (debt) en esa cuenta y enlaza `transaction_id`.

### split_groups
`id` serial PK · `name` varchar(100) NN · `description` varchar(255) · `icon` varchar(50) def `users`
· `color` varchar(7) def `#3A60A1` · `is_active` bool def true · `created_at` / `updated_at` timestamp def now()

### split_members
`id` serial PK · `group_id` int FK→split_groups ON DELETE CASCADE NN · `name` varchar(100) NN
· `is_me` bool def false (exactamente uno por grupo = el usuario) · `created_at` timestamp def now()
· UNIQUE(group_id, name) · **UNIQUE parcial** `split_members_one_me_per_group` = `(group_id) WHERE is_me = true`
  (a nivel DB garantiza un solo "Yo" por grupo; migración `0011_slimy_rogue.sql`, aditiva).

### split_expenses
`id` serial PK · `group_id` int FK→split_groups ON DELETE CASCADE NN · `description` varchar(255) NN
· `total_amount` decimal(15,2) NN · `paid_by_member_id` int FK→split_members NN · `date` date NN
· `account_id` int FK→accounts (nullable; solo si lo pagó el miembro `is_me`)
· `transaction_id` int FK→transactions · `category_id` int FK→categories · `created_at` / `updated_at` timestamp def now()
> Si lo pagó `is_me` con `account_id`, se crea una transacción `expense` en esa cuenta y se enlaza `transaction_id`.

### split_shares
`id` serial PK · `expense_id` int FK→split_expenses ON DELETE CASCADE NN · `member_id` int FK→split_members ON DELETE CASCADE NN
· `amount` decimal(15,2) NN · `is_settled` bool def false · `settled_at` timestamp · UNIQUE(expense_id, member_id)
> El share del pagador nace con `is_settled=true` (se pagó a sí mismo). Balance de un miembro =
> lo que pagó por otros − lo que le corresponde de gastos pagados por otros (solo shares no liquidados).

### split_settlements
`id` serial PK · `group_id` int FK→split_groups ON DELETE CASCADE NN · `from_member_id` int FK→split_members NN
· `to_member_id` int FK→split_members NN · `amount` decimal(15,2) NN · `date` date NN
· `account_id` int FK→accounts (nullable) · `transaction_id` int FK→transactions (nullable) · `created_at` timestamp def now()
> Cada liquidación (`/settle`) persiste aquí. Si involucra al miembro `is_me` y trae `account_id`, genera una
> transacción `income` (me pagan) / `expense` (yo pago) en esa cuenta y enlaza `transaction_id`.

### exchange_rates
`id` serial PK · `base_currency` varchar(3) NN · `target_currency` varchar(3) NN
· `user_id` int FK→users NN · `rate` decimal(18,8) NN (1 base = `rate` target) · `is_manual` bool def false · `fetched_at` timestamp def now()
· UNIQUE(user_id, base_currency, target_currency)
> Cache de tasas. Las `is_manual` las fija el usuario y **nunca** se sobreescriben con el refresco automático.
> Las automáticas se refrescan si tienen ≥24h. Migración `0006_unknown_exodus.sql` (aditiva: tabla nueva + `transactions.to_amount`).

### password_resets
`id` serial PK · `user_id` int FK→users NN · `code` varchar(6) NN (6 dígitos) · `token` varchar(64) NN UNIQUE
· `expires_at` timestamp NN (now + 15 min) · `used` bool def false · `created_at` timestamp def now()
· INDEX(user_id, used, expires_at) — el UNIQUE de `token` ya cubre el lookup por token.
> Recuperación de contraseña por email. El `code` (6 dígitos) viaja en el email; el `token` (64 chars hex) es el
> secreto opaco que la app obtiene al verificar el código y usa para cambiar la contraseña. Códigos/tokens de un
> solo uso, expiran a los 15 min. Migración `0010_sour_slayback.sql` (aditiva).

### Reglas de balance (atómicas, dentro de una misma transacción SQL)
- `income`  → `account.current_balance += amount`
- `expense` → `account.current_balance -= amount`
- `transfer`→ `account.current_balance -= amount` y `to_account.current_balance += amount`
- Editar/eliminar: revertir el efecto anterior y aplicar el nuevo.

> **Atomicidad (restricción dura del driver).** La conexión usa **`drizzle-orm/neon-http`**:
> `db.batch([...])` ejecuta todos los statements en **una transacción atómica** (rollback
> automático ante un fallo), pero **NO existe `db.transaction()` interactivo** sobre HTTP. Por eso,
> cuando una operación necesita ids generados a mitad de camino (que no se pueden referenciar dentro
> de un mismo batch), se usa el **patrón saga/compensación**: se aplica el estado en uno o dos
> `db.batch` y, si un paso posterior falla, se ejecuta un **batch de compensación** que revierte lo
> ya aplicado. Endpoints con saga: `POST /api/splits/:groupId/expenses`,
> `POST /api/splits/:groupId/settle`, `POST /api/debts/:id/pay`,
> `POST /api/savings/:id/contribute` y el enlace de etiquetas de `POST /api/transactions` (tras el
> batch tx+balance; si el insert de `transaction_tags` falla se revierte el balance y se borra la
> transacción para no darla por guardada con datos incorrectos). No cambiar a `db.transaction` (no soportado).
>
> **Compensaciones tolerantes a fallos (`server/src/utils/safeCompensate.ts`).** TODO batch de
> compensación se ejecuta vía `safeCompensate(undoBatch, context)`, que corre el `db.batch(undo)` y,
> si la compensación MISMA falla (la red que tumbó la operación puede tumbar también el rollback),
> NO relanza ese error sino que loguea un mensaje estructurado **"COMPENSACIÓN FALLIDA — reconciliación
> manual necesaria"** con `{ endpoint, operation, userId, entityId, txId, error }` + stack. El caller
> SIEMPRE hace `throw err` del **error original** (el que disparó la saga), no el de la compensación:
> el cliente recibe la causa real y queda un rastro en logs para reconciliar a mano el estado
> inconsistente (saldo movido sin registro, share liquidado sin settlement, etc.).

> **Concurrencia: guards atómicos en SQL (no TOCTOU).** Donde un saldo se valida y luego se
> modifica, NO se lee→valida→escribe en memoria (dos requests concurrentes pasarían ambos la
> validación y sobre-pagarían/sobre-retirarían). En su lugar el decremento es **condicional en el
> WHERE** y atómico: `POST /api/debts/:id/pay` → `UPDATE debts SET remaining_amount = remaining_amount
> - amount WHERE … AND is_paid_off = false AND remaining_amount >= amount RETURNING` (0 filas → 400);
> `POST /api/savings/:id/contribute` (retiro) → `UPDATE … WHERE current_amount >= amount` (0 filas →
> 400). Ambos recalculan `is_paid_off`/`is_completed` en el mismo UPDATE y compensan el saldo si el
> insert posterior (pago/contribución) falla.
> **Unique como fuente de verdad (no solo el check previo).** Los checks "ya existe" son best-effort;
> ante la carrera, la violación de UNIQUE de Postgres (**SQLSTATE 23505**, helper `isUniqueViolation`
> en `errorHandler.ts`) se mapea a **409**: registro de email duplicado (`POST /api/auth/register`,
> `users.email` UNIQUE) y alta de miembro (`POST /api/splits/:groupId/members` — nombre repetido o
> segundo "Yo" vía el índice parcial).

---

## API REST

### Accounts
- `GET    /api/accounts` — cuentas activas
- `GET    /api/accounts/summary?displayCurrency=COP[&refresh=true]` — balance consolidado convertido a
  `displayCurrency`: `{ displayCurrency, total, byCurrency[{currency,total,converted}], stale, ratesUpdatedAt }`
  (registrada antes de `/:id`)
- `GET    /api/accounts/:id`
- `POST   /api/accounts`
- `PUT    /api/accounts/:id`
- `DELETE /api/accounts/:id` — soft delete (`is_active=false`)

### Categories
- `GET    /api/categories` — todas, subcategorías anidadas (`children[]`)
- `GET    /api/categories/:type` — `income` | `expense`
- `POST   /api/categories`
- `PUT    /api/categories/:id`
- `DELETE /api/categories/:id` — CASCADE subcategorías

### Transactions
- `GET    /api/transactions` — query: `account_id, category_id, type, from_date, to_date, search, page, limit`
- `GET    /api/transactions/:id`
- `POST   /api/transactions` — crea y actualiza balance
- `PUT    /api/transactions/:id` — recalcula balances
- `DELETE /api/transactions/:id` — recalcula balance
> POST/PUT aceptan `receiptFilename` y GET (lista + `/:id`) lo devuelven. Es solo el **nombre** del archivo;
> la imagen del recibo se guarda LOCAL en el dispositivo (ver feature "Recibos"). El backend no recibe ni
> almacena la imagen. Borrar la transacción NO borra el archivo (eso lo hace el cliente).
- `GET    /api/transactions/export` — query: `format=csv|json, from, to, accountId?, categoryId?, type?`. Devuelve el archivo con `Content-Disposition: attachment`. **CSV**: UTF-8 con BOM (Excel + tildes), separador coma, filas CRLF, columnas `fecha, hora, tipo, monto, descripción, cuenta, cuenta destino, categoría, subcategoría, etiquetas` (separadas por `;`)`, notas`. `tipo` se exporta en español (Ingreso/Gasto/Transferencia); `categoría/subcategoría` se derivan del `parentId` (si la categoría es hija → categoría=padre, subcategoría=hija). **JSON**: arreglo de filas normalizadas (mismo shape que acepta el import). Ruta registrada **antes** de `/:id`.
- `POST   /api/transactions/import` — body `{ transactions: NormalizedRow[] }` (o un arreglo directo). Valida cada fila: tipo (acepta español o inglés), monto numérico > 0, fecha `yyyy-MM-dd`, cuenta existente (match por nombre case-insensitive; transfer exige cuenta destino), categoría opcional (match por subcategoría→categoría; si no existe, `null`). Cada importada actualiza `current_balance` como una creación normal. Los statements se ejecutan en **batches de 50 filas** (`db.batch`, cada lote atómico). Respuesta `{ imported: n, errors: [{ row, reason }] }` con **resultado parcial veraz**: si un lote falla, ese lote completo se revierte (no se suma a `imported`) y se añade a `errors` un item con el rango de filas del lote (las demás filas válidas sí se importan). **El CSV exportado es round-trippable** (export → import sin errores). Las etiquetas no se importan (solo informativas en el CSV).

### Templates
- `GET    /api/templates` — orden `use_count DESC`
- `POST   /api/templates`
- `PUT    /api/templates/:id`
- `POST   /api/templates/:id/use` — incrementa `use_count`
- `DELETE /api/templates/:id`

### Stats
> Todos aceptan `displayCurrency` (default COP): agrupan por moneda de la cuenta y convierten a la moneda de
> visualización con las tasas. Con una sola moneda el resultado es idéntico al anterior (tasa 1).
- `GET /api/stats/summary?from=&to=&displayCurrency=` — `{ income, expense, balance, displayCurrency }`
- `GET /api/stats/by-category?from=&to=&displayCurrency=` — gastos por categoría
- `GET /api/stats/timeline?from=&to=&group=day|week|month&displayCurrency=`
- `GET /api/stats/balance-evolution?from=&to=&displayCurrency=`

### Rates (tasas de cambio, multi-moneda)
- `GET    /api/rates?base=COP&targets=USD,EUR,VES[&refresh=true]` — `{ base, rates:[{base,target,rate,stale,isManual,fetchedAt}], stale }`.
  Sin `targets` devuelve lo cacheado para esa base. `refresh=true` ignora el TTL de 24h.
- `PUT    /api/rates/manual` — `{ base, target, rate }`: fija una tasa manual (no se sobreescribe automáticamente).
- `DELETE /api/rates/manual?base=&target=` — quita la tasa manual (vuelve a refrescarse de la API).
> **Fuentes (gratis, sin key):** Frankfurter (BCE; NO cubre COP ni VES) → fallback **open.er-api.com** (cubre COP
> y, en la práctica, VES). Cache 24h en `exchange_rates`; si la API cae se devuelve la última tasa con `stale:true`.
> ⚠️ **VES:** puede no estar en las APIs gratuitas; si falta, la tasa queda `null` y se fija a mano con `PUT /manual`.

### Tags
- `GET    /api/tags` — con `transactionCount`
- `POST   /api/tags`
- `PUT    /api/tags/:id`
- `DELETE /api/tags/:id`
> Las transacciones aceptan `tagIds[]` en POST/PUT y devuelven `tags[]`; filtro `tag_id` en GET /api/transactions.

### Savings (metas de ahorro)
- `GET    /api/savings` — metas con nombre de cuenta
- `GET    /api/savings/summary` — `{ totalSaved, totalTarget, totalRemaining, activeGoals, completedGoals }`
- `GET    /api/savings/:id` — incluye `contributions[]`
- `POST   /api/savings`
- `PUT    /api/savings/:id`
- `DELETE /api/savings/:id`
- `POST   /api/savings/:id/contribute` — `{ amount, type: deposit|withdrawal, date, description? }`; marca `is_completed` al llegar al objetivo. El saldo se ajusta con un UPDATE condicional (retiro: guard `current_amount >= amount`, 0 filas → 400) y se compensa si falla el insert de la contribución (anti-TOCTOU)

### Debts (deudas y préstamos)
- `GET    /api/debts` — activas primero, con nombre de cuenta
- `GET    /api/debts/summary` — `{ totalDebt, totalLoan, netBalance, activeDebts, activeLoans }`
- `GET    /api/debts/:id` — incluye `payments[]`
- `POST   /api/debts` — `remaining_amount` arranca igual a `total_amount`; con `registerInitialTransaction:true` + `accountId` registra el desembolso inicial como `income` (debt: me prestaron) / `expense` (loan: yo presté)
- `PUT    /api/debts/:id` — si cambia el total, ajusta el restante conservando lo pagado
- `DELETE /api/debts/:id` — CASCADE en pagos + revierte balances y borra las transacciones de los abonos vinculados (db.batch)
- `POST   /api/debts/:id/pay` — `{ amount, date, description?, accountId? }`; resta del restante (UPDATE condicional `remaining_amount >= amount`, 0 filas → 400, anti-TOCTOU) y marca `is_paid_off` si llega a 0; con `accountId` crea transacción `income`(loan)/`expense`(debt) y enlaza (db.batch); compensa el decremento + la tx si falla el registro del pago

### Splits (gastos compartidos)
- `GET    /api/splits` — grupos activos con `members[]` y `myBalance`
- `GET    /api/splits/summary` — `{ totalOwedToMe, totalIOwe, netBalance, groups[] }` (solo miembro `is_me`)
- `GET    /api/splits/:id` — grupo con miembros
- `POST   /api/splits` — acepta `members[]` inline (exactamente un `isMe`, nombres únicos)
- `PUT    /api/splits/:id` · `DELETE /api/splits/:id` (CASCADE)
- `POST   /api/splits/:groupId/members` · `DELETE /api/splits/:groupId/members/:id` (solo sin gastos asociados)
- `GET    /api/splits/:groupId/expenses` — con shares y `accountName`; `POST` acepta `accountId?` (solo si paga `is_me` → transacción `expense`), valida que los shares sumen el total (±0.01). Saga: si paga `is_me` se crea primero la tx+balance (batch); el gasto y sus shares van dentro de un `try` que, ante fallo, borra el gasto (CASCADE en shares) y revierte la tx (no deja movimientos huérfanos).
- `GET    /api/splits/:groupId/balances` — balance por miembro + `transfers[]` simplificadas (greedy: mayor deudor paga al mayor acreedor)
- `POST   /api/splits/:groupId/settle` — `{ fromMemberId, toMemberId, amount, date?, accountId? }`; marca shares pareados como settled (antiguos primero), persiste en `split_settlements` y, si involucra a `is_me` con `accountId`, crea transacción `income`(me pagan)/`expense`(yo pago); si la simplificación redirigió deudas, registra el remanente como gasto "Liquidación". **Saga de 2 batches:** Batch A aplica todo (shares settled + gasto Liquidación + tx + balance, con `.returning()` de los ids); Batch B inserta lo dependiente de esos ids (share de la Liquidación + fila de settlement con su `transactionId`). Si Batch B falla, un batch de compensación revierte **todo** el Batch A (des-liquida shares, borra el gasto y la tx, revierte el balance).
- `GET    /api/splits/:groupId/settlements` — historial de liquidaciones del grupo

### Insights (análisis automático)
- `GET /api/insights` — devuelve `Insight[]` del mes actual, calculados por **agregación SQL determinística**
  (sin IA/LLM). Cada insight: `{ id, type, severity: 'info'|'warning'|'positive', title, message, value?, categoryId? }`
  (textos en español; `value` es número crudo, el cliente lo formatea). Tipos:
  - `comparativa_categoria` — categorías cuyo gasto del mes supera en ≥20% el promedio de los **3 meses previos**
    (`value`=gasto, `categoryId`, % de variación en `message`). Hasta 3, ordenadas por variación.
  - `proyeccion_mes` — con el gasto diario promedio del mes en curso, proyecta el cierre y lo compara vs el mes
    anterior (`value`=proyectado). Requiere **≥7 días de historia** y **≥7 días transcurridos** del mes.
  - `racha_registro` — días consecutivos con registro; si `≥3` días **sin** registrar → recordatorio (warning),
    si racha `≥3` → positivo (`value`=días).
  - `top_crecimiento` — la categoría que más creció en gasto vs el mes anterior (`value`=gasto, `categoryId`).
  - `patron_semanal` — día de la semana con mayor gasto promedio (últimas 8 semanas; requiere ≥14 días de historia
    y un día con ≥2 fechas registradas).
  - `balance_salud` — % del ingreso del mes ya gastado (`value`=%); alerta si >90% (warning), positivo si ≤60%.
  > **Degradación elegante:** cada insight solo aparece si hay datos suficientes (divisiones por cero y cuentas
  > nuevas controladas; sin historial devuelve `[]`). Se ordenan warning → positive → info. El shape está pensado
  > para que a futuro un LLM pueda generar/enriquecer `message` sin tocar el resto del contrato.

---

## STACK

> **Handlers de último recurso a nivel de proceso (`index.ts`).** `process.on('unhandledRejection')`
> loguea la promesa rechazada sin catch; `process.on('uncaughtException')` loguea la excepción y sale
> con `process.exit(1)` tras un timeout de 1s (`.unref()`) para que el log flushee y un orquestador
> (PM2/Render) reinicie el proceso. Sin dependencias extra.

**Backend:** express ^4.21, @neondatabase/serverless ^0.10, drizzle-orm ^0.36, drizzle-zod ^0.5,
zod ^3.23, cors ^2.8, dotenv ^16.4, date-fns ^4.1, **bcryptjs ^3** (hash de contraseñas),
**jsonwebtoken ^9** (JWT de sesión), **nodemailer ^8** (envío de emails de recuperación vía Gmail SMTP),
**express-rate-limit ^8** (rate limiting por IP en `/api/auth/login` y `/register`),
**helmet ^8** (headers HTTP de seguridad) · ambos traen sus propios tipos (sin `@types/*`) ·
dev: drizzle-kit ^0.28, tsx ^4.19, typescript ^5.6, @types/bcryptjs, @types/jsonwebtoken, @types/nodemailer.
Requiere **`JWT_SECRET`** en el `.env` raíz; **`GMAIL_USER`** y **`GMAIL_APP_PASSWORD`** son obligatorias solo
para enviar emails de recuperación (si faltan, esos endpoints responden 503 con mensaje claro; el resto de la
API funciona igual). El transporter usa `smtp.gmail.com:465` (secure) y el `from` es `GMAIL_USER`.
> **Multi-moneda no añade dependencias:** las tasas se consultan con el `fetch` nativo de Node 22 (Frankfurter /
> open.er-api.com). En mobile la persistencia de la moneda principal usa el middleware `persist` de Zustand sobre
> `@react-native-async-storage/async-storage` (ya instalado); no se agregó ningún paquete.

**Mobile (Expo SDK 54 — compatible con Expo Go SDK 54 de Play Store):**
expo ~54.0.0, react 19.1.0, react-native 0.81.5, @react-navigation/* ^7,
react-native-screens ~4.16, react-native-safe-area-context ~5.6, react-native-gesture-handler ~2.28,
react-native-keyboard-controller 1.18.5 (manejo de teclado; pasa expo-doctor 18/18),
react-native-reanimated ~4.1 (requiere react-native-worklets 0.5.1 — instalado), react-native-svg 15.12,
axios ^1.7, zustand ^5, date-fns ^4.1, lucide-react-native ^0.460, @expo/vector-icons ^15
(requiere expo-font ~14.0 — instalado), expo-status-bar ~3.0, react-native-toast-message ^2.2,
expo-linear-gradient ~15.0 (gradientes del sistema de temas dual; bundled en Expo Go SDK 54),
expo-splash-screen ~31.0 (control explícito de splash),
expo-notifications ~0.32.17 (notificaciones LOCALES programadas; carga lazy — ver "Notificaciones locales"),
@react-native-async-storage/async-storage 2.2.0 (persistencia de preferencias de notificaciones),
expo-constants ~18.0.13 (detección de entorno Expo Go para deshabilitar notificaciones),
expo-file-system ~19.0.23 (escribir/leer archivos de export/import — se usa la **API legacy** vía
`import * as FileSystem from 'expo-file-system/legacy'`: `cacheDirectory`, `writeAsStringAsync`,
`readAsStringAsync`, `EncodingType.UTF8`), expo-sharing ~14.0.8 (compartir el archivo exportado),
expo-document-picker ~14.0.8 (seleccionar el CSV a importar),
expo-secure-store ~15.0.8 (hash del PIN en Keychain/Keystore — **NUNCA** AsyncStorage; añade el config plugin
`expo-secure-store` a `app.json`), expo-local-authentication ~17.0.8 (biometría) y expo-crypto ~15.0.9
(SHA-256 + salt aleatorio + `randomUUID` para nombres de recibos) — bloqueo con PIN; vienen en Expo Go SDK 54.
expo-image-picker ~17.0.11 (cámara + galería para recibos; config plugin `expo-image-picker` en `app.json` con
mensajes de permiso de cámara/galería) y expo-image-manipulator ~14.0.8 (comprimir/redimensionar — API nueva
`ImageManipulator.manipulate(uri).resize({width}).renderAsync()` + `.saveAsync({compress,format})`).
TypeScript ~5.9, @types/react ~19.1.

> **NO usar:** `victory-native` (removido — arrastra `@shopify/react-native-skia`; las gráficas son
> SVG propio en `StatChart.tsx`) ni `expo-haptics` (removido — incompatible con Node 22).
> Para verificar/alinear versiones con el SDK: `npx expo install --check` / `npx expo install --fix`.

---

## DISEÑO — Sistema de temas dual y selector de paletas (rediseño jun 2026)

**4 paletas** conmutables (Bisexual, Gay, Lésbica, Profesional), cada una con variante
claro/oscuro, seleccionables desde "Más → Apariencia". Definidas en `mobile/src/theme/index.ts`
como `palettes.<id> = { label, light, dark, swatch }` (`PaletteId = keyof typeof palettes`);
`lightTheme`/`darkTheme` exportados son alias de compatibilidad de `palettes.bisexual.{light,dark}`
(paleta por defecto). El estado activo (`paletteId`, `themeMode`) vive en `settingsStore`
(persistido en AsyncStorage, clave `wallet-settings`) y se resuelve en
`mobile/src/theme/ThemeContext.tsx`. `type Theme`/`ThemeColors`/`ThemeGradients` y los nombres de
tokens son los mismos para las 4 paletas — ningún componente cambia.

### Paleta BISEXUAL (default) — claro "Minimalista Nórdico"
```ts
colors: {
  background:'#F8F9FA', surface:'#E9ECEF', surfaceLight:'#FFFFFF', surfaceAccent:'#DDE3E9',
  primary:'#C1437A',       // rosa viejo — CTA principal
  primaryDark:'#F1D7E2',   // contenedor suave (teclas operador calculadora)
  primaryLight:'#A8336B',  // variante legible como TEXTO sobre fondo claro
  secondary:'#3A60A1',     // azul slate — enlaces/navegación (contraste 5.92:1 ✓)
  accent:'#7B528C', accentLight:'#9B7DB8',
  income:'#2E8B57', expense:'#C1437A', transfer:'#3A60A1',
  text:'#212529', textSecondary:'#6C757D', textMuted:'#99A1A8',
  border:'#CED4DA', borderLight:'#DEE2E6', statusBar:'#E2E6EA',
}
```

### Paleta BISEXUAL (default) — oscuro "Orquídea / Morado Velvet"
```ts
colors: {
  background:'#241B35', surface:'#32264A', surfaceLight:'#3C2E58', surfaceAccent:'#473768',
  primary:'#F72585',       // rosa frambuesa — CTA principal
  primaryDark:'#A91761',   // teclas operador / pressed
  primaryLight:'#FF8FC2',  // variante legible como TEXTO sobre fondo oscuro
  secondary:'#4CC9F0',     // azul turquesa — enlaces/navegación (contraste 8.51:1 ✓)
  accent:'#7209B7',        // púrpura imperial — SOLO para fondos/fills (1.9:1 como texto)
  accentLight:'#B47EE8',   // variante legible como texto
  income:'#4ADE80', expense:'#F72585', transfer:'#4CC9F0',
  text:'#F4EFFA', textSecondary:'#A393BF', textMuted:'#75689A',
  border:'#443465', borderLight:'#554478', statusBar:'#1B1428',
}
```

### Paletas adicionales (resumen — tablas completas en `theme/index.ts`)

**Gay (Vincian)** — swatch `#078D70 / #26CEAA / #7BADE2`.
- Claro: `background:'#F2FAF7'`, `primary:'#0B6E5B'` (teal), `secondary:'#2A6FB5'` (azul),
  `accent:'#3D1A78'` (índigo), `income:'#297D4E'`, `expense/danger/warning:'#3D1A78'`,
  `transfer:'#2A6FB5'`.
- Oscuro: `background:'#0E1C18'`, `primary:'#1FAE90'`, `secondary:'#7BADE2'`,
  `accent:'#8E7BEA'`, `income:'#4ADE80'`, `expense/danger:'#8E7BEA'`, `transfer:'#7BADE2'`.

**Lésbica (sunset 2018)** — swatch `#D52D00 / #FF9A56 / #A30262`.
- Claro: `background:'#FFF8F4'`, `primary:'#C8442A'` (naranja), `secondary:'#A30262'` (magenta),
  `accent:'#D362A4'` (rosa), `income:'#297D4E'`, `expense/danger:'#C8442A'`, `transfer:'#A30262'`.
- Oscuro: `background:'#221310'`, `primary:'#E8631C'`, `secondary:'#FF8FC2'`,
  `accent:'#D362A4'`, `income:'#4ADE80'`, `expense/danger:'#E8631C'`, `transfer:'#FF8FC2'`.

**Profesional (fintech corporativo)** — swatch `#2F5BD0 / #0F766E / #475569`.
- Claro: `background:'#F7F8FA'`, `primary:'#2F5BD0'` (azul), `secondary:'#0F766E'` (teal),
  `accent:'#6366F1'` (índigo), `income:'#15803D'`, `expense/danger:'#DC2626'`,
  `transfer:'#2563EB'`. Es la única paleta con `income`/`expense`/`transfer` propios
  (verde/rojo/azul clásicos fintech) en vez de derivarse de `primary`/`accent`.
- Oscuro: `background:'#0E1525'`, `primary:'#3B82F6'`, `secondary:'#2DD4BF'`,
  `accent:'#818CF8'`, `income:'#34D399'`, `expense/danger:'#F87171'`, `transfer:'#60A5FA'`.

Las 4 paletas cumplen WCAG AA (≥4.5:1) para `primary`/`secondary`/`accentLight`/`primaryLight`/
`text`/`textSecondary` sobre su `background`. Dos anclas de `income`/`success` se ajustaron
ligeramente respecto al valor "a ojo" inicial para llegar a AA: Profesional claro
`#16A34A→#15803D` (3.10→4.72:1) y el verde de Gay/Lésbica claro `#2E8B57→#297D4E` (4.0→4.8:1).
Limitación conocida (igual en las 4, ya presente en Bisexual): el texto blanco sobre el extremo
`primary` del gradiente `header` en modo oscuro da ~2.8-3.8:1 (<4.5 pero ≥3:1, válido para texto
grande/negrita como los labels de `ScreenHeader`/`PrimaryButton`).

### Tokens compartidos
```ts
// chart es POR TEMA: los 3 primeros colores son los protagonistas de la paleta activa
// bisexual claro: ['#C1437A','#3A60A1','#7B528C', ...] · oscuro: ['#F72585','#4CC9F0','#9D4EDD', ...]
gradients: { header, cardHighlight, balance, progress, income, expense }   // tuplas de 2 colores por tema
spacing: { xs:4, sm:8, md:16, lg:24, xl:32, xxl:48 }
borderRadius: { sm:8, md:12, lg:16, xl:24, full:999 }
fontSize: { xs:11, sm:13, md:15, lg:18, xl:24, xxl:32, hero:40 }
fontWeight: { regular:'400', medium:'500', semibold:'600', bold:'700' }
```

### Paleta protagonista (punch-up jun 2026)
Rosa/azul/morado son PROTAGONISTAS, no acentos: `ScreenHeader` y el topBar del Home llevan
`LinearGradient` rosa→morado con texto blanco; `BalanceSummary` y la card total de Cuentas usan
`gradients.balance` (texto blanco, pills translúcidas); `PrimaryButton` sin color explícito usa el
gradiente rosa→morado; el confirmar de la calculadora es `primary` sólido con glow; las barras de
progreso de Stats usan `gradients.progress` (rosa→azul/turquesa); el donut colorea por
`theme.colors.chart` (no por el color de la categoría); los chips activos (filtros y períodos)
alternan primary/secondary/accent; `TransactionCard` lleva borde izquierdo 4px (rosa=gasto,
azul=ingreso, morado=transfer); en oscuro las cards llevan `cardBorder` (#443465) y el tab bar usa
`tabActive` turquesa + dot rosa bajo el tab seleccionado (en claro: tab activo rosa); los empty
states tienen una ilustración SVG de tres círculos con los colores del `swatch` de la paleta
activa (antes fijos a la bandera bisexual, ahora dependen de `paletteId`).

### Arquitectura del tema (patrón obligatorio para código nuevo)
- `ThemeProvider` envuelve la app en `App.tsx`. Lee `paletteId`/`themeMode` de `settingsStore`
  (persistidos en AsyncStorage). `themeMode` es `'system' | 'light' | 'dark'`; en `'system'`
  sigue `useColorScheme()`. `theme = palettes[paletteId][isDark ? 'dark' : 'light']`.
- `useTheme()` → `{ theme, colors, isDark, toggleTheme, swatch, paletteId, setPalette,
  availablePalettes, themeMode, setThemeMode }`. `toggleTheme` fuerza `themeMode` a
  `'light'`/`'dark'` (sale de `'system'`). `swatch` = los 3 colores protagonistas de la paleta
  activa (usados en `EmptyState` y en las cards de `AppearanceScreen`).
- Pantalla `AppearanceScreen` (`Más → Apariencia`): selector segmentado Sistema/Claro/Oscuro +
  cards de paleta (swatch de 3 colores + check en la seleccionada). Es la única forma de cambiar
  `paletteId`/`themeMode`.
- **Estilos:** nada de `StyleSheet.create` a nivel de módulo con colores. El patrón es:
  ```ts
  const createStyles = (theme: Theme) => StyleSheet.create({ ... });   // al final del archivo
  // dentro del componente:
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);   // memoizado por tema
  ```
- `toastConfig` es una factory `createToastConfig(theme)` que `App.tsx` memoiza.
- `StatusBar`: `style={isDark ? 'light' : 'dark'}` + `backgroundColor={colors.statusBar}`.
- `AppNavigator` deriva el tema de React Navigation (`DefaultTheme`/`DarkTheme`) del modo activo.

> **Nota:** los alias `success`/`danger`/`warning` se mantienen en ambos temas apuntando a
> `income`/`expense`/`accent(-Light)`. Para código nuevo usar SIEMPRE los tokens semánticos.
> **Accesibilidad:** `primaryLight`/`accentLight` son las variantes para texto; `primary`/`accent`
> son para fondos (con texto blanco encima). En el oscuro, `accent` (#7209B7) NUNCA como color de texto.

**Splash Screen:** `expo-splash-screen@~31.0` (SDK 54). `App.tsx` llama
`SplashScreen.preventAutoHideAsync()` al cargar el módulo y `SplashScreen.hideAsync()` en el primer
`useEffect`. Esto garantiza que la splash se oculta en cuanto el React tree monta. Un `ErrorBoundary`
global en `App.tsx` captura crashes y muestra un fallback en lugar de congelar la app.

**Rendimiento (listas y arranque):**
- **Lazy loading de pantallas pesadas (`AppNavigator.tsx`):** Stats, Insights, ImportExport, las 4 de
  Splits (`Splits`/`AddSplitGroup`/`SplitGroupDetail`/`AddSplitExpense`) y las de Settings
  (`SettingsNotifications`/`Security`/`Appearance`) se cargan con `React.lazy()` + `<Suspense>` (helper
  `lazyScreen()`, fallback = `ActivityIndicator` centrado con color del tema). Metro soporta `import()`
  dinámico desde RN 0.72. Las del tab crítico (Home/Transactions/Accounts/AddTransaction) siguen estáticas.
- **`React.memo` en componentes de fila:** `TransactionCard`, `AccountCard`, `SavingsGoalCard`, `DebtCard`,
  `InsightCard`, `TagChip` (export memoizado; otros named exports como `deadlineLabel`/`severityColor` intactos).
- **FlatList/SectionList optimizadas:** las listas principales (Transactions, Accounts, Debts, Savings, Splits)
  usan `removeClippedSubviews`, `maxToRenderPerBatch={15}`, `windowSize={10}`, y `keyExtractor`/`renderItem`
  en `useCallback` (los `onPress` que dependen del closure del item se quedan inline, a propósito). **Sin
  `getItemLayout`**: las cards tienen altura variable (filas opcionales de tags/progreso/fechas, y la lista de
  Transactions es `SectionList` con headers) → poner `getItemLayout` causaría bugs de scroll.
- **Hooks de datos** (`useTransactions`/`useAccounts`/`useStats`/`useDebts`/`useSavings`/`useSplits`): ya
  usan `useState` con el setter solo dentro del fetch (en `useEffect`/acción) y devuelven referencias de
  estado estables; no construyen arrays/objetos nuevos en el `return`, así que no necesitan `useMemo`.

**SafeArea (fix barra de navegación Android):** `app.json` tiene `edgeToEdgeEnabled:true`, así que
la app dibuja bajo las barras del sistema. El fix:
- `App.tsx`: `<ErrorBoundary>` + `<SafeAreaProvider>` + `<ThemeProvider>` + `<AppLockProvider>` + `<StatusBar style="light" backgroundColor={bg} translucent />`; `LockScreen` se monta como overlay cuando `locked`.
- `components/common.tsx` → `Screen` acepta prop `edges` (default `['top']`); las pantallas modales sin tab bar
  pueden pasar `['top','bottom']`.
- `navigation/AppNavigator.tsx` → `CustomTabBar` propio con `useSafeAreaInsets()`:
  `paddingBottom = Math.max(insets.bottom, 12) + 8` (deja libres los botones back/home/recientes).
- `BottomSheet.tsx` y `AccountPicker`/modal de `Categories` respetan `insets.bottom`.
- **Calculadora (fix):** `AddTransaction` no pasa por el tab bar, así que la `Calculator` va envuelta en un `View`
  color `surface` con `paddingBottom: insets.bottom` (la `Calculator` no cambia, para no duplicar el inset en sus
  usos dentro de `BottomSheet`/`CalculatorSheet`). Los FAB de pantallas apiladas (DebtDetail, SavingsDetail,
  SplitGroupDetail) suman `insets.bottom` a su `bottom`.

**Navegación (bottom tabs, `CustomTabBar`):** Inicio (house) · Movimientos (arrow-left-right) ·
Agregar (botón central circular elevado -24, fondo primary, borde del color background) · Estadísticas
(bar-chart-3) · Más (menu). Tab activo en `primary`, inactivo en `textMuted`, labels `fontSize.xs`.
El botón central abre el modal `AddTransaction` del root stack.

**HomeScreen:** saludo por hora ("Buenos días/tardes/noches") + fecha; `BalanceSummary` con balance en
`fontSize.hero` ($ en `accent`) y dos pills (ingresos/gastos); últimas 5 transacciones; pull-to-refresh.
**Botón flotante (44×44, fondo `accent`, ícono `zap` blanco) abajo-derecha** abre un `BottomSheet` con las
plantillas (cada una con botón "Usar"); enlace "Gestionar plantillas" lleva al CRUD completo.

**AddTransactionScreen:** tabs de tipo tipo pill con color semántico; fila de chips scrollable
(cuenta / categoría o destino / fecha); input de descripción opcional; `Calculator` en la mitad inferior.

**TransactionsScreen:** búsqueda pill (`borderRadius.full`), chips de filtro scrollables (tipo + cuenta +
fecha + limpiar), lista agrupada por fecha, swipe-to-delete (fondo `expense`), FAB `primary` abajo-derecha.

**StatsScreen:** tabs de período scrollables; cards de resumen Ingresos/Gastos + card de Balance neto;
donut por categoría con leyenda y porcentajes; barras (top redondeado) ingresos vs gastos; línea de
evolución (`accentLight`); top categorías con barra de progreso.

**AccountsScreen:** card total consolidado con `LinearGradient` (gradiente `cardHighlight`); cuentas como
cards con borde izquierdo (4px) del color de la cuenta; "+" en el header.

**CategoriesScreen:** tabs pill Gastos/Ingresos (color `expense`/`income`); padres con ícono+color;
subcategorías colapsables indentadas con línea vertical del color del padre.

**Calculadora:** ocupa mitad inferior de AddTransactionScreen. Botones 0-9, `.`, `+ - × ÷`, `⌫`, `C`, `✓`.
Números fondo `surfaceLight`; operadores fondo `primaryDark` / texto `primaryLight`; borrar `surfaceAccent`;
confirmar `✓` ancho doble en color semántico (`income`/`expense`/`transfer`), `borderRadius.xl`.
Display: expresión (`textMuted`, `fontSize.lg`) + resultado (`fontSize.hero`, coloreado por tipo).
Motor en `calculatorEngine.ts` (evaluación paso a paso, **NO `eval()`**). Maneja edge cases.
> Sin haptic feedback: `expo-haptics` fue removido (incompatible con Node 22).

**Dependencia añadida:** `expo-linear-gradient` (~15.0.8, bundled en Expo Go SDK 54) para los gradientes.

---

## FEATURES CLAVE
1. **Calculadora integrada** para el monto (no input de texto).
2. **Dashboard**: balance total, resumen del mes (ingresos vs gastos + barra), últimas 5 transacciones, top 3 plantillas, FAB.
3. **Transacciones**: lista agrupada por fecha (hoy/ayer/semana/mes/anteriores), filtros, búsqueda, swipe-delete.
4. **Cuentas**: lista con balance individual, crear/editar, total consolidado.
5. **Categorías**: tabs Gastos/Ingresos, padres con subcategorías colapsables, CRUD. Seed por defecto.
6. **Plantillas**: orden por uso, pre-llenan AddTransaction, incrementan use_count, swipe-delete.
7. **Estadísticas**: período seleccionable, resumen, donut por categoría, barras ingresos/gastos, línea de evolución, top categorías. Gráficas con SVG propio (`react-native-svg`) en `components/StatChart.tsx` (`DonutChart`, `BarChart`, `LineChart`) — **no** `victory-native`.
8. Montos siempre formateados (separador de miles + símbolo). Pull-to-refresh en listas. Errores vía toasts (mobile) y middleware (backend).
9. **Etiquetas (tags):** etiquetas libres con color/ícono, asignables a transacciones (`TagPicker` en AddTransaction, `TagChip`), CRUD en `TagsScreen` ("Más"), filtro por tag en Movimientos.
10. **Metas de ahorro:** `SavingsScreen` con card total gradiente, `AddSavingsGoal` (Calculator, fecha límite, cuenta, color/ícono), `SavingsDetail` con contribuciones (depósito/retiro vía BottomSheet+Calculator), card resumen en Home (`HomeSummaryCard`).
11. **Deudas y préstamos:** `DebtsScreen` con toggle "Mis deudas"/"Me deben", card de balance neto y sección **"Historial"** colapsable para las saldadas (con borrado definitivo); `DebtCard` con barra invertida (cuánto falta), indicador de vencimiento urgente (≤7 días); `AddDebt` (tipo, persona/entidad, tasa de interés, fechas, cuenta + switch "registrar desembolso inicial en la cuenta"); `DebtDetail` con historial de pagos (muestra la cuenta) y FAB "Registrar pago" (BottomSheet con `AccountChips` + Calculator). Cada abono con cuenta mueve el balance real (income/expense). Card en Home si hay activas.
12. **Gastos compartidos (splits):** `SplitsScreen` lista grupos con mi balance ("Te deben"/"Debes"/"Estás a mano"); `AddSplitGroup` con miembros (uno marcado "Yo", mínimo 2); `SplitGroupDetail` con balances simplificados (greedy) + botón "Liquidar" por transferencia (con `AccountChips` cuando me involucra, como confirmación explícita del movimiento), lista cronológica de gastos y FAB; `AddSplitExpense` con división en partes iguales o personalizada (valida la suma), pagador, categoría opcional y **cuenta cuando pago yo** (descuenta de la cuenta real). Card en Home si hay balances pendientes.
13. **Hora editable** en gastos/ingresos (`TimePicker` propio, BottomSheet de 2 columnas 24h) junto al chip de fecha en `AddTransaction`.
14. **Íconos y colores ampliados:** `ACCOUNT_ICONS` (25) y `CATEGORY_ICONS` (60) en `Icon.tsx`, `PALETTE` (24) en `theme/index.ts` (los 12 originales primero). Selectores en grilla (`flexWrap`). `components/AccountChips.tsx` = selector inline de cuenta para BottomSheets.
15. **Importar / Exportar:** `ImportExportScreen` (sección "Ajustes" de "Más"). **Exportar:** filtros de tipo
    (chips), cuenta (`AccountChips`, "Todas"), rango de fechas (`DateRangePicker`) y categoría (`CategoryPicker`);
    botones "Exportar CSV"/"Exportar JSON" → descarga con `expo-file-system` (legacy) a `cacheDirectory` y abre el
    diálogo de compartir con `expo-sharing`. **Importar:** "Seleccionar archivo CSV" (`expo-document-picker`),
    parseo en el cliente con un parser CSV propio (`utils/csv.ts` → `parseCSV` maneja comillas/comas escapadas y
    BOM; `csvToImportRows` mapea columnas por nombre de cabecera, tolerante a tildes y orden), vista previa de las
    primeras 10 filas + total, botón "Importar X transacciones" y resumen final con importadas vs errores (lista de
    fila + motivo). Refresca los datos con `triggerRefresh()` de Zustand tras importar. CSV round-trippable
    (mismas columnas que exporta).
16. **Notificaciones locales y recordatorios:** `SettingsNotificationsScreen` (sección "Ajustes" de "Más") con estado de permisos (amable: explica antes de pedir, y si están denegados muestra botón "Abrir ajustes" → `Linking.openSettings()`), toggle + selector de hora del recordatorio diario ("No olvides registrar tus gastos de hoy", default 8:00 PM vía `TimePicker`), y toggles para alertas de deudas y metas. Preferencias persistidas en AsyncStorage (`useNotificationSettings`). Todo con `scheduleNotificationAsync` (local, sin push ni servidores). **Alertas de deudas:** una 7 días antes del vencimiento y otra el día del vencimiento; se reprograman al crear/editar (`AddDebt`) y al saldar (`DebtDetail` → se cancelan si queda saldada o se elimina). **Alertas de metas:** 7 días antes de la fecha límite; se reprograman al crear/editar/contribuir y se cancelan al completar/eliminar. Centralizado en `src/services/notifications.ts` (ver "Notificaciones locales").
17. **Insights financieros automáticos:** `GET /api/insights` (agregación SQL determinística, sin IA — ver
    "Insights" en API REST). `useInsights` + `InsightCard` (ícono por `type`, color por `severity`: positive→income,
    warning→expense, info→secondary; formatea `value` por tipo: moneda / `%` / días). En `HomeScreen` un **carrusel
    horizontal** de hasta 3 `InsightCard` entre el `BalanceSummary` y las últimas transacciones (solo si hay
    insights; enlace "Ver todos"). `InsightsScreen` (acceso desde el botón de la cabecera de Estadísticas y desde
    "Más") con la lista completa **agrupada por severity** (Atención / Vas bien / Para tener en cuenta) y
    pull-to-refresh. Pensado para que a futuro un LLM genere el `message`.
18. **Multi-moneda real:** cada cuenta tiene su moneda (catálogo curado: COP, USD, EUR, VES, MXN, ARS, PEN, CLP,
    BRL en `utils/currencies.ts`); `CurrencyPicker` (BottomSheet con búsqueda, código+símbolo+nombre) en `AddAccount`.
    Las transacciones se guardan en la moneda de su cuenta; `TransactionCard`/`AccountCard` muestran cada monto en su
    moneda. **Moneda principal** (setting en "Más", persistida en AsyncStorage vía `settingsStore`) define la
    `displayCurrency` del **balance consolidado** del Home (`BalanceSummary`), `AccountsScreen` (card total con nota
    "Tasas actualizadas hace X" tocable para refrescar) y `Stats` (todos los montos convertidos). `formatCurrency`
    formatea con símbolo y separadores (Intl si está, fallback manual es-CO). **Tasas:** `useAccountsSummary` +
    `ratesApi`; `RatesScreen` (desde la card de Cuentas) lista las tasas vs la moneda principal y permite fijar tasas
    **manuales** (no se sobreescriben) o volver a automáticas. **Transferencias entre monedas distintas:** en
    `AddTransaction` (transfer), al confirmar se abre una hoja "Monto recibido" precargada con la conversión por la
    tasa actual pero **editable** (la tasa real del usuario manda); se guarda `to_amount` y cada cuenta se mueve en su
    propia moneda. ⚠️ VES puede no estar en las APIs gratuitas → se fija a mano.
19. **Bloqueo con PIN + biometría (LOCAL, sin backend auth):** `SecurityScreen` ("Seguridad" en "Más"): toggle
    "Bloquear app con PIN" → flujo crear+confirmar PIN (4 dígitos, teclado propio estilo Calculator); si hay PIN y el
    dispositivo soporta biometría, toggle "Desbloquear con huella/rostro"; "Cambiar PIN" y desactivar (ambos exigen
    PIN actual o biometría vía `PinModal`). El PIN se guarda **hasheado** (SHA-256 + salt aleatorio, `expo-crypto`)
    en **`expo-secure-store`** (NUNCA en claro ni AsyncStorage). `LockScreen` es un overlay a nivel raíz en `App.tsx`
    (sobre el navigator, dentro de `AppLockProvider`): aparece al abrir la app y al volver de background si pasaron
    **>60s** (`useAppLock` con listener de `AppState`); dispara la biometría automáticamente al montar con fallback
    "Usar PIN". **Lockout:** tras **5 intentos** fallidos se bloquea **30s** con contador visible; intentos y lockout
    se **persisten en SecureStore** (cerrar la app no los resetea). **Edge cases:** si se quita la biometría del
    sistema cae a PIN sin crashear; si SecureStore falla, las lecturas devuelven "sin bloqueo" (la app no se brickea)
    y las escrituras avisan por toast. Componentes `PinDots`/`PinKeypad`/`PinModal`, servicio `services/security.ts`.
    Ver "Bloqueo con PIN" abajo. ⚠️ La **biometría** solo se prueba de verdad en APK/development build.
20. **Recibos (foto en transacciones), almacenamiento LOCAL:** se puede adjuntar UNA foto de recibo/factura a
    cada transacción. **Decisión de almacenamiento (opción A):** la imagen vive en el dispositivo en
    `documentDirectory/receipts/{uuid}.jpg` y en la DB solo se guarda el **nombre** (`transactions.receipt_filename`).
    **No** se sube al backend ni se mete base64 en Postgres (pro: simple, sin costos; contra: no sincroniza entre
    dispositivos — aceptable, app single-device). `utils/receiptStorage.ts` centraliza rutas/guardar/leer/borrar:
    `processAndSaveReceipt` comprime con **expo-image-manipulator** (resize máx 1280px de ancho solo si excede,
    JPEG calidad 0.7) y mueve a `receipts/` con nombre `Crypto.randomUUID()`. En `AddTransactionScreen`: chip
    **"Recibo"** (clip) → `BottomSheet` "Tomar foto"/"Elegir de galería" (**expo-image-picker**, permisos con manejo
    de denegado sin crashear); con foto, el chip muestra thumbnail y abre `ReceiptViewer` (preview a pantalla
    completa, fondo negro, cerrar + "Eliminar foto", placeholder "Imagen no disponible" si el archivo falta).
    **Ciclo de vida del archivo:** se borran huérfanos al reemplazar/quitar (inmediato), al salir sin guardar
    (cleanup en unmount vía `tempFilesRef`/`savedFileRef`) y al borrar la transacción (incluido swipe-to-delete en
    `TransactionsScreen` y el trash de la edición); el archivo persistido solo se borra al confirmar el cambio al
    guardar. `TransactionCard` muestra un ícono `paperclip` si la transacción tiene recibo.

---

## SEED DATA
- **Gastos:** Alimentación (restaurantes, mercado, snacks), Transporte (bus, taxi, gasolina),
  Vivienda (arriendo, servicios, internet), Entretenimiento (streaming, juegos, salidas),
  Salud (medicamentos, consultas, gym), Educación (matrícula, libros, cursos), Ropa, Tecnología.
- **Ingresos:** Salario, Freelance, Inversiones, Regalos, Reembolsos.
- Cuenta **"Efectivo"** con balance 0.

---

## ENTORNO Y COMPATIBILIDAD

- **Node:** v22.x. Correr con `NODE_OPTIONS="--no-experimental-strip-types"` para que Node no intente
  el *type stripping* nativo sobre los `.ts`. Expo/Metro transpilan TS con su propio loader (babel),
  así que **nada del proyecto depende del type stripping nativo de Node**. El backend usa `tsx`.
- **Expo Go:** la app apunta a **SDK 54** (la última de Play Store). No usar versiones de SDK 55/56.
- **pnpm:** v11.x en todo el monorepo (nunca npm/yarn). `mobile/pnpm-workspace.yaml` declara
  `onlyBuiltDependencies: []` → **ningún** paquete ejecuta build scripts (con Expo Go no se compila
  nativo en local). Si pnpm reporta `Ignored build scripts`, correr `pnpm approve-builds` y agregar el
  paquete a esa lista. Hoy ningún dep requiere aprobación.
- **Babel (`mobile/babel.config.js`):** solo `presets: ['babel-preset-expo']`. En SDK 54
  `babel-preset-expo` **inyecta automáticamente** `react-native-worklets/plugin` (el plugin de
  Reanimated 4) cuando `react-native-worklets` está instalado. **NO** agregar el plugin manualmente
  (`react-native-reanimated/plugin`) o se aplicaría dos veces y rompe el bundle.
- **New Architecture:** `app.json` tiene `newArchEnabled: true` (default en SDK 54, requerido por Reanimated 4).
- **Verificado:** `npx expo-doctor` → 18/18 checks OK. `pnpm typecheck` limpio.
  `pnpm start` levanta Metro y el bundle Android compila (3910 módulos, sin errores).

### Cambios de compatibilidad aplicados (jun 2026)
- Downgrade de SDK 56 → **SDK 54**: expo `~54.0.0`, react `19.1.0`, react-native `0.81.5`,
  reanimated `~4.1`, screens `~4.16`, gesture-handler `~2.28`, safe-area-context `~5.6`,
  svg `15.12`, expo-status-bar `~3.0`, @expo/vector-icons `^15`, typescript `~5.9`, @types/react `~19.1`.
- **Agregados** (peers requeridos por el SDK 54): `react-native-worklets@0.5.1`, `expo-font@~14.0`.
- **Removidos:** `victory-native` (no se usaba; arrastraba skia) y `expo-haptics` (incompatible con Node 22).
- **Limpiado:** `Calculator.tsx` (llamadas huérfanas a `impactAsync`), `babel.config.js`
  (quitado el plugin manual de reanimated), `pnpm-workspace.yaml` (clave `allowBuilds` inválida → `onlyBuiltDependencies`).

### Notificaciones locales (jun 2026)
- **Dependencias:** `expo-notifications@~0.32.17`, `@react-native-async-storage/async-storage@2.2.0`
  y `expo-constants@~18.0.13` (instaladas con `npx expo install`, alineadas al SDK 54). expo-doctor 18/18 OK.
- **Servicio:** `src/services/notifications.ts` centraliza todo. Identifiers **determinísticos**
  para poder cancelar sin guardar referencias: `daily-reminder`, `debt-<id>-soon`, `debt-<id>-due`,
  `goal-<id>-deadline`. Solo notificaciones LOCALES (`scheduleNotificationAsync`), **sin push remoto
  ni servidores**. `setNotificationHandler` (banner+sonido en primer plano) se configura DENTRO de la
  carga lazy, no en el top-level. Canal Android `reminders` (importancia HIGH). Las alertas de
  deudas/metas se disparan a las **9:00** del día correspondiente y solo se programan si la fecha es
  futura (evita spam al reprogramar). El recordatorio diario usa un trigger `DAILY` (hora/minuto del usuario).
- **Carga PEREZOSA (anti Console Error en Expo Go):** el módulo `expo-notifications` se importa con
  `await import('expo-notifications')` (dinámico, cacheado una sola vez) **solo cuando el entorno lo
  soporta**; el archivo NO tiene import estático del módulo (solo `import type`, que se borra en
  compilación). `isExpoGo()` usa `expo-constants`
  (`Constants.executionEnvironment === ExecutionEnvironment.StoreClient`, con `appOwnership === 'expo'`
  de fallback). En **Expo Go Android** `getNotificationsModule()` devuelve `null` sin importar nunca
  el módulo → todas las funciones públicas son **no-ops seguros** (devuelven `null`/`void`, no lanzan)
  y se loguea **una sola vez**: `[notifications] Deshabilitadas en Expo Go — usar APK/development build`.
  `areNotificationsSupported()` expone el estado a la UI.
- **Reprogramación:** `App.tsx` llama `initNotifications()` al arrancar (canal + `syncAllNotifications`,
  que cancela todo y reprograma desde el backend: deudas activas con `dueDate` y metas no completadas
  con `deadline`). Las pantallas de mutación llaman `reschedule*Notifications(...)` / `cancel*Notifications(...)`
  (fire-and-forget). Cambiar preferencias en `SettingsNotificationsScreen` también dispara `syncAllNotifications`.
- **Permisos:** flujo amable — se explica el porqué antes de pedir; si el usuario los deniega, la
  pantalla muestra el estado y un enlace a los ajustes del sistema (`Linking.openSettings()`).
  El scheduling chequea permiso antes de programar (si falta, no-op silencioso).
- ⚠️ **Expo Go vs development build:** desde **SDK 53 el Expo Go de Android ya no incluye el módulo
  `expo-notifications`** — y con el solo hecho de **importarlo** se dispara un Console Error. Por eso el
  servicio es **no-op en Expo Go Android** (no importa el módulo, no programa nada) y
  `SettingsNotificationsScreen` muestra un banner "No disponible en Expo Go. Genera el APK con eas
  build para probarlas" con los toggles deshabilitados. **Las notificaciones solo se prueban de verdad
  en un APK / development build** (`pnpm build:apk` → `eas build -p android --profile preview`).

### Bloqueo con PIN y biometría (jun 2026)
- **Dependencias:** `expo-secure-store@~15.0.8` (+ config plugin en `app.json`), `expo-local-authentication@~17.0.8`,
  `expo-crypto@~15.0.9` (instaladas con `npx expo install`). expo-doctor 18/18 OK. A diferencia de las
  notificaciones, **estos módulos SÍ vienen en Expo Go SDK 54**, así que el PIN funciona en Expo Go.
- **Servicio `src/services/security.ts`:** `hashPin(pin,salt)` = SHA-256 de `salt:pin` (`expo-crypto`);
  `setPin` genera salt aleatorio (16 bytes, `getRandomBytesAsync`) y guarda **hash+salt** en SecureStore
  (claves `wallet_pin_hash`/`wallet_pin_salt`); `verifyPin` recomputa y compara. `disableLock` borra todo.
  Biometría: `isBiometricAvailable` (`hasHardwareAsync && isEnrolledAsync`), `isBiometricEnabled` (flag en
  SecureStore), `authenticateBiometric` (`authenticateAsync` con `disableDeviceFallback:true` → fallback a NUESTRO
  PIN, no el del sistema). Lockout: `recordFailedAttempt`/`getLockState`/`resetAttempts` persisten
  `wallet_pin_attempts` y `wallet_pin_lock_until` en SecureStore (5 fallos → 30s). Constantes: `PIN_LENGTH=4`,
  `MAX_ATTEMPTS=5`, `LOCKOUT_MS=30000`, `AUTO_LOCK_MS=60000`.
- **Robustez (no brickear):** todos los accesos a SecureStore van en try/catch; **lecturas** devuelven valores
  seguros (p. ej. `isPinEnabled()→false` ante error → app sin bloqueo) y **escrituras** propagan el error para
  avisar por toast. Si el usuario quita la biometría del sistema, `isBiometricAvailable()` lo detecta y la UI cae a PIN.
- **`useAppLock` (provider en `hooks/useAppLock.tsx`):** lee el estado del PIN al arrancar (cold start → bloquea si
  hay PIN), expone `{ ready, enabled, locked, unlock, refresh }`. Listener de `AppState`: guarda el instante de
  background y, al volver a `active`, re-bloquea SOLO si pasó > `AUTO_LOCK_MS`. `App.tsx` envuelve con
  `<AppLockProvider>` y renderiza `<LockScreen>` como **overlay absoluto sobre el navigator** (no lo desmonta, así no
  se pierde el estado de navegación); mientras `!ready` tapa el contenido con un `View` del color de fondo.
  `SecurityScreen` llama `refresh()` tras activar/desactivar (al activar NO bloquea en sesión).
- ⚠️ **Expo Go vs APK:** el **PIN** funciona en Expo Go. La **biometría** depende del hardware/enrolamiento; en
  emuladores o Expo Go puede no estar disponible (la UI lo refleja y cae a PIN). **Se prueba de verdad en el APK /
  development build** (`pnpm build:apk`).

### Fix splash freeze (jun 2026)
- **Agregado** `expo-splash-screen@~31.0` — control explícito: `preventAutoHideAsync()` al cargar el módulo,
  `hideAsync()` en el primer `useEffect` de `App.tsx`.
- **Agregado** `ErrorBoundary` global en `App.tsx` — si un componente crashea, muestra pantalla de error
  en lugar de congelar en la splash.
- **Reducido** timeout de Axios de 15 s → 5 s en `api/client.ts` para fallar rápido si el backend no responde.
  (Los `console.log` de diagnóstico que dejó este fix ya se removieron.)

## COMANDOS

```bash
# Backend
cd server
pnpm install
pnpm db:generate    # genera migraciones desde schema.ts
pnpm db:migrate     # aplica migraciones
pnpm db:seed        # inserta categorías default + cuenta Efectivo
pnpm dev            # arranca API en :3000

# Mobile  (Node 22: exportar el flag para evitar el type stripping nativo)
cd mobile
export NODE_OPTIONS="--no-experimental-strip-types"
pnpm install
pnpm start          # Expo dev server (SDK 54 / Expo Go)
pnpm typecheck      # tsc --noEmit
pnpm build:apk      # eas build -p android --profile preview
```
