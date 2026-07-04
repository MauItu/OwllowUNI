# Auditoria de lanzamiento y plan de implementacion

> Auditoria ejecutada el 2026-07-04 sobre la rama `Corections-Senior`, HEAD `e13ac09`, siguiendo `PROMPT_AUDITORIA_LANZAMIENTO.md`.
> Alcance: solo auditoria y documentacion. No se modifico codigo de backend/mobile.

## Resumen ejecutivo

El proyecto tiene una base tecnica solida para una app de finanzas personales: backend Express/Drizzle con TypeScript, validacion de entorno, JWT, rate limiting, Helmet, CORS defensivo, guardas de propiedad multiusuario, migraciones versionadas, sagas con compensacion y una app Expo con flujos amplios de cuentas, transacciones, presupuestos, deudas, ahorros, splits, tasas, recurrentes, seguridad local con PIN/biometria e import/export.

Los dos typechecks pasan limpios y la configuracion mobile de release fue mejorada respecto al reporte anterior: `mobile/eas.json` ya inyecta `EXPO_PUBLIC_API_URL` tambien en `production`, `mobile/app.json` usa `userInterfaceStyle: "automatic"` y bloquea `android.permission.RECORD_AUDIO`.

Los bloqueos actuales para mercado no son de compilacion, sino de recuperacion de cuenta, privacidad/legal, base de datos, QA y operacion: la recuperacion de contrasena sigue deshabilitada por codigo y por falta de `GMAIL_*`, la DB consultada con el `.env` actual no tiene el constraint `accounts_balance_nonnegative`, no hay eliminacion de cuenta/export completo, no hay politica de privacidad/terminos, no hay tests ni CI, y no hay monitoreo de errores.

## Veredicto de lanzamiento

- Estado: Listo para beta cerrada con condiciones; no listo para produccion.
- Justificacion: la app compila y la arquitectura base es razonable, pero un usuario real puede quedar bloqueado permanentemente si olvida la contrasena, no existen garantias automatizadas del motor financiero, faltan obligaciones basicas de privacidad y no hay observabilidad de errores en campo.
- Condiciones minimas para avanzar al siguiente estado:
  - Reactivar y probar recuperacion de contrasena.
  - Aplicar/verificar migracion `0021_balance_nonnegative_guard.sql` en la DB correcta.
  - Agregar eliminacion de cuenta y export completo de datos.
  - Publicar politica de privacidad y terminos.
  - Crear suite minima de tests financieros y CI.
  - Configurar monitoreo de errores en server y mobile.

## Alcance revisado

- Archivos y areas revisadas:
  - Documentacion: `PROMPT_AUDITORIA_LANZAMIENTO.md`, `PROJECT_CONTEXT.md`, `README.md`, `DEPLOY_AND_APK.md`.
  - Backend: `server/package.json`, `server/src/index.ts`, `server/src/db/schema.ts`, `server/src/db/connection.ts`, `server/src/db/migrate.ts`, `server/src/routes/auth.ts`, `server/src/routes/password-reset.ts`, `server/src/routes/transactions.ts`, `server/src/services/recurring.ts`, `server/src/middleware/*`, `server/src/utils/*`, migracion `server/drizzle/0021_balance_nonnegative_guard.sql`.
  - Mobile: `mobile/package.json`, `mobile/eas.json`, `mobile/app.json`, `mobile/src/api/client.ts`, `mobile/src/navigation/AppNavigator.tsx`, `mobile/src/hooks/useAuth.tsx`, `mobile/src/services/security.ts`, `mobile/src/screens/ImportExportScreen.tsx`, componentes comunes y busquedas dirigidas de accesibilidad/observabilidad.
- Comandos ejecutados:
  - `cd server && pnpm typecheck` -> OK.
  - `cd mobile && pnpm typecheck` -> OK.
  - Consulta read-only a Neon via `pnpm exec tsx -e ...` -> conecto; `pg_constraint` no contiene `accounts_balance_nonnegative`; `drizzle.__drizzle_migrations` responde.
  - Busqueda de tests propios con `rg --files -g '!*node_modules*' -g '*.test.*' -g '*.spec.*'` -> sin resultados.
  - Busqueda de CI (`.github`, `.gitlab`, `.circleci`) -> sin resultados.
  - Busquedas dirigidas: `accessibilityLabel`, `Sentry`, `crashlytics`, `EXPO_PUBLIC_API_URL`, `RECORD_AUDIO`, `userInterfaceStyle`, `JWT_EXPIRATION`, endpoints de reset/export/delete.
- Comandos que no se pudieron ejecutar y por que:
  - La primera consulta con `tsx -e` fallo por top-level await en salida CJS; se repitio envuelta en funcion async.
  - La segunda consulta con `tsx` dentro del sandbox fallo por `EPERM` en pipe temporal; se repitio con aprobacion fuera del sandbox. Fue read-only.
  - No se ejecutaron tests porque no existen scripts ni archivos de prueba propios.
  - No se ejecuto build APK/EAS porque no es necesario para esta auditoria documental.
- Supuestos:
  - La DB consultada por el `.env` actual es la DB objetivo local/produccion que se quiere auditar.
  - El backend se despliega en Render y la app mobile apunta a `https://wallet-7v82.onrender.com/api`.
  - El mercado inicial es hispanohablante, probablemente Colombia por COP y documentacion.

