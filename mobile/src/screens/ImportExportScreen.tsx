import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import {
  Screen,
  ScreenHeader,
  SectionTitle,
  PrimaryButton,
  SelectRow,
  EmptyState,
} from '../components/common';
import { Icon } from '../components/Icon';
import { AccountChips } from '../components/AccountChips';
import { DateRangePicker } from '../components/DateRangePicker';
import { CategoryPicker } from '../components/CategoryPicker';
import { useAccounts } from '../hooks/useAccounts';
import { useAppStore } from '../stores/appStore';
import { importExportApi, getErrorMessage } from '../api/client';
import { showError, showInfo, showSuccess } from '../components/toastConfig';
import { csvToImportRows, type ImportRow } from '../utils/csv';
import { formatShortDate, todayISO } from '../utils/formatDate';
import { formatCurrency } from '../utils/formatCurrency';
import type { Category, ExportFilters, ExportFormat, ImportResult, TxType } from '../types';

const TYPE_FILTERS: { key: TxType | 'all'; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'expense', label: 'Gastos' },
  { key: 'income', label: 'Ingresos' },
  { key: 'transfer', label: 'Transferencias' },
];

const TYPE_LABELS: Record<string, string> = {
  income: 'Ingreso',
  expense: 'Gasto',
  transfer: 'Transferencia',
  Ingreso: 'Ingreso',
  Gasto: 'Gasto',
  Transferencia: 'Transferencia',
};

const PREVIEW_LIMIT = 10;

