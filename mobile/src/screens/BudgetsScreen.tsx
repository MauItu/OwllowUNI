import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch, RefreshControl, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, EmptyState, ErrorState, Loading, PrimaryButton, SelectRow } from '../components/common';
import { Icon } from '../components/Icon';
import { CategoryPicker } from '../components/CategoryPicker';
import { CalculatorSheet } from '../components/CalculatorSheet';
import { BottomSheet } from '../components/BottomSheet';
import { useBudgets } from '../hooks/useBudgets';
import { useAppStore } from '../stores/appStore';
import { useSettingsStore } from '../stores/settingsStore';
import { budgetsApi, getErrorMessage } from '../api/client';
import { showError, showSuccess } from '../components/toastConfig';
import { formatCurrency } from '../utils/formatCurrency';
import type { Budget, BudgetHistoryMonth, Category } from '../types';

/** Amarillo de advertencia (el theme no tiene un amarillo dedicado). */
const AMBER = '#F59E0B';

/** Color de la barra/porcentaje según el % de gasto. */
function progressColor(theme: Theme, pct: number): string {
  if (pct > 100) return theme.colors.expense;
  if (pct >= 80) return AMBER;
  return theme.colors.income;
}

/** Nombre de mes legible en español a partir de 'YYYY-MM'. */
function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  const s = d.toLocaleDateString('es', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function BudgetsScreen() {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const currency = useSettingsStore((s) => s.mainCurrency);
  const triggerRefresh = useAppStore((s) => s.triggerRefresh);
  const { budgets, summary, history, loading, refreshing, error, refetch } = useBudgets();

  const [tab, setTab] = useState<'budgets' | 'history'>('budgets');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Budget | null>(null);

  const activeBudgets = useMemo(() => budgets.filter((b) => b.isActive), [budgets]);

  const openCreate = () => {
    setEditing(null);
    setShowForm(true);
  };
  const openEdit = (b: Budget) => {
    setEditing(b);
    setShowForm(true);
  };

  const onSaved = () => {
    setShowForm(false);
    setEditing(null);
    triggerRefresh();
    refetch(true);
  };

  const onDelete = async (id: number) => {
    try {
      await budgetsApi.remove(id);
      showSuccess('Presupuesto eliminado');
      onSaved();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  return (
    <Screen>
      <ScreenHeader
        title="Presupuestos"
        onBack={() => navigation.goBack()}
        right={
          <Pressable hitSlop={10} onPress={openCreate}>
            <Icon name="plus" size={24} color={theme.colors.onHeader} strokeWidth={2.4} />
          </Pressable>
        }
      />

      {/* Toggle Presupuestos / Historial */}
      <View style={styles.toggle}>
        {(
          [
            { key: 'budgets', label: 'Presupuestos' },
            { key: 'history', label: 'Historial' },
          ] as const
        ).map((t) => (
          <Pressable
            key={t.key}
            style={[styles.toggleBtn, tab === t.key && { backgroundColor: theme.colors.primary }]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.toggleText, tab === t.key && styles.toggleTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {loading && budgets.length === 0 ? (
        <Loading />
      ) : error && budgets.length === 0 ? (
        <ErrorState message={error} onRetry={() => refetch()} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => refetch(true)} tintColor={theme.colors.primary} />
          }
        >
          {tab === 'budgets' ? (
            <>
              {summary && activeBudgets.length > 0 && (
                <LinearGradient
                  colors={theme.gradients.balance}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.summaryCard}
                >
                  <Text style={styles.summaryLabel}>Restante este mes</Text>
                  <Text style={styles.summaryAmount}>{formatCurrency(summary.totalRemaining, currency)}</Text>
                  <View style={styles.summaryRow}>
                    <View style={styles.summaryItem}>
                      <Text style={styles.summaryItemLabel}>Presupuestado</Text>
                      <Text style={styles.summaryItemValue}>{formatCurrency(summary.totalBudgeted, currency)}</Text>
                    </View>
                    <View style={styles.summaryItem}>
                      <Text style={styles.summaryItemLabel}>Gastado</Text>
                      <Text style={styles.summaryItemValue}>{formatCurrency(summary.totalSpent, currency)}</Text>
                    </View>
                  </View>
                  {summary.overBudgetCount > 0 && (
                    <View style={styles.overPill}>
                      <Icon name="triangle-alert" size={14} color="#FFFFFF" />
                      <Text style={styles.overPillText}>
                        {summary.overBudgetCount} excedido{summary.overBudgetCount === 1 ? '' : 's'}
                      </Text>
                    </View>
                  )}
                </LinearGradient>
              )}

              {activeBudgets.length === 0 ? (
                <EmptyState
                  icon="pie-chart"
                  text="No tienes presupuestos. Crea uno para controlar tus gastos del mes."
                />
              ) : (
                activeBudgets.map((b) => (
                  <BudgetCard key={b.id} budget={b} currency={currency} onPress={() => openEdit(b)} />
                ))
              )}

              {activeBudgets.length === 0 && (
                <View style={{ marginTop: theme.spacing.md }}>
                  <PrimaryButton label="Crear primer presupuesto" icon="plus" onPress={openCreate} />
                </View>
              )}
            </>
          ) : (
            <HistoryList history={history} currency={currency} />
          )}
        </ScrollView>
      )}

      <BudgetFormSheet
        visible={showForm}
        editing={editing}
        budgets={budgets}
        currency={currency}
        onClose={() => {
          setShowForm(false);
          setEditing(null);
        }}
        onSaved={onSaved}
        onDelete={onDelete}
      />
    </Screen>
  );
}

// ───────────────────────────── Budget card ─────────────────────────────

function BudgetCard({ budget, currency, onPress }: { budget: Budget; currency: string; onPress: () => void }) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const color = progressColor(theme, budget.percentage);
  const isGlobal = budget.categoryId == null;
  const name = isGlobal ? 'Presupuesto Global' : budget.categoryName ?? 'Categoría';
  const icon = isGlobal ? 'wallet' : budget.categoryIcon ?? 'shapes';
  const iconColor = isGlobal ? theme.colors.primary : budget.categoryColor ?? theme.colors.primary;
  const width = `${Math.min(100, Math.max(0, budget.percentage))}%` as const;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: theme.colors.surfaceLight }]}
    >
      <View style={styles.cardTop}>
        <View style={[styles.cardIcon, { backgroundColor: `${iconColor}22` }]}>
          <Icon name={icon} size={20} color={iconColor} />
        </View>
        <Text style={styles.cardName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[styles.cardPct, { color }]}>{Math.round(budget.percentage)}%</Text>
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width, backgroundColor: color }]} />
      </View>

      <Text style={styles.cardAmounts}>
        {formatCurrency(budget.spent, currency)} / {formatCurrency(budget.amount, currency)}
      </Text>
    </Pressable>
  );
}

