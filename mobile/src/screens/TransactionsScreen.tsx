import React, { useMemo, useState } from 'react';
import { View, Text, SectionList, Pressable, TextInput, RefreshControl, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, EmptyState, ErrorState } from '../components/common';
import { TransactionCard } from '../components/TransactionCard';
import { AccountPicker } from '../components/AccountPicker';
import { DateRangePicker } from '../components/DateRangePicker';
import { TagPicker } from '../components/TagPicker';
import { Icon } from '../components/Icon';
import { useTransactions } from '../hooks/useTransactions';
import { useAccounts } from '../hooks/useAccounts';
import { useTags } from '../hooks/useTags';
import { useAppStore } from '../stores/appStore';
import { transactionsApi, getErrorMessage } from '../api/client';
import { showError, showSuccess } from '../components/toastConfig';
import { groupLabel, formatShortDate } from '../utils/formatDate';
import { deleteReceipt } from '../utils/receiptStorage';
import type { TabParamList } from '../navigation/types';
import type { Transaction, TxType } from '../types';

const TYPE_FILTERS: { key: TxType | 'all'; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'expense', label: 'Gastos' },
  { key: 'income', label: 'Ingresos' },
  { key: 'transfer', label: 'Transferencias' },
];

export function TransactionsScreen() {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const route = useRoute<RouteProp<TabParamList, 'Transactions'>>();
  const { accounts } = useAccounts();
  const triggerRefresh = useAppStore((s) => s.triggerRefresh);

  const { tags } = useTags();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TxType | 'all'>('all');
  const [accountId, setAccountId] = useState<number | undefined>(route.params?.accountId);
  const [tagId, setTagId] = useState<number | undefined>(undefined);
  const [range, setRange] = useState<{ from?: string; to?: string }>({});
  const [showAccount, setShowAccount] = useState(false);
  const [showDate, setShowDate] = useState(false);
  const [showTags, setShowTags] = useState(false);

  const filters = useMemo(
    () => ({
      type: typeFilter === 'all' ? undefined : typeFilter,
      account_id: accountId,
      tag_id: tagId,
      from_date: range.from,
      to_date: range.to,
      search: search.trim() || undefined,
    }),
    [typeFilter, accountId, tagId, range, search],
  );

  const { transactions, loading, refreshing, loadingMore, error, refresh, loadMore, hasMore } = useTransactions(filters);

  const sections = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of transactions) {
      const label = groupLabel(t.date);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(t);
    }
    return Array.from(map.entries()).map(([title, data]) => ({ title, data }));
  }, [transactions]);

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const selectedTag = tags.find((t) => t.id === tagId);
  const hasFilters = typeFilter !== 'all' || accountId != null || range.from != null || tagId != null;

  const remove = async (t: Transaction) => {
    try {
      await transactionsApi.remove(t.id);
      // Borra también la foto del recibo local, si la tenía.
      if (t.receiptFilename) void deleteReceipt(t.receiptFilename);
      showSuccess('Movimiento eliminado');
      triggerRefresh();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  // Chips activos alternan los tres colores de la bandera
  const chipTrio = [theme.colors.primary, theme.colors.secondary, theme.colors.accent];

  const renderRightActions = (t: Transaction) => (
    <Pressable style={styles.deleteAction} onPress={() => remove(t)}>
      <Icon name="trash-2" size={22} color="#FFFFFF" />
    </Pressable>
  );

  return (
    <Screen>
      <ScreenHeader title="Movimientos" />

      {/* Búsqueda */}
      <View style={styles.searchBar}>
        <Icon name="search" size={18} color={theme.colors.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar por descripción"
          placeholderTextColor={theme.colors.textMuted}
          style={styles.searchInput}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <Icon name="x" size={16} color={theme.colors.textMuted} />
          </Pressable>
        )}
      </View>

      {/* Chips de filtro (scroll horizontal) */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
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
        <Pressable style={[styles.chip, styles.chipIcon, accountId != null && { backgroundColor: theme.colors.secondary }]} onPress={() => setShowAccount(true)}>
          <Icon name="wallet" size={14} color={accountId != null ? '#FFFFFF' : theme.colors.textSecondary} />
          <Text style={[styles.chipText, accountId != null && styles.chipTextActive]} numberOfLines={1}>
            {selectedAccount ? selectedAccount.name : 'Cuenta'}
          </Text>
        </Pressable>
        <Pressable style={[styles.chip, styles.chipIcon, range.from != null && { backgroundColor: theme.colors.accent }]} onPress={() => setShowDate(true)}>
          <Icon name="calendar" size={14} color={range.from != null ? '#FFFFFF' : theme.colors.textSecondary} />
          <Text style={[styles.chipText, range.from != null && styles.chipTextActive]} numberOfLines={1}>
            {range.from ? formatShortDate(range.from) : 'Fecha'}
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
          <Pressable
            style={[styles.chip, styles.chipIcon]}
            onPress={() => {
              setTypeFilter('all');
              setAccountId(undefined);
              setTagId(undefined);
              setRange({});
            }}
          >
            <Icon name="x" size={14} color={theme.colors.expense} />
            <Text style={[styles.chipText, { color: theme.colors.expense }]}>Limpiar</Text>
          </Pressable>
        )}
      </ScrollView>

      {error && transactions.length === 0 ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.primary} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => hasMore && loadMore()}
          renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
          renderItem={({ item }) => (
            <Swipeable renderRightActions={() => renderRightActions(item)} overshootRight={false}>
              <TransactionCard
                transaction={item}
                onPress={() => navigation.navigate('AddTransaction', { transactionId: item.id })}
              />
            </Swipeable>
          )}
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator color={theme.colors.primary} style={{ marginTop: theme.spacing.xl }} />
            ) : (
              <EmptyState icon="receipt" text="No hay movimientos con estos filtros" />
            )
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: theme.spacing.md }} /> : null}
        />
      )}

      {/* FAB agregar */}
      <Pressable style={styles.fab} onPress={() => navigation.navigate('AddTransaction')}>
        <Icon name="plus" size={26} color={theme.colors.background} strokeWidth={2.4} />
      </Pressable>

      <AccountPicker
        visible={showAccount}
        accounts={accounts}
        title="Filtrar por cuenta"
        onSelect={(a) => {
          setAccountId(a.id);
          setShowAccount(false);
        }}
        onClose={() => setShowAccount(false)}
      />
      <DateRangePicker
        visible={showDate}
        onConfirm={({ from, to }) => {
          setRange({ from, to });
          setShowDate(false);
        }}
        onClose={() => setShowDate(false)}
      />
      <TagPicker
        visible={showTags}
        title="Filtrar por etiqueta"
        selectedIds={tagId != null ? [tagId] : []}
        onToggle={(tag) => {
          setTagId((prev) => (prev === tag.id ? undefined : tag.id));
          setShowTags(false);
        }}
        onClose={() => setShowTags(false)}
      />
    </Screen>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceLight,
    marginHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 2,
  },
  searchInput: { flex: 1, color: theme.colors.text, fontSize: theme.fontSize.md, paddingVertical: 2 },
  chipsRow: { gap: theme.spacing.sm, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md, alignItems: 'center' },
  chip: { paddingHorizontal: theme.spacing.md, paddingVertical: 7, borderRadius: theme.borderRadius.full, backgroundColor: theme.colors.surface },
  chipIcon: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium, maxWidth: 130 },
  chipTextActive: { color: '#FFFFFF', fontWeight: theme.fontWeight.bold },
  chipDivider: { width: 1, height: 20, backgroundColor: theme.colors.border, marginHorizontal: theme.spacing.xs },
  list: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.xs, paddingBottom: theme.spacing.xxl + theme.spacing.xl },
  sectionHeader: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.bold, marginTop: theme.spacing.md, marginBottom: theme.spacing.xs },
  deleteAction: {
    backgroundColor: theme.colors.expense,
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
    marginBottom: theme.spacing.sm,
    borderRadius: theme.borderRadius.lg,
    marginLeft: theme.spacing.sm,
  },
  fab: {
    position: 'absolute',
    right: theme.spacing.lg,
    bottom: theme.spacing.lg,
    width: 56,
    height: 56,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
});
