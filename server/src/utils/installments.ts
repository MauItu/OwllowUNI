/**
 * Utilidades de cuotas a crédito (amortización francesa) y mora.
 *
 * El interés del crédito se aplica MENSUAL sobre el saldo (cuota fija). La mora
 * se cobra MENSUAL sobre la cuota cuando el pago está vencido. Todos los montos
 * se redondean a 2 decimales (la fuente de verdad de los cálculos es el server).
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Cuota fija por amortización francesa.
 * i = monthlyRatePct/100; si i>0 → P·i / (1-(1+i)^-n); si i==0 → P/n.
 */
export function frenchInstallment(principal: number, monthlyRatePct: number, n: number): number {
  if (n <= 0 || principal <= 0) return 0;
  const i = (monthlyRatePct || 0) / 100;
  const raw = i > 0 ? (principal * i) / (1 - Math.pow(1 + i, -n)) : principal / n;
  return round2(raw);
}

/** Meses COMPLETOS entre dos fechas yyyy-MM-dd (>= 0). */
function monthsBetween(fromYmd: string, toYmd: string): number {
  const f = new Date(`${fromYmd}T00:00:00`);
  const t = new Date(`${toYmd}T00:00:00`);
  let months = (t.getFullYear() - f.getFullYear()) * 12 + (t.getMonth() - f.getMonth());
  if (t.getDate() < f.getDate()) months -= 1;
  return Math.max(0, months);
}

export interface DueInfoInput {
  remaining: number;
  installmentAmount: number | null;
  lateRatePct: number | null;
  dueDate: string | null; // yyyy-MM-dd (fecha límite de pago)
  today?: string; // yyyy-MM-dd (default: hoy)
  isPaidOff: boolean;
}

export interface DueInfo {
  /** El pago está vencido (hoy > fecha límite y la deuda no está saldada). */
  isOverdue: boolean;
  /** Mora acumulada sobre la cuota (0 si no hay vencimiento o no aplica tasa). */
  lateFee: number;
  /** Monto sugerido para el próximo pago: cuota (+ mora), topado al restante. */
  nextPaymentAmount: number;
}

/**
 * Calcula el estado de vencimiento y el monto sugerido del próximo pago. Si no hay
 * cuota definida (deuda de un solo pago), `nextPaymentAmount` cae al restante.
 */
export function computeDueInfo(input: DueInfoInput): DueInfo {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const isOverdue = !input.isPaidOff && input.dueDate != null && today > input.dueDate;

  let lateFee = 0;
  if (isOverdue && input.installmentAmount != null && input.lateRatePct) {
    const monthsLate = Math.max(1, monthsBetween(input.dueDate!, today));
    lateFee = round2(input.installmentAmount * (input.lateRatePct / 100) * monthsLate);
  }

  const base = input.installmentAmount != null ? input.installmentAmount + lateFee : input.remaining;
  // Nunca sugerir más que el restante (el endpoint de pago rechaza el sobrepago).
  const nextPaymentAmount = round2(Math.max(0, Math.min(input.remaining, base)));
  return { isOverdue, lateFee, nextPaymentAmount };
}
