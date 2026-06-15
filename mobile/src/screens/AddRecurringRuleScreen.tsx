import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, PrimaryButton, TextField, SelectRow, FormScrollView } from '../components/common';
import { CalculatorSheet } from '../components/CalculatorSheet';
import { AccountPicker } from '../components/AccountPicker';
import { CategoryPicker } from '../components/CategoryPicker';
import { TagPicker } from '../components/TagPicker';
import { DayPickerSheet } from '../components/DayPickerSheet';
import { DateRangePicker } from '../components/DateRangePicker';
import { Icon } from '../components/Icon';
import { useAccounts } from '../hooks/useAccounts';
import { useAppStore } from '../stores/appStore';
import { recurringApi, getErrorMessage } from '../api/client';
import { showError, showSuccess } from '../components/toastConfig';
import { formatCurrency } from '../utils/formatCurrency';
import { formatShortDate, parseISOSafe, todayISO } from '../utils/formatDate';
import type { RootStackParamList } from '../navigation/types';
import type { Category, Frequency, Tag } from '../types';

const FREQS: { key: Frequency; label: string }[] = [
  { key: 'daily', label: 'Diario' },
  { key: 'weekly', label: 'Semanal' },
  { key: 'biweekly', label: 'Quincenal' },
  { key: 'monthly', label: 'Mensual' },
  { key: 'yearly', label: 'Anual' },
];
const DOW_SHORT = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

