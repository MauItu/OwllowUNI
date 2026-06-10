import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Icon } from './Icon';
import { formatSigned } from '../utils/formatCurrency';
import { formatTime } from '../utils/formatDate';
import type { Transaction } from '../types';

interface Props {
  transaction: Transaction;
  onPress?: (t: Transaction) => void;
}

export function TransactionCard({ transaction: t, onPress }: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const isTransfer = t.type === 'transfer';
  const amountColor =
    t.type === 'income' ? theme.colors.income : t.type === 'expense' ? theme.colors.expense : theme.colors.transfer;
  const iconColor = isTransfer ? theme.colors.transfer : t.categoryColor ?? theme.colors.primary;
  // Borde izquierdo: rosa gastos, azul ingresos, morado transferencias
  const edgeColor =
    t.type === 'expense' ? theme.colors.primary : t.type === 'income' ? theme.colors.secondary : theme.colors.accentLight;
  const iconName = isTransfer ? 'arrow-left-right' : t.categoryIcon ?? 'circle';
  const title = t.description?.trim() || t.categoryName || (isTransfer ? 'Transferencia' : 'Sin categoría');

  const subtitle = isTransfer
    ? `${t.accountName ?? ''} → ${t.toAccountName ?? ''}`
    : `${t.accountName ?? ''}${t.categoryName && t.description ? ` · ${t.categoryName}` : ''}`;

  return (
    <Pressable
      onPress={() => onPress?.(t)}
      style={({ pressed }) => [styles.card, { borderLeftColor: edgeColor }, pressed && { backgroundColor: theme.colors.surfaceLight }]}
    >
      <View style={[styles.iconWrap, { backgroundColor: `${iconColor}26` }]}>
        <Icon name={iconName} size={20} color={iconColor} />
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={[styles.amount, { color: amountColor }]} numberOfLines={1}>
          {formatSigned(t.amount, t.type)}
        </Text>
        <Text style={styles.time}>{formatTime(t.time)}</Text>
      </View>
    </Pressable>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    borderLeftWidth: 4,
  },
  iconWrap: { width: 44, height: 44, borderRadius: theme.borderRadius.full, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  title: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold },
  subtitle: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginTop: 2 },
  right: { alignItems: 'flex-end' },
  amount: { fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold },
  time: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginTop: 2 },
});
