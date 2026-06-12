import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, RefreshControl, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, Loading, ErrorState, PrimaryButton } from '../components/common';
import { BottomSheet } from '../components/BottomSheet';
import { Icon } from '../components/Icon';
import { ratesApi, getErrorMessage } from '../api/client';
import { showError, showSuccess } from '../components/toastConfig';
import { useSettingsStore } from '../stores/settingsStore';
import { CURRENCIES, currencyInfo } from '../utils/currencies';
import { formatCurrency } from '../utils/formatCurrency';
import type { RateResult } from '../types';

export function RatesScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const base = useSettingsStore((s) => s.mainCurrency);

  const targets = CURRENCIES.map((c) => c.code).filter((c) => c !== base);

  const [rates, setRates] = useState<RateResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edición de tasa manual
  const [editing, setEditing] = useState<RateResult | null>(null);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    async (force = false) => {
      try {
        if (force) setRefreshing(true);
        else setLoading(true);
        setError(null);
        const res = await ratesApi.list(base, targets, force);
        setRates(res.rates);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base],
  );

  useEffect(() => {
    load();
  }, [load]);

  // En el editor el usuario piensa en "1 <target> = X <base>" (inverso de base→target).
  const perUnit = (r: RateResult) => (r.rate && r.rate > 0 ? 1 / r.rate : null);

  const openEdit = (r: RateResult) => {
    const pu = perUnit(r);
    setInput(pu != null ? String(Math.round(pu * 100) / 100) : '');
    setEditing(r);
  };

  const saveManual = async () => {
    if (!editing) return;
    const value = parseFloat(input.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      showError('Ingresa una tasa válida (> 0)');
      return;
    }
    try {
      setSaving(true);
      // input = cuántos `base` por 1 `target` → base→target = 1/input
      await ratesApi.setManual({ base, target: editing.target, rate: 1 / value });
      showSuccess('Tasa manual guardada');
      setEditing(null);
      await load();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const useAuto = async () => {
    if (!editing) return;
    try {
      setSaving(true);
      await ratesApi.removeManual(base, editing.target);
      showSuccess('Volviendo a tasa automática');
      setEditing(null);
      await load(true);
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader
        title="Tasas de cambio"
        subtitle={`Base: ${base}`}
        onBack={() => navigation.goBack()}
        right={
          <Pressable onPress={() => load(true)} hitSlop={10}>
            <Icon name="refresh-cw" size={20} color="#FFFFFF" />
          </Pressable>
        }
      />

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} onRetry={() => load()} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + theme.spacing.xl }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.colors.primary} />
          }
        >
          <Text style={styles.hint}>
            Toca una moneda para fijar una tasa manual. Las manuales no se sobreescriben al actualizar.
          </Text>

          {rates.map((r) => {
            const info = currencyInfo(r.target);
            const pu = perUnit(r);
            return (
              <Pressable
                key={r.target}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
                onPress={() => openEdit(r)}
              >
                <View style={styles.symbolWrap}>
                  <Text style={styles.symbol}>{info?.symbol ?? r.target}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.code}>{r.target}</Text>
                  <Text style={styles.name}>{info?.name ?? ''}</Text>
                </View>
                <View style={styles.rateBox}>
                  {pu != null ? (
                    <Text style={styles.rateValue}>
                      1 {r.target} = {formatCurrency(pu, base)}
                    </Text>
                  ) : (
                    <Text style={[styles.rateValue, { color: theme.colors.expense }]}>Sin tasa</Text>
                  )}
                  <View style={styles.badges}>
                    {r.isManual && (
                      <View style={[styles.badge, { backgroundColor: `${theme.colors.accent}22` }]}>
                        <Text style={[styles.badgeText, { color: theme.colors.accentLight }]}>Manual</Text>
                      </View>
                    )}
                    {r.stale && !r.isManual && (
                      <View style={[styles.badge, { backgroundColor: `${theme.colors.expense}22` }]}>
                        <Text style={[styles.badgeText, { color: theme.colors.expense }]}>Desactualizada</Text>
                      </View>
                    )}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <BottomSheet
        visible={editing != null}
        title={editing ? `Tasa manual · ${editing.target}` : ''}
        onClose={() => setEditing(null)}
        maxHeight="60%"
      >
        {editing && (
          <View style={{ gap: theme.spacing.md }}>
            <Text style={styles.sheetLabel}>¿Cuántos {base} equivalen a 1 {editing.target}?</Text>
            <View style={styles.inputRow}>
              <Text style={styles.inputPrefix}>1 {editing.target} =</Text>
              <TextInput
                value={input}
                onChangeText={setInput}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.input}
                autoFocus
              />
              <Text style={styles.inputSuffix}>{base}</Text>
            </View>
            <PrimaryButton label="Guardar tasa manual" icon="check" onPress={saveManual} loading={saving} />
            {editing.isManual && (
              <Pressable style={styles.autoBtn} onPress={useAuto} disabled={saving}>
                <Icon name="refresh-cw" size={16} color={theme.colors.secondary} />
                <Text style={styles.autoBtnText}>Volver a tasa automática</Text>
              </Pressable>
            )}
          </View>
        )}
      </BottomSheet>
    </Screen>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { padding: theme.spacing.lg },
    hint: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginBottom: theme.spacing.md },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
    },
    symbolWrap: {
      width: 44,
      height: 44,
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.surfaceLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    symbol: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.bold },
    code: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold },
    name: { color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, marginTop: 1 },
    rateBox: { alignItems: 'flex-end', gap: 4 },
    rateValue: { color: theme.colors.text, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold },
    badges: { flexDirection: 'row', gap: theme.spacing.xs },
    badge: { paddingHorizontal: theme.spacing.sm, paddingVertical: 2, borderRadius: theme.borderRadius.full },
    badgeText: { fontSize: theme.fontSize.xs, fontWeight: theme.fontWeight.bold },
    sheetLabel: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      backgroundColor: theme.colors.surfaceLight,
      borderRadius: theme.borderRadius.md,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    inputPrefix: { color: theme.colors.textSecondary, fontSize: theme.fontSize.md },
    input: { flex: 1, color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: theme.fontWeight.semibold },
    inputSuffix: { color: theme.colors.textSecondary, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold },
    autoBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.sm },
    autoBtnText: { color: theme.colors.secondary, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold },
  });
