# Política de privacidad — Owllow

**Última actualización: 4 de julio de 2026**


## 1. Responsable del tratamiento

Owllow es una aplicación de registro de finanzas personales desarrollada de forma independiente.
Responsable del tratamiento de datos: el desarrollador de la app.
Contacto: **mauiturriza@gmail.com**.

## 2. Qué datos recogemos

**Datos de cuenta:** correo electrónico, nombre y contraseña (almacenada únicamente como hash bcrypt; nunca en texto claro).

**Datos financieros que tú ingresas voluntariamente:** cuentas, saldos, transacciones, categorías, etiquetas, presupuestos, metas de ahorro, deudas y préstamos, gastos compartidos, reglas recurrentes y tasas de cambio manuales. Estos datos existen solo porque tú los registras; la app no accede a bancos ni a otras fuentes externas de tu información financiera.

**Datos que NUNCA salen de tu dispositivo:** el PIN de bloqueo (se guarda como hash con sal en el almacenamiento seguro del sistema), los datos biométricos (los gestiona tu sistema operativo; la app solo recibe el resultado de la verificación), las fotos de recibos (se guardan solo en el almacenamiento local del teléfono) y tus preferencias de apariencia y notificaciones.

**Datos que NO recogemos:** ubicación, contactos, micrófono, publicidad, identificadores de seguimiento ni analítica de terceros. La app no contiene SDK de publicidad ni de tracking.

## 3. Para qué usamos tus datos

Exclusivamente para prestar el servicio: sincronizar tu información entre tu dispositivo y tu cuenta, calcular saldos y estadísticas, y enviarte el código de recuperación de contraseña por correo si lo solicitas.

No vendemos, alquilamos ni compartimos tus datos con terceros. No usamos tus datos financieros con fines publicitarios ni de perfilamiento.

## 4. Dónde se almacenan

Tus datos se almacenan cifrados en tránsito (HTTPS/TLS) en infraestructura de terceros que actúan como encargados del tratamiento: base de datos PostgreSQL en **Neon** y servidor de la API en **Render** (infraestructura en Estados Unidos). Los correos de recuperación se envían a través de **Gmail SMTP**.

## 5. Tus derechos (habeas data, Ley 1581 de 2012 — Colombia)

Tienes derecho a conocer, actualizar, rectificar y suprimir tus datos, y a revocar la autorización de tratamiento. Puedes ejercerlos directamente desde la app:

- **Exportar todos tus datos:** Mi cuenta → "Descargar mis datos" (recibes un archivo JSON con toda tu información).
- **Eliminar tu cuenta y todos tus datos:** Mi cuenta → "Eliminar cuenta". El borrado es inmediato, completo e irreversible.

También puedes escribir a **mauiturriza@gmail.com** para cualquier consulta o reclamo sobre tus datos.

## 6. Conservación

Conservamos tus datos mientras tu cuenta exista. Al eliminar tu cuenta, todos tus datos se borran de la base de datos de forma inmediata en una única operación atómica. Las copias de seguridad de infraestructura del proveedor expiran según su ciclo normal.

## 7. Seguridad

Contraseñas con hash bcrypt, sesiones con tokens firmados (JWT) con expiración y revocación, cifrado en tránsito (TLS), aislamiento estricto por usuario en cada consulta, y limitación de intentos de acceso (rate limiting). El bloqueo local con PIN/biometría añade una capa adicional en tu dispositivo.

## 8. Menores de edad

La app no está dirigida a menores de 14 años y no recogemos deliberadamente datos de menores.

## 9. Cambios a esta política

Si cambiamos esta política de forma sustancial, lo notificaremos dentro de la app antes de que el cambio entre en vigor. La versión vigente siempre está disponible en la app.
