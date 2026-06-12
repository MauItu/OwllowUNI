import React, { useMemo } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, SectionTitle, EmptyState, Loading, ErrorState } from '../components/common';
import { InsightCard } from '../components/InsightCard';
import { useInsights } from '../hooks/useInsights';
import type { Insight, InsightSeverity } from '../types';

const GROUPS: { severity: InsightSeverity; label: string }[] = [
  { severity: 'warning', label: 'Atención' },
  { severity: 'positive', label: 'Vas bien' },
  { severity: 'info', label: 'Para tener en cuenta' },
];

export function InsightsScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { insights, loading, refreshing, error, refetch } = useInsights();

  const bySeverity = useMemo(() => {
    const map: Record<InsightSeverity, Insight[]> = { warning: [], positive: [], info: [] };
    for (const i of insights) map[i.severity].push(i);
    return map;
  }, [insights]);

  return (
    <Screen>
      <ScreenHeader title="Insights" subtitle="Análisis de tu mes" onBack={() => navigation.goBack()} />
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : insights.length === 0 ? (
        <EmptyState
          icon="lightbulb"
          text="Aún no hay suficientes datos para generar insights. Sigue registrando tus movimientos."
        />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + theme.spacing.xl }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => refetch(true)} tintColor={theme.colors.primary} />
          }
        >
          {GROUPS.map(({ severity, label }) =>
            bySeverity[severity].length > 0 ? (
              <View key={severity} style={styles.group}>
                <SectionTitle title={label} />
                {bySeverity[severity].map((insight) => (
                  <View key={insight.id} style={styles.cardWrap}>
                    <InsightCard insight={insight} />
                  </View>
                ))}
              </View>
            ) : null,
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { padding: theme.spacing.lg },
    group: { marginBottom: theme.spacing.lg },
    cardWrap: { marginBottom: theme.spacing.sm },
  });
