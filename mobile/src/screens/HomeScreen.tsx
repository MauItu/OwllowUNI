import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, SectionTitle, EmptyState } from '../components/common';
import { BalanceSummary } from '../components/BalanceSummary';
import { HomeSummaryCard } from '../components/HomeSummaryCard';
import { InsightCard } from '../components/InsightCard';
import { TransactionCard } from '../components/TransactionCard';
import { BottomSheet } from '../components/BottomSheet';
import { Icon } from '../components/Icon';
import { useAccounts } from '../hooks/useAccounts';
import { useAccountsSummary } from '../hooks/useAccountsSummary';
import { useSettingsStore } from '../stores/settingsStore';
import { useStats } from '../hooks/useStats';
import { useInsights } from '../hooks/useInsights';
import { useTransactions } from '../hooks/useTransactions';
import { useTemplates } from '../hooks/useTemplates';
import { useSavings } from '../hooks/useSavings';
import { useDebts } from '../hooks/useDebts';
import { useSplits } from '../hooks/useSplits';
import { useBudgets } from '../hooks/useBudgets';
import { useAppStore } from '../stores/appStore';
import { useSidebarStore } from '../stores/sidebarStore';
import { currentMonthRange } from '../utils/formatDate';
import { formatCurrency } from '../utils/formatCurrency';
import type { Template } from '../types';

// Ancho de cada InsightCard en el carrusel (deja ver un poco de la siguiente).
const CARD_WIDTH = Math.round(Dimensions.get('window').width * 0.8);

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

