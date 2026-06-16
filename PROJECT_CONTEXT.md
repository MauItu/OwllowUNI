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
    `SUMMARY_TTL_MS`). `refresh=true` siempre hace bypass; solo cachea respuestas 2xx. Los TTLs en ms
    (`*_TTL_MS`) se derivan de los valores canónicos en segundos de `utils/constants.ts` (`CACHE_TTL_*`).
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
- **Cap defensivo en las LISTAS de nivel superior:** todos los GET de lista por usuario llevan `.limit(200)`
  (cap silencioso, sin cambiar la forma de la respuesta): `GET /api/accounts`, `/api/categories` (y `/:type`),
  `/api/tags`, `/api/templates`, `/api/savings`, `/api/debts`, `/api/budgets` (vía `fetchBudgets`) y
  `/api/splits`. Son colecciones acotadas por uso (un usuario no tiene 200 cuentas/categorías), pero el cap
  evita lecturas no acotadas en el peor caso. **Excepción intencional:** `GET /api/transactions/export` NO
  lleva cap (debe exportar TODO el rango; la lista `GET /api/transactions` ya está paginada con `page/limit`).
- **Paralelización en `GET /api/budgets/history`:** las dos lecturas independientes (presupuestos activos +
  gasto por mes/categoría) van en `Promise.all` (no dependen entre sí). Los GET de **detalle** (`/:id` con
  hijos) se mantienen **seriales a propósito**: verifican propiedad del padre ANTES de traer los hijos, para
  no leer colecciones de otro usuario aunque el 404 final no las exponga.
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
│   │   ├── accounts.ts          ← incluye GET /summary (débito vs crédito) + tarjetas de crédito (estados de cuenta)
│   │   ├── categories.ts
│   │   ├── transactions.ts
│   │   ├── templates.ts
│   │   ├── stats.ts            ← acepta displayCurrency (convierte por moneda de cuenta)
│   │   ├── tags.ts
│   │   ├── savings.ts
│   │   ├── debts.ts
│   │   ├── budgets.ts
│   │   ├── splits.ts
│   │   ├── insights.ts        ← insights financieros (agregación SQL determinística)
│   │   ├── rates.ts           ← tasas de cambio (GET /, PUT/DELETE /manual)
│   │   └── recurring.ts       ← CRUD /api/recurring-rules + toggle + /api/recurring/catch-up
│   ├── services/
│   │   ├── exchangeRates.ts    ← Frankfurter + open.er-api.com, cache 24h, stale, manuales
│   │   └── recurring.ts        ← materializeRecurringCharges (idempotente, cursor + saga + lock por-usuario en-proceso)
│   ├── middleware/
│   │   ├── errorHandler.ts
│   │   ├── auth.ts            ← authenticate/userId/requireAdmin + signToken (JWT)
│   │   ├── rateLimiter.ts    ← express-rate-limit: loginLimiter (5/15m), registerLimiter (3/h) por IP
│   │   └── requestLogger.ts  ← log HTTP mínimo "[HTTP] MÉTODO /path STATUS TIMEms" (prod: solo >1000ms o >=400)
│   └── utils/
│       ├── safeCompensate.ts ← rollback de saga tolerante a fallos (log estructurado, no pisa el error original)
│       ├── validateEnv.ts    ← validación de env con Zod al arrancar (import PRIMERO en index.ts) + JWT_EXPIRATION
│       ├── parseId.ts        ← parseId(req.params.*) → entero > 0 o ApiError(400)
│       ├── creditCardDebt.ts ← buildFifoCardDebtPayment: abono FIFO a las deudas automáticas de una tarjeta
│       ├── installments.ts   ← cuotas a crédito: frenchInstallment (amortización francesa) + computeDueInfo (mora/próximo pago)
│       ├── balance.ts        ← balanceStatements (UPDATE de saldos por tx; extraído de transactions.ts, reusado por recurring)
│       ├── recurrence.ts     ← computeOccurrences/nextOccurrence (fechas de cobro PURAS por frecuencia, testeable)
│       └── constants.ts      ← números mágicos centralizados (BCRYPT_ROUNDS, PAGINATION_*, IMPORT_BATCH_SIZE, CACHE_TTL_*)
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
    │                              useStats, useTags, useSavings, useDebts, useBudgets, useSplits, useGlobalSearch,
    │                              useNotificationSettings, useInsights, useAccountsSummary, useRecurringRules,
    │                              useAppLock (provider de bloqueo + AppState)
    ├── stores/appStore.ts      ← Zustand (filtros, refresh triggers, plantilla seleccionada)
    ├── stores/settingsStore.ts ← Zustand + persist/AsyncStorage (mainCurrency)
    ├── stores/sidebarStore.ts  ← Zustand (estado abierto/cerrado del Sidebar: isOpen/open/close/toggle)
    ├── screens/                ← Home, Transactions, AddTransaction, Accounts, AddAccount, CreditCardDetail,
    │                              Categories, Templates, Stats, Tags, Savings, AddSavingsGoal,
    │                              SavingsDetail, Debts, AddDebt, DebtDetail, Budgets, Splits,
    │                              AddSplitGroup, SplitGroupDetail, AddSplitExpense,
    │                              RecurringRules, AddRecurringRule, More (tab "Más": menú de navegación),
    │                              SettingsNotifications, ImportExport, Insights, Rates, Security, LockScreen, SetupPin, Search
    ├── utils/roles.ts          ← getUserRole(email): rol informativo por correo (Alpha Tester)
    ├── components/             ← Calculator, CalculatorSheet, TransactionCard, AccountCard,
    │                              AccountPicker, CategoryPicker, DateRangePicker, BalanceSummary,
    │                              StatChart, TemplateCard, TagChip, TagPicker, SavingsGoalCard,
    │                              DebtCard, HomeSummaryCard, InsightCard, CurrencyPicker, Sidebar (drawer de perfil),
    │                              WelcomeOverlay (bienvenida épica al login), GlobalSearchBar,
    │                              tour/ (TourProvider + useTourTarget + GuidedTour: tutorial guiado interactivo),
    │                              AccountTypeFilter (filtro Todas/Débito/Crédito), PinDots, PinKeypad, PinModal,
    │                              ReceiptViewer, BottomSheet, DayPickerSheet, Icon, common
    ├── navigation/AppNavigator.tsx  ← Bottom tabs + native stacks (NavigationContainer con navigationRef)
    ├── navigation/navigationRef.ts  ← createNavigationContainerRef: navegar desde fuera del árbol (overlays/notificaciones)
    ├── theme/index.ts          ← lightTheme + darkTheme (colores, spacing, radius, fontSize)
    ├── theme/ThemeContext.tsx  ← ThemeProvider, useTheme(), useThemedStyles()
    ├── utils/                  ← formatCurrency (Intl + fallback manual), currencies (catálogo curado),
    │                              formatDate, calculatorEngine, csv (parser propio + csvToImportRows),
    │                              statsAggregation (recálculo client-side de stats por tipo de cuenta),
    │                              receiptStorage (fotos de recibos locales: comprimir/guardar/borrar/rutas),
    │                              installments (frenchInstallment: espejo del server para el preview de cuotas)
    └── types/index.ts          ← tipos compartidos
```

---

## ESQUEMA DE BASE DE DATOS (Drizzle + PostgreSQL)

### accounts
`id` serial PK · `name` varchar(100) NN · `type` varchar(30) NN (`bank|cash|credit_card|digital_wallet`)
· `currency` varchar(3) def `COP` · `initial_balance` decimal(15,2) def 0 · `current_balance` decimal(15,2) def 0
· `color` varchar(7) def `#4F46E5` · `icon` varchar(50) def `wallet` · `is_active` bool def true
· `created_at` / `updated_at` timestamp def now()
· **Solo tarjetas de crédito** (nullable en el resto; migración `0013_unique_thor.sql`, aditiva):
  `credit_limit` decimal(15,2) nullable (tope; null = no es tarjeta) · `billing_cycle_day` int nullable (día de corte 1-28)
  · `payment_due_day` int nullable (día de pago 1-28) · `allow_overdraft` bool def false (permitir gastar por encima del cupo).
· **Congelar tarjeta (migración `0019_jazzy_microchip.sql`, aditiva):** `is_frozen` bool def false NN — solo tarjetas;
  bloquea gastos nuevos (POST/PUT transactions y el motor recurrente) pero permite pagos de deuda. `is_frozen` ≠ `is_active`.
· **Cuota de manejo (migración `0018_shallow_robbie_robertson.sql`, aditiva, nullable):** `management_fee_amount` decimal(15,2)
  (monto; null = sin cuota) · `management_fee_day` int (día de cobro 1-28) · `management_fee_rule_id` int FK→recurring_rules
  (ON DELETE SET NULL) — regla recurrente mensual vinculada que materializa la cuota (ver "Cuota de manejo").
> **Tarjeta de crédito (modelo NUEVO — migración `0014`):** el `current_balance` representa el **CRÉDITO DISPONIBLE
> (positivo)**, NO la deuda. Empieza igual al `credit_limit` y BAJA al gastar (`current_balance -= amount`). En el alta,
> el `initial_balance` que envía el usuario se interpreta como **deuda preexistente** y el saldo guardado es el
> **disponible = `credit_limit − deuda`** (límite 5.500.000 con deuda 1.000.000 → `current_balance = 4.500.000`; deuda 0 →
> disponible = límite). Crédito disponible = `current_balance`; crédito usado/adeudado = `credit_limit − current_balance`.
> La migración `0014` convierte las tarjetas existentes del modelo viejo (saldo negativo = deuda) al nuevo
> (`current_balance = credit_limit + current_balance`). Gastar con tarjeta **no** toca el saldo de débito: solo baja el
> disponible y **genera una deuda automática** (ver `transactions.debt_id` y POST /api/transactions).

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
· **Cuotas + deuda automática (migración `0014`, aditiva):** `installments` int nullable (nº total de cuotas, ej: 36) ·
  `current_installment` int nullable (cuota actual, al crear = 1) · `installment_amount` decimal(15,2) nullable
  (**cuota amortizada** = `frenchInstallment(amount, %mensual, n)`; con 0% de interés ≡ `amount/n`) · `debt_id` int FK→debts
  nullable (deuda generada al gastar con tarjeta; 1 por compra). Los 4 campos solo aplican a **gasto con tarjeta de
  crédito**; null en débito y en compras de contado. Las **tasas** de la compra a cuotas (interés del crédito y de mora)
  se piden en `POST/PUT /api/transactions` (`monthlyInterestRate`/`lateInterestRate`) y se guardan en la **deuda
  automática**, no en la transacción.
> **No se admiten ingresos en tarjetas de crédito** (corrección C1): `POST`/`PUT` con `type='income'` y cuenta origen
> `credit_card` → **400**. En mobile la pestaña "Ingreso" se oculta cuando la cuenta es una tarjeta.
· **Pagos recurrentes (migración `0017_sudden_veda.sql`, aditiva):** `recurring_rule_id` int FK→recurring_rules
  (ON DELETE **SET NULL**) — la regla que generó esta transacción (worker de materialización). NUNCA se borra el vínculo
  en los registros auto-generados; al eliminar la regla queda NULL pero la transacción se conserva. null en registros manuales.
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
> **`account_id` = cuenta por defecto del aporte (ya NO es earmark).** Es solo la cuenta sugerida al contribuir; no
> reserva ni descuenta nada por sí misma. El dinero se mueve en cada contribución (ver abajo), no por la asociación.

