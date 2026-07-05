# AUDIT_REPORT.md — Wallet Clone

> Auditoría de arquitectura, seguridad, rendimiento, indexing, caching y async.
> **Etapa: IMPLEMENTACIÓN COMPLETADA.** Grupos G1–G6 aplicados en commits lógicos
> (rama `APK`). Baselines verdes tras los cambios. Estado final por hallazgo en §11.
> Fecha: 2026-06-13.
>
> **Nota de vigencia:** reporte histórico de la fase `APK`. El código actual endureció más el sistema:
> CORS sin `CORS_ORIGINS` en producción niega orígenes web, `JWT_EXPIRATION` default es `7d`, existe
> revocación por `token_version`, recuperación de contraseña por email, legales, export/delete de cuenta,
> CI y tests. Para estado operativo actual, ver `PROJECT_CONTEXT.md`, `RUNBOOK.md` y `DEPLOY_AND_APK.md`.

---

## 0. Resumen ejecutivo

El backend está **bien construido**: capas limpias (routes/services/db), validación zod en todos
los bordes, queries 100% parametrizadas vía Drizzle, reglas de balance atómicas con `db.batch`,
y multi-usuario con JWT + `user_id` correctamente aplicado en **todas** las queries. No hay
inyección SQL, no hay lógica de negocio fuera de su sitio, y los `any` se limitan a un cast
conocido y comentado de `db.batch` (limitación de tipos de drizzle-neon-http).

**No hay ningún problema de rendimiento medible hoy** (la base tiene 9 transacciones; los planes
son `Seq Scan` sub-milisegundo y eso es óptimo a este volumen). Por tanto, gran parte del trabajo
propuesto es **preventivo** (índices) o de **higiene** (un N+1, caché). Varias de las sospechas del
brief se **descartan con evidencia** (ver §6).

Hallazgo transversal nº 1: **`PROJECT_CONTEXT.md` está desactualizado** — describe la API como
"sin auth ni columna de usuario", pero el sistema multi-usuario (JWT + `users` + `user_id`) ya está
implementado y en uso. El propio brief parte de esa premisa obsoleta.

### Baseline verde (referencia a no romper)

| Check | Resultado |
|---|---|
| `server` → `tsc --noEmit` | ✅ exit 0 |
| `mobile` → `tsc --noEmit` | ✅ exit 0 |
| `mobile` → `npx expo-doctor` | ✅ 18/18 |

### Tabla de hallazgos por severidad

| # | Severidad | Área | Hallazgo | Ubicación |
|---|---|---|---|---|
| H1 | Alto (preventivo) | Indexing | Cero índices secundarios; FKs y columnas de filtro sin indexar | `db/schema.ts`, `pg_indexes` |
| H2 | Medio | Rendimiento | N+1 en `GET /api/splits` y `/summary` (computeBalances por grupo) | `routes/splits.ts:188,213` |
| H3 | Medio | Seguridad | `errorHandler` devuelve `err.message` crudo en 500 (info leak) | `middleware/errorHandler.ts:37` |
| H4 | Medio | Seguridad | CORS abierto a cualquier origen | `index.ts:21` |
| H5 | Medio | Arquitectura | `POST /splits/:id/settle` hace varios writes no atómicos sin compensación | `routes/splits.ts:587-699` |
| H6 | Medio | Doc | `PROJECT_CONTEXT.md` no documenta auth/multiusuario ni nuevas deps | `PROJECT_CONTEXT.md` |
| H7 | Bajo | Seguridad | IDOR: `tagIds` no se valida contra los tags del usuario | `routes/transactions.ts:501,572` |
| H8 | Bajo | Rendimiento | Import hace 1 round-trip HTTP por fila (batch secuencial en loop) | `routes/transactions.ts:441` |
| H9 | Bajo | Arquitectura | Insert de `transactionTags` fuera del batch de creación (no atómico) | `routes/transactions.ts:501` |
| H10 | Bajo | DevOps | `.gitignore` ignora `server/drizzle/meta/` (journal de migraciones) | `.gitignore` |
| H11 | Bajo/Info | Seguridad | Fallback `API_BASE_URL` en HTTP plano (solo dev); PIN con SHA-256 rápido | `api/client.ts:60`, `security.ts:76` |

