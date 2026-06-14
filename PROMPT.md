Lee PROJECT_CONTEXT.md. Expo SDK 54, pnpm. Español.
El servicio de seguridad ya existe en services/security.ts y el hook
useAppLock.tsx ya maneja el estado del PIN. No cambies la lógica de
PIN/biometría existente, solo agrega el flujo de onboarding.

Flujo obligatorio de configuración de PIN tras el primer login/registro:

1) DETECCIÓN DE PRIMER USO. Después de que el usuario hace login o
   registro exitoso (en useAuth o en LoginScreen/RegisterScreen, donde
   se guarda el token), verifica si ya tiene PIN configurado llamando a
   isPinEnabled() de security.ts. Si NO tiene PIN → navega a una nueva
   pantalla SetupPinScreen en vez de ir al Home.

2) SetupPinScreen (nueva: mobile/src/screens/SetupPinScreen.tsx).
   Flujo en pasos dentro de la misma pantalla (no multi-screen):

   Paso 1 — "Configura tu PIN de 4 dígitos"
   - Muestra PinKeypad + PinDots (componentes existentes).
   - El usuario ingresa 4 dígitos.
   - Al completar, pasa al paso 2.

   Paso 2 — "Confirma tu PIN"
   - Limpia los dots y pide que ingrese el mismo PIN.
   - Si coincide → guarda el PIN con setPin() de security.ts.
   - Si no coincide → muestra error "Los PINs no coinciden. Intenta de
     nuevo." con animación de shake en los dots (si es fácil con Animated,
     si no, solo el mensaje) y vuelve al paso 1.

   Paso 3 — Biometría (opcional)
   - Solo se muestra si isBiometricAvailable() retorna true.
   - Mensaje: "¿Deseas usar tu huella/rostro para desbloquear la app?"
   - Dos botones: "Activar" y "Ahora no".
   - Si "Activar": llama authenticateBiometric() como prueba, si pasa →
     enableBiometric(true) y continúa. Si falla → muestra toast "No se
     pudo verificar. Puedes activarlo después en Seguridad." y continúa.
   - Si "Ahora no": continúa sin activar.

   Paso 4 — Confirmación
   - Mensaje: "¡Listo! Tu app está protegida." con un ícono de check/
     escudo.
   - Botón "Continuar" → navega al Home (replace, no push, para que no
     pueda volver atrás con back).

3) NAVEGACIÓN. Registra SetupPinScreen en el stack de auth (o en el
   stack principal, antes del Home). El flujo es:
   Login/Register → (si no hay PIN) → SetupPinScreen → Home
   Login/Register → (si ya hay PIN) → Home (normal)
   La pantalla NO debe tener botón de back ni gesto de swipe back.
   Usa navigation.reset o navigation.replace para que sea one-way.

4) NO BLOQUEAR EN ESTA SESIÓN. Después de configurar el PIN en el
   onboarding, NO bloquear la app inmediatamente (el usuario acaba de
   autenticarse). El bloqueo aplica la próxima vez que la app vuelva de
   background por más de AUTO_LOCK_MS, como ya funciona.

5) EL USUARIO PUEDE DESACTIVAR DESPUÉS. SecurityScreen ya permite
   deshabilitar el PIN. No cambies eso. El PIN obligatorio es solo en
   el primer login — si el usuario lo desactiva después, es su decisión
   (no volver a forzar el setup).

No toques server/. Al terminar: pnpm typecheck (mobile). Actualiza
PROJECT_CONTEXT.md: sección de seguridad (PIN obligatorio en primer
login, flujo SetupPinScreen con confirmación + biometría opcional,
no re-fuerza si el usuario lo desactiva después).

has un commit detallado y push

Lee PROJECT_CONTEXT.md. Driver neon-http (db.batch atómico, sin
db.transaction). pnpm. Español. COP. Moneda default del usuario:
settingsStore.mainCurrency.

FEATURE COMPLETA: Presupuestos mensuales.

=== BACKEND (server/) ===

