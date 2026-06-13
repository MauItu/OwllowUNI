import nodemailer from 'nodemailer';
import { ApiError } from '../middleware/errorHandler.js';

// Envío de emails vía Gmail SMTP (Nodemailer). Requiere dos variables de entorno:
//   GMAIL_USER          → la dirección de Gmail que envía (también es el `from`).
//   GMAIL_APP_PASSWORD  → una "contraseña de aplicación" de 16 caracteres generada
//                         en la cuenta de Google (NO la contraseña normal; requiere 2FA).
// Si faltan, los endpoints de recuperación responden 503 (no se crashea el server).

/**
 * Lanza si faltan las credenciales de Gmail. Se llama al inicio de
 * `forgot-password` (antes de buscar el usuario) para que el error de
 * configuración sea uniforme y no revele si el email existe.
 */
export function assertEmailConfigured(): void {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new ApiError(
      503,
      'El servicio de correo no está configurado (faltan GMAIL_USER y/o GMAIL_APP_PASSWORD).',
    );
  }
}

const RESET_EMAIL_SUBJECT = 'Código de recuperación — Wallet Clone';

/** HTML sencillo con el código de 6 dígitos bien visible y aviso de expiración. */
function resetEmailHtml(code: string): string {
  return `
  <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #212529;">
    <h1 style="font-size: 20px; margin: 0 0 8px;">Recuperá tu contraseña</h1>
    <p style="font-size: 15px; color: #6C757D; margin: 0 0 24px;">
      Usá este código en la app de Wallet Clone para crear una nueva contraseña:
    </p>
    <div style="background: #F1D7E2; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
      <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #A8336B;">${code}</span>
    </div>
    <p style="font-size: 14px; color: #6C757D; margin: 0;">
      El código expira en <strong>15 minutos</strong>. Si no solicitaste este cambio,
      podés ignorar este correo: tu contraseña no se modificará.
    </p>
  </div>`;
}

/**
 * Envía el email con el código de recuperación vía Gmail SMTP. Lanza `ApiError`
 * si faltan las credenciales (503) o si el envío falla (502), en lugar de crashear.
 */
export async function sendResetCodeEmail(to: string, code: string): Promise<void> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new ApiError(
      503,
      'El servicio de correo no está configurado (faltan GMAIL_USER y/o GMAIL_APP_PASSWORD).',
    );
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  });

  try {
    await transporter.sendMail({
      from: user,
      to,
      subject: RESET_EMAIL_SUBJECT,
      html: resetEmailHtml(code),
    });
  } catch (err) {
    // El detalle se loguea en el servidor; al cliente solo un mensaje genérico.
    console.error('Error enviando email de recuperación:', err);
    throw new ApiError(502, 'No se pudo enviar el correo de recuperación.');
  }
}