export function ImportExportScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { accounts } = useAccounts();
  const triggerRefresh = useAppStore((s) => s.triggerRefresh);

  // ── Estado de exportación ──
  const [typeFilter, setTypeFilter] = useState<TxType | 'all'>('all');
  const [accountId, setAccountId] = useState<number | null>(null);
  const [range, setRange] = useState<{ from?: string; to?: string }>({});
  const [category, setCategory] = useState<Category | null>(null);
  const [showDate, setShowDate] = useState(false);
  const [showCategory, setShowCategory] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  // ── Estado de importación ──
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const chipTrio = [theme.colors.primary, theme.colors.secondary, theme.colors.accent];
  // La categoría es por tipo; usamos el tipo del filtro (income/expense) o gasto por defecto.
  const categoryType = typeFilter === 'income' ? 'income' : 'expense';

  const exportFilters: ExportFilters = useMemo(
    () => ({
      from: range.from,
      to: range.to,
      accountId: accountId ?? undefined,
      categoryId: category?.id,
      type: typeFilter === 'all' ? undefined : typeFilter,
    }),
    [range, accountId, category, typeFilter],
  );

  const doExport = async (format: ExportFormat) => {
    try {
      setExporting(format);
      const content = await importExportApi.export(format, exportFilters);
      const filename = `transacciones-${todayISO()}.${format}`;
      const uri = (FileSystem.cacheDirectory ?? '') + filename;
      await FileSystem.writeAsStringAsync(uri, content, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (!(await Sharing.isAvailableAsync())) {
        showError('Compartir no está disponible en este dispositivo');
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: format === 'csv' ? 'text/csv' : 'application/json',
        dialogTitle: 'Exportar transacciones',
        UTI: format === 'csv' ? 'public.comma-separated-values-text' : 'public.json',
      });
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setExporting(null);
    }
  };

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv',
          'text/comma-separated-values',
          'application/csv',
          'application/vnd.ms-excel',
          'text/plain',
          '*/*',
        ],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const content = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const rows = csvToImportRows(content);
      setFileName(asset.name);
      setParsedRows(rows);
      setResult(null);
      if (rows.length === 0) showInfo('El archivo no tiene filas para importar');
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  const doImport = async () => {
    if (parsedRows.length === 0) return;
    try {
      setImporting(true);
      const res = await importExportApi.import(parsedRows);
      setResult(res);
      if (res.imported > 0) {
        triggerRefresh();
        showSuccess(`${res.imported} transacción(es) importada(s)`);
      } else {
        showInfo('No se importó ninguna transacción');
      }
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setImporting(false);
    }
  };

  const clearImport = () => {
    setFileName(null);
    setParsedRows([]);
    setResult(null);
  };

  return (
    <Screen>
      <ScreenHeader title="Importar / Exportar" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + theme.spacing.xl }]}>
        {/* ─────────────── EXPORTAR ─────────────── */}
        <SectionTitle title="Exportar" />
        <Text style={styles.hint}>
          Genera un archivo con tus movimientos según los filtros. El CSV se puede volver a importar.
        </Text>

        <Text style={styles.label}>Tipo</Text>
        <View style={styles.chipsRow}>
          {TYPE_FILTERS.map((f, i) => (
            <Pressable
              key={f.key}
              style={[styles.chip, typeFilter === f.key && { backgroundColor: chipTrio[i % 3] }]}
              onPress={() => setTypeFilter(f.key)}
            >
              <Text style={[styles.chipText, typeFilter === f.key && styles.chipTextActive]}>{f.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Cuenta</Text>
        <AccountChips accounts={accounts} selectedId={accountId} onSelect={setAccountId} allowNone noneLabel="Todas" />

        <View style={styles.rowGap}>
          <SelectRow
            label="Rango de fechas"
            icon="calendar"
            value={range.from ? `${formatShortDate(range.from)} → ${formatShortDate(range.to ?? range.from)}` : null}
            placeholder="Todas las fechas"
            onPress={() => setShowDate(true)}
          />
          {range.from != null && (
            <Pressable style={styles.clearLink} onPress={() => setRange({})} hitSlop={8}>
              <Icon name="x" size={14} color={theme.colors.expense} />
              <Text style={styles.clearLinkText}>Quitar rango de fechas</Text>
            </Pressable>
          )}
          <SelectRow
            label="Categoría"
            icon={category?.icon ?? 'shapes'}
            iconColor={category?.color}
            value={category?.name ?? null}
            placeholder="Todas las categorías"
            onPress={() => setShowCategory(true)}
          />
          {category != null && (
            <Pressable style={styles.clearLink} onPress={() => setCategory(null)} hitSlop={8}>
              <Icon name="x" size={14} color={theme.colors.expense} />
              <Text style={styles.clearLinkText}>Quitar categoría</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.exportButtons}>
          <View style={{ flex: 1 }}>
            <PrimaryButton
              label="Exportar CSV"
              icon="file-text"
              color={theme.colors.secondary}
              loading={exporting === 'csv'}
              disabled={exporting != null}
              onPress={() => doExport('csv')}
            />
          </View>
          <View style={{ flex: 1 }}>
            <PrimaryButton
              label="Exportar JSON"
              icon="braces"
              color={theme.colors.accent}
              loading={exporting === 'json'}
              disabled={exporting != null}
              onPress={() => doExport('json')}
            />
          </View>
        </View>

        {/* ─────────────── IMPORTAR ─────────────── */}
        <View style={styles.sectionGap}>
          <SectionTitle title="Importar" />
        </View>
        <Text style={styles.hint}>
          Selecciona un archivo CSV con el mismo formato que exporta la app. Verás una vista previa antes de
          importar.
        </Text>

        <PrimaryButton label="Seleccionar archivo CSV" icon="upload" onPress={pickFile} />

        {fileName != null && (
          <View style={styles.fileCard}>
            <Icon name="file-text" size={18} color={theme.colors.primaryLight} />
            <Text style={styles.fileName} numberOfLines={1}>
              {fileName}
            </Text>
            <Text style={styles.fileCount}>{parsedRows.length} fila(s)</Text>
            <Pressable onPress={clearImport} hitSlop={8}>
              <Icon name="x" size={18} color={theme.colors.textMuted} />
            </Pressable>
          </View>
        )}

        {parsedRows.length > 0 && (
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>
              Vista previa ({Math.min(PREVIEW_LIMIT, parsedRows.length)} de {parsedRows.length})
            </Text>
            {parsedRows.slice(0, PREVIEW_LIMIT).map((r, idx) => (
              <View key={idx} style={styles.previewRow}>
                <Text style={styles.previewDate}>{r.date || '—'}</Text>
                <View style={styles.previewMiddle}>
                  <Text style={styles.previewDesc} numberOfLines={1}>
                    {r.description || r.category || r.account || '(sin descripción)'}
                  </Text>
                  <Text style={styles.previewMeta} numberOfLines={1}>
                    {TYPE_LABELS[r.type] ?? r.type} · {r.account || '—'}
                  </Text>
                </View>
                <Text style={styles.previewAmount}>{formatCurrency(r.amount || 0)}</Text>
              </View>
            ))}
            {parsedRows.length > PREVIEW_LIMIT && (
              <Text style={styles.previewMore}>+{parsedRows.length - PREVIEW_LIMIT} más…</Text>
            )}
            <View style={styles.importBtn}>
              <PrimaryButton
                label={`Importar ${parsedRows.length} transacción(es)`}
                icon="download"
                loading={importing}
                disabled={importing}
                onPress={doImport}
              />
            </View>
          </View>
        )}

        {result != null && (
          <View style={styles.resultCard}>
            <View style={styles.resultRow}>
              <Icon name="circle-check" size={20} color={theme.colors.income} />
              <Text style={styles.resultOk}>{result.imported} importada(s)</Text>
              {result.errors.length > 0 && (
                <>
                  <View style={{ width: theme.spacing.sm }} />
                  <Icon name="circle-alert" size={20} color={theme.colors.expense} />
                  <Text style={styles.resultErr}>{result.errors.length} con error</Text>
                </>
              )}
            </View>
            {result.errors.length > 0 && (
              <View style={styles.errorList}>
                {result.errors.map((e) => (
                  <View key={e.row} style={styles.errorItem}>
                    <Text style={styles.errorRow}>Fila {e.row}</Text>
                    <Text style={styles.errorReason}>{e.reason}</Text>
                  </View>
                ))}
              </View>
            )}
            {result.imported === 0 && result.errors.length === 0 && (
              <EmptyState icon="inbox" text="El archivo no contenía filas para importar" />
            )}
          </View>
        )}
      </ScrollView>

      <DateRangePicker
        visible={showDate}
        onConfirm={({ from, to }) => {
          setRange({ from, to });
          setShowDate(false);
        }}
        onClose={() => setShowDate(false)}
      />
      <CategoryPicker
        visible={showCategory}
        type={categoryType}
        onSelect={(c) => {
          setCategory(c);
          setShowCategory(false);
        }}
        onClose={() => setShowCategory(false)}
      />
    </Screen>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { padding: theme.spacing.lg },
    hint: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginBottom: theme.spacing.md },
    label: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginBottom: theme.spacing.xs, marginTop: theme.spacing.sm },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginBottom: theme.spacing.sm },
    chip: { paddingHorizontal: theme.spacing.md, paddingVertical: 7, borderRadius: theme.borderRadius.full, backgroundColor: theme.colors.surface },
    chipText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium },
    chipTextActive: { color: '#FFFFFF', fontWeight: theme.fontWeight.bold },
    rowGap: { marginTop: theme.spacing.md },
    clearLink: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, marginTop: -theme.spacing.sm, marginBottom: theme.spacing.md },
    clearLinkText: { color: theme.colors.expense, fontSize: theme.fontSize.sm },
    exportButtons: { flexDirection: 'row', gap: theme.spacing.md, marginTop: theme.spacing.sm },
    sectionGap: { marginTop: theme.spacing.xl, marginBottom: theme.spacing.sm },
    fileCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.md,
      marginTop: theme.spacing.md,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
    },
    fileName: { flex: 1, color: theme.colors.text, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium },
    fileCount: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs },
    previewCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.md,
      marginTop: theme.spacing.md,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
    },
    previewTitle: { color: theme.colors.text, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold, marginBottom: theme.spacing.sm },
    previewRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
    previewDate: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, width: 78 },
    previewMiddle: { flex: 1 },
    previewDesc: { color: theme.colors.text, fontSize: theme.fontSize.sm },
    previewMeta: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs },
    previewAmount: { color: theme.colors.text, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold },
    previewMore: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, textAlign: 'center', marginTop: theme.spacing.sm },
    importBtn: { marginTop: theme.spacing.md },
    resultCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.md,
      marginTop: theme.spacing.md,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
    },
    resultRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
    resultOk: { color: theme.colors.income, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.bold },
    resultErr: { color: theme.colors.expense, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.bold },
    errorList: { marginTop: theme.spacing.md, gap: theme.spacing.xs },
    errorItem: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
      backgroundColor: `${theme.colors.expense}14`,
      borderRadius: theme.borderRadius.sm,
      padding: theme.spacing.sm,
    },
    errorRow: { color: theme.colors.expense, fontSize: theme.fontSize.xs, fontWeight: theme.fontWeight.bold, width: 54 },
    errorReason: { flex: 1, color: theme.colors.textSecondary, fontSize: theme.fontSize.xs },
  });
