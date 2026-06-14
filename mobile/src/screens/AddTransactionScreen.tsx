import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Platform, TextInput, Image, ActivityIndicator } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, PrimaryButton } from '../components/common';
import { Calculator } from '../components/Calculator';
import { CategoryPicker } from '../components/CategoryPicker';
import { AccountPicker } from '../components/AccountPicker';
import { DateRangePicker } from '../components/DateRangePicker';
import { TimePicker } from '../components/TimePicker';
import { TagPicker } from '../components/TagPicker';
import { TagChip } from '../components/TagChip';
import { BottomSheet } from '../components/BottomSheet';
import { ReceiptViewer } from '../components/ReceiptViewer';
import { Icon } from '../components/Icon';
import { useAccounts } from '../hooks/useAccounts';
import { useCategories } from '../hooks/useCategories';
import { useAppStore } from '../stores/appStore';
import { transactionsApi, templatesApi, ratesApi, getErrorMessage } from '../api/client';
import { showError, showSuccess } from '../components/toastConfig';
import { todayISO, nowTime, formatShortDate, formatTime, parseISOSafe } from '../utils/formatDate';
import { formatCurrency } from '../utils/formatCurrency';
import { processAndSaveReceipt, deleteReceipt, receiptUri } from '../utils/receiptStorage';
import type { RootStackParamList } from '../navigation/types';
import type { Account, Category, Tag, Transaction, TxType } from '../types';

const TYPE_TABS: { key: TxType; label: string }[] = [
  { key: 'expense', label: 'Gasto' },
  { key: 'income', label: 'Ingreso' },
  { key: 'transfer', label: 'Transferencia' },
];

