import React, { useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../theme';
import { Screen, SectionTitle, EmptyState } from '../components/common';
import { BalanceSummary } from '../components/BalanceSummary';
import { TransactionCard } from '../components/TransactionCard';
import { TemplateCard } from '../components/TemplateCard';
import { Icon } from '../components/Icon';
import { useAccounts } from '../hooks/useAccounts';
import { useStats } from '../hooks/useStats';
import { useTransactions } from '../hooks/useTransactions';
import { useTemplates } from '../hooks/useTemplates';
import { useAppStore } from '../stores/appStore';
import { currentMonthRange } from '../utils/formatDate';
import { templatesApi } from '../api/client';
import { showError } from '../components/toastConfig';

export function HomeScreen() {
  const navigation = useNavigation<any>();
  const { totalBalance, loading: loadingAccounts, refetch: refetchAccounts } = useAccounts();
  const { from, to } = currentMonthRange();
  const { summary, refetch: refetchStats } = useStats(from, to);
  const { transactions, refresh: refreshTx } = useTransactions({}, 5);
  const { templates, refetch: refetchTemplates } = useTemplates();
  const triggerRefresh = useAppStore((s) => s.triggerRefresh);
  const setPendingTemplate = useAppStore((s) => s.setPendingTemplate);

  const [refreshing, setRefreshing] = React.useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchAccounts(true), refetchStats(true), refreshTx(), refetchTemplates(true)]);
    setRefreshing(false);
  }, [refetchAccounts, refetchStats, refreshTx, refetchTemplates]);

  const useTemplate = async (template: (typeof templates)[number]) => {
    try {
      await templatesApi.use(template.id);
    } catch (err) {
      showError('No se pudo registrar el uso de la plantilla');
    }
    setPendingTemplate(template);
    triggerRefresh();
    navigation.navigate('AddTransaction', { template });
  };

  const topTemplates = templates.slice(0, 3);
  const latest = transactions.slice(0, 5);

  return (
    <Screen>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.greeting}>Hola 👋</Text>
          <Text style={styles.subtitle}>Tu resumen financiero</Text>
        </View>
        <Pressable style={styles.iconBtn} onPress={() => navigation.navigate('Accounts')}>
          <Icon name="wallet" size={22} color={theme.colors.text} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      >
        <BalanceSummary
          totalBalance={totalBalance}
          income={summary.income}
          expense={summary.expense}
        />

        {topTemplates.length > 0 && (
          <View style={styles.section}>
            <SectionTitle title="Plantillas frecuentes" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {topTemplates.map((t) => (
                <TemplateCard key={t.id} template={t} compact onPress={useTemplate} />
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.section}>
          <SectionTitle
            title="Últimos movimientos"
            action={
              <Pressable onPress={() => navigation.navigate('Transactions')}>
                <Text style={styles.seeAll}>Ver todo</Text>
              </Pressable>
            }
          />
          {latest.length === 0 ? (
            <EmptyState icon="receipt" text={loadingAccounts ? 'Cargando…' : 'Aún no hay movimientos. ¡Agrega el primero!'} />
          ) : (
            latest.map((t) => (
              <TransactionCard key={t.id} transaction={t} onPress={() => navigation.navigate('Transactions')} />
            ))
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  greeting: { color: theme.colors.text, fontSize: theme.fontSize.xl, fontWeight: '800' },
  subtitle: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' },
  content: { padding: theme.spacing.md, paddingBottom: theme.spacing.xl * 2 },
  section: { marginTop: theme.spacing.lg },
  seeAll: { color: theme.colors.primaryLight, fontSize: theme.fontSize.sm, fontWeight: '600' },
});
