import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, SectionList, RefreshControl, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, EmptyState, ErrorState, Loading } from '../components/common';
import { AccountCard } from '../components/AccountCard';
import { BottomSheet } from '../components/BottomSheet';
import { Icon } from '../components/Icon';
import { useAccounts } from '../hooks/useAccounts';
import { useAccountsSummary } from '../hooks/useAccountsSummary';
import { useSettingsStore } from '../stores/settingsStore';
import { accountsApi, getErrorMessage } from '../api/client';
import { showError } from '../components/toastConfig';
import { formatCurrency } from '../utils/formatCurrency';
import type { Account, AccountSavingsBreakdown } from '../types';

export function AccountsScreen() {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  // includeInactive: la lista muestra también las desactivadas (con indicador en la
  // card); los selectores de otras pantallas siguen usando useAccounts() (solo activas).
  const { accounts, totalBalance, loading, refreshing, error, refetch } = useAccounts(true);
  const mainCurrency = useSettingsStore((s) => s.mainCurrency);
  const { summary, refetch: refetchSummary } = useAccountsSummary(mainCurrency);

  const onRefresh = useCallback(() => {
    refetch(true);
    refetchSummary();
  }, [refetch, refetchSummary]);

  // Handlers estables (no dependen del closure de cada item) → la AccountCard
  // memoizada no se re-renderiza cuando la lista se vuelve a renderizar.
  const openAccount = useCallback(
    (a: Account) =>
      a.type === 'credit_card'
        ? navigation.navigate('CreditCardDetail', { accountId: a.id })
        : navigation.navigate('AddAccount', { accountId: a.id }),
    [navigation],
  );
  const keyExtractor = useCallback((a: Account) => String(a.id), []);

  // Desglose del ahorro de una cuenta (en qué metas está ese dinero).
  const [savingsAccount, setSavingsAccount] = useState<Account | null>(null);
  const [breakdown, setBreakdown] = useState<AccountSavingsBreakdown[]>([]);
  const [breakdownLoading, setBreakdownLoading] = useState(false);

  const openSavings = useCallback(async (a: Account) => {
    setSavingsAccount(a);
    setBreakdown([]);
    setBreakdownLoading(true);
    try {
      setBreakdown(await accountsApi.savings(a.id));
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setBreakdownLoading(false);
    }
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Account }) => <AccountCard account={item} onPress={openAccount} onPressSavings={openSavings} />,
    [openAccount, openSavings],
  );

  // Dos secciones: cuentas de débito (bank/cash/digital_wallet) y tarjetas de crédito.
  const debitAccounts = useMemo(() => accounts.filter((a) => a.type !== 'credit_card'), [accounts]);
  const creditAccounts = useMemo(() => accounts.filter((a) => a.type === 'credit_card'), [accounts]);

  const sections = useMemo(() => {
    const result: { key: string; title: string; value: string; data: Account[] }[] = [];
    if (debitAccounts.length > 0) {
      const debitTotal =
        summary?.debitTotal ?? debitAccounts.reduce((s, a) => s + parseFloat(a.currentBalance), 0);
      result.push({
        key: 'debit',
        title: 'Cuentas de débito',
        value: formatCurrency(debitTotal, mainCurrency),
        data: debitAccounts,
      });
    }
    if (creditAccounts.length > 0) {
      result.push({
        key: 'credit',
        title: 'Tarjetas de crédito',
        value: `Usado ${formatCurrency(summary?.creditUsed ?? 0, mainCurrency)} · Disponible ${formatCurrency(summary?.creditAvailable ?? 0, mainCurrency)}`,
        data: creditAccounts,
      });
    }
    return result;
  }, [debitAccounts, creditAccounts, summary, mainCurrency]);

  const renderSectionHeader = useCallback(
    ({ section }: { section: { title: string; value: string } }) => (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderTitle}>{section.title}</Text>
        <Text style={styles.sectionHeaderValue} numberOfLines={1}>
          {section.value}
        </Text>
      </View>
    ),
    [styles],
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
        <ScreenHeader title="Cuentas" onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined} />
        <Loading />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title="Cuentas"
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
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
        <SectionList
          sections={sections}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled={false}
          removeClippedSubviews
          maxToRenderPerBatch={15}
          windowSize={10}
          ListEmptyComponent={<EmptyState icon="wallet" text="No tienes cuentas. Crea la primera." />}
        />
      )}

      <BottomSheet
        visible={savingsAccount != null}
        title={savingsAccount ? `Ahorro en ${savingsAccount.name}` : 'Ahorro'}
        onClose={() => setSavingsAccount(null)}
      >
        <Text style={styles.sheetSubtitle}>Este dinero salió de la cuenta hacia tus metas de ahorro.</Text>
        {breakdownLoading ? (
          <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: theme.spacing.lg }} />
        ) : breakdown.length === 0 ? (
          <Text style={styles.sheetEmpty}>No hay ahorro asociado a esta cuenta.</Text>
        ) : (
          breakdown.map((b) => (
            <Pressable
              key={b.goalId}
              style={({ pressed }) => [styles.goalRow, pressed && { opacity: 0.7 }]}
              onPress={() => {
                setSavingsAccount(null);
                navigation.navigate('SavingsDetail', { goalId: b.goalId });
              }}
            >
              <View style={[styles.goalIcon, { backgroundColor: `${b.color}26` }]}>
                <Icon name={b.icon} size={18} color={b.color} />
              </View>
              <Text style={styles.goalName} numberOfLines={1}>
                {b.goalName}
              </Text>
              <Text style={styles.goalAmount}>{formatCurrency(b.amount, savingsAccount?.currency)}</Text>
              <Icon name="chevron-right" size={16} color={theme.colors.textMuted} />
            </Pressable>
          ))
        )}
      </BottomSheet>
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    backgroundColor: theme.colors.background,
  },
  sectionHeaderTitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionHeaderValue: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    flexShrink: 1,
    textAlign: 'right',
  },
  sheetSubtitle: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginBottom: theme.spacing.md },
  sheetEmpty: { color: theme.colors.textMuted, fontSize: theme.fontSize.sm, textAlign: 'center', marginVertical: theme.spacing.lg },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
  },
  goalIcon: { width: 38, height: 38, borderRadius: theme.borderRadius.full, alignItems: 'center', justifyContent: 'center' },
  goalName: { flex: 1, color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.medium },
  goalAmount: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.bold },
});
