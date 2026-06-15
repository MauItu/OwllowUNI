/**
 * Cálculo PURO de fechas de cobro de una regla recurrente. Sin acceso a DB para
 * poder testearlo de forma aislada y reusarlo (server materializa, el mobile puede
 * derivar la "próxima fecha"). Todas las fechas se manejan como `yyyy-MM-dd` y se
 * parsean a medianoche LOCAL para evitar corrimientos de zona horaria.
 */

export type Frequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';

export interface RecurrenceSpec {
  frequency: Frequency;
  /** Día del mes 1-31 (monthly/yearly). Si el mes no lo tiene → último día del mes. */
  dayOfMonth: number | null;
  /** Día de la semana 0-6 (domingo=0) para weekly/biweekly. */
  dayOfWeek: number | null;
  /** Ancla de la regla (yyyy-MM-dd). biweekly cuenta cada 14 días desde aquí. */
  startDate: string;
  /** Fin de vigencia (yyyy-MM-dd) o null = indefinida. */
  endDate: string | null;
}

const MS_PER_DAY = 86_400_000;
/** Tope defensivo de ocurrencias por cálculo (evita backfills patológicos). */
const MAX_OCCURRENCES = 1000;

/** yyyy-MM-dd → Date a medianoche local. */
export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Date → yyyy-MM-dd (local). */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

/** Diferencia en días enteros (b - a), ambos a medianoche local. */
function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

/**
 * Fechas de cobro de la regla en `(afterDate, today]` (excluye `afterDate`, incluye
 * `today`), respetando `startDate` y `endDate`. `afterDate` es el cursor de
 * idempotencia (`last_generated_date`): así dos llamadas seguidas no duplican.
 *
 * Devuelve un arreglo ordenado ascendente de `yyyy-MM-dd`.
 */
export function computeOccurrences(spec: RecurrenceSpec, afterDate: string, today: string): string[] {
  const start = parseYmd(spec.startDate);
  const todayD = parseYmd(today);
  // Límite superior: hoy, acotado por endDate si existe.
  let upper = todayD;
  if (spec.endDate) {
    const end = parseYmd(spec.endDate);
    if (end.getTime() < upper.getTime()) upper = end;
  }
  // Límite inferior (exclusivo del cursor): el día siguiente a afterDate, pero
  // nunca antes de startDate.
  const afterPlusOne = addDays(parseYmd(afterDate), 1);
  const lower = afterPlusOne.getTime() > start.getTime() ? afterPlusOne : start;

  if (lower.getTime() > upper.getTime()) return [];

  const out: string[] = [];
  const push = (d: Date) => {
    if (out.length < MAX_OCCURRENCES) out.push(ymd(d));
  };

  switch (spec.frequency) {
    case 'daily': {
      for (let d = lower; d.getTime() <= upper.getTime(); d = addDays(d, 1)) push(d);
      break;
    }
    case 'weekly': {
      const dow = spec.dayOfWeek ?? start.getDay();
      const offset = (dow - lower.getDay() + 7) % 7;
      for (let d = addDays(lower, offset); d.getTime() <= upper.getTime(); d = addDays(d, 7)) push(d);
      break;
    }
    case 'biweekly': {
      // Anclado en startDate: cada 14 días. Primera ocurrencia >= lower.
      const gap = diffDays(start, lower);
      const k = gap <= 0 ? 0 : Math.ceil(gap / 14);
      for (let d = addDays(start, k * 14); d.getTime() <= upper.getTime(); d = addDays(d, 14)) push(d);
      break;
    }
    case 'monthly': {
      const dom = spec.dayOfMonth ?? start.getDate();
      // Recorre mes a mes desde el mes de `lower` hasta el de `upper`.
      let year = lower.getFullYear();
      let month0 = lower.getMonth();
      const lastYear = upper.getFullYear();
      const lastMonth0 = upper.getMonth();
      while (year < lastYear || (year === lastYear && month0 <= lastMonth0)) {
        const day = Math.min(dom, daysInMonth(year, month0));
        const occ = new Date(year, month0, day);
        if (occ.getTime() >= lower.getTime() && occ.getTime() <= upper.getTime()) push(occ);
        month0 += 1;
        if (month0 > 11) {
          month0 = 0;
          year += 1;
        }
        if (out.length >= MAX_OCCURRENCES) break;
      }
      break;
    }
    case 'yearly': {
      // El día day_of_month del mes de startDate, una vez al año.
      const month0 = start.getMonth();
      const dom = spec.dayOfMonth ?? start.getDate();
      for (let year = lower.getFullYear(); year <= upper.getFullYear(); year += 1) {
        const day = Math.min(dom, daysInMonth(year, month0));
        const occ = new Date(year, month0, day);
        if (occ.getTime() >= lower.getTime() && occ.getTime() <= upper.getTime()) push(occ);
        if (out.length >= MAX_OCCURRENCES) break;
      }
      break;
    }
  }

  return out;
}

/**
 * Próxima fecha de cobro estrictamente posterior a `fromDate` (o null si la regla
 * ya venció). Útil para mostrar "próxima fecha" en la UI. Busca hasta ~2 años
 * adelante para cubrir la frecuencia anual.
 */
export function nextOccurrence(spec: RecurrenceSpec, fromDate: string): string | null {
  const horizon = addDays(parseYmd(fromDate), 366 * 2);
  const occ = computeOccurrences(spec, fromDate, ymd(horizon));
  return occ.length > 0 ? occ[0] : null;
}
