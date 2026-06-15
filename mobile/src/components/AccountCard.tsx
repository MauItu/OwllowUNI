import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Icon } from './Icon';
import { formatCurrency } from '../utils/formatCurrency';
import { format, parseISOSafe } from '../utils/formatDate';
import type { Account } from '../types';

const TYPE_LABEL: Record<string, string> = {
  bank: 'Banco',
  cash: 'Efectivo',
  credit_card: 'Tarjeta de crédito',
  digital_wallet: 'Billetera digital',
};

// Colores fijos (no tokens del tema) para que los 4 tramos de utilización se
// distingan entre sí en las 4 paletas, en claro y oscuro.
function utilizationColor(theme: Theme, pct: number) {
  if (pct > 100) return theme.colors.danger;
  if (pct > 80) return '#F97316'; // naranja
  if (pct > 50) return '#FACC15'; // amarillo
  return theme.colors.income; // verde
}

function AccountCardComponent({
  account,
  onPress,
  onPressSavings,
}: {
  account: Account;
  onPress?: (a: Account) => void;
  /** Toca la línea "Ahorro" para ver en qué metas está ese dinero. */
  onPressSavings?: (a: Account) => void;
}) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  if (account.type === 'credit_card') {
    const pct = account.utilizationPercentage ?? 0;
    const barColor = utilizationColor(theme, pct);
    return (
      <Pressable
        onPress={() => onPress?.(account)}
        style={({ pressed }) => [
          styles.card,
          styles.creditCard,
          { borderLeftColor: account.color },
          !account.isActive && styles.inactive,
          pressed && { backgroundColor: theme.colors.surfaceLight },
        ]}
      >
        <View style={styles.creditHeader}>
          <View style={[styles.iconWrap, { backgroundColor: `${account.color}26` }]}>
            <Icon name="credit-card" size={22} color={account.color} />
          </View>
          <View style={styles.info}>
            <View style={styles.nameRow}>
              {account.isFrozen && <Icon name="snowflake" size={14} color={theme.colors.secondary} />}
              <Text style={styles.name} numberOfLines={1}>
                {account.name}
              </Text>
            </View>
            <Text style={styles.type}>
              {TYPE_LABEL.credit_card}
              {account.isFrozen ? ' · Congelada' : ''}
              {!account.isActive ? ' · Inactiva' : ''}
            </Text>
          </View>
        </View>

        <View style={styles.utilBarBg}>
          <View style={[styles.utilBarFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: barColor }]} />
        </View>

        <Text style={styles.available} numberOfLines={1}>
          Disponible: {formatCurrency(account.creditAvailable ?? 0, account.currency)}
        </Text>
        <Text style={styles.usedOf} numberOfLines={1}>
          Usado: {formatCurrency(account.creditUsed ?? 0, account.currency)} de {formatCurrency(account.creditLimit ?? 0, account.currency)}
        </Text>
        {account.nextBillingDate && (
          <Text style={styles.nextBilling}>Próximo corte: {format(parseISOSafe(account.nextBillingDate), 'dd/MM')}</Text>
        )}
      </Pressable>
    );
  }

  const balance = parseFloat(account.currentBalance);
  // Ahorro: dinero que ya salió de esta cuenta hacia metas (no es earmark, el
  // saldo ya está descontado). Se muestra aparte y al tocarlo abre el desglose.
  const savings = account.savingsBalance ?? 0;
  const hasSavings = savings > 0;
  return (
    <Pressable
      onPress={() => onPress?.(account)}
      style={({ pressed }) => [
        styles.card,
        { borderLeftColor: account.color },
        !account.isActive && styles.inactive,
        pressed && { backgroundColor: theme.colors.surfaceLight },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: `${account.color}26` }]}>
        <Icon name={account.icon} size={22} color={account.color} />
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {account.name}
        </Text>
        <Text style={styles.type}>
          {TYPE_LABEL[account.type] ?? account.type}
          {!account.isActive ? ' · Inactiva' : ''}
        </Text>
      </View>
      <View style={styles.amountCol}>
        <Text style={[styles.balance, { color: balance < 0 ? theme.colors.expense : theme.colors.text }]} numberOfLines={1}>
          {formatCurrency(balance, account.currency)}
        </Text>
        {hasSavings && (
          <Pressable
            onPress={() => onPressSavings?.(account)}
            hitSlop={6}
            style={({ pressed }) => [styles.savingsChip, pressed && { opacity: 0.6 }]}
          >
            <Icon name="piggy-bank" size={11} color={account.color} />
            <Text style={[styles.savingsLine, { color: account.color }]} numberOfLines={1}>
              Ahorro {formatCurrency(savings, account.currency)}
            </Text>
            <Icon name="chevron-right" size={12} color={account.color} />
          </Pressable>
        )}
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
  iconWrap: { width: 48, height: 48, borderRadius: theme.borderRadius.full, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  inactive: { opacity: 0.55 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold },
  type: { color: theme.colors.textMuted, fontSize: theme.fontSize.sm, marginTop: 2 },
  balance: { fontSize: theme.fontSize.lg, fontWeight: theme.fontWeight.semibold },
  amountCol: { alignItems: 'flex-end', flexShrink: 1 },
  savingsChip: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  savingsLine: { fontSize: theme.fontSize.xs, fontWeight: theme.fontWeight.semibold },
  // Tarjeta de crédito: layout vertical (header + barra + montos).
  creditCard: { flexDirection: 'column', alignItems: 'stretch', gap: theme.spacing.sm },
  creditHeader: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  utilBarBg: { height: 8, borderRadius: theme.borderRadius.full, backgroundColor: theme.colors.surfaceLight, overflow: 'hidden' },
  utilBarFill: { height: '100%', borderRadius: theme.borderRadius.full },
  available: { color: theme.colors.text, fontSize: theme.fontSize.xl, fontWeight: theme.fontWeight.bold },
  usedOf: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm },
  nextBilling: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs },
});

// Memoizado: se renderiza por fila en listas; con props estables evita re-render.
export const AccountCard = React.memo(AccountCardComponent);
