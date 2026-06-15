import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
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
import { savingsApi, getErrorMessage } from '../api/client';
import { rescheduleGoalNotifications } from '../services/notifications';
import { showError, showSuccess } from '../components/toastConfig';
import { formatCurrency } from '../utils/formatCurrency';
import { formatShortDate, parseISOSafe } from '../utils/formatDate';
import type { RootStackParamList } from '../navigation/types';

const GOAL_ICONS = [
  'piggy-bank', 'plane', 'home', 'car', 'graduation-cap',
  'gift', 'heart', 'laptop', 'umbrella', 'gem',
];

export function AddSavingsGoalScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, 'AddSavingsGoal'>>();
  const goalId = route.params?.goalId;
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { accounts } = useAccounts();
  const triggerRefresh = useAppStore((s) => s.triggerRefresh);

  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState(0);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [color, setColor] = useState('#2E8B57');
  const [icon, setIcon] = useState('piggy-bank');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [showAmount, setShowAmount] = useState(false);
  const [showDate, setShowDate] = useState(false);
  const [showAccount, setShowAccount] = useState(false);

  // Carga la meta al editar
  useEffect(() => {
    if (!goalId) return;
    (async () => {
      try {
        const g = await savingsApi.get(goalId);
        setName(g.name);
        setTargetAmount(Number(g.targetAmount));
        setDeadline(g.deadline);
        setAccountId(g.accountId);
        setColor(g.color);
        setIcon(g.icon);
        setNotes(g.notes ?? '');
      } catch (err) {
        showError(getErrorMessage(err));
      }
    })();
  }, [goalId]);

  const selectedAccount = accounts.find((a) => a.id === accountId);

  const save = async () => {
    if (!name.trim()) {
      showError('Escribe un nombre para la meta');
      return;
    }
    if (targetAmount <= 0) {
      showError('Define el monto objetivo');
      return;
    }
    const payload = {
      name: name.trim(),
      targetAmount,
      deadline,
      color,
      icon,
      accountId,
      notes: notes.trim() || null,
    };
    try {
      setSaving(true);
      if (goalId) {
        const updated = await savingsApi.update(goalId, payload);
        showSuccess('Meta actualizada');
        rescheduleGoalNotifications(updated).catch(() => {});
      } else {
        const created = await savingsApi.create(payload);
        showSuccess('Meta creada');
        rescheduleGoalNotifications(created).catch(() => {});
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
      <ScreenHeader title={goalId ? 'Editar meta' : 'Nueva meta de ahorro'} onBack={() => navigation.goBack()} />
      <FormScrollView contentContainerStyle={styles.content}>
        <TextField label="Nombre" value={name} onChangeText={setName} placeholder="Ej: Viaje a la playa" maxLength={100} />

        <SelectRow
          label="Monto objetivo"
          value={targetAmount > 0 ? formatCurrency(targetAmount) : null}
          placeholder="Toca para ingresar el monto"
          icon="calculator"
          iconColor={theme.colors.income}
          onPress={() => setShowAmount(true)}
        />

        <SelectRow
          label="Fecha límite (opcional)"
          value={deadline ? formatShortDate(deadline) : null}
          placeholder="Sin fecha límite"
          icon="calendar"
          iconColor={theme.colors.secondary}
          onPress={() => setShowDate(true)}
        />
        {deadline && (
          <Pressable style={styles.clearRow} onPress={() => setDeadline(null)}>
            <Icon name="x" size={14} color={theme.colors.expense} />
            <Text style={styles.clearText}>Quitar fecha límite</Text>
          </Pressable>
        )}

        <SelectRow
          label="Cuenta por defecto (opcional)"
          value={selectedAccount?.name ?? null}
          placeholder="Cuenta sugerida al aportar"
          icon={selectedAccount?.icon ?? 'wallet'}
          iconColor={selectedAccount?.color ?? theme.colors.primary}
          onPress={() => setShowAccount(true)}
        />
        {selectedAccount && (
          <Text style={styles.accountHint}>
            "{selectedAccount.name}" se sugerirá al aportar. Cada aporte resta de la cuenta que elijas y el ahorro se
            mostrará aparte en ella.
          </Text>
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
          {GOAL_ICONS.map((i) => (
            <Pressable
              key={i}
              style={[styles.iconSwatch, icon === i && { backgroundColor: `${color}26`, borderColor: color }]}
              onPress={() => setIcon(i)}
            >
              <Icon name={i} size={20} color={icon === i ? color : theme.colors.textSecondary} />
            </Pressable>
          ))}
        </View>

        <TextField label="Notas (opcional)" value={notes} onChangeText={setNotes} placeholder="Detalles de la meta" multiline />

        <PrimaryButton label={goalId ? 'Guardar cambios' : 'Crear meta'} onPress={save} loading={saving} icon="piggy-bank" />
      </FormScrollView>

      <CalculatorSheet
        visible={showAmount}
        title="Monto objetivo"
        type="income"
        initialValue={targetAmount}
        onConfirm={(v) => {
          if (v > 0) setTargetAmount(v);
          setShowAmount(false);
        }}
        onClose={() => setShowAmount(false)}
      />
      <DateRangePicker
        visible={showDate}
        initialFrom={deadline ? parseISOSafe(deadline) : undefined}
        onConfirm={({ from }) => {
          setDeadline(from);
          setShowDate(false);
        }}
        onClose={() => setShowDate(false)}
      />
      <AccountPicker
        visible={showAccount}
        accounts={accounts}
        title="Cuenta por defecto del ahorro"
        onSelect={(a) => {
          setAccountId(a.id);
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
    accountHint: {
      color: theme.colors.textMuted,
      fontSize: theme.fontSize.xs,
      marginTop: -theme.spacing.sm,
      marginBottom: theme.spacing.md,
    },
  });