### savings_contributions
`id` serial PK · `goal_id` int FK→savings_goals ON DELETE CASCADE NN · `amount` decimal(15,2) NN
· `type` varchar(10) NN (`deposit|withdrawal`) · `description` varchar(255) · `date` date NN
· `account_id` int FK→accounts (cuenta que financia/recibe, idx) · `transaction_id` int FK→transactions · `created_at` timestamp def now()
> **Modelo de movimiento real (migración 0020).** Cada aporte EXIGE `account_id` y mueve el saldo de esa cuenta: depósito
> RESTA del `current_balance`, retiro lo DEVUELVE. El ahorro deja de contar como saldo líquido y se rastrea por cuenta. NO
> se crean transacciones (`transaction_id` queda null) para no contaminar stats de gastos. `GET /api/accounts` expone
> `savingsBalance` (neto Σdep − Σret financiado desde la cuenta) y `GET /api/accounts/:id/savings` da el desglose por meta.
> Editables/eliminables (`PUT`/`DELETE /api/savings/:id/contribute/:contributionId`): revierten su efecto sobre
> `current_amount` Y sobre el saldo de la(s) cuenta(s) involucrada(s) en un batch atómico, y recalculan `is_completed`
> (400 si dejaría el ahorro negativo). Los aportes del modelo viejo (sin `account_id`) no mueven saldo al editarse/borrarse.

### debts
`id` serial PK · `name` varchar(100) NN · `type` varchar(10) NN (`debt`=yo debo | `loan`=me deben)
· `total_amount` decimal(15,2) NN · `remaining_amount` decimal(15,2) NN · `interest_rate` decimal(5,2) (% anual, informativo — deudas SIN cuotas)
· `creditor_debtor` varchar(100) · `start_date` date NN · `due_date` date (**fecha límite de pago**) · `color` varchar(7) def `#C1437A`
· `icon` varchar(50) def `landmark` · `is_paid_off` bool def false · `paid_off_at` timestamp · `notes` text
· `account_id` int FK→accounts · `created_at` / `updated_at` timestamp def now()
· **Desembolso inicial enlazado (migración `0016_warm_bug.sql`, aditiva):** `initial_transaction_id` int FK→transactions
  (ON DELETE **SET NULL**) — la transacción del desembolso inicial de una deuda NORMAL con cuenta asociada (opt-in
  `registerInitialTransaction`). Permite revertir el saldo de la cuenta al ELIMINAR la deuda (C8). null en deudas sin
  desembolso y en deudas automáticas de tarjeta.
· **Corte + cuotas/interés (migración `0015_clammy_blindfold.sql`, aditiva, todas nullable):** `cutoff_date` date
  (fecha de corte/statement) · `installments` int (nº de cuotas; null = deuda de un solo pago) · `installment_amount`
  decimal(15,2) (**cuota amortizada** = `frenchInstallment(total, %mensual, n)`) · `monthly_interest_rate` decimal(5,2)
  (interés del crédito, **% MENSUAL**, amortización francesa) · `late_interest_rate` decimal(5,2) (interés de mora, **% MENSUAL**).
> **Cuotas con interés (correcciones C4/C5).** Cuando una deuda/crédito tiene `installments`, la cuota se calcula por
> **amortización francesa** (`server/src/utils/installments.ts → frenchInstallment`): cuota fija = `P·i/(1−(1+i)^−n)` con
> `i = monthly_interest_rate/100`; si `i=0` ≡ `P/n`. `GET /api/debts` y `/:id` agregan campos **derivados** (no persistidos)
> con `computeDueInfo`: `isOverdue` (hoy > `due_date` y no saldada), `lateFee` (= cuota·`late_interest_rate`%·meses vencidos,
> mín. 1 mes) y `nextPaymentAmount` (= cuota + mora, topado al restante). El mobile prellena la calculadora del pago con
> `nextPaymentAmount`. Las deudas automáticas de compras a cuotas con tarjeta heredan estas columnas desde `transactions`.

### debt_payments
`id` serial PK · `debt_id` int FK→debts ON DELETE CASCADE NN · `amount` decimal(15,2) NN · `date` date NN
· `description` varchar(255) · `account_id` int FK→accounts (nullable; cuenta del abono) · `transaction_id` int FK→transactions · `created_at` timestamp def now()
> Un abono con `account_id` genera una transacción `income` (loan) / `expense` (debt) en esa cuenta y enlaza `transaction_id`.
> **Abono a deuda de tarjeta (C7):** si la deuda está asociada a una tarjeta de crédito (deuda automática de una compra,
> `debts.account_id` = la tarjeta), cada abono **restaura el crédito disponible** de la tarjeta (`current_balance += monto`),
> tanto en pagos parciales como al saldar. Aplica en `POST /api/debts/:id/pay` y en la edición `PUT /api/debts/:id/payments/:paymentId`.
> Los abonos son **editables** desde el historial (ver Debts API).

### budgets
`id` serial PK · `user_id` int FK→users NN · `category_id` int FK→categories (**nullable**; NULL = presupuesto GLOBAL)
· `amount` decimal(15,2) NN (límite mensual) · `is_active` bool def true · `created_at` / `updated_at` timestamp def now()
· UNIQUE(`user_id`,`category_id`) (un presupuesto por categoría) + **índice único PARCIAL** `budgets_one_global_per_user` =
  `(user_id) WHERE category_id IS NULL` (un solo global por usuario; Postgres trata los NULL como distintos en UNIQUE,
  así que el parcial es necesario) + index(`user_id`). Migración `0012_dear_legion.sql` (aditiva: tabla nueva + índices).
> Presupuestos mensuales. El **gasto del mes NO se persiste**: se calcula on-the-fly sumando `transactions` (type='expense')
> del usuario en el mes en curso (todas las categorías si es global; la categoría exacta si no). El historial de cumplimiento
> compara el `amount` ACTUAL del presupuesto contra el gasto de cada mes pasado (no hay snapshot histórico del monto).

### credit_card_statements
`id` serial PK · `account_id` int FK→accounts ON DELETE CASCADE NN · `user_id` int FK→users NN
· `period_start` date NN · `period_end` date NN (fecha de corte) · `payment_due_date` date NN
· `total_amount` decimal(15,2) NN · `paid_amount` decimal(15,2) def 0 · `is_paid` bool def false · `is_overdue` bool def false
· `debt_id` int FK→debts (nullable; **desde `0014` siempre null** — los cortes ya no generan deuda) · `created_at` / `updated_at` timestamp def now()
· UNIQUE(`account_id`,`period_end`) (un corte por periodo por tarjeta) + index(`user_id`,`account_id`,`is_paid`).
  Migración `0013_unique_thor.sql` (aditiva: columnas de tarjeta en accounts + esta tabla).
> Estados de cuenta (cortes) de una tarjeta — **solo INFORMATIVOS desde `0014`**. Cada corte agrega el gasto del periodo
> (`total_amount`) para visualizar el periodo, pero **NO genera deuda**: la deuda ya se crea **por cada compra** en
> POST /api/transactions (1 deuda por compra), así que generar deuda también al corte la contaría doble. Pagar el corte
> (`/statements/:id/pay`) hace una **transferencia** (cuenta de pago → tarjeta) que libera crédito y abona **FIFO** a las
> deudas automáticas de la tarjeta (las más antiguas primero), igual que un pago normal de tarjeta.

### split_groups
`id` serial PK · `name` varchar(100) NN · `description` varchar(255) · `icon` varchar(50) def `users`
· `color` varchar(7) def `#3A60A1` · `is_active` bool def true · `created_at` / `updated_at` timestamp def now()
> Editable (`PUT /api/splits/:id`: nombre/descripción/color/ícono). `DELETE` con `?settle=true` = **Liquidar** (borra el grupo
> conservando las transacciones generadas); sin el flag = **Eliminar** (revierte esas transacciones). Ver Splits API.

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
> Editable (`PUT /api/splits/:groupId/expenses/:expenseId`): reemplaza los shares y reconcilia la tx/saldo; rechaza editar
> si alguna parte de TERCEROS ya está liquidada.

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

### recurring_rules
`id` serial PK · `user_id` int FK→users NN · `account_id` int FK→accounts NN · `type` varchar(10) NN (`expense|income`)
· `amount` decimal(15,2) NN · `description` varchar(255) · `category_id` int FK→categories (nullable)
· `frequency` varchar(10) NN (`daily|weekly|biweekly|monthly|yearly`) · `day_of_month` int (1-31, nullable; monthly/yearly)
· `day_of_week` int (0-6, domingo=0, nullable; weekly/biweekly) · `start_date` date NN · `end_date` date (nullable, null = indefinida)
· `last_generated_date` date NN (**cursor de idempotencia**) · `is_active` bool def true NN · `created_at` / `updated_at` timestamp def now()
· INDEX(`user_id`,`is_active`). Migración `0017_sudden_veda.sql` (aditiva).
> Reglas de pagos/ingresos recurrentes. El worker (`services/recurring.ts`, node-cron + catch-up) materializa transacciones
> a partir de estas reglas de forma **idempotente** usando `last_generated_date` como cursor. La **cuota de manejo** de una
> cuenta es un caso especial de regla recurrente (no un sistema aparte). Ver "Pagos recurrentes" en la API.

### recurring_rule_tags
`id` serial PK · `rule_id` int FK→recurring_rules ON DELETE CASCADE NN · `tag_id` int FK→tags ON DELETE CASCADE NN
· UNIQUE(rule_id, tag_id) · INDEX(tag_id). Migración `0017_sudden_veda.sql`.
> Espejo de `transaction_tags`: las etiquetas de una regla se copian a cada transacción que genera.

### Reglas de balance (atómicas, dentro de una misma transacción SQL)
- `income`  → `account.current_balance += amount`
- `expense` → `account.current_balance -= amount`
- `transfer`→ `account.current_balance -= amount` y `to_account.current_balance += amount`
- Editar/eliminar: revertir el efecto anterior y aplicar el nuevo.
> **Tarjetas (modelo `0014`):** las mismas reglas aplican, pero como `current_balance` es el crédito DISPONIBLE, un
> `expense` con tarjeta lo baja (consume crédito) y un `transfer` hacia la tarjeta lo sube (libera crédito). Además el
> `expense` con tarjeta genera una **deuda automática** y el `transfer` hacia la tarjeta **abona FIFO** a esas deudas.

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
- `GET    /api/accounts[?includeInactive=true]` — cuentas activas (con `includeInactive=true` también las desactivadas,
  ordenadas activas primero; lo usa SOLO la pantalla de lista). Para `credit_card` agrega campos calculados (ver Tarjetas
  de crédito); para el resto OMITE las columnas de tarjeta. Siempre devuelve `is_active`, `is_frozen`, los `management_fee_*`
  y **`savingsBalance`** (dinero que SALIÓ de la cuenta hacia metas = neto Σdep − Σret de `savings_contributions` con esa
  `account_id`). `GET /:id` también lo incluye. El mobile muestra el saldo real y, debajo, "Ahorro X" tocable en la card. El
  dinero YA se restó del saldo al aportar (afecta el patrimonio del `/summary`, que es saldo líquido); el ahorro se muestra aparte.
- `GET    /api/accounts/:id/savings` — desglose `[{ goalId, goalName, color, icon, amount }]` del ahorro de la cuenta por meta
  (en qué metas está ese dinero). Lo abre el bottom sheet al tocar "Ahorro" en la card; cada meta navega a su detalle.
- `GET    /api/accounts/summary?displayCurrency=COP[&refresh=true]` — balance consolidado convertido a
  `displayCurrency`, **separando débito y crédito**: `{ displayCurrency, total (=debitTotal−creditUsed, patrimonio
  neto líquido), debitTotal (cuentas no-tarjeta = el "Saldo"), creditTotal (=−creditUsed, contribución neta de tarjetas),
  creditLimit, creditUsed (adeudado), creditAvailable (= suma de saldos disponibles de tarjetas), possibleMoney
  (=debitTotal+creditAvailable, "dinero posible"), byCurrency[{currency,total,converted}], stale, ratesUpdatedAt }`
  (registrada antes de `/:id`)
- `GET    /api/accounts/:id` — para `credit_card` incluye los campos calculados de tarjeta.
- `POST   /api/accounts` — si `type='credit_card'` exige `creditLimit > 0` (400 si falta), `billingCycleDay`/
  `paymentDueDay` opcionales (default 1 y 20, rango 1-28) y el `initialBalance` (deuda preexistente) se guarda como
  **disponible = `creditLimit − initialBalance`**.
