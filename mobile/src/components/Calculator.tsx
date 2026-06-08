import React, { useMemo, useReducer } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { theme } from '../theme';
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
}

function reducer(state: CalcState, key: CalcKey): CalcState {
  return reduce(state, key);
}

export function Calculator({ type, initialValue = 0, currency = 'COP', onConfirm }: CalculatorProps) {
  const [state, dispatch] = useReducer(
    reducer,
    initialValue > 0 ? initialState(String(initialValue)) : initialState('0'),
  );

  const confirmColor = type === 'income' ? theme.colors.success : type === 'transfer' ? theme.colors.primary : theme.colors.danger;
  const value = useMemo(() => currentValue(state), [state]);
  const expr = expressionString(state);

  const tap = (key: CalcKey) => {
    // expo-haptics removido (incompatible con Node 22): sin feedback háptico.
    dispatch(key);
  };

  const handleConfirm = () => {
    onConfirm(value);
  };

  const renderKey = (label: string, onPress: () => void, variant: 'num' | 'op' | 'action' = 'num', flex = 1) => (
    <Pressable
      key={label}
      onPress={onPress}
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
        <Text style={styles.result} numberOfLines={1} adjustsFontSizeToFit>
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
            style={({ pressed }) => [styles.confirm, { backgroundColor: confirmColor }, pressed && styles.keyPressed]}
          >
            <Icon name="check" size={32} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#13131B', borderTopLeftRadius: theme.borderRadius.xl, borderTopRightRadius: theme.borderRadius.xl, paddingBottom: theme.spacing.md },
  display: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    alignItems: 'flex-end',
    minHeight: 90,
    justifyContent: 'center',
  },
  expression: { color: theme.colors.textSecondary, fontSize: theme.fontSize.md, height: 22 },
  result: { color: theme.colors.text, fontSize: theme.fontSize.xxl, fontWeight: '700' },
  pad: { paddingHorizontal: theme.spacing.sm, gap: theme.spacing.sm },
  row: { flexDirection: 'row', gap: theme.spacing.sm },
  col3: { flex: 3, gap: theme.spacing.sm },
  key: {
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius.md,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyOp: { backgroundColor: 'rgba(108,92,231,0.18)' },
  keyAction: { backgroundColor: theme.colors.surface },
  keyPressed: { opacity: 0.6 },
  keyText: { color: theme.colors.text, fontSize: theme.fontSize.xl, fontWeight: '500' },
  keyTextOp: { color: theme.colors.primaryLight, fontWeight: '700' },
  confirm: {
    flex: 1,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    // ocupa el alto de las dos filas inferiores
  },
});
