# Prompt para auditoria integral y plan de lanzamiento

Usa este prompt con Claude, Codex u otro modelo avanzado para auditar este repositorio y producir un reporte Markdown accionable.

---

## Rol

Actua como un equipo senior combinado de:

- Arquitecto de software.
- Tech lead full-stack.
- Especialista en seguridad de aplicaciones financieras.
- Auditor de UX/UI mobile.
- Product manager para lanzamiento comercial.
- Ingeniero DevOps/QA.

Tu trabajo es evaluar este proyecto como si fuera una app real de finanzas personales que se quiere lanzar al mercado.

## Contexto del proyecto

Repositorio: app tipo wallet/gastos personales.

Stack principal:

- Monorepo con `server/` y `mobile/`.
- Backend: Node.js, Express, TypeScript, Drizzle ORM, PostgreSQL/Neon.
- Mobile: Expo SDK 54, React Native, TypeScript.
- Autenticacion: JWT, bcrypt, SecureStore en mobile.
- Dominio: gestion de cuentas, transacciones, categorias, tags, presupuestos, ahorros, deudas, splits, tarjetas de credito, tasas de cambio, reglas recurrentes, insights, import/export y seguridad local con PIN/biometria.
- Idioma de producto: espanol.
- Moneda principal por defecto: COP.
- Package manager: pnpm.

Archivos de contexto que debes leer primero:

1. `PROJECT_CONTEXT.md`
2. `README.md`
3. `server/package.json`
4. `mobile/package.json`
5. `server/src/index.ts`
6. `server/src/db/schema.ts`
7. `mobile/src/api/client.ts`
8. `mobile/src/navigation/AppNavigator.tsx`
9. Los archivos relevantes dentro de `server/src/routes/`, `server/src/middleware/`, `server/src/utils/`, `mobile/src/screens/`, `mobile/src/hooks/`, `mobile/src/services/`, `mobile/src/stores/` y `mobile/src/components/`.

No asumas que la documentacion esta 100% actualizada. Contrasta `PROJECT_CONTEXT.md` contra el codigo real.

## Objetivo

Genera un archivo Markdown llamado:

`AUDITORIA_LANZAMIENTO_Y_PLAN.md`

Ese archivo debe contener una evaluacion integral del proyecto, recomendaciones priorizadas y un plan de implementacion para que Claude o Codex puedan ejecutar los cambios encontrados.

No implementes cambios de codigo durante esta auditoria salvo que el usuario lo pida explicitamente. Tu salida principal es el reporte Markdown.

## Metodologia obligatoria

1. Inspecciona la estructura general del repositorio.
2. Lee la documentacion existente y verifica si coincide con el codigo.
3. Revisa backend, mobile, seguridad, datos, UX, pruebas, despliegue y preparacion comercial.
4. Ejecuta comandos de verificacion cuando sea posible:
   - `cd server && pnpm typecheck`
   - `cd mobile && pnpm typecheck`
   - Revisa scripts disponibles en ambos `package.json`.
   - Si existen pruebas, identifica como correrlas. Si no existen, marca la brecha.
5. No inventes hallazgos. Cada hallazgo importante debe referenciar archivos o rutas concretas.
6. Distingue entre:
   - Problemas confirmados en codigo.
   - Riesgos probables.
   - Recomendaciones de producto.
   - Supuestos pendientes de validar.
7. Prioriza por impacto real en lanzamiento.

## Criterios de evaluacion

Evalua como minimo estas areas:

### 1. Arquitectura

- Separacion de responsabilidades entre backend, mobile, hooks, servicios, rutas, middleware y utilidades.
- Consistencia de patrones existentes.
- Acoplamiento entre pantallas, hooks, stores y API.
- Escalabilidad del backend y del modelo de datos.
- Uso correcto de Drizzle, migraciones y queries.
- Manejo de estados complejos en mobile.
- Posibles duplicaciones o abstracciones faltantes.
- Riesgo de deuda tecnica por archivos demasiado grandes, logica repetida o contratos no tipados.

### 2. Backend y API

- Diseno REST y consistencia de endpoints.
- Validacion de inputs.
- Manejo de errores.
- Autorizacion por usuario y aislamiento multiusuario.
- Paginacion, filtros, limites y queries costosas.
- Atomicidad de operaciones financieras.
- Consistencia de saldos, transacciones, presupuestos, deudas, ahorros, splits y recurrencias.
- Idempotencia donde aplique.
- Cache e invalidacion.
- Riesgos con concurrencia.
- Compatibilidad con Neon/serverless.

### 3. Seguridad

Evalua con mentalidad de producto financiero:

