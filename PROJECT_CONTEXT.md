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
│   │   ├── schema.ts           ← Tablas: accounts, categories, transactions, templates,
│   │   │                          tags, transaction_tags, savings_goals, savings_contributions,
│   │   │                          debts, debt_payments, split_groups/members/expenses/shares/settlements
│   │   ├── migrate.ts          ← Aplica migraciones de ./drizzle
│   │   └── seed.ts             ← Inserta categorías default + cuenta "Efectivo"
│   ├── routes/
│   │   ├── accounts.ts
│   │   ├── categories.ts
│   │   ├── transactions.ts
│   │   ├── templates.ts
│   │   ├── stats.ts
│   │   ├── tags.ts
│   │   ├── savings.ts
│   │   ├── debts.ts
│   │   └── splits.ts
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
    ├── services/notifications.ts ← Notificaciones LOCALES (permisos, programar/cancelar/
    │                              reprogramar por entidad con identifiers determinísticos, sync global)
    ├── hooks/                  ← useAccounts, useTransactions, useCategories, useTemplates,
    │                              useStats, useTags, useSavings, useDebts, useSplits,
    │                              useNotificationSettings
    ├── stores/appStore.ts      ← Zustand (filtros, refresh triggers, plantilla seleccionada)
    ├── screens/                ← Home, Transactions, AddTransaction, Accounts, AddAccount,
    │                              Categories, Templates, Stats, Tags, Savings, AddSavingsGoal,
    │                              SavingsDetail, Debts, AddDebt, DebtDetail, Splits,
    │                              AddSplitGroup, SplitGroupDetail, AddSplitExpense, More,
    │                              SettingsNotifications
    ├── components/             ← Calculator, CalculatorSheet, TransactionCard, AccountCard,
    │                              AccountPicker, CategoryPicker, DateRangePicker, BalanceSummary,
    │                              StatChart, TemplateCard, TagChip, TagPicker, SavingsGoalCard,
    │                              DebtCard, HomeSummaryCard, BottomSheet, Icon, common
    ├── navigation/AppNavigator.tsx  ← Bottom tabs + native stacks
    ├── theme/index.ts          ← lightTheme + darkTheme (colores, spacing, radius, fontSize)
    ├── theme/ThemeContext.tsx  ← ThemeProvider, useTheme(), useThemedStyles()
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
· `description` varchar(255) · `date` date NN · `time` time NN (editable desde `AddTransaction` con `TimePicker`)
· `account_id` int FK→accounts NN
· `to_account_id` int FK→accounts (solo transfers) · `category_id` int FK→categories
· `notes` text · `created_at` / `updated_at` timestamp def now()

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
· UNIQUE(group_id, name)

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
- `POST   /api/savings/:id/contribute` — `{ amount, type: deposit|withdrawal, date, description? }`; marca `is_completed` al llegar al objetivo

### Debts (deudas y préstamos)
- `GET    /api/debts` — activas primero, con nombre de cuenta
- `GET    /api/debts/summary` — `{ totalDebt, totalLoan, netBalance, activeDebts, activeLoans }`
- `GET    /api/debts/:id` — incluye `payments[]`
- `POST   /api/debts` — `remaining_amount` arranca igual a `total_amount`; con `registerInitialTransaction:true` + `accountId` registra el desembolso inicial como `income` (debt: me prestaron) / `expense` (loan: yo presté)
- `PUT    /api/debts/:id` — si cambia el total, ajusta el restante conservando lo pagado
- `DELETE /api/debts/:id` — CASCADE en pagos + revierte balances y borra las transacciones de los abonos vinculados (db.batch)
- `POST   /api/debts/:id/pay` — `{ amount, date, description?, accountId? }`; resta del restante y marca `is_paid_off` si llega a 0; con `accountId` crea transacción `income`(loan)/`expense`(debt) y enlaza (db.batch)

### Splits (gastos compartidos)
- `GET    /api/splits` — grupos activos con `members[]` y `myBalance`
- `GET    /api/splits/summary` — `{ totalOwedToMe, totalIOwe, netBalance, groups[] }` (solo miembro `is_me`)
- `GET    /api/splits/:id` — grupo con miembros
- `POST   /api/splits` — acepta `members[]` inline (exactamente un `isMe`, nombres únicos)
- `PUT    /api/splits/:id` · `DELETE /api/splits/:id` (CASCADE)
- `POST   /api/splits/:groupId/members` · `DELETE /api/splits/:groupId/members/:id` (solo sin gastos asociados)
- `GET    /api/splits/:groupId/expenses` — con shares y `accountName`; `POST` acepta `accountId?` (solo si paga `is_me` → transacción `expense`), valida que los shares sumen el total (±0.01)
- `GET    /api/splits/:groupId/balances` — balance por miembro + `transfers[]` simplificadas (greedy: mayor deudor paga al mayor acreedor)
- `POST   /api/splits/:groupId/settle` — `{ fromMemberId, toMemberId, amount, date?, accountId? }`; marca shares pareados como settled (antiguos primero), persiste en `split_settlements` y, si involucra a `is_me` con `accountId`, crea transacción `income`(me pagan)/`expense`(yo pago); si la simplificación redirigió deudas, registra el remanente como gasto "Liquidación"
- `GET    /api/splits/:groupId/settlements` — historial de liquidaciones del grupo

