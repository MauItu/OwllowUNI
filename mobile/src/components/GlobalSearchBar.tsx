import React, { useEffect, useRef, useState } from 'react';
import { View, TextInput, Pressable, StyleSheet } from 'react-native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Icon } from './Icon';

/** Mínimo de caracteres para disparar la búsqueda. */
export const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 400;

interface Props {
  /** Recibe el término YA debounceado (>= MIN_QUERY_LENGTH o ''). */
  onDebouncedChange: (term: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
}

/**
 * Barra de búsqueda con lupa + botón limpiar. Debounce de 400ms implementado con
 * useRef + setTimeout (sin lodash). Solo emite términos de >= 2 caracteres; con
 * menos (o vacío) emite '' para que el consumidor limpie los resultados.
 */
export function GlobalSearchBar({ onDebouncedChange, autoFocus, placeholder = 'Buscar…' }: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [value, setValue] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (text: string) => {
    setValue(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const trimmed = text.trim();
      onDebouncedChange(trimmed.length >= MIN_QUERY_LENGTH ? trimmed : '');
    }, DEBOUNCE_MS);
  };

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    setValue('');
    onDebouncedChange('');
  };

  // Limpia el timer pendiente al desmontar.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <View style={styles.bar}>
      <Icon name="search" size={18} color={theme.colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={handleChange}
        autoFocus={autoFocus}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        style={styles.input}
        returnKeyType="search"
        autoCorrect={false}
      />
      {value.length > 0 && (
        <Pressable onPress={clear} hitSlop={10}>
          <Icon name="x" size={18} color={theme.colors.textSecondary} />
        </Pressable>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      backgroundColor: theme.colors.surfaceLight,
      borderRadius: theme.borderRadius.lg,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm + 2,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    input: { flex: 1, color: theme.colors.text, fontSize: theme.fontSize.md, padding: 0 },
  });
