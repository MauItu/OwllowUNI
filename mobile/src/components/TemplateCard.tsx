import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { theme } from '../theme';
import { Icon } from './Icon';
import { formatCurrency } from '../utils/formatCurrency';
import type { Template } from '../types';

interface Props {
  template: Template;
  onPress?: (t: Template) => void;
  compact?: boolean;
}

export function TemplateCard({ template, onPress, compact }: Props) {
  const color = template.categoryColor ?? theme.colors.primary;
  const sign = template.type === 'income' ? '+' : '-';

  if (compact) {
    return (
      <Pressable onPress={() => onPress?.(template)} style={({ pressed }) => [styles.compact, pressed && { opacity: 0.7 }]}>
        <View style={[styles.iconWrap, { backgroundColor: `${color}22` }]}>
          <Icon name={template.categoryIcon ?? 'bookmark'} size={18} color={color} />
        </View>
        <Text style={styles.compactName} numberOfLines={1}>
          {template.name}
        </Text>
        {template.amount != null && (
          <Text style={styles.compactAmount} numberOfLines={1}>
            {formatCurrency(template.amount)}
          </Text>
        )}
      </Pressable>
    );
  }

  return (
    <Pressable onPress={() => onPress?.(template)} style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}>
      <View style={[styles.iconWrap, { backgroundColor: `${color}22` }]}>
        <Icon name={template.categoryIcon ?? 'bookmark'} size={20} color={color} />
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {template.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {(template.categoryName ?? 'Sin categoría')}
          {template.accountName ? ` · ${template.accountName}` : ''} · Usada {template.useCount}×
        </Text>
      </View>
      {template.amount != null && (
        <Text
          style={[styles.amount, { color: template.type === 'income' ? theme.colors.success : theme.colors.danger }]}
          numberOfLines={1}
        >
          {sign}
          {formatCurrency(template.amount)}
        </Text>
      )}
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
  name: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: '600' },
  meta: { color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, marginTop: 2 },
  amount: { fontSize: theme.fontSize.md, fontWeight: '700' },
  compact: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    width: 130,
    marginRight: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  compactName: { color: theme.colors.text, fontSize: theme.fontSize.sm, fontWeight: '600' },
  compactAmount: { color: theme.colors.textSecondary, fontSize: theme.fontSize.xs },
});