## Hallazgos criticos

| ID | Severidad | Area | Hallazgo | Evidencia | Impacto | Recomendacion |
|---|---|---|---|---|---|---|
| H1 | Critica | Seguridad/Producto | Recuperacion de contrasena deshabilitada | `server/src/routes/password-reset.ts` devuelve 503 y `return` temprano en `/forgot-password`, `/verify-reset-code`, `/reset-password`; al importar env aparece `Recuperación de contraseña deshabilitada: faltan GMAIL_*` | Usuario que olvida la contrasena puede perder acceso permanente a sus datos financieros | Configurar `GMAIL_USER`/`GMAIL_APP_PASSWORD`, quitar los bypass temporales, descomentar link si sigue oculto y probar el flujo completo |
| H2 | Critica | Datos/Finanzas | La DB conectada no tiene el constraint `accounts_balance_nonnegative` | Consulta read-only a `pg_constraint` retorno `rows: []`; migracion existe en `server/drizzle/0021_balance_nonnegative_guard.sql` | Debitos concurrentes o errores de saga podrian dejar cuentas sin sobregiro en negativo si el guard no esta aplicado | Correr `cd server && pnpm db:migrate` contra la DB correcta, verificar `pg_constraint`, revisar saldos historicos y luego validar la constraint |
| H3 | Alta | Legal/Privacidad | No hay eliminacion de cuenta ni export completo del usuario | `server/src/routes/auth.ts` no expone DELETE de cuenta; `mobile/src/api/client.ts` solo exporta transacciones por `/transactions/export` | Bloquea publicacion seria en Play Store y derechos de habeas data/privacidad | Agregar export completo y `DELETE /api/auth/account` con confirmacion fuerte y cascada controlada |
| H4 | Alta | Legal/Producto | No hay politica de privacidad, terminos ni consentimiento explicito | No se encontraron pantallas/documentos legales; datos financieros se capturan desde registro/uso | Riesgo legal y de rechazo en tienda; baja confianza del usuario | Publicar politica/terminos, enlazarlos en registro y menu, guardar aceptacion con version |
| H5 | Alta | QA | No existen tests automatizados ni script `test` | `server/package.json` y `mobile/package.json` no tienen `test`; no hay `*.test.*`/`*.spec.*` propios | Regresiones financieras pueden llegar a usuarios sin deteccion | Agregar Vitest para utils/server y pruebas de integracion API sobre DB de test; luego CI |
| H6 | Alta | Observabilidad | No hay monitoreo de errores en server/mobile | Busqueda `Sentry|crashlytics` sin resultados; errores criticos van a `console.error` | Crashes del APK y compensaciones fallidas pueden pasar desapercibidos | Integrar Sentry o equivalente y alertas para `COMPENSACIÓN FALLIDA` |
| H7 | Alta | Sesion | JWT default de 30 dias sin revocacion | `server/src/utils/validateEnv.ts` define `JWT_EXPIRATION` default `30d`; `middleware/auth.ts` verifica stateless | Token robado sigue valido por largo tiempo; cambiar contrasena no cierra sesiones previas | Bajar expiracion en prod y agregar `tokenVersion`/revocacion en `users` |
| H8 | Media | Seguridad | Politica de contrasena inconsistente | Registro/perfil usan min 8 en `server/src/routes/auth.ts`; reset usa min 6 en `password-reset.ts` | El reset permite contrasenas mas debiles que el registro | Centralizar constante `MIN_PASSWORD_LENGTH = 8` |
| H9 | Media | Mobile/Accesibilidad | Accesibilidad incompleta en controles clave | Busqueda de `accessibilityLabel` sin resultados; tab bar y botones iconicos usan `Pressable` sin label | Usuarios con TalkBack tendran una experiencia deficiente | Agregar labels/roles/hints a tab bar, FAB, botones de header, calculadora, PIN, selects y acciones destructivas |
| H10 | Media | Datos/Import | Import de transacciones no es idempotente | `POST /api/transactions/import` valida e inserta batches, pero no hay hash/import id/dedupe; UI permite importar el mismo CSV de nuevo | Duplicar import mueve saldos dos veces y confunde al usuario | Agregar advertencia fuerte y/o deduplicacion por fingerprint |
| H11 | Media | Operacion | Render free/cold starts chocan con timeout mobile de 5s | `mobile/src/api/client.ts` usa `timeout: 5000`; `DEPLOY_AND_APK.md` reconoce wake-up de Render | Primer request puede fallar aunque el backend este sano | Subir timeout/retry o pasar Render a plan sin sleep |
| H12 | Baja | Docs | Documentacion de deploy tiene secciones desactualizadas | `DEPLOY_AND_APK.md` dice "No hay migraciones pendientes" y "0000->0009" aunque el repo tiene `0021`; tambien ya refleja otros fixes nuevos | Agentes futuros pueden tomar decisiones incorrectas | Actualizar guia de deploy con estado actual real |

## Arquitectura

### Fortalezas

