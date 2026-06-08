import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { theme } from '../theme';
import { Icon } from './Icon';
import { formatSigned } from '../utils/formatCurrency';
import { formatTime } from '../utils/formatDate';
import type { Transaction } from '../types';

interface Props {
  transaction: Transaction;
  onPress?: (t: Transaction) => void;
}

export function TransactionCard({ transaction: t, onPress }: Props) {
  const isTransfer = t.type === 'transfer';
  const amountColor =
    t.type === 'income' ? theme.colors.success : t.type === 'expense' ? theme.colors.danger : theme.colors.textSecondary;
  const iconColor = isTransfer ? theme.colors.primary : t.categoryColor ?? theme.colors.primary;
  const iconName = isTransfer ? 'arrow-left-right' : t.categoryIcon ?? 'circle';
  const title = t.description?.trim() || t.categoryName || (isTransfer ? 'Transferencia' : 'Sin categoría');

  const subtitle = isTransfer
    ? `${t.accountName ?? ''} → ${t.toAccountName ?? ''}`
    : `${t.accountName ?? ''}${t.categoryName && t.description ? ` · ${t.categoryName}` : ''}`;

  return (
    <Pressable
      onPress={() => onPress?.(t)}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
    >
      <View style={[styles.iconWrap, { backgroundColor: `${iconColor}22` }]}>
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

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  iconWrap: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  title: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: '600' },
  subtitle: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginTop: 2 },
  right: { alignItems: 'flex-end' },
  amount: { fontSize: theme.fontSize.md, fontWeight: '700' },
  time: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginTop: 2 },
});