- `PUT    /api/accounts/:id` — permite editar `creditLimit` (>0), `billingCycleDay`/`paymentDueDay` (1-28) y
  `allowOverdraft`. El cambio de límite es inmediato (no afecta cortes pasados). Acepta `managementFeeAmount`/
  `managementFeeDay` (ver "Cuota de manejo"; `managementFeeAmount: null` la desactiva).
- `DELETE /api/accounts/:id` — soft delete (`is_active=false`)
- `PATCH  /api/accounts/:id/toggle-active` — desactiva/reactiva (flip `is_active`). Desactivada: NO aparece en selectores
  (GET sin `includeInactive`), SÍ en lista/historial/reportes. `is_active` significa "fuera de selectores", **no** un bloqueo
  duro: el backend (`assertAccountsOwned`) no impide crear transacciones contra una cuenta inactiva si el cliente ya tiene el id.
- `PATCH  /api/accounts/:id/toggle-frozen` — congela/descongela (flip `is_frozen`); **solo `credit_card`** (400 si no). Congelada:
  bloquea gastos nuevos en `POST`/`PUT /api/transactions` (400) y en el motor recurrente; **permite pagos de deuda** (transfer hacia la tarjeta).
- **Cuota de manejo (POST/PUT):** activar (`managementFeeAmount>0` + `managementFeeDay`) crea/actualiza una `recurring_rule`
  mensual vinculada (categoría "Comisiones bancarias", `management_fee_rule_id`); desactivar (`managementFeeAmount: null`) la
  **pausa** (`is_active=false`) sin borrar las transacciones generadas y conserva el vínculo para reutilizarla. Saga: si el
  UPDATE de la cuenta falla tras crear una regla nueva, se borra la regla (compensación).

### Tarjetas de crédito (estados de cuenta)
> Campos calculados que `GET /api/accounts` y `/:id` agregan para `credit_card` (modelo `0014`: `current_balance` ES el
> disponible): `creditLimit`, `creditAvailable` (`clamp(current_balance, 0, creditLimit)`), `creditUsed`
> (`max(0, creditLimit − current_balance)`), `utilizationPercentage`, `billingCycleDay`, `paymentDueDay`,
> `nextBillingDate`, `nextPaymentDueDate`.
- `GET    /api/accounts/:id/statements?limit=12&offset=0` — historial de cortes (orden `period_end` desc). 400 si la cuenta no es tarjeta.
- `POST   /api/accounts/:id/generate-statement` — genera el corte del periodo actual (manual; en prod sería un cron):
  calcula `period_start`/`period_end` por `billing_cycle_day`, suma los `expense` de la tarjeta en el periodo →
  `total_amount`, calcula `payment_due_date` por `payment_due_day` y crea el statement (`debt_id=null`). **Desde `0014`
  el corte es solo informativo: NO genera deuda** (la deuda ya existe por cada compra). 409 si ya existe un corte para ese periodo.
- `POST   /api/accounts/:id/statements/:statementId/pay` — `{ amount, paymentAccountId }`. Valida `0 < amount <= remaining`
  (decremento **condicional anti-TOCTOU** sobre `paid_amount`, 0 filas → 400). Crea una **transferencia**
  `paymentAccountId → tarjeta` (libera crédito) y abona **FIFO** a las deudas automáticas de la tarjeta
  (`buildFifoCardDebtPayment`, las más antiguas primero). **Saga con safeCompensate** (revierte el `paid_amount` si el batch falla).
- **Gasto con tarjeta (`POST /api/transactions`, type='expense'):** baja el crédito disponible (`current_balance -= amount`,
  valida `current_balance < amount → 400` salvo `allow_overdraft`) y **genera una deuda automática por la compra**
  (`debts`, type `debt`, `total=remaining=amount`, `due_date` por `payment_due_day`, icono `credit-card`, enlazada por
  `transactions.debt_id`). Con `installments>1` la deuda guarda "Cuota 1/N" en el nombre. **NO** afecta el saldo de débito.
  **Pago de tarjeta:** una `transfer` cuya cuenta destino es la tarjeta libera crédito y abona **FIFO** a sus deudas
  automáticas (mismo `buildFifoCardDebtPayment`). Editar/borrar un gasto con tarjeta actualiza/borra su deuda enlazada.

### Categories
- `GET    /api/categories` — todas, subcategorías anidadas (`children[]`)
- `GET    /api/categories/:type` — `income` | `expense`
- `POST   /api/categories`
- `PUT    /api/categories/:id`
- `DELETE /api/categories/:id` — CASCADE subcategorías

### Transactions
- `GET    /api/transactions` — query: `account_id, category_id, type, from_date, to_date, search, page, limit`
- `GET    /api/transactions/:id`
- `POST   /api/transactions` — crea y actualiza balance. **Rechaza `type='income'` con cuenta `credit_card` (400, C1).**
  Acepta `installments` (2–60, solo gasto con tarjeta) + `monthlyInterestRate`/`lateInterestRate` (opcionales); el backend
  deriva `current_installment=1` e `installment_amount` por **amortización francesa** (`frenchInstallment`). Gasto con tarjeta →
  genera deuda automática (saga: tx+saldo en batch; luego deuda + enlace `debt_id` + tags, con compensación que revierte todo);
  la deuda guarda `installments`/`installment_amount`/tasas. Transfer hacia tarjeta → abona FIFO.
- `PUT    /api/transactions/:id` — recalcula balances; actualiza/borra la deuda automática enlazada según el nuevo estado
  (sigue siendo gasto con tarjeta → actualiza total/restante conservando lo pagado; ya no lo es → borra la deuda).
- `DELETE /api/transactions/:id` — recalcula balance y borra la deuda automática enlazada (`debt_id`) si existe.
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
- `POST   /api/savings/:id/contribute` — `{ amount, type: deposit|withdrawal, date, description?, accountId }` (**`accountId` obligatorio**); marca `is_completed` al llegar al objetivo. El `current_amount` se ajusta con un UPDATE condicional (retiro: guard `current_amount >= amount`, 0 filas → 400) y luego un batch atómico inserta la contribución y **mueve el saldo de la cuenta** (depósito −, retiro +), compensando si falla (anti-TOCTOU)
- `PUT    /api/savings/:id/contribute/:contributionId` — **edita una contribución**: revierte su efecto viejo y aplica el
  nuevo sobre `current_amount` (400 si quedaría negativo) Y sobre el saldo de la(s) cuenta(s) (revierte en la cuenta vieja,
  aplica en la nueva), recalcula `is_completed`/`completed_at` (batch atómico). Devuelve la meta con `contributions[]`.
- `DELETE /api/savings/:id/contribute/:contributionId` — **elimina una contribución** revirtiendo su efecto sobre
  `current_amount` y devolviendo el saldo a su cuenta (400 si dejaría el ahorro negativo). Devuelve la meta con `contributions[]`.
> **Cuenta↔ahorro = movimiento real (no earmark).** Cada aporte EXIGE cuenta: el depósito sale del `current_balance` de esa
> cuenta y el retiro lo devuelve. NO crea transacciones (para no contaminar stats). La cuenta expone `savingsBalance` y
> `/accounts/:id/savings` (ver Accounts); el mobile muestra el saldo real y, debajo, "Ahorro" tocable. La `accountId` de la meta
> es solo la **cuenta por defecto** sugerida al aportar (placeholder "Cuenta sugerida al aportar"). En `SavingsDetailScreen` el
> sheet de aporte pide la cuenta con `AccountChips` (default = la de la meta). Editar = tap, eliminar = long-press.

### Debts (deudas y préstamos)
> Aceptan `cutoffDate` (fecha de corte, C6), `installments` (2–60) + `monthlyInterestRate`/`lateInterestRate` (cuotas con
> interés, C4). `GET /api/debts` y `/:id` agregan los **derivados** `isOverdue`/`lateFee`/`nextPaymentAmount` (`computeDueInfo`).
- `GET    /api/debts` — activas primero, con nombre de cuenta + derivados de vencimiento/próximo pago
- `GET    /api/debts/summary` — `{ totalDebt, totalLoan, netBalance, activeDebts, activeLoans }`
- `GET    /api/debts/:id` — incluye `payments[]` + `isOverdue`/`lateFee`/`nextPaymentAmount`
- `POST   /api/debts` — `remaining_amount` arranca igual a `total_amount`; con `installments` deriva `installment_amount`
  (amortización francesa) y persiste las tasas; con `registerInitialTransaction:true` + `accountId` **de cuenta NORMAL
  (no `credit_card`)** registra el desembolso inicial como `income` (debt: me prestaron) / `expense` (loan: yo presté),
  ajusta el saldo de la cuenta y **enlaza la tx en `debts.initial_transaction_id`** (saga: inserta la deuda y la tx, luego
  batch saldo+enlace con compensación que borra la tx; C8). Si la cuenta es una tarjeta se omite el desembolso.
  **Mobile (`AddDebtScreen`):** al asociar una cuenta NORMAL a una deuda **nueva**, el switch "Registrar el movimiento en la
  cuenta" arranca **activado** por defecto, de modo que la deuda se refleje de una vez en el saldo (suma en "Yo debo" /
  resta en "Me deben") sin tener que activarlo a mano. Al editar se respeta lo que ya tenía la deuda.
- `PUT    /api/debts/:id` — si cambia el total, ajusta el restante conservando lo pagado; recalcula `installment_amount`
  con los valores efectivos (lo enviado o lo previo). **Desembolso inicial EDITABLE (C8):** acepta `registerInitialTransaction`
  y mantiene el `initial_transaction_id` en sincronía con el switch del mobile y con el monto/cuenta efectivos —
  (A) si pasa de OFF→ON crea la tx, ajusta saldo y enlaza (saga con compensación); (B) ON→OFF (o se quita la cuenta / es
  tarjeta) revierte el saldo, desenlaza y borra la tx (batch atómico); (C) sigue ON reconcilia la tx (monto/cuenta/tipo/fecha)
  revirtiendo el saldo viejo y aplicando el nuevo. Si el flag no viene, conserva el estado actual. Solo cuentas NORMALES (las
  `credit_card` nunca llevan desembolso).
- `DELETE /api/debts/:id` — CASCADE en pagos + revierte balances y borra las transacciones de los abonos vinculados **y la
  del desembolso inicial (`initial_transaction_id`)** si la hubo (db.batch; borra la deuda antes que las tx para liberar los FK). C8
- `POST   /api/debts/:id/pay` — `{ amount, date, description?, accountId? }`; resta del restante (UPDATE condicional `remaining_amount >= amount`, 0 filas → 400, anti-TOCTOU) y marca `is_paid_off` si llega a 0; con `accountId` crea transacción `income`(loan)/`expense`(debt) y enlaza (db.batch); compensa el decremento + la tx si falla el registro del pago. **Rechaza pagar con cuenta `credit_card` (400, C3).** Si la deuda es de una tarjeta (deuda automática), **restaura el crédito disponible** de la tarjeta (`current_balance += monto`, C7) en el mismo batch (revertido en la compensación).
- `PUT    /api/debts/:id/payments/:paymentId` — `{ amount, date, description?, accountId? }`; **edita un abono existente** (C7). Revierte por completo el efecto del pago viejo y aplica el nuevo dejando consistentes: el restante de la deuda (recalculado: `restante + viejo − nuevo`, 400 si <0), la **transacción enlazada** (actualiza en sitio si seguía con cuenta; la borra si se quitó la cuenta; la inserta vía saga si antes no tenía y ahora sí — desenlaza el FK `transaction_id` antes de borrar la tx) y el **crédito de la tarjeta** (ajuste por la diferencia de monto). Recalcula `is_paid_off`/`paid_off_at`. Devuelve la deuda con su historial actualizado (igual que `GET /:id`). Rechaza cuenta `credit_card` (400, C3).
> **Mobile — agrupación de deudas por tarjeta (C9, `DebtsScreen`):** la lista de deudas activas usa **`SectionList`**: un grupo
> POR CADA tarjeta de crédito con deudas asociadas (header = nombre de la tarjeta + total adeudado del grupo + saldo
> disponible, leído de `useAccounts().creditAvailable`) + un grupo **"Otras deudas"** para las no asociadas a tarjetas. Las
> tarjetas sin deudas no aparecen; si el único grupo es "Otras deudas" (p. ej. la pestaña "Me deben") no se muestra header
> redundante. Las deudas de tarjeta se detectan por `accountType === 'credit_card'`. Se conserva el toggle Mis deudas/Me deben,
> el historial de saldadas y crear/ver/pagar dentro de cada grupo.

