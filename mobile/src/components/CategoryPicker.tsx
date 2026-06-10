import React, { useState } from 'react';
import { View, Text, Modal, Pressable, FlatList, StyleSheet } from 'react-native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Icon } from './Icon';
import { useCategories } from '../hooks/useCategories';
import type { Category } from '../types';

interface Props {
  visible: boolean;
  type: 'income' | 'expense';
  onSelect: (category: Category) => void;
  onClose: () => void;
}

/**
 * Selector categoría → subcategoría.
 * Primero muestra las categorías padre; al tocar una, muestra sus subcategorías
 * (con opción de usar la categoría padre directamente).
 */
export function CategoryPicker({ visible, type, onSelect, onClose }: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { categories, loading } = useCategories(type);
  const [parent, setParent] = useState<Category | null>(null);

  const close = () => {
    setParent(null);
    onClose();
  };

  const pick = (cat: Category) => {
    setParent(null);
    onSelect(cat);
  };

  const data = parent ? parent.children ?? [] : categories;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <View style={styles.sheet}>
        <View style={styles.header}>
          {parent ? (
            <Pressable onPress={() => setParent(null)} style={styles.back} hitSlop={10}>
              <Icon name="chevron-left" size={22} color={theme.colors.text} />
              <Text style={styles.headerTitle}>{parent.name}</Text>
            </Pressable>
          ) : (
            <Text style={styles.headerTitle}>Selecciona categoría</Text>
          )}
          <Pressable onPress={close} hitSlop={10}>
            <Icon name="x" size={22} color={theme.colors.textSecondary} />
          </Pressable>
        </View>

        {parent && (
          <Pressable style={styles.useParent} onPress={() => pick(parent)}>
            <View style={[styles.iconWrap, { backgroundColor: `${parent.color}22` }]}>
              <Icon name={parent.icon} size={20} color={parent.color} />
            </View>
            <Text style={styles.itemText}>Usar &quot;{parent.name}&quot;</Text>
            <Icon name="check" size={18} color={theme.colors.success} />
          </Pressable>
        )}

        <FlatList
          data={data}
          keyExtractor={(item) => String(item.id)}
          numColumns={1}
          contentContainerStyle={{ paddingBottom: theme.spacing.xl }}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {loading ? 'Cargando…' : parent ? 'Sin subcategorías' : 'No hay categorías'}
            </Text>
          }
          renderItem={({ item }) => {
            const hasChildren = !parent && (item.children?.length ?? 0) > 0;
            return (
              <Pressable
                style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}
                onPress={() => (hasChildren ? setParent(item) : pick(item))}
              >
                <View style={[styles.iconWrap, { backgroundColor: `${item.color}22` }]}>
                  <Icon name={item.icon} size={20} color={item.color} />
                </View>
                <Text style={styles.itemText}>{item.name}</Text>
                {hasChildren ? (
                  <Icon name="chevron-right" size={20} color={theme.colors.textMuted} />
                ) : null}
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    maxHeight: '75%',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md },
  back: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  headerTitle: { color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: '700' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 2,
  },
  useParent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    marginBottom: theme.spacing.sm,
  },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  itemText: { flex: 1, color: theme.colors.text, fontSize: theme.fontSize.md },
  empty: { color: theme.colors.textSecondary, textAlign: 'center', padding: theme.spacing.xl },
});
