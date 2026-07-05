/**
 * Textos legales embebidos en la app (la app no puede leer los .md del repo en
 * runtime). La copia canónica del repositorio vive en `PRIVACY.md` y `TERMS.md`
 * de la raíz: si cambias algo aquí, actualiza también esos archivos.
 */

export const LEGAL_VERSION = '2026-07-04';

export interface LegalSection {
  title: string;
  body: string;
}

export interface LegalDoc {
  title: string;
  updatedAt: string;
  sections: LegalSection[];
}

export const PRIVACY_POLICY: LegalDoc = {
  title: 'Política de privacidad',
  updatedAt: '4 de julio de 2026',
  sections: [
    {
      title: '1. Responsable del tratamiento',
      body:
        'Owllow es una aplicación de registro de finanzas personales desarrollada de forma independiente. ' +
        'Responsable del tratamiento de datos: el desarrollador de la app. Contacto: mauiturriza@gmail.com.',
    },
    {
      title: '2. Qué datos recogemos',
      body:
        'Datos de cuenta: correo electrónico, nombre y contraseña (almacenada únicamente como hash bcrypt; nunca en texto claro).\n\n' +
        'Datos financieros que tú ingresas voluntariamente: cuentas, saldos, transacciones, categorías, etiquetas, presupuestos, ' +
        'metas de ahorro, deudas y préstamos, gastos compartidos, reglas recurrentes y tasas de cambio manuales. Estos datos existen ' +
        'solo porque tú los registras; la app no accede a bancos ni a otras fuentes externas de tu información financiera.\n\n' +
        'Datos que NUNCA salen de tu dispositivo: el PIN de bloqueo (hash con sal en el almacenamiento seguro del sistema), los datos ' +
        'biométricos (los gestiona tu sistema operativo), las fotos de recibos (solo en el almacenamiento local del teléfono) y tus ' +
        'preferencias de apariencia y notificaciones.\n\n' +
        'Datos que NO recogemos: ubicación, contactos, micrófono, publicidad, identificadores de seguimiento ni analítica de terceros. ' +
        'La app no contiene SDK de publicidad ni de tracking.',
    },
    {
      title: '3. Para qué usamos tus datos',
      body:
        'Exclusivamente para prestar el servicio: sincronizar tu información entre tu dispositivo y tu cuenta, calcular saldos y ' +
        'estadísticas, y enviarte el código de recuperación de contraseña por correo si lo solicitas.\n\n' +
        'No vendemos, alquilamos ni compartimos tus datos con terceros. No usamos tus datos financieros con fines publicitarios ' +
        'ni de perfilamiento.',
    },
    {
      title: '4. Dónde se almacenan',
      body:
        'Tus datos se almacenan cifrados en tránsito (HTTPS/TLS) en infraestructura de terceros que actúan como encargados del ' +
        'tratamiento: base de datos PostgreSQL en Neon y servidor de la API en Render (infraestructura en Estados Unidos). ' +
        'Los correos de recuperación se envían a través de Gmail SMTP.',
    },
    {
      title: '5. Tus derechos (habeas data, Ley 1581 de 2012 — Colombia)',
      body:
        'Tienes derecho a conocer, actualizar, rectificar y suprimir tus datos, y a revocar la autorización de tratamiento. ' +
        'Puedes ejercerlos directamente desde la app:\n\n' +
        '• Exportar todos tus datos: Mi cuenta → "Descargar mis datos" (recibes un archivo JSON con toda tu información).\n' +
        '• Eliminar tu cuenta y todos tus datos: Mi cuenta → "Eliminar cuenta". El borrado es inmediato, completo e irreversible.\n\n' +
        'También puedes escribir a mauiturriza@gmail.com para cualquier consulta o reclamo sobre tus datos.',
    },
    {
      title: '6. Conservación',
      body:
        'Conservamos tus datos mientras tu cuenta exista. Al eliminar tu cuenta, todos tus datos se borran de la base de datos de ' +
        'forma inmediata en una única operación atómica. Las copias de seguridad de infraestructura del proveedor expiran según su ciclo normal.',
    },
    {
      title: '7. Seguridad',
      body:
        'Contraseñas con hash bcrypt, sesiones con tokens firmados (JWT) con expiración y revocación, cifrado en tránsito (TLS), ' +
        'aislamiento estricto por usuario en cada consulta y limitación de intentos de acceso. El bloqueo local con PIN/biometría ' +
        'añade una capa adicional en tu dispositivo.',
    },
    {
      title: '8. Menores de edad',
      body: 'La app no está dirigida a menores de 14 años y no recogemos deliberadamente datos de menores.',
    },
    {
      title: '9. Cambios a esta política',
      body:
        'Si cambiamos esta política de forma sustancial, lo notificaremos dentro de la app antes de que el cambio entre en vigor. ' +
        'La versión vigente siempre está disponible en la app.',
    },
  ],
};