// ──────────────────────────── History list ─────────────────────────────

function HistoryList({ history, currency }: { history: BudgetHistoryMonth[]; currency: string }) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [expanded, setExpanded] = useState<string | null>(null);

  const withBudgets = history.filter((h) => h.summary.totalBudgets > 0);
  if (withBudgets.length === 0) {
    return <EmptyState icon="calendar" text="Aún no hay historial de cumplimiento. Crea presupuestos para empezar a medir." />;
  }

  return (
    <View>
      {withBudgets.map((h) => {
        const isOpen = expanded === h.month;
        const rate = Math.round(h.summary.complianceRate);
        const rateColor = rate >= 100 ? theme.colors.income : rate >= 50 ? AMBER : theme.colors.expense;
        return (
          <View key={h.month} style={styles.histCard}>
            <Pressable style={styles.histHeader} onPress={() => setExpanded(isOpen ? null : h.month)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.histMonth}>{monthLabel(h.month)}</Text>
                <Text style={styles.histMeta}>
                  {h.summary.totalMet} de {h.summary.totalBudgets} presupuestos cumplidos
                </Text>
              </View>
              <Text style={[styles.histRate, { color: rateColor }]}>{rate}%</Text>
              <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} size={18} color={theme.colors.textMuted} />
            </Pressable>

            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.min(100, rate)}%`, backgroundColor: rateColor }]} />
            </View>

            {isOpen && (
              <View style={styles.histDetail}>
                {h.budgets.map((it, idx) => (
                  <View key={`${it.categoryId ?? 'global'}-${idx}`} style={styles.histRow}>
                    <Icon
                      name={it.met ? 'circle-check' : 'circle-x'}
                      size={16}
                      color={it.met ? theme.colors.income : theme.colors.expense}
                    />
                    <Text style={styles.histRowName} numberOfLines={1}>
                      {it.categoryId == null ? 'Global' : it.categoryName ?? 'Categoría'}
                    </Text>
                    <Text style={styles.histRowAmt}>
                      {formatCurrency(it.spent, currency)} / {formatCurrency(it.amount, currency)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ─────────────────────────── Add / edit sheet ──────────────────────────

function BudgetFormSheet({
  visible,
  editing,
  budgets,
  currency,
  onClose,
  onSaved,
  onDelete,
}: {
  visible: boolean;
  editing: Budget | null;
  budgets: Budget[];
  currency: string;
  onClose: () => void;
  onSaved: () => void;
  onDelete: (id: number) => void;
}) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [isGlobal, setIsGlobal] = useState(false);
  const [category, setCategory] = useState<Category | null>(null);
  const [amount, setAmount] = useState(0);
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const [saving, setSaving] = useState(false);

  const isEdit = editing != null;

  // Resetea el formulario cada vez que se abre.
  useEffect(() => {
    if (!visible) return;
    if (editing) {
      setIsGlobal(editing.categoryId == null);
      setCategory(null);
      setAmount(editing.amount);
    } else {
      setIsGlobal(false);
      setCategory(null);
      setAmount(0);
    }
  }, [visible, editing]);

  const editName = editing?.categoryId == null ? 'Presupuesto Global' : editing?.categoryName ?? 'Categoría';

  /**
   * Valida la invariante categoría↔global antes de guardar (feedback inmediato;
   * el backend la revalida). Devuelve el mensaje de error o null si todo OK.
   */
  const validateAmount = (): string | null => {
    const editingId = editing?.id;
    const editingGlobal = isEdit ? editing!.categoryId == null : isGlobal;
    // Presupuestos de categoría existentes (excluyendo el que se edita).
    const catBudgets = budgets.filter((b) => b.categoryId != null && b.id !== editingId);

    if (editingGlobal) {
      const catSum = catBudgets.reduce((s, b) => s + b.amount, 0);
      if (catSum > amount) {
        return `El presupuesto global no puede ser menor a la suma de presupuestos por categoría (${formatCurrency(catSum, currency)})`;
      }
      return null;
    }

    // Presupuesto de categoría: requiere un global y no puede excederlo.
    const global = budgets.find((b) => b.categoryId == null && b.id !== editingId);
    if (!global) {
      return 'Primero crea un presupuesto global antes de crear presupuestos por categoría';
    }
    if (amount > global.amount) {
      return 'El presupuesto de categoría no puede ser mayor al presupuesto global';
    }
    const newSum = catBudgets.reduce((s, b) => s + b.amount, 0) + amount;
    if (newSum > global.amount) {
      return `La suma de presupuestos por categoría (${formatCurrency(newSum, currency)}) excedería el presupuesto global (${formatCurrency(global.amount, currency)})`;
    }
    return null;
  };

  const save = async () => {
    if (amount <= 0) {
      showError('Ingresa un monto mayor a 0');
      return;
    }
    if (!isEdit && !isGlobal && !category) {
      showError('Selecciona una categoría o activa "Presupuesto global"');
      return;
    }
    const validationError = validateAmount();
    if (validationError) {
      showError(validationError);
      return;
    }
    try {
      setSaving(true);
      if (isEdit && editing) {
        await budgetsApi.update(editing.id, { amount });
      } else {
        await budgetsApi.create({ amount, categoryId: isGlobal ? null : category!.id });
      }
      showSuccess(isEdit ? 'Presupuesto actualizado' : 'Presupuesto creado');
      onSaved();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <BottomSheet visible={visible} title={isEdit ? 'Editar presupuesto' : 'Nuevo presupuesto'} onClose={onClose}>
        {isEdit ? (
          <View style={styles.formCategoryFixed}>
            <Icon
              name={editing?.categoryId == null ? 'wallet' : editing?.categoryIcon ?? 'shapes'}
              size={20}
              color={editing?.categoryColor ?? theme.colors.primary}
            />
            <Text style={styles.formCategoryName}>{editName}</Text>
          </View>
        ) : (
          <>
            <View style={styles.globalRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.globalLabel}>Presupuesto global</Text>
                <Text style={styles.globalHint}>Límite de gasto total del mes (sin categoría)</Text>
              </View>
              <Switch
                value={isGlobal}
                onValueChange={setIsGlobal}
                trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                thumbColor="#FFFFFF"
              />
            </View>

            {!isGlobal && (
              <SelectRow
                label="Categoría"
                value={category?.name}
                placeholder="Selecciona una categoría"
                icon={category?.icon}
                iconColor={category?.color}
                onPress={() => setShowCatPicker(true)}
              />
            )}
          </>
        )}

        <SelectRow
          label="Monto mensual"
          value={amount > 0 ? formatCurrency(amount, currency) : undefined}
          placeholder="Toca para ingresar"
          icon="calculator"
          onPress={() => setShowCalc(true)}
        />

        <View style={{ marginTop: theme.spacing.sm }}>
          <PrimaryButton label={isEdit ? 'Guardar cambios' : 'Crear presupuesto'} onPress={save} loading={saving} />
        </View>

        {isEdit && editing && (
          <Pressable style={styles.deleteBtn} onPress={() => onDelete(editing.id)}>
            <Icon name="trash-2" size={18} color={theme.colors.expense} />
            <Text style={styles.deleteText}>Eliminar presupuesto</Text>
          </Pressable>
        )}
      </BottomSheet>

      <CategoryPicker
        visible={showCatPicker}
        type="expense"
        onSelect={(c) => {
          setCategory(c);
          setShowCatPicker(false);
        }}
        onClose={() => setShowCatPicker(false)}
      />

      <CalculatorSheet
        visible={showCalc}
        title="Monto mensual"
        type="expense"
        initialValue={amount}
        currency={currency}
        onConfirm={(v) => {
          setAmount(v);
          setShowCalc(false);
        }}
        onClose={() => setShowCalc(false)}
      />
    </>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    list: { padding: theme.spacing.lg, paddingTop: theme.spacing.sm },
    toggle: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
      paddingHorizontal: theme.spacing.lg,
      marginBottom: theme.spacing.sm,
    },
    toggleBtn: {
      flex: 1,
      paddingVertical: theme.spacing.sm + 2,
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.surfaceLight,
      alignItems: 'center',
    },
    toggleText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium },
    toggleTextActive: { color: '#FFFFFF', fontWeight: theme.fontWeight.bold },

    summaryCard: { borderRadius: theme.borderRadius.lg, padding: theme.spacing.lg, marginBottom: theme.spacing.md, gap: theme.spacing.xs },
    summaryLabel: { color: theme.colors.onHeaderMuted, fontSize: theme.fontSize.sm },
    summaryAmount: { color: theme.colors.onHeader, fontSize: theme.fontSize.xxl, fontWeight: theme.fontWeight.bold },
    summaryRow: { flexDirection: 'row', gap: theme.spacing.lg, marginTop: theme.spacing.sm },
    summaryItem: { gap: 2 },
    summaryItemLabel: { color: theme.colors.onHeaderMuted, fontSize: theme.fontSize.xs },
    summaryItemValue: { color: theme.colors.onHeader, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold },
    overPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
      alignSelf: 'flex-start',
      backgroundColor: 'rgba(0,0,0,0.25)',
      borderRadius: theme.borderRadius.full,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 5,
      marginTop: theme.spacing.sm,
    },
    overPillText: { color: '#FFFFFF', fontSize: theme.fontSize.xs, fontWeight: theme.fontWeight.semibold },

    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.md,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
      gap: theme.spacing.sm,
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
    cardIcon: { width: 38, height: 38, borderRadius: theme.borderRadius.full, alignItems: 'center', justifyContent: 'center' },
    cardName: { flex: 1, color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold },
    cardPct: { fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.bold },
    track: { height: 8, borderRadius: 4, backgroundColor: theme.colors.surfaceAccent, overflow: 'hidden' },
    fill: { height: '100%', borderRadius: 4 },
    cardAmounts: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm },

    histCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.md,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
      gap: theme.spacing.sm,
    },
    histHeader: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
    histMonth: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold },
    histMeta: { color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, marginTop: 2 },
    histRate: { fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.bold },
    histDetail: { gap: theme.spacing.sm, marginTop: theme.spacing.xs },
    histRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
    histRowName: { flex: 1, color: theme.colors.text, fontSize: theme.fontSize.sm },
    histRowAmt: { color: theme.colors.textSecondary, fontSize: theme.fontSize.xs },

    globalRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.md },
    globalLabel: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.medium },
    globalHint: { color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, marginTop: 2 },
    formCategoryFixed: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      backgroundColor: theme.colors.surfaceLight,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.md,
    },
    formCategoryName: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold },
    deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.md, marginTop: theme.spacing.xs },
    deleteText: { color: theme.colors.expense, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold },
  });
