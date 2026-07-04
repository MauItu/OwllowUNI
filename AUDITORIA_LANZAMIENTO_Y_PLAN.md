# Auditoria de lanzamiento y plan de implementacion

> Auditoría integral ejecutada el **2026-07-04** sobre la rama `Corections-Senior` (HEAD `f0cac61`).
> Generada según `PROMPT_AUDITORIA_LANZAMIENTO.md`. Sin cambios de código.

## Resumen ejecutivo

El proyecto está **técnicamente maduro para su tamaño**: backend Express + Drizzle con validación Zod en todas las rutas, aislamiento multiusuario consistente (`user_id` + guardas de propiedad centralizadas en `utils/ownership.ts`), atomicidad vía `db.batch` + patrón saga con compensación tolerante a fallos (`safeCompensate`), guards anti-TOCTOU en SQL, rate limiting por capas, Helmet, CORS cerrado en prod, validación de entorno al arrancar y un motor de pagos recurrentes idempotente. Ambos `pnpm typecheck` pasan limpios. Producción en Render ya sirve el código con auth (verificado: `GET /api/accounts` sin token → 401; `/api/health` → 200).

Los bloqueos de lanzamiento **no son de arquitectura sino de producto y proceso**:

1. **La recuperación de contraseña está deshabilitada** (los 3 endpoints devuelven 503; el link en `LoginScreen` está comentado). Un usuario que olvide su contraseña **pierde acceso permanente a sus datos financieros**. Bloqueante para cualquier beta externa.
2. **No existe eliminación de cuenta ni exportación completa de datos del usuario** (solo export de transacciones). Google Play lo exige para apps con cuentas; la Ley 1581/2012 (habeas data, Colombia) también.
3. **No hay política de privacidad ni términos** en el repo ni en la app.
4. **El perfil `production` de `eas.json` no define `EXPO_PUBLIC_API_URL`**: un app-bundle de producción caería al fallback `http://192.168.0.12:3000/api` (IP LAN de desarrollo) y la app saldría rota a la tienda.
5. **Cero tests automatizados y cero CI**: el motor financiero (sagas, FIFO de tarjetas, amortización francesa, recurrencia, splits) no tiene red de seguridad ante regresiones.
6. **Sin monitoreo de errores** (ni Sentry ni equivalente) en server ni mobile: en producción los crashes del APK son invisibles.

## Veredicto de lanzamiento

- **Estado: Listo para beta cerrada CON CONDICIONES · No listo para producción.**
- **Justificación:** la base técnica es sólida (consistencia financiera bien resuelta, seguridad backend endurecida tras la auditoría de junio), pero faltan piezas que exponen a usuarios reales: sin recuperación de cuenta, sin borrado de cuenta, sin política de privacidad, sin tests del núcleo financiero y sin visibilidad de errores en campo. La beta cerrada actual (alpha testers conocidos, con contacto directo con el desarrollador) es viable si se aceptan esos riesgos conscientemente.
- **Condiciones mínimas para beta cerrada ampliada (P0):** reactivar recuperación de contraseña; verificación de que la migración 0021 está aplicada en la DB de producción; arreglar credenciales del `.env` local; monitoreo básico de errores.
- **Condiciones mínimas para producción (P1):** eliminación de cuenta + export de datos; política de privacidad y términos publicados; `EXPO_PUBLIC_API_URL` en el perfil `production` de EAS; suite mínima de tests del motor financiero + CI; expiración de sesión más corta o revocación de tokens.

## Alcance revisado

**Archivos y áreas revisadas:**
- Documentación: `PROJECT_CONTEXT.md` (1.581 líneas, completo), `README.md`, `AUDIT_REPORT.md` (auditoría previa 2026-06-13), `DEPLOY_AND_APK.md`, `CLAUDE.md`.
- Backend: `server/package.json`, `src/index.ts`, `middleware/{auth,errorHandler,rateLimiter}.ts`, `utils/validateEnv.ts`, `routes/{auth,password-reset}.ts` completos; estructura de `routes/`, `services/`, `utils/`; `db/seed.ts` (manejo de `ADMIN_PASSWORD`); las 22 migraciones en `drizzle/` + `meta/_journal.json`; `db/schema.ts` (grep dirigido de `user_id`, uniques).
- Mobile: `mobile/package.json`, `src/api/client.ts`, `src/navigation/AppNavigator.tsx` (cabecera), `app.json`, `eas.json`; greps de accesibilidad y crash reporting sobre todo `src/`.
- Estado del repo: ramas (15+ locales), distancia `main`↔`Corections-Senior` (4 commits), API de producción en Render (checks HTTP de solo lectura).

**Comandos ejecutados:**
- `cd server && pnpm typecheck` → ✅ exit 0.
- `cd mobile && pnpm typecheck` → ✅ exit 0.
- `curl https://wallet-7v82.onrender.com/api/health` → 200; `/api/accounts` sin token → 401 (prod sirve el código con auth, a diferencia de lo que documenta `DEPLOY_AND_APK.md` §"Diagnóstico actual", que quedó obsoleto).
- Consulta read-only a la DB (pg_constraint para `accounts_balance_nonnegative`) → **falló**: `password authentication failed for user 'neondb_owner'` (ver hallazgo H3).

**Comandos que no se pudieron ejecutar y por qué:**
- Verificación en la DB de producción de la migración 0021: las credenciales del `.env` local son rechazadas por Neon (probablemente rotadas). El `/api/health` de Render sí conecta, así que Render tiene credenciales válidas propias.
- Tests: no existen (ningún script `test`, ningún `*.test.ts`/`*.spec.ts` en el repo).
- `expo-doctor` / build de APK: no se corrieron (fuera de alcance de una auditoría de solo lectura; el `PROJECT_CONTEXT.md` reporta 18/18 en junio).

**Supuestos:**
- La DB de producción corresponde al journal local (22 migraciones, 0000→0021). **No confirmado** por el fallo de credenciales.
- Render corre **una sola instancia** (los locks/caché/rate-limit en memoria lo asumen; está documentado en el código).
- El mercado objetivo inicial es Colombia (COP, español), relevante para el marco legal (Ley 1581/2012).

## Hallazgos criticos