1) SCHEMA. Agrega tabla budgets en schema.ts:
   - id: serial PK
   - user_id: FK→users NOT NULL
   - category_id: FK→categories (nullable; null = presupuesto GLOBAL)
   - amount: decimal(15,2) NOT NULL (monto límite mensual)
   - is_active: boolean default true
   - created_at / updated_at: timestamps default now()
   - UNIQUE(user_id, category_id) — un presupuesto por categoría por
     usuario (y un solo global donde category_id IS NULL). Para el
     unique con NULL usa un índice parcial:
     uniqueIndex on (user_id) WHERE category_id IS NULL (global),
     y el unique normal en (user_id, category_id) para los de categoría
     (Postgres trata NULLs como distintos en UNIQUE, así que el índice
     parcial es necesario para el global).

2) RUTAS (server/src/routes/budgets.ts):
   - GET /api/budgets — lista todos los presupuestos del usuario con el
     nombre de la categoría (LEFT JOIN categories). Incluye el gasto
     actual del mes para cada uno: subquery sobre transactions WHERE
     type='expense' AND user_id=? AND date entre primer y último día del
     mes actual (y category_id=budget.category_id si no es global).
     Devuelve: { id, categoryId, categoryName, categoryIcon, categoryColor,
     amount, spent, remaining, percentage, isActive }.
     percentage = (spent / amount) * 100. remaining = amount - spent.
   - GET /api/budgets/summary — resumen: { totalBudgeted, totalSpent,
     totalRemaining, overBudgetCount, onTrackCount }. overBudget =
     presupuestos donde spent > amount.
   - GET /api/budgets/history?months=6 — historial de cumplimiento de
     los últimos N meses (default 6, max 12). Para cada mes y cada
     presupuesto activo: { month: 'YYYY-MM', categoryId, categoryName,
     amount, spent, met: boolean (spent <= amount) }. Agrupado por mes.
     Incluye un campo summary por mes: { month, totalMet, totalBudgets,
     complianceRate }.
   - POST /api/budgets — { categoryId?, amount }. categoryId null =
     global. Valida que amount > 0, que la categoría exista y sea del
     usuario y tipo 'expense'. Si ya existe un presupuesto para esa
     categoría (o global), devuelve 409.
   - PUT /api/budgets/:id — { amount?, isActive? }. Solo el dueño.
   - DELETE /api/budgets/:id — solo el dueño. Hard delete.

   Registra el router en index.ts con authenticate, invalidateOnMutation,
   y cacheResponse(5 * 60) en los GET.

3) MIGRACIÓN. Corre pnpm db:generate. Debe generar una migración aditiva
   (nueva tabla + índices). Muéstrame el SQL.

=== MOBILE (mobile/) ===

4) PANTALLA BudgetsScreen (mobile/src/screens/BudgetsScreen.tsx).
   - Header: "Presupuestos" con botón "+" para agregar.
   - Resumen arriba (tarjeta): total presupuestado, total gastado,
     restante, cantidad de presupuestos excedidos (en rojo).
   - Lista de presupuestos activos, cada uno como card:
     * Nombre de categoría (o "Presupuesto Global") con ícono y color.
     * Barra de progreso horizontal: verde si <80%, amarillo si 80-100%,
       rojo si >100%. Ancho proporcional al porcentaje.
     * Texto: "$spent / $amount" a la izquierda, "X%" a la derecha.
     * Al tocar: navegar a detalle (o abrir modal para editar/eliminar).
   - Si no hay presupuestos: estado vacío con mensaje + botón "Crear
     primer presupuesto".

5) MODAL/PANTALLA AddBudgetScreen o modal dentro de BudgetsScreen.
   - Selector de categoría (CategoryPicker existente, filtrado a
     tipo 'expense') o toggle "Presupuesto global" (sin categoría).
   - Input de monto (usa Calculator/CalculatorSheet existente).
   - Botón guardar. Validación: monto > 0, categoría seleccionada (o
     global). Si 409 → "Ya tienes un presupuesto para esta categoría".

6) HISTORIAL DE CUMPLIMIENTO. Tab o sección dentro de BudgetsScreen
   (o pantalla aparte BudgetHistoryScreen). Muestra los últimos 6 meses:
   - Por mes: barra con "X de Y presupuestos cumplidos" + porcentaje.
   - Expandible para ver el detalle por categoría de ese mes.
   - Colores: verde = cumplido, rojo = excedido.