### Budgets (presupuestos mensuales)
> Router `routes/budgets.ts`, montado en `index.ts` con `authenticate` + `invalidateOnMutation`; los **GET están cacheados**
> con `cacheResponse(SUMMARY_TTL_MS)` (5 min) e invalidados por sello de versión ante cualquier mutación del usuario. El
> gasto del mes se calcula con una **subquery correlacionada** sobre `transactions` (type='expense', rango del mes en curso).
- `GET    /api/budgets` — presupuestos del usuario con el gasto del mes ya calculado:
  `{ id, categoryId, categoryName, categoryIcon, categoryColor, amount, spent, remaining, percentage, isActive }`
  (`remaining = amount - spent`, `percentage = spent/amount*100`). Global (categoryId null) suma TODOS los gastos del mes.
- `GET    /api/budgets/summary` — `{ totalBudgeted, totalSpent, totalRemaining, overBudgetCount, onTrackCount }` (solo activos; `overBudget = spent > amount`).
- `GET    /api/budgets/history?months=6` — (default 6, max 12) por mes y por presupuesto activo `{ month:'YYYY-MM', budgets:[{categoryId, categoryName, amount, spent, met}], summary:{month, totalMet, totalBudgets, complianceRate} }`, ordenado del mes más reciente al más antiguo. Compara el `amount` actual contra el gasto de cada mes.
- `POST   /api/budgets` — `{ categoryId?, amount }` (categoryId null = global). Valida `amount > 0` y, si trae categoría, que exista, sea del usuario y de tipo `expense`. Si ya existe (UNIQUE / parcial del global) → **409** `{ error: 'Ya tienes un presupuesto para esta categoría' }` (vía `isUniqueViolation`).
- `PUT    /api/budgets/:id` — `{ amount?, isActive? }`, solo el dueño.
> **Invariante categoría↔global (C10, `assertCategoryBudgetWithinGlobal`/`assertGlobalNotBelowCategories`).** Un presupuesto
> de **categoría** nunca puede exceder al **global** ni la **SUMA** de los de categoría puede excederlo. En POST/PUT (al
> cambiar el monto): crear/editar una categoría exige que **exista un global** (si no → 400 `'Primero crea un presupuesto
> global antes de crear presupuestos por categoría'`), que `amount <= global` (400 `'El presupuesto de categoría no puede ser
> mayor al presupuesto global'`) y que la suma con el nuevo monto no pase el global (400 `'La suma de presupuestos por
> categoría ($X) excedería el presupuesto global ($Y)'`). Editar el **global** a la baja no puede quedar por debajo de la suma
> de categorías (400). Validado en backend (seguridad) y en mobile `BudgetFormSheet` (feedback inmediato antes de llamar al API).
- `DELETE /api/budgets/:id` — hard delete, solo el dueño.

### Splits (gastos compartidos)
- `GET    /api/splits` — grupos activos con `members[]` y `myBalance`
- `GET    /api/splits/summary` — `{ totalOwedToMe, totalIOwe, netBalance, groups[] }` (solo miembro `is_me`)
- `GET    /api/splits/:id` — grupo con miembros
- `POST   /api/splits` — acepta `members[]` inline (exactamente un `isMe`, nombres únicos)
- `PUT    /api/splits/:id` — edita nombre/descripción/color/icono del grupo (mobile: `AddSplitGroupScreen` en modo edición
  con `groupId`; en edición los miembros se agregan/eliminan en el acto vía los endpoints de members).
- `DELETE /api/splits/:id[?settle=true]` (CASCADE) — **dos modos**: *Eliminar* (default) revierte las transacciones de cuenta
  que el grupo generó (saldo como si nunca hubiera existido); *Liquidar* (`settle=true`) borra el grupo pero **conserva** esas
  transacciones (el FK las referencia desde los gastos, no al revés → sobreviven al borrado) como registro de mi parte, sin
  revertir el saldo. El mobile (`SplitGroupDetailScreen`) ofrece elegir entre Liquidar y Eliminar.
- `POST   /api/splits/:groupId/members` · `DELETE /api/splits/:groupId/members/:id` (solo sin gastos asociados)
- `GET    /api/splits/:groupId/expenses` — con shares y `accountName`; `POST` acepta `accountId?` (solo si paga `is_me` → transacción `expense`), valida que los shares sumen el total (±0.01). Saga: si paga `is_me` se crea primero la tx+balance (batch); el gasto y sus shares van dentro de un `try` que, ante fallo, borra el gasto (CASCADE en shares) y revierte la tx (no deja movimientos huérfanos).
- `PUT    /api/splits/:groupId/expenses/:expenseId` — **edita un gasto y sus shares**: reemplaza por completo los shares
  (delete+insert; el self-share del pagador nace liquidado) y reconcilia la transacción de cuenta y el saldo igual que la edición
  de deudas — (A) sin tx y ahora con cuenta → crea la tx, descuenta y enlaza (saga con compensación); (B) tenía tx y ahora sin
  cuenta → revierte saldo, desenlaza y borra la tx; (C) sigue con cuenta → actualiza la tx en sitio revirtiendo el saldo viejo y
  aplicando el nuevo. **Rechaza editar (400)** si alguna parte de TERCEROS ya está liquidada (rompería el historial de
  liquidaciones; el self-share liquidado del pagador no cuenta). Mobile: tocar un gasto abre `AddSplitExpense` en modo edición.
- `GET    /api/splits/:groupId/balances` — balance por miembro + `transfers[]` simplificadas (greedy: mayor deudor paga al mayor acreedor)
- `POST   /api/splits/:groupId/settle` — `{ fromMemberId, toMemberId, amount, date?, accountId? }`; **liquidación TOTAL o PARCIAL**. El `amount` se valida contra la **deuda total real** = la transferencia SIMPLIFICADA from→to (`computeBalances` + `simplifyTransfers`, lo mismo que ve el mobile en `/balances`): `amount <= 0` → 400, `amount > totalDeuda` → 400, sin deuda entre ambos → 400. Marca shares pareados como settled (antiguos primero) **solo los que quepan completos** dentro de `amount` (los shares son atómicos); el remanente (`amount − suma de shares completos`) se registra como gasto **"Liquidación"** (contra-gasto: `from` paga, share para `to`). **Opción elegida para el parcial: contra-gasto de Liquidación** (no se parte la fila de `split_shares`) — es la que ya existía para deudas redirigidas y mantiene `computeBalances` EXACTO porque éste se basa solo en shares no liquidados: el contra-gasto reduce el balance neto justo en el remanente, sin mutar el historial de shares por gasto (que es la auditoría de quién debía qué). Persiste en `split_settlements` con el `amount` real liquidado (puede ser < totalDeuda) y, si involucra a `is_me` con `accountId`, crea transacción `income`(me pagan)/`expense`(yo pago). **Respuesta:** `{ success, settled: amount, remaining: totalDeuda − amount, settledShares, totalShares }`. **Saga de 2 batches:** Batch A aplica todo (shares settled + gasto Liquidación + tx + balance, con `.returning()` de los ids); Batch B inserta lo dependiente (share de la Liquidación + fila de settlement con su `transactionId`). Si Batch B falla, un batch de compensación revierte **todo** el Batch A. **El mobile** (`SplitGroupDetailScreen`) pre-llena el monto con el total adeudado, permite editarlo (`CalculatorSheet`, validación `0 < monto <= total`), muestra "Total adeudado: $X", avisa "Liquidación parcial: quedarán $Y pendientes" y al terminar hace toast con el resultado ("Liquidado $X. Pendiente: $Y" o "Deuda liquidada completamente").
- `GET    /api/splits/:groupId/settlements` — historial de liquidaciones del grupo

### Recurring (pagos/ingresos recurrentes)
> Router `routes/recurring.ts`, montado con `authenticate` + `invalidateOnMutation`. La materialización vive en
> `services/recurring.ts`; el cálculo de fechas es puro en `utils/recurrence.ts` (testeable). Ver "Pagos recurrentes (motor)".
- `GET    /api/recurring-rules` — reglas del usuario (activas e inactivas, `.limit(200)`), con `tags[]`, `accountName`,
  `categoryName/Color/Icon` y `nextDate` (próxima fecha de cobro; null si está pausada).
- `POST   /api/recurring-rules` — `{ accountId, type('expense'|'income'), amount, description?, categoryId?, frequency,
  dayOfMonth?, dayOfWeek?, startDate, endDate?, tagIds? }`. Valida ownership de cuenta/categoría/tags, `income`+tarjeta → 400,
  `endDate≥startDate`. Normaliza día según frecuencia. Inicializa el cursor `last_generated_date = startDate − 1 día`.
- `PUT    /api/recurring-rules/:id` — edita. NO toca el cursor ni los registros generados (mover `startDate` atrás no hace backfill).
- `DELETE /api/recurring-rules/:id` — borra la regla; **NO** borra las transacciones generadas (FK `recurring_rule_id` SET NULL);
  borra `recurring_rule_tags` por CASCADE.
- `PATCH  /api/recurring-rules/:id/toggle` — pausa/activa (`is_active`).
- `POST   /api/recurring/catch-up` (router aparte, montado en `/api/recurring`) — materializa los cargos pendientes del usuario
  del JWT → `{ generatedCount }`. Idempotente. Lo llama el mobile UNA vez al abrir la app (background, errores silenciados).

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
**helmet ^8** (headers HTTP de seguridad; traen sus propios tipos), **compression ^1.8** (gzip de respuestas),
**node-cron ^4** (scheduler de pagos recurrentes; **trae sus propios tipos** — NO instalar `@types/node-cron`, que es v3) ·
dev: drizzle-kit ^0.28, tsx ^4.19, typescript ^5.6, @types/bcryptjs, @types/jsonwebtoken, @types/nodemailer,
@types/compression (compression no trae tipos propios).
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
  dinámico desde RN 0.72. Las de la ruta caliente (Home/Transactions/Accounts/AddTransaction) siguen estáticas.
- **`React.memo` en componentes de fila:** `TransactionCard`, `AccountCard`, `SavingsGoalCard`, `DebtCard`,
  `InsightCard`, `TagChip`, `TemplateCard` (export memoizado; helpers internos como `deadlineLabel`/
  `severityColor` quedaron sin `export` tras la auditoría de código muerto, intactos en lógica).
- **FlatList/SectionList optimizadas:** las listas principales (Transactions, Accounts, Debts, Savings, Splits)
  usan `removeClippedSubviews`, `maxToRenderPerBatch={15}`, `windowSize={10}`, y `keyExtractor`/`renderItem`
  en `useCallback` (los `onPress` que dependen del closure del item se quedan inline, a propósito). Las listas
  secundarias y de detalle (Tags, Templates, DebtDetail/`payments`, SavingsDetail/`contributions`,
  SplitGroupDetail/`expenses`) llevan al menos `keyExtractor` por id + `removeClippedSubviews` +
  `maxToRenderPerBatch={15}` (su `renderItem` inline es aceptable: listas cortas, acotadas a 200). **Sin
  `getItemLayout`**: las cards tienen altura variable (filas opcionales de tags/progreso/fechas, y las listas de
  Transactions y Debts son `SectionList` con headers — Debts agrupa por tarjeta, C9) → poner `getItemLayout` causaría bugs de scroll.
- **Hooks de datos** (`useTransactions`/`useAccounts`/`useStats`/`useDebts`/`useSavings`/`useSplits`): usan
  `useState` con el setter solo dentro del fetch y devuelven referencias de estado estables. Los pocos
  derivados sí se memoizan: `useAccounts.totalBalance` (`useMemo` sobre `data`) y `useGlobalSearch`
  (`allCategories` + `results` en `useMemo`). Los selectores de Zustand siempre usan campo
  (`useAppStore(s => s.refreshKey)`, `useSettingsStore(s => s.mainCurrency)`), nunca el store entero.

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

