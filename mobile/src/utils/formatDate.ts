import {
  format,
  isToday,
  isYesterday,
  isThisWeek,
  isThisYear,
  parseISO,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
} from 'date-fns';
import { es } from 'date-fns/locale';
import type { StatsPeriod } from '../types';

function toDate(d: string | Date): Date {
  return typeof d === 'string' ? parseISO(d.length <= 10 ? `${d}T00:00:00` : d) : d;
}

/** Etiqueta de grupo para listas: Hoy, Ayer, día de semana, fecha. */
export function groupLabel(dateStr: string): string {
  const d = toDate(dateStr);
  if (isToday(d)) return 'Hoy';
  if (isYesterday(d)) return 'Ayer';
  if (isThisWeek(d, { weekStartsOn: 1 })) return capitalize(format(d, 'EEEE', { locale: es }));
  if (isThisYear(d)) return format(d, "d 'de' MMMM", { locale: es });
  return format(d, "d 'de' MMMM yyyy", { locale: es });
}

export function formatShortDate(dateStr: string): string {
  return format(toDate(dateStr), "d MMM yyyy", { locale: es });
}

export function formatTime(timeStr: string): string {
  // timeStr viene como "HH:mm:ss" o "HH:mm"
  const [h, m] = timeStr.split(':');
  const hour = Number(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${m} ${ampm}`;
}

export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function nowTime(): string {
  return format(new Date(), 'HH:mm:ss');
}

export function isoFromDate(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

/** Convierte un 'yyyy-MM-dd' a Date local; si falla, devuelve hoy. */
export function parseISOSafe(dateStr?: string | null): Date {
  if (!dateStr) return new Date();
  const d = parseISO(dateStr.length <= 10 ? `${dateStr}T00:00:00` : dateStr);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Rango [from, to] en formato ISO para un período de estadísticas. */
export function periodRange(period: StatsPeriod, custom?: { from: Date; to: Date }): { from: string; to: string } {
  const now = new Date();
  switch (period) {
    case 'today':
      return { from: isoFromDate(now), to: isoFromDate(now) };
    case 'week':
      return {
        from: isoFromDate(startOfWeek(now, { weekStartsOn: 1 })),
        to: isoFromDate(endOfWeek(now, { weekStartsOn: 1 })),
      };
    case 'month':
      return { from: isoFromDate(startOfMonth(now)), to: isoFromDate(endOfMonth(now)) };
    case 'year':
      return { from: isoFromDate(startOfYear(now)), to: isoFromDate(endOfYear(now)) };
    case 'custom':
      if (custom) return { from: isoFromDate(custom.from), to: isoFromDate(custom.to) };
      return { from: isoFromDate(startOfMonth(now)), to: isoFromDate(endOfMonth(now)) };
  }
}

export function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  return { from: isoFromDate(startOfMonth(now)), to: isoFromDate(endOfMonth(now)) };
}

export { format };
