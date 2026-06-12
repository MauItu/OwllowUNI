# PLAN_NUEVAS_FUNCIONES.md — Plan de implementación (para Opus 4.8)

> **Instrucciones para el agente:** Lee primero `PROJECT_CONTEXT.md` (contexto completo del proyecto)
> y `GUIA_MIGRACIONES_DB.md` (procedimiento obligatorio para cambios de schema SIN perder datos).
> Ejecuta las tareas en el orden de este documento: la Tarea 0 (migración de DB) es prerequisito
> de las Tareas 1 y 3. Al terminar cada tarea: `pnpm typecheck` en `mobile/` debe quedar limpio
> y el backend debe arrancar sin errores. Actualiza `PROJECT_CONTEXT.md` al final con lo nuevo.

## Estado actual relevante (verificado en el código, 2026-06-11)

- `POST /api/debts/:id/pay` (`server/src/routes/debts.ts`) **NO crea transacción ni toca balances de cuentas**:
  solo inserta en `debt_payments` y descuenta `remaining_amount`. El FK `debt_payments.transaction_id` existe pero nunca se usa.
- Los splits (`server/src/routes/splits.ts`) tampoco tocan cuentas: `POST .../expenses` no crea transacción
  (el FK `split_expenses.transaction_id` existe sin usar) y `POST .../settle` solo marca shares como settled.
- `transactions.time` (TIME NOT NULL) **ya existe** en la DB, ya se envía desde `AddTransactionScreen.tsx`
  (estado `time` inicializado con `nowTime()`) y ya se muestra en `TransactionCard.tsx`. Solo falta UI para editarla.
- Íconos disponibles: `ACCOUNT_ICONS` (10) y `CATEGORY_ICONS` (24) en `mobile/src/components/Icon.tsx`.
  Colores: `PALETTE` (12) en `mobile/src/theme/index.ts`. `Icon.tsx` mapea cualquier nombre kebab-case a lucide,
  así que agregar íconos = solo agregar strings a esas listas.
- Safe area: `Screen` (en `components/common.tsx`) solo aplica `edges={['top']}`; `CustomTabBar` y `BottomSheet`
  ya respetan `insets.bottom`. **`AddTransactionScreen` + `Calculator.tsx` NO usan insets** → la calculadora
  queda debajo de la barra de gestos de Android (bug reportado por el usuario).
- Patrón de balances: TODO update de balance va en `db.batch([...])` (Neon HTTP no soporta `db.transaction()`),
  con updates relativos `current_balance + delta`. Copiar el patrón de `server/src/routes/transactions.ts`.

---

## TAREA 0 — Migración de base de datos (prerequisito; seguir GUIA_MIGRACIONES_DB.md)

Cambios de schema en `server/src/db/schema.ts` — **todos aditivos, ninguno destructivo**:

1. `debt_payments`: agregar `account_id` integer FK→accounts, **nullable** (los pagos históricos no tienen cuenta).
2. `split_expenses`: agregar `account_id` integer FK→accounts, **nullable** (cuenta de la que salió el dinero cuando pagué yo).
3. Nueva tabla `split_settlements`:
   `id` serial PK · `group_id` FK→split_groups ON DELETE CASCADE NN · `from_member_id` FK→split_members NN
   · `to_member_id` FK→split_members NN · `amount` decimal(15,2) NN · `date` date NN
   · `account_id` FK→accounts (nullable) · `transaction_id` FK→transactions (nullable)
   · `created_at` timestamp def now().
   (Hoy las liquidaciones no se persisten como entidad; se necesita para vincular la transacción y el historial.)

Procedimiento: editar schema → `pnpm db:generate` → **revisar el SQL generado** (solo `CREATE TABLE` / `ALTER TABLE ... ADD COLUMN`)
→ `pnpm db:migrate`. Ver detalles y verificaciones en `GUIA_MIGRACIONES_DB.md`.

> `transactions.time` ya existe: la Tarea 5 NO requiere migración. Íconos/colores (Tarea 2) tampoco
> (`icon` varchar(50) y `color` varchar(7) aceptan cualquier valor nuevo).

---

## TAREA 1 — Splits conectados a cuentas

**Objetivo del usuario:** al pagar un gasto compartido, escoger de qué cuenta sale el dinero; al recibir
un pago, registrar en qué cuenta se depositó; si alguien pagó por mí, registrar mi pago como gasto
**solo cuando yo confirme la liquidación** (nunca automáticamente al crear el gasto).

### Backend (`server/src/routes/splits.ts`)

