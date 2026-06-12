/**
 * Catálogo curado de monedas soportadas por la app (multi-moneda).
 * `decimals` = decimales con los que se muestra normalmente cada moneda.
 */
export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'COP', name: 'Peso colombiano', symbol: '$', decimals: 0 },
  { code: 'USD', name: 'Dólar estadounidense', symbol: 'US$', decimals: 2 },
  { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2 },
  { code: 'VES', name: 'Bolívar venezolano', symbol: 'Bs', decimals: 2 },
  { code: 'MXN', name: 'Peso mexicano', symbol: 'MX$', decimals: 2 },
  { code: 'ARS', name: 'Peso argentino', symbol: 'AR$', decimals: 2 },
  { code: 'PEN', name: 'Sol peruano', symbol: 'S/', decimals: 2 },
  { code: 'CLP', name: 'Peso chileno', symbol: '$', decimals: 0 },
  { code: 'BRL', name: 'Real brasileño', symbol: 'R$', decimals: 2 },
];

const CURRENCY_MAP = new Map(CURRENCIES.map((c) => [c.code, c]));

export function currencyInfo(code?: string | null): CurrencyInfo | undefined {
  if (!code) return undefined;
  return CURRENCY_MAP.get(code.toUpperCase());
}
