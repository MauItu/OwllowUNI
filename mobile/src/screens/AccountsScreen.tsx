import React, { useCallback } from 'react';
import { View, Text, FlatList, RefreshControl, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, EmptyState, ErrorState, Loading } from '../components/common';
import { AccountCard } from '../components/AccountCard';
import { Icon } from '../components/Icon';
import { useAccounts } from '../hooks/useAccounts';
import { useAccountsSummary } from '../hooks/useAccountsSummary';
import { useSettingsStore } from '../stores/settingsStore';
import { formatCurrency } from '../utils/formatCurrency';
import type { Account } from '../types';

export function AccountsScreen() {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { accounts, totalBalance, loading, refreshing, error, refetch } = useAccounts();
  const mainCurrency = useSettingsStore((s) => s.mainCurrency);
  const { summary, refetch: refetchSummary } = useAccountsSummary(mainCurrency);

  const onRefresh = useCallback(() => {
    refetch(true);
    refetchSummary();
  }, [refetch, refetchSummary]);

  // Handlers estables (no dependen del closure de cada item) → la AccountCard
  // memoizada no se re-renderiza cuando la lista se vuelve a renderizar.
  const openAccount = useCallback(
    (a: Account) => navigation.navigate('AddAccount', { accountId: a.id }),
    [navigation],
  );
  const keyExtractor = useCallback((a: Account) => String(a.id), []);
  const renderItem = useCallback(
    ({ item }: { item: Account }) => <AccountCard account={item} onPress={openAccount} />,
    [openAccount],
  );

  // ¿Hay cuentas en una moneda distinta a la principal? → mostrar nota de tasas.
  const hasForeign = !!summary?.byCurrency.some((b) => b.currency.toUpperCase() !== mainCurrency.toUpperCase());
  const consolidated = summary?.total ?? totalBalance;
  const ratesAgo =
    summary?.ratesUpdatedAt != null
      ? formatDistanceToNow(new Date(summary.ratesUpdatedAt), { addSuffix: true, locale: es })
      : null;

  if (loading && accounts.length === 0) {
    return (
      <Screen>
        <ScreenHeader title="Cuentas" />
        <Loading />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title="Cuentas"
        right={
          <Pressable onPress={() => navigation.navigate('AddAccount')} hitSlop={10}>
            <Icon name="plus" size={24} color="#FFFFFF" />
          </Pressable>
        }
      />

      <LinearGradient
        colors={theme.gradients.cardHighlight}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.totalCard}
      >
        <View style={styles.totalHeader}>
          <View style={styles.totalIcon}>
            <Icon name="layers" size={20} color="#FFFFFF" />
          </View>
          <Pressable onPress={() => navigation.navigate('Rates')} hitSlop={8} style={styles.ratesPill}>
            <Icon name="arrow-right-left" size={13} color="#FFFFFF" />
            <Text style={styles.ratesPillText}>Tasas</Text>
          </Pressable>
        </View>
        <Text style={styles.totalLabel}>Total consolidado · {mainCurrency}</Text>
        <Text style={styles.totalValue} numberOfLines={1} adjustsFontSizeToFit>
          {formatCurrency(consolidated, mainCurrency)}
        </Text>
        {hasForeign && (
          <Pressable style={styles.ratesNote} onPress={() => refetchSummary(true)} hitSlop={6}>
            <Icon name={summary?.stale ? 'triangle-alert' : 'refresh-cw'} size={12} color="rgba(255,255,255,0.85)" />
            <Text style={styles.ratesNoteText}>
              {summary?.stale ? 'Tasas sin actualizar' : `Tasas actualizadas ${ratesAgo ?? ''}`} · toca para refrescar
            </Text>
          </Pressable>
        )}
      </LinearGradient>

      {error && accounts.length === 0 ? (
        <ErrorState message={error} onRetry={() => refetch()} />
      ) : (
        <FlatList
          data={accounts}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
          renderItem={renderItem}
          removeClippedSubviews
          maxToRenderPerBatch={15}
          windowSize={10}
          ListEmptyComponent={<EmptyState icon="wallet" text="No tienes cuentas. Crea la primera." />}
        />
      )}
    </Screen>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
  totalCard: {
    margin: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  totalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing.sm },
  totalIcon: { width: 40, height: 40, borderRadius: theme.borderRadius.full, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  ratesPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: theme.borderRadius.full, paddingHorizontal: theme.spacing.sm, paddingVertical: 5 },
  ratesPillText: { color: '#FFFFFF', fontSize: theme.fontSize.xs, fontWeight: theme.fontWeight.semibold },
  totalLabel: { color: 'rgba(255,255,255,0.85)', fontSize: theme.fontSize.sm },
  totalValue: { color: '#FFFFFF', fontSize: theme.fontSize.xxl, fontWeight: theme.fontWeight.bold, marginTop: theme.spacing.xs, letterSpacing: -0.5 },
  ratesNote: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: theme.spacing.sm },
  ratesNoteText: { color: 'rgba(255,255,255,0.85)', fontSize: theme.fontSize.xs },
  list: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
});