- Separacion clara entre `server/` y `mobile/`.
- Backend organizado por rutas, middleware, servicios, utils y DB.
- Mobile con patron consistente de pantallas, hooks, servicios API, stores Zustand y componentes comunes.
- `PROJECT_CONTEXT.md` es una buena fuente de conocimiento para agentes y documenta decisiones importantes.
- Uso consistente de pnpm, TypeScript y Drizzle.
- El patron `db.batch` + saga + `safeCompensate` es pragmatico para Neon HTTP, donde no se usan transacciones interactivas.

### Riesgos

- Rutas backend muy grandes: `splits.ts` 1081 lineas, `debts.ts` 886, `transactions.ts` 847, `accounts.ts` 818. La logica financiera compleja queda concentrada y es dificil de testear.
- Tipos duplicados manualmente entre server y mobile en `mobile/src/types/index.ts`.
- Cache y locks en memoria asumen una sola instancia. Escalar horizontalmente romperia invalidacion/locks.
- `PROJECT_CONTEXT.md` puede quedar por delante o por detras del codigo; hay que mantenerlo como contrato vivo.

### Recomendaciones

- Extraer logica financiera repetida a servicios testeables: balance, transacciones enlazadas, pagos, conciliacion.
- Crear tests antes de refactors grandes.
- Documentar explicitamente "single instance only" o mover cache/locks a DB/Redis antes de escalar.
- Crear checks de contrato server/mobile o generar tipos compartidos en una fase futura.

## Backend y API

### Fortalezas

- `server/src/index.ts` importa validacion de entorno primero.
- Helmet, compression, CORS defensivo, rate limit global y rate limits especificos.
- Health check con DB en `/api/health`.
- Rutas protegidas con `authenticate`; auth/reset son publicas.
- `parseId` evita `Number(...)` inseguro para IDs.
- `ownership.ts` centraliza validaciones de propiedad para cuentas/categorias/tags.
- Errores 500 no filtran detalle al cliente.
- `transactions/export` e import tienen formato claro y manejo de errores por lote.

### Riesgos

- Reset de contrasena existe pero esta cortado por bypass temporal.
- Export solo cubre transacciones, no todo el grafo financiero del usuario.
- Import no deduplica.
- JWT stateless sin revocacion.
- `transactions/export` puede devolver todo el historico sin limite por rango.
- Motor recurrente usa lock en memoria y depende del proceso unico.

### Recomendaciones

- Reactivar reset y cubrirlo con prueba de integracion.
- Agregar endpoints de privacidad: export completo, borrar cuenta, descargar datos.
- Agregar limite/rango maximo o streaming para export grandes.
- Implementar revocacion de sesiones por `tokenVersion`.
- Crear job/script de reconciliacion de saldos.

## Seguridad

### Fortalezas

- `JWT_SECRET` obligatorio y minimo 32 caracteres.
- Algoritmo JWT fijado a HS256.
- bcrypt con rondas centralizadas.
- Rate limits en login, registro, reset, profile y backstop global.
- CORS cerrado en produccion si no hay origen permitido.
- SecureStore para token y PIN local.
- PIN con salt + SHA-256, lockout persistido, biometria opcional.
- Logs HTTP no incluyen body.

### Riesgos

- Recuperacion de contrasena deshabilitada.
- Reset permitiria min 6 si se reactiva.
- Sesiones largas sin revocacion.
- Falta verificacion de email.
- Falta politica de privacidad y consentimiento.
- No hay monitoreo/alerta de compensaciones fallidas.

### Checklist OWASP API

| Riesgo | Estado | Nota |
|---|---|---|
| Broken Object Level Authorization | Bien encaminado | Uso sistematico de `user_id` y guardas de ownership |
| Broken Authentication | Parcial | JWT solido, pero reset deshabilitado y sin revocacion |
| Broken Object Property Level Authorization | Bien | Zod limita inputs y no se expone `passwordHash` |
| Unrestricted Resource Consumption | Parcial | Rate limits y caps, pero export sin rango maximo |
| Broken Function Level Authorization | Bien | Rutas de datos montadas tras `authenticate`; no hay rutas admin activas |
| Unrestricted Sensitive Business Flows | Parcial | Registro/login limitados; sin verificacion de email |
| SSRF | Bajo | Fetch externos a proveedores fijos de tasas |
| Security Misconfiguration | Parcial | Buen hardening; falta legal/observabilidad y revisar env prod |
| Improper Inventory Management | Parcial | Documentacion de deploy necesita limpieza |
| Unsafe Consumption of APIs | Bien | Tasas externas con cache/fallback |

### Checklist OWASP MASVS mobile

| Area | Estado | Nota |
|---|---|---|
| Storage | Bien | Token/PIN en SecureStore; preferencias no sensibles en AsyncStorage |
| Crypto | Bien para alcance | PIN con salt + SHA-256; no hay criptografia casera compleja |
| Auth | Parcial | Bloqueo local bien; sesion backend larga |
| Network | Parcial | Produccion usa HTTPS; fallback dev HTTP LAN; sin certificate pinning |
| Platform | Mejorado | `RECORD_AUDIO` bloqueado; permisos declarados con mensajes |
| Code | Bien | TS, sin `eval`, dependencias conocidas |
| Resilience | Fuera de alcance | Sin anti-tamper/ofuscacion formal |
| Privacy | Insuficiente | Sin borrado de cuenta, politica, terminos ni consentimiento |

### Recomendaciones

