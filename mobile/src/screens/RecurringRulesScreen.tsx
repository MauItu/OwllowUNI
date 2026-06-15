import React, { useCallback } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl, StyleSheet, Alert, Switch } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, EmptyState, ErrorState, Loading } from '../components/common';
import { Icon } from '../components/Icon';
import { useRecurringRules } from '../hooks/useRecurringRules';
import { useAppStore } from '../stores/appStore';
import { recurringApi, getErrorMessage } from '../api/client';
import { showError, showSuccess } from '../components/toastConfig';
import { formatCurrency } from '../utils/formatCurrency';
import { formatShortDate } from '../utils/formatDate';
import type { RecurringRule } from '../types';

const DOW = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** Frecuencia legible para la lista. */
export function frequencyLabel(r: RecurringRule): string {
  switch (r.frequency) {
    case 'daily':
      return 'Diario';
    case 'weekly':
      return `Semanal · ${DOW[r.dayOfWeek ?? 0]}`;
    case 'biweekly':
      return 'Quincenal';
    case 'monthly':
      return `Mensual · día ${r.dayOfMonth ?? '?'}`;
    case 'yearly':
      return `Anual · día ${r.dayOfMonth ?? '?'}`;
  }
}

export function RecurringRulesScreen() {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { rules, loading, refreshing, error, refetch } = useRecurringRules();
  const triggerRefresh = useAppStore((s) => s.triggerRefresh);

  const onToggle = useCallback(
    async (rule: RecurringRule) => {
      try {
        await recurringApi.toggle(rule.id);
        refetch(true);
      } catch (err) {
        showError(getErrorMessage(err));
      }
    },
    [refetch],
  );

  const onDelete = useCallback((rule: RecurringRule) => {
    Alert.alert(
      'Eliminar regla recurrente',
      `Se eliminará "${rule.description || 'la regla'}". Las transacciones ya generadas NO se borran.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await recurringApi.remove(rule.id);
              showSuccess('Regla eliminada');
              triggerRefresh();
              refetch(true);
            } catch (err) {
              showError(getErrorMessage(err));
            }
          },
        },
      ],
    );
  }, [refetch, triggerRefresh]);

  const keyExtractor = useCallback((r: RecurringRule) => String(r.id), []);

  const renderItem = useCallback(
    ({ item }: { item: RecurringRule }) => {
      const color = item.type === 'expense' ? theme.colors.expense : theme.colors.income;
      const sign = item.type === 'expense' ? '-' : '+';
      const iconColor = item.categoryColor ?? color;
      return (
        <Pressable
          style={[styles.card, !item.isActive && styles.cardPaused]}
          onPress={() => navigation.navigate('AddRecurring', { ruleId: item.id })}
        >
          <View style={[styles.iconWrap, { backgroundColor: `${iconColor}22` }]}>
            <Icon name={item.categoryIcon ?? 'repeat'} size={20} color={iconColor} />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.description || item.categoryName || 'Cargo recurrente'}
            </Text>
            <Text style={styles.cardMeta} numberOfLines={1}>
              {frequencyLabel(item)} · {item.accountName ?? 'Cuenta'}
            </Text>
            {item.isActive && item.nextDate ? (
              <Text style={styles.cardNext}>Próximo: {formatShortDate(item.nextDate)}</Text>
            ) : (
              <Text style={styles.cardPausedLabel}>Pausada</Text>
            )}
          </View>
          <View style={styles.cardRight}>
            <Text style={[styles.cardAmount, { color }]} numberOfLines={1}>
              {sign}
              {formatCurrency(item.amount)}
            </Text>
            <View style={styles.cardActions}>
              <Switch
                value={item.isActive}
                onValueChange={() => onToggle(item)}
                trackColor={{ true: theme.colors.income, false: theme.colors.border }}
                thumbColor="#FFFFFF"
              />
              <Pressable hitSlop={8} onPress={() => onDelete(item)} style={styles.deleteBtn}>
                <Icon name="trash-2" size={18} color={theme.colors.expense} />
              </Pressable>
            </View>
          </View>
        </Pressable>
      );
    },
    [navigation, styles, theme, onToggle, onDelete],
  );

  return (
    <Screen>
      <ScreenHeader
        title="Pagos recurrentes"
        onBack={() => navigation.goBack()}
        right={
          <Pressable hitSlop={10} onPress={() => navigation.navigate('AddRecurring')}>
            <Icon name="plus" size={24} color="#FFFFFF" strokeWidth={2.4} />
          </Pressable>
        }
      />

      {loading && rules.length === 0 ? (
        <Loading />
      ) : error && rules.length === 0 ? (
        <ErrorState message={error} onRetry={() => refetch()} />
      ) : (
        <FlatList
          data={rules}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          removeClippedSubviews
          maxToRenderPerBatch={15}
          windowSize={10}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => refetch(true)} tintColor={theme.colors.primary} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="repeat"
              text="No tienes pagos recurrentes. Crea uno con el botón + (ej: suscripciones, salario, cuota de manejo)."
            />
          }
        />
      )}
    </Screen>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    list: { padding: theme.spacing.lg, paddingTop: theme.spacing.sm },
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
    },
    cardPaused: { opacity: 0.6 },
    iconWrap: {
      width: 42,
      height: 42,
      borderRadius: theme.borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardBody: { flex: 1 },
    cardTitle: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold },
    cardMeta: { color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, marginTop: 2 },
    cardNext: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginTop: 2 },
    cardPausedLabel: { color: theme.colors.expense, fontSize: theme.fontSize.xs, marginTop: 2, fontWeight: theme.fontWeight.medium },
    cardRight: { alignItems: 'flex-end', gap: theme.spacing.xs },
    cardAmount: { fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.bold },
    cardActions: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
    deleteBtn: { padding: theme.spacing.xs },
  });
