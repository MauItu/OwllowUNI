import React from 'react';
import { View, Text, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Icon } from './Icon';
import { formatCurrency } from '../utils/formatCurrency';
import type { Insight, InsightSeverity, InsightType } from '../types';

// Ícono por tipo de insight.
const ICON_BY_TYPE: Record<InsightType, string> = {
  comparativa_categoria: 'trending-up',
  proyeccion_mes: 'calendar-clock',
  racha_registro: 'flame',
  top_crecimiento: 'arrow-up-right',
  patron_semanal: 'calendar-days',
  balance_salud: 'heart-pulse',
};

/** Color semántico del tema según la severidad. */
function severityColor(theme: Theme, severity: InsightSeverity): string {
  if (severity === 'positive') return theme.colors.income;
  if (severity === 'warning') return theme.colors.expense;
  return theme.colors.secondary; // info
}

/** Formatea el `value` crudo según el tipo (moneda / porcentaje / sin badge). */
function formatValue(insight: Insight): string | null {
  if (insight.value == null) return null;
  if (insight.type === 'balance_salud') return `${Math.round(insight.value)}%`;
  if (insight.type === 'racha_registro') return null; // el mensaje ya lo dice
  return formatCurrency(insight.value);
}

interface Props {
  insight: Insight;
  onPress?: () => void;
  style?: ViewStyle;
}

function InsightCardComponent({ insight, onPress, style }: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const color = severityColor(theme, insight.severity);
  const icon = ICON_BY_TYPE[insight.type] ?? 'lightbulb';
  const badge = formatValue(insight);

  const Container: React.ComponentType<any> = onPress ? Pressable : View;

  return (
    <Container
      style={[styles.card, { borderLeftColor: color }, style]}
      onPress={onPress}
      {...(onPress ? { android_ripple: { color: `${color}22` } } : {})}
    >
      <View style={styles.headerRow}>
        <View style={[styles.iconWrap, { backgroundColor: `${color}22` }]}>
          <Icon name={icon} size={18} color={color} />
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {insight.title}
        </Text>
        {badge && (
          <View style={[styles.badge, { backgroundColor: `${color}1A` }]}>
            <Text style={[styles.badgeText, { color }]} numberOfLines={1}>
              {badge}
            </Text>
          </View>
        )}
      </View>
      <Text style={styles.message} numberOfLines={3}>
        {insight.message}
      </Text>
    </Container>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.md,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
      borderLeftWidth: 4,
      gap: theme.spacing.sm,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
    iconWrap: { width: 34, height: 34, borderRadius: theme.borderRadius.full, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold },
    badge: { paddingHorizontal: theme.spacing.sm, paddingVertical: 3, borderRadius: theme.borderRadius.full },
    badgeText: { fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.bold },
    message: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, lineHeight: 19 },
  });

// Memoizado: se renderiza en el carrusel de insights; con props estables evita re-render.
export const InsightCard = React.memo(InsightCardComponent);
