import React from 'react';
import { View, Text, FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, EmptyState, ErrorState, Loading } from '../components/common';
import { Icon } from '../components/Icon';
import { useSplits } from '../hooks/useSplits';
import { formatCurrency } from '../utils/formatCurrency';

export function SplitsScreen() {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { groups, summary, loading, refreshing, error, refetch } = useSplits();

  const balanceLabel = (balance: number) => {
    if (balance > 0) return { text: `Te deben ${formatCurrency(balance)}`, color: theme.colors.income };
    if (balance < 0) return { text: `Debes ${formatCurrency(-balance)}`, color: theme.colors.expense };
    return { text: 'Estás a mano', color: theme.colors.textMuted };
  };

  return (
    <Screen>
      <ScreenHeader
        title="Gastos compartidos"
        onBack={() => navigation.goBack()}
        right={
          <Pressable hitSlop={10} onPress={() => navigation.navigate('AddSplitGroup')}>
            <Icon name="plus" size={24} color="#FFFFFF" strokeWidth={2.4} />
          </Pressable>
        }
      />

      {loading && groups.length === 0 ? (
        <Loading />
      ) : error && groups.length === 0 ? (
        <ErrorState message={error} onRetry={() => refetch()} />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => String(g.id)}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => refetch(true)} tintColor={theme.colors.primary} />
          }
          ListHeaderComponent={
            summary && groups.length > 0 ? (
              <LinearGradient
                colors={theme.gradients.balance}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.summaryCard}
              >
                <Text style={styles.summaryLabel}>Balance en todos los grupos</Text>
                <Text style={styles.summaryAmount}>{formatCurrency(summary.netBalance)}</Text>
                <View style={styles.summaryPills}>
                  <View style={styles.pill}>
                    <Icon name="arrow-down-to-line" size={14} color="#FFFFFF" />
                    <Text style={styles.pillText}>Me deben {formatCurrency(summary.totalOwedToMe)}</Text>
                  </View>
                  <View style={styles.pill}>
                    <Icon name="arrow-up-from-line" size={14} color="#FFFFFF" />
                    <Text style={styles.pillText}>Debo {formatCurrency(summary.totalIOwe)}</Text>
                  </View>
                </View>
              </LinearGradient>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState icon="users" text="Aún no tienes grupos de gastos compartidos. Crea el primero con el botón +." />
          }
          renderItem={({ item }) => {
            const balance = balanceLabel(item.myBalance ?? 0);
            const memberCount = item.members?.length ?? 0;
            return (
              <Pressable
                style={({ pressed }) => [styles.card, { borderLeftColor: item.color }, pressed && { opacity: 0.8 }]}
                onPress={() => navigation.navigate('SplitGroupDetail', { groupId: item.id })}
              >
                <View style={[styles.iconWrap, { backgroundColor: `${item.color}26` }]}>
                  <Icon name={item.icon} size={20} color={item.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.meta}>
                    {memberCount} {memberCount === 1 ? 'miembro' : 'miembros'}
                  </Text>
                </View>
                <Text style={[styles.balance, { color: balance.color }]} numberOfLines={1}>
                  {balance.text}
                </Text>
              </Pressable>
            );
          }}
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
    summaryPills: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.xs },
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
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
      borderLeftWidth: 4,
    },
    iconWrap: { width: 42, height: 42, borderRadius: theme.borderRadius.full, alignItems: 'center', justifyContent: 'center' },
    name: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold },
    meta: { color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, marginTop: 2 },
    balance: { fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.bold, maxWidth: 140, textAlign: 'right' },
  });
