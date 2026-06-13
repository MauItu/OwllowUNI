import { Resend } from 'resend';
import { ApiError } from '../middleware/errorHandler.js';

// Remitente del email. En el free tier de Resend, sin dominio verificado, el
// único `from` permitido es el dominio compartido `onboarding@resend.dev`.
// Cuando verifiques tu propio dominio en resend.com, cámbialo a algo como
// `Wallet Clone <noreply@tudominio.com>`.
const FROM = 'Wallet Clone <onboarding@resend.dev>';

/**
 * Lanza si `RESEND_API_KEY` no está configurada. Se llama al inicio de
 * `forgot-password` (antes de buscar el usuario) para que el error de
 * configuración sea uniforme y no revele si el email existe.
 */
export function assertEmailConfigured(): void {
  if (!process.env.RESEND_API_KEY) {
    throw new ApiError(
      503,
      'El servicio de correo no está configurado (falta RESEND_API_KEY).',
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
 * Envía el email con el código de recuperación. Lanza `ApiError` si Resend
 * falla (clave inválida, dominio no permitido, etc.) en lugar de crashear.
 */
export async function sendResetCodeEmail(to: string, code: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new ApiError(503, 'El servicio de correo no está configurado (falta RESEND_API_KEY).');
  }
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: RESET_EMAIL_SUBJECT,
    html: resetEmailHtml(code),
  });
  if (error) {
    // El detalle se loguea en el servidor; al cliente solo un mensaje genérico.
    console.error('Error enviando email de recuperación:', error);
    throw new ApiError(502, 'No se pudo enviar el correo de recuperación.');
  }
}