---

## 1. Lo que YA está bien hecho (no se toca, con evidencia)

- **Reglas de balance atómicas.** `balanceStatements()` genera los `UPDATE` con expresión SQL
  (`current_balance + delta::numeric`, sin read-modify-write) y se ejecutan junto al insert/update
  en un solo `db.batch([...])`. POST/PUT/DELETE revierten y reaplican correctamente
  (`routes/transactions.ts:106-148, 464-612`). **Esto descarta la sospecha del brief** de que los
  recálculos de balance fueran un cuello de botella o una fuente de inconsistencia.
- **Atomicidad dentro de las limitaciones de Neon-HTTP.** El driver `neon-http` no soporta
  transacciones interactivas; el código usa `db.batch` (transacción de una sola petición HTTP) y,
  donde hay pasos que no caben en un batch (gasto de split, abono de deuda), implementa
  **compensación explícita** en `catch` (`splits.ts:548-560`, `debts.ts:386-398`). Correcto.
- **Multi-usuario / autorización.** `authenticate` protege todas las rutas `/api/*`; **toda** query
  filtra por `user_id` y las mutaciones verifican propiedad de cuentas/grupos
  (`assertAccountsOwned`, `getOwnedGroup`, `assertAccountOwned`). bcrypt 12 rounds, errores de login
  genéricos, verificación de contraseña actual al cambiarla (`routes/auth.ts`). JWT y PIN en
  `expo-secure-store` (nunca AsyncStorage).
- **Sin inyección SQL.** Todo va por Drizzle parametrizado. El único `sql.raw` está saneado contra
  whitelist `'day'|'week'|'month'` (`stats.ts:138-142`); el filtro por tag usa binding de parámetros
  (`transactions.ts:183`).
- **Servicio de tasas.** Caché 24h en DB, manuales que nunca se sobreescriben, `fetch` con timeout
  8s y fallback `stale` (`services/exchangeRates.ts`). Es el patrón de referencia para la caché.
- **Agregaciones en SQL, no en JS.** insights/stats agrupan y suman en Postgres; la conversión de
  moneda y el ensamblado final son O(filas) en memoria. insights lanza sus 7 queries en `Promise.all`.
- **Sin N+1 en transacciones.** Los tags de la lista se traen con una sola query `inArray`
  (`transactions.ts:81-100`), no por fila.
- **Compresión de imágenes ya fuera del hilo JS.** `receiptStorage.ts` usa la API nativa async de
  `expo-image-manipulator` (`renderAsync`/`saveAsync`). **Descarta la sospecha** de bloqueo de UI.
- **Validación zod completa** en todos los POST/PUT, con coerción y límites de longitud.

---

## 2. Arquitectura

**Veredicto: sólida.** Separación routes → services → db correcta; nada de negocio fuera de sitio.

- **H5 (Medio) — `settle` no atómico.** En `POST /splits/:groupId/settle` se ejecutan en secuencia y
  por separado: `UPDATE split_shares`, posible `INSERT` de gasto "Liquidación" + su share, el
  `db.batch` de la transacción de cuenta, y el `INSERT split_settlements`
  (`splits.ts:630-695`). Un fallo a mitad deja estado parcial y, a diferencia de `addExpense`/`pay`,
  **no hay compensación**. Mitigación: agrupar lo agrupable en un `db.batch` y/o añadir compensación.
- **H9 (Bajo) — tags fuera del batch de creación.** En `POST /transactions` el insert de
  `transactionTags` ocurre en un `await` posterior al `db.batch` (`transactions.ts:501-505`); si
  falla, la transacción queda sin tags. Bajo impacto (etiquetas informativas).

