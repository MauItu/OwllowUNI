import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { differenceInCalendarDays } from 'date-fns';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Icon } from './Icon';
import { formatCurrency } from '../utils/formatCurrency';
import { parseISOSafe } from '../utils/formatDate';
import type { SavingsGoal } from '../types';

interface Props {
  goal: SavingsGoal;
  onPress?: () => void;
}

/** Etiqueta de fecha límite: "X días restantes" o "Vencida". */
export function deadlineLabel(deadline: string): { text: string; overdue: boolean } {
  const days = differenceInCalendarDays(parseISOSafe(deadline), new Date());
  if (days < 0) return { text: 'Vencida', overdue: true };
  if (days === 0) return { text: 'Vence hoy', overdue: false };
  return { text: days === 1 ? '1 día restante' : `${days} días restantes`, overdue: false };
}

function SavingsGoalCardComponent({ goal, onPress }: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const current = Number(goal.currentAmount);
  const target = Number(goal.targetAmount);
  const progress = target > 0 ? Math.min(1, current / target) : 0;
  const deadline = goal.deadline && !goal.isCompleted ? deadlineLabel(goal.deadline) : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        goal.isCompleted && styles.cardCompleted,
        pressed && { opacity: 0.8 },
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: `${goal.color}26` }]}>
          <Icon name={goal.icon} size={20} color={goal.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{goal.name}</Text>
          {deadline ? (
            <Text style={[styles.deadline, deadline.overdue && { color: theme.colors.expense }]}>
              {deadline.text}
            </Text>
          ) : goal.isCompleted ? (
            <Text style={[styles.deadline, { color: theme.colors.income }]}>¡Meta completada!</Text>
          ) : null}
        </View>
        {goal.isCompleted ? (
          <View style={styles.checkBadge}>
            <Icon name="check" size={16} color="#FFFFFF" strokeWidth={3} />
          </View>
        ) : (
          <Text style={styles.percent}>{Math.round(progress * 100)}%</Text>
        )}
      </View>

      {/* Barra de progreso con gradiente */}
      <View style={styles.track}>
        <LinearGradient
          colors={goal.isCompleted ? theme.gradients.income : theme.gradients.progress}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.fill, { width: `${Math.max(progress * 100, 2)}%` }]}
        />
      </View>

      <View style={styles.amounts}>
        <Text style={styles.current}>{formatCurrency(current)}</Text>
        <Text style={styles.target}>de {formatCurrency(target)}</Text>
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
      gap: theme.spacing.sm,
    },
    cardCompleted: { borderColor: theme.colors.income, borderWidth: 1 },
    header: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
    iconWrap: { width: 42, height: 42, borderRadius: theme.borderRadius.full, alignItems: 'center', justifyContent: 'center' },
    name: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold },
    deadline: { color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, marginTop: 2 },
    percent: { color: theme.colors.primaryLight, fontSize: theme.fontSize.lg, fontWeight: theme.fontWeight.bold },
    checkBadge: {
      width: 28,
      height: 28,
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.income,
      alignItems: 'center',
      justifyContent: 'center',
    },
    track: {
      height: 10,
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.surfaceAccent,
      overflow: 'hidden',
    },
    fill: { height: '100%', borderRadius: theme.borderRadius.full },
    amounts: { flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.xs },
    current: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.bold },
    target: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm },
  });

// Memoizado: se renderiza por fila en listas; con props estables evita re-render.
export const SavingsGoalCard = React.memo(SavingsGoalCardComponent);