**Navegación (bottom tabs, `CustomTabBar`):** 5 tabs — Inicio (house) · **Cuentas** (wallet) · Agregar
(botón central circular elevado -24, fondo primary, borde del color background) · Estadísticas
(`bar-chart-3`) · **Más** (`layout-grid`). Tab activo en `primary`, inactivo en `textMuted`, labels
`fontSize.xs`; cada slot es `flex:1` con contenido centrado (al ser 5 con el "Agregar" en el medio, el FAB
queda perfectamente centrado). El botón central abre el modal `AddTransaction` del root stack. `StatsScreen`
y `MoreScreen` son tabs con **carga diferida** (`lazyScreen`); su `ScreenHeader` no lleva botón "atrás".
> **Tab "Cuentas" (`AccountsTab`).** Renderiza `AccountsScreen` como raíz del tab. Nombre interno distinto
> del **screen `Accounts` del root stack** (`Accounts: { selectAccountId? }`), que se conserva para la
> navegación profunda (atajos del header de Home: wallet + card "Crédito disponible", y otros screens). El
> header de `AccountsScreen` muestra el botón "atrás" **solo si `navigation.canGoBack()`** → en el tab (raíz)
> no aparece; al abrirse apilado desde el stack sí.
> **Tab "Más" (`MoreScreen.tsx`).** Reúne el menú de navegación que antes vivía en el Sidebar, agrupado en
> **Finanzas** (Cuentas, Categorías, Plantillas, Etiquetas, Metas de ahorro, Deudas, Presupuestos, Pagos
> recurrentes, Gastos compartidos), **Análisis** (Insights, Tasas de cambio, Importar/Exportar) y
> **Preferencias** (Moneda principal vía `CurrencyPicker`, Notificaciones, Seguridad, Apariencia). Cada fila
> navega al screen del root stack. `TransactionsScreen` sigue siendo screen del root stack (se abre desde Home).

> **Sidebar = drawer de PERFIL (`components/Sidebar.tsx`).** Tras mover el menú al tab "Más", el Sidebar dejó
> de ser navegación y ahora muestra el **perfil del usuario**: avatar, nombre y correo (de `useAuth`), una
> **insignia de rol** (ver abajo) cuando aplica, y el botón **Cerrar sesión** anclado al fondo (con
> `Alert.alert` de confirmación). **Sin `@react-navigation/drawer`**; se abre con el **botón de perfil**
> (`Icon circle-user`) en la esquina superior-izquierda del header de Home. Estado global en
> `stores/sidebarStore.ts` (Zustand `{ isOpen, open, close, toggle }`). Se renderiza como **overlay en
> `App.tsx`** (sibling de `AppNavigator`, solo si `isAuthenticated`), FUERA del `NavigationContainer`.
> Animación **slide** con `Animated` nativo (`translateX` de `-DRAWER_WIDTH` a 0, 300 ms) + overlay
> `rgba(0,0,0,0.5)` que al tocarlo cierra; se desmonta al terminar el cierre. Ancho `min(80%, 320px)`.

> **Roles especiales (`utils/roles.ts`).** `getUserRole(email)` mapea correos a un rol SOLO informativo
> (no otorga permisos): `cymslucas4@gmail.com` y `test@gmail.com` → `'Alpha Tester'`. Se usa en el drawer de perfil (insignia) y
> para disparar la bienvenida.
> **Bienvenida al login (`components/WelcomeOverlay.tsx`).** Overlay a pantalla completa que aparece UNA vez
> tras un **login/registro** (en `useAuth.applySession`, NO en el cold-start que restaura sesión) cuando el
> usuario tiene rol. Muestra "Bienvenido de vuelta / <rol>" en rojo épico (`#FF2D4B`) con ícono `sparkles` y
> halo pulsante; entra con fade+escala, late ~1.6 s y se desvanece llamando `dismissWelcome` para seguir
> usando la app. `useAuth` expone `welcome: { name, role } | null` y `dismissWelcome`; se renderiza en
> `App.tsx` (overlay top-most, gated por `isAuthenticated && welcome`).

> **Tutorial guiado interactivo (`components/tour/`, rama `Add-Tutorial`, jun 2026).** Reemplaza al
> carrusel de diapositivas a pantalla completa (el viejo `TutorialOverlay.tsx`, **eliminado**) por un
> **tour que navega la app de verdad y va resaltando los botones/secciones reales** con un foco
> (spotlight) y un tooltip anclado al lado. Dos archivos:
> - **`tour/TourContext.tsx`** — `TourProvider` (montado en `App.tsx`, envuelve `ThemedApp`) mantiene un
>   registro de "objetivos" medibles. Las pantallas marcan un elemento con el hook **`useTourTarget('clave')`**
>   (devuelve un `ref` que se pasa al `View`/`Pressable`). El overlay mide ese nodo con `measureInWindow`
>   bajo demanda. También registra **scrollers** (`registerScroller`) para poder llevar a la vista objetivos
>   que quedan bajo el fold.
> - **`tour/GuidedTour.tsx`** — el overlay. Guion `STEPS[]`: cada paso indica a qué **tab** navegar
>   (vía `navigationRef`), qué **objetivo** resaltar y, opcional, qué **scroller** usar. Mecánica clave:
>   - **Foco/spotlight:** 4 rectángulos oscuros alrededor del objetivo dejan un "hueco" que muestra el
>     elemento real iluminado, con un anillo pulsante. Una capa `Pressable` de fondo captura los toques
>     (tocar = avanzar) y **bloquea la interacción real** con la app debajo.
>   - **Corrección de coordenadas (Android):** `measureAdjusted` mide el objetivo Y el contenedor raíz del
>     overlay con el MISMO `measureInWindow` y resta el origen del contenedor; así se **cancela el desfase**
>     que meten las barras de estado/navegación y el foco cae exactamente sobre el icono.
>   - **Responsive:** el tooltip mide su altura real (`onLayout`), se ancla arriba o abajo según la mitad de
>     pantalla en la que esté el objetivo, se **clampa al área segura** (`insets`, `useWindowDimensions`) para
>     no salirse nunca, y aplica un micro-ajuste de alineación `ALIGN_NUDGE` (±2px: baja en la mitad superior,
>     sube en la inferior). **Auto-scroll**: si el objetivo cae fuera de la zona cómoda y el paso tiene scroller,
>     pide `scrollBy` y re-mide (`MoreScreen` registra su `ScrollView` como scroller `'more'`).
>   - **Nunca se atasca:** mide con reintentos (la pantalla puede estar en transición/lazy-load) y, si no logra
>     medir, cae a una **tarjeta centrada** con el mismo texto.
> - **Objetivos registrados:** `home-profile`/`home-search`/`home-balance` (`HomeScreen`),
>   `tab-accounts`/`tab-add`/`tab-stats`/`tab-more` (`CustomTabBar` en `AppNavigator`),
>   `more-finanzas`/`more-analisis`/`more-preferencias`/`more-help` (`MoreScreen`).
> - **Guion:** bienvenida → perfil → saldo → búsqueda → pestaña Cuentas → botón **+** → Estadísticas →
>   pestaña Más → **Finanzas** → **Análisis** → **Preferencias** → ítem **Tutorial** → cierre.
> - **Persistencia / disparo:** sin cambios respecto al onboarding previo. Flag por usuario
>   `wallet_tutorial_seen_<userId>` en AsyncStorage (`services/tutorial.ts`: `hasSeenTutorial`/`markTutorialSeen`).
>   `useAuth` expone `needsTutorial`/`completeTutorial`/`startTutorial`. Se dispara UNA vez tras el primer
>   login/registro (DESPUÉS del onboarding de PIN, gated `!needsPinSetup`), es **saltable**, y se relanza desde
>   **Más → "Tutorial"** (sección "Ayuda"; antes "Cómo usar la app"). NO se reabre en el cold-start.
> - **Falta / pendiente:** el tour solo cambia de **tab** y resalta tabs, el header de Inicio y encabezados de
>   Más; **no entra a stack screens ni modales** (`AddTransaction`, `AddAccount`, detalles) ni resalta controles
>   internos de esas pantallas. No hay tests (el posicionamiento depende del runtime nativo — verificar en
>   dispositivo). `ALIGN_NUDGE`/la "zona cómoda" pueden requerir calibración fina por dispositivo. Mejora futura:
>   permitir **interactuar** con el elemento resaltado (hoy el toque se intercepta para avanzar).

**HomeScreen:** header con **botón de perfil** (`circle-user`, abre el drawer de perfil) a la izquierda,
saludo por hora ("Buenos días/tardes/noches") + fecha al centro y atajos de búsqueda + Cuentas (wallet) a la derecha; `BalanceSummary`
con **tres líneas de saldo** (modelo `0014`, de `/api/accounts/summary`): **"Saldo"** grande (= `debitTotal`, solo
cuentas de débito) y, si el usuario tiene tarjetas, **"Crédito disponible"** (verde, = `creditAvailable`) y **"Dinero
posible (saldo + crédito)"** (sutil, = `possibleMoney = debitTotal + creditAvailable`) — más las dos pills de
ingresos/gastos del mes. Si no hay tarjetas, solo se muestra "Saldo". Las **alertas de utilización >80%** se muestran
en una card "Alertas de crédito" (`HomeSummaryCard`) **solo cuando hay alertas** (el disponible ya está en el balance,
sin duplicar). Pull-to-refresh. **Sección "Últimas
transacciones"** (debajo del resumen/cards): renderiza las **últimas 5** del usuario
(`GET /api/transactions?limit=5&page=1`) con `TransactionCard` y, **debajo de la lista**, un botón de
texto centrado (color primary, padding vertical 12px) "Ver todas las transacciones →" que navega a
`Transactions`. Si no hay ninguna, estado vacío "No hay transacciones aún" + botón "Registrar primera
transacción" → `AddTransaction`.
**Botón flotante (44×44, fondo `accent`, ícono `zap` blanco) abajo-derecha** abre un `BottomSheet` con las
plantillas (cada una con botón "Usar"); enlace "Gestionar plantillas" lleva al CRUD completo.
> **Cards de deudas en Home (C11):** se separan en dos `HomeSummaryCard` independientes en vez de una con balance neto:
> **"Deudas"** muestra **solo lo que YO debo** (`totalDebt`, color expense, visible si `activeDebts > 0`) y **"Por cobrar"**
> muestra lo que me deben (`totalLoan`, color income, ícono `hand-coins`, visible si `activeLoans > 0`). Nunca se netean entre sí.

**AddTransactionScreen:** tabs de tipo tipo pill con color semántico (**la pestaña "Ingreso" se oculta cuando la
cuenta es una tarjeta de crédito** — C1); fila de chips scrollable (cuenta / categoría o destino / fecha); input de
descripción opcional; caja de **cuotas** para gasto con tarjeta (nº de cuotas + interés mensual del crédito + mora,
con la cuota mensual calculada por amortización francesa — C4); `Calculator` en la mitad inferior.

**TransactionsScreen:** búsqueda pill (`borderRadius.full`), chips de filtro scrollables (tipo + cuenta +
fecha + limpiar), **filtro por tipo de cuenta** (`AccountTypeFilter`: Todas | Débito | Crédito), lista
agrupada por fecha, swipe-to-delete (fondo `expense`), FAB `primary` abajo-derecha.

**StatsScreen:** tabs de período scrollables; **filtro por tipo de cuenta** (`AccountTypeFilter`: Todas |
Débito | Crédito); cards de resumen Ingresos/Gastos + card de Balance neto; donut por categoría con leyenda
y porcentajes; barras (top redondeado) ingresos vs gastos; línea de evolución (`accentLight`); top categorías
con barra de progreso.