1. **`POST /api/splits/:groupId/expenses`** — aceptar `accountId?: number` en el body.
   - Solo válido si `paidByMemberId` es el miembro `is_me`. Si viene de otro pagador, rechazar con 400
     ("Solo puedes asignar cuenta a gastos pagados por ti").
   - Si pagué yo y hay `accountId`: crear en el MISMO `db.batch` una transacción `expense` por el
     `totalAmount` (descripción = la del gasto, fecha = la del gasto, `category_id` el del gasto),
     descontar el balance de la cuenta, y guardar `transaction_id` + `account_id` en `split_expenses`.
   - Al **eliminar** un gasto con `transaction_id`: revertir el balance y borrar la transacción vinculada (en batch).
2. **`POST /api/splits/:groupId/settle`** — aceptar `accountId?: number` y `date?: string` en el body.
   La lógica de marcar shares queda igual; se agrega:
   - Insertar fila en `split_settlements`.
   - Si el miembro `is_me` es `toMemberId` (me pagan) y hay `accountId`: crear transacción `income`
     por `amount` en esa cuenta (descripción "Pago de {nombre del from} — {grupo}") y vincularla.
   - Si el miembro `is_me` es `fromMemberId` (yo pago lo que debían por mí) y hay `accountId`:
     crear transacción `expense` por `amount` desde esa cuenta (descripción "Pago a {nombre del to} — {grupo}").
   - Si ningún lado es `is_me` (liquidación entre terceros): no se crea transacción; `accountId` se ignora.
   - Todo en un solo `db.batch`.
3. `GET /api/splits/:groupId/expenses`: incluir `accountId`/`accountName` del gasto. Agregar
   `GET /api/splits/:groupId/settlements` (historial) o incluir las liquidaciones en el detalle del grupo.

### Mobile

4. **`AddSplitExpenseScreen.tsx`**: cuando el pagador seleccionado es el miembro "Yo", mostrar un chip/selector
   de cuenta (reusar `AccountPicker`). Enviarlo como `accountId`. Si el pagador es otro, ocultarlo.
5. **`SplitGroupDetailScreen.tsx`** — BottomSheet "Liquidar deuda": si la transferencia involucra al miembro
   "Yo" (en cualquier dirección), agregar selector de cuenta **obligatorio antes de confirmar** con label
   contextual: "¿A qué cuenta te depositaron?" (me pagan) / "¿De qué cuenta pagaste?" (pagué yo).
   El botón "Confirmar liquidación" es la confirmación explícita que pidió el usuario — no crear la
   transacción en ningún otro momento.
6. Tipos en `mobile/src/types/index.ts` y endpoints en `mobile/src/api/client.ts` actualizados.
7. Tras liquidar o crear gasto con cuenta, disparar el refresh de cuentas/transacciones del `appStore`
   (mismo trigger que usa AddTransaction) para que Home y Cuentas reflejen el nuevo balance.

---

## TAREA 2 — Más íconos y colores para cuentas y categorías

1. **`mobile/src/components/Icon.tsx`**:
   - Ampliar `ACCOUNT_ICONS` a ~24 (agregar p. ej.: `vault`, `bitcoin`, `circle-dollar-sign`, `hand-coins`,
     `receipt`, `gem`, `trending-up`, `shield`, `lock`, `globe`, `store`, `package`, `badge-dollar-sign`, `nfc`).
   - Ampliar `CATEGORY_ICONS` a ~48 (agregar p. ej.: `pizza`, `beer`, `wine`, `ice-cream-cone`, `apple`,
     `bike`, `train-front`, `parking-meter`, `zap`, `droplets`, `flame`, `music`, `clapperboard`, `ticket`,
     `palette`, `camera`, `scissors`, `sparkles`, `stethoscope`, `glasses`, `school`, `pen-tool`, `laptop`,
     `headphones`, `watch`, `sofa`, `bed`, `trees`, `mountain`, `umbrella`, `cake`, `party-popper`).
   - **Verificar cada nombre contra lucide-react-native ^0.460** (existe `registry[toPascal(name)]`); si un
     ícono no existe en esa versión, sustituirlo — el fallback `CircleHelp` delataría nombres inválidos.
   - Como las listas crecen, convertir la fila de selección de íconos en los formularios (AddAccount,
     Categories, AddDebt, AddSavingsGoal, AddSplitGroup, Tags) en una grilla scrolleable o con altura
     máxima, no una fila infinita.
