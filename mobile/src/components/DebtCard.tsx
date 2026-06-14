import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { differenceInCalendarDays } from 'date-fns';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Icon } from './Icon';
import { formatCurrency } from '../utils/formatCurrency';
import { parseISOSafe } from '../utils/formatDate';
import type { Debt } from '../types';

interface Props {
  debt: Debt;
  onPress?: () => void;
}

/** Indicador de vencimiento: urgente si faltan ≤ 7 días o ya venció. */
function dueLabel(dueDate: string): { text: string; urgent: boolean } {
  const days = differenceInCalendarDays(parseISOSafe(dueDate), new Date());
  if (days < 0) return { text: 'Vencida', urgent: true };
  if (days === 0) return { text: 'Vence hoy', urgent: true };
  if (days <= 7) return { text: `Vence en ${days} ${days === 1 ? 'día' : 'días'}`, urgent: true };
  return { text: `Vence en ${days} días`, urgent: false };
}

function DebtCardComponent({ debt, onPress }: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const isDebt = debt.type === 'debt';
  // Deudas en expense (rosa/rojo), préstamos en income (verde)
  const semanticColor = isDebt ? theme.colors.expense : theme.colors.income;
  const total = Number(debt.totalAmount);
  const remaining = Number(debt.remainingAmount);
  // Barra invertida: muestra cuánto FALTA por pagar
  const remainingRatio = total > 0 ? Math.min(1, remaining / total) : 0;
  const due = debt.dueDate && !debt.isPaidOff ? dueLabel(debt.dueDate) : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { borderLeftColor: semanticColor },
        debt.isPaidOff && { opacity: 0.65 },
        pressed && { opacity: 0.8 },
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: `${semanticColor}26` }]}>
          <Icon name={debt.icon} size={20} color={semanticColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{debt.name}</Text>
          {debt.accountType === 'credit_card' ? (
            <View style={styles.autoBadge}>
              <Icon name="credit-card" size={10} color={theme.colors.primary} />
              <Text style={styles.autoText} numberOfLines={1}>
                Auto · {debt.accountName ?? 'Tarjeta'}
              </Text>
            </View>
          ) : (
            !!debt.creditorDebtor && (
              <Text style={styles.person} numberOfLines={1}>
                {isDebt ? `Le debes a ${debt.creditorDebtor}` : `Te debe ${debt.creditorDebtor}`}
              </Text>
            )
          )}
        </View>
        {debt.isPaidOff ? (
          <View style={[styles.paidBadge, { backgroundColor: theme.colors.income }]}>
            <Icon name="check" size={14} color="#FFFFFF" strokeWidth={3} />
            <Text style={styles.paidText}>Saldada</Text>
          </View>
        ) : due ? (
          <Text style={[styles.due, due.urgent && { color: theme.colors.expense, fontWeight: theme.fontWeight.bold }]}>
            {due.text}
          </Text>
        ) : null}
      </View>

      {/* Barra invertida: cuánto falta por pagar */}
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.max(remainingRatio * 100, 2)}%`, backgroundColor: semanticColor }]} />
      </View>

      <View style={styles.amounts}>
        <Text style={[styles.remaining, { color: semanticColor }]}>{formatCurrency(remaining)}</Text>
        <Text style={styles.total}>de {formatCurrency(total)}</Text>
        {debt.interestRate != null && Number(debt.interestRate) > 0 && (
          <Text style={styles.interest}>· {Number(debt.interestRate)}% anual</Text>
        )}
      </View>
    </Pressable>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
      borderLeftWidth: 4,
      gap: theme.spacing.sm,
    },
    header: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
    iconWrap: { width: 42, height: 42, borderRadius: theme.borderRadius.full, alignItems: 'center', justifyContent: 'center' },
    name: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold },
    person: { color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, marginTop: 2 },
    autoBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 3,
      marginTop: 3,
      backgroundColor: `${theme.colors.primary}1A`,
      borderRadius: theme.borderRadius.full,
      paddingHorizontal: 6,
      paddingVertical: 1,
    },
    autoText: { color: theme.colors.primary, fontSize: theme.fontSize.xs, fontWeight: theme.fontWeight.medium, maxWidth: 160 },
    due: { color: theme.colors.textSecondary, fontSize: theme.fontSize.xs },
    paidBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderRadius: theme.borderRadius.full,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: 4,
    },
    paidText: { color: '#FFFFFF', fontSize: theme.fontSize.xs, fontWeight: theme.fontWeight.bold },
    track: {
      height: 8,
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.surfaceAccent,
      overflow: 'hidden',
    },
    fill: { height: '100%', borderRadius: theme.borderRadius.full },
    amounts: { flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.xs },
    remaining: { fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.bold },
    total: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm },
    interest: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs },
  });

// Memoizado: se renderiza por fila en listas; con props estables evita re-render.
export const DebtCard = React.memo(DebtCardComponent);