- Autenticacion, expiracion y manejo de JWT.
- Hashing de contrasenas.
- Proteccion de secretos y variables de entorno.
- Rate limiting.
- CORS.
- Headers de seguridad.
- Validacion y sanitizacion de parametros.
- Prevencion de IDOR/multi-tenant data leaks.
- Seguridad de SecureStore, PIN y biometria.
- Manejo de sesion en mobile.
- Logs con datos sensibles.
- Recuperacion de contrasena.
- Import/export de datos.
- Riesgos de fraude o manipulacion de saldos.
- Requisitos de privacidad y proteccion de datos.
- Checklist OWASP API Security Top 10 y OWASP MASVS para mobile, adaptado al alcance del proyecto.

### 4. Base de datos y modelo financiero

- Integridad referencial.
- Indices.
- Constraints.
- Decimales y precision monetaria.
- Monedas y tasas de cambio.
- Migraciones.
- Soft delete vs hard delete.
- Auditoria historica.
- Consistencia de balances.
- Recalculo y reparacion de datos.
- Backups y recuperacion.

### 5. Mobile / UX / UI

- Navegacion.
- Flujos principales: onboarding, login, home, transacciones, cuentas, presupuestos, deudas, ahorros, splits, estadisticas, busqueda, seguridad, import/export.
- Claridad visual para una app financiera.
- Estados de carga, vacios, error y offline.
- Accesibilidad.
- Localizacion.
- Formatos de fecha, moneda y numeros.
- Ergonomia para uso repetido.
- Manejo de teclado, formularios, confirmaciones y acciones destructivas.
- Consistencia de componentes, iconos, colores y tema claro/oscuro.
- Riesgos de confusion financiera para el usuario.

### 6. Rendimiento y escalabilidad

- Queries y N+1.
- Paginacion.
- Cache.
- Tiempo de arranque mobile.
- Re-renderizados innecesarios.
- Tamano de bundle.
- Sincronizacion de datos.
- Uso offline o degradacion sin red.
- Costos operativos en hosting/serverless.

### 7. Calidad de codigo

- TypeScript estricto y tipos compartidos.
- Validaciones con schemas.
- Naming.
- Manejo de errores.
- Complejidad ciclomática aproximada.
- Duplicacion.
- Separacion UI/logica.
- Consistencia entre backend y cliente.
- Comentarios y documentacion.
- Riesgo de bugs por conversiones de tipos, fechas o montos.

### 8. Testing y QA

- Unit tests necesarios.
- Integration tests de API.
- Tests de flujos financieros.
- Tests de seguridad/autorizacion.
- Tests de mobile/componentes.
- E2E recomendados.
- Fixtures y datos de prueba.
- Pruebas manuales criticas antes de publicar.
- Matriz de dispositivos Android.
- Regression checklist.

### 9. DevOps, despliegue y observabilidad

- Configuracion de entornos.
- Build backend.
- Build APK/EAS.
- CI/CD recomendado.
- Migrations en produccion.
- Logs estructurados.
- Monitoreo de errores.
- Metricas.
- Health checks.
- Backups.
- Rollback.
- Versionado.
- Feature flags si aplica.

### 10. Producto y lanzamiento al mercado

Evalua que le falta para lanzar la app a usuarios reales:

- Propuesta de valor y diferenciacion.
- Onboarding comercial.
- Politicas de privacidad y terminos.
- Consentimiento para datos financieros.
- Soporte/contacto.
- Eliminacion de cuenta y exportacion de datos.
- Analitica de producto respetando privacidad.
- App store readiness.
- Branding.
- Notificaciones.
- Internacionalizacion futura.
- Monetizacion si aplica.
- Compliance basico segun mercado objetivo.
- Roadmap minimo para MVP publico.
- Riesgos reputacionales.

## Formato del reporte final

Genera el archivo `AUDITORIA_LANZAMIENTO_Y_PLAN.md` con esta estructura exacta:

