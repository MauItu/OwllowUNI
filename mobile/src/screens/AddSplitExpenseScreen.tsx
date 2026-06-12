import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, StyleSheet } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, PrimaryButton, TextField, SelectRow } from '../components/common';
import { CalculatorSheet } from '../components/CalculatorSheet';
import { CategoryPicker } from '../components/CategoryPicker';
import { DateRangePicker } from '../components/DateRangePicker';
import { BottomSheet } from '../components/BottomSheet';
import { AccountChips } from '../components/AccountChips';
import { Icon } from '../components/Icon';
import { useAccounts } from '../hooks/useAccounts';
import { useAppStore } from '../stores/appStore';
import { splitsApi, getErrorMessage } from '../api/client';
import { showError, showSuccess } from '../components/toastConfig';
import { formatCurrency } from '../utils/formatCurrency';
import { formatShortDate, parseISOSafe, todayISO } from '../utils/formatDate';
import type { RootStackParamList } from '../navigation/types';
import type { SplitMember, Category } from '../types';

/** Reparte el total en partes iguales, ajustando el redondeo en el primero. */
function equalShares(total: number, memberIds: number[]): Map<number, number> {
  const map = new Map<number, number>();
  if (memberIds.length === 0 || total <= 0) return map;
  const base = Math.floor((total / memberIds.length) * 100) / 100;
  let assigned = 0;
  memberIds.forEach((id, i) => {
    if (i === 0) return;
    map.set(id, base);
    assigned += base;
  });
  map.set(memberIds[0], Math.round((total - assigned) * 100) / 100);
  return map;
}

