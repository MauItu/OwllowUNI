import React, { useCallback } from 'react';
import { View, Text, FlatList, RefreshControl, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, EmptyState, ErrorState, Loading } from '../components/common';
import { AccountCard } from '../components/AccountCard';
import { Icon } from '../components/Icon';
import { useAccounts } from '../hooks/useAccounts';
import { formatCurrency } from '../utils/formatCurrency';

export function AccountsScreen() {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { accounts, totalBalance, loading, refreshing, error, refetch } = useAccounts();

  const onRefresh = useCallback(() => refetch(true), [refetch]);

  if (loading && accounts.length === 0) {
    return (
      <Screen>
        <ScreenHeader title="Cuentas" onBack={() => navigation.goBack()} />
        <Loading />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title="Cuentas"
        onBack={() => navigation.goBack()}
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
        <View style={styles.totalIcon}>
          <Icon name="layers" size={20} color="#FFFFFF" />
        </View>
        <Text style={styles.totalLabel}>Total consolidado</Text>
        <Text style={styles.totalValue} numberOfLines={1} adjustsFontSizeToFit>
          {formatCurrency(totalBalance)}
        </Text>
      </LinearGradient>

      {error && accounts.length === 0 ? (
        <ErrorState message={error} onRetry={() => refetch()} />
      ) : (
        <FlatList
          data={accounts}
          keyExtractor={(a) => String(a.id)}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
          renderItem={({ item }) => (
            <AccountCard account={item} onPress={(a) => navigation.navigate('AddAccount', { accountId: a.id })} />
          )}
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
  totalIcon: { width: 40, height: 40, borderRadius: theme.borderRadius.full, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center', marginBottom: theme.spacing.sm },
  totalLabel: { color: 'rgba(255,255,255,0.85)', fontSize: theme.fontSize.sm },
  totalValue: { color: '#FFFFFF', fontSize: theme.fontSize.xxl, fontWeight: theme.fontWeight.bold, marginTop: theme.spacing.xs, letterSpacing: -0.5 },
  list: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
});