> Nota: los writes "no atómicos" residuales son inherentes a `neon-http`. No se propone introducir
> otro driver; se propone agrupar en `db.batch` lo que quepa y compensar lo que no.

---

## 3. Estructura y buenas prácticas

**Veredicto: bien.** Tipado fuerte, sin `any` en lógica de negocio.

- Los `db.batch([...] as any)` son un cast conocido por una limitación de tipos de drizzle-neon-http
  con arrays heterogéneos; están comentados y contenidos. **No se considera deuda accionable** (un
  helper tipado sería cosmético; sin beneficio medible → no se toca, salvo que se prefiera limpieza).
- `userId(req)` se invoca 2-3 veces por handler en stats/accounts; trivial, sin impacto.
- Manejo de errores consistente vía `asyncHandler` + `ApiError` + `errorHandler`.

---

## 4. Seguridad

- **H3 (Medio) — info leak en 500.** `errorHandler` hace `res.status(500).json({ error: err.message })`
  (`errorHandler.ts:37`): expone mensajes internos (p. ej. errores de Postgres) al cliente.
  Mitigación: loguear el detalle en servidor y responder un mensaje genérico en 500.
- **H4 (Medio) — CORS abierto.** `app.use(cors())` permite cualquier origen (`index.ts:21`). Riesgo
  práctico **bajo** hoy (API solo para el móvil, auth por Bearer, sin cookies), pero conviene una
  allowlist por `EXPO_PUBLIC_API_URL`/origen del cliente si algún día hay front web. Mitigación
  proporcional: configurar `cors({ origin: [...] })` desde env, default permisivo en dev.
- **H7 (Bajo) — IDOR en `tagIds`.** POST/PUT `/transactions` insertan en `transaction_tags` los
  `tagIds` del cliente sin verificar que esos tags pertenezcan al usuario
  (`transactions.ts:501,572`). Un usuario podría referenciar el id de tag de otro. Impacto bajo
  (los tags son etiquetas), pero es referencia cruzada entre inquilinos. Mitigación: filtrar
  `tagIds` ⊆ tags del usuario antes de insertar.
- **H11 (Bajo/Info):**
  - `API_BASE_URL` cae a `http://192.168.0.12:3000/api` (texto plano) solo en **dev**; en producción
    usa `EXPO_PUBLIC_API_URL` (debe ser **HTTPS** en Render para que el Bearer no viaje en claro).
  - El PIN se guarda como `SHA-256(salt:pin)`; SHA-256 es rápido y el espacio de un PIN de 4 dígitos
    es 10⁴. Dado que vive en SecureStore (respaldo por hardware), hay lockout (5 intentos/30s) y el
    secreto real es el JWT (almacenado aparte), el modelo de amenaza es **proporcional**. No se
    recomienda cambiar (PBKDF2/scrypt aportaría poco aquí).
- **Bien en esa fase:** `JWT_SECRET` era obligatorio al arrancar (lanza si falta); `.env` git-ignored.
  Estado actual: tokens default `7d` y revocacion por `token_version`.

---

## 5. Indexing y queries (Fase 2)

### Evidencia
`pg_indexes` (DB real) muestra **solo PKs y UNIQUEs**; ningún índice secundario. Postgres **no**
indexa columnas FK automáticamente. Volumen actual: 2 usuarios, 9 transacciones, 70 categorías.

`EXPLAIN (ANALYZE)` sobre la query caliente de `GET /api/transactions`:
```
Seq Scan on transactions t  (cost=0.00..1.09 rows=1) (actual time=1.440..1.444 rows=9)
```
→ **A 9 filas, el Seq Scan es óptimo y sub-ms; no hay problema que medir hoy.** La propuesta es
**preventiva**: cuando las transacciones de un usuario crezcan a miles, los filtros por
`user_id` + rango de fechas y los joins por FK degradan a seq scan completo.

