import React, { useCallback, useState } from 'react';
import { View, Text, SectionList, Pressable, RefreshControl, StyleSheet, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, EmptyState, ErrorState, Loading } from '../components/common';
import { DebtCard } from '../components/DebtCard';
import { Icon } from '../components/Icon';
import { useDebts } from '../hooks/useDebts';
import { useAccounts } from '../hooks/useAccounts';
import { useAppStore } from '../stores/appStore';
import { debtsApi, getErrorMessage } from '../api/client';
import { showError, showSuccess } from '../components/toastConfig';
import { formatCurrency } from '../utils/formatCurrency';
import type { Debt, DebtType } from '../types';

/** Sección de la lista de deudas: un grupo por tarjeta de crédito + "Otras deudas". */
type DebtSection = {
  key: string;
  title: string;
  data: Debt[];
  // Presente solo en grupos de tarjeta: total adeudado del grupo + saldo disponible.
  card?: { total: number; available: number | null };
};

export function DebtsScreen() {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { debts, summary, loading, refreshing, error, refetch } = useDebts();
  const { accounts } = useAccounts();
  const triggerRefresh = useAppStore((s) => s.triggerRefresh);
  const [tab, setTab] = useState<DebtType>('debt');
  const [showHistory, setShowHistory] = useState(false);

  // Activas en la lista principal; saldadas van a la sección "Historial".
  const filtered = debts.filter((d) => d.type === tab && !d.isPaidOff);
  const history = debts.filter((d) => d.type === tab && d.isPaidOff);

  // Agrupa las deudas activas: un grupo por cada tarjeta de crédito con deudas
  // asociadas (deudas automáticas de compras) + un grupo "Otras deudas" para el
  // resto. Las tarjetas sin deudas no aparecen. El orden dentro de cada grupo se
  // conserva (el de `filtered`).
  const sections: DebtSection[] = (() => {
    const cardGroups = new Map<number, Debt[]>();
    const others: Debt[] = [];
    for (const d of filtered) {
      if (d.accountType === 'credit_card' && d.accountId != null) {
        const arr = cardGroups.get(d.accountId);
        if (arr) arr.push(d);
        else cardGroups.set(d.accountId, [d]);
      } else {
        others.push(d);
      }
    }
    const result: DebtSection[] = [];
    for (const [accId, list] of cardGroups) {
      const acc = accounts.find((a) => a.id === accId);
      const total = list.reduce((sum, d) => sum + Number(d.remainingAmount), 0);
      result.push({
        key: `card-${accId}`,
        title: acc?.name ?? list[0].accountName ?? 'Tarjeta',
        data: list,
        card: { total, available: acc?.creditAvailable ?? null },
      });
    }
    if (others.length > 0) {
      result.push({ key: 'others', title: 'Otras deudas', data: others });
    }
    return result;
  })();

  // Header de "Otras deudas" solo si hay además grupos de tarjeta (si no, es redundante).
  const renderSectionHeader = ({ section }: { section: DebtSection }) => {
    if (!section.card) {
      if (sections.length <= 1) return null;
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
        </View>
      );
    }
    return (
      <View style={[styles.sectionHeader, styles.cardHeader]}>
        <View style={styles.cardHeaderTop}>
          <Icon name="credit-card" size={16} color={theme.colors.primary} />
          <Text style={styles.sectionTitle} numberOfLines={1}>
            {section.title}
          </Text>
        </View>
        <View style={styles.cardHeaderMeta}>
          <Text style={styles.cardMetaLabel}>
            Deudas <Text style={styles.cardMetaStrong}>{formatCurrency(section.card.total)}</Text>
          </Text>
          {section.card.available != null && (
            <Text style={styles.cardMetaLabel}>
              Disponible{' '}
              <Text style={[styles.cardMetaStrong, { color: theme.colors.income }]}>
                {formatCurrency(section.card.available)}
              </Text>
            </Text>
          )}
        </View>
      </View>
    );
  };

  const removePaid = (id: number) => {
    Alert.alert(
      'Eliminar deuda',
      'Se eliminará la deuda y se revertirán los movimientos asociados (desembolso y abonos) en sus cuentas. ¿Quieres continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await debtsApi.remove(id);
              showSuccess('Eliminado del historial');
              triggerRefresh();
              refetch(true);
            } catch (err) {
              showError(getErrorMessage(err));
            }
          },
        },
      ],
    );
  };

  // keyExtractor estable y renderItem estable (el onPress por item necesita el
  // closure de `item`, así que se queda inline; ver guía de la tarea).
  const keyExtractor = useCallback((d: Debt) => String(d.id), []);
  const renderItem = useCallback(
    ({ item }: { item: Debt }) => (
      <DebtCard debt={item} onPress={() => navigation.navigate('DebtDetail', { debtId: item.id })} />
    ),
    [navigation],
  );

  return (
    <Screen>
      <ScreenHeader
        title="Deudas y préstamos"
        onBack={() => navigation.goBack()}
        right={
          <Pressable hitSlop={10} onPress={() => navigation.navigate('AddDebt')}>
            <Icon name="plus" size={24} color={theme.colors.onHeader} strokeWidth={2.4} />
          </Pressable>
        }
      />

      {loading && debts.length === 0 ? (
        <Loading />
      ) : error && debts.length === 0 ? (
        <ErrorState message={error} onRetry={() => refetch()} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={keyExtractor}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.list}
          removeClippedSubviews
          maxToRenderPerBatch={15}
          windowSize={10}
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
                      <Icon name="arrow-up-from-line" size={14} color={theme.colors.onHeader} />
                      <Text style={styles.pillText}>Debo {formatCurrency(summary.totalDebt)}</Text>
                    </View>
                    <View style={styles.pill}>
                      <Icon name="arrow-down-to-line" size={14} color={theme.colors.onHeader} />
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
          renderItem={renderItem}
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
    summaryLabel: { color: theme.colors.onHeaderMuted, fontSize: theme.fontSize.sm },
    summaryAmount: { color: theme.colors.onHeader, fontSize: theme.fontSize.xxl, fontWeight: theme.fontWeight.bold },
    summaryPills: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.xs },
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
    sectionHeader: {
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.sm,
      backgroundColor: theme.colors.background,
    },
    sectionTitle: {
      color: theme.colors.text,
      fontSize: theme.fontSize.md,
      fontWeight: theme.fontWeight.bold,
      flex: 1,
    },
    cardHeader: { gap: theme.spacing.xs },
    cardHeaderTop: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
    cardHeaderMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md },
    cardMetaLabel: { color: theme.colors.textSecondary, fontSize: theme.fontSize.xs },
    cardMetaStrong: { color: theme.colors.text, fontWeight: theme.fontWeight.semibold },
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