- P0: reset de contrasena operativo y probado.
- P1: revocacion de tokens y expiracion menor.
- P1: privacidad/legal dentro de app.
- P2: verificacion de email.
- P2: hardening opcional mobile: pinning si el riesgo lo justifica.

## Base de datos y consistencia financiera

### Fortalezas

- Modelo amplio con FK, indices y migraciones versionadas.
- Montos en `decimal(15,2)` y tasas en `decimal(18,8)`.
- Tablas padre con `user_id`; hijas heredan propiedad por FK.
- Indices y constraints relevantes ya modelados en el repo.
- `0021_balance_nonnegative_guard.sql` documenta bien el cierre del TOCTOU de saldo.

### Riesgos

- La DB consultada no tiene `accounts_balance_nonnegative`.
- `current_balance` es materializado; sin reconciliacion automatizada se puede desviar si una saga compensa mal o si hubo bug historico.
- La constraint 0021 es `NOT VALID`; incluso aplicada, faltaria validar historico.
- Hard delete en varias entidades reduce trazabilidad/auditoria.
- Backups/restore no estan probados ni automatizados en el repo.

### Recomendaciones

- Aplicar/verificar `0021` antes de beta externa.
- Crear script `reconcile-balances` read-only y luego modo repair controlado.
- Documentar backup/restore Neon y probarlo.
- Considerar historial/audit log para acciones destructivas importantes.

## Mobile, UX y accesibilidad

### Fortalezas

- Flujos funcionales amplios para una app financiera: cuentas, transacciones, presupuestos, estadisticas, splits, deudas, ahorros, tasas, recurrentes, busqueda, seguridad e import/export.
- `eas.json` ya tiene `EXPO_PUBLIC_API_URL` en `preview` y `production`.
- `app.json` ya usa `userInterfaceStyle: "automatic"` y bloquea microfono.
- Seguridad local con PIN/biometria esta bien encapsulada.
- Tema, formateo de moneda y componentes comunes dan consistencia.
- Import/export tiene preview antes de importar.

### Riesgos

- Accesibilidad insuficiente: faltan labels/roles/hints en muchos controles.
- Timeout de 5s puede ser agresivo con Render free.
- No hay offline/cache local real para datos.
- Import puede duplicar datos sin advertencia fuerte.
- La recuperacion de contrasena aparece como flujo mobile registrado, pero backend devuelve 503.

### Recomendaciones

- Agregar accesibilidad a controles principales.
- Mejorar UX de cold start/red: retry, timeout mayor o mensaje "despertando servidor".
- Agregar confirmacion de import con advertencia de duplicados.
- Mostrar estado claro si reset esta temporalmente deshabilitado o reactivarlo antes de mostrarlo.

## Rendimiento y escalabilidad

### Fortalezas

- Indices documentados.
- Cache en proceso para GET caros con invalidacion por version de usuario.
- Caps defensivos de 200 en varias listas.
- Lazy loading de pantallas pesadas en navigation.
- `compression()` en backend.

### Riesgos

- Cache/locks en memoria no sirven para multiples instancias.
- Render free puede afectar UX por cold starts.
- Export historico completo puede crecer sin limite.
- Sin observabilidad no hay metricas de latencia/error por endpoint.

### Recomendaciones

- Para beta publica, usar instancia sin sleep o ajustar timeout/retry.
- Antes de escalar horizontalmente, mover locks/cache a DB/Redis.
- Agregar metricas basicas y trazas de endpoints caros.

## Calidad de codigo

### Fortalezas

- Typecheck limpio en server y mobile.
- Uso extendido de Zod en fronteras API.
- Servicios de seguridad, auth, notificaciones y recurring estan separados.
- Comentarios utiles en partes complejas.
- Constantes centralizadas para varios valores de dominio.

### Riesgos

- Complejidad alta en rutas grandes.
- Logica de negocio mezclada con handlers HTTP.
- Duplicacion manual de tipos server/mobile.
- Sin lint/format scripts declarados.

### Recomendaciones

- Agregar tests primero, luego extraer servicios.
- Agregar `lint` y `format:check` al CI.
- Reducir handlers largos por dominio, manteniendo contratos actuales.

## Testing y QA

### Estado actual

- No hay tests automatizados propios.
- No hay scripts `test`.
- No hay CI.
- Verificacion actual: typecheck manual y pruebas funcionales/manuales documentadas.

### Brechas

- Sin tests para balance, recurrencias, amortizacion, pagos de tarjeta, splits, import/export e IDOR.
- Sin tests de migraciones/constraints.
- Sin pruebas E2E mobile.
- Sin matriz formal de dispositivos Android.

### Suite minima recomendada

- Unit tests con Vitest para:
  - `server/src/utils/recurrence.ts`
  - `server/src/utils/installments.ts`
  - `server/src/utils/creditCardDebt.ts`
  - `server/src/utils/balance.ts`
  - `mobile/src/utils/csv.ts`
  - `mobile/src/utils/calculatorEngine.ts`
  - `mobile/src/utils/statsAggregation.ts`
- Integracion API contra DB de test para:
  - Auth/register/login/me.
  - Ownership/IDOR por cada router principal.
  - Transacciones y saldos.
  - Transferencias multi-moneda.
  - Deudas/tarjetas/estados de cuenta.
  - Ahorros y contribuciones.
  - Splits y liquidacion parcial.
  - Recurrentes idempotentes.
  - Import/export round-trip.
