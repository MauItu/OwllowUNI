import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Icon } from './Icon';
import { formatCurrency } from '../utils/formatCurrency';
import type { Account } from '../types';

const TYPE_LABEL: Record<string, string> = {
  bank: 'Banco',
  cash: 'Efectivo',
  credit_card: 'Tarjeta de crédito',
  digital_wallet: 'Billetera digital',
};

export function AccountCard({ account, onPress }: { account: Account; onPress?: (a: Account) => void }) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const balance = parseFloat(account.currentBalance);
  return (
    <Pressable
      onPress={() => onPress?.(account)}
      style={({ pressed }) => [styles.card, { borderLeftColor: account.color }, pressed && { backgroundColor: theme.colors.surfaceLight }]}
    >
      <View style={[styles.iconWrap, { backgroundColor: `${account.color}26` }]}>
        <Icon name={account.icon} size={22} color={account.color} />
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {account.name}
        </Text>
        <Text style={styles.type}>{TYPE_LABEL[account.type] ?? account.type}</Text>
      </View>
      <Text style={[styles.balance, { color: balance < 0 ? theme.colors.expense : theme.colors.text }]} numberOfLines={1}>
        {formatCurrency(balance, account.currency)}
      </Text>
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
    borderLeftWidth: 4,
  },
  iconWrap: { width: 48, height: 48, borderRadius: theme.borderRadius.full, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  name: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold },
  type: { color: theme.colors.textMuted, fontSize: theme.fontSize.sm, marginTop: 2 },
  balance: { fontSize: theme.fontSize.lg, fontWeight: theme.fontWeight.semibold },
});