export function HomeScreen() {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<any>();
  const { accounts, totalBalance, loading: loadingAccounts, refetch: refetchAccounts } = useAccounts();
  const mainCurrency = useSettingsStore((s) => s.mainCurrency);
  const { summary: acctSummary, refetch: refetchAcctSummary } = useAccountsSummary(mainCurrency);
  const { from, to } = currentMonthRange();
  const { summary, refetch: refetchStats } = useStats(from, to, 'day', mainCurrency);
  const { insights, refetch: refetchInsights } = useInsights();
  const { transactions, refresh: refreshTx } = useTransactions({}, 5);
  const { templates, refetch: refetchTemplates } = useTemplates();
  const { summary: savingsSummary, refetch: refetchSavings } = useSavings();
  const { summary: debtsSummary, refetch: refetchDebts } = useDebts();
  const { summary: splitsSummary, refetch: refetchSplits } = useSplits();
  const { budgets, refetch: refetchBudgets } = useBudgets();
  const setPendingTemplate = useAppStore((s) => s.setPendingTemplate);
  const openSidebar = useSidebarStore((s) => s.open);

  const [refreshing, setRefreshing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchAccounts(true), refetchAcctSummary(), refetchStats(true), refetchInsights(true), refreshTx(), refetchTemplates(true), refetchSavings(true), refetchDebts(true), refetchSplits(true), refetchBudgets(true)]);
    setRefreshing(false);
  }, [refetchAccounts, refetchAcctSummary, refetchStats, refetchInsights, refreshTx, refetchTemplates, refetchSavings, refetchDebts, refetchSplits, refetchBudgets]);

  const useTemplate = (template: Template) => {
    // use_count se incrementa al CONFIRMAR la transacción en AddTransaction,
    // no al seleccionar la plantilla (así cancelar no la cuenta como usada).
    setSheetOpen(false);
    setPendingTemplate(template);
    navigation.navigate('AddTransaction', { template });
  };

  const today = format(new Date(), "EEEE, d 'de' MMMM", { locale: es });
  const dateLabel = today.charAt(0).toUpperCase() + today.slice(1);
  const latest = transactions.slice(0, 5);
  const homeInsights = insights.slice(0, 3); // carrusel: máximo 3
  // Alertas de presupuesto: activos por encima del 80%, las 2 de mayor %.
  const budgetAlerts = budgets
    .filter((b) => b.isActive && b.percentage >= 80)
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 2);

  // Tarjetas de crédito: alertas de utilización por encima del 80%, las 2 más altas.
  const creditCards = accounts.filter((a) => a.type === 'credit_card');
  const creditAlerts = creditCards
    .filter((a) => (a.utilizationPercentage ?? 0) > 80)
    .sort((a, b) => (b.utilizationPercentage ?? 0) - (a.utilizationPercentage ?? 0))
    .slice(0, 2);

  return (
    <Screen>
      <LinearGradient
        colors={theme.gradients.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.topBar}
      >
        <Pressable style={styles.iconBtn} onPress={openSidebar} hitSlop={8}>
          <Icon name="menu" size={24} color="#FFFFFF" />
        </Pressable>
        <View style={{ flex: 1, marginLeft: theme.spacing.sm }}>
          <Text style={styles.greeting}>{greeting()}</Text>
          <Text style={styles.date}>{dateLabel}</Text>
        </View>
        <View style={styles.topActions}>
          <Pressable style={styles.iconBtn} onPress={() => navigation.navigate('Search')} hitSlop={8}>
            <Icon name="search" size={22} color="#FFFFFF" />
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={() => navigation.navigate('Accounts')}>
            <Icon name="wallet" size={22} color="#FFFFFF" />
          </Pressable>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      >
        <BalanceSummary
          totalBalance={acctSummary?.total ?? totalBalance}
          income={summary.income}
          expense={summary.expense}
          currency={mainCurrency}
          debitTotal={acctSummary?.debitTotal ?? totalBalance}
          creditAvailable={acctSummary?.creditAvailable ?? 0}
          possibleMoney={acctSummary?.possibleMoney ?? (acctSummary?.debitTotal ?? totalBalance)}
          showCredit={creditCards.length > 0}
        />

        {/* El crédito disponible ya se muestra en el balance; aquí solo alertas de utilización. */}
        {creditAlerts.length > 0 && (
          <HomeSummaryCard
            icon="credit-card"
            color={theme.colors.expense}
            title="Alertas de crédito"
            value={formatCurrency(acctSummary?.creditAvailable ?? 0, mainCurrency)}
            onPress={() => navigation.navigate('Accounts')}
            extra={
              <View style={styles.creditAlerts}>
                {creditAlerts.map((a) => (
                  <Text key={a.id} style={styles.creditAlertText} numberOfLines={1}>
                    ⚠️ {a.name} al {Math.round(a.utilizationPercentage ?? 0)}% del límite
                  </Text>
                ))}
              </View>
            }
          />
        )}

        {budgetAlerts.length > 0 && (
          <View style={styles.budgetAlerts}>
            {budgetAlerts.map((b) => {
              const over = b.percentage > 100;
              const color = over ? theme.colors.expense : '#F59E0B';
              const name = b.categoryId == null ? 'Presupuesto Global' : b.categoryName ?? 'Categoría';
              return (
                <Pressable
                  key={b.id}
                  style={[styles.budgetAlert, { borderColor: color, backgroundColor: `${color}1A` }]}
                  onPress={() => navigation.navigate('Budgets')}
                >
                  <Icon name="triangle-alert" size={18} color={color} />
                  <Text style={styles.budgetAlertText} numberOfLines={1}>
                    {name} al {Math.round(b.percentage)}% del presupuesto
                  </Text>
                  <Icon name="chevron-right" size={16} color={theme.colors.textMuted} />
                </Pressable>
              );
            })}
          </View>
        )}

        {homeInsights.length > 0 && (
          <View style={styles.insightsSection}>
            <SectionTitle
              title="Insights"
              action={
                <Pressable onPress={() => navigation.navigate('Insights')}>
                  <Text style={styles.seeAll}>Ver todos</Text>
                </Pressable>
              }
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              snapToInterval={CARD_WIDTH + theme.spacing.sm}
              snapToAlignment="start"
              contentContainerStyle={styles.carousel}
            >
              {homeInsights.map((insight) => (
                <InsightCard
                  key={insight.id}
                  insight={insight}
                  style={{ width: CARD_WIDTH }}
                  onPress={() => navigation.navigate('Insights')}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {savingsSummary && savingsSummary.activeGoals + savingsSummary.completedGoals > 0 && (
          <HomeSummaryCard
            icon="piggy-bank"
            color={theme.colors.income}
            title="Metas de ahorro"
            subtitle={
              savingsSummary.activeGoals === 1
                ? '1 meta activa'
                : `${savingsSummary.activeGoals} metas activas`
            }
            value={formatCurrency(savingsSummary.totalSaved)}
            valueColor={theme.colors.income}
            onPress={() => navigation.navigate('Savings')}
          />
        )}

        {debtsSummary && debtsSummary.activeDebts + debtsSummary.activeLoans > 0 && (
          <HomeSummaryCard
            icon="landmark"
            color={theme.colors.expense}
            title="Deudas"
            subtitle={`Debo ${formatCurrency(debtsSummary.totalDebt)} · Me deben ${formatCurrency(debtsSummary.totalLoan)}`}
            value={formatCurrency(debtsSummary.netBalance)}
            valueColor={debtsSummary.netBalance < 0 ? theme.colors.expense : theme.colors.income}
            onPress={() => navigation.navigate('Debts')}
          />
        )}

        {splitsSummary && (splitsSummary.totalOwedToMe > 0 || splitsSummary.totalIOwe > 0) && (
          <HomeSummaryCard
            icon="users"
            color={theme.colors.accentLight}
            title="Gastos compartidos"
            subtitle={`Me deben ${formatCurrency(splitsSummary.totalOwedToMe)} · Debo ${formatCurrency(splitsSummary.totalIOwe)}`}
            value={formatCurrency(splitsSummary.netBalance)}
            valueColor={splitsSummary.netBalance < 0 ? theme.colors.expense : theme.colors.income}
            onPress={() => navigation.navigate('Splits')}
          />
        )}

        <View style={styles.section}>
          <SectionTitle title="Últimas transacciones" />
          {latest.length === 0 ? (
            <>
              <EmptyState icon="receipt" text={loadingAccounts ? 'Cargando…' : 'No hay transacciones aún'} />
              {!loadingAccounts && (
                <Pressable style={styles.seeAllBtn} onPress={() => navigation.navigate('AddTransaction')}>
                  <Text style={styles.seeAllBtnText}>Registrar primera transacción</Text>
                </Pressable>
              )}
            </>
          ) : (
            <>
              {latest.map((t) => (
                <TransactionCard key={t.id} transaction={t} onPress={() => navigation.navigate('Transactions')} />
              ))}
              <Pressable style={styles.seeAllBtn} onPress={() => navigation.navigate('Transactions')}>
                <Text style={styles.seeAllBtnText}>Ver todas las transacciones →</Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>

      {/* Botón flotante de plantillas */}
      <Pressable style={styles.templatesFab} onPress={() => setSheetOpen(true)}>
        <Icon name="zap" size={20} color="#FFFFFF" strokeWidth={2.4} />
      </Pressable>

      <BottomSheet visible={sheetOpen} title="Plantillas" onClose={() => setSheetOpen(false)} maxHeight="70%">
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: theme.spacing.md }}>
          {templates.length === 0 ? (
            <EmptyState icon="bookmark" text="No tienes plantillas todavía." />
          ) : (
            templates.map((t) => {
              const color = t.categoryColor ?? theme.colors.primary;
              const amountColor = t.type === 'income' ? theme.colors.income : theme.colors.expense;
              return (
                <View key={t.id} style={styles.tplRow}>
                  <View style={[styles.tplIcon, { backgroundColor: `${color}26` }]}>
                    <Icon name={t.categoryIcon ?? 'bookmark'} size={18} color={color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tplName} numberOfLines={1}>{t.name}</Text>
                    <Text style={styles.tplMeta} numberOfLines={1}>
                      {t.categoryName ?? 'Sin categoría'}
                      {t.amount != null ? ` · ${formatCurrency(t.amount)}` : ''}
                    </Text>
                  </View>
                  <Pressable style={styles.tplUse} onPress={() => useTemplate(t)}>
                    <Text style={styles.tplUseText}>Usar</Text>
                  </Pressable>
                  <View style={[styles.tplAccent, { backgroundColor: amountColor }]} />
                </View>
              );
            })
          )}
          <Pressable style={styles.manage} onPress={() => { setSheetOpen(false); navigation.navigate('Templates'); }}>
            <Icon name="settings-2" size={16} color={theme.colors.textSecondary} />
            <Text style={styles.manageText}>Gestionar plantillas</Text>
          </Pressable>
        </ScrollView>
      </BottomSheet>
    </Screen>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomLeftRadius: theme.borderRadius.lg,
    borderBottomRightRadius: theme.borderRadius.lg,
  },
  greeting: { color: '#FFFFFF', fontSize: theme.fontSize.xl, fontWeight: theme.fontWeight.bold },
  date: { color: 'rgba(255,255,255,0.85)', fontSize: theme.fontSize.sm, marginTop: 2 },
  topActions: { flexDirection: 'row', gap: theme.spacing.sm },
  iconBtn: { width: 44, height: 44, borderRadius: theme.borderRadius.full, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  section: { marginTop: theme.spacing.xl },
  insightsSection: { marginTop: theme.spacing.lg },
  budgetAlerts: { marginTop: theme.spacing.lg, gap: theme.spacing.sm },
  budgetAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 2,
  },
  budgetAlertText: { flex: 1, color: theme.colors.text, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium },
  creditAlerts: { marginTop: theme.spacing.sm, gap: 2 },
  creditAlertText: { color: '#F59E0B', fontSize: theme.fontSize.xs, fontWeight: theme.fontWeight.medium },
  carousel: { gap: theme.spacing.sm, paddingRight: theme.spacing.lg, paddingVertical: theme.spacing.xs },
  seeAll: { color: theme.colors.primaryLight, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold },
  // Botón de texto (no elevado), centrado, color primario, padding vertical 12px.
  seeAllBtn: { alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  seeAllBtnText: { color: theme.colors.primary, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold },
  templatesFab: {
    position: 'absolute',
    right: theme.spacing.lg,
    bottom: theme.spacing.lg,
    width: 44,
    height: 44,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.accent,
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  tplRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    overflow: 'hidden',
  },
  tplIcon: { width: 38, height: 38, borderRadius: theme.borderRadius.full, alignItems: 'center', justifyContent: 'center' },
  tplName: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold },
  tplMeta: { color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, marginTop: 2 },
  tplUse: { backgroundColor: theme.colors.primary, borderRadius: theme.borderRadius.full, paddingHorizontal: theme.spacing.md, paddingVertical: 6 },
  tplUseText: { color: '#FFFFFF', fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.bold },
  tplAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  manage: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.md, marginTop: theme.spacing.xs },
  manageText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium },
});
