import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Icon } from './Icon';
import { formatCurrency, currencySymbol } from '../utils/formatCurrency';

interface Props {
  totalBalance: number;
  income: number;
  expense: number;
  currency?: string;
}

export function BalanceSummary({ totalBalance, income, expense, currency = 'COP' }: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const symbol = currencySymbol(currency);
  const amount = formatCurrency(totalBalance, currency, { showSymbol: false });

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Balance total</Text>
      <View style={styles.heroRow}>
        <Text style={styles.heroSymbol}>{symbol}</Text>
        <Text style={styles.hero} numberOfLines={1} adjustsFontSizeToFit>
          {amount}
        </Text>
      </View>

      <View style={styles.pills}>
        <Pill
          icon="arrow-down-left"
          label="Ingresos"
          value={formatCurrency(income, currency)}
          color={theme.colors.income}
        />
        <Pill
          icon="arrow-up-right"
          label="Gastos"
          value={formatCurrency(expense, currency)}
          color={theme.colors.expense}
        />
      </View>
    </View>
  );
}

function Pill({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.pill}>
      <View style={[styles.pillIcon, { backgroundColor: `${color}26` }]}>
        <Icon name={icon} size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.pillLabel}>{label}</Text>
        <Text style={[styles.pillValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
  wrap: { paddingHorizontal: theme.spacing.xs },
  label: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm },
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: theme.spacing.xs },
  heroSymbol: { color: theme.colors.accent, fontSize: theme.fontSize.xl, fontWeight: theme.fontWeight.semibold, marginTop: 4, marginRight: 2 },
  hero: { color: theme.colors.text, fontSize: theme.fontSize.hero, fontWeight: theme.fontWeight.bold, letterSpacing: -1 },
  pills: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.lg },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius.xl,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
  },
  pillIcon: { width: 34, height: 34, borderRadius: theme.borderRadius.full, alignItems: 'center', justifyContent: 'center' },
  pillLabel: { color: theme.colors.textSecondary, fontSize: theme.fontSize.xs },
  pillValue: { fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold, marginTop: 1 },
});