export const TERMS: LegalDoc = {
  title: 'Términos y condiciones',
  updatedAt: '4 de julio de 2026',
  sections: [
    {
      title: '1. El servicio',
      body:
        'Owllow es una aplicación de registro de finanzas personales: te permite anotar y organizar tus cuentas, gastos, ingresos, ' +
        'presupuestos, deudas, ahorros y gastos compartidos.\n\n' +
        'Owllow NO es una entidad financiera. No maneja dinero real, no ejecuta pagos ni transferencias, no se conecta a bancos y no ' +
        'ofrece asesoría financiera, tributaria ni de inversión. Todos los saldos y cálculos (intereses, cuotas, conversiones de ' +
        'moneda, estadísticas) son informativos y se basan exclusivamente en los datos que tú ingresas.',
    },
    {
      title: '2. Tu cuenta',
      body:
        'Debes proporcionar un correo válido y mantener la confidencialidad de tu contraseña y de tu PIN. Eres responsable de la ' +
        'actividad realizada con tus credenciales. Puedes eliminar tu cuenta en cualquier momento desde la app (Mi cuenta → Eliminar ' +
        'cuenta); el borrado de tus datos es inmediato e irreversible.',
    },
    {
      title: '3. Uso aceptable',
      body:
        'Te comprometes a no intentar acceder a datos de otros usuarios, no interferir con el funcionamiento del servicio, no realizar ' +
        'ingeniería inversa con fines maliciosos y no usar la app para actividades ilícitas.',
    },
    {
      title: '4. Tus datos',
      body:
        'Tus datos te pertenecen. Puedes exportarlos en cualquier momento (Mi cuenta → Descargar mis datos). El tratamiento de datos ' +
        'personales se rige por la Política de privacidad.',
    },
    {
      title: '5. Disponibilidad y estado del servicio',
      body:
        'El servicio se ofrece "tal cual" y actualmente se encuentra en fase beta. No garantizamos disponibilidad continua ni ausencia ' +
        'de errores. Te recomendamos exportar tus datos periódicamente. Podemos suspender temporalmente el servicio por mantenimiento.',
    },
    {
      title: '6. Limitación de responsabilidad',
      body:
        'En la máxima medida permitida por la ley: (a) la app no es responsable de decisiones financieras que tomes con base en la ' +
        'información registrada o calculada; (b) no somos responsables de pérdidas derivadas de datos ingresados incorrectamente; ' +
        '(c) la responsabilidad total, de existir, se limita al monto pagado por el servicio (hoy: cero, el servicio es gratuito).',
    },
    {
      title: '7. Terminación',
      body:
        'Podemos suspender cuentas que violen estos términos. Tú puedes dejar de usar el servicio y eliminar tu cuenta cuando quieras.',
    },
    {
      title: '8. Cambios',
      body:
        'Si cambiamos estos términos de forma sustancial, lo notificaremos dentro de la app. Continuar usando la app tras el aviso ' +
        'implica aceptación de los nuevos términos.',
    },
    {
      title: '9. Ley aplicable',
      body: 'Estos términos se rigen por las leyes de la República de Colombia.',
    },
    {
      title: '10. Contacto',
      body: 'mauiturriza@gmail.com',
    },
  ],
};