| ID | Severidad | Area | Hallazgo | Evidencia | Impacto | Recomendacion |
|----|-----------|------|----------|-----------|---------|---------------|
| H1 | **Crítica** | Producto/Seguridad | Recuperación de contraseña deshabilitada: los 3 endpoints devuelven 503 con `return` temprano; link comentado en `LoginScreen` | `server/src/routes/password-reset.ts:50,99,129` | Usuario que olvida su contraseña pierde acceso permanente a sus datos financieros; sin vía de recuperación | Configurar `GMAIL_USER`/`GMAIL_APP_PASSWORD` en Render, quitar los 3 `return`, descomentar el link. El código está completo y bien hecho (anti-enumeración, CSPRNG, un solo uso, TTL 15 min) |
| H2 | **Crítica** | Release/Mobile | Perfil `production` de `eas.json` sin `EXPO_PUBLIC_API_URL` → el app-bundle de producción usaría el fallback `http://192.168.0.12:3000/api` (IP LAN) | `mobile/eas.json` (solo `preview` define el env) + `mobile/src/api/client.ts:76` | Cualquier build de producción sale apuntando a una IP privada: app 100% rota en tienda | Copiar el bloque `env` al perfil `production` (y considerar fallar el build si falta la var) |
| H3 | **Alta** | DevOps/Datos | No se pudo verificar que la migración 0021 (`CHECK accounts_balance_nonnegative`) esté aplicada en producción; las credenciales del `.env` local son rechazadas por Neon | Query a `pg_constraint` → `password authentication failed`; `drizzle/0021_balance_nonnegative_guard.sql` existe y está en `meta/_journal.json` | Si 0021 no está aplicada, el guard anti-saldo-negativo a nivel DB no existe en prod; además el flujo de migraciones (se corren desde local) está roto | Actualizar `DATABASE_URL` local, correr `pnpm db:migrate`, verificar `pg_constraint` y luego `VALIDATE CONSTRAINT` tras revisar saldos históricos |
| H4 | **Alta** | Legal/Producto | Sin eliminación de cuenta ni exportación completa de datos del usuario | `server/src/routes/auth.ts` no tiene DELETE; solo existe `GET /api/transactions/export` (no cubre cuentas/deudas/ahorros/splits) | Incumple requisito de Google Play (account deletion) y habeas data (Ley 1581/2012); bloquea publicación en tienda | Endpoint `DELETE /api/auth/account` (borrado en cascada de todos los datos del usuario) + export completo + UI en Sidebar/Seguridad |
| H5 | **Alta** | Legal/Producto | Sin política de privacidad, términos de servicio ni consentimiento de datos financieros | No existen en el repo ni pantallas en `mobile/src/screens/` | Google Play exige URL de política de privacidad; datos financieros son datos sensibles | Redactar y publicar política + términos; checkbox de aceptación en registro; pantalla "Acerca de/Legal" en Más |
| H6 | **Alta** | QA | Cero tests automatizados en todo el monorepo | Sin script `test` en ambos `package.json`; `find` de `*.test.ts` vacío | El motor financiero (sagas de `splits.ts` 1.081 líneas, FIFO `creditCardDebt.ts`, `installments.ts`, `recurrence.ts`, `balance.ts`) puede regresionar sin detección | Suite mínima con vitest sobre los utils puros + tests de integración de los endpoints financieros (ver "Testing y QA") |
| H7 | **Alta** | Observabilidad | Sin monitoreo de errores en producción (server ni mobile) | grep `Sentry\|sentry\|crashlytics` → 0 resultados; el server solo hace `console.error`; el mobile solo `ErrorBoundary` local | Los crashes del APK en dispositivos reales y las "COMPENSACIÓN FALLIDA" (que exigen reconciliación manual) son invisibles | Sentry (`@sentry/node` + `sentry-expo`) o al menos alerta sobre los logs de Render para el patrón "COMPENSACIÓN FALLIDA" |
| H8 | **Alta** | Seguridad | JWT con expiración default 30 días, sin refresh tokens ni revocación; cambiar contraseña no invalida sesiones activas | `utils/validateEnv.ts` (`JWT_EXPIRATION` default `'30d'`), `middleware/auth.ts` (verificación stateless), `routes/auth.ts` PUT /profile no revoca | Token robado (dispositivo perdido/compartido) vale un mes; sin forma de cerrar sesiones remotas | Corto plazo: bajar a 7d vía env en Render. Mediano: `tokenVersion` en `users` verificado en `authenticate`, bump al cambiar contraseña |
| H9 | **Media** | Mobile/Privacidad | Permiso `android.permission.RECORD_AUDIO` declarado sin que la app use micrófono | `mobile/app.json` → `android.permissions` | Desconfianza del usuario y fricción en revisión de Play Store para una app financiera | Eliminar el permiso (probable arrastre de `expo-image-picker`; declarar `"permissions"` explícitos lo bloquea si no se necesita) |
| H10 | **Media** | Mobile/UX | `app.json` fija `userInterfaceStyle: "dark"` → `useColorScheme()` siempre devuelve dark y el modo "Sistema" del selector de apariencia nunca puede resolver a claro | `mobile/app.json` + `theme/ThemeContext.tsx` (modo `'system'` documentado en PROJECT_CONTEXT §Arquitectura del tema) | La opción "Sistema" de `AppearanceScreen` miente: siempre oscuro | Cambiar a `"userInterfaceStyle": "automatic"` |
| H11 | **Media** | Accesibilidad | Ningún `accessibilityLabel` en todo `mobile/src` | grep → 0 archivos | Inutilizable con TalkBack; los controles clave son íconos sin texto (tab bar, FABs, calculadora) | Pasada de accesibilidad en controles interactivos principales (ver Fase 3) |
| H12 | **Media** | Backend | Inconsistencia de política de contraseñas: registro exige ≥8, reset permite ≥6 | `routes/auth.ts:28` (`min(8)`) vs `routes/password-reset.ts` `resetSchema` (`min(6)`) | El flujo de reset debilita la política | Unificar en 8 (constante compartida) |
| H13 | **Media** | Datos | Import de transacciones no es idempotente: re-importar el mismo CSV duplica todo y mueve saldos dos veces | `POST /api/transactions/import` (batches de 50, sin clave de deduplicación) | Un usuario que reintenta un import "fallido a medias" corrompe sus saldos | Advertencia clara en UI + opcional: hash de fila o import id para deduplicar |
| H14 | **Baja** | Docs | `PROJECT_CONTEXT.md` desactualizado en puntos menores: schema de `tags` dice "name UNIQUE" global (el real es `unique(user_id, name)` — `schema.ts:268`); `DEPLOY_AND_APK.md` describe una prod desactualizada que ya no lo está | Verificado contra `schema.ts` y contra la API real | Confusión en próximas sesiones de agentes | Actualizar ambas secciones |

## Arquitectura

### Fortalezas
- Separación limpia y consistente: `routes/` (HTTP + validación Zod), `services/` (cache, email, recurring, exchangeRates), `utils/` (lógica pura testeable: `recurrence.ts`, `installments.ts`, `balance.ts`, `creditCardDebt.ts`), `middleware/`. En mobile: `screens/` → `hooks/` → `api/client.ts`, con stores Zustand mínimos y bien delimitados (`appStore`, `settingsStore`, `sidebarStore`).
- Decisiones documentadas en el propio código y en `PROJECT_CONTEXT.md`, incluidas las restricciones duras (neon-http sin `db.transaction()` interactivo → `db.batch` + sagas) y los supuestos de un solo proceso.
- La cuota de manejo como caso especial de regla recurrente (no un sistema paralelo) es la decisión correcta y está bien encapsulada.
- Patrón de hooks de datos unificado recientemente (`useResource` genérico, commit `f0cac61`).

### Riesgos
- **Archivos ruta gigantes:** `splits.ts` (1.081 líneas), `debts.ts` (886), `transactions.ts` (847), `accounts.ts` (818) concentran validación + lógica de saga + queries. Cualquier cambio toca un archivo enorme; la lógica de reconciliación de transacciones enlazadas (patrón A/B/C) está repetida con variaciones en debts, splits y savings.
- **Tipos duplicados server↔mobile sincronizados a mano** (`mobile/src/types/index.ts` reescribe ~20 entidades). Decisión consciente y documentada, pero es la fuente más probable de bugs silenciosos de contrato (ya pasó: `AccountsSummary` estuvo incompleto, ítem 25 de PROJECT_CONTEXT).
- **Supuesto de proceso único en 3 sitios** (caché por versión, lock del motor recurrente, rate limiters en memoria). Correcto hoy en Render single-instance; se rompe silenciosamente al escalar horizontalmente.
- 15+ ramas locales sin merge; `main` es la rama de deploy y está 4 commits detrás de `Corections-Senior`. El flujo rama-por-feature sin limpieza acumula riesgo de confusión sobre "qué está en prod".

### Recomendaciones
- Extraer la reconciliación de transacción enlazada (crear/actualizar/borrar + saldo, patrón A/B/C) a un util compartido antes de que se agregue una cuarta copia.
- Script de verificación de paridad de tipos (aunque sea un check manual documentado) al tocar `schema.ts`.
- Definir y documentar la política de ramas: merge a `main` = deploy; borrar ramas mergeadas.

## Backend y API

### Fortalezas
- Zod en los 15 routers (verificado con grep, 16/16 archivos), `parseId` en todos los params, errores uniformes `{ error }` con `errorHandler` que no filtra detalles internos en 500.
- Aislamiento multiusuario sistemático: guardas centralizadas (`utils/ownership.ts`), tablas hijas verificadas vía el padre, IDOR cerrado en la auditoría de junio.
- Consistencia financiera seria: `db.batch` atómico, sagas con `safeCompensate` que loguean "COMPENSACIÓN FALLIDA" con contexto estructurado, guards anti-TOCTOU en el WHERE (`debts/pay`, `savings/contribute`, `statements/pay`), UNIQUE de Postgres como fuente de verdad (23505→409).
- Idempotencia real en el motor recurrente (cursor `last_generated_date` + lock por usuario + `noOverlap`), verificada por el tester interno (materializar 2× = mismo conteo).
- Caché en proceso con invalidación por sello de versión por usuario; caps defensivos `.limit(200)` en listas; N+1 de splits resuelto.
- Paginación real solo donde importa (`GET /api/transactions` con `page/limit`); export sin cap (intencional y documentado).

### Riesgos
- **`GET /api/transactions/export` y el catch-up recurrente son las queries más caras por usuario**; sin límite de rango en export, un usuario con años de datos genera respuestas grandes (mitigado por compression, pero sin cota).
- El historial de presupuestos compara el `amount` ACTUAL contra meses pasados (sin snapshot): un usuario que sube su presupuesto "reescribe" su historial de cumplimiento. Documentado, pero es una fuente de confusión financiera real.
- `assertAccountsOwned` no bloquea transacciones contra cuentas desactivadas (documentado como decisión); combinado con clientes viejos puede sorprender.
- Los summaries cacheados 5 min pueden mostrar datos stale si la invalidación por mutación no cubre algún camino futuro (hoy cubre todos los routers de datos).
- Compatibilidad Neon/serverless correcta (neon-http, sin transacciones interactivas), pero **el cron horario en Render free no corre mientras la instancia duerme**; el catch-up del mobile lo mitiga solo para usuarios que abren la app.

### Recomendaciones
- Añadir cota de rango (p. ej. máx. 5 años) o streaming al export.
- Snapshot mensual del monto presupuestado (tabla o columna `amount_at_month`) antes de que haya usuarios con historial largo.
- Si se mantiene Render free: documentar que los cargos recurrentes dependen del catch-up; si se paga instancia, el cron ya queda bien.

## Seguridad

