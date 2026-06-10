import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, EmptyState, ErrorState, Loading, SectionTitle } from '../components/common';
import { SavingsGoalCard } from '../components/SavingsGoalCard';
import { BottomSheet } from '../components/BottomSheet';
import { Calculator } from '../components/Calculator';
import { Icon } from '../components/Icon';
import { useAppStore } from '../stores/appStore';
import { savingsApi, getErrorMessage } from '../api/client';
import { showError, showSuccess } from '../components/toastConfig';
import { formatCurrency } from '../utils/formatCurrency';
import { formatShortDate, todayISO } from '../utils/formatDate';
import type { RootStackParamList } from '../navigation/types';
import type { SavingsGoal, ContributionType } from '../types';

export function SavingsDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, 'SavingsDetail'>>();
  const goalId = route.params.goalId;
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const triggerRefresh = useAppStore((s) => s.triggerRefresh);

  const [goal, setGoal] = useState<SavingsGoal | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [contribType, setContribType] = useState<ContributionType>('deposit');

  const load = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);
        setGoal(await savingsApi.get(goalId));
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [goalId],
  );

  useEffect(() => {
    load();
  }, [load]);

  const contribute = async (amount: number) => {
    if (amount <= 0) {
      showError('El monto debe ser mayor a 0');
      return;
    }
    try {
      const updated = await savingsApi.contribute(goalId, {
        amount,
        type: contribType,
        date: todayISO(),
      });
      setSheetOpen(false);
      if (updated.isCompleted && !goal?.isCompleted) {
        showSuccess('🎉 ¡Felicitaciones! Completaste tu meta');
      } else {
        showSuccess(contribType === 'deposit' ? 'Depósito registrado' : 'Retiro registrado');
      }
      triggerRefresh();
      load(true);
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  const removeGoal = async () => {
    try {
      await savingsApi.remove(goalId);
      showSuccess('Meta eliminada');
      triggerRefresh();
      navigation.goBack();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  const contributions = goal?.contributions ?? [];

  return (
    <Screen>
      <ScreenHeader
        title={goal?.name ?? 'Meta de ahorro'}
        onBack={() => navigation.goBack()}
        right={
          goal ? (
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <Pressable hitSlop={8} onPress={() => navigation.navigate('AddSavingsGoal', { goalId })}>
                <Icon name="pencil" size={20} color="#FFFFFF" />
              </Pressable>
              <Pressable hitSlop={8} onPress={removeGoal}>
                <Icon name="trash-2" size={20} color="#FFFFFF" />
              </Pressable>
            </View>
          ) : null
        }
      />

      {loading && !goal ? (
        <Loading />
      ) : error && !goal ? (
        <ErrorState message={error} onRetry={() => load()} />
      ) : goal ? (
        <>
          <FlatList
            data={contributions}
            keyExtractor={(c) => String(c.id)}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.colors.primary} />
            }
            ListHeaderComponent={
              <View style={{ marginBottom: theme.spacing.md }}>
                <SavingsGoalCard goal={goal} />
                {!!goal.notes && <Text style={styles.notes}>{goal.notes}</Text>}
                <SectionTitle title="Contribuciones" />
              </View>
            }
            ListEmptyComponent={<EmptyState icon="coins" text="Aún no hay contribuciones. ¡Empieza a ahorrar!" />}
            renderItem={({ item }) => {
              const isDeposit = item.type === 'deposit';
              return (
                <View style={styles.contribRow}>
                  <View
                    style={[
                      styles.contribIcon,
                      { backgroundColor: isDeposit ? `${theme.colors.income}26` : `${theme.colors.expense}26` },
                    ]}
                  >
                    <Icon
                      name={isDeposit ? 'arrow-down-to-line' : 'arrow-up-from-line'}
                      size={18}
                      color={isDeposit ? theme.colors.income : theme.colors.expense}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.contribDesc} numberOfLines={1}>
                      {item.description?.trim() || (isDeposit ? 'Depósito' : 'Retiro')}
                    </Text>
                    <Text style={styles.contribDate}>{formatShortDate(item.date)}</Text>
                  </View>
                  <Text style={[styles.contribAmount, { color: isDeposit ? theme.colors.income : theme.colors.expense }]}>
                    {isDeposit ? '+' : '-'}
                    {formatCurrency(item.amount)}
                  </Text>
                </View>
              );
            }}
          />

          {/* FAB Contribuir */}
          <Pressable style={styles.fab} onPress={() => { setContribType('deposit'); setSheetOpen(true); }}>
            <Icon name="plus" size={20} color="#FFFFFF" strokeWidth={2.6} />
            <Text style={styles.fabText}>Contribuir</Text>
          </Pressable>

          <BottomSheet visible={sheetOpen} title="Nueva contribución" onClose={() => setSheetOpen(false)} maxHeight="85%">
            {/* Toggle depósito / retiro */}
            <View style={styles.toggle}>
              {(
                [
                  { key: 'deposit', label: 'Depósito', color: theme.colors.income },
                  { key: 'withdrawal', label: 'Retiro', color: theme.colors.expense },
                ] as const
              ).map((t) => (
                <Pressable
                  key={t.key}
                  style={[styles.toggleBtn, contribType === t.key && { backgroundColor: t.color }]}
                  onPress={() => setContribType(t.key)}
                >
                  <Text style={[styles.toggleText, contribType === t.key && styles.toggleTextActive]}>{t.label}</Text>
                </Pressable>
              ))}
            </View>
            <Calculator
              type={contribType === 'deposit' ? 'income' : 'expense'}
              onConfirm={contribute}
            />
          </BottomSheet>
        </>
      ) : null}
    </Screen>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    list: { padding: theme.spacing.lg, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.xxl + theme.spacing.xl },
    notes: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginBottom: theme.spacing.md },
    contribRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
    },
    contribIcon: { width: 38, height: 38, borderRadius: theme.borderRadius.full, alignItems: 'center', justifyContent: 'center' },
    contribDesc: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.medium },
    contribDate: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginTop: 2 },
    contribAmount: { fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.bold },
    fab: {
      position: 'absolute',
      right: theme.spacing.lg,
      bottom: theme.spacing.lg,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
      backgroundColor: theme.colors.primary,
      borderRadius: theme.borderRadius.full,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
      shadowColor: theme.colors.primary,
      shadowOpacity: 0.5,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 10,
    },
    fabText: { color: '#FFFFFF', fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.bold },
    toggle: { flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.md },
    toggleBtn: {
      flex: 1,
      paddingVertical: theme.spacing.sm + 2,
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.surfaceLight,
      alignItems: 'center',
    },
    toggleText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium },
    toggleTextActive: { color: '#FFFFFF', fontWeight: theme.fontWeight.bold },
  });
