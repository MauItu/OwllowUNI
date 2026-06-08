import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { theme } from '../theme';
import { Screen, ScreenHeader, SectionTitle } from '../components/common';
import { DonutChart, BarChart, LineChart } from '../components/StatChart';
import { DateRangePicker } from '../components/DateRangePicker';
import { Icon } from '../components/Icon';
import { useStats } from '../hooks/useStats';
import { periodRange, formatShortDate } from '../utils/formatDate';
import { formatCurrency } from '../utils/formatCurrency';
import type { StatsPeriod } from '../types';

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
  const [period, setPeriod] = useState<StatsPeriod>('month');
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const [showDate, setShowDate] = useState(false);

  const { from, to } = useMemo(() => {
    if (period === 'custom' && custom) return custom;
    return periodRange(period);
  }, [period, custom]);

  const { summary, byCategory, timeline, balanceEvolution, refreshing, refetch } = useStats(from, to, groupFor(period));

  // Donut: top 5 + Otros
  const donutData = useMemo(() => {
    const top = byCategory.slice(0, 5).map((c) => ({ value: c.total, color: c.color, label: c.name }));
    const rest = byCategory.slice(5).reduce((acc, c) => acc + c.total, 0);
    if (rest > 0) top.push({ value: rest, color: theme.colors.textMuted, label: 'Otros' });
    return top;
  }, [byCategory]);

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
    () => balanceEvolution.map((b) => ({ label: b.date, value: b.balance })),
    [balanceEvolution],
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
      <ScreenHeader title="Estadísticas" />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => refetch(true)} tintColor={theme.colors.primary} />}
      >
        {/* Selector de período */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periods}>
          {PERIODS.map((p) => (
            <Pressable
              key={p.key}
              style={[styles.periodChip, period === p.key && styles.periodChipActive]}
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

        {/* Resumen */}
        <View style={styles.summaryRow}>
          <SummaryCard label="Ingresos" value={summary.income} color={theme.colors.success} icon="arrow-down-left" />
          <SummaryCard label="Gastos" value={summary.expense} color={theme.colors.danger} icon="arrow-up-right" />
        </View>
        <View style={[styles.netCard, { borderColor: summary.balance >= 0 ? theme.colors.success : theme.colors.danger }]}>
          <Text style={styles.netLabel}>Balance neto</Text>
          <Text style={[styles.netValue, { color: summary.balance >= 0 ? theme.colors.success : theme.colors.danger }]}>
            {formatCurrency(summary.balance)}
          </Text>
        </View>

        {/* Donut por categoría */}
        <View style={styles.card}>
          <SectionTitle title="Gastos por categoría" />
          <View style={styles.donutWrap}>
            <DonutChart data={donutData} centerLabel={formatCurrency(summary.expense)} />
            <View style={styles.legendList}>
              {donutData.map((d, i) => (
                <View key={i} style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: d.color }]} />
                  <Text style={styles.legendLabel} numberOfLines={1}>
                    {d.label}
                  </Text>
                </View>
              ))}
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
          <LineChart data={lineData} />
        </View>

        {/* Top categorías */}
        <View style={styles.card}>
          <SectionTitle title="Top categorías" />
          {byCategory.length === 0 ? (
            <Text style={styles.emptyText}>Sin gastos en el período</Text>
          ) : (
            byCategory.slice(0, 6).map((c) => (
              <View key={`${c.categoryId}`} style={styles.rankRow}>
                <View style={[styles.rankIcon, { backgroundColor: `${c.color}22` }]}>
                  <Icon name={c.icon} size={16} color={c.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.rankTop}>
                    <Text style={styles.rankName} numberOfLines={1}>
                      {c.name}
                    </Text>
                    <Text style={styles.rankValue}>{formatCurrency(c.total)}</Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${Math.min(100, c.percentage)}%`, backgroundColor: c.color }]} />
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

function SummaryCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: string }) {
  return (
    <View style={styles.summaryCard}>
      <View style={[styles.summaryIcon, { backgroundColor: `${color}22` }]}>
        <Icon name={icon} size={16} color={color} />
      </View>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {formatCurrency(value)}
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

const styles = StyleSheet.create({
  content: { padding: theme.spacing.md, paddingBottom: theme.spacing.xl * 2 },
  periods: { gap: theme.spacing.sm, paddingVertical: theme.spacing.xs },
  periodChip: { paddingHorizontal: theme.spacing.md, paddingVertical: 6, borderRadius: theme.borderRadius.xl, backgroundColor: theme.colors.surface },
  periodChipActive: { backgroundColor: theme.colors.primary },
  periodText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm },
  periodTextActive: { color: '#fff', fontWeight: '700' },
  rangeLabel: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginTop: theme.spacing.xs },
  summaryRow: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.md },
  summaryCard: { flex: 1, backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.md, padding: theme.spacing.md, gap: theme.spacing.xs },
  summaryIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  summaryLabel: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm },
  summaryValue: { fontSize: theme.fontSize.lg, fontWeight: '800' },
  netCard: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.md, padding: theme.spacing.md, marginTop: theme.spacing.sm, borderLeftWidth: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  netLabel: { color: theme.colors.textSecondary, fontSize: theme.fontSize.md },
  netValue: { fontSize: theme.fontSize.lg, fontWeight: '800' },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, padding: theme.spacing.md, marginTop: theme.spacing.md },
  donutWrap: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  legendList: { flex: 1, gap: theme.spacing.xs },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, flexShrink: 1 },
  emptyText: { color: theme.colors.textMuted, fontSize: theme.fontSize.sm, textAlign: 'center', paddingVertical: theme.spacing.md },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  rankIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  rankTop: { flexDirection: 'row', justifyContent: 'space-between' },
  rankName: { color: theme.colors.text, fontSize: theme.fontSize.sm, fontWeight: '600', flex: 1 },
  rankValue: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm },
  progressTrack: { height: 6, backgroundColor: theme.colors.surfaceLight, borderRadius: 3, marginTop: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  rankPct: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, width: 38, textAlign: 'right' },
});
