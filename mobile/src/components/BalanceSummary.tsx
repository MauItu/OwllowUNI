import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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

/** Card de balance total con gradiente rosa↔morado y texto blanco. */
export function BalanceSummary({ totalBalance, income, expense, currency = 'COP' }: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const symbol = currencySymbol(currency);
  const amount = formatCurrency(totalBalance, currency, { showSymbol: false });

  return (
    <LinearGradient
      colors={theme.gradients.balance}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.wrap}
    >
      <Text style={styles.label}>Balance total</Text>
      <View style={styles.heroRow}>
        <Text style={styles.heroSymbol}>{symbol}</Text>
        <Text style={styles.hero} numberOfLines={1} adjustsFontSizeToFit>
          {amount}
        </Text>
      </View>

      <View style={styles.pills}>
        <Pill icon="arrow-down-left" label="Ingresos" value={formatCurrency(income, currency)} />
        <Pill icon="arrow-up-right" label="Gastos" value={formatCurrency(expense, currency)} />
      </View>
    </LinearGradient>
  );
}

function Pill({ icon, label, value }: { icon: string; label: string; value: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.pill}>
      <View style={styles.pillIcon}>
        <Icon name={icon} size={18} color="#FFFFFF" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.pillLabel}>{label}</Text>
        <Text style={styles.pillValue} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: {
      borderRadius: theme.borderRadius.xl,
      padding: theme.spacing.lg,
      shadowColor: theme.colors.primary,
      shadowOpacity: 0.35,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 8,
    },
    label: { color: 'rgba(255,255,255,0.85)', fontSize: theme.fontSize.sm },
    heroRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: theme.spacing.xs },
    heroSymbol: { color: 'rgba(255,255,255,0.9)', fontSize: theme.fontSize.xl, fontWeight: theme.fontWeight.semibold, marginTop: 4, marginRight: 2 },
    hero: { color: '#FFFFFF', fontSize: theme.fontSize.hero, fontWeight: theme.fontWeight.bold, letterSpacing: -1 },
    pills: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.lg },
    pill: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      backgroundColor: 'rgba(255,255,255,0.16)',
      borderRadius: theme.borderRadius.xl,
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.md,
    },
    pillIcon: { width: 34, height: 34, borderRadius: theme.borderRadius.full, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
    pillLabel: { color: 'rgba(255,255,255,0.8)', fontSize: theme.fontSize.xs },
    pillValue: { color: '#FFFFFF', fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold, marginTop: 1 },
  });
