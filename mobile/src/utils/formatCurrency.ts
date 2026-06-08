/**
 * Formatea un monto con separador de miles y símbolo de moneda.
 * Default COP (sin decimales, como suele mostrarse en Colombia).
 */
export function formatCurrency(
  value: number | string,
  currency = 'COP',
  options: { showSymbol?: boolean; decimals?: number } = {},
): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  const safe = Number.isFinite(num) ? num : 0;
  const decimals = options.decimals ?? (currency === 'COP' ? 0 : 2);

  const formatted = safe.toLocaleString('es-CO', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  if (options.showSymbol === false) return formatted;
  const symbol = currencySymbol(currency);
  return `${symbol}${formatted}`;
}

export function currencySymbol(currency: string): string {
  switch (currency) {
    case 'COP':
    case 'USD':
    case 'MXN':
    case 'ARS':
    case 'CLP':
      return '$';
    case 'EUR':
      return '€';
    case 'GBP':
      return '£';
    default:
      return '';
  }
}

/** Versión con signo: +$1.000 / -$1.000 según el tipo de transacción. */
export function formatSigned(value: number | string, type: 'income' | 'expense' | 'transfer', currency = 'COP'): string {
  const base = formatCurrency(value, currency);
  if (type === 'income') return `+${base}`;
  if (type === 'expense') return `-${base}`;
  return base;
}
