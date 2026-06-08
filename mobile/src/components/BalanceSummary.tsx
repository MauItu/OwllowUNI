import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme';
import { Icon } from './Icon';
import { formatCurrency } from '../utils/formatCurrency';

interface Props {
  totalBalance: number;
  income: number;
  expense: number;
  currency?: string;
}

export function BalanceSummary({ totalBalance, income, expense, currency = 'COP' }: Props) {
  const total = income + expense;
  const incomePct = total > 0 ? (income / total) * 100 : 0;
  const expensePct = total > 0 ? (expense / total) * 100 : 0;

  return (
    <View style={styles.card}>
      <Text style={styles.label}>Balance total</Text>
      <Text style={styles.total} numberOfLines={1} adjustsFontSizeToFit>
        {formatCurrency(totalBalance, currency)}
      </Text>

      {/* Barra ingresos vs gastos */}
      <View style={styles.bar}>
        <View style={[styles.barFill, { backgroundColor: theme.colors.success, flex: incomePct || 0.0001 }]} />
        <View style={[styles.barFill, { backgroundColor: theme.colors.danger, flex: expensePct || 0.0001 }]} />
      </View>

      <View style={styles.row}>
        <View style={styles.metric}>
          <View style={[styles.dot, { backgroundColor: theme.colors.success }]}>
            <Icon name="arrow-down-left" size={14} color="#fff" />
          </View>
          <View>
            <Text style={styles.metricLabel}>Ingresos</Text>
            <Text style={[styles.metricValue, { color: theme.colors.success }]}>{formatCurrency(income, currency)}</Text>
          </View>
        </View>
        <View style={styles.metric}>
          <View style={[styles.dot, { backgroundColor: theme.colors.danger }]}>
            <Icon name="arrow-up-right" size={14} color="#fff" />
          </View>
          <View>
            <Text style={styles.metricLabel}>Gastos</Text>
            <Text style={[styles.metricValue, { color: theme.colors.danger }]}>{formatCurrency(expense, currency)}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
  },
  label: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm },
  total: { color: theme.colors.text, fontSize: theme.fontSize.xxl, fontWeight: '800', marginTop: theme.spacing.xs },
  bar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginVertical: theme.spacing.md,
    backgroundColor: theme.colors.surfaceLight,
  },
  barFill: { height: '100%' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  metric: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  dot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  metricLabel: { color: theme.colors.textSecondary, fontSize: theme.fontSize.xs },
  metricValue: { fontSize: theme.fontSize.md, fontWeight: '700' },
});
