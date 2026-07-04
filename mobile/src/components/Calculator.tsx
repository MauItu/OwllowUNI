import React, { useEffect, useMemo, useReducer } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Icon } from './Icon';
import {
  reduce,
  initialState,
  expressionString,
  currentValue,
  type CalcKey,
  type CalcState,
} from '../utils/calculatorEngine';
import { formatCurrency } from '../utils/formatCurrency';

interface CalculatorProps {
  type: 'income' | 'expense' | 'transfer';
  initialValue?: number;
  currency?: string;
  onConfirm: (value: number) => void;
  /** Notifica el valor en vivo (p.ej. para calcular la cuota mensual al teclear). */
  onChange?: (value: number) => void;
}

function reducer(state: CalcState, key: CalcKey): CalcState {
  return reduce(state, key);
}

export function Calculator({ type, initialValue = 0, currency = 'COP', onConfirm, onChange }: CalculatorProps) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [state, dispatch] = useReducer(
    reducer,
    // Con un monto pre-llenado (cuota sugerida / edición), arranca en estado
    // `prefilled`: el primer dígito que teclee el usuario lo reemplaza por completo.
    initialValue > 0 ? initialState(String(initialValue), true) : initialState('0'),
  );

  const accentColor = type === 'income' ? theme.colors.income : type === 'transfer' ? theme.colors.transfer : theme.colors.expense;
  const value = useMemo(() => currentValue(state), [state]);
  const expr = expressionString(state);

  // Notifica el valor en vivo al padre (cuota mensual, etc.) sin romper onConfirm.
  useEffect(() => {
    onChange?.(value);
  }, [value, onChange]);

  const tap = (key: CalcKey) => {
    // expo-haptics removido (incompatible con Node 22): sin feedback háptico.
    dispatch(key);
  };

  const handleConfirm = () => {
    onConfirm(value);
  };

  // Nombres legibles para TalkBack (las teclas son solo símbolos visuales).
  const KEY_A11Y: Record<string, string> = {
    C: 'Borrar todo',
    '÷': 'Dividir',
    '×': 'Multiplicar',
    '-': 'Restar',
    '+': 'Sumar',
    '.': 'Punto decimal',
  };

  const renderKey = (label: string, onPress: () => void, variant: 'num' | 'op' | 'action' = 'num', flex = 1) => (
    <Pressable
      key={label}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={KEY_A11Y[label] ?? label}
      style={({ pressed }) => [
        styles.key,
        variant === 'op' && styles.keyOp,
        variant === 'action' && styles.keyAction,
        { flex },
        pressed && styles.keyPressed,
      ]}
    >
      <Text style={[styles.keyText, variant === 'op' && styles.keyTextOp]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      {/* Display */}
      <View style={styles.display}>
        <Text style={styles.expression} numberOfLines={1}>
          {expr || ' '}
        </Text>
        <Text style={[styles.result, { color: accentColor }]} numberOfLines={1} adjustsFontSizeToFit>
          {state.current === 'Error' ? 'Error' : formatCurrency(value, currency)}
        </Text>
      </View>

      {/* Teclado */}
      <View style={styles.pad}>
        <View style={styles.row}>
          {renderKey('C', () => tap({ kind: 'clear' }), 'action')}
          {renderKey('÷', () => tap({ kind: 'operator', value: '÷' }), 'op')}
          {renderKey('×', () => tap({ kind: 'operator', value: '×' }), 'op')}
          <Pressable
            onPress={() => tap({ kind: 'backspace' })}
            accessibilityRole="button"
            accessibilityLabel="Borrar último dígito"
            style={({ pressed }) => [styles.key, styles.keyAction, { flex: 1 }, pressed && styles.keyPressed]}
          >
            <Icon name="delete" size={24} color={theme.colors.text} />
          </Pressable>
        </View>

        <View style={styles.row}>
          {renderKey('7', () => tap({ kind: 'digit', value: '7' }))}
          {renderKey('8', () => tap({ kind: 'digit', value: '8' }))}
          {renderKey('9', () => tap({ kind: 'digit', value: '9' }))}
          {renderKey('-', () => tap({ kind: 'operator', value: '-' }), 'op')}
        </View>

        <View style={styles.row}>
          {renderKey('4', () => tap({ kind: 'digit', value: '4' }))}
          {renderKey('5', () => tap({ kind: 'digit', value: '5' }))}
          {renderKey('6', () => tap({ kind: 'digit', value: '6' }))}
          {renderKey('+', () => tap({ kind: 'operator', value: '+' }), 'op')}
        </View>

        <View style={styles.row}>
          <View style={styles.col3}>
            <View style={styles.row}>
              {renderKey('1', () => tap({ kind: 'digit', value: '1' }))}
              {renderKey('2', () => tap({ kind: 'digit', value: '2' }))}
              {renderKey('3', () => tap({ kind: 'digit', value: '3' }))}
            </View>
            <View style={styles.row}>
              {renderKey('0', () => tap({ kind: 'digit', value: '0' }), 'num', 2)}
              {renderKey('.', () => tap({ kind: 'dot' }))}
            </View>
          </View>
          <Pressable
            onPress={handleConfirm}
            accessibilityRole="button"
            accessibilityLabel="Confirmar monto"
            style={({ pressed }) => [styles.confirm, pressed && styles.keyPressed]}
          >
            <Icon name="check" size={34} color="#FFFFFF" strokeWidth={2.6} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    paddingBottom: theme.spacing.md,
  },
  display: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    alignItems: 'flex-end',
    minHeight: 96,
    justifyContent: 'center',
  },
  expression: { color: theme.colors.textMuted, fontSize: theme.fontSize.lg, height: 24 },
  result: { fontSize: theme.fontSize.hero, fontWeight: theme.fontWeight.bold, letterSpacing: -1 },
  pad: { paddingHorizontal: theme.spacing.sm, gap: theme.spacing.sm },
  row: { flexDirection: 'row', gap: theme.spacing.sm },
  col3: { flex: 3, gap: theme.spacing.sm },
  key: {
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius.lg,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyOp: { backgroundColor: theme.colors.primaryDark },
  keyAction: { backgroundColor: theme.colors.surfaceAccent },
  keyPressed: { opacity: 0.6 },
  keyText: { color: theme.colors.text, fontSize: theme.fontSize.xl, fontWeight: theme.fontWeight.medium },
  keyTextOp: { color: theme.colors.primaryLight, fontWeight: theme.fontWeight.bold },
  confirm: {
    flex: 1,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