> **Filtro por tipo de cuenta (`components/AccountTypeFilter.tsx`).** Componente reutilizable: 3 chips
> horizontales (`'all' | 'debit' | 'credit'`), el activo resaltado con color del theme (primary/income/naranja).
> **Débito** = cuentas bank/cash/digital_wallet; **Crédito** = `credit_card`. Como el endpoint
> `GET /api/transactions` solo acepta UN `account_id` (no un tipo) y los de `/api/stats/*` no aceptan cuenta,
> el filtro se aplica **client-side**: se arma un `Set` de los ids de tarjetas (`useAccounts`) y se filtra por
> pertenencia de `accountId` (transfers por su cuenta origen). En **Transactions** se filtra la lista ya cargada
> (combina con los demás filtros; nota: con paginación solo filtra lo descargado). En **Stats**, cuando el filtro
> ≠ 'all' se traen las transacciones del período (`limit:1000`) y se recalculan resumen/categorías/timeline/
> evolución en cliente vía `utils/statsAggregation.ts` (suma en monto nativo, sin conversión multi-moneda); con
> 'all' se usan los datos agregados del servidor.

**AccountsScreen:** card total consolidado con `LinearGradient` (gradiente `cardHighlight`); cuentas como
cards con borde izquierdo (4px) del color de la cuenta; "+" en el header.

**CategoriesScreen:** tabs pill Gastos/Ingresos (color `expense`/`income`); padres con ícono+color;
subcategorías colapsables indentadas con línea vertical del color del padre.

**Calculadora:** ocupa mitad inferior de AddTransactionScreen. Botones 0-9, `.`, `+ - × ÷`, `⌫`, `C`, `✓`.
Números fondo `surfaceLight`; operadores fondo `primaryDark` / texto `primaryLight`; borrar `surfaceAccent`;
confirmar `✓` ancho doble en color semántico (`income`/`expense`/`transfer`), `borderRadius.xl`.
Display: expresión (`textMuted`, `fontSize.lg`) + resultado (`fontSize.hero`, coloreado por tipo).
Motor en `calculatorEngine.ts` (evaluación paso a paso, **NO `eval()`**). Maneja edge cases.
> **Auto-fill inteligente (C7):** cuando la `Calculator` se monta con `initialValue > 0` (cuota sugerida de un pago,
> o monto de un registro al **editar**), el estado arranca con el flag `prefilled: true`. El **primer dígito o punto** que
> teclee el usuario **reemplaza por completo** el monto pre-llenado (no concatena) y baja el flag; los siguientes se
> concatenan normal. Comparte rama con `justEvaluated` (el comportamiento tras `=`). Aplica al modal de pago/edición de
> deudas y a la edición de transacciones (ambos pasan el monto por `initialValue`).
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
10. **Metas de ahorro:** `SavingsScreen` con card total gradiente, `AddSavingsGoal` (Calculator, fecha límite, **cuenta por defecto del aporte** — placeholder "Cuenta sugerida al aportar", color/ícono), `SavingsDetail` con contribuciones (depósito/retiro vía BottomSheet+Calculator, **cuenta obligatoria con `AccountChips`** — default = la de la meta) **editables (tap) y eliminables (long-press)**, card resumen en Home (`HomeSummaryCard`). **El aporte mueve dinero real:** el depósito resta del saldo de la cuenta elegida y el retiro lo devuelve. La `AccountCard` muestra el saldo real y, debajo, "Ahorro X" tocable → bottom sheet con el desglose por meta (`GET /accounts/:id/savings`).
11. **Deudas y préstamos:** `DebtsScreen` con toggle "Mis deudas"/"Me deben", card de balance neto y sección **"Historial"** colapsable para las saldadas (con borrado definitivo); `DebtCard` con barra invertida (cuánto falta), indicador de vencimiento urgente (≤7 días); `AddDebt` (tipo, persona/entidad, **fecha de corte + fecha límite de pago** (C6), cuenta + switch "registrar desembolso inicial en la cuenta" (**ON por defecto al asociar una cuenta normal a una deuda nueva**, para que el saldo refleje la deuda sin activarlo a mano), y **toggle "¿A cuotas / crédito?"** (C4) con nº de cuotas + interés mensual del crédito + mora + preview en vivo de la cuota por amortización francesa; el interés anual informativo solo se muestra sin cuotas); `DebtDetail` con historial de pagos (muestra la cuenta), metaRow con Corte/Límite de pago, y FAB "Registrar pago" (BottomSheet con `AccountChips` **sin tarjetas de crédito** (C3) + selector de fecha (`DateRangePicker`) + nota + Calculator **prellenada con la cuota/`nextPaymentAmount`**, más mora si está vencida — C5). **Cada pago del historial es tappable → reabre el mismo BottomSheet en modo edición** prellenado con sus datos (`PUT /debts/:id/payments/:paymentId`, C7); tras editar/crear se hace `triggerRefresh()` + `load(true)` para reflejar el restante, el historial y los saldos de cuentas/tarjeta. Cada abono con cuenta mueve el balance real (income/expense). Card en Home si hay activas.
12. **Gastos compartidos (splits):** `SplitsScreen` lista grupos con mi balance ("Te deben"/"Debes"/"Estás a mano"); `AddSplitGroup` con miembros (uno marcado "Yo", mínimo 2) **y modo edición del grupo** (nombre/descripción/color/ícono; agrega/quita miembros en el acto); `SplitGroupDetail` con balances simplificados (greedy) + botón "Liquidar" por transferencia (con `AccountChips` cuando me involucra, como confirmación explícita del movimiento), lista cronológica de gastos (**tappables → editar gasto**), botón de editar grupo en el header y, en la papelera, **menú "Liquidar" (conserva las transacciones de mi parte) vs "Eliminar" (revierte todo)**, FAB; `AddSplitExpense` con división en partes iguales o personalizada (valida la suma), pagador, categoría opcional y **cuenta cuando pago yo** (descuenta de la cuenta real), **reutilizado en modo edición** (`expenseId`). Card en Home si hay balances pendientes.
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

21. **Presupuestos mensuales:** pantalla `BudgetsScreen` (accesible desde el tab **"Más"** → "Presupuestos",
    ícono `pie-chart`; registrada en `RootStack`, carga diferida) + hook `useBudgets` (mismo patrón que
    `useDebts`/`useSavings`: `{ budgets, summary, history, loading, refreshing, error, refetch }`) + `budgetsApi`
    en `api/client.ts`. La pantalla tiene **2 tabs**: "Presupuestos" (tarjeta de resumen con restante/presupuestado/
    gastado + nº de excedidos; lista de presupuestos activos como cards con **barra de progreso** verde `<80%`,
    amarillo `80–100%` (`#F59E0B`), rojo `>100%`, texto `$gastado / $monto` + `%`) y "Historial" (últimos 6 meses,
    cada mes con barra "X de Y cumplidos" + %, expandible al detalle por categoría con check/cruz verde/rojo).
    El alta/edición es un `BottomSheet`: toggle "Presupuesto global" o `CategoryPicker` (tipo expense) + monto vía
    `CalculatorSheet`; editar permite cambiar el monto y eliminar; 409 → toast "Ya tienes un presupuesto para esta
    categoría". En el **Home** se muestran hasta **2 mini-alertas** (`⚠️ <categoría> al X% del presupuesto`) para los
    presupuestos activos por encima del 80% (las de mayor %), que enlazan a `BudgetsScreen`. Montos con
    `formatCurrency(.., mainCurrency)`. Budgets cacheados (5 min) + invalidados en el backend.

22. **Búsqueda global (mobile, sin cambios de servidor):** ícono de lupa en el header de `HomeScreen`
    (arriba a la derecha) → `SearchScreen` (registrada en `RootStack`, carga diferida). Componente
    `GlobalSearchBar` (lupa + botón limpiar, **debounce 400ms** con `useRef`+`setTimeout` —sin lodash—,
    mínimo **2 caracteres**, `autoFocus`). Hook `useGlobalSearch(term)`: SOLO **transacciones** van al
    servidor (`GET /api/transactions?search=&limit=5`, con **AbortController** para cancelar la búsqueda
    anterior); el resto se filtra **client-side** sobre los datos ya cacheados por los hooks existentes
    (`useAccounts`, `useCategories` —aplana padres+subcategorías—, `useSavings`, `useDebts` —match por nombre
    o `creditorDebtor`—, `useTags`), case-insensitive con `.includes()`. Devuelve `{ results, loading,
    hasResults }`. `SearchScreen` muestra secciones solo si tienen resultados (Transacciones con
    `TransactionCard` + "Ver más" → `Transactions {search}`, Cuentas `AccountCard`, Categorías fila
    ícono+color, Metas `SavingsGoalCard`, Deudas `DebtCard`, Etiquetas `TagChip`), con estado inicial
    (sugerencia) y vacío ("No se encontraron resultados para …"). `Transactions` ahora acepta `search?` en
    sus params para pre-aplicar el filtro.

23. **Tarjetas de crédito (UI mobile):** en `AddAccountScreen`, al elegir tipo "Tarjeta de crédito" aparecen
    campos exclusivos (ocultos para el resto de tipos y no se envían al guardar): "Límite de crédito"
    (obligatorio >0, vía `CalculatorSheet`), "Día de corte" y "Día de pago" (1-28, default 1/20, vía
    `DayPickerSheet` — grilla de 28 días en `BottomSheet`) y "Permitir sobregiro" (`Switch`, default off);
    el campo de saldo se relabela "Saldo adeudado" (default 0 = sin deuda). Al editar una tarjeta existente
    se precargan estos valores y el saldo se muestra en positivo (el backend lo guarda negado; al guardar la
    edición se vuelve a negar para mantener la convención). `AccountCard` para `type==='credit_card'` cambia
    a un layout vertical: barra de utilización con 4 tramos de color (verde `<50%`, amarillo `50-80%`, naranja
    `80-100%`, rojo `>100%`, según `utilizationPercentage`), "Disponible: $X" en grande (`creditAvailable`),
    "Usado: $Y de $Z" (`creditUsed`/`creditLimit`) y "Próximo corte: DD/MM" (`nextBillingDate`); las cuentas
    de débito mantienen el layout original sin cambios. `Account`/`AccountInput` en `types/index.ts`
    extendidos con los campos calculados (`creditLimit`, `creditUsed`, `creditAvailable`,
    `utilizationPercentage`, `billingCycleDay`, `paymentDueDay`, `allowOverdraft`, `nextBillingDate`,
    `nextPaymentDueDate`) y de alta/edición (`creditLimit`, `billingCycleDay`, `paymentDueDay`,
    `allowOverdraft`) que ya devuelve/acepta el backend (Prompt 7A).

24. **CreditCardDetailScreen (UI mobile, Prompt 7B):** pantalla de detalle de una tarjeta de crédito,
    registrada en el stack (`CreditCardDetail: { accountId }`). Al tocar un `AccountCard` con
    `type==='credit_card'` (en `AccountsScreen` y en los resultados de `SearchScreen`) se navega aquí en
    lugar de `AddAccount`/`Transactions`. Secciones:
    - **Medidor de utilización**: arco semicircular dibujado a mano con `react-native-svg` (`Path` con `A`
      de SVG, fondo `surfaceLight` + arco relleno con el color del tramo de `utilizationColor`, 0-180°),
      porcentaje centrado debajo del arco. Debajo, grilla con `Límite`, `Usado`, `Disponible` (`creditLimit`/
      `creditUsed`/`creditAvailable`), `Día de corte` y `Día de pago`. Botón "Editar límite" → navega a
      `AddAccount { accountId }` (mismo formulario de edición de Prompt 7A).
    - **"Estado de cuenta actual"**: trae el corte más reciente vía el hook `useCreditCard(accountId)` (ver
      ítem 26; orden `period_end desc`, el primero es el actual) y muestra periodo/total/pagado/pendiente. Si
      no hay ningún corte generado, `EmptyState` + botón "Generar estado de cuenta" (→ `generateStatement()`
      del hook). Si el corte no está pagado, botón "Pagar" abre un `BottomSheet` con el monto pre-llenado
      (= pendiente, `TextField` numérico editable) y un `SelectRow` que abre `AccountPicker` filtrado a
      cuentas no-tarjeta (`type !== 'credit_card'`) para elegir la cuenta de origen; confirmar llama a
      `payStatement(statementId, amount, paymentAccountId)` del hook.
    - **"Historial"**: los hasta 12 cortes devueltos, cada fila con periodo (`periodStart`–`periodEnd`),
      monto total y badge de estado — `Pagado` (verde, `isPaid`), `Vencido` (rojo, `paymentDueDate < hoy` y
      no pagado) o `Pendiente` (amarillo).
    - **"Últimas compras"**: últimas 10 transacciones de la cuenta (`transactionsApi.list({account_id, limit:
      10})`) renderizadas con `TransactionCard`; acción "Ver todas" → `Transactions { accountId }`.
    Tipo nuevo `CreditCardStatement` y `PayStatementInput` en `types/index.ts` (espejo de la tabla
    `credit_card_statements`); `accountsApi.statements`/`accountsApi.payStatement` nuevos en `api/client.ts`.

