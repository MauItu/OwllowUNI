import React from 'react';
import { View, Text, Modal, Pressable, FlatList, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Icon } from './Icon';
import { formatCurrency } from '../utils/formatCurrency';
import type { Account } from '../types';

interface Props {
  visible: boolean;
  accounts: Account[];
  title?: string;
  excludeId?: number;
  onSelect: (account: Account) => void;
  onClose: () => void;
}

export function AccountPicker({ visible, accounts, title = 'Selecciona cuenta', excludeId, onSelect, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const data = accounts.filter((a) => a.id !== excludeId);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Icon name="x" size={22} color={theme.colors.textSecondary} />
          </Pressable>
        </View>
        <FlatList
          data={data}
          keyExtractor={(a) => String(a.id)}
          contentContainerStyle={{ paddingBottom: theme.spacing.xl + insets.bottom }}
          ListEmptyComponent={<Text style={styles.empty}>No hay cuentas disponibles</Text>}
          renderItem={({ item }) => (
            <Pressable style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]} onPress={() => onSelect(item)}>
              <View style={[styles.iconWrap, { backgroundColor: `${item.color}22` }]}>
                <Icon name={item.icon} size={20} color={item.color} />
              </View>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.balance}>{formatCurrency(item.currentBalance, item.currency)}</Text>
            </Pressable>
          )}
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
    maxHeight: '70%',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md },
  title: { color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: '700' },
  item: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.sm + 2 },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, color: theme.colors.text, fontSize: theme.fontSize.md },
  balance: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm },
  empty: { color: theme.colors.textSecondary, textAlign: 'center', padding: theme.spacing.xl },
});