---

## STACK

**Backend:** express ^4.21, @neondatabase/serverless ^0.10, drizzle-orm ^0.36, drizzle-zod ^0.5,
zod ^3.23, cors ^2.8, dotenv ^16.4, date-fns ^4.1 · dev: drizzle-kit ^0.28, tsx ^4.19, typescript ^5.6.

**Mobile (Expo SDK 54 — compatible con Expo Go SDK 54 de Play Store):**
expo ~54.0.0, react 19.1.0, react-native 0.81.5, @react-navigation/* ^7,
react-native-screens ~4.16, react-native-safe-area-context ~5.6, react-native-gesture-handler ~2.28,
react-native-reanimated ~4.1 (requiere react-native-worklets 0.5.1 — instalado), react-native-svg 15.12,
axios ^1.7, zustand ^5, date-fns ^4.1, lucide-react-native ^0.460, @expo/vector-icons ^15
(requiere expo-font ~14.0 — instalado), expo-status-bar ~3.0, react-native-toast-message ^2.2,
expo-linear-gradient ~15.0 (gradientes del sistema de temas dual; bundled en Expo Go SDK 54),
expo-splash-screen ~31.0 (control explícito de splash),
expo-notifications ~0.32.17 (notificaciones LOCALES programadas; carga lazy — ver "Notificaciones locales"),
@react-native-async-storage/async-storage 2.2.0 (persistencia de preferencias de notificaciones),
expo-constants ~18.0.13 (detección de entorno Expo Go para deshabilitar notificaciones).
TypeScript ~5.9, @types/react ~19.1.

> **NO usar:** `victory-native` (removido — arrastra `@shopify/react-native-skia`; las gráficas son
> SVG propio en `StatChart.tsx`) ni `expo-haptics` (removido — incompatible con Node 22).
> Para verificar/alinear versiones con el SDK: `npx expo install --check` / `npx expo install --fix`.

---

## DISEÑO — Sistema de temas dual (rediseño jun 2026)

Dos paletas conmutables con un switch en la pantalla "Más". Definidas en `mobile/src/theme/index.ts`;
el estado vive en `mobile/src/theme/ThemeContext.tsx`.

### MODO CLARO — "Minimalista Nórdico"
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

### MODO OSCURO — "Orquídea / Morado Velvet"
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

### Tokens compartidos
```ts
// chart es POR TEMA: rosa/azul/morado SIEMPRE como los 3 primeros colores
// claro:  ['#C1437A','#3A60A1','#7B528C', ...] · oscuro: ['#F72585','#4CC9F0','#9D4EDD', ...]
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
states tienen una ilustración SVG de tres círculos con los colores de la bandera bisexual.

### Arquitectura del tema (patrón obligatorio para código nuevo)
- `ThemeProvider` envuelve la app en `App.tsx`. Default = esquema del sistema (`useColorScheme()`);
  el toggle de la pantalla "Más" lo sobreescribe en sesión (sin persistencia).
- `useTheme()` → `{ theme, colors, isDark, toggleTheme }`.
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

**SafeArea (fix barra de navegación Android):** `app.json` tiene `edgeToEdgeEnabled:true`, así que
la app dibuja bajo las barras del sistema. El fix:
- `App.tsx`: `<ErrorBoundary>` + `<SafeAreaProvider>` + `<StatusBar style="light" backgroundColor={bg} translucent />`.
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
15. **Notificaciones locales y recordatorios:** `SettingsNotificationsScreen` (sección "Ajustes" de "Más") con estado de permisos (amable: explica antes de pedir, y si están denegados muestra botón "Abrir ajustes" → `Linking.openSettings()`), toggle + selector de hora del recordatorio diario ("No olvides registrar tus gastos de hoy", default 8:00 PM vía `TimePicker`), y toggles para alertas de deudas y metas. Preferencias persistidas en AsyncStorage (`useNotificationSettings`). Todo con `scheduleNotificationAsync` (local, sin push ni servidores). **Alertas de deudas:** una 7 días antes del vencimiento y otra el día del vencimiento; se reprograman al crear/editar (`AddDebt`) y al saldar (`DebtDetail` → se cancelan si queda saldada o se elimina). **Alertas de metas:** 7 días antes de la fecha límite; se reprograman al crear/editar/contribuir y se cancelan al completar/eliminar. Centralizado en `src/services/notifications.ts` (ver "Notificaciones locales").

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

### Fix splash freeze (jun 2026)
- **Agregado** `expo-splash-screen@~31.0` — control explícito: `preventAutoHideAsync()` al cargar el módulo,
  `hideAsync()` en el primer `useEffect` de `App.tsx`.
- **Agregado** `ErrorBoundary` global en `App.tsx` — si un componente crashea, muestra pantalla de error
  en lugar de congelar en la splash.
- **Reducido** timeout de Axios de 15 s → 5 s en `api/client.ts` para fallar rápido si el backend no responde.
- **Logs de diagnóstico:** `console.log('APP MOUNTED')` en `App.tsx`, `console.log('HOME SCREEN RENDERED')` en `HomeScreen.tsx`.

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
