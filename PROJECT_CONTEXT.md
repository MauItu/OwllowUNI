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

## ESTRUCTURA DE ARCHIVOS

### server/
```
server/
├── package.json                ← scripts: dev, build, start, db:generate, db:migrate, db:push, db:seed
├── tsconfig.json
├── drizzle.config.ts           ← apunta a src/db/schema.ts, lee DATABASE_URL del .env raíz
├── src/
│   ├── index.ts                ← Entry point Express (CORS, JSON, rutas, errorHandler)
│   ├── db/
│   │   ├── connection.ts       ← Neon + drizzle-orm (carga ../.env)
│   │   ├── schema.ts           ← Tablas: accounts, categories, transactions, templates
│   │   ├── migrate.ts          ← Aplica migraciones de ./drizzle
│   │   └── seed.ts             ← Inserta categorías default + cuenta "Efectivo"
│   ├── routes/
│   │   ├── accounts.ts
│   │   ├── categories.ts
│   │   ├── transactions.ts
│   │   ├── templates.ts
│   │   └── stats.ts
│   └── middleware/
│       └── errorHandler.ts
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
    ├── hooks/                  ← useAccounts, useTransactions, useCategories, useTemplates, useStats
    ├── stores/appStore.ts      ← Zustand (filtros, refresh triggers, plantilla seleccionada)
    ├── screens/                ← Home, Transactions, AddTransaction, Accounts, AddAccount,
    │                              Categories, Templates, Stats
    ├── components/             ← Calculator, TransactionCard, AccountCard, CategoryPicker,
    │                              DateRangePicker, BalanceSummary, StatChart, TemplateCard
    ├── navigation/AppNavigator.tsx  ← Bottom tabs + native stacks
    ├── theme/index.ts          ← tema oscuro (colores, spacing, radius, fontSize)
    ├── utils/                  ← formatCurrency, formatDate, calculatorEngine
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
· `description` varchar(255) · `date` date NN · `time` time NN · `account_id` int FK→accounts NN
· `to_account_id` int FK→accounts (solo transfers) · `category_id` int FK→categories
· `notes` text · `created_at` / `updated_at` timestamp def now()

### templates
`id` serial PK · `name` varchar(100) NN · `type` varchar(10) NN (`income|expense`)
· `amount` decimal(15,2) (nullable) · `description` varchar(255) · `account_id` int FK→accounts
· `category_id` int FK→categories · `is_active` bool def true · `use_count` int def 0 · `created_at` timestamp def now()

### Reglas de balance (atómicas, dentro de una misma transacción SQL)
- `income`  → `account.current_balance += amount`
- `expense` → `account.current_balance -= amount`
- `transfer`→ `account.current_balance -= amount` y `to_account.current_balance += amount`
- Editar/eliminar: revertir el efecto anterior y aplicar el nuevo.

---

## API REST

### Accounts
- `GET    /api/accounts` — cuentas activas
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

### Templates
- `GET    /api/templates` — orden `use_count DESC`
- `POST   /api/templates`
- `PUT    /api/templates/:id`
- `POST   /api/templates/:id/use` — incrementa `use_count`
- `DELETE /api/templates/:id`

### Stats
- `GET /api/stats/summary?from=&to=` — `{ income, expense, balance }`
- `GET /api/stats/by-category?from=&to=` — gastos por categoría
- `GET /api/stats/timeline?from=&to=&group=day|week|month`
- `GET /api/stats/balance-evolution?from=&to=`

---

## STACK

**Backend:** express ^4.21, @neondatabase/serverless ^0.10, drizzle-orm ^0.36, drizzle-zod ^0.5,
zod ^3.23, cors ^2.8, dotenv ^16.4, date-fns ^4.1 · dev: drizzle-kit ^0.28, tsx ^4.19, typescript ^5.6.

**Mobile (Expo SDK 54 — compatible con Expo Go SDK 54 de Play Store):**
expo ~54.0.0, react 19.1.0, react-native 0.81.5, @react-navigation/* ^7,
react-native-screens ~4.16, react-native-safe-area-context ~5.6, react-native-gesture-handler ~2.28,
react-native-reanimated ~4.1 (requiere react-native-worklets 0.5.1 — instalado), react-native-svg 15.12,
axios ^1.7, zustand ^5, date-fns ^4.1, lucide-react-native ^0.460, @expo/vector-icons ^15
(requiere expo-font ~14.0 — instalado), expo-status-bar ~3.0, react-native-toast-message ^2.2.
TypeScript ~5.9, @types/react ~19.1.

> **NO usar:** `victory-native` (removido — arrastra `@shopify/react-native-skia`; las gráficas son
> SVG propio en `StatChart.tsx`) ni `expo-haptics` (removido — incompatible con Node 22).
> Para verificar/alinear versiones con el SDK: `npx expo install --check` / `npx expo install --fix`.

---

## DISEÑO (tema oscuro)

```ts
colors: {
  background:'#0F0F14', surface:'#1A1A24', surfaceLight:'#252535',
  primary:'#6C5CE7', primaryLight:'#A78BFA', success:'#10B981', danger:'#EF4444',
  warning:'#F59E0B', text:'#FFFFFF', textSecondary:'#9CA3AF', textMuted:'#6B7280', border:'#2D2D3D',
}
spacing: { xs:4, sm:8, md:16, lg:24, xl:32 }
borderRadius: { sm:8, md:12, lg:16, xl:24 }
fontSize: { xs:12, sm:14, md:16, lg:20, xl:28, xxl:36 }
```

**Navegación (bottom tabs):** Inicio · Transacciones · Agregar (tab central tipo FAB) · Estadísticas · Más (cuentas, categorías, plantillas).

**Calculadora:** ocupa mitad inferior de AddTransactionScreen. Botones 0-9, `.`, `+ - × ÷`, `=`, `⌫`, `C`, `✓`.
Muestra expresión (textSecondary) + resultado (fontSize.xxl). Operaciones encadenadas. Motor en
`calculatorEngine.ts` (evaluación paso a paso, **NO `eval()`**). Maneja edge cases
(división por 0, múltiples puntos). Botón ✓ en success/danger según tipo.
> Sin haptic feedback: `expo-haptics` fue removido (incompatible con Node 22). `Calculator.tsx`
> ya no importa ni llama `impactAsync`/`ImpactFeedbackStyle`.

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
