import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, SectionTitle } from '../components/common';
import { DonutChart, BarChart, LineChart } from '../components/StatChart';
import { DateRangePicker } from '../components/DateRangePicker';
import { AccountTypeFilter, type AccountTypeValue } from '../components/AccountTypeFilter';
import { Icon } from '../components/Icon';
import { useStats } from '../hooks/useStats';
import { useAccounts } from '../hooks/useAccounts';
import { useSettingsStore } from '../stores/settingsStore';
import { useAppStore } from '../stores/appStore';
import { transactionsApi } from '../api/client';
import { aggregateStats } from '../utils/statsAggregation';
import { periodRange, formatShortDate } from '../utils/formatDate';
import { formatCurrency } from '../utils/formatCurrency';
import type { StatsPeriod, Transaction } from '../types';

const PERIODS: { key: StatsPeriod; label: string }[] = [
  { key: 'today', label: 'Hoy' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mes' },
  { key: 'year', label: 'Año' },
  { key: 'custom', label: 'Personalizado' },
];

function groupFor(period: StatsPeriod): 'day' | 'week' | 'month' {
  if (period === 'year') return 'month';
  return 'day';
}

export function StatsScreen() {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [period, setPeriod] = useState<StatsPeriod>('month');
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const [showDate, setShowDate] = useState(false);
  const [accountType, setAccountType] = useState<AccountTypeValue>('all');

  const { from, to } = useMemo(() => {
    if (period === 'custom' && custom) return custom;
    return periodRange(period);
  }, [period, custom]);

  const mainCurrency = useSettingsStore((s) => s.mainCurrency);
  const refreshKey = useAppStore((s) => s.refreshKey);
  const { accounts } = useAccounts();
  const {
    summary: srvSummary,
    byCategory: srvByCategory,
    timeline: srvTimeline,
    balanceEvolution: srvBalanceEvolution,
    refreshing,
    refetch,
  } = useStats(from, to, groupFor(period), mainCurrency);

  // Filtro débito/crédito: el endpoint de stats no acepta tipo de cuenta, así que
  // cuando hay filtro activo recalculamos los datasets en cliente a partir de las
  // transacciones del período (ver utils/statsAggregation).
  const creditIds = useMemo(
    () => new Set(accounts.filter((a) => a.type === 'credit_card').map((a) => a.id)),
    [accounts],
  );
  const [periodTxs, setPeriodTxs] = useState<Transaction[]>([]);

  const loadPeriodTxs = useCallback(async () => {
    if (accountType === 'all') return;
    try {
      const res = await transactionsApi.list({ from_date: from, to_date: to, limit: 1000 });
      setPeriodTxs(res.data);
    } catch {
      setPeriodTxs([]);
    }
  }, [accountType, from, to]);

  useEffect(() => {
    loadPeriodTxs();
  }, [loadPeriodTxs, refreshKey]);

  const filtered = useMemo(() => {
    if (accountType === 'all') return null;
    const txs = periodTxs.filter((t) =>
      accountType === 'credit' ? creditIds.has(t.accountId) : !creditIds.has(t.accountId),
    );
    return aggregateStats(txs, groupFor(period));
  }, [accountType, periodTxs, creditIds, period]);

  const summary = filtered ? filtered.summary : srvSummary;
  const byCategory = filtered ? filtered.byCategory : srvByCategory;
  const timeline = filtered ? filtered.timeline : srvTimeline;
  const balanceEvolution = filtered ? filtered.balanceEvolution : srvBalanceEvolution;

  const onRefresh = useCallback(() => {
    refetch(true);
    loadPeriodTxs();
  }, [refetch, loadPeriodTxs]);

  // Donut: top 5 + Otros. Colores de la paleta del tema (rosa/azul/morado primero).
  const donutData = useMemo(() => {
    const top = byCategory
      .slice(0, 5)
      .map((c, i) => ({ value: c.total, color: theme.colors.chart[i % theme.colors.chart.length], label: c.name }));
    const rest = byCategory.slice(5).reduce((acc, c) => acc + c.total, 0);
    if (rest > 0) top.push({ value: rest, color: theme.colors.textMuted, label: 'Otros' });
    return top;
  }, [byCategory, theme]);

  const donutTotal = donutData.reduce((acc, d) => acc + d.value, 0);

  const barData = useMemo(
    () =>
      timeline.map((t) => ({
        label: safeFormat(t.date, period === 'year' ? 'MMM' : 'd/M'),
        income: t.income,
        expense: t.expense,
      })),
    [timeline, period],
  );

  const lineData = useMemo(
    () =>
      balanceEvolution.map((b) => ({
        label: safeFormat(b.date, period === 'year' ? 'MMM' : 'd/M'),
        value: b.balance,
      })),
    [balanceEvolution, period],
  );

  const onSelectPeriod = (p: StatsPeriod) => {
    if (p === 'custom') {
      setShowDate(true);
    } else {
      setPeriod(p);
    }
  };

  return (
    <Screen>
      <ScreenHeader
        title="Estadísticas"
        right={
          <Pressable onPress={() => navigation.navigate('Insights')} hitSlop={12}>
            <Icon name="lightbulb" size={22} color={theme.colors.onHeader} />
          </Pressable>
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      >
        {/* Selector de período */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periods}>
          {PERIODS.map((p, i) => (
            <Pressable
              key={p.key}
              style={[
                styles.periodChip,
                period === p.key && {
                  backgroundColor: [theme.colors.primary, theme.colors.secondary, theme.colors.accent][i % 3],
                },
              ]}
              onPress={() => onSelectPeriod(p.key)}
            >
              <Text style={[styles.periodText, period === p.key && styles.periodTextActive]}>{p.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {period === 'custom' && custom && (
          <Text style={styles.rangeLabel}>
            {formatShortDate(custom.from)} → {formatShortDate(custom.to)}
          </Text>
        )}

        {/* Filtro por tipo de cuenta: Todas | Débito | Crédito */}
        <View style={styles.typeFilterWrap}>
          <AccountTypeFilter value={accountType} onChange={setAccountType} />
        </View>

        {/* Con filtro activo el recálculo es client-side en monto NATIVO (sin
            conversión de tasas): si hay cuentas en más de una moneda, los números
            difieren de la vista "Todas" (que sí convierte en el servidor). */}
        {accountType !== 'all' && new Set(accounts.map((a) => a.currency)).size > 1 && (
          <View style={styles.currencyNote}>
            <Icon name="info" size={14} color={theme.colors.textMuted} />
            <Text style={styles.currencyNoteText}>
              Cálculo local sin conversión de moneda: los montos se suman en la moneda de cada
              cuenta.
            </Text>
          </View>
        )}

        {/* Resumen: Ingresos / Gastos / Balance */}
        <View style={styles.summaryRow}>
          <SummaryCard label="Ingresos" value={summary.income} currency={mainCurrency} color={theme.colors.income} icon="arrow-down-left" />
          <SummaryCard label="Gastos" value={summary.expense} currency={mainCurrency} color={theme.colors.expense} icon="arrow-up-right" />
        </View>
        <View style={[styles.netCard, { borderLeftColor: summary.balance >= 0 ? theme.colors.income : theme.colors.expense }]}>
          <View style={[styles.netIcon, { backgroundColor: `${summary.balance >= 0 ? theme.colors.income : theme.colors.expense}26` }]}>
            <Icon name="wallet" size={18} color={summary.balance >= 0 ? theme.colors.income : theme.colors.expense} />
          </View>
          <Text style={styles.netLabel}>Balance neto</Text>
          <Text style={[styles.netValue, { color: summary.balance >= 0 ? theme.colors.income : theme.colors.expense }]} numberOfLines={1} adjustsFontSizeToFit>
            {formatCurrency(summary.balance, mainCurrency)}
          </Text>
        </View>

        {/* Donut por categoría */}
        <View style={styles.card}>
          <SectionTitle title="Gastos por categoría" />
          <View style={styles.donutWrap}>
            <DonutChart data={donutData} centerLabel={formatCurrency(summary.expense, mainCurrency)} />
            <View style={styles.legendList}>
              {donutData.map((d, i) => {
                const pct = donutTotal > 0 ? Math.round((d.value / donutTotal) * 100) : 0;
                return (
                  <View key={i} style={styles.legendRow}>
                    <View style={[styles.legendDot, { backgroundColor: d.color }]} />
                    <Text style={styles.legendLabel} numberOfLines={1}>{d.label}</Text>
                    <Text style={styles.legendPct}>{pct}%</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        {/* Barras ingresos vs gastos */}
        <View style={styles.card}>
          <SectionTitle title="Ingresos vs Gastos" />
          <BarChart data={barData} />
        </View>

        {/* Evolución del balance */}
        <View style={styles.card}>
          <SectionTitle title="Evolución del balance" />
          <LineChart data={lineData} currency={mainCurrency} />
        </View>

        {/* Top categorías */}
        <View style={styles.card}>
          <SectionTitle title="Top categorías" />
          {byCategory.length === 0 ? (
            <Text style={styles.emptyText}>Sin gastos en el período</Text>
          ) : (
            byCategory.slice(0, 6).map((c) => (
              <View key={`${c.categoryId}`} style={styles.rankRow}>
                <View style={[styles.rankIcon, { backgroundColor: `${c.color}26` }]}>
                  <Icon name={c.icon} size={16} color={c.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.rankTop}>
                    <Text style={styles.rankName} numberOfLines={1}>{c.name}</Text>
                    <Text style={styles.rankValue}>{formatCurrency(c.total, mainCurrency)}</Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <LinearGradient
                      colors={theme.gradients.progress}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[styles.progressFill, { width: `${Math.min(100, c.percentage)}%` }]}
                    />
                  </View>
                </View>
                <Text style={styles.rankPct}>{c.percentage}%</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <DateRangePicker
        visible={showDate}
        onConfirm={(range) => {
          setCustom(range);
          setPeriod('custom');
          setShowDate(false);
        }}
        onClose={() => setShowDate(false)}
      />
    </Screen>
  );
}

function SummaryCard({ label, value, currency, color, icon }: { label: string; value: number; currency: string; color: string; icon: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.summaryCard}>
      <View style={[styles.summaryIcon, { backgroundColor: `${color}26` }]}>
        <Icon name={icon} size={16} color={color} />
      </View>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {formatCurrency(value, currency)}
      </Text>
    </View>
  );
}

function safeFormat(dateStr: string, pattern: string): string {
  try {
    return format(parseISO(dateStr.length <= 10 ? `${dateStr}T00:00:00` : dateStr), pattern, { locale: es });
  } catch {
    return dateStr;
  }
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  periods: { gap: theme.spacing.sm, paddingVertical: theme.spacing.xs },
  periodChip: { paddingHorizontal: theme.spacing.md, paddingVertical: 7, borderRadius: theme.borderRadius.full, backgroundColor: theme.colors.surface },
  periodText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium },
  periodTextActive: { color: '#FFFFFF', fontWeight: theme.fontWeight.bold },
  rangeLabel: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginTop: theme.spacing.xs },
  // El AccountTypeFilter trae su propio padding horizontal (lg); lo cancelamos
  // contra el padding del content para alinear los chips al resto de la pantalla.
  typeFilterWrap: { marginHorizontal: -theme.spacing.lg, marginTop: theme.spacing.xs },
  currencyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.sm,
  },
  currencyNoteText: { flex: 1, color: theme.colors.textMuted, fontSize: theme.fontSize.xs, lineHeight: 16 },
  summaryRow: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.md },
  summaryCard: { flex: 1, backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, padding: theme.spacing.md, gap: theme.spacing.xs, borderWidth: 1, borderColor: theme.colors.cardBorder },
  summaryIcon: { width: 32, height: 32, borderRadius: theme.borderRadius.full, alignItems: 'center', justifyContent: 'center' },
  summaryLabel: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm },
  summaryValue: { fontSize: theme.fontSize.lg, fontWeight: theme.fontWeight.bold },
  netCard: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, padding: theme.spacing.md, marginTop: theme.spacing.sm, borderLeftWidth: 4, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  netIcon: { width: 32, height: 32, borderRadius: theme.borderRadius.full, alignItems: 'center', justifyContent: 'center' },
  netLabel: { flex: 1, color: theme.colors.textSecondary, fontSize: theme.fontSize.md },
  netValue: { fontSize: theme.fontSize.lg, fontWeight: theme.fontWeight.bold, maxWidth: '50%' },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, padding: theme.spacing.md, marginTop: theme.spacing.md, borderWidth: 1, borderColor: theme.colors.cardBorder },
  donutWrap: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  legendList: { flex: 1, gap: theme.spacing.sm },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1, color: theme.colors.textSecondary, fontSize: theme.fontSize.sm },
  legendPct: { color: theme.colors.text, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold },
  emptyText: { color: theme.colors.textMuted, fontSize: theme.fontSize.sm, textAlign: 'center', paddingVertical: theme.spacing.md },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  rankIcon: { width: 32, height: 32, borderRadius: theme.borderRadius.full, alignItems: 'center', justifyContent: 'center' },
  rankTop: { flexDirection: 'row', justifyContent: 'space-between' },
  rankName: { color: theme.colors.text, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold, flex: 1 },
  rankValue: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm },
  progressTrack: { height: 6, backgroundColor: theme.colors.surfaceLight, borderRadius: 3, marginTop: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  rankPct: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, width: 38, textAlign: 'right' },
});