### Índices que YA cubren las UNIQUE (no se duplican)
`tags(user_id,name)`, `split_members(group_id,name)`, `split_shares(expense_id,member_id)`,
`transaction_tags(transaction_id,tag_id)`, `exchange_rates(user_id,base,target)` → su columna líder
ya sirve para lookups por `user_id`/`group_id`/`expense_id`/`transaction_id`/`(user_id,base)`.

### Índices propuestos (vía migración Drizzle; justificados por patrón de acceso real)

| Tabla | Índice | Justifica |
|---|---|---|
| transactions | `(user_id, date DESC, id DESC)` | Lista paginada + casi todas las queries de stats/insights filtran user_id + rango y ordenan por date |
| transactions | `(user_id, type, date)` | stats by-category/summary/timeline e insights filtran también por `type` |
| transactions | `(account_id)`, `(to_account_id)`, `(category_id)` | Joins, filtros e integridad referencial |
| transaction_tags | `(tag_id)` | Filtro `EXISTS` por tag y conteo en `GET /tags` (la unique cubre transaction_id, no tag_id) |
| categories | `(user_id)`, `(parent_id)` | Listado por usuario y anidado padre/hijo, CASCADE |
| accounts | `(user_id)` | Toda query de cuentas filtra user_id |
| templates / debts / savings_goals / split_groups | `(user_id)` | Listados por usuario |
| split_expenses | `(group_id)` | expenses list, balances, settle |
| split_settlements | `(group_id)` | historial de liquidaciones |
| debt_payments | `(debt_id)` | `GET /debts/:id`, borrado |
| savings_contributions | `(goal_id)` | `GET /savings/:id` |

> Todos como `index()` en `schema.ts` + `pnpm db:generate` / `db:migrate`. Cero a mano en DB.

### Otros
- **H2 (Medio) — N+1 en splits.** `GET /splits` y `/summary` recorren los grupos y llaman
  `computeBalances(g.id)` (2 queries por grupo, en serie) → `1 + 2G` round-trips. Refactor: **una**
  query agregada de `split_shares ⋈ split_expenses` para todos los grupos del usuario + una de
  miembros, y armar balances en memoria.
- **H8 (Bajo) — import secuencial.** `POST /transactions/import` hace `await db.batch(...)` por fila
  (`transactions.ts:441`). Para imports grandes son N peticiones HTTP a Neon. Mejora: acumular
  statements y ejecutar en menos batches. Baja prioridad (operación poco frecuente y acotada).
- **Sin SELECT \* problemáticos, sin paginación sin LIMIT** (la lista tiene `limit` clamp 1..100).

---

## 6. Sospechas del brief — confirmadas / descartadas (con datos)

| Sospecha | Veredicto | Evidencia |
|---|---|---|
| Agregaciones `/api/insights` | Descartada como lenta hoy | 7 queries en `Promise.all`, sub-ms a este volumen; **candidata a caché** |
| `/api/stats/*` | Descartada como lenta hoy | Agregación en SQL; **candidata a caché** + índices |
| `/api/accounts/summary` | Descartada | Agrega sobre `accounts` (8 filas) + tasas cacheadas |
| Recálculo de balance POST/PUT/DELETE tx | Descartada | Atómico vía `db.batch`, expresión SQL, bien hecho |
| Refresco de tasas | Descartada | Ya cacheado 24h + timeout + stale |
| Compresión de imágenes (mobile) | Descartada | Ya async/nativo, no bloquea UI |
| Import/Export CSV (mobile) | Parcial | Parser O(n) sync acotado (ok); el coste real está en el **import del server (H8)** |
| Splits summaries (`children/members/...`) | **Confirmada (H2)** | N+1 en `/splits` y `/summary` |

---

## 7. Estrategia de caching (Fase 3) — por capas, en proceso (sin Redis)

