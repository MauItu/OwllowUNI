import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { theme } from '../theme';
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
  const balance = parseFloat(account.currentBalance);
  return (
    <Pressable
      onPress={() => onPress?.(account)}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}
    >
      <View style={[styles.iconWrap, { backgroundColor: `${account.color}22` }]}>
        <Icon name={account.icon} size={22} color={account.color} />
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {account.name}
        </Text>
        <Text style={styles.type}>{TYPE_LABEL[account.type] ?? account.type}</Text>
      </View>
      <Text style={[styles.balance, { color: balance < 0 ? theme.colors.danger : theme.colors.text }]} numberOfLines={1}>
        {formatCurrency(balance, account.currency)}
      </Text>
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
  iconWrap: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  name: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: '600' },
  type: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginTop: 2 },
  balance: { fontSize: theme.fontSize.lg, fontWeight: '700' },
});
