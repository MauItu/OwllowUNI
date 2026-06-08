import React, { useMemo, useState } from 'react';
import { View, Text, SectionList, Pressable, TextInput, RefreshControl, StyleSheet, ActivityIndicator } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { theme } from '../theme';
import { Screen, ScreenHeader, EmptyState, ErrorState } from '../components/common';
import { TransactionCard } from '../components/TransactionCard';
import { AccountPicker } from '../components/AccountPicker';
import { DateRangePicker } from '../components/DateRangePicker';
import { Icon } from '../components/Icon';
import { useTransactions } from '../hooks/useTransactions';
import { useAccounts } from '../hooks/useAccounts';
import { useAppStore } from '../stores/appStore';
import { transactionsApi, getErrorMessage } from '../api/client';
import { showError, showSuccess } from '../components/toastConfig';
import { groupLabel, formatShortDate } from '../utils/formatDate';
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
  const route = useRoute<RouteProp<TabParamList, 'Transactions'>>();
  const { accounts } = useAccounts();
  const triggerRefresh = useAppStore((s) => s.triggerRefresh);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TxType | 'all'>('all');
  const [accountId, setAccountId] = useState<number | undefined>(route.params?.accountId);
  const [range, setRange] = useState<{ from?: string; to?: string }>({});
  const [showAccount, setShowAccount] = useState(false);
  const [showDate, setShowDate] = useState(false);

  const filters = useMemo(
    () => ({
      type: typeFilter === 'all' ? undefined : typeFilter,
      account_id: accountId,
      from_date: range.from,
      to_date: range.to,
      search: search.trim() || undefined,
    }),
    [typeFilter, accountId, range, search],
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
  const hasFilters = typeFilter !== 'all' || accountId != null || range.from != null;

  const remove = async (t: Transaction) => {
    try {
      await transactionsApi.remove(t.id);
      showSuccess('Movimiento eliminado');
      triggerRefresh();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  const renderRightActions = (t: Transaction) => (
    <Pressable style={styles.deleteAction} onPress={() => remove(t)}>
      <Icon name="trash-2" size={22} color="#fff" />
      <Text style={styles.deleteText}>Eliminar</Text>
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

      {/* Chips de tipo */}
      <View style={styles.chipsRow}>
        {TYPE_FILTERS.map((f) => (
          <Pressable
            key={f.key}
            style={[styles.chip, typeFilter === f.key && styles.chipActive]}
            onPress={() => setTypeFilter(f.key)}
          >
            <Text style={[styles.chipText, typeFilter === f.key && styles.chipTextActive]}>{f.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Filtros cuenta / fecha */}
      <View style={styles.filterRow}>
        <Pressable style={[styles.filterBtn, accountId != null && styles.filterBtnActive]} onPress={() => setShowAccount(true)}>
          <Icon name="wallet" size={15} color={accountId != null ? theme.colors.primaryLight : theme.colors.textSecondary} />
          <Text style={styles.filterText} numberOfLines={1}>
            {selectedAccount ? selectedAccount.name : 'Cuenta'}
          </Text>
        </Pressable>
        <Pressable style={[styles.filterBtn, range.from != null && styles.filterBtnActive]} onPress={() => setShowDate(true)}>
          <Icon name="calendar" size={15} color={range.from != null ? theme.colors.primaryLight : theme.colors.textSecondary} />
          <Text style={styles.filterText} numberOfLines={1}>
            {range.from ? `${formatShortDate(range.from)}` : 'Fecha'}
          </Text>
        </Pressable>
        {hasFilters && (
          <Pressable
            style={styles.clearBtn}
            onPress={() => {
              setTypeFilter('all');
              setAccountId(undefined);
              setRange({});
            }}
          >
            <Icon name="x" size={16} color={theme.colors.danger} />
          </Pressable>
        )}
      </View>

      {error && transactions.length === 0 ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.list}
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    marginHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  searchInput: { flex: 1, color: theme.colors.text, fontSize: theme.fontSize.md, paddingVertical: 2 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, paddingHorizontal: theme.spacing.md, marginTop: theme.spacing.sm },
  chip: { paddingHorizontal: theme.spacing.md, paddingVertical: 6, borderRadius: theme.borderRadius.xl, backgroundColor: theme.colors.surface },
  chipActive: { backgroundColor: theme.colors.primary },
  chipText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  filterRow: { flexDirection: 'row', gap: theme.spacing.sm, paddingHorizontal: theme.spacing.md, marginTop: theme.spacing.sm, alignItems: 'center' },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterBtnActive: { borderColor: theme.colors.primary },
  filterText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, flexShrink: 1 },
  clearBtn: { width: 38, height: 38, borderRadius: theme.borderRadius.md, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.xl * 2 },
  sectionHeader: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, fontWeight: '700', marginTop: theme.spacing.md, marginBottom: theme.spacing.xs },
  deleteAction: {
    backgroundColor: theme.colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
    width: 96,
    marginBottom: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    gap: 4,
  },
  deleteText: { color: '#fff', fontSize: theme.fontSize.xs, fontWeight: '600' },
});