export function AddRecurringRuleScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, 'AddRecurring'>>();
  const ruleId = route.params?.ruleId;
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { accounts } = useAccounts();
  const triggerRefresh = useAppStore((s) => s.triggerRefresh);

  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(0);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [category, setCategory] = useState<Pick<Category, 'id' | 'name' | 'icon' | 'color'> | null>(null);
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [dayOfMonth, setDayOfMonth] = useState(new Date().getDate() > 28 ? 28 : new Date().getDate());
  const [dayOfWeek, setDayOfWeek] = useState(new Date().getDay());
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState<string | null>(null);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const [showAmount, setShowAmount] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showCategory, setShowCategory] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const [showDayOfMonth, setShowDayOfMonth] = useState(false);
  const [showStartDate, setShowStartDate] = useState(false);
  const [showEndDate, setShowEndDate] = useState(false);

  // Carga la regla al editar (busca en la lista; no hay GET por id).
  useEffect(() => {
    if (!ruleId) return;
    (async () => {
      try {
        const rules = await recurringApi.list();
        const r = rules.find((x) => x.id === ruleId);
        if (!r) {
          showError('Regla no encontrada');
          return;
        }
        setType(r.type);
        setDescription(r.description ?? '');
        setAmount(Number(r.amount));
        setAccountId(r.accountId);
        setCategory(
          r.categoryId != null
            ? {
                id: r.categoryId,
                name: r.categoryName ?? 'Categoría',
                icon: r.categoryIcon ?? 'shapes',
                color: r.categoryColor ?? theme.colors.primary,
              }
            : null,
        );
        setFrequency(r.frequency);
        // Preserva el día real (puede ser 29-31 si la regla se creó por API): el
        // DayPickerSheet solo limita la SELECCIÓN manual a 1-28, pero si el usuario
        // no toca el campo se reenvía el valor original (sin mutarlo en silencio).
        if (r.dayOfMonth != null) setDayOfMonth(r.dayOfMonth);
        if (r.dayOfWeek != null) setDayOfWeek(r.dayOfWeek);
        setStartDate(r.startDate);
        setEndDate(r.endDate);
        setTagIds((r.tags ?? []).map((t) => t.id));
      } catch (err) {
        showError(getErrorMessage(err));
      }
    })();
  }, [ruleId, theme.colors.primary]);

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const isCard = selectedAccount?.type === 'credit_card';
  // En una tarjeta de crédito no hay ingresos (C1): fuerza "Gasto".
  const effectiveType: 'expense' | 'income' = isCard ? 'expense' : type;
  const semanticColor = effectiveType === 'expense' ? theme.colors.expense : theme.colors.income;

  const selectAccount = (id: number) => {
    setAccountId(id);
    const acc = accounts.find((a) => a.id === id);
    if (acc?.type === 'credit_card' && type === 'income') {
      setType('expense');
      setCategory(null); // la categoría de ingreso ya no aplica
    }
    setShowAccount(false);
  };

  const changeType = (t: 'expense' | 'income') => {
    if (t === type) return;
    setType(t);
    setCategory(null); // la categoría depende del tipo (income/expense)
  };

  const toggleTag = (tag: Tag) => {
    setTagIds((prev) => (prev.includes(tag.id) ? prev.filter((id) => id !== tag.id) : [...prev, tag.id]));
  };

  const save = async () => {
    if (accountId == null) {
      showError('Elige una cuenta');
      return;
    }
    if (amount <= 0) {
      showError('Define el monto');
      return;
    }
    if (endDate && endDate < startDate) {
      showError('La fecha de fin no puede ser anterior a la de inicio');
      return;
    }
    const input = {
      accountId,
      type: effectiveType,
      amount,
      description: description.trim() || null,
      categoryId: category?.id ?? null,
      frequency,
      dayOfMonth: frequency === 'monthly' || frequency === 'yearly' ? dayOfMonth : null,
      dayOfWeek: frequency === 'weekly' || frequency === 'biweekly' ? dayOfWeek : null,
      startDate,
      endDate,
      tagIds,
    };
    try {
      setSaving(true);
      if (ruleId) {
        await recurringApi.update(ruleId, input);
        showSuccess('Regla actualizada');
      } else {
        await recurringApi.create(input);
        showSuccess('Regla creada');
      }
      triggerRefresh();
      navigation.goBack();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const showDayOfMonthField = frequency === 'monthly' || frequency === 'yearly';
  const showDayOfWeekField = frequency === 'weekly' || frequency === 'biweekly';

  return (
    <Screen>
      <ScreenHeader
        title={ruleId ? 'Editar pago recurrente' : 'Nuevo pago recurrente'}
        onBack={() => navigation.goBack()}
      />
      <FormScrollView contentContainerStyle={styles.content}>
        {/* Tipo: Gasto / Ingreso (Ingreso oculto si la cuenta es tarjeta) */}
        {!isCard && (
          <View style={styles.toggle}>
            {(
              [
                { key: 'expense', label: 'Gasto', color: theme.colors.expense },
                { key: 'income', label: 'Ingreso', color: theme.colors.income },
              ] as const
            ).map((t) => (
              <Pressable
                key={t.key}
                style={[styles.toggleBtn, type === t.key && { backgroundColor: t.color }]}
                onPress={() => changeType(t.key)}
              >
                <Text style={[styles.toggleText, type === t.key && styles.toggleTextActive]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <TextField
          label="Descripción"
          value={description}
          onChangeText={setDescription}
          placeholder="Ej: Netflix, Salario, Cuota de manejo"
          maxLength={255}
        />

        <SelectRow
          label="Monto"
          value={amount > 0 ? formatCurrency(amount) : null}
          placeholder="Toca para ingresar el monto"
          icon="calculator"
          iconColor={semanticColor}
          onPress={() => setShowAmount(true)}
        />

        <SelectRow
          label="Cuenta"
          value={selectedAccount?.name ?? null}
          placeholder="Elige una cuenta"
          icon={selectedAccount?.icon ?? 'wallet'}
          iconColor={selectedAccount?.color ?? theme.colors.primary}
          onPress={() => setShowAccount(true)}
        />

        <SelectRow
          label="Categoría (opcional)"
          value={category?.name ?? null}
          placeholder="Sin categoría"
          icon={category?.icon ?? 'shapes'}
          iconColor={category?.color ?? theme.colors.accentLight}
          onPress={() => setShowCategory(true)}
        />
        {category && (
          <Pressable style={styles.clearRow} onPress={() => setCategory(null)}>
            <Icon name="x" size={14} color={theme.colors.expense} />
            <Text style={styles.clearText}>Quitar categoría</Text>
          </Pressable>
        )}

        {/* Frecuencia */}
        <Text style={styles.fieldLabel}>Frecuencia</Text>
        <View style={styles.freqRow}>
          {FREQS.map((f) => (
            <Pressable
              key={f.key}
              style={[styles.freqChip, frequency === f.key && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]}
              onPress={() => setFrequency(f.key)}
            >
              <Text style={[styles.freqText, frequency === f.key && styles.freqTextActive]}>{f.label}</Text>
            </Pressable>
          ))}
        </View>

        {showDayOfWeekField && (
          <>
            <Text style={styles.fieldLabel}>Día de la semana</Text>
            <View style={styles.dowRow}>
              {DOW_SHORT.map((d, i) => (
                <Pressable
                  key={i}
                  style={[styles.dowChip, dayOfWeek === i && { backgroundColor: theme.colors.secondary, borderColor: theme.colors.secondary }]}
                  onPress={() => setDayOfWeek(i)}
                >
                  <Text style={[styles.dowText, dayOfWeek === i && styles.dowTextActive]}>{d}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {showDayOfMonthField && (
          <SelectRow
            label="Día del mes"
            value={`Día ${dayOfMonth}`}
            icon="calendar-days"
            iconColor={theme.colors.secondary}
            onPress={() => setShowDayOfMonth(true)}
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
          label="Fecha de fin (opcional)"
          value={endDate ? formatShortDate(endDate) : null}
          placeholder="Sin fecha de fin (indefinida)"
          icon="calendar-clock"
          iconColor={theme.colors.accentLight}
          onPress={() => setShowEndDate(true)}
        />
        {endDate && (
          <Pressable style={styles.clearRow} onPress={() => setEndDate(null)}>
            <Icon name="x" size={14} color={theme.colors.expense} />
            <Text style={styles.clearText}>Quitar fecha de fin</Text>
          </Pressable>
        )}

        <SelectRow
          label="Etiquetas (opcional)"
          value={tagIds.length > 0 ? `${tagIds.length} seleccionada(s)` : null}
          placeholder="Sin etiquetas"
          icon="tag"
          iconColor={theme.colors.secondary}
          onPress={() => setShowTags(true)}
        />

        <PrimaryButton
          label={ruleId ? 'Guardar cambios' : 'Crear regla'}
          onPress={save}
          loading={saving}
          icon="repeat"
        />
      </FormScrollView>

      <CalculatorSheet
        visible={showAmount}
        title="Monto"
        type={effectiveType}
        initialValue={amount}
        onConfirm={(v) => {
          if (v > 0) setAmount(v);
          setShowAmount(false);
        }}
        onClose={() => setShowAmount(false)}
      />
      <AccountPicker
        visible={showAccount}
        accounts={accounts}
        title="Cuenta"
        onSelect={(a) => selectAccount(a.id)}
        onClose={() => setShowAccount(false)}
      />
      <CategoryPicker
        visible={showCategory}
        type={effectiveType}
        onSelect={(c) => {
          setCategory({ id: c.id, name: c.name, icon: c.icon, color: c.color });
          setShowCategory(false);
        }}
        onClose={() => setShowCategory(false)}
      />
      <TagPicker
        visible={showTags}
        selectedIds={tagIds}
        onToggle={toggleTag}
        onClose={() => setShowTags(false)}
      />
      <DayPickerSheet
        visible={showDayOfMonth}
        title="Día del mes"
        value={dayOfMonth}
        onConfirm={(d) => {
          setDayOfMonth(d);
          setShowDayOfMonth(false);
        }}
        onClose={() => setShowDayOfMonth(false)}
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
        visible={showEndDate}
        initialFrom={endDate ? parseISOSafe(endDate) : undefined}
        onConfirm={({ from }) => {
          setEndDate(from);
          setShowEndDate(false);
        }}
        onClose={() => setShowEndDate(false)}
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
    freqRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginBottom: theme.spacing.md },
    freqChip: {
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.surfaceLight,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    freqText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium },
    freqTextActive: { color: '#FFFFFF', fontWeight: theme.fontWeight.bold },
    dowRow: { flexDirection: 'row', gap: theme.spacing.xs, marginBottom: theme.spacing.md },
    dowChip: {
      flex: 1,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.surfaceLight,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'center',
    },
    dowText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium },
    dowTextActive: { color: '#FFFFFF', fontWeight: theme.fontWeight.bold },
    clearRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
      marginTop: -theme.spacing.sm,
      marginBottom: theme.spacing.md,
    },
    clearText: { color: theme.colors.expense, fontSize: theme.fontSize.sm },
  });
