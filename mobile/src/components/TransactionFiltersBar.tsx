import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { type Theme } from '../theme';
import { Icon } from './Icon';
import type { TxType, Tag } from '../types';
import type { Account } from '../types';

interface TransactionFiltersBarProps {
  typeFilter: TxType | 'all';
  setTypeFilter: (type: TxType | 'all') => void;
  accountId: number | undefined;
  setShowAccount: (show: boolean) => void;
  selectedAccount: Account | undefined;
  dateRange: { from?: string; to?: string };
  setShowDate: (show: boolean) => void;
  tagId: number | undefined;
  setShowTags: (show: boolean) => void;
  selectedTag: Tag | undefined;
  hasFilters: boolean;
  onClearFilters: () => void;
  theme: Theme;
}

const TYPE_FILTERS: { key: TxType | 'all'; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'expense', label: 'Gastos' },
  { key: 'income', label: 'Ingresos' },
  { key: 'transfer', label: 'Transferencias' },
];

export function TransactionFiltersBar({
  typeFilter,
  setTypeFilter,
  accountId,
  setShowAccount,
  selectedAccount,
  dateRange,
  setShowDate,
  tagId,
  setShowTags,
  selectedTag,
  hasFilters,
  onClearFilters,
  theme,
}: TransactionFiltersBarProps) {
  const styles = createStyles(theme);
  const chipTrio = [theme.colors.primary, theme.colors.secondary, theme.colors.accent];

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
        scrollEventThrottle={16}
      >
        {TYPE_FILTERS.map((f, i) => (
          <Pressable
            key={f.key}
            style={[styles.chip, typeFilter === f.key && { backgroundColor: chipTrio[i % 3] }]}
            onPress={() => setTypeFilter(f.key)}
          >
            <Text style={[styles.chipText, typeFilter === f.key && styles.chipTextActive]}>{f.label}</Text>
          </Pressable>
        ))}
        <View style={styles.chipDivider} />
        <Pressable
          style={[styles.chip, styles.chipIcon, accountId != null && { backgroundColor: theme.colors.secondary }]}
          onPress={() => setShowAccount(true)}
        >
          <Icon name="wallet" size={14} color={accountId != null ? '#FFFFFF' : theme.colors.textSecondary} />
          <Text style={[styles.chipText, accountId != null && styles.chipTextActive]} numberOfLines={1}>
            {selectedAccount ? selectedAccount.name : 'Cuenta'}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.chip, styles.chipIcon, dateRange.from != null && { backgroundColor: theme.colors.accent }]}
          onPress={() => setShowDate(true)}
        >
          <Icon name="calendar" size={14} color={dateRange.from != null ? '#FFFFFF' : theme.colors.textSecondary} />
          <Text style={[styles.chipText, dateRange.from != null && styles.chipTextActive]} numberOfLines={1}>
            {dateRange.from ? dateRange.from : 'Fecha'}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.chip, styles.chipIcon, tagId != null && { backgroundColor: selectedTag?.color ?? theme.colors.primary }]}
          onPress={() => setShowTags(true)}
        >
          <Icon name="tag" size={14} color={tagId != null ? '#FFFFFF' : theme.colors.textSecondary} />
          <Text style={[styles.chipText, tagId != null && styles.chipTextActive]} numberOfLines={1}>
            {selectedTag ? selectedTag.name : 'Etiqueta'}
          </Text>
        </Pressable>
        {hasFilters && (
          <Pressable style={[styles.chip, styles.chipIcon]} onPress={onClearFilters}>
            <Icon name="x" size={14} color={theme.colors.expense} />
            <Text style={[styles.chipText, { color: theme.colors.expense }]}>Limpiar</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      backgroundColor: theme.colors.background,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    chipsRow: {
      gap: theme.spacing.sm,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
      alignItems: 'center',
      minHeight: 48,
    },
    chip: {
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 8,
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: 36,
    },
    chipIcon: {
      flexDirection: 'row',
      gap: 6,
    },
    chipText: {
      color: theme.colors.textSecondary,
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.medium,
      maxWidth: 130,
    },
    chipTextActive: {
      color: '#FFFFFF',
      fontWeight: theme.fontWeight.bold,
    },
    chipDivider: {
      width: 1,
      height: 24,
      backgroundColor: theme.colors.border,
      marginHorizontal: theme.spacing.xs,
    },
  });
