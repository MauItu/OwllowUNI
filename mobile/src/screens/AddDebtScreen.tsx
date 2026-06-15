import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Switch, StyleSheet } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { type Theme, PALETTE } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, PrimaryButton, TextField, SelectRow, FormScrollView } from '../components/common';
import { CalculatorSheet } from '../components/CalculatorSheet';
import { AccountPicker } from '../components/AccountPicker';
import { DateRangePicker } from '../components/DateRangePicker';
import { Icon } from '../components/Icon';
import { useAccounts } from '../hooks/useAccounts';
import { useAppStore } from '../stores/appStore';
import { debtsApi, getErrorMessage } from '../api/client';
import { rescheduleDebtNotifications } from '../services/notifications';
import { showError, showSuccess } from '../components/toastConfig';
import { formatCurrency } from '../utils/formatCurrency';
import { frenchInstallment } from '../utils/installments';
import { formatShortDate, parseISOSafe, todayISO } from '../utils/formatDate';
import type { RootStackParamList } from '../navigation/types';
import type { DebtType } from '../types';

const DEBT_ICONS = [
  'landmark', 'banknote', 'credit-card', 'hand-coins', 'home',
  'car', 'graduation-cap', 'briefcase', 'users', 'receipt',
];

export function AddDebtScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, 'AddDebt'>>();
  const debtId = route.params?.debtId;
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { accounts } = useAccounts();
  const triggerRefresh = useAppStore((s) => s.triggerRefresh);

  const [type, setType] = useState<DebtType>('debt');
  const [name, setName] = useState('');
  const [creditorDebtor, setCreditorDebtor] = useState('');
  const [totalAmount, setTotalAmount] = useState(0);
  const [interestRate, setInterestRate] = useState('');
  // Cuotas a crédito (amortización francesa). Si está activo, se calcula la cuota.
  const [installmentsOn, setInstallmentsOn] = useState(false);
  const [installmentCount, setInstallmentCount] = useState('12');
  const [monthlyRate, setMonthlyRate] = useState('');
  const [lateRate, setLateRate] = useState('');
  const [startDate, setStartDate] = useState(todayISO());
  const [cutoffDate, setCutoffDate] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [registerInitial, setRegisterInitial] = useState(false);
  const [color, setColor] = useState('#C1437A');
  const [icon, setIcon] = useState('landmark');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [showAmount, setShowAmount] = useState(false);
  const [showStartDate, setShowStartDate] = useState(false);
  const [showCutoffDate, setShowCutoffDate] = useState(false);
  const [showDueDate, setShowDueDate] = useState(false);
  const [showAccount, setShowAccount] = useState(false);

  // Carga la deuda al editar
  useEffect(() => {
    if (!debtId) return;
    (async () => {
      try {
        const d = await debtsApi.get(debtId);
        setType(d.type);
        setName(d.name);
        setCreditorDebtor(d.creditorDebtor ?? '');
        setTotalAmount(Number(d.totalAmount));
        setInterestRate(d.interestRate != null ? String(Number(d.interestRate)) : '');
        if (d.installments && d.installments >= 2) {
          setInstallmentsOn(true);
          setInstallmentCount(String(d.installments));
          setMonthlyRate(d.monthlyInterestRate != null ? String(Number(d.monthlyInterestRate)) : '');
          setLateRate(d.lateInterestRate != null ? String(Number(d.lateInterestRate)) : '');
        }
        setStartDate(d.startDate);
        setCutoffDate(d.cutoffDate);
        setDueDate(d.dueDate);
        setAccountId(d.accountId);
        // El switch del desembolso refleja si ya hay una tx registrada.
        setRegisterInitial(d.initialTransactionId != null);
        setColor(d.color);
        setIcon(d.icon);
        setNotes(d.notes ?? '');
      } catch (err) {
        showError(getErrorMessage(err));
      }
    })();
  }, [debtId]);

  const selectedAccount = accounts.find((a) => a.id === accountId);
  // El desembolso inicial solo aplica a cuentas normales: en una tarjeta de crédito
  // no salen/entran fondos así (el gasto con tarjeta tiene su propio flujo).
  const canRegisterInitial = selectedAccount != null && selectedAccount.type !== 'credit_card';
  const isDebt = type === 'debt';
  const semanticColor = isDebt ? theme.colors.expense : theme.colors.income;

  // Cuota estimada (amortización francesa) para el preview en vivo.
  const installmentCountNum = Math.min(60, Math.max(0, parseInt(installmentCount || '0', 10) || 0));
  const monthlyRateNum = monthlyRate.trim() ? Number(monthlyRate.replace(',', '.')) : 0;
  const cuotaPreview =
    installmentsOn && installmentCountNum >= 2 && totalAmount > 0
      ? frenchInstallment(totalAmount, monthlyRateNum || 0, installmentCountNum)
      : null;

  const save = async () => {
    if (!name.trim()) {
      showError('Escribe un nombre para la deuda');
      return;
    }
    if (totalAmount <= 0) {
      showError('Define el monto total');
      return;
    }
    const rate = interestRate.trim() ? Number(interestRate.replace(',', '.')) : null;
    if (rate != null && (Number.isNaN(rate) || rate < 0)) {
      showError('La tasa de interés no es válida');
      return;
    }
    const installments = installmentsOn && installmentCountNum >= 2 ? installmentCountNum : null;
    const lateRateNum = lateRate.trim() ? Number(lateRate.replace(',', '.')) : null;
    if (installments) {
      if (monthlyRate.trim() && (Number.isNaN(monthlyRateNum) || monthlyRateNum < 0)) {
        showError('La tasa de interés del crédito no es válida');
        return;
      }
      if (lateRateNum != null && (Number.isNaN(lateRateNum) || lateRateNum < 0)) {
        showError('La tasa de mora no es válida');
        return;
      }
    }
    const payload = {
      name: name.trim(),
      type,
      totalAmount,
      // El interés anual informativo solo aplica a deudas sin cuotas.
      interestRate: installments ? null : rate,
      installments,
      monthlyInterestRate: installments && monthlyRate.trim() ? monthlyRateNum : null,
      lateInterestRate: installments ? lateRateNum : null,
      creditorDebtor: creditorDebtor.trim() || null,
      startDate,
      cutoffDate,
      dueDate,
      color,
      icon,
      notes: notes.trim() || null,
      accountId,
    };
    try {
      setSaving(true);
      if (debtId) {
        const updated = await debtsApi.update(debtId, {
          ...payload,
          registerInitialTransaction: registerInitial && canRegisterInitial,
        });
        showSuccess(isDebt ? 'Deuda actualizada' : 'Préstamo actualizado');
        rescheduleDebtNotifications(updated).catch(() => {});
      } else {
        const created = await debtsApi.create({
          ...payload,
          registerInitialTransaction: registerInitial && canRegisterInitial,
        });
        showSuccess(isDebt ? 'Deuda registrada' : 'Préstamo registrado');
        rescheduleDebtNotifications(created).catch(() => {});
      }
      triggerRefresh();
      navigation.goBack();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader
        title={debtId ? 'Editar deuda' : 'Nueva deuda o préstamo'}
        onBack={() => navigation.goBack()}
      />
      <FormScrollView contentContainerStyle={styles.content}>
        {/* Toggle Yo debo / Me deben */}
        <View style={styles.toggle}>
          {(
            [
              { key: 'debt', label: 'Yo debo', color: theme.colors.expense },
              { key: 'loan', label: 'Me deben', color: theme.colors.income },
            ] as const
          ).map((t) => (
            <Pressable
              key={t.key}
              style={[styles.toggleBtn, type === t.key && { backgroundColor: t.color }]}
              onPress={() => setType(t.key)}
            >
              <Text style={[styles.toggleText, type === t.key && styles.toggleTextActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        <TextField
          label="Nombre"
          value={name}
          onChangeText={setName}
          placeholder={isDebt ? 'Ej: Crédito del banco' : 'Ej: Préstamo a Juan'}
          maxLength={100}
        />

        <TextField
          label={isDebt ? '¿A quién le debes? (opcional)' : '¿Quién te debe? (opcional)'}
          value={creditorDebtor}
          onChangeText={setCreditorDebtor}
          placeholder="Persona o entidad"
          maxLength={100}
        />

        <SelectRow
          label="Monto total"
          value={totalAmount > 0 ? formatCurrency(totalAmount) : null}
          placeholder="Toca para ingresar el monto"
          icon="calculator"
          iconColor={semanticColor}
          onPress={() => setShowAmount(true)}
        />

        {/* Cuotas a crédito (amortización francesa) */}
        <View style={styles.switchRow}>
          <View style={{ flex: 1, paddingRight: theme.spacing.md }}>
            <Text style={styles.switchTitle}>¿A cuotas / crédito?</Text>
            <Text style={styles.switchHint}>Calcula la cuota mensual con interés (amortización francesa).</Text>
          </View>
          <Switch
            value={installmentsOn}
            onValueChange={setInstallmentsOn}
            trackColor={{ true: semanticColor, false: theme.colors.border }}
            thumbColor="#FFFFFF"
          />
        </View>

        {installmentsOn ? (
          <>
            <TextField
              label="Número de cuotas"
              value={installmentCount}
              onChangeText={(t) => setInstallmentCount(t.replace(/[^0-9]/g, '').slice(0, 2))}
              placeholder="12"
              keyboardType="number-pad"
              maxLength={2}
            />
            <TextField
              label="Tasa de interés mensual % (crédito)"
              value={monthlyRate}
              onChangeText={setMonthlyRate}
              placeholder="Ej: 2.5"
              keyboardType="decimal-pad"
              maxLength={6}
            />
            <TextField
              label="Tasa de mora mensual % (opcional)"
              value={lateRate}
              onChangeText={setLateRate}
              placeholder="Ej: 3"
              keyboardType="decimal-pad"
              maxLength={6}
            />
            <Text style={styles.cuotaHint}>
              {cuotaPreview != null
                ? `Cuota mensual estimada: ${formatCurrency(cuotaPreview)}`
                : 'Ingresa el monto y un número de cuotas entre 2 y 60.'}
            </Text>
          </>
        ) : (
          <TextField
            label="Tasa de interés anual % (opcional)"
            value={interestRate}
            onChangeText={setInterestRate}
            placeholder="Ej: 12.5"
            keyboardType="decimal-pad"
            maxLength={6}
          />
        )}

        <SelectRow
          label="Fecha de inicio"
          value={formatShortDate(startDate)}
          icon="calendar"
          iconColor={theme.colors.secondary}
          onPress={() => setShowStartDate(true)}
        />

        <SelectRow
          label="Fecha de corte (opcional)"
          value={cutoffDate ? formatShortDate(cutoffDate) : null}
          placeholder="Sin fecha de corte"
          icon="scissors"
          iconColor={theme.colors.secondary}
          onPress={() => setShowCutoffDate(true)}
        />
        {cutoffDate && (
          <Pressable style={styles.clearRow} onPress={() => setCutoffDate(null)}>
            <Icon name="x" size={14} color={theme.colors.expense} />
            <Text style={styles.clearText}>Quitar fecha de corte</Text>
          </Pressable>
        )}

        <SelectRow
          label="Fecha límite de pago (opcional)"
          value={dueDate ? formatShortDate(dueDate) : null}
          placeholder="Sin fecha límite de pago"
          icon="calendar-clock"
          iconColor={theme.colors.accentLight}
          onPress={() => setShowDueDate(true)}
        />
        {dueDate && (
          <Pressable style={styles.clearRow} onPress={() => setDueDate(null)}>
            <Icon name="x" size={14} color={theme.colors.expense} />
            <Text style={styles.clearText}>Quitar fecha límite de pago</Text>
          </Pressable>
        )}

        <SelectRow
          label="Cuenta asociada (opcional)"
          value={selectedAccount?.name ?? null}
          placeholder="Sin cuenta asociada"
          icon={selectedAccount?.icon ?? 'wallet'}
          iconColor={selectedAccount?.color ?? theme.colors.primary}
          onPress={() => setShowAccount(true)}
        />

        {/* Con cuenta NORMAL (no tarjeta): registrar el desembolso. Editable también
            al editar la deuda (prende/apaga la transacción del movimiento). */}
        {canRegisterInitial && (
          <View style={styles.switchRow}>
            <View style={{ flex: 1, paddingRight: theme.spacing.md }}>
              <Text style={styles.switchTitle}>Registrar el movimiento en la cuenta</Text>
              <Text style={styles.switchHint}>
                {isDebt
                  ? `Suma ${formatCurrency(totalAmount)} a "${selectedAccount?.name}" como ingreso (te lo prestaron).`
                  : `Descuenta ${formatCurrency(totalAmount)} de "${selectedAccount?.name}" como gasto (lo prestaste).`}
              </Text>
            </View>
            <Switch
              value={registerInitial}
              onValueChange={setRegisterInitial}
              trackColor={{ true: semanticColor, false: theme.colors.border }}
              thumbColor="#FFFFFF"
            />
          </View>
        )}

        <Text style={styles.fieldLabel}>Color</Text>
        <View style={styles.swatches}>
          {PALETTE.map((c) => (
            <Pressable
              key={c}
              style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchActive]}
              onPress={() => setColor(c)}
            >
              {color === c && <Icon name="check" size={14} color="#FFFFFF" strokeWidth={3} />}
            </Pressable>
          ))}
        </View>

        <Text style={styles.fieldLabel}>Ícono</Text>
        <View style={styles.swatches}>
          {DEBT_ICONS.map((i) => (
            <Pressable
              key={i}
              style={[styles.iconSwatch, icon === i && { backgroundColor: `${color}26`, borderColor: color }]}
              onPress={() => setIcon(i)}
            >
              <Icon name={i} size={20} color={icon === i ? color : theme.colors.textSecondary} />
            </Pressable>
          ))}
        </View>

        <TextField label="Notas (opcional)" value={notes} onChangeText={setNotes} placeholder="Detalles de la deuda" multiline />

        <PrimaryButton
          label={debtId ? 'Guardar cambios' : isDebt ? 'Registrar deuda' : 'Registrar préstamo'}
          onPress={save}
          loading={saving}
          icon="landmark"
        />
      </FormScrollView>

      <CalculatorSheet
        visible={showAmount}
        title="Monto total"
        type={isDebt ? 'expense' : 'income'}
        initialValue={totalAmount}
        onConfirm={(v) => {
          if (v > 0) setTotalAmount(v);
          setShowAmount(false);
        }}
        onClose={() => setShowAmount(false)}
      />
      <DateRangePicker
        visible={showStartDate}
        initialFrom={parseISOSafe(startDate)}
        onConfirm={({ from }) => {
          setStartDate(from);
          setShowStartDate(false);
        }}
        onClose={() => setShowStartDate(false)}
      />
      <DateRangePicker
        visible={showCutoffDate}
        initialFrom={cutoffDate ? parseISOSafe(cutoffDate) : undefined}
        onConfirm={({ from }) => {
          setCutoffDate(from);
          setShowCutoffDate(false);
        }}
        onClose={() => setShowCutoffDate(false)}
      />
      <DateRangePicker
        visible={showDueDate}
        initialFrom={dueDate ? parseISOSafe(dueDate) : undefined}
        onConfirm={({ from }) => {
          setDueDate(from);
          setShowDueDate(false);
        }}
        onClose={() => setShowDueDate(false)}
      />
      <AccountPicker
        visible={showAccount}
        accounts={accounts}
        title="Cuenta asociada"
        onSelect={(a) => {
          setAccountId(a.id);
          // Al asociar una cuenta normal a una deuda NUEVA, el registro del
          // movimiento arranca activado: la deuda se refleja de una vez en el
          // saldo (suma en "Yo debo", resta en "Me deben"). En tarjeta de
          // crédito no aplica. Al editar se respeta lo que ya tenía la deuda.
          if (!debtId) setRegisterInitial(a.type !== 'credit_card');
          setShowAccount(false);
        }}
        onClose={() => setShowAccount(false)}
      />
    </Screen>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
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
    fieldLabel: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginBottom: theme.spacing.xs },
    swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginBottom: theme.spacing.md },
    swatch: {
      width: 36,
      height: 36,
      borderRadius: theme.borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    swatchActive: { borderWidth: 3, borderColor: theme.colors.text },
    iconSwatch: {
      width: 44,
      height: 44,
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.surfaceLight,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    clearRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
      marginTop: -theme.spacing.sm,
      marginBottom: theme.spacing.md,
    },
    clearText: { color: theme.colors.expense, fontSize: theme.fontSize.sm },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.md,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
    },
    switchTitle: { color: theme.colors.text, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold },
    switchHint: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginTop: 2 },
    cuotaHint: {
      color: theme.colors.primaryLight,
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.medium,
      marginBottom: theme.spacing.md,
    },
  });