- CI:
  - `pnpm install --frozen-lockfile`
  - `cd server && pnpm typecheck && pnpm test`
  - `cd mobile && pnpm typecheck`

### Checklist manual pre-release

- Registro, login, logout, token vencido.
- Reset de contrasena completo.
- PIN setup, PIN incorrecto, lockout, biometria, desactivar PIN.
- Crear/editar/borrar transacciones, transferencias, recibos.
- Tarjeta de credito: compra, cuotas, deuda, pago, congelar.
- Presupuestos y alertas.
- Deudas/ahorros/splits con edicion y eliminacion.
- Importar CSV, exportar CSV/JSON, reintentar import.
- Modo claro/oscuro/sistema.
- Android fisico con red lenta y primer arranque contra Render.

## DevOps, despliegue y observabilidad

### Estado actual

- Backend preparado para Render con build `tsc` y start `node dist/index.js`.
- Mobile preparado con EAS `preview` APK y `production` app-bundle.
- `EXPO_PUBLIC_API_URL` ya esta en ambos perfiles.
- `.env` local ahora permite conectar a Neon para consulta read-only.
- No hay CI ni monitoreo.

### Brechas

- DB objetivo no tiene el constraint esperado.
- Guia de deploy mezcla estado viejo de migraciones con estado nuevo.
- No hay estrategia de secrets/rotacion documentada mas alla de `.env`/Render.
- No hay alertas por compensacion fallida ni crash reporting.
- No hay backup/restore probado.

### Recomendaciones

- Actualizar `DEPLOY_AND_APK.md`.
- Crear workflow CI basico.
- Agregar Sentry o equivalente.
- Agregar checklist de migracion: generar, aplicar, verificar DB, documentar.
- Probar restore de Neon antes de produccion.

## Preparacion para lanzar al mercado

### Lo que ya existe

- Producto funcional amplio para finanzas personales.
- Seguridad local con PIN/biometria.
- Autenticacion multiusuario.
- Export/import parcial de transacciones.
- Builds EAS configurados para preview y production.
- Backend deployable y health check.

### Lo que falta antes de beta cerrada

- Reset de contrasena operativo.
- Constraint de saldo aplicado/verificado.
- Monitoreo basico de errores.
- Checklist manual de QA ejecutado.
- Aviso claro de que es beta y canal de soporte.

### Lo que falta antes de produccion

- Eliminacion de cuenta.
- Export completo de datos.
- Politica de privacidad y terminos.
- Consentimiento en registro.
- Suite minima de tests y CI.
- Observabilidad real.
- Backup/restore probado.
- Revision de copy, branding y ficha Play Store.

### Riesgos legales, privacidad y soporte

- Datos financieros requieren una politica clara de tratamiento.
- Usuarios deben poder eliminar cuenta y solicitar/exportar datos.
- Debe existir canal de soporte y proceso de recuperacion de cuenta.
- Si se recopila analitica, debe ser minima, documentada y respetuosa de privacidad.

### Recomendaciones de producto

- Definir MVP publico: control financiero personal, presupuestos, recurrentes, tarjetas y export.
- Evitar monetizacion hasta estabilizar privacidad/QA.
- Preparar onboarding corto y soporte dentro de la app.
- Definir propuesta de valor: finanzas personales en espanol/COP, control local, seguridad, presupuestos y tarjetas.

## Backlog priorizado

| Prioridad | Item | Area | Severidad | Impacto | Esfuerzo | Dependencias | Criterio de aceptacion |
|---|---|---|---|---|---|---|---|
| P0 | Reactivar reset de contrasena | Seguridad | Critica | Evita bloqueo permanente de usuarios | Medio | Gmail SMTP/env | Endpoints devuelven 200/400 esperados; flujo mobile funciona |
| P0 | Aplicar/verificar constraint de saldo | Datos | Critica | Cierra TOCTOU financiero | Bajo/Medio | DB correcta | `pg_constraint` muestra `accounts_balance_nonnegative`; saldos historicos revisados |
| P0 | Monitoreo minimo de errores | DevOps | Alta | Visibilidad de fallos reales | Medio | Cuenta Sentry/alternativa | Errores backend/mobile llegan al dashboard |
| P1 | Eliminacion de cuenta | Privacidad | Alta | Requisito de tienda/privacidad | Medio/Alto | Decidir hard delete vs anonimizacion | Usuario puede borrar cuenta y datos asociados |
| P1 | Export completo de datos | Privacidad | Alta | Portabilidad y confianza | Medio | Modelo de datos | Descarga JSON/ZIP con todo el grafo del usuario |
| P1 | Politica/terminos/consentimiento | Legal | Alta | Publicacion en mercado | Medio | Texto legal | Links visibles y aceptacion registrada |
| P1 | Tests financieros minimos | QA | Alta | Evita regresiones | Alto | Vitest/DB test | CI corre tests y typecheck |
| P1 | Revocacion de sesiones | Seguridad | Alta | Reduce impacto de token robado | Medio | Migracion users | Cambio de contrasena invalida tokens previos |
| P2 | Accesibilidad mobile | UX | Media | Mejora inclusividad y calidad | Medio | Ninguna | TalkBack identifica tabs, botones y formularios |
| P2 | Import idempotente/dedupe | Datos | Media | Evita duplicados accidentales | Medio | Definir fingerprint | Reimportar mismo CSV no duplica o advierte claramente |
| P2 | Retry/timeout de red | UX | Media | Reduce errores por cold start | Bajo | Ninguna | Primer request lento no falla prematuramente |
| P2 | Actualizar docs deploy | Docs | Baja | Evita errores operativos | Bajo | Hallazgos actuales | Guia refleja migraciones 0000->0021 y estado real |
| P3 | Tipos compartidos/generados | Arquitectura | Media | Reduce drift server/mobile | Alto | Decidir herramienta | Contratos API no se duplican manualmente |

