import { currencyInfo } from './currencies';

/**
 * Agrupación manual de miles al estilo es-CO ('.' miles, ',' decimales).
 * Fallback por si `Intl.NumberFormat` no está disponible/locale-limitado en Hermes.
 */
function manualGroup(value: number, decimals: number): string {
  const neg = value < 0;
  const fixed = Math.abs(value).toFixed(decimals);
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const out = grouped + (frac ? `,${frac}` : '');
  return neg ? `-${out}` : out;
}

function formatNumber(value: number, decimals: number): string {
  try {
    return new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch {
    return manualGroup(value, decimals);
  }
}

/**
 * Formatea un monto con el símbolo de su moneda y separadores correctos.
 * Usa `Intl` si está disponible y un fallback manual si no.
 * Las monedas conocidas usan sus decimales por defecto (COP/CLP = 0, resto = 2).
 */
export function formatCurrency(
  value: number | string,
  currency = 'COP',
  options: { showSymbol?: boolean; decimals?: number } = {},
): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  const safe = Number.isFinite(num) ? num : 0;
  const info = currencyInfo(currency);
  const decimals = options.decimals ?? info?.decimals ?? 2;

  const formatted = formatNumber(safe, decimals);

  if (options.showSymbol === false) return formatted;
  const symbol = info?.symbol;
  // Moneda desconocida: sufijo con el código para no perder la unidad.
  return symbol ? `${symbol}${formatted}` : `${formatted} ${currency.toUpperCase()}`;
}

/** Símbolo de una moneda (o el propio código si no está en el catálogo). */
export function currencySymbol(currency: string): string {
  return currencyInfo(currency)?.symbol ?? currency.toUpperCase();
}

/** Versión con signo: +$1.000 / -$1.000 según el tipo de transacción. */
export function formatSigned(
  value: number | string,
  type: 'income' | 'expense' | 'transfer',
  currency = 'COP',
): string {
  const base = formatCurrency(value, currency);
  if (type === 'income') return `+${base}`;
  if (type === 'expense') return `-${base}`;
  return base;
}
