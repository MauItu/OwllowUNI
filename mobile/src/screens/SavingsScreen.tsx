import React from 'react';
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

export function SavingsScreen() {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { goals, summary, loading, refreshing, error, refetch } = useSavings();

  return (
    <Screen>
      <ScreenHeader
        title="Metas de ahorro"
        onBack={() => navigation.goBack()}
        right={
          <Pressable hitSlop={10} onPress={() => navigation.navigate('AddSavingsGoal')}>
            <Icon name="plus" size={24} color="#FFFFFF" strokeWidth={2.4} />
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
          keyExtractor={(g) => String(g.id)}
          contentContainerStyle={styles.list}
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
                    <Icon name="target" size={14} color="#FFFFFF" />
                    <Text style={styles.pillText}>
                      {summary.activeGoals} {summary.activeGoals === 1 ? 'meta activa' : 'metas activas'}
                    </Text>
                  </View>
                  <View style={styles.pill}>
                    <Icon name="check-circle" size={14} color="#FFFFFF" />
                    <Text style={styles.pillText}>{summary.completedGoals} completadas</Text>
                  </View>
                </View>
              </LinearGradient>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState icon="piggy-bank" text="Aún no tienes metas de ahorro. Crea la primera con el botón +." />
          }
          renderItem={({ item }) => (
            <SavingsGoalCard goal={item} onPress={() => navigation.navigate('SavingsDetail', { goalId: item.id })} />
          )}
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
    summaryLabel: { color: 'rgba(255,255,255,0.85)', fontSize: theme.fontSize.sm },
    summaryAmount: { color: '#FFFFFF', fontSize: theme.fontSize.xxl, fontWeight: theme.fontWeight.bold },
    summaryPills: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.xs },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
      backgroundColor: 'rgba(255,255,255,0.2)',
      borderRadius: theme.borderRadius.full,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 5,
    },
    pillText: { color: '#FFFFFF', fontSize: theme.fontSize.xs, fontWeight: theme.fontWeight.semibold },
  });
