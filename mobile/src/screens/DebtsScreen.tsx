import React, { useState } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, EmptyState, ErrorState, Loading } from '../components/common';
import { DebtCard } from '../components/DebtCard';
import { Icon } from '../components/Icon';
import { useDebts } from '../hooks/useDebts';
import { useAppStore } from '../stores/appStore';
import { debtsApi, getErrorMessage } from '../api/client';
import { showError, showSuccess } from '../components/toastConfig';
import { formatCurrency } from '../utils/formatCurrency';
import type { DebtType } from '../types';

export function DebtsScreen() {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { debts, summary, loading, refreshing, error, refetch } = useDebts();
  const triggerRefresh = useAppStore((s) => s.triggerRefresh);
  const [tab, setTab] = useState<DebtType>('debt');
  const [showHistory, setShowHistory] = useState(false);

  // Activas en la lista principal; saldadas van a la sección "Historial".
  const filtered = debts.filter((d) => d.type === tab && !d.isPaidOff);
  const history = debts.filter((d) => d.type === tab && d.isPaidOff);

  const removePaid = async (id: number) => {
    try {
      await debtsApi.remove(id);
      showSuccess('Eliminado del historial');
      triggerRefresh();
      refetch(true);
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  return (
    <Screen>
      <ScreenHeader
        title="Deudas y préstamos"
        onBack={() => navigation.goBack()}
        right={
          <Pressable hitSlop={10} onPress={() => navigation.navigate('AddDebt')}>
            <Icon name="plus" size={24} color="#FFFFFF" strokeWidth={2.4} />
          </Pressable>
        }
      />

      {loading && debts.length === 0 ? (
        <Loading />
      ) : error && debts.length === 0 ? (
        <ErrorState message={error} onRetry={() => refetch()} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(d) => String(d.id)}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => refetch(true)} tintColor={theme.colors.primary} />
          }
          ListHeaderComponent={
            <View>
              {summary && debts.length > 0 && (
                <LinearGradient
                  colors={theme.gradients.balance}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.summaryCard}
                >
                  <Text style={styles.summaryLabel}>Balance neto de deuda</Text>
                  <Text style={styles.summaryAmount}>{formatCurrency(summary.netBalance)}</Text>
                  <View style={styles.summaryPills}>
                    <View style={styles.pill}>
                      <Icon name="arrow-up-from-line" size={14} color="#FFFFFF" />
                      <Text style={styles.pillText}>Debo {formatCurrency(summary.totalDebt)}</Text>
                    </View>
                    <View style={styles.pill}>
                      <Icon name="arrow-down-to-line" size={14} color="#FFFFFF" />
                      <Text style={styles.pillText}>Me deben {formatCurrency(summary.totalLoan)}</Text>
                    </View>
                  </View>
                </LinearGradient>
              )}

              {/* Toggle Mis deudas / Me deben */}
              <View style={styles.toggle}>
                {(
                  [
                    { key: 'debt', label: 'Mis deudas', color: theme.colors.expense },
                    { key: 'loan', label: 'Me deben', color: theme.colors.income },
                  ] as const
                ).map((t) => (
                  <Pressable
                    key={t.key}
                    style={[styles.toggleBtn, tab === t.key && { backgroundColor: t.color }]}
                    onPress={() => setTab(t.key)}
                  >
                    <Text style={[styles.toggleText, tab === t.key && styles.toggleTextActive]}>{t.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              icon="landmark"
              text={
                tab === 'debt'
                  ? 'No tienes deudas activas. Agrega una con el botón +.'
                  : 'Nadie te debe por ahora. Registra un préstamo con el botón +.'
              }
            />
          }
          renderItem={({ item }) => (
            <DebtCard debt={item} onPress={() => navigation.navigate('DebtDetail', { debtId: item.id })} />
          )}
          ListFooterComponent={
            history.length > 0 ? (
              <View style={styles.historySection}>
                <Pressable style={styles.historyHeader} onPress={() => setShowHistory((v) => !v)}>
                  <Icon
                    name={showHistory ? 'chevron-down' : 'chevron-right'}
                    size={18}
                    color={theme.colors.textSecondary}
                  />
                  <Text style={styles.historyTitle}>
                    Historial ({history.length}) · {tab === 'debt' ? 'saldadas' : 'recuperados'}
                  </Text>
                </Pressable>
                {showHistory &&
                  history.map((item) => (
                    <View key={item.id} style={styles.historyRow}>
                      <Pressable
                        style={{ flex: 1 }}
                        onPress={() => navigation.navigate('DebtDetail', { debtId: item.id })}
                      >
                        <Text style={styles.historyName} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text style={styles.historyMeta}>{formatCurrency(item.totalAmount)} · completada</Text>
                      </Pressable>
                      <Pressable hitSlop={8} onPress={() => removePaid(item.id)} style={styles.historyDelete}>
                        <Icon name="trash-2" size={18} color={theme.colors.expense} />
                      </Pressable>
                    </View>
                  ))}
              </View>
            ) : null
          }
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
    historySection: { marginTop: theme.spacing.md },
    historyHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
      paddingVertical: theme.spacing.sm,
    },
    historyTitle: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold },
    historyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.sm,
      opacity: 0.85,
    },
    historyName: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.medium },
    historyMeta: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginTop: 2 },
    historyDelete: { padding: theme.spacing.xs },
  });