### Fortalezas
- JWT HS256 fijado en firma y verificación (rechaza `alg: none`), `JWT_SECRET` ≥32 chars obligatorio, payload validado (`middleware/auth.ts`).
- bcrypt cost 12; mensajes de login genéricos (anti-enumeración); reset con CSPRNG, un solo uso, TTL 15 min, throttle 3/h por email + limiter por IP.
- Rate limiting en 3 capas (`rateLimiter.ts`): global 1000/15min, login 5/15min, register 3/h, reset 10/15min, profile 10/15min; `trust proxy` correcto para Render.
- Helmet antes de CORS; CORS negado en prod sin `CORS_ORIGINS` (apps nativas no afectadas); validación de entorno al arrancar con `process.exit(1)`.
- Seed sin credencial hardcodeada (`ADMIN_PASSWORD` o aleatoria fuerte, `db/seed.ts`).
- Mobile: token en SecureStore (nunca AsyncStorage), interceptor 401 → logout; PIN hasheado (SHA-256+salt) en SecureStore con lockout persistido; biometría con fallback a PIN propio.
- Errores 500 genéricos; `requestLogger` no loguea bodies (sin PII en logs HTTP).

### Riesgos
- **H1**: sin recuperación de contraseña activa (el mayor riesgo de "bloqueo de recuperación de cuentas" que el prompt pide marcar P0).
- **H8**: sesiones de 30 días stateless, sin revocación; cambiar contraseña no cierra otras sesiones.
- **H12**: política de contraseña inconsistente (8 vs 6).
- El código de reset de 6 dígitos con 10 intentos/15min por IP es razonable, pero el limiter es por IP (rotable); el token de 64 chars posterior sí es robusto.
- `requireAdmin` existe pero no hay rutas admin; si se agregan, revisar que `isAdmin` viaja en el JWT y no se refresca hasta re-login.
- Sin verificación de email en el registro: cualquiera puede registrar un correo ajeno (impacto bajo hoy, pero interfiere con el flujo de reset de ese correo).

### Checklist OWASP API

| # | Riesgo | Estado | Nota |
|---|--------|--------|------|
| API1 | Broken Object Level Authorization | ✅ Cubierto | Ownership por `user_id` en todas las queries; guardas centralizadas; IDOR auditado en jun-2026 |
| API2 | Broken Authentication | ⚠️ Parcial | JWT sólido, pero 30d sin revocación (H8) y recuperación deshabilitada (H1) |
| API3 | Object Property Level Auth | ✅ Cubierto | Zod whitelistea inputs; `publicUser()` nunca expone `password_hash` |
| API4 | Unrestricted Resource Consumption | ⚠️ Parcial | Rate limits + caps `.limit(200)` + paginación; export sin cota de rango |
| API5 | Broken Function Level Auth | ✅ Cubierto | Sin rutas admin montadas; `requireAdmin` listo para cuando existan |
| API6 | Unrestricted Access to Sensitive Business Flows | ⚠️ Parcial | Registro 3/h por IP; sin verificación de email ni CAPTCHA (aceptable para beta) |
| API7 | SSRF | ✅ N/A | Los únicos fetch salientes son a hosts fijos (Frankfurter, open.er-api.com) |
| API8 | Security Misconfiguration | ✅ Cubierto | Helmet, CORS prod cerrado, env validado, 500 genéricos, `x-powered-by` fuera |
| API9 | Improper Inventory Management | ⚠️ Parcial | Un solo entorno documentado; `DEPLOY_AND_APK.md` desactualizado (H14) |
| API10 | Unsafe Consumption of APIs | ✅ Cubierto | Tasas externas cacheadas con fallback `stale:true`; no se ejecuta nada de la respuesta |

### Checklist OWASP MASVS mobile

| Área | Estado | Nota |
|------|--------|------|
| STORAGE | ✅ Bien | Token y PIN-hash en SecureStore (Keystore); solo preferencias no sensibles en AsyncStorage; recibos locales sin datos de terceros |
| CRYPTO | ✅ Bien | SHA-256+salt vía expo-crypto para el PIN; nada de crypto casera adicional |
| AUTH | ⚠️ Parcial | Bloqueo local PIN/biometría con lockout persistido (muy bien); pero la sesión backend dura 30d (H8) |
| NETWORK | ⚠️ Parcial | HTTPS a Render en prod; el fallback dev es HTTP LAN (aceptable); **sin certificate pinning** (aceptable para este alcance) |
| PLATFORM | ⚠️ Parcial | Permiso RECORD_AUDIO innecesario (H9); mensajes de permisos de cámara/galería bien declarados |
| CODE | ✅ Bien | TS estricto, sin `eval` (calculadora con motor propio), deps alineadas al SDK |
| RESILIENCE | ➖ Fuera de alcance | Sin ofuscación/anti-tampering; razonable no abordarlo en esta etapa |
| PRIVACY | ❌ Brecha | Sin política de privacidad, sin borrado de cuenta, sin pantalla de consentimiento (H4, H5) |

### Recomendaciones
1. Reactivar el flujo de reset (H1) — es quitar 3 `return` y configurar 2 env vars.
2. `JWT_EXPIRATION=7d` en Render ya mismo (cero código); plan de `tokenVersion` para revocación.
3. Unificar mínimo de contraseña en 8.
4. Quitar `RECORD_AUDIO`.
5. Al agregar rutas admin, montar `requireAdmin` y considerar re-verificar `isAdmin` contra DB.

## Base de datos y consistencia financiera

### Fortalezas
- Esquema con integridad referencial completa, `ON DELETE` deliberados por caso (CASCADE en hijas, SET NULL en vínculos históricos como `recurring_rule_id` — correcto para no perder registros).
- `decimal(15,2)` para montos y `decimal(18,8)` para tasas: precisión monetaria correcta; nunca floats en DB.
- Índices post-auditoría (migración 0009) alineados con los patrones de query reales; UNIQUEs parciales inteligentes (`budgets_one_global_per_user`, `split_members_one_me_per_group`).
- 22 migraciones **todas aditivas**, con journal versionado; guía propia (`GUIA_MIGRACIONES_DB.md`).
- Multi-moneda bien modelado: cada transacción en la moneda de su cuenta, `to_amount` para transfers cross-currency, conversión solo para visualización.
- CHECK `accounts_balance_nonnegative` (0021) como cierre a nivel DB del TOCTOU de saldos.

### Riesgos
- **H3: no está confirmado que 0021 esté aplicada en prod**, y quedó `NOT VALID` (no valida filas históricas) — hay que validar el histórico tras revisar saldos.
- `current_balance` es un **acumulado materializado sin job de reconciliación**: si una compensación de saga falla (el caso "COMPENSACIÓN FALLIDA"), el saldo diverge de la suma de transacciones y nada lo detecta automáticamente.
- Hard delete en casi todo (solo cuentas tienen soft delete): borrar una transacción no deja rastro de auditoría. Para finanzas personales es tolerable, pero no hay tabla de auditoría de ninguna operación.
- Backups: Neon free tiene PITR limitado (~24h según plan); no hay estrategia de backup/restore documentada ni probada.
- La categoría "Comisiones bancarias" se crea con `getOrCreateExpenseCategory` sin índice único que la blinde de carreras (pendiente reconocido en PROJECT_CONTEXT).

### Recomendaciones
1. Confirmar 0021 en prod y `VALIDATE CONSTRAINT` (Fase 0).
2. Endpoint/script de **reconciliación de saldos**: `initial_balance + Σ(transacciones) + Σ(aportes de ahorro) = current_balance` por cuenta; correrlo como chequeo periódico y alerta si diverge. Es la red de seguridad que le falta al modelo de saldos materializados.
3. Documentar y probar restore de Neon (o dump nocturno vía GitHub Action).
4. Índice único `categories(user_id, type, lower(name))` (pendiente ya identificado).

## Mobile, UX y accesibilidad

### Fortalezas
- Flujos completos y pensados para uso repetido: calculadora propia, plantillas con `use_count`, auto-fill inteligente, prellenado de cuota con mora, catch-up recurrente al abrir.
- Estados de carga/vacío/error consistentes (EmptyState/ErrorState con retry, pull-to-refresh generalizado); manejo de teclado con `react-native-keyboard-controller`.
- Onboarding fuerte: PIN obligatorio en primer login, tour guiado interactivo que resalta la UI real, relanzable desde Más.
- Confirmaciones en acciones destructivas (Alert en logout, eliminación de deudas/grupos con opciones Liquidar/Eliminar bien explicadas).
- Tema dual con 4 paletas verificadas WCAG AA en tokens de texto; `formatCurrency` con Intl + fallback es-CO; todo en español consistente.
- Degradación correcta en Expo Go (notificaciones no-op con banner explicativo, SecureStore resiliente que no brickea la app).

### Riesgos
- **H11: accesibilidad cero** — ningún `accessibilityLabel` en el proyecto; tab bar, FABs y calculadora son íconos puros.
- **H10: modo "Sistema" de apariencia roto** por `userInterfaceStyle: "dark"` en `app.json`.
- **Sin modo offline**: timeout Axios de 5 s y toasts de error, pero sin cola ni caché local; en Render free (cold start >5 s tras dormir) el primer request del día probablemente **falla por timeout** — el usuario ve un error espurio. Riesgo de UX grave con el hosting actual.
- Sin load-more: las listas quedan capadas a 200 en servidor (documentado como TODO); un usuario activo >200 transacciones por vista pierde datos sin aviso visible en pantallas de detalle.
- El filtro por tipo de cuenta en Stats recalcula client-side con `limit: 1000` y sin conversión multi-moneda (documentado): números distintos a los del servidor si hay varias monedas — confusión financiera potencial.
- Riesgo de confusión: historial de presupuestos comparado contra el monto actual (ver Backend).

