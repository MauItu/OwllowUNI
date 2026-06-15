import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useIsFocused, type RouteProp } from '@react-navigation/native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, EmptyState, ErrorState, Loading, SectionTitle, PrimaryButton, SelectRow } from '../components/common';
import { BottomSheet } from '../components/BottomSheet';
import { CalculatorSheet } from '../components/CalculatorSheet';
import { AccountChips } from '../components/AccountChips';
import { Icon } from '../components/Icon';
import { useAccounts } from '../hooks/useAccounts';
import { useAppStore } from '../stores/appStore';
import { useSettingsStore } from '../stores/settingsStore';
import { splitsApi, getErrorMessage } from '../api/client';
import { showError, showSuccess } from '../components/toastConfig';
import { formatCurrency } from '../utils/formatCurrency';
import { formatShortDate } from '../utils/formatDate';
import type { RootStackParamList } from '../navigation/types';
import type { SplitGroup, SplitBalances, SplitExpense, SplitTransfer } from '../types';

export function SplitGroupDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, 'SplitGroupDetail'>>();
  const groupId = route.params.groupId;
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const triggerRefresh = useAppStore((s) => s.triggerRefresh);
  const mainCurrency = useSettingsStore((s) => s.mainCurrency);
  const { accounts } = useAccounts();

  const [group, setGroup] = useState<SplitGroup | null>(null);
  const [balances, setBalances] = useState<SplitBalances | null>(null);
  const [expenses, setExpenses] = useState<SplitExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settling, setSettling] = useState<SplitTransfer | null>(null);
  const [settleAccountId, setSettleAccountId] = useState<number | null>(null);
  const [settleAmount, setSettleAmount] = useState(0);
  const [showSettleCalc, setShowSettleCalc] = useState(false);
  const [settleBusy, setSettleBusy] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);
        const [g, b, e] = await Promise.all([
          splitsApi.get(groupId),
          splitsApi.balances(groupId),
          splitsApi.expenses(groupId),
        ]);
        setGroup(g);
        setBalances(b);
        setExpenses(e);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [groupId],
  );

  // Recarga al volver de AddSplitExpense
  useEffect(() => {
    if (isFocused) load(group != null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, load]);

  const memberName = (id: number) =>
    balances?.members.find((m) => m.id === id)?.name ?? group?.members?.find((m) => m.id === id)?.name ?? '?';

  const me = balances?.members.find((m) => m.isMe);
  const myBalance = me?.balance ?? 0;
  const myBalanceLabel =
    myBalance > 0
      ? { text: `Te deben ${formatCurrency(myBalance)}`, color: theme.colors.income }
      : myBalance < 0
        ? { text: `Debes ${formatCurrency(-myBalance)}`, color: theme.colors.expense }
        : { text: 'Estás a mano', color: theme.colors.textMuted };

  const openSettle = (t: SplitTransfer) => {
    setSettleAccountId(null);
    setSettleAmount(t.amount); // pre-llenado con el total adeudado
    setSettling(t);
  };

  const closeSettle = () => {
    setSettling(null);
    setSettleAccountId(null);
    setSettleAmount(0);
  };

  const settle = async () => {
    if (!settling) return;
    if (settleAmount <= 0) {
      showError('El monto debe ser mayor a 0');
      return;
    }
    if (settleAmount > settling.amount + 0.01) {
      showError(`El monto no puede superar lo adeudado (${formatCurrency(settling.amount, mainCurrency)})`);
      return;
    }
    try {
      setSettleBusy(true);
      const meInvolved = settling.fromMemberId === me?.id || settling.toMemberId === me?.id;
      const res = await splitsApi.settle(groupId, {
        fromMemberId: settling.fromMemberId,
        toMemberId: settling.toMemberId,
        amount: settleAmount,
        accountId: meInvolved ? settleAccountId : null,
      });
      if (res.remaining > 0.009) {
        showSuccess(
          `Liquidado ${formatCurrency(res.settled, mainCurrency)}. Pendiente: ${formatCurrency(res.remaining, mainCurrency)}`,
        );
      } else {
        showSuccess('Deuda liquidada completamente');
      }
      closeSettle();
      triggerRefresh();
      load(true);
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSettleBusy(false);
    }
  };

  const removeGroup = async () => {
    try {
      await splitsApi.remove(groupId);
      showSuccess('Grupo eliminado');
      triggerRefresh();
      navigation.goBack();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  const transfers = balances?.transfers ?? [];

  return (
    <Screen>
      <ScreenHeader
        title={group?.name ?? 'Grupo'}
        subtitle={group ? myBalanceLabel.text : undefined}
        onBack={() => navigation.goBack()}
        right={
          group ? (
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <Pressable hitSlop={8} onPress={() => navigation.navigate('AddSplitGroup', { groupId })}>
                <Icon name="pencil" size={20} color="#FFFFFF" />
              </Pressable>
              <Pressable hitSlop={8} onPress={removeGroup}>
                <Icon name="trash-2" size={20} color="#FFFFFF" />
              </Pressable>
            </View>
          ) : null
        }
      />

      {loading && !group ? (
        <Loading />
      ) : error && !group ? (
        <ErrorState message={error} onRetry={() => load()} />
      ) : group ? (
        <>
          <FlatList
            data={expenses}
            keyExtractor={(e) => String(e.id)}
            removeClippedSubviews
            maxToRenderPerBatch={15}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.colors.primary} />
            }
            ListHeaderComponent={
              <View>
                {/* Miembros */}
                <View style={styles.membersRow}>
                  {(group.members ?? []).map((m) => (
                    <View key={m.id} style={[styles.memberChip, m.isMe && { backgroundColor: `${theme.colors.primary}26`, borderColor: theme.colors.primary }]}>
                      <Icon name={m.isMe ? 'user-check' : 'user'} size={13} color={m.isMe ? theme.colors.primaryLight : theme.colors.textSecondary} />
                      <Text style={[styles.memberChipText, m.isMe && { color: theme.colors.primaryLight }]}>{m.name}</Text>
                    </View>
                  ))}
                </View>

                {/* Balances simplificados */}
                <SectionTitle title="Balances" />
                {transfers.length === 0 ? (
                  <View style={styles.evenCard}>
                    <Icon name="check-circle" size={18} color={theme.colors.income} />
                    <Text style={styles.evenText}>Todos están a mano</Text>
                  </View>
                ) : (
                  transfers.map((t, i) => {
                    const fromIsMe = t.fromMemberId === me?.id;
                    const toIsMe = t.toMemberId === me?.id;
                    return (
                      <View key={`${t.fromMemberId}-${t.toMemberId}-${i}`} style={styles.balanceRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.balanceText} numberOfLines={2}>
                            <Text style={[styles.balanceName, fromIsMe && { color: theme.colors.expense }]}>
                              {fromIsMe ? 'Tú' : memberName(t.fromMemberId)}
                            </Text>
                            {' debe a '}
                            <Text style={[styles.balanceName, toIsMe && { color: theme.colors.income }]}>
                              {toIsMe ? 'ti' : memberName(t.toMemberId)}
                            </Text>
                          </Text>
                          <Text style={[styles.balanceAmount, { color: fromIsMe ? theme.colors.expense : toIsMe ? theme.colors.income : theme.colors.text }]}>
                            {formatCurrency(t.amount)}
                          </Text>
                        </View>
                        <Pressable style={styles.settleBtn} onPress={() => openSettle(t)}>
                          <Icon name="hand-coins" size={15} color="#FFFFFF" />
                          <Text style={styles.settleBtnText}>Liquidar</Text>
                        </Pressable>
                      </View>
                    );
                  })
                )}

                <View style={{ marginTop: theme.spacing.md }}>
                  <SectionTitle title="Gastos" />
                </View>
              </View>
            }
            ListEmptyComponent={
              <EmptyState icon="receipt" text="Aún no hay gastos en este grupo. Agrega el primero con el botón +." />
            }
            renderItem={({ item }) => {
              const color = item.categoryColor ?? group.color;
              return (
                <View style={styles.expenseRow}>
                  <View style={[styles.expenseIcon, { backgroundColor: `${color}26` }]}>
                    <Icon name={item.categoryIcon ?? 'receipt'} size={18} color={color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.expenseDesc} numberOfLines={1}>{item.description}</Text>
                    <Text style={styles.expenseMeta} numberOfLines={1}>
                      Pagó {item.paidByName ?? memberName(item.paidByMemberId)} · {formatShortDate(item.date)}
                      {item.accountName ? ` · ${item.accountName}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.expenseAmount}>{formatCurrency(item.totalAmount)}</Text>
                </View>
              );
            }}
          />

          {/* FAB nuevo gasto */}
          <Pressable style={[styles.fab, { bottom: insets.bottom + theme.spacing.lg }]} onPress={() => navigation.navigate('AddSplitExpense', { groupId })}>
            <Icon name="plus" size={26} color="#FFFFFF" strokeWidth={2.6} />
          </Pressable>

          {/* Liquidación (total o parcial) */}
          <BottomSheet visible={settling != null} title="Liquidar deuda" onClose={closeSettle}>
            {settling && (
              <View style={{ gap: theme.spacing.md }}>
                <Text style={styles.settleConfirmText}>
                  {settling.fromMemberId === me?.id ? 'Tú' : memberName(settling.fromMemberId)} le paga a{' '}
                  {settling.toMemberId === me?.id ? 'ti' : memberName(settling.toMemberId)}.
                </Text>

                <SelectRow
                  label="Monto a liquidar"
                  value={settleAmount > 0 ? formatCurrency(settleAmount, mainCurrency) : undefined}
                  placeholder="Toca para ingresar"
                  icon="calculator"
                  onPress={() => setShowSettleCalc(true)}
                />
                <Text style={styles.settleHint}>Total adeudado: {formatCurrency(settling.amount, mainCurrency)}</Text>

                {settleAmount > 0 && settleAmount < settling.amount - 0.01 && (
                  <View style={styles.partialNote}>
                    <Icon name="info" size={15} color={theme.colors.secondary} />
                    <Text style={styles.partialNoteText}>
                      Liquidación parcial: quedarán {formatCurrency(settling.amount - settleAmount, mainCurrency)}{' '}
                      pendientes.
                    </Text>
                  </View>
                )}

                {(settling.fromMemberId === me?.id || settling.toMemberId === me?.id) && (
                  <View style={{ gap: theme.spacing.xs }}>
                    <Text style={styles.settleAccountLabel}>
                      {settling.toMemberId === me?.id
                        ? '¿A qué cuenta te depositaron?'
                        : '¿De qué cuenta pagaste?'}
                    </Text>
                    <AccountChips
                      accounts={accounts}
                      selectedId={settleAccountId}
                      onSelect={setSettleAccountId}
                      allowNone
                      noneLabel="No registrar"
                    />
                  </View>
                )}
                <PrimaryButton label="Confirmar liquidación" onPress={settle} loading={settleBusy} icon="hand-coins" />
              </View>
            )}
          </BottomSheet>

          <CalculatorSheet
            visible={showSettleCalc}
            title="Monto a liquidar"
            type="expense"
            initialValue={settleAmount}
            currency={mainCurrency}
            onConfirm={(v) => {
              setSettleAmount(v);
              setShowSettleCalc(false);
            }}
            onClose={() => setShowSettleCalc(false)}
          />
        </>
      ) : null}
    </Screen>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    list: { padding: theme.spacing.lg, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.xxl + theme.spacing.xl },
    membersRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs, marginBottom: theme.spacing.md },
    memberChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: theme.colors.surfaceLight,
      borderRadius: theme.borderRadius.full,
      paddingHorizontal: theme.spacing.sm + 2,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    memberChipText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, fontWeight: theme.fontWeight.medium },
    evenCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.md,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
    },
    evenText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm },
    balanceRow: {
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
    balanceText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm },
    balanceName: { color: theme.colors.text, fontWeight: theme.fontWeight.semibold },
    balanceAmount: { fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.bold, marginTop: 2 },
    settleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: theme.colors.secondary,
      borderRadius: theme.borderRadius.full,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 7,
    },
    settleBtnText: { color: '#FFFFFF', fontSize: theme.fontSize.xs, fontWeight: theme.fontWeight.bold },
    settleConfirmText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.md, lineHeight: 22 },
    settleHint: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginTop: -theme.spacing.sm },
    partialNote: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      backgroundColor: `${theme.colors.secondary}1A`,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.sm + 2,
    },
    partialNoteText: { flex: 1, color: theme.colors.text, fontSize: theme.fontSize.sm },
    settleAccountLabel: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium },
    expenseRow: {
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
    expenseIcon: { width: 38, height: 38, borderRadius: theme.borderRadius.full, alignItems: 'center', justifyContent: 'center' },
    expenseDesc: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.medium },
    expenseMeta: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginTop: 2 },
    expenseAmount: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.bold },
    fab: {
      position: 'absolute',
      right: theme.spacing.lg,
      bottom: theme.spacing.lg,
      width: 56,
      height: 56,
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: theme.colors.primary,
      shadowOpacity: 0.5,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 10,
    },
  });
