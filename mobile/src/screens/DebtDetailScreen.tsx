import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl, StyleSheet, TextInput, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, EmptyState, ErrorState, Loading, SectionTitle } from '../components/common';
import { DebtCard } from '../components/DebtCard';
import { BottomSheet } from '../components/BottomSheet';
import { Calculator } from '../components/Calculator';
import { AccountChips } from '../components/AccountChips';
import { DateRangePicker } from '../components/DateRangePicker';
import { Icon } from '../components/Icon';
import { useAccounts } from '../hooks/useAccounts';
import { useAppStore } from '../stores/appStore';
import { debtsApi, getErrorMessage } from '../api/client';
import { rescheduleDebtNotifications, cancelDebtNotifications } from '../services/notifications';
import { showError, showSuccess } from '../components/toastConfig';
import { formatCurrency } from '../utils/formatCurrency';
import { formatShortDate, todayISO, parseISOSafe } from '../utils/formatDate';
import type { RootStackParamList } from '../navigation/types';
import type { Debt, DebtPayment } from '../types';

export function DebtDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, 'DebtDetail'>>();
  const debtId = route.params.debtId;
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const triggerRefresh = useAppStore((s) => s.triggerRefresh);
  const { accounts } = useAccounts();

  const [debt, setDebt] = useState<Debt | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [payAccountId, setPayAccountId] = useState<number | null>(null);
  const [payDate, setPayDate] = useState<string>(todayISO());
  const [payDescription, setPayDescription] = useState<string>('');
  const [showDate, setShowDate] = useState(false);
  // Pago en edición; null = registrar uno nuevo.
  const [editingPayment, setEditingPayment] = useState<DebtPayment | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);
        setDebt(await debtsApi.get(debtId));
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [debtId],
  );

  useEffect(() => {
    load();
  }, [load]);

  const isDebt = debt?.type === 'debt';
  const semanticColor = isDebt ? theme.colors.expense : theme.colors.income;

  // Abre la hoja para registrar un pago nuevo (prellenada con la cuota sugerida).
  const openNewPayment = () => {
    setEditingPayment(null);
    setPayAccountId(accounts.find((a) => a.id === debt?.accountId && a.type !== 'credit_card')?.id ?? null);
    setPayDate(todayISO());
    setPayDescription('');
    setSheetOpen(true);
  };

  // Abre la hoja para editar un pago existente (prellenada con sus datos).
  const openEditPayment = (p: DebtPayment) => {
    setEditingPayment(p);
    setPayAccountId(p.accountId);
    setPayDate(p.date);
    setPayDescription(p.description ?? '');
    setSheetOpen(true);
  };

  const submitPayment = async (amount: number) => {
    if (amount <= 0) {
      showError('El monto debe ser mayor a 0');
      return;
    }
    try {
      const payload = {
        amount,
        date: payDate,
        accountId: payAccountId,
        description: payDescription.trim() || null,
      };
      const updated = editingPayment
        ? await debtsApi.updatePayment(debtId, editingPayment.id, payload)
        : await debtsApi.pay(debtId, payload);
      setSheetOpen(false);
      // Si quedó saldada, las alertas se cancelan; si no, se mantienen.
      rescheduleDebtNotifications(updated).catch(() => {});
      if (editingPayment) {
        showSuccess('Pago actualizado');
      } else if (updated.isPaidOff) {
        showSuccess(isDebt ? '🎉 ¡Deuda saldada por completo!' : '🎉 ¡Préstamo recuperado por completo!');
      } else {
        showSuccess('Pago registrado');
      }
      triggerRefresh();
      load(true);
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  const removeDebt = () => {
    Alert.alert(
      isDebt ? 'Eliminar deuda' : 'Eliminar préstamo',
      'Se revertirán en sus cuentas los movimientos asociados (desembolso y abonos). ¿Quieres continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await debtsApi.remove(debtId);
              cancelDebtNotifications(debtId).catch(() => {});
              showSuccess(isDebt ? 'Deuda eliminada' : 'Préstamo eliminado');
              triggerRefresh();
              navigation.goBack();
            } catch (err) {
              showError(getErrorMessage(err));
            }
          },
        },
      ],
    );
  };

  const payments = debt?.payments ?? [];
  const paid = debt ? Number(debt.totalAmount) - Number(debt.remainingAmount) : 0;

  return (
    <Screen>
      <ScreenHeader
        title={debt?.name ?? 'Deuda'}
        onBack={() => navigation.goBack()}
        right={
          debt ? (
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <Pressable hitSlop={8} onPress={() => navigation.navigate('AddDebt', { debtId })}>
                <Icon name="pencil" size={20} color={theme.colors.onHeader} />
              </Pressable>
              <Pressable hitSlop={8} onPress={removeDebt}>
                <Icon name="trash-2" size={20} color={theme.colors.onHeader} />
              </Pressable>
            </View>
          ) : null
        }
      />

      {loading && !debt ? (
        <Loading />
      ) : error && !debt ? (
        <ErrorState message={error} onRetry={() => load()} />
      ) : debt ? (
        <>
          <FlatList
            data={payments}
            keyExtractor={(p) => String(p.id)}
            removeClippedSubviews
            maxToRenderPerBatch={15}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.colors.primary} />
            }
            ListHeaderComponent={
              <View style={{ marginBottom: theme.spacing.md }}>
                <DebtCard debt={debt} />
                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>Pagado</Text>
                    <Text style={[styles.metaValue, { color: theme.colors.income }]}>{formatCurrency(paid)}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>Inicio</Text>
                    <Text style={styles.metaValue}>{formatShortDate(debt.startDate)}</Text>
                  </View>
                  {debt.cutoffDate && (
                    <View style={styles.metaItem}>
                      <Text style={styles.metaLabel}>Corte</Text>
                      <Text style={styles.metaValue}>{formatShortDate(debt.cutoffDate)}</Text>
                    </View>
                  )}
                  {debt.dueDate && (
                    <View style={styles.metaItem}>
                      <Text style={styles.metaLabel}>Límite de pago</Text>
                      <Text style={styles.metaValue}>{formatShortDate(debt.dueDate)}</Text>
                    </View>
                  )}
                </View>
                {!!debt.notes && <Text style={styles.notes}>{debt.notes}</Text>}
                <SectionTitle title="Historial de pagos" />
              </View>
            }
            ListEmptyComponent={
              <EmptyState
                icon="hand-coins"
                text={isDebt ? 'Aún no has registrado pagos.' : 'Aún no te han abonado a este préstamo.'}
              />
            }
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [styles.payRow, pressed && { opacity: 0.6 }]}
                onPress={() => openEditPayment(item)}
              >
                <View style={[styles.payIcon, { backgroundColor: `${theme.colors.income}26` }]}>
                  <Icon name="hand-coins" size={18} color={theme.colors.income} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.payDesc} numberOfLines={1}>
                    {item.description?.trim() || (isDebt ? 'Pago' : 'Abono')}
                  </Text>
                  <Text style={styles.payDate}>
                    {formatShortDate(item.date)}
                    {item.accountName ? ` · ${item.accountName}` : ''}
                  </Text>
                </View>
                <Text style={[styles.payAmount, { color: theme.colors.income }]}>
                  -{formatCurrency(item.amount)}
                </Text>
                <Icon name="pencil" size={15} color={theme.colors.textMuted} />
              </Pressable>
            )}
          />

          {/* FAB Registrar pago */}
          {!debt.isPaidOff && (
            <Pressable style={[styles.fab, { backgroundColor: semanticColor, shadowColor: semanticColor, bottom: insets.bottom + theme.spacing.lg }]} onPress={openNewPayment}>
              <Icon name="hand-coins" size={20} color="#FFFFFF" strokeWidth={2.4} />
              <Text style={styles.fabText}>{isDebt ? 'Registrar pago' : 'Registrar abono'}</Text>
            </Pressable>
          )}

          <BottomSheet
            visible={sheetOpen}
            title={
              editingPayment
                ? isDebt
                  ? 'Editar pago'
                  : 'Editar abono'
                : isDebt
                  ? 'Registrar pago'
                  : 'Registrar abono'
            }
            onClose={() => setSheetOpen(false)}
            maxHeight="90%"
          >
            <Text style={styles.sheetHint}>
              Restante: <Text style={{ color: semanticColor, fontWeight: theme.fontWeight.bold }}>{formatCurrency(debt.remainingAmount)}</Text>
            </Text>
            {!editingPayment && debt.installmentAmount != null && (
              <Text style={styles.sheetHint}>
                Cuota: <Text style={{ color: theme.colors.text, fontWeight: theme.fontWeight.bold }}>{formatCurrency(debt.installmentAmount)}</Text>
                {debt.isOverdue && debt.lateFee ? (
                  <Text style={{ color: theme.colors.expense }}>{`  + mora ${formatCurrency(debt.lateFee)}`}</Text>
                ) : null}
              </Text>
            )}
            <Text style={styles.accountLabel}>
              {isDebt ? '¿De qué cuenta pagaste?' : '¿En qué cuenta te depositaron?'}
            </Text>
            <AccountChips accounts={accounts.filter((a) => a.type !== 'credit_card')} selectedId={payAccountId} onSelect={setPayAccountId} allowNone noneLabel="No registrar" />
            <Text style={styles.accountLabel}>Fecha</Text>
            <Pressable style={styles.dateChip} onPress={() => setShowDate(true)}>
              <Icon name="calendar" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.dateChipText}>{formatShortDate(payDate)}</Text>
            </Pressable>
            <Text style={styles.accountLabel}>Nota (opcional)</Text>
            <TextInput
              style={styles.noteInput}
              value={payDescription}
              onChangeText={setPayDescription}
              placeholder={isDebt ? 'Ej: pago de cuota' : 'Ej: abono recibido'}
              placeholderTextColor={theme.colors.textMuted}
            />
            <Calculator
              key={editingPayment ? `edit-${editingPayment.id}` : sheetOpen ? 'new' : 'closed'}
              initialValue={editingPayment ? Number(editingPayment.amount) : Number(debt.nextPaymentAmount ?? 0)}
              type={isDebt ? 'expense' : 'income'}
              onConfirm={submitPayment}
            />
          </BottomSheet>

          <DateRangePicker
            visible={showDate}
            initialFrom={parseISOSafe(payDate)}
            onConfirm={({ from }) => {
              setPayDate(from);
              setShowDate(false);
            }}
            onClose={() => setShowDate(false)}
          />
        </>
      ) : null}
    </Screen>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    list: { padding: theme.spacing.lg, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.xxl + theme.spacing.xl },
    metaRow: {
      flexDirection: 'row',
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.md,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
    },
    metaItem: { flex: 1, alignItems: 'center', gap: 2 },
    metaLabel: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs },
    metaValue: { color: theme.colors.text, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold },
    notes: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginBottom: theme.spacing.md },
    payRow: {
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
    payIcon: { width: 38, height: 38, borderRadius: theme.borderRadius.full, alignItems: 'center', justifyContent: 'center' },
    payDesc: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.medium },
    payDate: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginTop: 2 },
    payAmount: { fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.bold },
    fab: {
      position: 'absolute',
      right: theme.spacing.lg,
      bottom: theme.spacing.lg,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
      borderRadius: theme.borderRadius.full,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.md,
      shadowOpacity: 0.5,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 10,
    },
    fabText: { color: '#FFFFFF', fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.bold },
    sheetHint: {
      color: theme.colors.textSecondary,
      fontSize: theme.fontSize.sm,
      textAlign: 'center',
      marginBottom: theme.spacing.sm,
    },
    accountLabel: {
      color: theme.colors.textSecondary,
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.medium,
      marginBottom: theme.spacing.xs,
      marginTop: theme.spacing.sm,
    },
    dateChip: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: theme.spacing.xs,
      backgroundColor: theme.colors.surfaceLight,
      borderRadius: theme.borderRadius.full,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
    },
    dateChipText: { color: theme.colors.text, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium },
    noteInput: {
      backgroundColor: theme.colors.surfaceLight,
      borderRadius: theme.borderRadius.lg,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      color: theme.colors.text,
      fontSize: theme.fontSize.md,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
      marginBottom: theme.spacing.sm,
    },
  });