### Recomendaciones
1. Subir el timeout de Axios o implementar retry con aviso "el servidor está despertando…" (si se queda Render free).
2. `userInterfaceStyle: "automatic"`.
3. Pasada de accesibilidad: labels en tab bar, FABs, calculadora, PIN keypad; roles en botones.
4. Load-more en Transactions y en los detalles capados a 200.
5. Nota visual en Stats cuando el filtro client-side esté activo con multi-moneda.

## Rendimiento y escalabilidad

### Fortalezas
- La auditoría de junio ya resolvió lo importante: índices alineados a queries, N+1 de splits eliminado, provisión de defaults por lotes, `Promise.all` donde no hay dependencias, selects acotados, gzip, caché con invalidación correcta.
- Mobile: lazy-loading de pantallas pesadas, `React.memo` en filas, listas optimizadas, selectores Zustand por campo. Bundle verificado (3.910 módulos) en junio.

### Riesgos
- **Render free + Neon free**: cold starts que rompen el timeout de 5 s del mobile (ver UX); el cron no corre dormido. Es el mayor riesgo de rendimiento *percibido* hoy, no las queries.
- Caché/locks en memoria: al pasar a 2+ instancias, la invalidación por versión deja de funcionar entre procesos (datos stale servidos tras mutaciones) y el lock del motor recurrente deja de excluir. Documentado, pero conviene un guard explícito (env `WEB_CONCURRENCY`/aviso).
- Costos: el stack actual es $0; el salto realista para lanzamiento es Render Starter (~$7/mes, sin sleep) + Neon Launch. Barato y resuelve el cold start.

### Recomendaciones
1. Para beta pública: instancia Render de pago (elimina cold start y hace confiable el cron) — probablemente el mejor ROI de toda esta auditoría en UX percibida.
2. Si algún día hay 2+ instancias: mover invalidación de caché y lock recurrente a DB (UPDATE condicional del cursor, que ya está diseñado para eso).

## Calidad de codigo

### Fortalezas
- TypeScript estricto en ambos paquetes, typecheck limpio; Zod como frontera de tipos en runtime.
- Montos manejados como `string` (decimal de Postgres) en server y mobile — sin aritmética float en persistencia; la lógica pura de dinero está en utils testeables.
- Naming consistente en español de producto/inglés de código; constantes centralizadas (`utils/constants.ts`); sin `eval`; sin TODOs huérfanos (todos son el mismo marcador de paginación, inventariados en PROJECT_CONTEXT).
- Manejo de errores uniforme de punta a punta (ApiError → `{ error }` → `getErrorMessage` → toast).

### Riesgos
- Conversión de montos: los cálculos de agregación client-side (`statsAggregation.ts`) y los previews de cuotas (espejo `installments.ts` en mobile) usan float de JS — correcto para visualización, pero el espejo server/mobile de la amortización puede divergir en centavos; sin test que los compare.
- Complejidad concentrada: los handlers de saga (settle de splits, PUT de payments) superan fácil las 100 líneas con múltiples ramas A/B/C; son correctos hoy pero frágiles a la edición.
- Duplicación de tipos manual (ya cubierto en Arquitectura).

### Recomendaciones
- Test de paridad `frenchInstallment` server vs mobile con casos de borde (tasas 0, montos grandes).
- Extraer el patrón de reconciliación A/B/C (misma recomendación de Arquitectura; es también la mayor deuda de complejidad).

## Testing y QA

### Estado actual
- **Cero tests automatizados** (sin runner, sin script, sin archivos). Sin CI (`.github/` no existe).
- QA hasta ahora: typecheck, `expo-doctor`, verificación manual con subagentes (tester/reviewer por fase, documentada en PROJECT_CONTEXT) y validaciones numéricas puntuales anotadas (amortización, cupos).

### Brechas
- El núcleo financiero completo depende de revisión manual: reglas de balance, FIFO de tarjeta, amortización, mora, recurrencia (frecuencias/cursor), reparto y liquidación de splits, reconciliación de contribuciones/pagos editados, import/export round-trip.
- Sin tests de autorización (IDOR) que protejan las guardas de ownership contra regresiones.
- Sin checklist de regresión formal ni matriz de dispositivos.

### Suite minima recomendada
Runner: **vitest** (server; cero config con tsx/ESM). Prioridad descendente:
1. **Unit puros (sin DB)**: `utils/recurrence.ts` (todas las frecuencias, fin de mes, biweekly anclado, cursor), `utils/installments.ts` (francesa, i=0, mora, topes) + paridad con el espejo mobile, `utils/creditCardDebt.ts` (FIFO parciales/exactos/sobrantes), `utils/balance.ts`, `mobile/src/utils/{csv,calculatorEngine,statsAggregation}.ts`.
2. **Integración API contra una DB Neon de test** (branch de Neon): auth (register/login/401), CRUD transacción con verificación de saldo, transfer cross-currency, gasto con tarjeta → deuda automática → pago → restauración de cupo, contribución de ahorro (depósito/retiro/edición), settle parcial de split, import round-trip, **tests de IDOR** (usuario B no lee/escribe recursos de A en cada router).
3. **Idempotencia**: materializar recurrentes 2× = mismo estado; catch-up concurrente.

### Checklist manual pre-release
- [ ] Registro → provisión de defaults → PIN setup → tour completo.
- [ ] Login, logout, sesión restaurada en cold start, 401 → redirige a login.
- [ ] Recuperación de contraseña de punta a punta (cuando se reactive).
- [ ] Crear/editar/borrar transacción de cada tipo y verificar saldos (débito y tarjeta).
- [ ] Compra a cuotas con tarjeta → deuda automática → pagar corte → FIFO correcto.
- [ ] Congelar tarjeta: gasto rechazado, pago de deuda permitido.
- [ ] Regla recurrente: crear, esperar/materializar vía catch-up, pausar, borrar (transacciones conservadas).
- [ ] Export CSV → import en cuenta limpia → saldos idénticos.
- [ ] Multi-moneda: transfer COP↔USD con monto recibido editado; moneda principal cambiada.
- [ ] PIN: lockout tras 5 intentos, biometría, quitar biometría del sistema.
- [ ] Sin red / servidor dormido: mensajes de error razonables, sin crash.
- [ ] Matriz Android mínima: 1 gama baja (2-3 GB RAM, Android 10), 1 media, 1 reciente (Android 14+, edge-to-edge), APK real (notificaciones y biometría solo se prueban ahí).

## DevOps, despliegue y observabilidad

### Estado actual
- Deploy: Render (auto-deploy desde `main`), build `tsc` → `node dist/index.js`; guía copy-paste en `DEPLOY_AND_APK.md` (parcialmente obsoleta). Prod verificada sirviendo el código con auth.
- Mobile: EAS build, perfil `preview` (APK, con API URL), `production` (app-bundle, **sin API URL — H2**).
- Salud: `/health` (liveness) + `/api/health` (DB) ya implementados; graceful shutdown correcto (drena requests, detiene el cron); handlers de proceso de último recurso; logging HTTP mínimo sensato (prod: solo lento/errores).
- Migraciones: se corren manualmente desde local (`pnpm db:migrate`) — y las credenciales locales hoy fallan (H3).

### Brechas
- Sin CI: nada impide mergear a `main` (= deploy) con typecheck roto.
- Sin monitoreo de errores ni alertas (H7); el log crítico "COMPENSACIÓN FALLIDA" no notifica a nadie.
- Sin proceso de migraciones en prod (¿quién las corre, cuándo, con qué credenciales?); sin plan de rollback documentado (el código es rollback-able por Render; la DB, al ser migraciones aditivas, tolera código viejo — vale la pena escribirlo).
- Sin versionado de app (app.json fijo en 1.0.0, sin `autoIncrement` de versionCode en EAS).
- Backups no configurados/probados más allá del default de Neon.

### Recomendaciones
1. GitHub Actions mínimo: `pnpm typecheck` (server+mobile) + tests en PR a `main`. Medio día de trabajo, elimina la clase entera de "deploy roto".
2. Sentry en server y mobile; alerta (aunque sea email) sobre "COMPENSACIÓN FALLIDA".
3. Paso de migración documentado en el deploy (o job de Render que corra `db:migrate` pre-arranque) + arreglar `.env` local.
4. `"autoIncrement": true` en el perfil production de EAS; adoptar versionado semántico de la app.

## Preparacion para lanzar al mercado

### Lo que ya existe
- Producto funcional completo y diferenciado para su nicho: multi-moneda real con tasas manuales (relevante para COP/VES), tarjetas de crédito con modelo de cupo + deudas por compra + cuotas con amortización francesa y mora (raro en apps gratuitas), splits, presupuestos con invariantes, insights sin IA, recurrencia idempotente.
- Onboarding real (PIN + tour guiado), app 100% en español, tema dual con 4 paletas.
- Backend desplegado y endurecido; APK distribuible por EAS.
- Privacidad por diseño en varios puntos: recibos solo locales, notificaciones solo locales, sin SDK de tracking de terceros (hoy la app no envía datos a nadie más que al backend propio).

