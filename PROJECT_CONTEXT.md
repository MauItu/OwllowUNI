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
(requiere expo-font ~14.0 — instalado), expo-status-bar ~3.0, react-native-toast-message ^2.2,
expo-linear-gradient ~15.0 (gradientes del sistema de temas dual; bundled en Expo Go SDK 54),
expo-splash-screen ~31.0 (control explícito de splash).
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
- `components/common.tsx` → `Screen` usa `<SafeAreaView edges={['top']}>` (inset superior en cada pantalla).
- `navigation/AppNavigator.tsx` → `CustomTabBar` propio con `useSafeAreaInsets()`:
  `paddingBottom = Math.max(insets.bottom, 12) + 8` (deja libres los botones back/home/recientes).
- `BottomSheet.tsx` también respeta `insets.bottom`.

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
