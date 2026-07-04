import { describe, it, expect } from 'vitest';
import { frenchInstallment, computeDueInfo } from './installments.js';
// Espejo del mobile: DEBE dar exactamente lo mismo que el server (el preview de
// cuotas en los formularios no puede diferir del cálculo definitivo).
import { frenchInstallment as frenchInstallmentMobile } from '../../../mobile/src/utils/installments.js';

describe('frenchInstallment', () => {
  it('sin interés ≡ principal/n (ejemplo documentado: 500k/10 = 50k)', () => {
    expect(frenchInstallment(500_000, 0, 10)).toBe(50_000);
  });

  it('con interés: 1M/10 al 2% mensual = 111 326.53 (ejemplo documentado)', () => {
    expect(frenchInstallment(1_000_000, 2, 10)).toBe(111_326.53);
  });

  it('casos degenerados devuelven 0', () => {
    expect(frenchInstallment(0, 2, 10)).toBe(0);
    expect(frenchInstallment(-100, 2, 10)).toBe(0);
    expect(frenchInstallment(100, 2, 0)).toBe(0);
    expect(frenchInstallment(100, 2, -1)).toBe(0);
  });

  it('la suma de cuotas con i=0 no pierde centavos de más (redondeo a 2)', () => {
    const cuota = frenchInstallment(100, 0, 3); // 33.33
    expect(cuota).toBe(33.33);
  });

  it('paridad EXACTA con el espejo del mobile en una grilla de valores', () => {
    const principals = [1, 999.99, 50_000, 1_000_000, 5_500_000, 123_456.78];
    const rates = [0, 0.5, 1, 2, 3.75, 10];
    const terms = [1, 2, 6, 12, 36, 60];
    for (const p of principals) {
      for (const r of rates) {
        for (const n of terms) {
          expect(frenchInstallmentMobile(p, r, n)).toBe(frenchInstallment(p, r, n));
        }
      }
    }
  });
});

describe('computeDueInfo', () => {
  const base = {
    remaining: 500_000,
    installmentAmount: 100_000,
    lateRatePct: 3,
    dueDate: '2026-05-01',
    isPaidOff: false,
  };

  it('al día (hoy <= fecha límite): sin mora, sugiere la cuota', () => {
    const info = computeDueInfo({ ...base, today: '2026-05-01' });
    expect(info).toEqual({ isOverdue: false, lateFee: 0, nextPaymentAmount: 100_000 });
  });

  it('vencido: mora mínima de 1 mes aunque lleve días (ej. documentado: 100k@3%×2m → 106k)', () => {
    // 2 meses completos de atraso → 100k · 3% · 2 = 6 000.
    const info = computeDueInfo({ ...base, today: '2026-07-02' });
    expect(info.isOverdue).toBe(true);
    expect(info.lateFee).toBe(6_000);
    expect(info.nextPaymentAmount).toBe(106_000);
  });

  it('vencido hace días (< 1 mes) cobra al menos 1 mes de mora', () => {
    const info = computeDueInfo({ ...base, today: '2026-05-05' });
    expect(info.lateFee).toBe(3_000);
    expect(info.nextPaymentAmount).toBe(103_000);
  });

  it('el próximo pago se topa al restante', () => {
    const info = computeDueInfo({ ...base, remaining: 50_000, today: '2026-05-05' });
    expect(info.nextPaymentAmount).toBe(50_000);
  });

  it('deuda de un solo pago (sin cuota): sugiere el restante y no calcula mora', () => {
    const info = computeDueInfo({
      ...base,
      installmentAmount: null,
      today: '2026-07-02',
    });
    expect(info.isOverdue).toBe(true);
    expect(info.lateFee).toBe(0);
    expect(info.nextPaymentAmount).toBe(500_000);
  });

  it('saldada: nunca está vencida', () => {
    const info = computeDueInfo({ ...base, isPaidOff: true, today: '2026-07-02' });
    expect(info.isOverdue).toBe(false);
    expect(info.lateFee).toBe(0);
  });

  it('sin fecha límite no hay vencimiento', () => {
    const info = computeDueInfo({ ...base, dueDate: null, today: '2026-07-02' });
    expect(info.isOverdue).toBe(false);
  });
});