### Lo que falta antes de beta cerrada (ampliada)
- Recuperación de contraseña activa (H1).
- Confirmar migración 0021 en prod + credenciales locales (H3).
- Monitoreo de errores mínimo (H7) — sin esto, la beta no aprende nada de los crashes.
- Canal de soporte/feedback (aunque sea un mailto + pantalla "Ayuda" en Más).

### Lo que falta antes de produccion
- Eliminación de cuenta + export completo (H4) y política de privacidad + términos + consentimiento (H5) — requisitos duros de Play Store para apps financieras con cuentas.
- Fix del perfil production de EAS (H2), quitar RECORD_AUDIO (H9), assets de tienda (screenshots, ficha, clasificación de contenido, formulario Data Safety de Play — que exige declarar exactamente qué datos financieros se recogen).
- Suite mínima de tests + CI (H6).
- Sesiones más cortas o revocables (H8).
- Hosting sin cold start (Render de pago) — con el free tier la primera impresión diaria es un error de timeout.
- Decisión de branding: "Wallet Clone / clon de Wallet by BudgetBakers" no puede llegar a la tienda — nombre propio, ícono propio y eliminar referencias al clon (riesgo de marca).

### Riesgos legales, privacidad y soporte
- **Habeas data (Ley 1581/2012, Colombia):** datos financieros = tratamiento que exige autorización previa e informada, derechos de consulta/supresión (refuerza H4/H5).
- **Play Store:** política de privacidad obligatoria, account deletion obligatorio (desde 2024), Data Safety form; el permiso de micrófono sin uso puede disparar revisión manual.
- **Riesgo reputacional:** una app de dinero que pierde saldos o bloquea cuentas (H1) quema la confianza de forma no recuperable; por eso los P0 son los que son.
- Soporte: sin canal definido; para beta basta email + versión visible en la app (Más → Acerca de).

### Recomendaciones de producto
1. Mantener la beta cerrada actual mientras se ejecutan las Fases 0-1; ampliar beta al cerrar Fase 1.
2. Elegir nombre/branding definitivo antes de invertir en assets de tienda.
3. Analítica: dado el posicionamiento privacidad-primero, considerar solo métricas agregadas propias (conteos en backend) en vez de SDK de terceros; anunciarlo como feature.
4. Monetización: no bloquea el lanzamiento; decidir después de la beta (el costo operativo es ~$10-25/mes).

## Backlog priorizado

| Prioridad | Item | Area | Severidad | Impacto | Esfuerzo | Dependencias | Criterio de aceptacion |
|-----------|------|------|-----------|---------|----------|--------------|------------------------|
| P0 | Reactivar recuperación de contraseña (quitar 3 `return`, configurar GMAIL_* en Render, descomentar link en LoginScreen) | Seguridad | Crítica | Usuarios recuperan acceso | S | Credenciales Gmail | Flujo completo email→código→reset funciona en prod; 503 desaparece |
| P0 | Arreglar `DATABASE_URL` local y confirmar migración 0021 aplicada en prod (+ `VALIDATE CONSTRAINT` tras revisar saldos) | Datos | Alta | Guard anti-saldo-negativo activo | S | Acceso a Neon | `pg_constraint` muestra `accounts_balance_nonnegative` con `convalidated=true` |
| P0 | `EXPO_PUBLIC_API_URL` en perfil `production` de eas.json | Release | Crítica | Builds de producción funcionales | XS | — | Perfil production tiene el env; build apunta a Render |
| P0 | Sentry (o equivalente) en server + mobile; alerta sobre "COMPENSACIÓN FALLIDA" | Observabilidad | Alta | Visibilidad de errores en campo | M | Cuenta Sentry | Un crash de prueba en APK y un 500 en server aparecen en el dashboard |
| P0 | Canal de soporte: pantalla "Ayuda/Acerca de" en Más (email + versión) | Producto | Media | Feedback de beta | S | — | Pantalla accesible con mailto funcional y versión visible |
| P1 | `DELETE /api/auth/account` (cascada completa) + export total de datos + UI | Legal/Backend | Alta | Cumplimiento Play/habeas data | M | — | Borrar cuenta elimina todas las filas del usuario; export descarga JSON con todas sus entidades |
| P1 | Política de privacidad + términos publicados + consentimiento en registro | Legal | Alta | Publicable en tienda | M | Decisión de branding | URL pública; checkbox en registro; enlaces en la app |
| P1 | Suite de tests mínima (unit puros + integración financiera + IDOR) + CI en GitHub Actions | QA | Alta | Red anti-regresión | L | — | `pnpm test` verde en server; CI bloquea PRs a main con typecheck/test rotos |
| P1 | `JWT_EXPIRATION=7d` + revocación por `tokenVersion` al cambiar contraseña | Seguridad | Alta | Sesiones controlables | M | Migración aditiva | Cambiar contraseña invalida tokens viejos (401) |
| P1 | Reconciliación de saldos (script/endpoint admin): saldo materializado vs suma de movimientos | Datos | Alta | Detecta divergencias de saga | M | — | Reporte por cuenta con diff; 0 diffs en datos sanos |
| P1 | Quitar `RECORD_AUDIO`; `userInterfaceStyle: "automatic"`; `autoIncrement` en EAS | Mobile/Release | Media | Store-ready | XS | — | app.json/eas.json corregidos; modo Sistema funciona |
| P1 | Unificar mínimo de contraseña en 8 (reset) | Seguridad | Media | Política consistente | XS | — | `resetSchema` usa la misma constante que registro |
| P1 | Render instancia de pago (sin sleep) o manejo explícito de cold start en mobile | DevOps/UX | Media | Primera impresión diaria sin error | S | Presupuesto (~$7/mes) | Primer request del día no da timeout |
| P2 | Accesibilidad: labels/roles en tab bar, FABs, calculadora, PIN keypad | Mobile | Media | Usable con TalkBack | M | — | TalkBack anuncia todos los controles principales |
| P2 | Load-more en Transactions y detalles capados a 200 | Mobile/Backend | Media | Sin pérdida silenciosa de datos | M | — | Listas paginan; el cap deja de truncar sin aviso |
| P2 | Snapshot mensual del monto en historial de presupuestos | Backend | Media | Historial veraz | M | Migración aditiva | Cambiar el presupuesto no reescribe meses pasados |
| P2 | Aviso/dedup en import re-ejecutado | Backend/UX | Media | Evita saldos duplicados | S | — | Re-importar el mismo CSV avisa o no duplica |
| P2 | Extraer patrón de reconciliación A/B/C compartido (debts/splits/savings) | Arquitectura | Media | Menos fragilidad | L | Tests (P1) | Una sola implementación; typecheck+tests verdes |
| P2 | Verificación de email en registro | Seguridad | Baja | Correos verificados | M | Gmail SMTP | Registro con correo ajeno no queda utilizable sin verificación |
| P2 | Actualizar PROJECT_CONTEXT.md (tags unique) y DEPLOY_AND_APK.md (prod ya actualizada) | Docs | Baja | Contexto veraz para agentes | XS | — | Docs coinciden con código/prod |
| P3 | Branding definitivo + assets de tienda + Data Safety form | Producto | — | Publicación | L | Decisión de nombre | Ficha de Play completa |
| P3 | Certificate pinning; ofuscación | Seguridad móvil | Baja | Defensa en profundidad | M | — | — |
| P3 | Caché/locks multi-instancia (mover a DB) | Escalabilidad | Baja | Escalar horizontal | L | Solo si se escala | — |
| P3 | Analítica agregada propia respetando privacidad | Producto | Baja | Métricas de uso | M | — | — |

## Plan de implementacion para Claude o Codex

### Fase 0: estabilizacion y verificaciones base
- **Objetivo:** entorno operable y verdad establecida sobre el estado de prod.
- **Archivos probables:** `.env` (raíz, no versionado), `mobile/eas.json`, `mobile/app.json`, `DEPLOY_AND_APK.md`, `PROJECT_CONTEXT.md`.
- **Pasos:** (1) obtener `DATABASE_URL` vigente de Neon y actualizar `.env`; (2) `cd server && pnpm db:migrate`; (3) verificar `accounts_balance_nonnegative` en `pg_constraint`; (4) revisar saldos negativos históricos y correr `VALIDATE CONSTRAINT`; (5) añadir `EXPO_PUBLIC_API_URL` al perfil `production` de eas.json; (6) quitar `RECORD_AUDIO` y poner `userInterfaceStyle: "automatic"`; (7) actualizar los 2 docs desactualizados; (8) mergear a `main` lo que deba estar en prod y borrar ramas muertas.
- **Riesgos:** correr migraciones contra prod — hacerlo en ventana tranquila; 0021 es `NOT VALID` (no bloquea).
- **Validaciones/Comandos:** `pnpm typecheck` ambos; query a `pg_constraint`; `curl /api/health`.
- **Aceptación:** migración confirmada, builds production apuntan a Render, docs veraces.

