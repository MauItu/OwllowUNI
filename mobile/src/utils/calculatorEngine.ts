/**
 * Motor de calculadora paso a paso. NO usa eval().
 * Soporta operaciones encadenadas con precedencia (× ÷ antes que + -)
 * y maneja edge cases: división por 0, múltiples puntos decimales, etc.
 *
 * Modelo: una lista de tokens (números como string y operadores) + el operando
 * que se está escribiendo (`current`). Un reducer puro procesa cada tecla.
 */

export type Operator = '+' | '-' | '×' | '÷';
const OPERATORS: Operator[] = ['+', '-', '×', '÷'];

export interface CalcState {
  /** Tokens ya confirmados, ej: ['15000', '+', '3200'] */
  tokens: string[];
  /** Operando que se está escribiendo, ej: '500' */
  current: string;
  /** true tras '='; la próxima tecla numérica reinicia */
  justEvaluated: boolean;
}

export type CalcKey =
  | { kind: 'digit'; value: string } // '0'..'9'
  | { kind: 'dot' }
  | { kind: 'operator'; value: Operator }
  | { kind: 'backspace' }
  | { kind: 'clear' }
  | { kind: 'equals' };

export function initialState(value = '0'): CalcState {
  return { tokens: [], current: value, justEvaluated: false };
}

function isOperator(t: string): t is Operator {
  return OPERATORS.includes(t as Operator);
}

/** Evalúa una lista de tokens respetando precedencia. null = error. */
function evaluateTokens(input: string[]): number | null {
  const tokens = input.filter((t) => t !== '');
  if (tokens.length === 0) return null;
  // Si termina en operador, ignóralo para poder evaluar parcialmente.
  if (isOperator(tokens[tokens.length - 1])) tokens.pop();
  if (tokens.length === 0) return null;

  // Pasada 1: × y ÷
  const pass1: (string | number)[] = [];
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok === '×' || tok === '÷') {
      const prev = pass1.pop();
      const next = tokens[i + 1];
      if (prev === undefined || next === undefined) return null;
      const a = typeof prev === 'number' ? prev : parseFloat(prev);
      const b = parseFloat(next);
      if (Number.isNaN(a) || Number.isNaN(b)) return null;
      if (tok === '÷') {
        if (b === 0) return null;
        pass1.push(a / b);
      } else {
        pass1.push(a * b);
      }
      i += 2;
    } else {
      pass1.push(tok);
      i += 1;
    }
  }

  // Pasada 2: + y -
  let result = typeof pass1[0] === 'number' ? pass1[0] : parseFloat(pass1[0] as string);
  if (Number.isNaN(result)) return null;
  let j = 1;
  while (j < pass1.length) {
    const op = pass1[j] as string;
    const operand = pass1[j + 1];
    if (operand === undefined) return null;
    const b = typeof operand === 'number' ? operand : parseFloat(operand);
    if (Number.isNaN(b)) return null;
    if (op === '+') result += b;
    else if (op === '-') result -= b;
    else return null;
    j += 2;
  }

  if (!Number.isFinite(result)) return null;
  return Math.round(result * 100) / 100;
}

function formatNumber(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

/** Expresión legible para mostrar arriba en la calculadora. */
export function expressionString(state: CalcState): string {
  return [...state.tokens, state.current].filter((t) => t !== '').join(' ');
}

/** Resultado numérico actual (evaluación parcial). 0 si no es válido. */
export function currentValue(state: CalcState): number {
  const result = evaluateTokens([...state.tokens, state.current]);
  return result ?? 0;
}

/** Reducer puro: aplica una tecla al estado. */
export function reduce(state: CalcState, key: CalcKey): CalcState {
  switch (key.kind) {
    case 'digit': {
      if (state.justEvaluated) return { tokens: [], current: key.value, justEvaluated: false };
      const current = state.current === '0' ? key.value : state.current + key.value;
      return { ...state, current };
    }
    case 'dot': {
      if (state.justEvaluated) return { tokens: [], current: '0.', justEvaluated: false };
      if (state.current.includes('.')) return state; // evita múltiples puntos
      return { ...state, current: state.current + '.' };
    }
    case 'operator': {
      // Si acabamos de evaluar, encadena sobre el resultado.
      const tokens = [...state.tokens];
      // Si el último token ya es operador, reemplázalo.
      if (state.current === '' && tokens.length && isOperator(tokens[tokens.length - 1])) {
        tokens[tokens.length - 1] = key.value;
        return { tokens, current: '', justEvaluated: false };
      }
      tokens.push(state.current);
      tokens.push(key.value);
      return { tokens, current: '', justEvaluated: false };
    }
    case 'backspace': {
      if (state.justEvaluated) return { ...state, justEvaluated: false };
      if (state.current.length > 0) {
        const current = state.current.slice(0, -1);
        return { ...state, current };
      }
      // sin operando actual: quita el último operador y reabre el número previo
      const tokens = [...state.tokens];
      const op = tokens.pop();
      const num = tokens.pop();
      if (num !== undefined) return { tokens, current: num, justEvaluated: false };
      if (op !== undefined) return { tokens, current: '0', justEvaluated: false };
      return { ...state, current: '0' };
    }
    case 'clear':
      return initialState('0');
    case 'equals': {
      const result = evaluateTokens([...state.tokens, state.current]);
      if (result === null) return { tokens: [], current: 'Error', justEvaluated: true };
      return { tokens: [], current: formatNumber(result), justEvaluated: true };
    }
    default:
      return state;
  }
}
