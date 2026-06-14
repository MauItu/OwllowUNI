import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';

/** Tipo de cuenta para filtrar movimientos/estadísticas. */
export type AccountTypeValue = 'all' | 'debit' | 'credit';

const OPTIONS: { key: AccountTypeValue; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'debit', label: 'Débito' },
  { key: 'credit', label: 'Crédito' },
];

/**
 * Filtro horizontal (3 chips) por tipo de cuenta. El chip activo se resalta con
 * el color del theme correspondiente: primario para "Todas", verde (income) para
 * "Débito", naranja para "Crédito".
 */
export function AccountTypeFilter({ value, onChange }: { value: AccountTypeValue; onChange: (v: AccountTypeValue) => void }) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  const activeColor = (key: AccountTypeValue) =>
    key === 'debit' ? theme.colors.income : key === 'credit' ? '#E8843C' : theme.colors.primary;

  return (
    <View style={styles.row}>
      {OPTIONS.map((opt) => {
        const active = value === opt.key;
        const color = activeColor(opt.key);
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            style={[styles.chip, active ? { backgroundColor: color, borderColor: color } : { borderColor: theme.colors.cardBorder }]}
            hitSlop={4}
          >
            <Text style={[styles.chipText, active ? styles.chipTextActive : { color: theme.colors.textSecondary }]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.sm,
    },
    chip: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 8,
      borderRadius: theme.borderRadius.full,
      borderWidth: 1,
      backgroundColor: theme.colors.surface,
    },
    chipText: { fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold },
    chipTextActive: { color: '#FFFFFF' },
  });