2. **`mobile/src/theme/index.ts`**: ampliar `PALETTE` de 12 a ~24 colores. Mantener los 12 actuales al
   inicio (hay datos existentes que los usan y `PALETTE[0]` es default de formularios). Agregar tonos que
   funcionen en ambos temas (evitar muy oscuros tipo `#1a1a2e` y muy claros tipo `#FFF3B0`); candidatos:
   `#E63946`, `#F4A261`, `#E76F51`, `#06D6A0`, `#118AB2`, `#073B4C` (no, muy oscuro) → usar `#3D8BFD`,
   `#8338EC`, `#FF6B9D`, `#5E8C61`, `#B5838D`, `#6D9DC5`, `#C77DFF`, `#FF9E40`.
   El selector de color en formularios también pasa a grilla si no cabe.
3. Sin cambios de backend ni DB (validar que ningún endpoint tenga whitelist de íconos/colores — hoy no la hay).

---

## TAREA 3 — Deudas y préstamos con abonos que mueven cuentas

**Objetivo del usuario:** cada abono a una deuda/préstamo registra en qué cuenta entró o salió el dinero,
como si fuera un ingreso/gasto normal; al completarse, la deuda desaparece de la lista activa. Igual para
préstamos que yo pedí.

### Backend (`server/src/routes/debts.ts`)

1. **`POST /api/debts/:id/pay`** — aceptar `accountId?: number`:
   - `type='loan'` (me deben) → el abono que me pagan crea transacción **`income`** en la cuenta elegida.
   - `type='debt'` (yo debo) → el abono que yo pago crea transacción **`expense`** desde la cuenta elegida.
   - Descripción: "Abono {nombre deuda}" (+ `description` si viene). Misma fecha del pago.
   - Guardar `account_id` y `transaction_id` en `debt_payments`. Todo en el `db.batch` existente
     (insert pago + update deuda + insert transacción + update balance).
   - `accountId` opcional para no romper el flujo actual (pago "en efectivo no registrado"), pero el
     mobile lo pedirá por defecto.
2. **`POST /api/debts`** — aceptar `registerInitialTransaction?: boolean` + `accountId`:
   - Si pedí un préstamo (`type='debt'`) el dinero ME LO DEPOSITARON → opcionalmente crear transacción
     `income` por `total_amount` en la cuenta elegida al crear la deuda.
   - Si yo presté (`type='loan'`) el dinero SALIÓ de mi cuenta → opcionalmente transacción `expense`.
   - Vincular esa transacción (puede guardarse como un `debt_payment` especial NO — mejor: solo crear la
     transacción y no tocar `remaining_amount`; dejar `notes` o un campo no es necesario).
3. **Eliminar/revertir**: al borrar un pago o una deuda con pagos vinculados a transacciones, revertir
   balances y borrar las transacciones vinculadas (batch). Si hoy no existe DELETE de pagos individuales,
   no agregarlo (fuera de alcance), pero el DELETE de deuda sí debe limpiar sus transacciones vinculadas.
4. **Completado**: mantener el comportamiento `is_paid_off=true` al llegar a 0 (NO borrar la fila: se
   perdería el historial y las transacciones vinculadas quedarían huérfanas). El "se elimina" que pide el
   usuario se implementa en el cliente: ver punto 7.

### Mobile

5. **`DebtDetailScreen.tsx`** — BottomSheet "Registrar pago": agregar `AccountPicker` con label contextual
   ("¿En qué cuenta te depositaron?" para préstamos / "¿De qué cuenta pagaste?" para deudas) + la fecha.
   Mostrar la cuenta en cada ítem del historial de pagos.
6. **`AddDebtScreen.tsx`**: switch "Registrar el movimiento en una cuenta" (default off) + selector de
   cuenta; texto explicativo según tipo ("El monto se sumará a la cuenta como ingreso" / "se descontará como gasto").
