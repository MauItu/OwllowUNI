import React, { useCallback } from 'react';
import { View, Text, FlatList, RefreshControl, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../theme';
import { Screen, ScreenHeader, EmptyState, ErrorState, Loading } from '../components/common';
import { AccountCard } from '../components/AccountCard';
import { Icon } from '../components/Icon';
import { useAccounts } from '../hooks/useAccounts';
import { formatCurrency } from '../utils/formatCurrency';

export function AccountsScreen() {
  const navigation = useNavigation<any>();
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
            <Icon name="plus" size={24} color={theme.colors.primaryLight} />
          </Pressable>
        }
      />

      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total consolidado</Text>
        <Text style={styles.totalValue} numberOfLines={1} adjustsFontSizeToFit>
          {formatCurrency(totalBalance)}
        </Text>
      </View>

      {error && accounts.length === 0 ? (
        <ErrorState message={error} onRetry={() => refetch()} />
      ) : (
        <FlatList
          data={accounts}
          keyExtractor={(a) => String(a.id)}
          contentContainerStyle={styles.list}
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

const styles = StyleSheet.create({
  totalCard: {
    backgroundColor: theme.colors.primary,
    margin: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
  },
  totalLabel: { color: 'rgba(255,255,255,0.8)', fontSize: theme.fontSize.sm },
  totalValue: { color: '#fff', fontSize: theme.fontSize.xxl, fontWeight: '800', marginTop: theme.spacing.xs },
  list: { paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.xl * 2 },
});
