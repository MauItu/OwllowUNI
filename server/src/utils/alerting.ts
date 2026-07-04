import { env } from './validateEnv.js';

/**
 * Alertas operativas mínimas SIN dependencias: si `ALERT_WEBHOOK_URL` está
 * definida, los eventos críticos se POSTean a ese webhook (Discord, Slack o
 * ntfy.sh funcionan tal cual: el body incluye `content` para Discord y `text`
 * para Slack). Si no está definida, es un no-op silencioso (el console.error
 * estructurado sigue siendo la fuente en logs de Render).
 *
 * Es deliberadamente simple: fire-and-forget con timeout, nunca lanza, nunca
 * bloquea al caller. Para telemetría completa (breadcrumbs, agrupación,
 * releases) el siguiente paso es Sentry — ver RUNBOOK.md.
 */
export function sendAlert(title: string, payload: Record<string, unknown>): void {
  const url = env.ALERT_WEBHOOK_URL;
  if (!url) return;
  const detail = JSON.stringify(payload, null, 2).slice(0, 1500);
  const message = `🚨 ${title}\n\`\`\`json\n${detail}\n\`\`\``;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: message, text: message, title, ...payload }),
    signal: controller.signal,
  })
    .catch((err) => {
      console.error('[alerting] no se pudo enviar la alerta:', err?.message ?? err);
    })
    .finally(() => clearTimeout(timer));
}
