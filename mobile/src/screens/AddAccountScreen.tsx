import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Switch, StyleSheet, Alert } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { PALETTE, type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, TextField, PrimaryButton, SelectRow, FormScrollView } from '../components/common';
import { Icon, ACCOUNT_ICONS } from '../components/Icon';
import { CurrencyPicker } from '../components/CurrencyPicker';
import { CalculatorSheet } from '../components/CalculatorSheet';
import { DayPickerSheet } from '../components/DayPickerSheet';
import { currencyInfo } from '../utils/currencies';
import { formatCurrency } from '../utils/formatCurrency';
import { accountsApi, recurringApi, getErrorMessage } from '../api/client';
import { showError, showSuccess } from '../components/toastConfig';
import { useAppStore } from '../stores/appStore';
import type { RootStackParamList } from '../navigation/types';
import type { AccountType } from '../types';

const TYPES: { key: AccountType; label: string; icon: string }[] = [
  { key: 'cash', label: 'Efectivo', icon: 'banknote' },
  { key: 'bank', label: 'Banco', icon: 'landmark' },
  { key: 'credit_card', label: 'Tarjeta de crédito', icon: 'credit-card' },
  { key: 'digital_wallet', label: 'Billetera', icon: 'smartphone' },
];

export function AddAccountScreen() {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const route = useRoute<RouteProp<RootStackParamList, 'AddAccount'>>();
  const editingId = route.params?.accountId;
  const triggerRefresh = useAppStore((s) => s.triggerRefresh);

  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('cash');
  const [balance, setBalance] = useState('');
  const [currency, setCurrency] = useState('COP');
  const [color, setColor] = useState(PALETTE[0]);
  const [icon, setIcon] = useState('wallet');
  const [showCurrency, setShowCurrency] = useState(false);
  const [saving, setSaving] = useState(false);

  // Solo aplican cuando type === 'credit_card'
  const [creditLimit, setCreditLimit] = useState(0);
  const [billingCycleDay, setBillingCycleDay] = useState(1);
  const [paymentDueDay, setPaymentDueDay] = useState(20);
  const [allowOverdraft, setAllowOverdraft] = useState(false);
  const [showCreditLimit, setShowCreditLimit] = useState(false);
  const [showBillingDay, setShowBillingDay] = useState(false);
  const [showPaymentDay, setShowPaymentDay] = useState(false);

  // Cuota de manejo (cualquier tipo de cuenta)
  const [feeEnabled, setFeeEnabled] = useState(false);
  const [feeAmount, setFeeAmount] = useState(0);
  const [feeDay, setFeeDay] = useState(1);
  const [showFeeAmount, setShowFeeAmount] = useState(false);
  const [showFeeDay, setShowFeeDay] = useState(false);

  // Estado de la cuenta (solo edición): activa/inactiva y congelada (tarjetas).
  const [isActive, setIsActive] = useState(true);
  const [isFrozen, setIsFrozen] = useState(false);

  useEffect(() => {
    if (!editingId) return;
    (async () => {
      try {
        const a = await accountsApi.get(editingId);
        setName(a.name);
        setType(a.type);
        // En tarjetas el saldo guardado ES el crédito DISPONIBLE (= límite − deuda);
        // se muestra como "Saldo adeudado" = límite − disponible.
        const initBal = parseFloat(a.initialBalance);
        setBalance(
          String(
            a.type === 'credit_card'
              ? Math.max(0, (a.creditLimit ?? 0) - initBal)
              : initBal,
          ),
        );
        setCurrency(a.currency);
        setColor(a.color);
        setIcon(a.icon);
        if (a.type === 'credit_card') {
          setCreditLimit(a.creditLimit ?? 0);
          setBillingCycleDay(a.billingCycleDay ?? 1);
          setPaymentDueDay(a.paymentDueDay ?? 20);
          setAllowOverdraft(a.allowOverdraft ?? false);
        }
        if (a.managementFeeAmount != null) {
          setFeeEnabled(true);
          setFeeAmount(Number(a.managementFeeAmount));
          setFeeDay(a.managementFeeDay ?? 1);
        }
        setIsActive(a.isActive);
        setIsFrozen(a.isFrozen);
      } catch (err) {
        showError(getErrorMessage(err));
      }
    })();
  }, [editingId]);

  const save = async () => {
    if (!name.trim()) {
      showError('El nombre es obligatorio');
      return;
    }
    if (type === 'credit_card' && creditLimit <= 0) {
      showError('Ingresa un límite de crédito mayor a 0');
      return;
    }
    if (feeEnabled && feeAmount <= 0) {
      showError('Ingresa el monto de la cuota de manejo');
      return;
    }
    const balanceNum = parseFloat(balance) || 0;
    const payload = {
      name: name.trim(),
      type,
      currency: currency.trim().toUpperCase().slice(0, 3) || 'COP',
      // Tarjeta: el usuario ingresa el "Saldo adeudado" (deuda). Al CREAR, el backend
      // interpreta initialBalance como esa deuda y guarda disponible = límite − deuda.
      // Al EDITAR, el backend ajusta el saldo por la diferencia de initialBalance, así
      // que se envía el disponible (= límite − deuda) directamente.
      initialBalance: type === 'credit_card' && editingId ? creditLimit - balanceNum : balanceNum,
      color,
      icon,
      ...(type === 'credit_card' && {
        creditLimit,
        billingCycleDay,
        paymentDueDay,
        allowOverdraft,
      }),
      // Cuota de manejo: se envía siempre (null desactiva la regla vinculada al editar).
      managementFeeAmount: feeEnabled && feeAmount > 0 ? feeAmount : null,
      managementFeeDay: feeEnabled && feeAmount > 0 ? feeDay : null,
    };
    try {
      setSaving(true);
      if (editingId) {
        await accountsApi.update(editingId, payload);
        showSuccess('Cuenta actualizada');
      } else {
        await accountsApi.create(payload);
        showSuccess('Cuenta creada');
      }
      triggerRefresh();
      navigation.goBack();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!editingId) return;
    Alert.alert(
      'Eliminar cuenta',
      'La cuenta dejará de aparecer en los selectores. Su historial (movimientos, deudas, etc.) se conserva y mostrará "Cuenta eliminada". ¿Quieres continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await accountsApi.remove(editingId);
              triggerRefresh();
              showSuccess('Cuenta eliminada');
              navigation.goBack();
            } catch (err) {
              showError(getErrorMessage(err));
            }
          },
        },
      ],
    );
  };

  // Desactivar/reactivar la cuenta (acción inmediata). Al desactivar, si hay reglas
  // recurrentes activas asociadas, ofrece pausarlas también.
  const toggleActive = async () => {
    if (!editingId) return;
    const applyToggle = async (pauseRules: number[]) => {
      try {
        await Promise.all(pauseRules.map((rid) => recurringApi.toggle(rid)));
        const updated = await accountsApi.toggleActive(editingId);
        setIsActive(updated.isActive);
        triggerRefresh();
        showSuccess(updated.isActive ? 'Cuenta reactivada' : 'Cuenta desactivada');
      } catch (err) {
        showError(getErrorMessage(err));
      }
    };
    if (isActive) {
      // Desactivando: ¿tiene reglas recurrentes activas?
      let activeRuleIds: number[] = [];
      try {
        const rules = await recurringApi.list();
        activeRuleIds = rules.filter((r) => r.accountId === editingId && r.isActive).map((r) => r.id);
      } catch {
        // Si falla la consulta de reglas, igual permite desactivar la cuenta.
      }
      if (activeRuleIds.length > 0) {
        Alert.alert(
          'Desactivar cuenta',
          `Esta cuenta tiene ${activeRuleIds.length} pago(s) recurrente(s) activo(s). ¿Quieres pausarlos también?`,
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Solo desactivar', onPress: () => applyToggle([]) },
            { text: 'Desactivar y pausar', onPress: () => applyToggle(activeRuleIds) },
          ],
        );
      } else {
        applyToggle([]);
      }
    } else {
      applyToggle([]);
    }
  };

  // Congelar/descongelar la tarjeta (solo credit_card).
  const toggleFrozen = async () => {
    if (!editingId) return;
    try {
      const updated = await accountsApi.toggleFrozen(editingId);
      setIsFrozen(updated.isFrozen);
      triggerRefresh();
      showSuccess(updated.isFrozen ? 'Tarjeta congelada' : 'Tarjeta descongelada');
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  return (
    <Screen>
      <ScreenHeader
        title={editingId ? 'Editar cuenta' : 'Nueva cuenta'}
        onBack={() => navigation.goBack()}
        right={
          editingId ? (
            <Pressable onPress={remove} hitSlop={10}>
              <Icon name="trash-2" size={20} color="#FFFFFF" />
            </Pressable>
          ) : null
        }
      />

      <FormScrollView contentContainerStyle={styles.content}>
        {/* Preview */}
        <View style={styles.preview}>
          <View style={[styles.previewIcon, { backgroundColor: `${color}22` }]}>
            <Icon name={icon} size={30} color={color} />
          </View>
          <Text style={styles.previewName}>{name || 'Nombre de la cuenta'}</Text>
        </View>

        <TextField label="Nombre" value={name} onChangeText={setName} placeholder="Ej: Bancolombia Ahorros" />

        <Text style={styles.label}>Tipo de cuenta</Text>
        <View style={styles.typeGrid}>
          {TYPES.map((t) => (
            <Pressable
              key={t.key}
              style={[styles.typeBtn, type === t.key && styles.typeBtnActive]}
              onPress={() => {
                setType(t.key);
                setIcon(t.icon);
              }}
            >
              <Icon name={t.icon} size={20} color={type === t.key ? theme.colors.primaryLight : theme.colors.textSecondary} />
              <Text style={[styles.typeText, type === t.key && { color: theme.colors.text }]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        {type !== 'credit_card' && (
          <TextField label="Saldo inicial" value={balance} onChangeText={setBalance} keyboardType="numeric" placeholder="0" />
        )}

        {type === 'credit_card' && (
          <>
            <SelectRow
              label="Límite de crédito"
              value={creditLimit > 0 ? formatCurrency(creditLimit, currency) : null}
              placeholder="Toca para ingresar el límite"
              icon="calculator"
              onPress={() => setShowCreditLimit(true)}
            />

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <SelectRow label="Día de corte" value={String(billingCycleDay)} icon="calendar" onPress={() => setShowBillingDay(true)} />
              </View>
              <View style={{ flex: 1 }}>
                <SelectRow label="Día de pago" value={String(paymentDueDay)} icon="calendar-clock" onPress={() => setShowPaymentDay(true)} />
              </View>
            </View>

            <TextField label="Saldo adeudado" value={balance} onChangeText={setBalance} keyboardType="numeric" placeholder="0" />

            <View style={styles.switchRow}>
              <View style={{ flex: 1, paddingRight: theme.spacing.md }}>
                <Text style={styles.switchTitle}>Permitir sobregiro</Text>
                <Text style={styles.switchHint}>Podrás registrar gastos que superen el límite de crédito.</Text>
              </View>
              <Switch
                value={allowOverdraft}
                onValueChange={setAllowOverdraft}
                trackColor={{ true: color, false: theme.colors.border }}
                thumbColor="#FFFFFF"
              />
            </View>
          </>
        )}

        <SelectRow
          label="Moneda"
          icon="circle-dollar-sign"
          value={
            currencyInfo(currency)
              ? `${currencyInfo(currency)!.symbol}  ${currency} · ${currencyInfo(currency)!.name}`
              : currency
          }
          onPress={() => setShowCurrency(true)}
        />

        {/* Cuota de manejo (cualquier tipo de cuenta) */}
        <View style={styles.switchRow}>
          <View style={{ flex: 1, paddingRight: theme.spacing.md }}>
            <Text style={styles.switchTitle}>Cuota de manejo</Text>
            <Text style={styles.switchHint}>Cobra automáticamente una cuota mensual desde esta cuenta.</Text>
          </View>
          <Switch
            value={feeEnabled}
            onValueChange={setFeeEnabled}
            trackColor={{ true: color, false: theme.colors.border }}
            thumbColor="#FFFFFF"
          />
        </View>
        {feeEnabled && (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <SelectRow
                label="Monto de la cuota"
                value={feeAmount > 0 ? formatCurrency(feeAmount, currency) : null}
                placeholder="Monto"
                icon="calculator"
                onPress={() => setShowFeeAmount(true)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <SelectRow label="Día de cobro" value={String(feeDay)} icon="calendar" onPress={() => setShowFeeDay(true)} />
            </View>
          </View>
        )}

        {/* Estado de la cuenta (solo al editar): activa/inactiva y congelar tarjeta */}
        {editingId && (
          <>
            <View style={styles.switchRow}>
              <View style={{ flex: 1, paddingRight: theme.spacing.md }}>
                <Text style={styles.switchTitle}>Cuenta activa</Text>
                <Text style={styles.switchHint}>
                  Desactivada no aparece en los selectores, pero sí en la lista, el historial y los reportes.
                </Text>
              </View>
              <Switch
                value={isActive}
                onValueChange={toggleActive}
                trackColor={{ true: theme.colors.income, false: theme.colors.border }}
                thumbColor="#FFFFFF"
              />
            </View>
            {type === 'credit_card' && (
              <View style={styles.switchRow}>
                <View style={{ flex: 1, paddingRight: theme.spacing.md }}>
                  <Text style={styles.switchTitle}>❄️ Congelar tarjeta</Text>
                  <Text style={styles.switchHint}>Bloquea gastos nuevos; permite seguir pagando la deuda existente.</Text>
                </View>
                <Switch
                  value={isFrozen}
                  onValueChange={toggleFrozen}
                  trackColor={{ true: theme.colors.secondary, false: theme.colors.border }}
                  thumbColor="#FFFFFF"
                />
              </View>
            )}
          </>
        )}

        <Text style={styles.label}>Color</Text>
        <View style={styles.palette}>
          {PALETTE.map((c) => (
            <Pressable key={c} style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchActive]} onPress={() => setColor(c)}>
              {color === c && <Icon name="check" size={16} color="#fff" />}
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Ícono</Text>
        <View style={styles.iconGrid}>
          {ACCOUNT_ICONS.map((ic) => (
            <Pressable key={ic} style={[styles.iconBtn, icon === ic && { borderColor: color }]} onPress={() => setIcon(ic)}>
              <Icon name={ic} size={22} color={icon === ic ? color : theme.colors.textSecondary} />
            </Pressable>
          ))}
        </View>

        <View style={{ marginTop: theme.spacing.lg }}>
          <PrimaryButton label={editingId ? 'Guardar cambios' : 'Crear cuenta'} onPress={save} loading={saving} icon="check" />
        </View>
      </FormScrollView>

      <CurrencyPicker
        visible={showCurrency}
        selected={currency}
        onSelect={setCurrency}
        onClose={() => setShowCurrency(false)}
      />

      <CalculatorSheet
        visible={showCreditLimit}
        title="Límite de crédito"
        type="expense"
        initialValue={creditLimit}
        currency={currency}
        onConfirm={(v) => {
          if (v > 0) setCreditLimit(v);
          setShowCreditLimit(false);
        }}
        onClose={() => setShowCreditLimit(false)}
      />
      <DayPickerSheet
        visible={showBillingDay}
        title="Día de corte"
        value={billingCycleDay}
        onConfirm={setBillingCycleDay}
        onClose={() => setShowBillingDay(false)}
      />
      <DayPickerSheet
        visible={showPaymentDay}
        title="Día de pago"
        value={paymentDueDay}
        onConfirm={setPaymentDueDay}
        onClose={() => setShowPaymentDay(false)}
      />
      <CalculatorSheet
        visible={showFeeAmount}
        title="Cuota de manejo"
        type="expense"
        initialValue={feeAmount}
        currency={currency}
        onConfirm={(v) => {
          if (v > 0) setFeeAmount(v);
          setShowFeeAmount(false);
        }}
        onClose={() => setShowFeeAmount(false)}
      />
      <DayPickerSheet
        visible={showFeeDay}
        title="Día de cobro"
        value={feeDay}
        onConfirm={setFeeDay}
        onClose={() => setShowFeeDay(false)}
      />
    </Screen>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
  content: { padding: theme.spacing.md, paddingBottom: theme.spacing.xl * 2 },
  preview: { alignItems: 'center', marginBottom: theme.spacing.lg, gap: theme.spacing.sm },
  previewIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  previewName: { color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: '700' },
  label: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginBottom: theme.spacing.sm, marginTop: theme.spacing.sm },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  typeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    width: '47%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  typeBtnActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.surfaceLight },
  typeText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm },
  row: { flexDirection: 'row', gap: theme.spacing.sm },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  swatch: { width: 40, height: 40, borderRadius: theme.borderRadius.full, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  swatchActive: { borderColor: theme.colors.text },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
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
});
