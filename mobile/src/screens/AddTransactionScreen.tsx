import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { theme } from '../theme';
import { Screen, ScreenHeader, SelectRow, TextField } from '../components/common';
import { Calculator } from '../components/Calculator';
import { CategoryPicker } from '../components/CategoryPicker';
import { AccountPicker } from '../components/AccountPicker';
import { DateRangePicker } from '../components/DateRangePicker';
import { Icon } from '../components/Icon';
import { useAccounts } from '../hooks/useAccounts';
import { useAppStore } from '../stores/appStore';
import { transactionsApi, getErrorMessage } from '../api/client';
import { showError, showSuccess } from '../components/toastConfig';
import { todayISO, nowTime, formatShortDate, parseISOSafe } from '../utils/formatDate';
import type { RootStackParamList } from '../navigation/types';
import type { Account, Category, TxType } from '../types';

const TYPE_TABS: { key: TxType; label: string; color: string }[] = [
  { key: 'expense', label: 'Gasto', color: theme.colors.danger },
  { key: 'income', label: 'Ingreso', color: theme.colors.success },
  { key: 'transfer', label: 'Transferencia', color: theme.colors.primary },
];

export function AddTransactionScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, 'AddTransaction'>>();
  const params = route.params ?? {};
  const editingId = params.transactionId;
  const { accounts } = useAccounts();
  const triggerRefresh = useAppStore((s) => s.triggerRefresh);

  const [type, setType] = useState<TxType>(params.template?.type ?? params.initialType ?? 'expense');
  const [account, setAccount] = useState<Account | null>(null);
  const [toAccount, setToAccount] = useState<Account | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [date, setDate] = useState<string>(todayISO());
  const [time, setTime] = useState<string>(nowTime());
  const [description, setDescription] = useState<string>(params.template?.description ?? '');
  const [notes, setNotes] = useState<string>('');
  const [initialAmount, setInitialAmount] = useState<number>(
    params.template?.amount ? parseFloat(params.template.amount) : 0,
  );
  const [saving, setSaving] = useState(false);

  const [showCategory, setShowCategory] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showToAccount, setShowToAccount] = useState(false);
  const [showDate, setShowDate] = useState(false);

  // Cuenta por defecto: la primera disponible
  useEffect(() => {
    if (!account && accounts.length > 0) setAccount(accounts[0]);
  }, [accounts, account]);

  // Carga la transacción al editar
  useEffect(() => {
    if (!editingId) return;
    (async () => {
      try {
        const tx = await transactionsApi.get(editingId);
        setType(tx.type);
        setDate(tx.date);
        setTime(tx.time);
        setDescription(tx.description ?? '');
        setNotes(tx.notes ?? '');
        setInitialAmount(parseFloat(tx.amount));
        const acc = accounts.find((a) => a.id === tx.accountId) ?? null;
        setAccount(acc);
        if (tx.toAccountId) setToAccount(accounts.find((a) => a.id === tx.toAccountId) ?? null);
      } catch (err) {
        showError(getErrorMessage(err));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, accounts.length]);

  const headerColor = useMemo(
    () => TYPE_TABS.find((t) => t.key === type)?.color ?? theme.colors.primary,
    [type],
  );

  const save = async (amount: number) => {
    if (amount <= 0) {
      showError('El monto debe ser mayor a 0');
      return;
    }
    if (!account) {
      showError('Selecciona una cuenta');
      return;
    }
    if (type === 'transfer') {
      if (!toAccount) {
        showError('Selecciona la cuenta destino');
        return;
      }
      if (toAccount.id === account.id) {
        showError('La cuenta destino debe ser distinta');
        return;
      }
    }

    const payload = {
      type,
      amount,
      description: description.trim() || null,
      date,
      time,
      accountId: account.id,
      toAccountId: type === 'transfer' ? toAccount?.id ?? null : null,
      categoryId: type === 'transfer' ? null : category?.id ?? null,
      notes: notes.trim() || null,
    };

    try {
      setSaving(true);
      if (editingId) {
        await transactionsApi.update(editingId, payload);
        showSuccess('Transacción actualizada');
      } else {
        await transactionsApi.create(payload);
        showSuccess('Transacción guardada');
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
        title={editingId ? 'Editar movimiento' : 'Nuevo movimiento'}
        onBack={() => navigation.goBack()}
        right={
          editingId ? (
            <Pressable
              hitSlop={10}
              onPress={async () => {
                try {
                  await transactionsApi.remove(editingId);
                  triggerRefresh();
                  showSuccess('Movimiento eliminado');
                  navigation.goBack();
                } catch (err) {
                  showError(getErrorMessage(err));
                }
              }}
            >
              <Icon name="trash-2" size={20} color={theme.colors.danger} />
            </Pressable>
          ) : null
        }
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Tabs de tipo */}
        <View style={styles.tabs}>
          {TYPE_TABS.map((t) => (
            <Pressable
              key={t.key}
              style={[styles.tab, type === t.key && { backgroundColor: t.color }]}
              onPress={() => setType(t.key)}
            >
              <Text style={[styles.tabText, type === t.key && { color: '#fff', fontWeight: '700' }]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Formulario (parte superior, desplazable) */}
        <ScrollView style={styles.form} contentContainerStyle={{ paddingBottom: theme.spacing.md }} keyboardShouldPersistTaps="handled">
          <SelectRow
            label="Cuenta"
            value={account ? account.name : null}
            placeholder="Seleccionar cuenta"
            icon={account?.icon ?? 'wallet'}
            iconColor={account?.color}
            onPress={() => setShowAccount(true)}
          />

          {type === 'transfer' ? (
            <SelectRow
              label="Cuenta destino"
              value={toAccount ? toAccount.name : null}
              placeholder="Seleccionar destino"
              icon={toAccount?.icon ?? 'wallet'}
              iconColor={toAccount?.color}
              onPress={() => setShowToAccount(true)}
            />
          ) : (
            <SelectRow
              label="Categoría"
              value={category ? category.name : null}
              placeholder="Seleccionar categoría"
              icon={category?.icon ?? 'shapes'}
              iconColor={category?.color}
              onPress={() => setShowCategory(true)}
            />
          )}

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <SelectRow label="Fecha" value={formatShortDate(date)} icon="calendar" onPress={() => setShowDate(true)} />
            </View>
          </View>

          <TextField label="Descripción" value={description} onChangeText={setDescription} placeholder="Opcional" />
          <TextField label="Notas" value={notes} onChangeText={setNotes} placeholder="Opcional" multiline />
        </ScrollView>

        {/* Calculadora (parte inferior) */}
        <Calculator
          type={type}
          initialValue={initialAmount}
          currency={account?.currency ?? 'COP'}
          onConfirm={save}
        />
      </KeyboardAvoidingView>

      <CategoryPicker
        visible={showCategory}
        type={type === 'income' ? 'income' : 'expense'}
        onSelect={(c) => {
          setCategory(c);
          setShowCategory(false);
        }}
        onClose={() => setShowCategory(false)}
      />
      <AccountPicker
        visible={showAccount}
        accounts={accounts}
        onSelect={(a) => {
          setAccount(a);
          setShowAccount(false);
        }}
        onClose={() => setShowAccount(false)}
      />
      <AccountPicker
        visible={showToAccount}
        accounts={accounts}
        title="Cuenta destino"
        excludeId={account?.id}
        onSelect={(a) => {
          setToAccount(a);
          setShowToAccount(false);
        }}
        onClose={() => setShowToAccount(false)}
      />
      <DateRangePicker
        visible={showDate}
        initialFrom={parseISOSafe(date)}
        onConfirm={({ from }) => {
          setDate(from);
          setShowDate(false);
        }}
        onClose={() => setShowDate(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: theme.spacing.sm, paddingHorizontal: theme.spacing.md, marginBottom: theme.spacing.sm },
  tab: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
  },
  tabText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm },
  form: { flexGrow: 0, paddingHorizontal: theme.spacing.md, maxHeight: '42%' },
  row: { flexDirection: 'row', gap: theme.spacing.sm },
});