7. **`DebtsScreen.tsx`**: las deudas con `is_paid_off=true` salen de la lista principal (hoy van "activas
   primero"; ahora filtrarlas) y van a una sección colapsada "Historial" con acción de eliminar definitivo.
   Al completarse una deuda desde DebtDetail, toast de éxito y volver a la lista.
8. Refresh de cuentas/transacciones tras cada abono (trigger del `appStore`).

---

## TAREA 4 — Responsive / safe areas (la calculadora tapa la barra de gestos)

**Bug:** `AddTransactionScreen` se abre como modal del root stack (no pasa por `CustomTabBar`, que es
quien hoy absorbe el inset inferior en las tabs) y ni la pantalla ni `Calculator.tsx` usan
`useSafeAreaInsets` → con `edgeToEdgeEnabled:true` la fila inferior de la calculadora queda bajo la barra
de gestos de Android.

1. **`Calculator.tsx`**: `paddingBottom: theme.spacing.md` → `paddingBottom: Math.max(insets.bottom, theme.spacing.md)`
   usando `useSafeAreaInsets()` (o recibir el inset por prop desde la pantalla).
2. **Auditoría completa** de pantallas que se presentan como modal/stack SIN tab bar debajo (revisar
   `AppNavigator.tsx` para la lista exacta): AddTransaction, AddAccount, Categories (form), Templates,
   Tags, AddSavingsGoal, SavingsDetail, AddDebt, DebtDetail, AddSplitGroup, SplitGroupDetail,
   AddSplitExpense, Stats, More… Para cada una verificar que el último elemento interactivo
   (botón guardar, FAB, lista) no quede bajo la barra inferior NI el contenido bajo la status bar.
3. **Solución sistémica, no parches**: extender el componente `Screen` (`components/common.tsx`) con una
   prop `edges` (default `['top']`, las modales usan `['top','bottom']`) o aplicar
   `contentContainerStyle={{ paddingBottom: insets.bottom + spacing }}` en los ScrollView/FlatList de esas
   pantallas. Los botones fijos al fondo (PrimaryButton de formularios) llevan `marginBottom: insets.bottom`.
4. `BottomSheet.tsx` y `CustomTabBar` ya respetan insets — no tocarlos, solo verificar.
5. Verificar también `KeyboardAvoidingView` donde haya inputs + botón al fondo (el teclado no debe tapar el botón).
6. Probar en Expo Go con gestos Y con barra de 3 botones (la altura del inset cambia).

---

## TAREA 5 — Hora editable en gastos e ingresos

La columna `transactions.time` ya existe, ya se envía (`nowTime()`) y ya se muestra en `TransactionCard`.
**Sin migración.** Solo falta poder editarla:

1. **`AddTransactionScreen.tsx`**: junto al chip de fecha, agregar chip de hora (ícono `clock`, label
   `HH:mm`). Al tocarlo, abrir un selector de hora.
2. **Selector**: usar un picker propio en `BottomSheet` (dos columnas scrolleables hora/minuto, estilo
   consistente con el sistema de temas) — el proyecto no tiene `@react-native-community/datetimepicker`;
   si se prefiere el picker nativo, instalarlo con `npx expo install @react-native-community/datetimepicker`
   (está bundled en Expo Go SDK 54, verificar con `npx expo install --check`).
3. Al editar una transacción existente ya se carga `tx.time` — verificar que el chip lo refleje.
4. Verificar que el backend acepte el campo en PUT/POST (ya lo hace: la columna es NN y el cliente ya la envía).
5. Transfers también llevan hora (mismo formulario) — debe funcionar igual.

---

## ORDEN DE EJECUCIÓN Y VERIFICACIÓN

1. Tarea 0 (migración) → verificar con la guía (datos intactos, `SELECT count(*)` antes/después).
2. Tarea 3 (deudas) y Tarea 1 (splits) — comparten el patrón "crear transacción vinculada en batch";
   implementar primero deudas (más simple) y reusar el patrón en splits.
3. Tarea 5 (hora), Tarea 2 (íconos/colores), Tarea 4 (safe areas).
4. Verificación final:
   - `cd mobile && pnpm typecheck` limpio.
   - Backend: probar con curl los flujos nuevos (abono con cuenta → balance de la cuenta cambia y aparece
     la transacción; eliminar deuda → transacciones vinculadas revertidas; settle de split con cuenta).
   - Confirmar que crear/editar/borrar transacciones normales sigue cuadrando balances (regresión).
   - Actualizar `PROJECT_CONTEXT.md`: schema, endpoints nuevos/modificados, features.

## REGLAS QUE NO SE NEGOCIAN

- Drizzle + Neon HTTP: **`db.batch()`**, nunca `db.transaction()`. Updates de balance relativos (`+ delta`).
- Tema: patrón `createStyles(theme)` + `useThemedStyles` — nada de `StyleSheet.create` a nivel de módulo con colores.
- Tokens semánticos del tema (`income`/`expense`/`transfer`; `primaryLight`/`accentLight` para texto).
- Expo SDK 54, pnpm, `NODE_OPTIONS="--no-experimental-strip-types"`. No agregar dependencias salvo
  (opcional) `@react-native-community/datetimepicker` vía `npx expo install`.
- Toda la UI en español.
- **Cero pérdida de datos**: cualquier cambio de DB sigue `GUIA_MIGRACIONES_DB.md`.