Backend = **un solo proceso Express** de larga vida → caché **en memoria del proceso** + invalidación
explícita. Patrón de estilo: el cache 24h de `exchange_rates`. Mecanismo propuesto: un módulo
`cache.ts` con `Map` + TTL, y un **sello de versión por usuario** (`dataVersion[uid]`) que se
incrementa en cada mutación; las claves de caché incluyen ese sello → invalidación O(1) sin recorrer.

| Capa | Qué se cachea | Clave | TTL | Invalida exactamente |
|---|---|---|---|---|
| (a) DB | — | — | — | Índices de §5 |
| (b) proceso | `GET /insights` | `insights:{uid}:{yyyy-MM}:{ver}` | 10 min | cualquier mutación de transactions del uid (POST/PUT/DELETE, import) |
| (b) proceso | `GET /stats/*` | `stats:{uid}:{ruta}:{from}:{to}:{group}:{display}:{ver}` | 5 min | mutación de transactions o accounts del uid |
| (b) proceso | `GET /accounts/summary` | `accsum:{uid}:{display}:{ver}` | 5 min | cualquier cambio de balance del uid (tx, abonos, splits, etc.) |
| (b) proceso | conversion map de tasas | `rates:{uid}:{display}:{currencies}` | 5 min | `PUT/DELETE /rates/manual` del uid |
| (c) HTTP | insights/stats/accsum | `ETag` = hash(`ver`+payload) | `private` | revalida con ETag |
| (d) cliente | — | — | — | Mantener `triggerRefresh()` de Zustand existente; **no** añadir React Query |

> Regla de oro respetada: cada caché tiene invalidación definida. El sello `ver` por usuario hace que
> "qué invalida qué" sea trivial y a prueba de olvidos (toda mutación bumpea la versión del usuario).

---

## 8. Funciones pesadas → asíncrono (Fase 4)

**Conclusión honesta: hoy NO hay ninguna función lo bastante pesada como para justificar moverla a
background.** Todas las queries son sub-ms al volumen actual y "no hacer nada" es el resultado
correcto aquí. Las dos ineficiencias reales **no son "pesadas" sino "chatty"** y se resuelven sin
async:
1. **N+1 de splits (H2)** → refactor de query.
2. **Import secuencial (H8)** → menos batches.

**Mecanismo recomendado si el volumen crece (NO ahora):** dada la naturaleza serverless-HTTP de Neon
y el proceso único de Express, la vía correcta es **precomputar/memoizar en lectura** (la capa de
caché §7), **no** un job en background ni cola durable (no hay broker, y un `p-queue` en proceso no
sobrevive a reinicios). **No se introduce Redis/BullMQ/workers.**

**Mobile:** la compresión de imágenes ya es async/nativa; el parseo CSV es sync pero acotado (si
algún día se importan archivos muy grandes, envolver en `InteractionManager.runAfterInteractions`).
No se rompe ningún flujo fire-and-forget de notificaciones.

---

## 9. Discrepancias doc ↔ realidad (a corregir en PROJECT_CONTEXT.md)

- Multi-usuario con **JWT + tabla `users` + `user_id`** en todas las tablas padre: **no documentado**
  (el contexto dice "sin auth ni columna de usuario"). Existen `routes/auth.ts`, `middleware/auth.ts`,
  `db/defaults.ts`, migración `0008`, `LoginScreen`/`RegisterScreen`/`useAuth`/`services/auth` en mobile.
- Nuevas deps server no listadas en STACK: `bcryptjs`, `jsonwebtoken` (+ `@types/*`). `.env` ahora
  requiere `JWT_SECRET`.
- `exchange_rates` ahora tiene `user_id` y `UNIQUE(user_id, base, target)` (doc dice `UNIQUE(base,target)`).
- Nueva dep mobile no listada: `react-native-keyboard-controller@1.18.5` (pasa expo-doctor 18/18).
- **H10:** `.gitignore` ignora `server/drizzle/meta/` (journal de drizzle-kit). Esto puede romper el
  tracking de migraciones en un checkout limpio. Revisar si debe versionarse.