25. **AccountsScreen con secciones (débito/crédito) y alertas de crédito en Home:** `AccountsScreen` usa
    `SectionList` (antes `FlatList`) con dos secciones: **"Cuentas de débito"** (`bank`/`cash`/
    `digital_wallet`, header con el subtotal = `summary.debitTotal`) y **"Tarjetas de crédito"** (header con
    "Usado X · Disponible Y" = `summary.creditUsed`/`creditAvailable`); secciones vacías no se muestran.
    `HomeSummaryCard` ganó una prop opcional `extra?: React.ReactNode` (se renderiza debajo de la fila
    principal; el resto de usos —ahorro/deudas/splits— quedan igual). En `HomeScreen`, si el usuario tiene
    tarjetas de crédito, se agrega una card "Crédito disponible" justo debajo de `BalanceSummary` con
    `acctSummary.creditAvailable`; si alguna tarjeta supera 80% de utilización, muestra hasta 2 alertas
    "⚠️ [nombre] al X% del límite" (las de mayor % primero) vía `extra`. El tipo `AccountsSummary` en
    `types/index.ts` se extendió con `debitTotal`, `creditTotal`, `creditLimit`, `creditUsed` y
    `creditAvailable` (ya devueltos por `GET /api/accounts/summary`, faltaban en el tipo mobile).

26. **Hook `useCreditCard` (mobile):** `mobile/src/hooks/useCreditCard.ts`, mismo patrón que `useDebts`
    (refetch en cambios de `refreshKey` del `appStore`). `useCreditCard(accountId, limit = 12)` expone
    `statements` (vía `GET /accounts/:id/statements?limit&offset=0`), `loading`, `refreshing`, `error`,
    `refetch`, y dos acciones: `payStatement(statementId, amount, paymentAccountId)` (→
    `accountsApi.payStatement`, refetch automático de `statements` al terminar) y `generateStatement()` (→
    nuevo `accountsApi.generateStatement` / `POST /accounts/:id/generate-statement`, refetch automático).
    Tipo nuevo `GenerateStatementResult` (`CreditCardStatement & { debt: Debt }`) en `types/index.ts`.
    `CreditCardDetailScreen` consume el hook en vez de hacer `accountsApi.statements`/`payStatement`
    directos: "Estado de cuenta actual"/"Historial" usan `statements`/`loading`/`error` del hook (con
    `ErrorState` + retry si falla), el pull-to-refresh dispara `load(true)` (cuenta + transacciones) y
    `refetchStatements(true)` en paralelo, y se agregó el botón "Generar estado de cuenta" (visible solo si
    no hay ningún corte) que llama a `generateStatement()`.

