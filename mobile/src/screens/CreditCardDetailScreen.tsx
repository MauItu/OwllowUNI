import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import {
  Screen,
  ScreenHeader,
  EmptyState,
  ErrorState,
  Loading,
  SectionTitle,
  PrimaryButton,
  TextField,
  SelectRow,
} from '../components/common';
import { BottomSheet } from '../components/BottomSheet';
import { AccountPicker } from '../components/AccountPicker';
import { TransactionCard } from '../components/TransactionCard';
import { Icon } from '../components/Icon';
import { useAccounts } from '../hooks/useAccounts';
import { useCreditCard } from '../hooks/useCreditCard';
import { useAppStore } from '../stores/appStore';
import { accountsApi, transactionsApi, getErrorMessage } from '../api/client';
import { showError, showSuccess } from '../components/toastConfig';
import { formatCurrency } from '../utils/formatCurrency';
import { formatShortDate, todayISO } from '../utils/formatDate';
import type { RootStackParamList } from '../navigation/types';
import type { Account, CreditCardStatement, Transaction } from '../types';

// Mismos tramos de color que AccountCard (no exportados allí): verde/amarillo/naranja/rojo.
function utilizationColor(theme: Theme, pct: number) {
  if (pct > 100) return theme.colors.danger;
  if (pct > 80) return '#F97316';
  if (pct > 50) return '#FACC15';
  return theme.colors.income;
}

