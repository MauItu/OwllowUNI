import React, { useState } from 'react';
import { View, Text, FlatList, Pressable, Modal, ScrollView, RefreshControl, StyleSheet } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Swipeable } from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, TextField, PrimaryButton, SelectRow, EmptyState, Loading } from '../components/common';
import { TemplateCard } from '../components/TemplateCard';
import { CategoryPicker } from '../components/CategoryPicker';
import { AccountPicker } from '../components/AccountPicker';
import { Icon } from '../components/Icon';
import { useTemplates } from '../hooks/useTemplates';
import { useAccounts } from '../hooks/useAccounts';
import { templatesApi, getErrorMessage } from '../api/client';
import { showError, showSuccess } from '../components/toastConfig';
import { useAppStore } from '../stores/appStore';
import type { Account, Category, CategoryType, Template } from '../types';

interface FormState {
  name: string;
  type: CategoryType;
  amount: string;
  account: Account | null;
  category: Category | null;
}

const emptyForm: FormState = { name: '', type: 'expense', amount: '', account: null, category: null };

export function TemplatesScreen() {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { templates, loading, refreshing, refetch } = useTemplates();
  const { accounts } = useAccounts();
  const triggerRefresh = useAppStore((s) => s.triggerRefresh);
  const setPendingTemplate = useAppStore((s) => s.setPendingTemplate);

  const [form, setForm] = useState<FormState | null>(null);
  const [showAccount, setShowAccount] = useState(false);
  const [showCategory, setShowCategory] = useState(false);

  const useTemplate = async (t: Template) => {
    try {
      await templatesApi.use(t.id);
    } catch {
      // no bloquea el flujo
    }
    setPendingTemplate(t);
    triggerRefresh();
    navigation.navigate('AddTransaction', { template: t });
  };

  const save = async () => {
    if (!form) return;
    if (!form.name.trim()) {
      showError('El nombre es obligatorio');
      return;
    }
    try {
      await templatesApi.create({
        name: form.name.trim(),
        type: form.type,
        amount: form.amount ? parseFloat(form.amount) : null,
        accountId: form.account?.id ?? null,
        categoryId: form.category?.id ?? null,
      });
      showSuccess('Plantilla creada');
      setForm(null);
      refetch();
      triggerRefresh();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  const remove = async (t: Template) => {
    try {
      await templatesApi.remove(t.id);
      showSuccess('Plantilla eliminada');
      refetch();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  return (
    <Screen>
      <ScreenHeader
        title="Plantillas"
        onBack={() => navigation.goBack()}
        right={
          <Pressable onPress={() => setForm(emptyForm)} hitSlop={10}>
            <Icon name="plus" size={24} color="#FFFFFF" />
          </Pressable>
        }
      />

      {loading && templates.length === 0 ? (
        <Loading />
      ) : (
        <FlatList
          data={templates}
          keyExtractor={(t) => String(t.id)}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => refetch(true)} tintColor={theme.colors.primary} />}
          renderItem={({ item }) => (
            <Swipeable
              overshootRight={false}
              renderRightActions={() => (
                <Pressable style={styles.deleteAction} onPress={() => remove(item)}>
                  <Icon name="trash-2" size={22} color="#fff" />
                </Pressable>
              )}
            >
              <TemplateCard template={item} onPress={useTemplate} />
            </Swipeable>
          )}
          ListEmptyComponent={<EmptyState icon="bookmark" text="No hay plantillas. Crea una para registrar movimientos al instante." />}
        />
      )}

      {/* Modal crear */}
      <Modal visible={!!form} transparent animationType="slide" onRequestClose={() => setForm(null)}>
        <Pressable style={styles.backdrop} onPress={() => setForm(null)} />
        <KeyboardAvoidingView behavior="padding">
          <View style={styles.sheet}>
          {form && (
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.sheetTitle}>Nueva plantilla</Text>

              <View style={styles.typeTabs}>
                {(['expense', 'income'] as CategoryType[]).map((t) => (
                  <Pressable
                    key={t}
                    style={[styles.typeTab, form.type === t && { backgroundColor: t === 'expense' ? theme.colors.expense : theme.colors.income }]}
                    onPress={() => setForm({ ...form, type: t, category: null })}
                  >
                    <Text style={[styles.typeTabText, form.type === t && styles.typeTabTextActive]}>
                      {t === 'expense' ? 'Gasto' : 'Ingreso'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <TextField label="Nombre" value={form.name} onChangeText={(name) => setForm({ ...form, name })} placeholder="Ej: Almuerzo diario" />
              <TextField
                label="Monto (opcional)"
                value={form.amount}
                onChangeText={(amount) => setForm({ ...form, amount })}
                keyboardType="numeric"
                placeholder="Déjalo vacío si varía"
              />
              <SelectRow
                label="Cuenta"
                value={form.account?.name}
                placeholder="Seleccionar (opcional)"
                icon={form.account?.icon ?? 'wallet'}
                iconColor={form.account?.color}
                onPress={() => setShowAccount(true)}
              />
              <SelectRow
                label="Categoría"
                value={form.category?.name}
                placeholder="Seleccionar (opcional)"
                icon={form.category?.icon ?? 'shapes'}
                iconColor={form.category?.color}
                onPress={() => setShowCategory(true)}
              />

              <View style={{ marginTop: theme.spacing.md }}>
                <PrimaryButton label="Crear plantilla" onPress={save} icon="check" />
              </View>
            </ScrollView>
          )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <AccountPicker
        visible={showAccount}
        accounts={accounts}
        onSelect={(a) => {
          setForm((f) => (f ? { ...f, account: a } : f));
          setShowAccount(false);
        }}
        onClose={() => setShowAccount(false)}
      />
      <CategoryPicker
        visible={showCategory}
        type={form?.type ?? 'expense'}
        onSelect={(c) => {
          setForm((f) => (f ? { ...f, category: c } : f));
          setShowCategory(false);
        }}
        onClose={() => setShowCategory(false)}
      />
    </Screen>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
  list: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  deleteAction: { backgroundColor: theme.colors.expense, justifyContent: 'center', alignItems: 'center', width: 72, marginBottom: theme.spacing.sm, borderRadius: theme.borderRadius.lg, marginLeft: theme.spacing.sm },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.borderRadius.xl, borderTopRightRadius: theme.borderRadius.xl, padding: theme.spacing.lg, maxHeight: '82%' },
  sheetTitle: { color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: theme.fontWeight.semibold, marginBottom: theme.spacing.md },
  typeTabs: { flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.md },
  typeTab: { flex: 1, paddingVertical: theme.spacing.sm + 2, borderRadius: theme.borderRadius.full, backgroundColor: theme.colors.surfaceLight, alignItems: 'center' },
  typeTabText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium },
  typeTabTextActive: { color: theme.colors.background, fontWeight: theme.fontWeight.bold },
});
