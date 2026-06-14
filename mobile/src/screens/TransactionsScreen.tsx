import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, SectionList, Pressable, TextInput, RefreshControl, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, EmptyState, ErrorState } from '../components/common';
import { TransactionCard } from '../components/TransactionCard';
import { TransactionFiltersBar } from '../components/TransactionFiltersBar';
import { AccountTypeFilter, type AccountTypeValue } from '../components/AccountTypeFilter';
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
import type { RootStackParamList } from '../navigation/types';
import type { Transaction, TxType } from '../types';

export function TransactionsScreen() {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const route = useRoute<RouteProp<RootStackParamList, 'Transactions'>>();
  const { accounts } = useAccounts();
  const triggerRefresh = useAppStore((s) => s.triggerRefresh);

  const { tags } = useTags();

  const [search, setSearch] = useState(route.params?.search ?? '');
  const [typeFilter, setTypeFilter] = useState<TxType | 'all'>('all');
  const [accountType, setAccountType] = useState<AccountTypeValue>('all');
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

  // El endpoint GET /api/transactions acepta un único account_id, no un tipo de
  // cuenta, así que el filtro débito/crédito se aplica en cliente: agrupamos los
  // ids de las tarjetas de crédito y filtramos por pertenencia (transfers incluidas
  // por su cuenta origen, account_id).
  const creditIds = useMemo(
    () => new Set(accounts.filter((a) => a.type === 'credit_card').map((a) => a.id)),
    [accounts],
  );

  const visibleTransactions = useMemo(() => {
    if (accountType === 'all') return transactions;
    return transactions.filter((t) =>
      accountType === 'credit' ? creditIds.has(t.accountId) : !creditIds.has(t.accountId),
    );
  }, [transactions, accountType, creditIds]);

  const sections = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of visibleTransactions) {
      const label = groupLabel(t.date);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(t);
    }
    return Array.from(map.entries()).map(([title, data]) => ({ title, data }));
  }, [visibleTransactions]);

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const selectedTag = tags.find((t) => t.id === tagId);
  const hasFilters = typeFilter !== 'all' || accountType !== 'all' || accountId != null || range.from != null || tagId != null;

  const remove = useCallback(
    async (t: Transaction) => {
      try {
        await transactionsApi.remove(t.id);
        // Borra también la foto del recibo local, si la tenía.
        if (t.receiptFilename) void deleteReceipt(t.receiptFilename);
        showSuccess('Movimiento eliminado');
        triggerRefresh();
      } catch (err) {
        showError(getErrorMessage(err));
      }
    },
    [triggerRefresh],
  );

  const renderRightActions = useCallback(
    (t: Transaction) => (
      <Pressable style={styles.deleteAction} onPress={() => remove(t)}>
        <Icon name="trash-2" size={22} color="#FFFFFF" />
      </Pressable>
    ),
    [styles, remove],
  );

  const keyExtractor = useCallback((item: Transaction) => String(item.id), []);
  const renderSectionHeader = useCallback(
    ({ section }: { section: { title: string } }) => <Text style={styles.sectionHeader}>{section.title}</Text>,
    [styles],
  );
  // El onPress por item necesita el closure de `item`, así que se queda inline.
  const renderItem = useCallback(
    ({ item }: { item: Transaction }) => (
      <Swipeable renderRightActions={() => renderRightActions(item)} overshootRight={false}>
        <TransactionCard
          transaction={item}
          onPress={() => navigation.navigate('AddTransaction', { transactionId: item.id })}
        />
      </Swipeable>
    ),
    [renderRightActions, navigation],
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

      {/* Chips de filtro */}
      <TransactionFiltersBar
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        accountId={accountId}
        setShowAccount={setShowAccount}
        selectedAccount={selectedAccount}
        dateRange={range}
        setShowDate={setShowDate}
        tagId={tagId}
        setShowTags={setShowTags}
        selectedTag={selectedTag}
        hasFilters={hasFilters}
        onClearFilters={() => {
          setTypeFilter('all');
          setAccountType('all');
          setAccountId(undefined);
          setTagId(undefined);
          setRange({});
        }}
        theme={theme}
      />

      {/* Filtro por tipo de cuenta: Todas | Débito | Crédito (client-side) */}
      <AccountTypeFilter value={accountType} onChange={setAccountType} />

      {error && transactions.length === 0 ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={keyExtractor}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          maxToRenderPerBatch={15}
          windowSize={10}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.primary} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => hasMore && loadMore()}
          renderSectionHeader={renderSectionHeader}
          renderItem={renderItem}
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