## Plan de implementacion para Claude o Codex

### Fase 0: estabilizacion y verificaciones base

- Objetivo: dejar el repo y la DB en estado verificable.
- Archivos probables a modificar: `DEPLOY_AND_APK.md`, quizas ninguno de codigo; migracion ya existe.
- Pasos concretos:
  - Confirmar DB objetivo.
  - Ejecutar `cd server && pnpm db:migrate`.
  - Consultar `pg_constraint` para `accounts_balance_nonnegative`.
  - Revisar saldos negativos historicos e intentar `ALTER TABLE accounts VALIDATE CONSTRAINT accounts_balance_nonnegative`.
  - Actualizar docs de deploy con estado actual.
- Riesgos: aplicar migraciones contra DB equivocada.
- Validaciones: typecheck server/mobile; query de constraint.
- Comandos de prueba: `cd server && pnpm typecheck`, `cd mobile && pnpm typecheck`.
- Criterios de aceptacion: DB tiene constraint, docs actualizadas, sin fallos de typecheck.

### Fase 1: seguridad y privacidad

- Objetivo: cerrar bloqueos de cuenta, privacidad y sesiones.
- Archivos probables a modificar: `server/src/routes/password-reset.ts`, `server/src/utils/constants.ts`, `server/src/routes/auth.ts`, `server/src/db/schema.ts`, migraciones, `mobile/src/screens/LoginScreen.tsx`, pantallas de seguridad/legal.
- Pasos concretos:
  - Reactivar reset quitando bypass temporal.
  - Configurar `GMAIL_*`.
  - Unificar password min 8.
  - Agregar `tokenVersion` y revocacion al cambiar contrasena.
  - Agregar export completo y delete account.
  - Agregar links/aceptacion de politica y terminos.
- Riesgos: borrar datos por error; romper login/reset.
- Validaciones: pruebas manuales auth/reset/delete/export; typecheck.
- Comandos de prueba: `cd server && pnpm typecheck`, `cd mobile && pnpm typecheck`.
- Criterios de aceptacion: usuario recupera cuenta, puede exportar/borrar datos, sesiones viejas se invalidan.

### Fase 2: consistencia financiera y backend

- Objetivo: blindar saldos y operaciones financieras.
- Archivos probables a modificar: `server/src/routes/transactions.ts`, `server/src/routes/accounts.ts`, `server/src/routes/debts.ts`, `server/src/routes/splits.ts`, nuevos utils/services.
- Pasos concretos:
  - Crear script read-only de reconciliacion de saldos.
  - Agregar pruebas para balance, pagos, tarjetas, splits y recurrentes.
  - Evaluar dedupe de import.
  - Considerar snapshots de presupuestos.
- Riesgos: cambios en logica sensible.
- Validaciones: tests unit/integration, typecheck.
- Comandos de prueba: `cd server && pnpm typecheck && pnpm test`.
- Criterios de aceptacion: pruebas cubren casos financieros criticos y reconciliacion detecta divergencias.

### Fase 3: UX mobile y accesibilidad

- Objetivo: mejorar uso real y accesibilidad.
- Archivos probables a modificar: `mobile/src/navigation/AppNavigator.tsx`, `mobile/src/components/common.tsx`, pantallas con acciones principales, `mobile/src/api/client.ts`, `ImportExportScreen.tsx`.
- Pasos concretos:
  - Agregar `accessibilityLabel`, `accessibilityRole`, `accessibilityHint`.
  - Mejorar timeout/retry/mensaje de red.
  - Agregar advertencia de duplicados en import.
  - Revisar estados vacios/error de flujos criticos.
- Riesgos: cambios visuales pequenos pueden afectar layout.
- Validaciones: typecheck mobile, prueba manual con TalkBack.
- Comandos de prueba: `cd mobile && pnpm typecheck`.
- Criterios de aceptacion: flujos principales son navegables con lector de pantalla y errores de red son comprensibles.

### Fase 4: testing y QA

- Objetivo: crear red de seguridad automatizada.
- Archivos probables a modificar: `server/package.json`, `mobile/package.json`, `server/src/**/*.test.ts`, `mobile/src/**/*.test.ts`, config Vitest.
- Pasos concretos:
  - Instalar/configurar Vitest.
  - Agregar unit tests de utils puros.
  - Agregar integracion API con DB de test.
  - Crear checklist manual versionado.