function polarPoint(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** Arco entre dos ángulos (0°=derecha, 90°=abajo, 180°=izquierda) usado por el medidor semicircular. */
function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarPoint(cx, cy, r, startAngle);
  const end = polarPoint(cx, cy, r, endAngle);
  const largeArc = Math.abs(startAngle - endAngle) > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function statementStatus(s: CreditCardStatement, theme: Theme): { label: string; color: string } {
  if (s.isPaid) return { label: 'Pagado', color: theme.colors.income };
  if (s.paymentDueDate < todayISO()) return { label: 'Vencido', color: theme.colors.danger };
  return { label: 'Pendiente', color: '#FACC15' };
}

/** Medidor semicircular de utilización: arco de fondo + arco relleno según el % usado. */
function UtilizationGauge({ pct, color }: { pct: number; color: string }) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const size = 240;
  const stroke = 22;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = r + stroke / 2;
  const height = cy + stroke / 2;
  const pctClamped = Math.min(Math.max(pct, 0), 100);
  const bgPath = arcPath(cx, cy, r, 180, 0);
  const fgEndAngle = 180 - (pctClamped / 100) * 180;
  const fgPath = pctClamped > 0.5 ? arcPath(cx, cy, r, 180, fgEndAngle) : null;

  return (
    <View style={styles.gaugeWrap}>
      <Svg width={size} height={height}>
        <Path d={bgPath} stroke={theme.colors.surfaceLight} strokeWidth={stroke} fill="none" strokeLinecap="round" />
        {!!fgPath && <Path d={fgPath} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" />}
      </Svg>
      <View style={[styles.gaugeLabel, { top: cy - 26 }]} pointerEvents="none">
        <Text style={styles.gaugePct}>{Math.round(pct)}%</Text>
        <Text style={styles.gaugeSub}>utilizado</Text>
      </View>
    </View>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export function CreditCardDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, 'CreditCardDetail'>>();
  const accountId = route.params.accountId;
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const triggerRefresh = useAppStore((s) => s.triggerRefresh);
  const { accounts } = useAccounts();
  const {
    statements,
    loading: loadingStatements,
    refreshing: refreshingStatements,
    error: statementsError,
    refetch: refetchStatements,
    payStatement,
    generateStatement,
  } = useCreditCard(accountId);

  const [account, setAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payAccountId, setPayAccountId] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);
        const [acc, txs] = await Promise.all([
          accountsApi.get(accountId),
          transactionsApi.list({ account_id: accountId, limit: 10 }),
        ]);
        setAccount(acc);
        setTransactions(txs.data);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accountId],
  );

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    load(true);
    refetchStatements(true);
  }, [load, refetchStatements]);

  // Cuentas de débito (no tarjetas de crédito) para pagar el estado de cuenta.
  const debitAccounts = useMemo(() => accounts.filter((a) => a.type !== 'credit_card'), [accounts]);

  const latestStatement = statements[0] ?? null;
  const pending = latestStatement ? Math.max(Number(latestStatement.totalAmount) - Number(latestStatement.paidAmount), 0) : 0;
  const selectedPayAccount = debitAccounts.find((a) => a.id === payAccountId) ?? null;

  const openPay = () => {
    if (!latestStatement) return;
    setPayAmount(pending > 0 ? String(pending) : '');
    setPayAccountId(null);
    setPayOpen(true);
  };

  const confirmPay = async () => {
    if (!latestStatement) return;
    const amount = parseFloat(payAmount.replace(',', '.'));
    if (!amount || amount <= 0) {
      showError('Ingresa un monto válido');
      return;
    }
    if (!payAccountId) {
      showError('Selecciona la cuenta de origen');
      return;
    }
    try {
      setPaying(true);
      await payStatement(latestStatement.id, amount, payAccountId);
      setPayOpen(false);
      showSuccess('Pago registrado');
      triggerRefresh();
      load(true);
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setPaying(false);
    }
  };

  const handleGenerateStatement = async () => {
    try {
      setGenerating(true);
      await generateStatement();
      showSuccess('Estado de cuenta generado');
      triggerRefresh();
      load(true);
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setGenerating(false);
    }
  };

  if ((loading || loadingStatements) && !account) {
    return (
      <Screen>
        <ScreenHeader title="Tarjeta" onBack={() => navigation.goBack()} />
        <Loading />
      </Screen>
    );
  }

  if (error && !account) {
    return (
      <Screen>
        <ScreenHeader title="Tarjeta" onBack={() => navigation.goBack()} />
        <ErrorState message={error} onRetry={() => load()} />
      </Screen>
    );
  }

  if (!account) return null;

  const pct = account.utilizationPercentage ?? 0;
  const gaugeColor = utilizationColor(theme, pct);

  return (
    <Screen>
      <ScreenHeader title={account.name} onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing || refreshingStatements} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      >
        <UtilizationGauge pct={pct} color={gaugeColor} />

        <View style={styles.infoGrid}>
          <InfoItem label="Límite" value={formatCurrency(account.creditLimit ?? 0, account.currency)} />
          <InfoItem label="Usado" value={formatCurrency(account.creditUsed ?? 0, account.currency)} />
          <InfoItem label="Disponible" value={formatCurrency(account.creditAvailable ?? 0, account.currency)} />
          <InfoItem label="Día de corte" value={String(account.billingCycleDay ?? '—')} />
          <InfoItem label="Día de pago" value={String(account.paymentDueDay ?? '—')} />
        </View>

        <Pressable style={styles.editBtn} onPress={() => navigation.navigate('AddAccount', { accountId })}>
          <Icon name="pencil" size={16} color={theme.colors.primary} />
          <Text style={styles.editBtnText}>Editar límite</Text>
        </Pressable>

        <SectionTitle title="Estado de cuenta actual" />
        {latestStatement ? (
          <View style={styles.statementCard}>
            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Periodo</Text>
                <Text style={styles.metaValue}>
                  {formatShortDate(latestStatement.periodStart)} – {formatShortDate(latestStatement.periodEnd)}
                </Text>
              </View>
            </View>
            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Total</Text>
                <Text style={styles.metaValue}>{formatCurrency(latestStatement.totalAmount, account.currency)}</Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Pagado</Text>
                <Text style={[styles.metaValue, { color: theme.colors.income }]}>
                  {formatCurrency(latestStatement.paidAmount, account.currency)}
                </Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Pendiente</Text>
                <Text style={[styles.metaValue, { color: theme.colors.expense }]}>
                  {formatCurrency(pending, account.currency)}
                </Text>
              </View>
            </View>
            {!latestStatement.isPaid && (
              <Pressable style={[styles.payBtn, { backgroundColor: theme.colors.primary }]} onPress={openPay}>
                <Icon name="hand-coins" size={18} color="#FFFFFF" strokeWidth={2.4} />
                <Text style={styles.payBtnText}>Pagar</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <>
            <EmptyState icon="receipt" text="Todavía no hay estados de cuenta generados." />
            <Pressable style={styles.editBtn} onPress={handleGenerateStatement} disabled={generating}>
              <Icon name="file-plus-2" size={16} color={theme.colors.primary} />
              <Text style={styles.editBtnText}>{generating ? 'Generando…' : 'Generar estado de cuenta'}</Text>
            </Pressable>
          </>
        )}

        <SectionTitle title="Historial" />
        {statementsError ? (
          <ErrorState message={statementsError} onRetry={() => refetchStatements()} />
        ) : statements.length === 0 ? (
          <EmptyState icon="history" text="Sin estados de cuenta anteriores." />
        ) : (
          statements.map((s) => {
            const status = statementStatus(s, theme);
            return (
              <View key={s.id} style={styles.historyRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyPeriod}>
                    {formatShortDate(s.periodStart)} – {formatShortDate(s.periodEnd)}
                  </Text>
                  <Text style={styles.historyDue}>Pago hasta {formatShortDate(s.paymentDueDate)}</Text>
                </View>
                <Text style={styles.historyAmount}>{formatCurrency(s.totalAmount, account.currency)}</Text>
                <View style={[styles.badge, { backgroundColor: `${status.color}26` }]}>
                  <Text style={[styles.badgeText, { color: status.color }]}>{status.label}</Text>
                </View>
              </View>
            );
          })
        )}

        <SectionTitle
          title="Últimas compras"
          action={
            <Pressable onPress={() => navigation.navigate('Transactions', { accountId })} hitSlop={8}>
              <Text style={styles.seeAll}>Ver todas</Text>
            </Pressable>
          }
        />
        {transactions.length === 0 ? (
          <EmptyState icon="receipt" text="Sin compras registradas en esta tarjeta." />
        ) : (
          transactions.map((t) => (
            <TransactionCard
              key={t.id}
              transaction={t}
              onPress={() => navigation.navigate('AddTransaction', { transactionId: t.id })}
            />
          ))
        )}
      </ScrollView>

      <BottomSheet visible={payOpen} title="Pagar estado de cuenta" onClose={() => setPayOpen(false)} maxHeight="80%">
        <Text style={styles.sheetHint}>
          Pendiente:{' '}
          <Text style={{ color: theme.colors.expense, fontWeight: theme.fontWeight.bold }}>
            {formatCurrency(pending, account.currency)}
          </Text>
        </Text>
        <TextField label="Monto a pagar" value={payAmount} onChangeText={setPayAmount} keyboardType="numeric" placeholder="0" />
        <SelectRow
          label="Cuenta de origen"
          value={selectedPayAccount?.name}
          placeholder="Selecciona una cuenta"
          icon={selectedPayAccount?.icon ?? 'wallet'}
          iconColor={selectedPayAccount?.color}
          onPress={() => setPickerOpen(true)}
        />
        <View style={{ marginTop: theme.spacing.md }}>
          <PrimaryButton label="Confirmar pago" onPress={confirmPay} loading={paying} icon="check" />
        </View>
      </BottomSheet>

      <AccountPicker
        visible={pickerOpen}
        accounts={debitAccounts}
        title="Cuenta de origen"
        onSelect={(a) => {
          setPayAccountId(a.id);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </Screen>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  gaugeWrap: { alignItems: 'center', marginBottom: theme.spacing.md },
  gaugeLabel: { position: 'absolute', width: '100%', alignItems: 'center' },
  gaugePct: { color: theme.colors.text, fontSize: theme.fontSize.xxl, fontWeight: theme.fontWeight.bold },
  gaugeSub: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginTop: 2 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginBottom: theme.spacing.md },
  infoItem: {
    flexBasis: '31%',
    flexGrow: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    gap: 2,
  },
  infoLabel: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs },
  infoValue: { color: theme.colors.text, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    alignSelf: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    marginBottom: theme.spacing.md,
  },
  editBtnText: { color: theme.colors.primary, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold },
  statementCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  metaRow: { flexDirection: 'row' },
  metaItem: { flex: 1, gap: 2 },
  metaLabel: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs },
  metaValue: { color: theme.colors.text, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm + 2,
    marginTop: theme.spacing.xs,
  },
  payBtnText: { color: '#FFFFFF', fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.bold },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.cardBorder,
  },
  historyPeriod: { color: theme.colors.text, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium },
  historyDue: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginTop: 2 },
  historyAmount: { color: theme.colors.text, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold },
  badge: { paddingHorizontal: theme.spacing.sm, paddingVertical: 4, borderRadius: theme.borderRadius.full },
  badgeText: { fontSize: theme.fontSize.xs, fontWeight: theme.fontWeight.semibold },
  seeAll: { color: theme.colors.primary, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold },
  sheetHint: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, textAlign: 'center', marginBottom: theme.spacing.sm },
});