export function AddSplitExpenseScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, 'AddSplitExpense'>>();
  const groupId = route.params.groupId;
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const triggerRefresh = useAppStore((s) => s.triggerRefresh);
  const { accounts } = useAccounts();

  const [members, setMembers] = useState<SplitMember[]>([]);
  const [description, setDescription] = useState('');
  const [totalAmount, setTotalAmount] = useState(0);
  const [paidBy, setPaidBy] = useState<number | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState<Category | null>(null);
  const [customSplit, setCustomSplit] = useState(false);
  const [customAmounts, setCustomAmounts] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  const [showAmount, setShowAmount] = useState(false);
  const [showDate, setShowDate] = useState(false);
  const [showPaidBy, setShowPaidBy] = useState(false);
  const [showCategory, setShowCategory] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const g = await splitsApi.get(groupId);
        const ms = g.members ?? [];
        setMembers(ms);
        const me = ms.find((m) => m.isMe);
        setPaidBy(me?.id ?? ms[0]?.id ?? null);
      } catch (err) {
        showError(getErrorMessage(err));
      }
    })();
  }, [groupId]);

  const memberIds = useMemo(() => members.map((m) => m.id), [members]);
  const equal = useMemo(() => equalShares(totalAmount, memberIds), [totalAmount, memberIds]);

  const customTotal = members.reduce((acc, m) => {
    const v = Number((customAmounts[m.id] ?? '').replace(',', '.'));
    return acc + (Number.isNaN(v) ? 0 : v);
  }, 0);
  const customDiff = Math.round((totalAmount - customTotal) * 100) / 100;

  const enableCustom = (value: boolean) => {
    setCustomSplit(value);
    if (value) {
      // Parte de la división igual como base editable
      const init: Record<number, string> = {};
      members.forEach((m) => {
        init[m.id] = String(equal.get(m.id) ?? 0);
      });
      setCustomAmounts(init);
    }
  };

  const paidByMember = members.find((m) => m.id === paidBy);

  const save = async () => {
    if (!description.trim()) {
      showError('Escribe una descripción');
      return;
    }
    if (totalAmount <= 0) {
      showError('Define el monto total');
      return;
    }
    if (paidBy == null) {
      showError('Selecciona quién pagó');
      return;
    }
    let shares: { memberId: number; amount: number }[];
    if (customSplit) {
      shares = members.map((m) => {
        const v = Number((customAmounts[m.id] ?? '0').replace(',', '.'));
        return { memberId: m.id, amount: Number.isNaN(v) ? 0 : Math.round(v * 100) / 100 };
      });
      const sum = shares.reduce((acc, s) => acc + s.amount, 0);
      if (Math.abs(sum - totalAmount) > 0.01) {
        showError(`La división debe sumar ${formatCurrency(totalAmount)} (va ${formatCurrency(sum)})`);
        return;
      }
    } else {
      shares = members.map((m) => ({ memberId: m.id, amount: equal.get(m.id) ?? 0 }));
    }
    try {
      setSaving(true);
      await splitsApi.addExpense(groupId, {
        description: description.trim(),
        totalAmount,
        paidByMemberId: paidBy,
        date,
        categoryId: category?.id ?? null,
        // La cuenta solo aplica si el gasto lo pagué yo.
        accountId: paidByMember?.isMe ? accountId : null,
        shares,
      });
      showSuccess('Gasto registrado');
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
      <ScreenHeader title="Nuevo gasto compartido" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextField
          label="Descripción"
          value={description}
          onChangeText={setDescription}
          placeholder="Ej: Cena en el restaurante"
          maxLength={255}
        />

        <SelectRow
          label="Monto total"
          value={totalAmount > 0 ? formatCurrency(totalAmount) : null}
          placeholder="Toca para ingresar el monto"
          icon="calculator"
          iconColor={theme.colors.expense}
          onPress={() => setShowAmount(true)}
        />

        <SelectRow
          label="¿Quién pagó?"
          value={paidByMember ? (paidByMember.isMe ? `${paidByMember.name} (Yo)` : paidByMember.name) : null}
          placeholder="Selecciona un miembro"
          icon="user-check"
          iconColor={theme.colors.primary}
          onPress={() => setShowPaidBy(true)}
        />

        <SelectRow
          label="Fecha"
          value={formatShortDate(date)}
          icon="calendar"
          iconColor={theme.colors.secondary}
          onPress={() => setShowDate(true)}
        />

        <SelectRow
          label="Categoría (opcional)"
          value={category?.name ?? null}
          placeholder="Sin categoría"
          icon={category?.icon ?? 'shapes'}
          iconColor={category?.color ?? theme.colors.accentLight}
          onPress={() => setShowCategory(true)}
        />

        {/* Cuenta: solo cuando el gasto lo pago yo, para descontarlo de una cuenta real */}
        {paidByMember?.isMe && (
          <View style={styles.accountBlock}>
            <Text style={styles.fieldLabel}>¿De qué cuenta pagaste? (opcional)</Text>
            <AccountChips accounts={accounts} selectedId={accountId} onSelect={setAccountId} allowNone noneLabel="No descontar" />
          </View>
        )}

        {/* División */}
        <View style={styles.splitHeader}>
          <Text style={styles.fieldLabel}>División</Text>
          <View style={styles.splitToggle}>
            {(
              [
                { key: false, label: 'Partes iguales' },
                { key: true, label: 'Personalizada' },
              ] as const
            ).map((t) => (
              <Pressable
                key={String(t.key)}
                style={[styles.splitToggleBtn, customSplit === t.key && { backgroundColor: theme.colors.primary }]}
                onPress={() => enableCustom(t.key)}
              >
                <Text style={[styles.splitToggleText, customSplit === t.key && styles.splitToggleTextActive]}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {members.map((m) => (
          <View key={m.id} style={styles.shareRow}>
            <View style={[styles.shareIcon, { backgroundColor: m.isMe ? `${theme.colors.primary}26` : `${theme.colors.secondary}26` }]}>
              <Icon name={m.isMe ? 'user-check' : 'user'} size={16} color={m.isMe ? theme.colors.primary : theme.colors.secondary} />
            </View>
            <Text style={styles.shareName} numberOfLines={1}>
              {m.name}
              {m.isMe ? ' (Yo)' : ''}
            </Text>
            {customSplit ? (
              <TextInput
                style={styles.shareInput}
                value={customAmounts[m.id] ?? ''}
                onChangeText={(v) => setCustomAmounts((prev) => ({ ...prev, [m.id]: v }))}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={theme.colors.textMuted}
              />
            ) : (
              <Text style={styles.shareAmount}>{formatCurrency(equal.get(m.id) ?? 0)}</Text>
            )}
          </View>
        ))}

        {customSplit && totalAmount > 0 && (
          <Text style={[styles.diffText, { color: Math.abs(customDiff) <= 0.01 ? theme.colors.income : theme.colors.expense }]}>
            {Math.abs(customDiff) <= 0.01
              ? '✓ La división suma el total'
              : customDiff > 0
                ? `Faltan ${formatCurrency(customDiff)} por repartir`
                : `Hay ${formatCurrency(-customDiff)} de más`}
          </Text>
        )}

        <View style={{ marginTop: theme.spacing.md }}>
          <PrimaryButton label="Registrar gasto" onPress={save} loading={saving} icon="receipt" />
        </View>
      </ScrollView>

      <CalculatorSheet
        visible={showAmount}
        title="Monto total"
        type="expense"
        initialValue={totalAmount}
        onConfirm={(v) => {
          if (v > 0) setTotalAmount(v);
          setShowAmount(false);
        }}
        onClose={() => setShowAmount(false)}
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
      <CategoryPicker
        visible={showCategory}
        type="expense"
        onSelect={(c) => {
          setCategory(c);
          setShowCategory(false);
        }}
        onClose={() => setShowCategory(false)}
      />
      <BottomSheet visible={showPaidBy} title="¿Quién pagó?" onClose={() => setShowPaidBy(false)}>
        {members.map((m) => (
          <Pressable
            key={m.id}
            style={[styles.pickRow, paidBy === m.id && { borderColor: theme.colors.primary, backgroundColor: `${theme.colors.primary}15` }]}
            onPress={() => {
              setPaidBy(m.id);
              if (!m.isMe) setAccountId(null);
              setShowPaidBy(false);
            }}
          >
            <Icon name={m.isMe ? 'user-check' : 'user'} size={18} color={paidBy === m.id ? theme.colors.primaryLight : theme.colors.textSecondary} />
            <Text style={[styles.pickName, paidBy === m.id && { color: theme.colors.primaryLight, fontWeight: theme.fontWeight.bold }]}>
              {m.name}
              {m.isMe ? ' (Yo)' : ''}
            </Text>
            {paidBy === m.id && <Icon name="check" size={18} color={theme.colors.primaryLight} strokeWidth={3} />}
          </Pressable>
        ))}
      </BottomSheet>
    </Screen>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
    fieldLabel: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm },
    accountBlock: { marginBottom: theme.spacing.md, gap: theme.spacing.xs },
    splitHeader: { marginBottom: theme.spacing.sm, gap: theme.spacing.sm },
    splitToggle: { flexDirection: 'row', gap: theme.spacing.sm },
    splitToggleBtn: {
      flex: 1,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.surfaceLight,
      alignItems: 'center',
    },
    splitToggleText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium },
    splitToggleTextActive: { color: '#FFFFFF', fontWeight: theme.fontWeight.bold },
    shareRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.md,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      marginBottom: theme.spacing.xs,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
    },
    shareIcon: { width: 30, height: 30, borderRadius: theme.borderRadius.full, alignItems: 'center', justifyContent: 'center' },
    shareName: { flex: 1, color: theme.colors.text, fontSize: theme.fontSize.md },
    shareAmount: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold },
    shareInput: {
      minWidth: 110,
      textAlign: 'right',
      backgroundColor: theme.colors.surfaceLight,
      borderRadius: theme.borderRadius.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
      color: theme.colors.text,
      fontSize: theme.fontSize.md,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: 6,
    },
    diffText: { fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold, marginTop: theme.spacing.xs, textAlign: 'right' },
    pickRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      backgroundColor: theme.colors.surfaceLight,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.xs,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    pickName: { flex: 1, color: theme.colors.text, fontSize: theme.fontSize.md },
  });