- Riesgos: setup de DB test lento o fragil.
- Validaciones: tests en local y CI.
- Comandos de prueba: `cd server && pnpm test`, `cd server && pnpm typecheck`, `cd mobile && pnpm typecheck`.
- Criterios de aceptacion: CI falla si se rompe nucleo financiero.

### Fase 5: DevOps, observabilidad y release

- Objetivo: preparar operacion real.
- Archivos probables a modificar: `.github/workflows/*`, `server/src/index.ts`, config Sentry, docs.
- Pasos concretos:
  - Crear CI.
  - Integrar Sentry o equivalente.
  - Agregar alertas para compensaciones fallidas.
  - Documentar backup/restore.
  - Definir proceso de release y rollback.
- Riesgos: exponer secrets si se configura mal.
- Validaciones: CI verde; error de prueba llega a monitoreo; restore probado en entorno seguro.
- Comandos de prueba: comandos CI y health checks.
- Criterios de aceptacion: cada PR corre typecheck/tests y errores productivos son visibles.

### Fase 6: preparacion comercial y app store

- Objetivo: convertir la app en producto lanzable.
- Archivos probables a modificar: pantallas legales/soporte, `mobile/app.json`, assets, docs de Play Store.
- Pasos concretos:
  - Crear politica, terminos, soporte/contacto.
  - Preparar ficha Play Store, screenshots y descripcion.
  - Definir beta cerrada, feedback y roadmap.
  - Revisar branding y textos.
- Riesgos: claims financieros imprecisos o politica incompleta.
- Validaciones: checklist Play Store, revision legal minima.
- Comandos de prueba: `cd mobile && pnpm typecheck`, build EAS preview/production.
- Criterios de aceptacion: app cumple requisitos de tienda y tiene soporte/privacidad claros.

## Prompts de ejecucion sugeridos

### Prompt Fase 0 - Estabilizacion y DB

Lee primero `PROJECT_CONTEXT.md`, `DEPLOY_AND_APK.md`, `server/drizzle/0021_balance_nonnegative_guard.sql`, `server/src/db/migrate.ts` y `server/src/db/schema.ts`.

Objetivo:
Verificar y estabilizar migraciones/base de datos sin cambiar comportamiento de la app.

Tareas:
1. Confirma que el `.env` apunta a la DB correcta.
2. Ejecuta `cd server && pnpm db:migrate`.
3. Verifica con SQL que existe `accounts_balance_nonnegative`.
4. Revisa si hay saldos negativos en cuentas sin sobregiro.
5. Si es seguro, valida la constraint.
6. Actualiza `DEPLOY_AND_APK.md` y `PROJECT_CONTEXT.md` si cambia el estado documentado.

Restricciones:
- No cambies codigo no relacionado.
- No borres ni corrijas saldos automaticamente sin mostrar primero el diagnostico.
- Usa pnpm.

Validacion:
- `cd server && pnpm typecheck`
- `cd mobile && pnpm typecheck`

Entrega:
- Resumen de DB/migraciones.
- SQL ejecutado.
- Archivos modificados.
- Riesgos o pendientes.

### Prompt Fase 1 - Seguridad y privacidad

Lee primero `PROJECT_CONTEXT.md`, `server/src/routes/auth.ts`, `server/src/routes/password-reset.ts`, `server/src/middleware/auth.ts`, `server/src/utils/validateEnv.ts`, `mobile/src/screens/LoginScreen.tsx` y `mobile/src/api/client.ts`.

Objetivo:
Reactivar recuperacion de contrasena y cerrar brechas de privacidad/sesion.

Tareas:
1. Quita los bypass temporales de reset.
2. Unifica minimo de contrasena en 8.
3. Agrega revocacion de sesiones al cambiar contrasena.
4. Agrega export completo de datos del usuario.
5. Agrega eliminacion de cuenta con confirmacion fuerte.
6. Agrega UI/legal minima para privacidad/terminos si aplica.
7. Actualiza `PROJECT_CONTEXT.md`.

Restricciones:
- No cambies comportamiento financiero no relacionado.
- No agregues dependencias salvo justificacion fuerte.
- Mantén textos en espanol.
- Usa pnpm.

Validacion:
- `cd server && pnpm typecheck`
- `cd mobile && pnpm typecheck`
- Agrega tests si configuras runner.

Entrega:
- Resumen de cambios.
- Archivos modificados.
- Comandos ejecutados.
- Riesgos o pendientes.

### Prompt Fase 2 - Consistencia financiera

Lee primero `PROJECT_CONTEXT.md`, `server/src/routes/transactions.ts`, `server/src/routes/accounts.ts`, `server/src/routes/debts.ts`, `server/src/routes/splits.ts`, `server/src/services/recurring.ts`, `server/src/utils/balance.ts`, `server/src/utils/creditCardDebt.ts` y `server/src/utils/installments.ts`.

Objetivo:
Crear verificaciones y pruebas para proteger saldos y operaciones financieras.

Tareas:
1. Agrega script read-only de reconciliacion de saldos.
2. Agrega tests unitarios para utils financieros.
3. Agrega pruebas de integracion para transacciones, tarjetas, deudas, ahorros, splits y recurrentes.
4. Evalua deduplicacion de import.
5. Actualiza `PROJECT_CONTEXT.md`.