7) ALERTAS EN HOME. En HomeSummaryCard (o donde se muestre el resumen),
   si algún presupuesto está >80%, mostrar un badge o mini-alerta:
   "⚠️ Comida al 92% del presupuesto". Máximo 2 alertas (las de mayor
   porcentaje). Usa los datos de GET /api/budgets.

8) HOOK useBudgets (mobile/src/hooks/useBudgets.ts). Mismo patrón que
   useDebts/useSavings: fetch, loading, error, refetch. Exponer budgets,
   summary, history.

9) NAVEGACIÓN. Agrega BudgetsScreen al sidebar (Prompt 2 — si no se ha
   corrido aún, agrégala a MoreScreen o donde corresponda en la
   navegación actual). Ícono: "pie-chart" o "wallet" de Ionicons.

No formatees montos manualmente — usa formatCurrency de utils/. Todos
los textos en español. Colores del theme.

Al terminar: pnpm typecheck en server y mobile. pnpm db:generate
(muéstrame la migración). Actualiza PROJECT_CONTEXT.md: nueva tabla
budgets en schema, endpoints en API REST, pantalla + hook en mobile,
mencionar que budgets están cacheados + invalidados.

has un commit detallado y has push

Lee PROJECT_CONTEXT.md. Driver neon-http (db.batch atómico, patrón saga
con safeCompensate). Español. COP. pnpm.

Hoy POST /api/splits/:groupId/settle liquida TODO lo que un miembro debe
a otro. Agrega soporte para liquidación parcial:

=== BACKEND ===

1) MODIFICAR POST /api/splits/:groupId/settle. El body actual es
   { fromMemberId, toMemberId, amount, date?, accountId? }. El campo
   `amount` hoy se ignora o se valida contra el total adeudado. Cámbialo:
   - Si amount < totalDeuda entre from→to: liquidación PARCIAL. Marcar
     shares como settled empezando por los más antiguos, pero solo hasta
     cubrir `amount`. Si un share tiene monto mayor que lo que queda por
     liquidar, NO lo marques como settled (los shares son atómicos: o
     se liquidan completos o no). En su lugar, el remanente (amount -
     suma de shares liquidados completos) se registra como un "abono"
     en el settlement record.
   
   OPCIÓN ALTERNATIVA (más limpia): split del share. Si el amount no
   cubre un share completo, divide ese share en dos: uno settled por
   el monto parcial, otro pendiente por el resto. Esto es más preciso
   pero modifica la tabla split_shares.
   
   Elige la opción que sea más consistente con la arquitectura actual.
   Documenta cuál elegiste y por qué.

   - Si amount >= totalDeuda: liquidación total (comportamiento actual).
   - Si amount <= 0 o amount > totalDeuda: 400.

   - La saga de 2 batches + safeCompensate debe seguir aplicando.
   - El settlement record (split_settlements) debe guardar el amount
     real liquidado (que puede ser < totalDeuda).

2) RESPUESTA. Devuelve { settled: amount, remaining: totalDeuda - amount,
   settledShares: number, totalShares: number } para que el mobile sepa
   cuánto falta.

=== MOBILE ===

3) PANTALLA DE SETTLE. En SplitGroupDetailScreen (o donde se muestre
   el botón de liquidar), cuando el usuario toca "Liquidar":
   - Mostrar el monto total adeudado pre-llenado en el campo de monto.
   - Permitir que el usuario EDITE el monto (reducirlo para pago parcial).
   - Validación: monto > 0 y monto <= totalDeuda.
   - Label claro: "Monto a liquidar" con hint "Total adeudado: $X".
   - Si es parcial, mostrar confirmación: "Liquidación parcial: quedarán
     $Y pendientes. ¿Continuar?"
   - Tras liquidar, mostrar toast con el resultado: "Liquidado $X.
     Pendiente: $Y" o "Deuda liquidada completamente".