### Fase 1: seguridad y privacidad
- **Objetivo:** nadie pierde acceso a su cuenta; sesiones controlables; cumplimiento de privacidad básico.
- **Archivos probables:** `server/src/routes/password-reset.ts`, `routes/auth.ts`, `middleware/auth.ts`, `db/schema.ts` (+1 migración aditiva `token_version`), `mobile/src/screens/{LoginScreen,SecurityScreen,MoreScreen}.tsx`, pantalla nueva de borrado/export, `mobile/src/api/client.ts`.
- **Pasos:** (1) reactivar reset (quitar los 3 `return` en las líneas 50/99/129, configurar `GMAIL_*` en Render, descomentar link); (2) unificar min de contraseña en 8; (3) `JWT_EXPIRATION=7d` en Render + columna `token_version` verificada en `authenticate` y bumpeada al cambiar/resetear contraseña; (4) `DELETE /api/auth/account` con borrado en cascada de TODAS las tablas del usuario (orden: hijas→padres, en `db.batch`) + confirmación fuerte en UI (reescribir contraseña); (5) export completo de datos (JSON con todas las entidades del usuario); (6) política de privacidad + términos (documento + URL + checkbox en registro + enlaces en Más).
- **Riesgos:** el borrado en cascada debe cubrir todas las tablas (usar el schema como checklist); la revocación por `token_version` fuerza re-login masivo si se despliega mal — bump solo en cambio de contraseña.
- **Validaciones:** flujo reset E2E en prod; borrar una cuenta de prueba y verificar 0 filas residuales; token viejo → 401 tras cambio de contraseña.
- **Comandos:** `cd server && pnpm typecheck && pnpm db:migrate`; `cd mobile && pnpm typecheck`.
- **Aceptación:** H1, H4, H5, H8, H12 cerrados.

### Fase 2: consistencia financiera y backend
- **Objetivo:** red de seguridad sobre los saldos y deudas de datos conocidas.
- **Archivos probables:** `server/src/routes/admin.ts` (nuevo, con `requireAdmin`), `utils/` (reconciliación), `routes/transactions.ts` (import), `routes/budgets.ts` + migración de snapshot, `db/schema.ts`.
- **Pasos:** (1) script/endpoint de reconciliación de saldos por cuenta (saldo materializado vs `initial_balance` + Σ transacciones ± Σ aportes de ahorro), reportando diffs; (2) índice único `categories(user_id, type, lower(name))`; (3) aviso/dedup de import repetido; (4) snapshot mensual de monto presupuestado; (5) cota de rango en export.
- **Riesgos:** la fórmula de reconciliación debe incluir TODOS los caminos que mueven saldo (transacciones, aportes de ahorro modelo 0020, FIFO de tarjeta) — validarla contra los datos de prueba antes de confiar en ella.
- **Validaciones:** reconciliación = 0 diffs sobre una cuenta de prueba ejercitada con cada tipo de operación.
- **Comandos:** `cd server && pnpm typecheck && pnpm db:generate && pnpm db:migrate`.
- **Aceptación:** reconciliación disponible y verde; H13 mitigado; presupuestos con historial veraz.

### Fase 3: UX mobile y accesibilidad
- **Objetivo:** primera impresión sin errores espurios y app usable con lector de pantalla.
- **Archivos probables:** `mobile/src/api/client.ts`, `navigation/AppNavigator.tsx` (tab bar), `components/{Calculator,PinKeypad,BottomSheet}.tsx`, pantallas con FAB, `screens/TransactionsScreen.tsx` (+ endpoints de load-more si se toca server), `screens/StatsScreen.tsx`.
- **Pasos:** (1) manejo de cold start (retry con mensaje "conectando…" o timeout mayor en el primer request); (2) `accessibilityLabel`/`accessibilityRole` en tab bar, FABs, calculadora, PIN keypad, chips de filtro; (3) load-more en Transactions (server ya pagina) y en los 4 detalles capados a 200; (4) nota en Stats cuando el filtro client-side esté activo con multi-moneda; (5) pantalla "Ayuda/Acerca de" (soporte + versión).
- **Riesgos:** load-more toca hooks compartidos (`useResource`) — no romper el patrón de refresh.
- **Validaciones:** TalkBack sobre los flujos principales; probar contra servidor dormido real.
- **Comandos:** `cd mobile && pnpm typecheck`; `npx expo-doctor`.
- **Aceptación:** H10, H11 cerrados; sin timeout espurio en cold start.

### Fase 4: testing y QA
- **Objetivo:** red anti-regresión del núcleo financiero.
- **Archivos probables:** `server/vitest.config.ts` (nuevo), `server/src/**/*.test.ts`, `server/package.json` (script test, vitest en devDeps), fixtures.
- **Pasos:** (1) instalar vitest en server; (2) unit tests puros: `recurrence`, `installments` (+paridad con espejo mobile), `creditCardDebt` (FIFO), `balance`, y en mobile `csv`, `calculatorEngine`, `statsAggregation` (con vitest también o node:test); (3) integración contra branch de Neon de test: flujo tarjeta completo, ahorros, settle parcial, import round-trip; (4) tests IDOR por router (usuario B vs recursos de A); (5) test de idempotencia del motor recurrente.
- **Riesgos:** integración necesita `DATABASE_URL` de test — nunca apuntar a prod (guard en el setup: rechazar si el host no es el branch de test).
- **Validaciones/Comandos:** `cd server && pnpm test`; typecheck ambos.
- **Aceptación:** H6 cerrado; cobertura de los utils financieros al 100% de ramas relevantes; IDOR verde en todos los routers.

### Fase 5: DevOps, observabilidad y release
- **Objetivo:** deploy con gates, errores visibles, releases versionadas.
- **Archivos probables:** `.github/workflows/ci.yml` (nuevo), `server/src/index.ts` + `middleware/errorHandler.ts` (Sentry), `mobile/App.tsx` (sentry-expo), `mobile/{app.json,eas.json}`, `DEPLOY_AND_APK.md`.
- **Pasos:** (1) GitHub Actions: typecheck server+mobile+tests en PR a main; (2) Sentry server (captura en errorHandler y en `safeCompensate`) y mobile (ErrorBoundary + errores no atrapados); (3) alerta sobre "COMPENSACIÓN FALLIDA"; (4) `autoIncrement` de versionCode; (5) documentar runbook: deploy, migraciones en prod, rollback, restore de Neon; (6) evaluar Render de pago.
- **Riesgos:** Sentry en Expo requiere config plugin y rebuild del APK; no filtrar PII en los eventos (scrub de emails).
- **Validaciones:** PR con typecheck roto es bloqueado; crash de prueba visible en Sentry desde APK.
- **Comandos:** `pnpm typecheck`/`pnpm test`; `pnpm build:apk` de verificación.
- **Aceptación:** H7 cerrado; CI activo; runbook escrito.

### Fase 6: preparacion comercial y app store
- **Objetivo:** publicable en Google Play.
- **Archivos probables:** `mobile/app.json` (nombre, ícono, splash), assets, textos legales, ficha de Play.
- **Pasos:** (1) decidir nombre/branding definitivo (eliminar "clone" y referencias a Wallet by BudgetBakers); (2) ícono/splash/screenshots finales; (3) ficha de Play + clasificación de contenido + **Data Safety form** (declarar datos financieros recogidos, cifrado en tránsito, borrado disponible); (4) URL de política de privacidad en la ficha; (5) build `production` (app-bundle) + track de testing interno → cerrado → producción; (6) decidir analítica agregada propia (opcional).
- **Riesgos:** revisión de Play para apps financieras puede pedir aclaraciones (no es banco ni maneja dinero real de terceros — dejarlo claro en la ficha).
- **Validaciones:** APK/AAB de producción probado en dispositivo real contra prod.
- **Aceptación:** app aceptada en testing cerrado de Play.

## Prompts de ejecucion sugeridos

### Prompt Fase 0 - Estabilizacion y verificaciones base

Lee primero `PROJECT_CONTEXT.md` y `AUDITORIA_LANZAMIENTO_Y_PLAN.md` (Fase 0).

Objetivo:
Dejar el entorno operable y confirmar el estado real de producción: credenciales de DB locales válidas, migración 0021 confirmada en prod, builds de producción apuntando al backend real, y docs veraces.

Tareas:
1. Pide al usuario la `DATABASE_URL` vigente de Neon (no la inventes) y verifica conexión con una query de solo lectura; luego corre `cd server && pnpm db:migrate` y confirma en `pg_constraint` que existe `accounts_balance_nonnegative`.
2. Revisa si hay cuentas con `current_balance < 0` y `allow_overdraft = false`; si no hay, corre `ALTER TABLE accounts VALIDATE CONSTRAINT accounts_balance_nonnegative`; si hay, repórtalas sin tocarlas.
3. En `mobile/eas.json`, agrega `env.EXPO_PUBLIC_API_URL = "https://wallet-7v82.onrender.com/api"` al perfil `production` y `"autoIncrement": true` para Android.
4. En `mobile/app.json`: elimina `android.permission.RECORD_AUDIO` y cambia `userInterfaceStyle` a `"automatic"`.
5. Actualiza `DEPLOY_AND_APK.md` (la sección "Diagnóstico actual" está obsoleta: prod ya sirve el código con auth) y la sección del schema de `tags` en `PROJECT_CONTEXT.md` (el UNIQUE real es `(user_id, name)`).

