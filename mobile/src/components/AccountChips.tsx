import React from 'react';
import { Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Icon } from './Icon';
import type { Account } from '../types';

interface Props {
  accounts: Account[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  /** Muestra un chip "Sin cuenta" que selecciona null. */
  allowNone?: boolean;
  noneLabel?: string;
}

/**
 * Selector horizontal de cuenta como chips. Pensado para usarse dentro de
 * un BottomSheet (evita anidar Modales como haría AccountPicker).
 */
export function AccountChips({ accounts, selectedId, onSelect, allowNone = false, noneLabel = 'Sin cuenta' }: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      {allowNone && (
        <Pressable
          style={[styles.chip, selectedId == null && { borderColor: theme.colors.primary, backgroundColor: `${theme.colors.primary}1A` }]}
          onPress={() => onSelect(null)}
        >
          <Icon name="ban" size={16} color={selectedId == null ? theme.colors.primary : theme.colors.textSecondary} />
          <Text style={[styles.chipText, selectedId == null && { color: theme.colors.text }]}>{noneLabel}</Text>
        </Pressable>
      )}
      {accounts.map((a) => {
        const active = a.id === selectedId;
        return (
          <Pressable
            key={a.id}
            style={[styles.chip, active && { borderColor: a.color, backgroundColor: `${a.color}1A` }]}
            onPress={() => onSelect(a.id)}
          >
            <Icon name={a.icon} size={16} color={active ? a.color : theme.colors.textSecondary} />
            <Text style={[styles.chipText, active && { color: theme.colors.text }]} numberOfLines={1}>
              {a.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    row: { gap: theme.spacing.sm, paddingVertical: theme.spacing.xs, paddingRight: theme.spacing.md },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.borderRadius.full,
      borderWidth: 1.5,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceLight,
    },
    chipText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium, maxWidth: 120 },
  });