4) VISUALIZACIÓN DE BALANCE ACTUALIZADO. Después de una liquidación
   parcial, los balances en GET /api/splits/:groupId/balances deben
   reflejar correctamente lo que queda. Confirma que computeBalances
   ya maneja shares parcialmente settled (si elegiste split de share)
   o que el cálculo por "abono" es consistente.

No agregues dependencias. Al terminar: pnpm typecheck en ambos.
Actualiza PROJECT_CONTEXT.md: sección Splits (liquidación parcial,
explicar la opción elegida, response shape actualizado).

has un commit detallado y has push

Lee PROJECT_CONTEXT.md. Expo SDK 54, pnpm. Español. COP.
No agregues dependencias. No toques server/ (la búsqueda es client-side
sobre endpoints existentes).

Búsqueda global en mobile/:

1) COMPONENTE GlobalSearchBar (mobile/src/components/GlobalSearchBar.tsx).
   - TextInput con ícono de lupa a la izquierda y botón X para limpiar.
   - Debounce de 400ms antes de buscar (implementa con useRef + setTimeout,
     no instales lodash.debounce).
   - Mínimo 2 caracteres para buscar.
   - Estilos del theme (dark/light), bordes redondeados, padding.

2) PANTALLA SearchScreen (mobile/src/screens/SearchScreen.tsx).
   - Se abre al tocar la barra de búsqueda en Home (o un ícono de búsqueda
     en el header).
   - Contiene GlobalSearchBar arriba (autoFocus al abrir).
   - Resultados agrupados por tipo en secciones con headers:
     * "Transacciones" — busca en GET /api/transactions?search=term&limit=5.
       Muestra TransactionCard. Si hay más de 5, link "Ver más" que navega
       a TransactionsScreen con el filtro de búsqueda pre-aplicado.
     * "Cuentas" — filtra client-side sobre las cuentas del usuario
       (GET /api/accounts, ya cacheado). Match por nombre. Muestra
       AccountCard.
     * "Categorías" — filtra client-side sobre GET /api/categories.
       Match por nombre. Muestra nombre + ícono + color.
     * "Metas de ahorro" — filtra client-side sobre GET /api/savings.
       Match por nombre. Muestra SavingsGoalCard.
     * "Deudas" — filtra client-side sobre GET /api/debts. Match por
       nombre o creditor_debtor. Muestra DebtCard.
     * "Etiquetas" — filtra client-side sobre GET /api/tags. Match por
       nombre. Muestra TagChip.
   - Solo mostrar secciones que tengan resultados.
   - Estado vacío: "No se encontraron resultados para 'term'".
   - Estado inicial (sin búsqueda): mostrar "Busca transacciones, cuentas,
     categorías, metas, deudas y etiquetas".

3) LÓGICA DE BÚSQUEDA (mobile/src/hooks/useGlobalSearch.ts).
   - Recibe el término de búsqueda (debounced).
   - Lanza las búsquedas en paralelo (Promise.allSettled):
     * Transacciones: fetch al endpoint con search param (es la única
       que va al servidor).
     * El resto: filtra client-side sobre datos que los hooks existentes
       ya tienen (useAccounts.accounts, useCategories, etc.) o hace un
       fetch ligero si no están cargados.
   - Devuelve: { results: { transactions, accounts, categories, savings,
     debts, tags }, loading, hasResults }.
   - El filtro client-side es case-insensitive y busca con .includes()
     (no regex, no fuzzy — simple y rápido).

4) ACCESO. Agrega un ícono de búsqueda (🔍) en el header de HomeScreen
   (arriba a la derecha, opuesto al botón de menú/sidebar). Al tocarlo,
   navega a SearchScreen. Registra SearchScreen en el stack.

5) RENDIMIENTO. Las búsquedas client-side son sobre arrays pequeños
   (<100 items) así que .filter().includes() es instantáneo. La de
   transacciones tiene el debounce de 400ms para no spamear el servidor.
   Usa AbortController para cancelar el fetch anterior si el usuario
   sigue escribiendo.

Todos los textos en español. Colores del theme.
Al terminar: pnpm typecheck (mobile). Actualiza PROJECT_CONTEXT.md:
nueva pantalla SearchScreen, hook useGlobalSearch, acceso desde Home
header.

has commit detallado y has push


