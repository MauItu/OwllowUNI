import React from 'react';
import { BottomSheet } from './BottomSheet';
import { Calculator } from './Calculator';

interface Props {
  visible: boolean;
  title?: string;
  /** Colorea el resultado y el botón de confirmar (income verde, expense rosa…). */
  type?: 'income' | 'expense' | 'transfer';
  initialValue?: number;
  currency?: string;
  onConfirm: (value: number) => void;
  onClose: () => void;
}

/** BottomSheet con la calculadora para ingresar montos en formularios. */
export function CalculatorSheet({
  visible,
  title = 'Monto',
  type = 'income',
  initialValue = 0,
  currency = 'COP',
  onConfirm,
  onClose,
}: Props) {
  return (
    <BottomSheet visible={visible} title={title} onClose={onClose} maxHeight="75%">
      <Calculator type={type} initialValue={initialValue} currency={currency} onConfirm={onConfirm} />
    </BottomSheet>
  );
}
