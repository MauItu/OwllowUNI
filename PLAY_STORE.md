# Owllow — Material de Google Play Store

> Ficha de la tienda, respuestas del formulario Data Safety y checklist de publicación.
> Los textos respetan la restricción de no hacer claims financieros/regulatorios (ver TERMS.md §1).

## 1. Ficha de la tienda

### Título (máx. 30 caracteres)

```
Owllow: Finanzas personales
```

*(27 caracteres)*

### Descripción breve (máx. 80 caracteres)

```
Registra gastos, presupuestos y deudas. Sin anuncios, sin rastreo.
```

*(66 caracteres)*

### Descripción completa (máx. 4000 caracteres)

```
Owllow es tu búho financiero: registra y organiza tus finanzas personales con claridad, sin anuncios y sin rastreadores.

🦉 QUÉ PUEDES HACER

• Cuentas y tarjetas: bancos, efectivo, billeteras digitales y tarjetas de crédito con cupo, fecha de corte y día de pago.
• Gastos e ingresos: registro rápido con categorías, etiquetas, notas y foto del recibo.
• Compras a cuotas: gastos con tarjeta diferidos a cuotas, con interés mensual si aplica.
• Cuota de manejo: configúrala una vez y Owllow la registra automáticamente cada mes.
• Pagos recurrentes: suscripciones, arriendo, servicios — se registran solos en su fecha.
• Presupuestos: por categoría o globales, con alertas de progreso.
• Deudas y préstamos: lo que debes y lo que te deben, con abonos parciales.
• Metas de ahorro: define objetivos y aporta a tu ritmo.
• Gastos compartidos: divide cuentas con amigos o pareja y liquida saldos.
• Multi-moneda: cuentas en distintas monedas con tasas de cambio manuales.
• Estadísticas: gráficos claros de en qué se va tu dinero, mes a mes.
• Exporta tus datos cuando quieras (JSON/CSV). Son tuyos.

🔒 PRIVACIDAD PRIMERO

• Sin anuncios. Sin SDK de publicidad ni de rastreo.
• No accedemos a tus bancos: solo existe lo que tú registras.
• Bloqueo con PIN y biometría en tu dispositivo.
• Puedes exportar o borrar todos tus datos desde la app, cuando quieras.

📌 IMPORTANTE

Owllow es una app de REGISTRO de finanzas personales. No es una entidad financiera: no maneja dinero real, no ejecuta pagos ni transferencias, no se conecta a bancos y no ofrece asesoría financiera. Todos los cálculos son informativos y se basan en los datos que tú ingresas.

Sabiduría para tus finanzas. 🦉
```

### Metadatos

| Campo | Valor |
|---|---|
| Categoría | Finanzas |
| Etiquetas | finanzas personales, gastos, presupuesto |
| Email de contacto | mauiturriza@gmail.com |
| Clasificación de contenido (IARC) | Apto para todos; sin contenido generado por usuarios visible entre usuarios, sin compras (hoy), sin ubicación |
| Público objetivo | 18+ (evita el escrutinio extra de "familias"; la app declara no dirigirse a menores de 14) |
| Precio | Gratis |

### URL de política de privacidad (REQUISITO BLOQUEANTE)

Google Play exige una **URL pública** de la política de privacidad; el archivo del repo no basta.
Los archivos ya están listos en `docs/` (index, privacidad, terminos). Para publicarlos:
GitHub → Settings → Pages → Source: "Deploy from a branch" → rama `main`, carpeta `/docs`.
La URL quedará como `https://<usuario>.github.io/<repo>/privacidad`.

## 2. Formulario Data Safety (respuestas exactas)

Basado en PRIVACY.md y el comportamiento real del código (verificado jul-2026).

**¿Tu app recopila o comparte datos de usuario?** Sí (recopila; NO comparte).

| Tipo de dato | ¿Recopilado? | ¿Compartido? | ¿Opcional? | Propósito |
|---|---|---|---|---|
| Información personal → Email | Sí | No | No (requerido para cuenta) | Funcionalidad de la app, gestión de cuenta |
| Información personal → Nombre | Sí | No | No | Funcionalidad de la app |
| Información financiera → Otra info financiera | Sí | No | Sí (el usuario la ingresa voluntariamente) | Funcionalidad de la app |
| Fotos | **No** (los recibos se guardan solo en el dispositivo; nunca se suben) | — | — | — |
| Ubicación, contactos, IDs de dispositivo, historial web, audio | No | — | — | — |

**Prácticas de seguridad:**
- ¿Los datos se cifran en tránsito? **Sí** (HTTPS/TLS).
- ¿Los usuarios pueden solicitar la eliminación de datos? **Sí** — desde la app: Mi cuenta → Eliminar cuenta (borrado inmediato e irreversible). Marcar también "eliminación de cuenta dentro de la app".
- ¿Los datos son procesados de forma efímera? No.
- ¿Comparte datos con terceros? **No.** (Neon/Render/Gmail actúan como encargados del tratamiento, no como receptores independientes — en el formulario esto NO cuenta como "compartir".)

## 3. Assets gráficos pendientes

| Asset | Especificación | Estado |
|---|---|---|
| Ícono de la tienda | 512×512 PNG, 32-bit | ⬜ Pendiente (generar con el prompt del logo) |
| Feature graphic | 1024×500 PNG/JPG | ⬜ Pendiente (búho + "Sabiduría para tus finanzas") |
| Screenshots teléfono | Mín. 2 (recom. 4-8), lado menor ≥320px | ⬜ Pendiente — sugeridos: Home con saldo, transacciones, presupuestos, tarjeta de crédito con cuotas, gastos compartidos, stats |
| Ícono de la app (`mobile/assets/icon.png`) | 1024×1024 | ⬜ Reemplazar por el logo final |
| Adaptive icon (`adaptive-icon.png`) | Foreground con safe zone | ⬜ Reemplazar |
| Splash (`splash-icon.png`) | Fondo ya es #0F0F14 | ⬜ Reemplazar |

## 4. Checklist de publicación

**Antes de subir el primer build:**
- [ ] Cuenta de Google Play Console ($25 USD, pago único).
- [ ] Publicar política de privacidad en URL pública (GitHub Pages).
- [ ] Reparar cuentas 11 y 15 y validar constraint `accounts_balance_nonnegative` (ver RUNBOOK).
- [ ] Sentry o equivalente para crashes del APK (RUNBOOK lo marca pendiente).
- [ ] Reemplazar assets con el logo final de Owllow.
- [ ] `eas build --platform android --profile production` (genera .aab; la API URL ya está en eas.json).
- [ ] Verificar que el .aab abre, registra y sincroniza contra producción.

**En Play Console:**
- [ ] Ficha de la tienda (textos de arriba) + assets.
- [ ] Formulario Data Safety (sección 2).
- [ ] Clasificación de contenido (cuestionario IARC).
- [ ] Declaración de público objetivo (18+).
- [ ] **Closed testing:** cuentas personales nuevas requieren 12 testers activos durante 14 días continuos antes de poder solicitar acceso a producción. Empezar esto CUANTO ANTES: es el cuello de botella del calendario.
- [ ] Tras los 14 días: solicitar acceso a producción y llenar el cuestionario de Google.

**Después del lanzamiento:**
- [ ] Monitorear webhook de alertas y Play Console → Android vitals.
- [ ] Backups: dump lógico periódico de Neon (RUNBOOK §Backups) antes de crecer usuarios.