---

## 10. Plan de implementación propuesto (pendiente de tu aprobación)

Ordenado por impacto/riesgo. Tras cada grupo: `tsc` (server+mobile) + `expo-doctor` y verificación
de que los contratos REST no cambian. Ninguno es **breaking** salvo donde se indica.

- **G1 — Índices (Fase 2).** `index()` en `schema.ts` + `db:generate`/`db:migrate`. Riesgo bajo,
  no-breaking. Es el cambio de mayor valor preventivo.
- **G2 — N+1 splits (H2).** Refactor de `GET /splits` y `/summary` a queries agregadas. No-breaking
  (mismo shape de respuesta).
- **G3 — Caché en proceso + invalidación (Fase 3).** Módulo `cache.ts` + sello de versión por
  usuario; cachear insights/stats/accounts-summary/tasas. No-breaking. (ETag/Cache-Control opcional.)
- **G4 — Seguridad proporcional.** H3 (mensaje genérico en 500 + log), H4 (CORS por env), H7 (validar
  `tagIds`). No-breaking (H3 cambia el *texto* del error 500, no el shape).
- **G5 — Atomicidad/limpieza.** H9 (tags dentro del batch en POST tx), H5 (agrupar/compensar settle),
  H8 (import en menos batches). No-breaking.
- **G6 — Documentación.** Actualizar `PROJECT_CONTEXT.md` (auth, deps, índices, caché) y decidir H10.

> Cualquier hallazgo marcado "Bien" se deja **igual a propósito**.

---

## 11. Estado final de cada hallazgo

| # | Hallazgo | Estado | Commit / nota |
|---|---|---|---|
| H1 | Índices secundarios | ✅ Resuelto | G1 — migración `0009` aplicada y verificada (Index Scan en uso) |
| H2 | N+1 splits | ✅ Resuelto | G2 — `computeBalancesForGroups` (3 queries) |
| H3 | Info leak en 500 | ✅ Resuelto | G4 — mensaje genérico + log servidor |
| H4 | CORS abierto | ✅ Resuelto | G4 — allowlist por `CORS_ORIGINS` (default dev permisivo) |
| H5 | `settle` no atómico | 🟡 Parcial | G5 — compensación de la transacción de cuenta añadida; los updates de shares/expense remanente siguen fuera de una sola tx (cadena de ids seriales en neon-http) |
| H6 | Doc desactualizada | ✅ Resuelto | G6 — `PROJECT_CONTEXT.md` actualizado (auth, deps, índices, caché, CORS) |
| H7 | IDOR en `tagIds` | ✅ Resuelto | G4 — `assertTagsOwned` en POST/PUT |
| H8 | Import secuencial | ✅ Resuelto | G5 — batches de 50 filas |
| H9 | Tags fuera del batch | 🟡 Mitigado | G5 — modo de fallo eliminado (validación G4 + dedupe); estructuralmente fuera del batch por id serial (documentado) |
| H10 | `drizzle/meta/` git-ignored | ✅ Resuelto | G6 — journal versionado |
| H11 | HTTP fallback / PIN SHA-256 | ⚪ No accionable | Informativo; sin cambio por modelo de amenaza (ver §4) |

### Verificación final (post-implementación)

| Check | Resultado |
|---|---|
| `server` → `tsc --noEmit` | ✅ exit 0 |
| `mobile` → `tsc --noEmit` | ✅ exit 0 (mobile no se tocó) |
| `mobile` → `npx expo-doctor` | ✅ 18/18 |
| Índices en DB (`pg_indexes`) | ✅ 17 índices creados |
| Caché: hit/miss + invalidación + bypass `refresh` | ✅ verificado (test aislado) |
| Contratos REST | ✅ sin cambios (solo el *texto* del error 500) |
