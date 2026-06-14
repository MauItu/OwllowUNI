import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Icon } from './Icon';
import { formatCurrency } from '../utils/formatCurrency';
import type { Template } from '../types';

interface Props {
  template: Template;
  onPress?: (t: Template) => void;
  compact?: boolean;
}

function TemplateCardComponent({ template, onPress, compact }: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const color = template.categoryColor ?? theme.colors.primary;
  const amountColor = template.type === 'income' ? theme.colors.income : theme.colors.expense;
  const sign = template.type === 'income' ? '+' : '-';

  if (compact) {
    return (
      <Pressable onPress={() => onPress?.(template)} style={({ pressed }) => [styles.compact, pressed && { opacity: 0.7 }]}>
        <View style={[styles.iconWrap, { backgroundColor: `${color}26` }]}>
          <Icon name={template.categoryIcon ?? 'bookmark'} size={18} color={color} />
        </View>
        <Text style={styles.compactName} numberOfLines={1}>
          {template.name}
        </Text>
        {template.amount != null && (
          <Text style={[styles.compactAmount, { color: amountColor }]} numberOfLines={1}>
            {formatCurrency(template.amount)}
          </Text>
        )}
      </Pressable>
    );
  }

  return (
    <Pressable onPress={() => onPress?.(template)} style={({ pressed }) => [styles.card, pressed && { backgroundColor: theme.colors.surfaceLight }]}>
      <View style={[styles.iconWrap, { backgroundColor: `${color}26` }]}>
        <Icon name={template.categoryIcon ?? 'bookmark'} size={20} color={color} />
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {template.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {template.categoryName ?? 'Sin categoría'}
          {template.accountName ? ` · ${template.accountName}` : ''} · Usada {template.useCount}×
        </Text>
      </View>
      {template.amount != null && (
        <Text style={[styles.amount, { color: amountColor }]} numberOfLines={1}>
          {sign}
          {formatCurrency(template.amount)}
        </Text>
      )}
    </Pressable>
  );
}

export const TemplateCard = React.memo(TemplateCardComponent);

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
  },
  iconWrap: { width: 42, height: 42, borderRadius: theme.borderRadius.full, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  name: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold },
  meta: { color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, marginTop: 2 },
  amount: { fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold },
  compact: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    width: 140,
    marginRight: theme.spacing.sm,
    gap: theme.spacing.xs,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
  },
  compactName: { color: theme.colors.text, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold },
  compactAmount: { fontSize: theme.fontSize.xs, fontWeight: theme.fontWeight.semibold },
});