```md
# Auditoria de lanzamiento y plan de implementacion

## Resumen ejecutivo

Breve evaluacion del estado general del proyecto, nivel de preparacion para mercado y principales riesgos.

## Veredicto de lanzamiento

- Estado: No listo / Listo con condiciones / Listo para beta cerrada / Listo para produccion
- Justificacion
- Condiciones minimas para avanzar al siguiente estado

## Alcance revisado

- Archivos y areas revisadas
- Comandos ejecutados
- Comandos que no se pudieron ejecutar y por que
- Supuestos

## Hallazgos criticos

Tabla:
| ID | Severidad | Area | Hallazgo | Evidencia | Impacto | Recomendacion |

Severidades:
- Critica: bloquea lanzamiento o expone datos/dinero.
- Alta: riesgo serio de seguridad, perdida de datos, inconsistencia financiera o UX grave.
- Media: afecta mantenibilidad, confiabilidad o conversion.
- Baja: mejora deseable.

## Arquitectura

### Fortalezas
### Riesgos
### Recomendaciones

## Backend y API

### Fortalezas
### Riesgos
### Recomendaciones

## Seguridad

### Fortalezas
### Riesgos
### Checklist OWASP API
### Checklist OWASP MASVS mobile
### Recomendaciones

## Base de datos y consistencia financiera

### Fortalezas
### Riesgos
### Recomendaciones

## Mobile, UX y accesibilidad

### Fortalezas
### Riesgos
### Recomendaciones

## Rendimiento y escalabilidad

### Fortalezas
### Riesgos
### Recomendaciones

## Calidad de codigo

### Fortalezas
### Riesgos
### Recomendaciones

## Testing y QA

### Estado actual
### Brechas
### Suite minima recomendada
### Checklist manual pre-release

## DevOps, despliegue y observabilidad

### Estado actual
### Brechas
### Recomendaciones

## Preparacion para lanzar al mercado

### Lo que ya existe
### Lo que falta antes de beta cerrada
### Lo que falta antes de produccion
### Riesgos legales, privacidad y soporte
### Recomendaciones de producto

## Backlog priorizado

Tabla:
| Prioridad | Item | Area | Severidad | Impacto | Esfuerzo | Dependencias | Criterio de aceptacion |

Usa prioridades:
- P0: obligatorio antes de cualquier beta externa.
- P1: obligatorio antes de produccion.
- P2: importante para mejorar calidad/conversion.
- P3: mejora futura.

## Plan de implementacion para Claude o Codex

Divide el trabajo en fases ejecutables.

Para cada fase incluye:
- Objetivo.
- Archivos probables a modificar.
- Pasos concretos.
- Riesgos.
- Validaciones.
- Comandos de prueba.
- Criterios de aceptacion.

Debe incluir como minimo:
- Fase 0: estabilizacion y verificaciones base.
- Fase 1: seguridad y privacidad.
- Fase 2: consistencia financiera y backend.
- Fase 3: UX mobile y accesibilidad.
- Fase 4: testing y QA.
- Fase 5: DevOps, observabilidad y release.
- Fase 6: preparacion comercial y app store.

## Prompts de ejecucion sugeridos

Incluye prompts listos para copiar y pegar en Claude/Codex, uno por fase.
Cada prompt debe:
- Dar contexto del proyecto.
- Pedir cambios concretos.
- Pedir no tocar areas no relacionadas.
- Pedir typecheck/tests.
- Pedir actualizar `PROJECT_CONTEXT.md` si cambia arquitectura, API o comportamiento.
- Pedir resumen final con archivos modificados y validaciones.

## Riesgos residuales

Lista de riesgos que seguirian existiendo despues de implementar el plan.

## Decision recomendada

Recomendacion final: que hacer ahora, que no hacer todavia, y orden sugerido.
```

## Reglas de calidad del reporte

- Escribe en espanol.
- Se directo, tecnico y accionable.
- No uses relleno.
- No des recomendaciones genericas sin relacionarlas con este repo.
- Referencia archivos concretos cuando sea posible.
- Si no puedes confirmar algo, dilo explicitamente.
- Prioriza seguridad, integridad financiera y privacidad sobre mejoras visuales.
- Considera que el objetivo es una app real, no solo una demo.
- El plan debe ser implementable por otro agente sin tener que reinterpretar la auditoria.

## Reglas para prompts de ejecucion

En la seccion `Prompts de ejecucion sugeridos`, cada prompt debe tener este formato:

```md
### Prompt Fase N - Nombre

Lee primero `PROJECT_CONTEXT.md` y los archivos relacionados con esta fase.

Objetivo:
...

Tareas:
1. ...
2. ...
3. ...

Restricciones:
- No agregues dependencias salvo que sea estrictamente necesario y lo justifiques.
- No cambies comportamiento no relacionado.
- Mantén textos en espanol.
- Usa pnpm.
- Actualiza `PROJECT_CONTEXT.md` si cambias arquitectura, endpoints, schema, flujos o comportamiento.

Validacion:
- `cd server && pnpm typecheck` cuando toque backend.
- `cd mobile && pnpm typecheck` cuando toque mobile.
- Agrega o actualiza pruebas cuando el riesgo lo amerite.

Entrega:
- Resumen de cambios.
- Archivos modificados.
- Comandos ejecutados.
- Riesgos o pendientes.
```

## Importante

Si encuentras problemas criticos que puedan exponer datos de usuarios, romper saldos, permitir acceso entre usuarios, filtrar tokens, perder informacion financiera o bloquear recuperacion de cuentas, ponlos al inicio del reporte y marcalos como P0.

El reporte debe servir para tomar una decision real de lanzamiento y para que Claude o Codex implementen las mejoras por fases.