Restricciones:
- No agregues dependencias salvo que sea estrictamente necesario y lo justifiques.
- No cambies comportamiento no relacionado.
- Mantén textos en espanol.
- Usa pnpm.
- Actualiza `PROJECT_CONTEXT.md` si cambias arquitectura, endpoints, schema, flujos o comportamiento.

Validacion:
- `cd server && pnpm typecheck`.
- `cd mobile && pnpm typecheck`.
- Query de verificación a `pg_constraint` mostrada en el resumen.

Entrega:
- Resumen de cambios.
- Archivos modificados.
- Comandos ejecutados.
- Riesgos o pendientes.

### Prompt Fase 1 - Seguridad y privacidad

Lee primero `PROJECT_CONTEXT.md` (secciones "AUTENTICACIÓN Y MULTIUSUARIO" y "Hardening de producción") y `AUDITORIA_LANZAMIENTO_Y_PLAN.md` (Fase 1).

Objetivo:
Reactivar la recuperación de contraseña, endurecer sesiones (expiración 7d + revocación), agregar eliminación de cuenta y export completo de datos, y unificar la política de contraseñas.

Tareas:
1. En `server/src/routes/password-reset.ts`, elimina los 3 `return` tempranos de deshabilitación (líneas ~50, ~99, ~129) y en `mobile/src/screens/LoginScreen.tsx` descomenta el link "¿Olvidaste tu contraseña?". Indica al usuario que configure `GMAIL_USER`/`GMAIL_APP_PASSWORD` en Render.
2. Sube el mínimo de `newPassword` en `resetSchema` de 6 a 8, usando una constante compartida con `routes/auth.ts`.
3. Agrega columna `token_version` (int, default 0) a `users` (migración aditiva con el agente migrator); inclúyela en el payload del JWT (`signToken`) y verifícala en `authenticate` contra la DB solo si quieres revocación estricta — alternativa aceptada: verificarla en un middleware ligero con caché por usuario. Bump de `token_version` al cambiar contraseña (PUT /profile) y al completar un reset.
4. Implementa `DELETE /api/auth/account` (requiere contraseña actual en el body): borra TODAS las filas del usuario en `db.batch` (usa `db/schema.ts` como checklist: transactions/tags/templates/savings/debts/splits/budgets/exchange_rates/password_resets/recurring_rules/credit_card_statements/accounts/categories y finalmente users). Agrega la UI de borrado con doble confirmación en una pantalla de cuenta/perfil.
5. Implementa `GET /api/auth/export` que devuelva un JSON con todas las entidades del usuario, y un botón "Descargar mis datos" en la app (reutiliza el patrón de expo-file-system + expo-sharing de ImportExport).
6. Redacta `PRIVACY.md` y `TERMS.md` (español, Colombia, habeas data Ley 1581/2012, datos tratados: email, nombre, datos financieros ingresados por el usuario) y agrega el checkbox de aceptación en `RegisterScreen` + enlaces en el tab Más.

Restricciones:
- No agregues dependencias salvo que sea estrictamente necesario y lo justifiques.
- No cambies comportamiento no relacionado.
- Mantén textos en espanol.
- Usa pnpm.
- Actualiza `PROJECT_CONTEXT.md` si cambias arquitectura, endpoints, schema, flujos o comportamiento.

Validacion:
- `cd server && pnpm typecheck` y `cd mobile && pnpm typecheck`.
- Prueba manual: borrar una cuenta de prueba y verificar con queries que no quedan filas del usuario.
- Agrega o actualiza pruebas cuando el riesgo lo amerite.

Entrega:
- Resumen de cambios.
- Archivos modificados.
- Comandos ejecutados.
- Riesgos o pendientes.

### Prompt Fase 2 - Consistencia financiera y backend

Lee primero `PROJECT_CONTEXT.md` (secciones "Reglas de balance", "Savings", "Budgets", "Transactions") y `AUDITORIA_LANZAMIENTO_Y_PLAN.md` (Fase 2).

Objetivo:
Red de seguridad sobre los saldos materializados y cierre de deudas de datos conocidas.

Tareas:
1. Crea un util de **reconciliación de saldos** (`server/src/utils/reconcile.ts`): para cada cuenta del usuario, calcula `initial_balance + Σ(income) − Σ(expense) − Σ(transfer salientes por amount) + Σ(transfer entrantes por to_amount ?? amount) − Σ(depósitos de ahorro) + Σ(retiros de ahorro)` y compáralo con `current_balance`. Exponlo como `GET /api/admin/reconcile` protegido con `requireAdmin` (primer uso real de ese middleware).
2. Agrega índice único `categories(user_id, type, lower(name))` vía migración (revisa duplicados existentes primero y repórtalos si los hay, sin borrarlos).
3. En `POST /api/transactions/import`, detecta un import idéntico repetido (p. ej. hash del payload por usuario en memoria o advertencia si >80% de filas coinciden exactas con transacciones existentes del mismo día/monto/cuenta) y devuélvelo como warning en la respuesta; muestra el aviso en `ImportExportScreen`.
4. Snapshot del historial de presupuestos: persiste el `amount` vigente por mes (tabla `budget_snapshots(user_id, budget_id, month, amount)` o equivalente) y usa el snapshot en `GET /api/budgets/history` (fallback al amount actual para meses sin snapshot).
5. Agrega cota de rango al export (`from`/`to` obligatorios o máximo 5 años).

Restricciones:
- No agregues dependencias salvo que sea estrictamente necesario y lo justifiques.
- No cambies comportamiento no relacionado.
- Mantén textos en espanol.
- Usa pnpm.
- Actualiza `PROJECT_CONTEXT.md` si cambias arquitectura, endpoints, schema, flujos o comportamiento.

Validacion:
- `cd server && pnpm typecheck`; migraciones con `pnpm db:generate && pnpm db:migrate`.
- Ejercita la reconciliación con una cuenta que tenga: ingreso, gasto, transfer cross-currency, gasto con tarjeta, aporte y retiro de ahorro → diff 0.
- Agrega o actualiza pruebas cuando el riesgo lo amerite.

Entrega:
- Resumen de cambios.
- Archivos modificados.
- Comandos ejecutados.
- Riesgos o pendientes.

### Prompt Fase 3 - UX mobile y accesibilidad

Lee primero `PROJECT_CONTEXT.md` (secciones de mobile/diseño) y `AUDITORIA_LANZAMIENTO_Y_PLAN.md` (Fase 3).

Objetivo:
Eliminar el error espurio del cold start del backend, hacer la app usable con TalkBack y quitar los truncamientos silenciosos.

Tareas:
1. En `mobile/src/api/client.ts`, maneja el cold start de Render free: un retry automático con backoff para el primer fallo por timeout, y un toast/estado "Conectando con el servidor…" en vez de error inmediato.
2. Agrega `accessibilityLabel` y `accessibilityRole` a: los 5 slots del `CustomTabBar` (`AppNavigator.tsx`), todos los FAB, cada tecla de `Calculator`/`PinKeypad`, los chips de filtro y los botones de ícono de headers (perfil, búsqueda, +).
3. Implementa load-more en `TransactionsScreen` (el endpoint ya pagina con `page/limit`) y en los 4 detalles capados a 200 (payments de deuda, contributions, expenses/settlements de splits) con `offset` o paginación equivalente en el server.
4. En `StatsScreen`, cuando el filtro por tipo de cuenta esté activo y el usuario tenga cuentas en más de una moneda, muestra una nota "Cálculo local sin conversión de moneda".
5. Crea la pantalla "Ayuda" en el tab Más: correo de soporte (mailto), versión de la app (`expo-constants`) y enlaces a política de privacidad/términos.

Restricciones:
- No agregues dependencias salvo que sea estrictamente necesario y lo justifiques.
- No cambies comportamiento no relacionado.
- Mantén textos en espanol.
- Usa pnpm.
- Actualiza `PROJECT_CONTEXT.md` si cambias arquitectura, endpoints, schema, flujos o comportamiento.

Validacion:
- `cd mobile && pnpm typecheck` (y `cd server && pnpm typecheck` si tocas paginación en server).
- Verifica con TalkBack (o revisando props) los controles principales.
- Agrega o actualiza pruebas cuando el riesgo lo amerite.

Entrega:
- Resumen de cambios.
- Archivos modificados.
- Comandos ejecutados.
- Riesgos o pendientes.

### Prompt Fase 4 - Testing y QA

Lee primero `PROJECT_CONTEXT.md` (secciones "Reglas de balance", "Pagos recurrentes", "Tarjetas de crédito") y `AUDITORIA_LANZAMIENTO_Y_PLAN.md` (Fase 4 y "Suite minima recomendada").

Objetivo:
Crear la red de tests del núcleo financiero: unit tests puros, integración de flujos de dinero y tests de autorización (IDOR).