/** Busca una categoría por id entre los padres y sus subcategorías (lista anidada). */
function findCategoryById(categories: Category[], id: number): Category | null {
  for (const c of categories) {
    if (c.id === id) return c;
    const child = c.children?.find((ch) => ch.id === id);
    if (child) return child;
  }
  return null;
}

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
  const insets = useSafeAreaInsets();
  const { accounts } = useAccounts();
  const { categories } = useCategories();
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
  // Transacción cargada al editar; sus FKs (cuenta/categoría) se resuelven a
  // objetos cuando las listas correspondientes terminan de cargar.
  const [loadedTx, setLoadedTx] = useState<Transaction | null>(null);
  // Fuerza el remontaje de la Calculator cuando el monto se fija por código
  // (precarga al editar): su estado interno solo lee `initialValue` al montar.
  const [calcKey, setCalcKey] = useState(0);
  const [selectedTags, setSelectedTags] = useState<Pick<Tag, 'id' | 'name' | 'color' | 'icon'>[]>([]);
  const [saving, setSaving] = useState(false);

  // Compra a cuotas (solo gasto con tarjeta de crédito). `liveAmount` rastrea el
  // valor de la calculadora para mostrar la cuota mensual al teclear.
  const [installmentsOn, setInstallmentsOn] = useState(false);
  const [installmentCount, setInstallmentCount] = useState('12');
  const [liveAmount, setLiveAmount] = useState<number>(
    params.template?.amount ? parseFloat(params.template.amount) : 0,
  );
  const handleAmountChange = useCallback((v: number) => setLiveAmount(v), []);
  // toAmount cargado al editar una transferencia multi-moneda existente
  const [loadedToAmount, setLoadedToAmount] = useState<number | null>(null);

  // Recibo (foto local). `loadedReceipt` = el persistido en DB (no se borra hasta
  // confirmar el cambio al guardar). `tempFilesRef` rastrea archivos creados en
  // esta sesión para borrar huérfanos (reemplazo/quitar/salir sin guardar).
  const [receiptFilename, setReceiptFilename] = useState<string | null>(null);
  const [loadedReceipt, setLoadedReceipt] = useState<string | null>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [showReceiptSheet, setShowReceiptSheet] = useState(false);
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);
  const tempFilesRef = useRef<Set<string>>(new Set());
  const savedFileRef = useRef<string | null>(null);

  // Transferencia entre monedas distintas: hoja "Monto recibido"
  const [showReceived, setShowReceived] = useState(false);
  const [pendingAmount, setPendingAmount] = useState(0);
  const [receivedInput, setReceivedInput] = useState('');
  const [convRate, setConvRate] = useState<number | null>(null);

  const [showCategory, setShowCategory] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showToAccount, setShowToAccount] = useState(false);
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [showTags, setShowTags] = useState(false);

  // Gasto con tarjeta de crédito → habilita la opción de cuotas.
  const isCardExpense = type === 'expense' && account?.type === 'credit_card';
  const installmentCountNum = Math.min(60, Math.max(0, parseInt(installmentCount || '0', 10) || 0));
  const cuotaMensual =
    isCardExpense && installmentsOn && installmentCountNum >= 2 && liveAmount > 0
      ? liveAmount / installmentCountNum
      : null;

  const toggleTag = (tag: Pick<Tag, 'id' | 'name' | 'color' | 'icon'>) => {
    setSelectedTags((prev) =>
      prev.some((t) => t.id === tag.id) ? prev.filter((t) => t.id !== tag.id) : [...prev, tag],
    );
  };

  // Cuenta por defecto (solo al crear): la primera disponible. Al editar, la
  // cuenta la fija la transacción cargada (ver efecto de resolución de FKs).
  useEffect(() => {
    if (!editingId && !account && accounts.length > 0) setAccount(accounts[0]);
  }, [accounts, account, editingId]);

  // Carga la transacción al editar (una sola vez): precarga los campos escalares
  // y deja la transacción en `loadedTx` para resolver cuenta/categoría después.
  useEffect(() => {
    if (!editingId) return;
    (async () => {
      try {
        const tx = await transactionsApi.get(editingId);
        setLoadedTx(tx);
        setType(tx.type);
        setDate(tx.date);
        setTime(tx.time);
        setDescription(tx.description ?? '');
        setInitialAmount(parseFloat(tx.amount));
        setLiveAmount(parseFloat(tx.amount));
        if (tx.installments && tx.installments > 1) {
          setInstallmentsOn(true);
          setInstallmentCount(String(tx.installments));
        }
        setCalcKey((k) => k + 1);
        if (tx.toAmount != null) setLoadedToAmount(parseFloat(tx.toAmount));
        setReceiptFilename(tx.receiptFilename ?? null);
        setLoadedReceipt(tx.receiptFilename ?? null);
        if (tx.tags) setSelectedTags(tx.tags);
      } catch (err) {
        showError(getErrorMessage(err));
      }
    })();
  }, [editingId]);

  // Resuelve cuenta origen/destino a objetos cuando las cuentas estén cargadas.
  useEffect(() => {
    if (!loadedTx || accounts.length === 0) return;
    setAccount(accounts.find((a) => a.id === loadedTx.accountId) ?? null);
    if (loadedTx.toAccountId != null) {
      setToAccount(accounts.find((a) => a.id === loadedTx.toAccountId) ?? null);
    }
  }, [loadedTx, accounts]);

  // Resuelve la categoría a objeto cuando las categorías estén cargadas.
  useEffect(() => {
    if (!loadedTx || loadedTx.categoryId == null || categories.length === 0) return;
    setCategory(findCategoryById(categories, loadedTx.categoryId));
  }, [loadedTx, categories]);

  // Borra al instante un archivo huérfano de esta sesión (no el persistido en DB).
  const dropTempFile = (filename: string | null) => {
    if (filename && filename !== loadedReceipt && tempFilesRef.current.has(filename)) {
      tempFilesRef.current.delete(filename);
      void deleteReceipt(filename);
    }
  };

  // Limpieza al desmontar: si no se guardó, borra los archivos creados en sesión.
  useEffect(() => {
    return () => {
      for (const f of tempFilesRef.current) {
        if (f !== savedFileRef.current) void deleteReceipt(f);
      }
    };
  }, []);

  const pickReceipt = async (source: 'camera' | 'library') => {
    setShowReceiptSheet(false);
    try {
      let result: ImagePicker.ImagePickerResult;
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          showError('Permiso de cámara denegado. Actívalo en los ajustes del sistema.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          showError('Permiso de galería denegado. Actívalo en los ajustes del sistema.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      }
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setReceiptBusy(true);
      const filename = await processAndSaveReceipt(asset.uri, asset.width);
      // Reemplazo: borra el huérfano anterior (si lo había) y registra el nuevo.
      dropTempFile(receiptFilename);
      tempFilesRef.current.add(filename);
      setReceiptFilename(filename);
    } catch {
      showError('No se pudo procesar la imagen.');
    } finally {
      setReceiptBusy(false);
    }
  };

  const removeReceipt = () => {
    setShowReceiptPreview(false);
    dropTempFile(receiptFilename);
    setReceiptFilename(null);
  };

  const doSave = async (amount: number, toAmount: number | null) => {
    if (!account) return;
    // Cuotas: solo gasto con tarjeta de crédito y toggle activo (2–60 cuotas).
    const cardExpense = type === 'expense' && account.type === 'credit_card';
    const installments =
      cardExpense && installmentsOn && installmentCountNum >= 2 ? installmentCountNum : null;
    const payload = {
      type,
      amount,
      description: description.trim() || null,
      date,
      time,
      accountId: account.id,
      toAccountId: type === 'transfer' ? toAccount?.id ?? null : null,
      toAmount: type === 'transfer' ? toAmount : null,
      categoryId: type === 'transfer' ? null : category?.id ?? null,
      notes: null,
      receiptFilename,
      tagIds: selectedTags.map((t) => t.id),
      installments,
    };

    try {
      setSaving(true);
      if (editingId) {
        await transactionsApi.update(editingId, payload);
        showSuccess('Transacción actualizada');
      } else {
        await transactionsApi.create(payload);
        // use_count solo se incrementa al CONFIRMAR una transacción creada desde
        // una plantilla (no al seleccionarla). Si el usuario canceló, no llega aquí.
        if (params.template) {
          try {
            await templatesApi.use(params.template.id);
          } catch {
            // El uso de plantilla es informativo: no bloquea el guardado.
          }
        }
        showSuccess('Transacción guardada');
      }
      // Guardado OK: el archivo final deja de ser temporal; si el persistido
      // anterior cambió/se quitó, bórralo del disco.
      savedFileRef.current = receiptFilename;
      if (receiptFilename) tempFilesRef.current.delete(receiptFilename);
      if (loadedReceipt && loadedReceipt !== receiptFilename) void deleteReceipt(loadedReceipt);
      triggerRefresh();
      navigation.goBack();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const submit = async (amount: number) => {
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
      // Monedas distintas → confirmar/editar el monto recibido en la cuenta destino.
      if (account.currency !== toAccount.currency) {
        setPendingAmount(amount);
        let rate: number | null = null;
        try {
          const res = await ratesApi.list(account.currency, [toAccount.currency]);
          rate = res.rates[0]?.rate ?? null;
        } catch {
          rate = null;
        }
        setConvRate(rate);
        const def = loadedToAmount != null ? loadedToAmount : rate != null ? amount * rate : amount;
        setReceivedInput(String(Math.round(def * 100) / 100));
        setShowReceived(true);
        return;
      }
    }
    await doSave(amount, null);
  };

  const confirmReceived = async () => {
    const received = parseFloat(receivedInput.replace(',', '.'));
    if (!Number.isFinite(received) || received <= 0) {
      showError('Ingresa el monto recibido (mayor a 0)');
      return;
    }
    setShowReceived(false);
    await doSave(pendingAmount, received);
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
                  // Borra el recibo persistido; los temporales los limpia el unmount
                  // (savedFileRef queda null → se borran todos).
                  if (loadedReceipt) void deleteReceipt(loadedReceipt);
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

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
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
          <Chip icon="clock" label={formatTime(time)} onPress={() => setShowTime(true)} />
          {/* Recibo: si hay foto muestra thumbnail (toca → preview); si no, abre el selector */}
          <Pressable
            style={({ pressed }) => [
              styles.chip,
              receiptFilename != null && styles.chipActive,
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => (receiptFilename ? setShowReceiptPreview(true) : setShowReceiptSheet(true))}
          >
            {receiptBusy ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : receiptFilename ? (
              <Image source={{ uri: receiptUri(receiptFilename) }} style={styles.receiptThumb} />
            ) : (
              <Icon name="paperclip" size={16} color={theme.colors.textSecondary} />
            )}
            <Text style={[styles.chipText, receiptFilename != null && { color: theme.colors.primaryLight }]} numberOfLines={1}>
              Recibo
            </Text>
          </Pressable>
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

        {/* Cuotas: solo gasto con tarjeta de crédito */}
        {isCardExpense && (
          <View style={styles.installmentsBox}>
            <Pressable
              style={({ pressed }) => [styles.installmentsToggle, pressed && { opacity: 0.7 }]}
              onPress={() => setInstallmentsOn((v) => !v)}
            >
              <Icon name="credit-card" size={16} color={theme.colors.primary} />
              <Text style={styles.installmentsTitle}>¿Compra a cuotas?</Text>
              <View style={[styles.switchTrack, installmentsOn && { backgroundColor: theme.colors.primary }]}>
                <View style={[styles.switchKnob, installmentsOn && styles.switchKnobOn]} />
              </View>
            </Pressable>
            {installmentsOn && (
              <View style={styles.installmentsBody}>
                <View style={styles.countRow}>
                  <Text style={styles.countLabel}>Número de cuotas</Text>
                  <TextInput
                    value={installmentCount}
                    onChangeText={(t) => setInstallmentCount(t.replace(/[^0-9]/g, '').slice(0, 2))}
                    keyboardType="number-pad"
                    placeholder="12"
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.countInput}
                  />
                </View>
                <Text style={styles.cuotaHint}>
                  {cuotaMensual != null
                    ? `Cuota mensual: ${formatCurrency(cuotaMensual, account?.currency ?? 'COP')}`
                    : 'Ingresa el monto y un número de cuotas entre 2 y 60.'}
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={{ flex: 1 }} />

        {/* Calculadora (parte inferior). El inset se aplica como padding del
            wrapper en color surface para que el teclado no quede bajo la barra
            de gestos de Android sin romper los usos dentro de BottomSheet. */}
        <View style={{ backgroundColor: theme.colors.surface, paddingBottom: insets.bottom }}>
          <Calculator
            key={calcKey}
            type={type}
            initialValue={initialAmount}
            currency={account?.currency ?? 'COP'}
            onConfirm={submit}
            onChange={handleAmountChange}
          />
        </View>
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
      <TimePicker
        visible={showTime}
        value={time}
        onConfirm={(t) => {
          setTime(t);
          setShowTime(false);
        }}
        onClose={() => setShowTime(false)}
      />
      <TagPicker
        visible={showTags}
        selectedIds={selectedTags.map((t) => t.id)}
        onToggle={toggleTag}
        onClose={() => setShowTags(false)}
      />

      {/* Transferencia entre monedas: monto recibido editable */}
      <BottomSheet
        visible={showReceived}
        title="Transferencia entre monedas"
        onClose={() => setShowReceived(false)}
        maxHeight="60%"
      >
        {account && toAccount && (
          <View style={{ gap: theme.spacing.md }}>
            <View style={styles.convRow}>
              <View style={styles.convSide}>
                <Text style={styles.convLabel}>Envías</Text>
                <Text style={styles.convValue}>{formatCurrency(pendingAmount, account.currency)}</Text>
                <Text style={styles.convAcc} numberOfLines={1}>{account.name}</Text>
              </View>
              <Icon name="arrow-right" size={20} color={theme.colors.textMuted} />
              <View style={styles.convSide}>
                <Text style={styles.convLabel}>Recibes</Text>
                <Text style={[styles.convValue, { color: theme.colors.transfer }]}>{toAccount.currency}</Text>
                <Text style={styles.convAcc} numberOfLines={1}>{toAccount.name}</Text>
              </View>
            </View>

            <View style={styles.receivedRow}>
              <Text style={styles.receivedPrefix}>{toAccount.currency}</Text>
              <TextInput
                value={receivedInput}
                onChangeText={setReceivedInput}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.receivedInput}
                autoFocus
              />
            </View>
            <Text style={styles.convHint}>
              {convRate != null
                ? `Tasa actual: 1 ${account.currency} = ${formatCurrency(convRate, toAccount.currency)}. Puedes ajustar el monto recibido.`
                : 'No hay tasa automática disponible. Ingresa el monto recibido manualmente.'}
            </Text>
            <PrimaryButton label="Guardar transferencia" icon="check" onPress={confirmReceived} loading={saving} />
          </View>
        )}
      </BottomSheet>

      {/* Selector de origen del recibo */}
      <BottomSheet
        visible={showReceiptSheet}
        title="Adjuntar recibo"
        onClose={() => setShowReceiptSheet(false)}
        maxHeight="40%"
      >
        <View style={{ gap: theme.spacing.sm }}>
          <Pressable
            style={({ pressed }) => [styles.sourceRow, pressed && { opacity: 0.7 }]}
            onPress={() => pickReceipt('camera')}
          >
            <View style={[styles.sourceIcon, { backgroundColor: `${theme.colors.primary}22` }]}>
              <Icon name="camera" size={22} color={theme.colors.primary} />
            </View>
            <Text style={styles.sourceText}>Tomar foto</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.sourceRow, pressed && { opacity: 0.7 }]}
            onPress={() => pickReceipt('library')}
          >
            <View style={[styles.sourceIcon, { backgroundColor: `${theme.colors.secondary}22` }]}>
              <Icon name="image" size={22} color={theme.colors.secondary} />
            </View>
            <Text style={styles.sourceText}>Elegir de galería</Text>
          </Pressable>
        </View>
      </BottomSheet>

      {/* Preview a pantalla completa del recibo */}
      <ReceiptViewer
        visible={showReceiptPreview}
        filename={receiptFilename}
        onClose={() => setShowReceiptPreview(false)}
        onDelete={removeReceipt}
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
  chipActive: { borderColor: theme.colors.primary, backgroundColor: `${theme.colors.primary}14` },
  receiptThumb: { width: 22, height: 22, borderRadius: theme.borderRadius.sm },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
  },
  sourceIcon: { width: 44, height: 44, borderRadius: theme.borderRadius.full, alignItems: 'center', justifyContent: 'center' },
  sourceText: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.medium },
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
  installmentsBox: {
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  installmentsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 2,
  },
  installmentsTitle: { flex: 1, color: theme.colors.text, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium },
  switchTrack: {
    width: 42,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.border,
    padding: 2,
    justifyContent: 'center',
  },
  switchKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF' },
  switchKnobOn: { alignSelf: 'flex-end' },
  installmentsBody: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  countLabel: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm },
  countInput: {
    minWidth: 64,
    textAlign: 'center',
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 4,
    paddingHorizontal: theme.spacing.sm,
  },
  cuotaHint: { color: theme.colors.primaryLight, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium },
  convRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  convSide: { flex: 1, backgroundColor: theme.colors.surfaceLight, borderRadius: theme.borderRadius.md, padding: theme.spacing.md, gap: 2 },
  convLabel: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs },
  convValue: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.bold },
  convAcc: { color: theme.colors.textSecondary, fontSize: theme.fontSize.xs },
  receivedRow: {
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
  receivedPrefix: { color: theme.colors.textSecondary, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold },
  receivedInput: { flex: 1, color: theme.colors.text, fontSize: theme.fontSize.xl, fontWeight: theme.fontWeight.bold },
  convHint: { color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, lineHeight: 17 },
});
