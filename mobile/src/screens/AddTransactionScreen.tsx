import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, KeyboardAvoidingView, Platform, TextInput } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader } from '../components/common';
import { Calculator } from '../components/Calculator';
import { CategoryPicker } from '../components/CategoryPicker';
import { AccountPicker } from '../components/AccountPicker';
import { DateRangePicker } from '../components/DateRangePicker';
import { TagPicker } from '../components/TagPicker';
import { TagChip } from '../components/TagChip';
import { Icon } from '../components/Icon';
import { useAccounts } from '../hooks/useAccounts';
import { useAppStore } from '../stores/appStore';
import { transactionsApi, getErrorMessage } from '../api/client';
import { showError, showSuccess } from '../components/toastConfig';
import { todayISO, nowTime, formatShortDate, parseISOSafe } from '../utils/formatDate';
import type { RootStackParamList } from '../navigation/types';
import type { Account, Category, Tag, TxType } from '../types';

const TYPE_TABS: { key: TxType; label: string }[] = [
  { key: 'expense', label: 'Gasto' },
  { key: 'income', label: 'Ingreso' },
  { key: 'transfer', label: 'Transferencia' },
];

function Chip({ icon, label, iconColor, onPress }: { icon: string; label: string; iconColor?: string; onPress: () => void }) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]} onPress={onPress}>
      <Icon name={icon} size={16} color={iconColor ?? theme.colors.textSecondary} />
      <Text style={styles.chipText} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export function AddTransactionScreen() {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
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
  const [initialAmount, setInitialAmount] = useState<number>(
    params.template?.amount ? parseFloat(params.template.amount) : 0,
  );
  const [selectedTags, setSelectedTags] = useState<Pick<Tag, 'id' | 'name' | 'color' | 'icon'>[]>([]);
  const [saving, setSaving] = useState(false);

  const [showCategory, setShowCategory] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showToAccount, setShowToAccount] = useState(false);
  const [showDate, setShowDate] = useState(false);
  const [showTags, setShowTags] = useState(false);

  const toggleTag = (tag: Pick<Tag, 'id' | 'name' | 'color' | 'icon'>) => {
    setSelectedTags((prev) =>
      prev.some((t) => t.id === tag.id) ? prev.filter((t) => t.id !== tag.id) : [...prev, tag],
    );
  };

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
        setInitialAmount(parseFloat(tx.amount));
        const acc = accounts.find((a) => a.id === tx.accountId) ?? null;
        setAccount(acc);
        if (tx.toAccountId) setToAccount(accounts.find((a) => a.id === tx.toAccountId) ?? null);
        if (tx.tags) setSelectedTags(tx.tags);
      } catch (err) {
        showError(getErrorMessage(err));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, accounts.length]);

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
      notes: null,
      tagIds: selectedTags.map((t) => t.id),
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
              <Icon name="trash-2" size={20} color="#FFFFFF" />
            </Pressable>
          ) : null
        }
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Tabs de tipo (pills) */}
        <View style={styles.tabs}>
          {TYPE_TABS.map((t) => {
            const active = type === t.key;
            return (
              <Pressable
                key={t.key}
                style={[styles.tab, active && { backgroundColor: theme.colors[t.key] }]}
                onPress={() => setType(t.key)}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Chips de cuenta / categoría / fecha */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
          keyboardShouldPersistTaps="handled"
        >
          <Chip
            icon={account?.icon ?? 'wallet'}
            iconColor={account?.color ?? theme.colors.primary}
            label={account ? account.name : 'Cuenta'}
            onPress={() => setShowAccount(true)}
          />
          {type === 'transfer' ? (
            <Chip
              icon={toAccount?.icon ?? 'arrow-right'}
              iconColor={toAccount?.color ?? theme.colors.transfer}
              label={toAccount ? toAccount.name : 'Destino'}
              onPress={() => setShowToAccount(true)}
            />
          ) : (
            <Chip
              icon={category?.icon ?? 'shapes'}
              iconColor={category?.color ?? theme.colors.accent}
              label={category ? category.name : 'Categoría'}
              onPress={() => setShowCategory(true)}
            />
          )}
          <Chip icon="calendar" label={formatShortDate(date)} onPress={() => setShowDate(true)} />
        </ScrollView>

        {/* Descripción opcional */}
        <View style={styles.descWrap}>
          <Icon name="pencil" size={16} color={theme.colors.textMuted} />
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Añade una descripción (opcional)"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.descInput}
            returnKeyType="done"
          />
        </View>

        {/* Etiquetas */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tagsRow}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            style={({ pressed }) => [styles.tagsBtn, pressed && { opacity: 0.7 }]}
            onPress={() => setShowTags(true)}
          >
            <Icon name="tag" size={14} color={theme.colors.accentLight} />
            <Text style={styles.tagsBtnText}>Etiquetas</Text>
          </Pressable>
          {selectedTags.map((tag) => (
            <TagChip key={tag.id} tag={tag} onRemove={() => toggleTag(tag)} />
          ))}
        </ScrollView>

        <View style={{ flex: 1 }} />

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
      <TagPicker
        visible={showTags}
        selectedIds={selectedTags.map((t) => t.id)}
        onToggle={toggleTag}
        onClose={() => setShowTags(false)}
      />
    </Screen>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
  tabs: { flexDirection: 'row', gap: theme.spacing.sm, paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.md },
  tab: {
    flex: 1,
    paddingVertical: theme.spacing.sm + 2,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surfaceLight,
    alignItems: 'center',
  },
  tabText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium },
  tabTextActive: { color: theme.colors.background, fontWeight: theme.fontWeight.bold },
  chipsRow: { gap: theme.spacing.sm, paddingHorizontal: theme.spacing.lg },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chipText: { color: theme.colors.text, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium, maxWidth: 140 },
  descWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: Platform.OS === 'ios' ? theme.spacing.sm + 2 : 2,
  },
  descInput: { flex: 1, color: theme.colors.text, fontSize: theme.fontSize.md },
  tagsRow: {
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    alignItems: 'center',
  },
  tagsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
  },
  tagsBtnText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium },
});
