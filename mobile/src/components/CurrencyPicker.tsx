import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet } from 'react-native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Icon } from './Icon';
import { BottomSheet } from './BottomSheet';
import { CURRENCIES } from '../utils/currencies';

interface Props {
  visible: boolean;
  selected?: string;
  title?: string;
  onSelect: (code: string) => void;
  onClose: () => void;
}

/** Selector de moneda: lista curada con búsqueda por código o nombre. */
export function CurrencyPicker({ visible, selected, title = 'Selecciona moneda', onSelect, onClose }: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [query, setQuery] = useState('');

  const data = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CURRENCIES;
    return CURRENCIES.filter((c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
  }, [query]);

  const close = () => {
    setQuery('');
    onClose();
  };

  return (
    <BottomSheet visible={visible} title={title} onClose={close} maxHeight="80%">
      <View style={styles.searchBar}>
        <Icon name="search" size={18} color={theme.colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar moneda"
          placeholderTextColor={theme.colors.textMuted}
          style={styles.searchInput}
          autoCorrect={false}
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Icon name="x" size={16} color={theme.colors.textMuted} />
          </Pressable>
        )}
      </View>

      <FlatList
        data={data}
        keyExtractor={(c) => c.code}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: theme.spacing.md }}
        ListEmptyComponent={<Text style={styles.empty}>Sin resultados</Text>}
        renderItem={({ item }) => {
          const active = item.code === selected;
          return (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
              onPress={() => {
                onSelect(item.code);
                close();
              }}
            >
              <View style={[styles.symbolWrap, active && { backgroundColor: `${theme.colors.primary}22` }]}>
                <Text style={[styles.symbol, active && { color: theme.colors.primaryLight }]}>{item.symbol}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.code}>{item.code}</Text>
                <Text style={styles.name}>{item.name}</Text>
              </View>
              {active && <Icon name="check" size={20} color={theme.colors.primary} />}
            </Pressable>
          );
        }}
      />
    </BottomSheet>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      backgroundColor: theme.colors.surfaceLight,
      borderRadius: theme.borderRadius.full,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      marginBottom: theme.spacing.md,
    },
    searchInput: { flex: 1, color: theme.colors.text, fontSize: theme.fontSize.md, paddingVertical: 2 },
    row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.sm + 2 },
    symbolWrap: {
      width: 44,
      height: 44,
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.surfaceLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    symbol: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.bold },
    code: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold },
    name: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginTop: 1 },
    empty: { color: theme.colors.textSecondary, textAlign: 'center', padding: theme.spacing.xl },
  });