Tareas:
1. Instala `vitest` como devDependency en `server/` y agrega el script `"test": "vitest run"`.
2. Unit tests puros (sin DB): `utils/recurrence.ts` (daily/weekly/biweekly anclado/monthly con fin de mes/yearly; cursor; MAX_OCCURRENCES), `utils/installments.ts` (francesa con i=0, i>0, mora, tope al restante; y paridad numérica con `mobile/src/utils/installments.ts`), `utils/creditCardDebt.ts` (FIFO con pagos parciales, exactos y sobrantes), `utils/balance.ts`.
3. Tests de integración contra una DB de TEST (branch de Neon aparte; el setup debe **negarse a correr** si `DATABASE_URL` no contiene el identificador del branch de test): registro→transacción→saldo; transfer cross-currency; gasto con tarjeta→deuda automática→pago→cupo restaurado; aporte/retiro/edición de ahorro; settle parcial de split; export CSV→import→saldos idénticos; materializar recurrentes 2× = mismo estado.
4. Tests IDOR: con dos usuarios registrados, verifica que el usuario B recibe 404/403 al leer/editar/borrar recursos del usuario A en cada router de datos.
5. No toques código de producción salvo bugs que los tests descubran; si encuentras uno, repórtalo y corrígelo en commit separado.

Restricciones:
- No agregues dependencias salvo vitest (justificado) y lo estrictamente necesario.
- No cambies comportamiento no relacionado.
- Mantén textos en espanol.
- Usa pnpm.
- Actualiza `PROJECT_CONTEXT.md` si cambias arquitectura, endpoints, schema, flujos o comportamiento.

Validacion:
- `cd server && pnpm test` verde y `pnpm typecheck` en ambos paquetes.

Entrega:
- Resumen de cambios.
- Archivos modificados.
- Comandos ejecutados.
- Riesgos o pendientes.

### Prompt Fase 5 - DevOps, observabilidad y release

Lee primero `PROJECT_CONTEXT.md` (sección "PRODUCCIÓN"), `DEPLOY_AND_APK.md` y `AUDITORIA_LANZAMIENTO_Y_PLAN.md` (Fase 5).

Objetivo:
CI que proteja `main`, errores de producción visibles y proceso de release documentado.

Tareas:
1. Crea `.github/workflows/ci.yml`: en PR y push a `main`, corre `pnpm install` + `pnpm typecheck` en `server/` y `mobile/`, y `pnpm test` en `server/` (con secrets para la DB de test si los tests de integración lo requieren; si no hay secret, que corra solo los unit).
2. Integra Sentry: `@sentry/node` en el server (captura en `errorHandler` para 500s y en `safeCompensate` para "COMPENSACIÓN FALLIDA", con tags `endpoint`/`userId` pero SIN emails ni montos) y `sentry-expo` en el mobile (ErrorBoundary + errores fatales). El DSN va por env (`SENTRY_DSN`, opcional: si falta, no-op).
3. Configura una alerta en Sentry para el evento de compensación fallida.
4. Escribe `RUNBOOK.md`: cómo se despliega (merge a main → Render), cómo y quién corre migraciones en prod, cómo hacer rollback (redeploy de commit previo; las migraciones aditivas toleran código viejo), y cómo restaurar la DB desde Neon.
5. Actualiza `DEPLOY_AND_APK.md` con el estado real.

Restricciones:
- Solo las dependencias de Sentry (justificadas). Nada más.
- No cambies comportamiento no relacionado.
- Mantén textos en espanol.
- Usa pnpm.
- Actualiza `PROJECT_CONTEXT.md` si cambias arquitectura, endpoints, schema, flujos o comportamiento.

Validacion:
- `cd server && pnpm typecheck && pnpm test`; `cd mobile && pnpm typecheck`.
- El workflow de CI pasa en un PR de prueba.
- Un error 500 forzado en local con `SENTRY_DSN` de prueba llega a Sentry.

Entrega:
- Resumen de cambios.
- Archivos modificados.
- Comandos ejecutados.
- Riesgos o pendientes.

### Prompt Fase 6 - Preparacion comercial y app store

Lee primero `PROJECT_CONTEXT.md`, `mobile/app.json`, `mobile/eas.json` y `AUDITORIA_LANZAMIENTO_Y_PLAN.md` (Fase 6).

Objetivo:
Dejar la app lista para el track de testing cerrado de Google Play con identidad propia.

Tareas:
1. Pregunta al usuario el nombre definitivo de la app y actualiza `app.json` (`name`, considera si cambiar `slug`/`package` — ojo: cambiar `package` rompe updates de instalaciones previas; decidir con el usuario). Elimina toda referencia a "clone"/"Wallet by BudgetBakers" visible al usuario (README puede conservar el origen).
2. Verifica assets: ícono, adaptive icon y splash definitivos (si faltan, genera placeholders y lista lo que el usuario debe reemplazar).
3. Prepara el contenido de la ficha de Play en un `STORE_LISTING.md`: descripción corta/larga en español, categoría (Finanzas), y el borrador de respuestas del **Data Safety form** (datos recogidos: email, nombre, datos financieros ingresados; cifrado en tránsito: sí; borrado de cuenta: sí, con URL/flujo; sin compartición con terceros; sin SDK de publicidad).
4. Confirma que la URL de la política de privacidad (Fase 1) está publicada y referenciada.
5. Lanza `eas build -p android --profile production` (o deja el comando documentado si el usuario debe correrlo con su cuenta) y documenta el flujo de subida al testing interno.

Restricciones:
- No agregues dependencias salvo que sea estrictamente necesario y lo justifiques.
- No cambies comportamiento no relacionado.
- Mantén textos en espanol.
- Usa pnpm.
- Actualiza `PROJECT_CONTEXT.md` si cambias arquitectura, endpoints, schema, flujos o comportamiento.

Validacion:
- `cd mobile && pnpm typecheck` y `npx expo-doctor`.
- Build de producción instalable y funcional contra el backend de Render.

Entrega:
- Resumen de cambios.
- Archivos modificados.
- Comandos ejecutados.
- Riesgos o pendientes.

## Riesgos residuales

Aun implementando todo el plan, quedarían:

1. **Dependencia de un solo desarrollador y un solo entorno**: sin staging, todo cambio de DB se prueba directo contra prod (mitigable con branches de Neon, no eliminado).
2. **Supuesto de instancia única**: caché, rate limit y lock recurrente en memoria; escalar horizontalmente exige la Fase P3 (mover a DB).
3. **Recuperación de contraseña acoplada a Gmail SMTP personal**: límites de envío de Gmail y riesgo de bloqueo de la cuenta; para volumen real haría falta un proveedor transaccional (Resend/SES).
4. **Datos de recibos solo locales**: cambiar de teléfono pierde las fotos (decisión consciente); los usuarios lo percibirán como pérdida de datos si no se comunica.
5. **Historial de presupuestos previo al snapshot** seguirá siendo aproximado para meses ya transcurridos.
6. **Tasas de cambio de APIs gratuitas sin SLA** (y VES manual): montos consolidados dependen de fuentes no garantizadas; el diseño ya degrada con `stale`, pero el riesgo de tasa desactualizada persiste.
7. **Sin auditoría inmutable de operaciones**: un bug o acceso indebido que modifique transacciones no deja rastro forense (hard deletes).
8. **Compensaciones de saga**: `safeCompensate` reduce pero no elimina la ventana de inconsistencia si red y rollback fallan a la vez; la reconciliación (Fase 2) detecta, no previene.
9. **Revisión de Google Play**: apps de finanzas pueden recibir pedidos de documentación adicionales; el timeline de publicación no está bajo control del proyecto.

## Decision recomendada

**Hacer ahora (en este orden):**
1. **Fase 0** completa — es un día de trabajo y elimina dos crítios (H2, H3) y varios quick wins (H9, H10). Incluir el merge a `main` para que prod quede al día.
2. **Fase 1** (seguridad/privacidad) — H1 es lo primero que se toca: reactivar el reset es trivial en código y es el riesgo más grave para usuarios reales. Con Fase 1 cerrada, ampliar la beta cerrada con confianza.
3. **Fase 5 parcial en paralelo** (CI de typecheck + Sentry): barato y multiplica la seguridad de todo lo demás; no esperar a las fases 2-4 para tener visibilidad de errores.

**Después:** Fases 2 y 4 (consistencia + tests) antes de cualquier apertura al público; Fase 3 durante la beta con feedback real; Fase 6 al final, cuando exista decisión de branding.

**No hacer todavía:**
- No publicar en Play Store ni abrir registro público antes de cerrar Fases 0, 1, 4 y el fix de branding.
- No invertir en escalabilidad multi-instancia, certificate pinning, ofuscación ni monetización: nada del estado actual lo justifica.
- No migrar de stack ni reestructurar los routers grandes "porque sí" — hacerlo solo con la red de tests puesta (Fase 4) y como refactor dirigido (patrón A/B/C).

El proyecto está a **2-4 semanas de trabajo enfocado** de una beta cerrada ampliada sólida, y a **6-10 semanas** de una publicación responsable en Play Store.