27. **Pagos recurrentes, cuota de manejo y desactivar/congelar cuentas:** motor de cargos recurrentes idempotente
    (cron horario + catch-up al abrir la app), pantalla de gestión de reglas (`RecurringRulesScreen`/`AddRecurringRuleScreen`,
    tab "Más" → "Pagos recurrentes"); cuota de manejo por cuenta como regla recurrente especial (sección en `AddAccountScreen`);
    desactivar cuentas (fuera de selectores, visibles en lista con indicador) y congelar tarjetas (❄️, bloquea gastos, permite
    pagos de deuda). Detalle completo en la sección "PAGOS RECURRENTES, CUOTA DE MANEJO Y DESACTIVAR/CONGELAR".

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
  `wallet_pin_attempts` y `wallet_pin_lock_until` en SecureStore (5 fallos → 30s). **Van en SecureStore (no
  AsyncStorage) a propósito**: aunque no son secretos, son estado anti-fuerza-bruta; en AsyncStorage un
  atacante podría resetear el contador y burlar el bloqueo. Constantes: `PIN_LENGTH=4`,
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
- **PIN obligatorio en el primer login/registro (`SetupPinScreen`, onboarding):** tras un login/registro exitoso,
  `useAuth.applySession` comprueba `isPinEnabled()`; si NO hay PIN, expone `needsPinSetup=true` y `App.tsx` renderiza
  `<SetupPinScreen>` como **overlay raíz one-way** (igual que `LockScreen`: sin navegación → sin botón de back ni gesto
  de swipe; tiene prioridad sobre el `LockScreen`). Es un flujo en pasos dentro de UNA sola pantalla:
  (1) "Configura tu PIN" (4 dígitos, `PinKeypad`+`PinDots`) → (2) "Confirma tu PIN" (si no coincide: mensaje "Los PINs
  no coinciden" + **shake** con `Animated` y vuelve al paso 1; si coincide: `setPin()` y `useAppLock.refresh()`) →
  (3) **biometría opcional** (solo si `isBiometricAvailable()`: "Activar" prueba `authenticateBiometric()` y si pasa
  `enableBiometric(true)`, si falla toast "Puedes activarlo después en Seguridad"; o "Ahora no") → (4) "¡Listo! Tu app
  está protegida" con ícono `shield-check` y botón "Continuar" → `completePinSetup()` revela el Home. **NO bloquea en
  esta sesión** (el usuario recién se autenticó; el auto-lock aplica la próxima vez que vuelva de background > 60s).
  La detección es SOLO en login/registro (`applySession`), **NO** al restaurar sesión en cold-start. Si el usuario
  luego **desactiva** el PIN en `SecurityScreen`, es su decisión y **no se vuelve a forzar** el setup.
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

## PRODUCCIÓN

Endurecimiento del backend para correr en producción (Render). Todo en `server/src/index.ts`
salvo el middleware de logging. El orden del pipeline es: `helmet` → `requestLogger` →
`compression` → `cors` → `express.json` → rutas → `notFoundHandler` → `errorHandler`.

- **Helmet (`helmet ^8`):** `app.use(helmet())` (sin config custom) montado **ANTES de CORS** para que sus
  headers de seguridad (X-Content-Type-Options, X-Frame-Options, HSTS, etc.) apliquen a todas las respuestas.
  Ver detalle en "Hardening de producción (server)" arriba.
- **Validación de entorno (`utils/validateEnv.ts`, Zod):** `import './utils/validateEnv.js'` es lo PRIMERO de
  `index.ts`. Valida `DATABASE_URL` (requerido), `JWT_SECRET` (≥32 chars), `PORT` (default 3000) y avisa si
  faltan `GMAIL_USER`/`GMAIL_APP_PASSWORD` (opcionales). Si algo falla → `process.exit(1)` con mensaje claro.
- **Compresión gzip (`compression ^1.8`):** `app.use(compression())` montado **después de helmet, antes
  de las rutas**. Threshold por defecto (1 kb): comprime los payloads grandes (export, listas largas,
  insights) sin tocar los chicos. Añade `Vary: Accept-Encoding` a las respuestas.
- **Health check `GET /api/health` (sin auth):** hace `SELECT 1` contra Neon. Si la DB responde →
  `200 { status: 'ok', timestamp, uptime }` (`uptime` = `process.uptime()` en segundos); si falla →
  `503 { status: 'degraded', error: 'Database unreachable' }`. Pensado para los health checks de
  Render/monitoreo. (Existe además `GET /health` liviano de liveness.)
- **Graceful shutdown (SIGTERM/SIGINT):** `app.listen()` se guarda en `server`; al recibir la señal se hace
  `server.close()` (deja de aceptar conexiones nuevas) y se drenan las requests en vuelo hasta **10 s**; al
  terminar loguea `"Servidor cerrado limpiamente"` y `process.exit(0)`. Si no terminan a tiempo, salida
  forzada `exit(1)`. Evita cortar una saga a la mitad durante un deploy. Es idempotente (flag `shuttingDown`).
- **Request logging mínimo (`middleware/requestLogger.ts`, sin morgan/winston):** mide cada request con
  `Date.now()` y loguea `"[HTTP] MÉTODO /path STATUS TIMEms"` en `res.on('finish')`. En **producción**
  (`NODE_ENV=production`) solo loguea lo relevante (>1000 ms o status ≥400) para no inundar logs; en
  desarrollo loguea todo.
- **Build de producción (sin `tsx` en runtime):** `tsconfig.json` usa `module`/`moduleResolution: NodeNext`,
  `target: ES2022`, `outDir: dist`. `pnpm build` (= `tsc`) compila `src/` → `dist/` (ESM ejecutable por Node,
  los imports ya usan extensión `.js`); `pnpm start` corre `node dist/index.js`. `dist/` está gitignoreado.
  Los handlers de proceso (`unhandledRejection`/`uncaughtException`) y la validación de env al arrancar
  (`utils/validateEnv.ts`) completan el arranque seguro.

## COMANDOS

```bash
# Backend
cd server
pnpm install
pnpm db:generate    # genera migraciones desde schema.ts
pnpm db:migrate     # aplica migraciones
pnpm db:seed        # inserta categorías default + cuenta Efectivo
pnpm dev            # arranca API en :3000 (tsx watch, desarrollo)
pnpm typecheck      # tsc --noEmit
pnpm build          # tsc → compila src/ a dist/ (producción, sin tsx)
pnpm start          # node dist/index.js (producción; requiere pnpm build antes)

# Mobile  (Node 22: exportar el flag para evitar el type stripping nativo)
cd mobile
export NODE_OPTIONS="--no-experimental-strip-types"
pnpm install
pnpm start          # Expo dev server (SDK 54 / Expo Go)
pnpm typecheck      # tsc --noEmit
pnpm build:apk      # eas build -p android --profile preview
```

---

## CORRECCIONES TARJETAS / DEUDAS (rama `Prestamo-Correcciones`, jun 2026)

> Lote de 6 correcciones sobre tarjetas de crédito, deudas y cuotas. Migración **`0015_clammy_blindfold.sql`**
> (aditiva, solo `ADD COLUMN` nullable en `debts`). Util nuevo `server/src/utils/installments.ts` (+ espejo
> `mobile/src/utils/installments.ts`). 5 commits detallados en la rama.

- **C1 — No ingresos en tarjetas de crédito.** `POST`/`PUT /api/transactions` con `type='income'` y cuenta
  `credit_card` → 400; en mobile la pestaña "Ingreso" se oculta y se fuerza "Gasto" al elegir una tarjeta.
- **C2 — Cupo de tarjeta (descartada).** Confirmado con el usuario: el cupo disponible se repone **de inmediato**
  al pagar la deuda (deuda 300K, pago 200K → vuelven 200K al disponible). Ya era el comportamiento; sin cambios.
- **C3 — No abonar deudas con tarjeta.** `POST /api/debts/:id/pay` rechaza `accountId` de tipo `credit_card`
  (400); en mobile el `AccountChips` del sheet de pago excluye las tarjetas y el FAB no las preselecciona.
- **C4 — Cuotas con interés (crédito + mora), calculadas.** Columnas nuevas en `debts` (`installments`,
  `installment_amount`, `monthly_interest_rate`, `late_interest_rate`). Cuota por **amortización francesa**
  (`frenchInstallment`, interés **mensual** sobre saldo). Las compras a cuotas con tarjeta envían las tasas en
  `POST/PUT /api/transactions` y se guardan en la deuda automática. UI: toggle "¿A cuotas / crédito?" en `AddDebt`
  y campos de tasa en la caja de cuotas de `AddTransaction`, con preview en vivo.
- **C5 — Prellenar la cuota al pagar.** `GET /api/debts` y `/:id` devuelven `isOverdue`/`lateFee`/`nextPaymentAmount`
  (`computeDueInfo`: cuota + mora·meses vencidos, topado al restante). `DebtDetail` prellena la calculadora del pago
  con `nextPaymentAmount` y muestra la cuota (+ mora si vencida).
- **C6 — Fecha de corte + fecha límite de pago.** Columna `cutoff_date` en `debts`; `due_date` se reetiqueta como
  "fecha límite de pago". `AddDebt` tiene ambos selectores; `DebtDetail` los muestra en la metaRow.
- **C7 — Pagos de deuda: restauración de cupo, auto-fill y edición.** (1) **Restaura el cupo** de la tarjeta al abonar
  una deuda automática (lo que C2 documentaba pero el código NO hacía): `POST /api/debts/:id/pay` ahora suma el monto al
  `current_balance` de la tarjeta de la deuda (parcial y total), revertido en la compensación; el frontend ya refrescaba
  cuentas vía `triggerRefresh`. (2) **Auto-fill inteligente** en la `Calculator`: con monto pre-llenado, el primer dígito
  lo reemplaza por completo (flag `prefilled` en `calculatorEngine.ts`); aplica a pagos de deuda y edición de transacciones.
  (3) **Edición de pagos** desde el historial: endpoint nuevo `PUT /api/debts/:id/payments/:paymentId` que revierte el pago
  viejo y aplica el nuevo (restante, transacción enlazada, cupo de tarjeta) y `DebtDetail` con cada pago tappable → mismo
  BottomSheet en modo edición (monto/fecha/cuenta/nota), con refetch + `triggerRefresh` tras guardar.

> **Validación:** `pnpm typecheck` limpio en server y mobile; migración solo `ADD COLUMN` (count `debts`=7 intacto);
> amortización verificada (500k/10=50k; 1M/10@2%=111 326,53; mora 100k@3%×2 meses → próximo pago 106 000).
> C7 sin migración (solo lógica + endpoint nuevo); ejemplo de cupo: límite 1M, compra 200k (disponible 800k), abono 50k → disponible 850k.

### PENDIENTE — Próxima rama (funciones nuevas) ✅ IMPLEMENTADO
> Las 3 funciones que estaban pendientes ya están implementadas en la rama `Prestamo-Correcciones`
> (5 fases, 1 commit por fase). Ver "PAGOS RECURRENTES, CUOTA DE MANEJO Y DESACTIVAR/CONGELAR" abajo.
> 1. ✅ Cuota de manejo por cuenta · 2. ✅ Pagos recurrentes (cron + catch-up) · 3. ✅ Desactivar cuentas + congelar tarjetas.

---

## PAGOS RECURRENTES, CUOTA DE MANEJO Y DESACTIVAR/CONGELAR (rama `Prestamo-Correcciones`, jun 2026)

> 3 features en 5 fases. Migraciones **`0017_sudden_veda.sql`** (recurring_rules + recurring_rule_tags +
> `transactions.recurring_rule_id`), **`0018_shallow_robbie_robertson.sql`** (`accounts.management_fee_*`),
> **`0019_jazzy_microchip.sql`** (`accounts.is_frozen`). Todas aditivas. Archivos nuevos: `services/recurring.ts`,
> `routes/recurring.ts`, `utils/recurrence.ts`, `utils/balance.ts` (server); `screens/RecurringRulesScreen.tsx`,
> `screens/AddRecurringRuleScreen.tsx`, `hooks/useRecurringRules.ts` (mobile).

### Pagos recurrentes (motor)
- **`materializeRecurringCharges(userId)` (`services/recurring.ts`)**: por cada regla activa con `start_date<=hoy` y
  (`end_date` null o `>=hoy`), calcula las ocurrencias en `(last_generated_date, hoy]` con `computeOccurrences`
  (`utils/recurrence.ts`, función PURA) y, en UN `db.batch` atómico, inserta las transacciones (con `recurring_rule_id`,
  tipo/monto/categoría de la regla), ajusta el saldo (`balanceStatements` agregado) y **avanza el cursor** `last_generated_date`.
  Post-batch (saga + `safeCompensate`): copia las tags de la regla y, para gasto con tarjeta, crea la deuda automática.
- **Idempotencia**: el cursor garantiza que llamar N veces = mismo resultado. Bajo CONCURRENCIA se serializa con un **lock
  por usuario EN PROCESO** (`Set` en `recurring.ts`) + `noOverlap` en el cron — **asume un solo proceso Express** (igual que
  la caché en memoria). Si se escala a varias instancias, mover el lock a la DB (UPDATE condicional del cursor).
- **Frecuencias** (`computeOccurrences`): `daily` (cada día), `weekly`/`biweekly` (por `day_of_week`; biweekly cada 14 días
  anclado en `start_date`), `monthly` (`day_of_month`, último día del mes si no existe), `yearly` (el `day_of_month` del mes
  de `start_date`, 1×/año). Tope defensivo `MAX_OCCURRENCES=1000`. Soporta **gasto e ingreso** (income en tarjeta → se salta).
- **Cron (Fase 2, `index.ts`)**: `node-cron` cada hora (`'0 * * * *'`, `noOverlap:true`), recorre `usersWithActiveRules()` y
  materializa por usuario en try/catch aislado; se detiene en el graceful shutdown (`recurringTask.stop()`). Render free duerme,
  así que el mobile también dispara `POST /api/recurring/catch-up` **una vez al autenticarse**, en background y silenciando
  errores (`hooks/useAuth.tsx`); si generó cargos hace `triggerRefresh()`.
- **UI (Fase 3)**: `RecurringRulesScreen` (lista con frecuencia legible, cuenta, estado, próxima fecha; toggle pausar/activar y
  eliminar con aviso de que las tx generadas no se borran) + `AddRecurringRuleScreen` (crear/editar reutilizando
  AccountPicker/CategoryPicker/TagPicker/DayPickerSheet/DateRangePicker/CalculatorSheet; toggle gasto/ingreso oculto en tarjetas).
  Entrada "Pagos recurrentes" en el tab "Más" (Finanzas).

### Cuota de manejo por cuenta (Fase 4)
- Caso ESPECIAL de regla recurrente. Activar (`managementFeeAmount>0` + `managementFeeDay` en POST/PUT account) crea/actualiza
  una `recurring_rule` mensual vinculada (categoría "Comisiones bancarias" vía `getOrCreateExpenseCategory`, guardada en
  `accounts.management_fee_rule_id`). Modificar = actualiza esa regla. Desactivar (`managementFeeAmount: null`) la **pausa**
  (`is_active=false`) sin borrar las transacciones generadas y conserva el vínculo para reutilizarla (no acumula reglas huérfanas).
  Saga: si el UPDATE de la cuenta falla tras crear una regla nueva, se borra la regla. UI: sección "Cuota de manejo" en `AddAccountScreen`.

### Desactivar cuentas + congelar tarjetas (Fase 5)
- **Desactivar** (`PATCH /api/accounts/:id/toggle-active`, flip `is_active`): NO aparece en selectores (`GET /api/accounts` sin
  `includeInactive`), SÍ en lista (`?includeInactive=true`), historial y reportes. `is_active` = "fuera de selectores", **no**
  bloqueo duro de operaciones (documentado en `assertAccountsOwned`). Al desactivar, el mobile ofrece pausar las reglas
  recurrentes activas asociadas (Alert de 3 caminos). El `summary` sigue siendo solo-activas.
- **Congelar** (`PATCH /api/accounts/:id/toggle-frozen`, solo `credit_card`, flip `is_frozen`): bloquea gastos nuevos en
  `POST`/`PUT /api/transactions` (400) y en el motor recurrente (salta sin avanzar el cursor → se recuperan al descongelar),
  pero **permite pagos de deuda** (transfer hacia la tarjeta). UI: ícono ❄️ + indicador "Inactiva" en `AccountCard`, switches
  en `AddAccountScreen` (edición). Estados: activa+no congelada=normal; activa+congelada=solo pagos; desactivada=fuera de selectores.

> **Validación:** `pnpm typecheck` limpio en server y mobile en cada fase; @tester verificó CRUD + idempotencia (materializar 2×
> = mismo conteo), cuota (crear/modificar/materializar/desactivar), y congelado (gasto→400, pago de deuda→201). @reviewer por fase,
> CRÍTICOS corregidos. **Limitación conocida:** editar/borrar desde "Pagos recurrentes" la regla de una cuota de manejo puede
> desincronizar `accounts.management_fee_*` (la regla y la cuenta se gestionan por separado). **Pendiente menor:** índice único
> en `categories(user_id,type,lower(name))` para blindar `getOrCreateExpenseCategory` de carreras.

---

## DEUDA TÉCNICA

> Inventario de pendientes conocidos. No bloquean nada hoy; documentados para un refactor futuro.

### TODOs en código (`grep -rn TODO`)
Todos son el mismo marcador `// TODO: paginar con load-more en mobile`: cap defensivo `.limit(200)` que
desaparecerá cuando el mobile implemente "cargar más". No hay FIXME ni HACK en el código.

**Colecciones hijas (GET de detalle):**
- `server/src/routes/debts.ts:170` — `payments` de `GET /api/debts/:id`.
- `server/src/routes/savings.ts:113` — `contributions` de `GET /api/savings/:id`.
- `server/src/routes/splits.ts:526` — `expenses` de `GET /api/splits/:groupId/expenses`.
- `server/src/routes/splits.ts:890` — `settlements` de `GET /api/splits/:groupId/settlements`.

**Listas de nivel superior (cap defensivo; colecciones acotadas por uso):**
- `server/src/routes/accounts.ts:99` — `GET /api/accounts`.
- `server/src/routes/categories.ts:47` y `:66` — `GET /api/categories` y `/:type`.
- `server/src/routes/tags.ts:39` — `GET /api/tags`.
- `server/src/routes/templates.ts:47` — `GET /api/templates`.
- `server/src/routes/savings.ts:63` — `GET /api/savings`.
- `server/src/routes/debts.ts:109` — `GET /api/debts`.
- `server/src/routes/budgets.ts:82` — `GET /api/budgets` (vía `fetchBudgets`, también alimenta `/summary`).
- `server/src/routes/splits.ts:236` — `GET /api/splits`.

### Tipos duplicados server ↔ mobile (sincronización **manual**)
El backend deriva sus tipos del esquema Drizzle (`server/src/db/schema.ts`, `typeof tabla.$inferSelect`) y el
mobile los reescribe a mano en `mobile/src/types/index.ts`. **No comparten paquete a propósito** (no hay
workspace linking en el monorepo; un paquete compartido complicaría el build de Expo). Hay que mantenerlos
sincronizados a mano. Entidades duplicadas: `User`, `Account`, `Category`, `Transaction`, `TransactionTag`,
`Template`, `Tag`, `SavingsGoal`, `SavingsContribution`, `Debt`, `DebtPayment`, `SplitGroup`, `SplitMember`,
`SplitExpense`, `SplitShare`, `SplitSettlement`, más los enums `AccountType`/`TxType`/`CategoryType`/
`DebtType`/`ContributionType`. Diferencia esperada: en el server los `decimal` son `string` y las fechas
`Date | string`; el mobile los modela como `string`. Refactor futuro posible: generar los tipos del mobile
desde el esquema (p. ej. con un script) en vez de a mano. **No mover archivos por ahora.**

### Exports sin uso
- `server/src/middleware/auth.ts → requireAdmin`: middleware de guard admin definido pero **sin rutas admin
  montadas** todavía. Se conserva como API intencional del módulo de auth (el flag `isAdmin` ya viaja en el
  JWT y `mauiturriza@gmail.com` es admin); es el gancho para futuras rutas admin. (El wrapper muerto
  `getRate` de `exchangeRates.ts` sí se eliminó: era redundante con `getRates`.)
