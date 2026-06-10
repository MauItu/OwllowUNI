import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { type Theme } from '../theme';
import { useThemedStyles } from '../theme/ThemeContext';
import { Icon } from './Icon';
import type { Tag } from '../types';

interface Props {
  tag: Pick<Tag, 'id' | 'name' | 'color' | 'icon'>;
  selected?: boolean;
  /** Mini = pills compactas dentro de TransactionCard. */
  size?: 'sm' | 'md';
  onPress?: () => void;
  /** Si se pasa, muestra una X para quitar el tag. */
  onRemove?: () => void;
}

/** Pill de etiqueta: fondo translúcido del color del tag; sólido si está seleccionada. */
export function TagChip({ tag, selected = false, size = 'md', onPress, onRemove }: Props) {
  const styles = useThemedStyles(createStyles);
  const isMini = size === 'sm';
  const textColor = selected ? '#FFFFFF' : tag.color;

  const content = (
    <View
      style={[
        styles.chip,
        isMini && styles.chipMini,
        { backgroundColor: selected ? tag.color : `${tag.color}26` },
      ]}
    >
      <Icon name={tag.icon} size={isMini ? 10 : 14} color={textColor} strokeWidth={2.4} />
      <Text style={[styles.text, isMini && styles.textMini, { color: textColor }]} numberOfLines={1}>
        {tag.name}
      </Text>
      {onRemove && (
        <Pressable onPress={onRemove} hitSlop={8}>
          <Icon name="x" size={isMini ? 10 : 14} color={textColor} strokeWidth={2.4} />
        </Pressable>
      )}
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.7 }}>
      {content}
    </Pressable>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
      borderRadius: theme.borderRadius.full,
      paddingHorizontal: theme.spacing.sm + 2,
      paddingVertical: 6,
      alignSelf: 'flex-start',
    },
    chipMini: { paddingHorizontal: theme.spacing.sm, paddingVertical: 2, gap: 3 },
    text: { fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold, maxWidth: 120 },
    textMini: { fontSize: theme.fontSize.xs - 1, maxWidth: 90 },
  });
