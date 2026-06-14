import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Switch, StyleSheet } from 'react-native';
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
import { accountsApi, getErrorMessage } from '../api/client';
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

  useEffect(() => {
    if (!editingId) return;
    (async () => {
      try {
        const a = await accountsApi.get(editingId);
        setName(a.name);
        setType(a.type);
        // En tarjetas de crédito el saldo inicial se guarda negado (deuda = saldo
        // negativo); se muestra como número positivo en "Saldo adeudado".
        const initBal = parseFloat(a.initialBalance);
        setBalance(String(a.type === 'credit_card' ? Math.abs(initBal) : initBal));
        setCurrency(a.currency);
        setColor(a.color);
        setIcon(a.icon);
        if (a.type === 'credit_card') {
          setCreditLimit(a.creditLimit ?? 0);
          setBillingCycleDay(a.billingCycleDay ?? 1);
          setPaymentDueDay(a.paymentDueDay ?? 20);
          setAllowOverdraft(a.allowOverdraft ?? false);
        }
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
    const balanceNum = parseFloat(balance) || 0;
    const payload = {
      name: name.trim(),
      type,
      currency: currency.trim().toUpperCase().slice(0, 3) || 'COP',
      // Al editar una tarjeta, el initialBalance guardado ya está negado; al
      // crearla, el backend niega el valor positivo que envía el usuario.
      initialBalance: type === 'credit_card' && editingId ? -balanceNum : balanceNum,
      color,
      icon,
      ...(type === 'credit_card' && {
        creditLimit,
        billingCycleDay,
        paymentDueDay,
        allowOverdraft,
      }),
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

  const remove = async () => {
    if (!editingId) return;
    try {
      await accountsApi.remove(editingId);
      triggerRefresh();
      showSuccess('Cuenta eliminada');
      navigation.goBack();
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
