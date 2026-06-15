/**
 * Cuota fija por amortización francesa (interés mensual sobre saldo). Espejo de
 * `server/src/utils/installments.ts` para mostrar la cuota en vivo en los formularios.
 * El cálculo definitivo lo hace el servidor (fuente de verdad).
 *
 * i = monthlyRatePct/100; si i>0 → P·i / (1-(1+i)^-n); si i==0 → P/n.
 */
export function frenchInstallment(principal: number, monthlyRatePct: number, n: number): number {
  if (n <= 0 || principal <= 0) return 0;
  const i = (monthlyRatePct || 0) / 100;
  const raw = i > 0 ? (principal * i) / (1 - Math.pow(1 + i, -n)) : principal / n;
  return Math.round(raw * 100) / 100;
}
