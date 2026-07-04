import React, { useCallback } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, EmptyState, ErrorState, Loading } from '../components/common';
import { SavingsGoalCard } from '../components/SavingsGoalCard';
import { Icon } from '../components/Icon';
import { useSavings } from '../hooks/useSavings';
import { formatCurrency } from '../utils/formatCurrency';
import type { SavingsGoal } from '../types';

export function SavingsScreen() {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { goals, summary, loading, refreshing, error, refetch } = useSavings();

  const keyExtractor = useCallback((g: SavingsGoal) => String(g.id), []);
  const renderItem = useCallback(
    ({ item }: { item: SavingsGoal }) => (
      <SavingsGoalCard goal={item} onPress={() => navigation.navigate('SavingsDetail', { goalId: item.id })} />
    ),
    [navigation],
  );

  return (
    <Screen>
      <ScreenHeader
        title="Metas de ahorro"
        onBack={() => navigation.goBack()}
        right={
          <Pressable hitSlop={10} onPress={() => navigation.navigate('AddSavingsGoal')}>
            <Icon name="plus" size={24} color={theme.colors.onHeader} strokeWidth={2.4} />
          </Pressable>
        }
      />

      {loading && goals.length === 0 ? (
        <Loading />
      ) : error && goals.length === 0 ? (
        <ErrorState message={error} onRetry={() => refetch()} />
      ) : (
        <FlatList
          data={goals}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.list}
          removeClippedSubviews
          maxToRenderPerBatch={15}
          windowSize={10}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => refetch(true)} tintColor={theme.colors.primary} />
          }
          ListHeaderComponent={
            summary && goals.length > 0 ? (
              <LinearGradient
                colors={theme.gradients.balance}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.summaryCard}
              >
                <Text style={styles.summaryLabel}>Total ahorrado</Text>
                <Text style={styles.summaryAmount}>{formatCurrency(summary.totalSaved)}</Text>
                <View style={styles.summaryPills}>
                  <View style={styles.pill}>
                    <Icon name="target" size={14} color={theme.colors.onHeader} />
                    <Text style={styles.pillText}>
                      {summary.activeGoals} {summary.activeGoals === 1 ? 'meta activa' : 'metas activas'}
                    </Text>
                  </View>
                  <View style={styles.pill}>
                    <Icon name="check-circle" size={14} color={theme.colors.onHeader} />
                    <Text style={styles.pillText}>{summary.completedGoals} completadas</Text>
                  </View>
                </View>
              </LinearGradient>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState icon="piggy-bank" text="Aún no tienes metas de ahorro. Crea la primera con el botón +." />
          }
          renderItem={renderItem}
        />
      )}
    </Screen>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    list: { padding: theme.spacing.lg, paddingTop: theme.spacing.sm },
    summaryCard: {
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.lg,
      marginBottom: theme.spacing.md,
      gap: theme.spacing.xs,
    },
    summaryLabel: { color: theme.colors.onHeaderMuted, fontSize: theme.fontSize.sm },
    summaryAmount: { color: theme.colors.onHeader, fontSize: theme.fontSize.xxl, fontWeight: theme.fontWeight.bold },
    summaryPills: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.xs },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
      backgroundColor: `${theme.colors.onHeader}33`,
      borderRadius: theme.borderRadius.full,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 5,
    },
    pillText: { color: theme.colors.onHeader, fontSize: theme.fontSize.xs, fontWeight: theme.fontWeight.semibold },
  });
