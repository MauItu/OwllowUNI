/**
 * Tests de los utils PUROS del mobile (sin dependencias de React Native), corridos
 * desde la suite del server para no montar un runner aparte en Expo: el parser CSV
 * (round-trip del import/export) y el motor de la calculadora.
 */
import { describe, it, expect } from 'vitest';
import { csvToImportRows } from '../../../mobile/src/utils/csv.js';
import {
  initialState,
  reduce,
  currentValue,
  type CalcKey,
  type CalcState,
} from '../../../mobile/src/utils/calculatorEngine.js';

describe('csvToImportRows', () => {
  const HEADER = 'fecha,hora,tipo,monto,descripción,cuenta,cuenta destino,categoría,subcategoría,etiquetas,notas';

  it('parsea una fila simple mapeando por nombre de cabecera', () => {
    const rows = csvToImportRows(`${HEADER}\r\n2026-07-01,10:00:00,Gasto,50000,Almuerzo,Efectivo,,Alimentación,restaurantes,,`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      date: '2026-07-01',
      type: 'Gasto',
      amount: '50000',
      description: 'Almuerzo',
      account: 'Efectivo',
      category: 'Alimentación',
      subcategory: 'restaurantes',
    });
  });

  it('maneja comas y comillas escapadas dentro de campos entrecomillados', () => {
    const rows = csvToImportRows(
      `${HEADER}\r\n2026-07-01,10:00:00,Gasto,1000,"Cena, con amigos ""La Esquina""",Efectivo,,,,,"nota, larga"`,
    );
    expect(rows[0].description).toBe('Cena, con amigos "La Esquina"');
    expect(rows[0].notes).toBe('nota, larga');
  });

  it('tolera BOM, orden de columnas distinto y cabeceras sin tildes', () => {
    const rows = csvToImportRows('﻿monto,tipo,fecha,cuenta\n2500,Ingreso,2026-07-02,Nequi');
    expect(rows[0]).toMatchObject({ amount: '2500', type: 'Ingreso', date: '2026-07-02', account: 'Nequi' });
  });

  it('sin filas de datos devuelve []', () => {
    expect(csvToImportRows(HEADER)).toEqual([]);
    expect(csvToImportRows('')).toEqual([]);
  });
});

describe('calculatorEngine', () => {
  const press = (state: CalcState, keys: CalcKey[]) => keys.reduce(reduce, state);
  const digits = (s: string): CalcKey[] =>
    s.split('').map((c) => (c === '.' ? { kind: 'dot' } : { kind: 'digit', value: c }));

  it('operación encadenada con precedencia: 2 + 3 × 4 = 14', () => {
    const st = press(initialState(), [
      ...digits('2'),
      { kind: 'operator', value: '+' },
      ...digits('3'),
      { kind: 'operator', value: '×' },
      ...digits('4'),
      { kind: 'equals' },
    ]);
    expect(currentValue(st)).toBe(14);
  });

  it('división por cero no crashea (estado de error, valor 0)', () => {
    const st = press(initialState(), [
      ...digits('5'),
      { kind: 'operator', value: '÷' },
      ...digits('0'),
      { kind: 'equals' },
    ]);
    expect(currentValue(st)).toBe(0);
  });

  it('no admite dos puntos decimales en el mismo operando', () => {
    const st = press(initialState(), digits('1.2.3'));
    expect(st.current).toBe('1.23');
  });

  it('prefilled: el primer dígito REEMPLAZA el monto pre-llenado', () => {
    const st = press(initialState('50000', true), digits('7'));
    expect(st.current).toBe('7');
    expect(st.prefilled).toBe(false);
  });

  it('sin prefilled los dígitos concatenan normal', () => {
    const st = press(initialState('5'), digits('7'));
    expect(st.current).toBe('57');
  });

  it('clear vuelve a 0', () => {
    const st = press(initialState(), [...digits('123'), { kind: 'clear' }]);
    expect(currentValue(st)).toBe(0);
    expect(st.tokens).toEqual([]);
  });
});