Restricciones:
- No refactorices handlers grandes hasta tener tests.
- No cambies schema sin migracion.
- Usa pnpm.

Validacion:
- `cd server && pnpm typecheck`
- `cd server && pnpm test`

Entrega:
- Resumen de cambios.
- Archivos modificados.
- Comandos ejecutados.
- Riesgos o pendientes.

### Prompt Fase 3 - UX mobile y accesibilidad

Lee primero `PROJECT_CONTEXT.md`, `mobile/src/navigation/AppNavigator.tsx`, `mobile/src/components/common.tsx`, `mobile/src/api/client.ts`, `mobile/src/screens/ImportExportScreen.tsx` y pantallas principales.

Objetivo:
Mejorar accesibilidad, errores de red y claridad de import/export.

Tareas:
1. Agrega labels/roles/hints de accesibilidad en controles principales.
2. Mejora UX de timeout/cold start.
3. Agrega advertencia o confirmacion fuerte para reimportar CSV.
4. Revisa botones iconicos y acciones destructivas.
5. Actualiza `PROJECT_CONTEXT.md` si cambia comportamiento.

Restricciones:
- No redisenes toda la app.
- No agregues dependencias salvo necesidad clara.
- Mantén textos en espanol.
- Usa pnpm.

Validacion:
- `cd mobile && pnpm typecheck`
- Prueba manual con TalkBack si es posible.

Entrega:
- Resumen de cambios.
- Archivos modificados.
- Comandos ejecutados.
- Riesgos o pendientes.

### Prompt Fase 4 - Testing y CI

Lee primero `PROJECT_CONTEXT.md`, `server/package.json`, `mobile/package.json` y los utils financieros.

Objetivo:
Agregar suite minima de pruebas y CI.

Tareas:
1. Configura runner de tests.
2. Agrega tests unitarios de utils puros.
3. Agrega tests de integracion API si hay DB de test disponible.
4. Crea workflow CI con typecheck y tests.
5. Documenta como correr la suite.

Restricciones:
- No uses la DB de produccion para tests destructivos.
- No agregues dependencias innecesarias.
- Usa pnpm.

Validacion:
- `cd server && pnpm typecheck && pnpm test`
- `cd mobile && pnpm typecheck`

Entrega:
- Resumen de cambios.
- Archivos modificados.
- Comandos ejecutados.
- Riesgos o pendientes.

### Prompt Fase 5 - Observabilidad y release

Lee primero `PROJECT_CONTEXT.md`, `server/src/index.ts`, `server/src/utils/safeCompensate.ts`, `DEPLOY_AND_APK.md`, `mobile/app.json` y `mobile/eas.json`.

Objetivo:
Preparar operacion real con monitoreo, alertas, backup y release.

Tareas:
1. Integra monitoreo de errores en server y mobile.
2. Agrega alerta/documentacion para `COMPENSACIÓN FALLIDA`.
3. Documenta backup/restore de Neon.
4. Define checklist de release/rollback.
5. Actualiza docs.

Restricciones:
- No expongas secrets.
- No cambies logica financiera.
- Usa pnpm.

Validacion:
- `cd server && pnpm typecheck`
- `cd mobile && pnpm typecheck`
- Verificar evento de error de prueba en monitoreo.

Entrega:
- Resumen de cambios.
- Archivos modificados.
- Comandos ejecutados.
- Riesgos o pendientes.

### Prompt Fase 6 - Preparacion comercial

Lee primero `PROJECT_CONTEXT.md`, `README.md`, `DEPLOY_AND_APK.md`, `mobile/app.json` y pantallas de registro/menu.

Objetivo:
Preparar la app para beta externa y tienda.

Tareas:
1. Crear textos/links de privacidad, terminos y soporte.
2. Agregar pantalla legal/acerca de.
3. Agregar consentimiento en registro.
4. Preparar checklist Play Store.
5. Documentar roadmap MVP publico.

Restricciones:
- No hagas claims financieros/regulatorios que la app no cumple.
- Mantén textos en espanol.
- Usa pnpm.

Validacion:
- `cd mobile && pnpm typecheck`
- Revision manual de registro/menu/legal.

Entrega:
- Resumen de cambios.
- Archivos modificados.
- Comandos ejecutados.
- Riesgos o pendientes.

## Riesgos residuales

- Aunque se apliquen P0/P1, una app financiera sin auditoria externa de seguridad mantiene riesgo residual.
- El modelo de saldos materializados requiere reconciliacion continua.
- Las operaciones saga nunca tienen las mismas garantias que una transaccion interactiva larga.
- Render/Neon gratuitos pueden afectar experiencia y confiabilidad.
- Multi-moneda, presupuestos historicos e import/export pueden tener casos borde no cubiertos hasta crear tests.
- El cumplimiento legal depende del pais objetivo y debe revisarse con criterio legal real antes de produccion.

## Decision recomendada

No lanzar a produccion todavia. El siguiente movimiento pragmatico es:

1. Cerrar P0: reset de contrasena, constraint de saldo y monitoreo basico.
2. Ejecutar una beta cerrada con usuarios conocidos y checklist manual.
3. Antes de Play Store publica: privacidad/terminos, eliminacion/export completo, tests financieros y CI.
4. Despues, mejorar accesibilidad, import idempotente y observabilidad avanzada.
