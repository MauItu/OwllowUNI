import { describe, it, expect } from 'vitest';
import { computeOccurrences, nextOccurrence, type RecurrenceSpec } from './recurrence.js';

const spec = (partial: Partial<RecurrenceSpec>): RecurrenceSpec => ({
  frequency: 'daily',
  dayOfMonth: null,
  dayOfWeek: null,
  startDate: '2026-01-01',
  endDate: null,
  ...partial,
});

describe('computeOccurrences — daily', () => {
  it('excluye el cursor e incluye hoy', () => {
    const occ = computeOccurrences(spec({ frequency: 'daily' }), '2026-01-05', '2026-01-08');
    expect(occ).toEqual(['2026-01-06', '2026-01-07', '2026-01-08']);
  });

  it('es idempotente: con el cursor avanzado a hoy no genera nada', () => {
    expect(computeOccurrences(spec({}), '2026-01-08', '2026-01-08')).toEqual([]);
  });

  it('no genera antes de startDate', () => {
    const occ = computeOccurrences(spec({ startDate: '2026-01-10' }), '2026-01-01', '2026-01-12');
    expect(occ).toEqual(['2026-01-10', '2026-01-11', '2026-01-12']);
  });

  it('respeta endDate como límite superior', () => {
    const occ = computeOccurrences(spec({ endDate: '2026-01-06' }), '2026-01-04', '2026-01-31');
    expect(occ).toEqual(['2026-01-05', '2026-01-06']);
  });

  it('tope defensivo: nunca más de 1000 ocurrencias', () => {
    const occ = computeOccurrences(spec({ startDate: '2020-01-01' }), '2019-12-31', '2026-01-01');
    expect(occ.length).toBe(1000);
  });
});

describe('computeOccurrences — weekly / biweekly', () => {
  it('weekly cae en el day_of_week pedido (lunes=1)', () => {
    // 2026-01-05 es lunes.
    const occ = computeOccurrences(
      spec({ frequency: 'weekly', dayOfWeek: 1 }),
      '2026-01-01',
      '2026-01-20',
    );
    expect(occ).toEqual(['2026-01-05', '2026-01-12', '2026-01-19']);
  });

  it('biweekly va anclado a startDate cada 14 días (no al day_of_week del cursor)', () => {
    const occ = computeOccurrences(
      spec({ frequency: 'biweekly', startDate: '2026-01-01' }),
      '2026-01-01',
      '2026-02-15',
    );
    expect(occ).toEqual(['2026-01-15', '2026-01-29', '2026-02-12']);
  });

  it('biweekly con cursor a mitad de ciclo retoma la SIGUIENTE ocurrencia del ancla', () => {
    const occ = computeOccurrences(
      spec({ frequency: 'biweekly', startDate: '2026-01-01' }),
      '2026-01-20',
      '2026-02-15',
    );
    expect(occ).toEqual(['2026-01-29', '2026-02-12']);
  });
});

describe('computeOccurrences — monthly', () => {
  it('genera el day_of_month de cada mes del rango', () => {
    const occ = computeOccurrences(
      spec({ frequency: 'monthly', dayOfMonth: 15, startDate: '2026-01-01' }),
      '2026-01-01',
      '2026-03-31',
    );
    expect(occ).toEqual(['2026-01-15', '2026-02-15', '2026-03-15']);
  });

  it('día 31 cae al último día del mes cuando no existe (feb no bisiesto → 28)', () => {
    const occ = computeOccurrences(
      spec({ frequency: 'monthly', dayOfMonth: 31, startDate: '2026-01-01' }),
      '2026-01-31',
      '2026-04-30',
    );
    expect(occ).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('febrero bisiesto usa el 29', () => {
    const occ = computeOccurrences(
      spec({ frequency: 'monthly', dayOfMonth: 30, startDate: '2028-01-01' }),
      '2028-02-01',
      '2028-02-29',
    );
    expect(occ).toEqual(['2028-02-29']);
  });
});

describe('computeOccurrences — yearly', () => {
  it('una vez al año, en el mes de startDate y el day_of_month dado', () => {
    const occ = computeOccurrences(
      spec({ frequency: 'yearly', dayOfMonth: 10, startDate: '2024-03-01' }),
      '2024-01-01',
      '2026-12-31',
    );
    expect(occ).toEqual(['2024-03-10', '2025-03-10', '2026-03-10']);
  });
});

describe('nextOccurrence', () => {
  it('devuelve la próxima fecha estrictamente posterior', () => {
    expect(
      nextOccurrence(spec({ frequency: 'monthly', dayOfMonth: 5, startDate: '2026-01-01' }), '2026-01-05'),
    ).toBe('2026-02-05');
  });

  it('regla vencida (endDate en el pasado) → null', () => {
    expect(
      nextOccurrence(
        spec({ frequency: 'monthly', dayOfMonth: 5, startDate: '2025-01-01', endDate: '2025-06-30' }),
        '2026-01-01',
      ),
    ).toBeNull();
  });
});
