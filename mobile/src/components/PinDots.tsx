import React from 'react';
import { View, StyleSheet } from 'react-native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { PIN_LENGTH } from '../services/security';

interface Props {
  /** Cantidad de dígitos ya ingresados. */
  filled: number;
  length?: number;
  /** Pinta los dots en color de error (PIN incorrecto). */
  error?: boolean;
}

/** Indicador de progreso del PIN: círculos que se rellenan al teclear. */
export function PinDots({ filled, length = PIN_LENGTH, error = false }: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const active = error ? theme.colors.expense : theme.colors.primary;

  return (
    <View style={styles.row}>
      {Array.from({ length }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i < filled
              ? { backgroundColor: active, borderColor: active }
              : { borderColor: error ? theme.colors.expense : theme.colors.border },
          ]}
        />
      ))}
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    row: { flexDirection: 'row', gap: theme.spacing.md, justifyContent: 'center' },
    dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  });
