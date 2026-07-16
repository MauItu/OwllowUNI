import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Modal, RefreshControl, StyleSheet, Alert } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { PALETTE, type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, TextField, PrimaryButton, EmptyState, Loading } from '../components/common';
import { Icon, CATEGORY_ICONS } from '../components/Icon';
import { useCategories } from '../hooks/useCategories';
import { categoriesApi, getErrorMessage } from '../api/client';
import { showError, showSuccess } from '../components/toastConfig';
import { useAppStore } from '../stores/appStore';
import type { Category, CategoryType } from '../types';

interface FormState {
  id?: number;
  name: string;
  color: string;
  icon: string;
  parentId: number | null;
}

export function CategoriesScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [tab, setTab] = useState<CategoryType>('expense');
  const { categories, loading, refreshing, refetch } = useCategories(tab);
  const triggerRefresh = useAppStore((s) => s.triggerRefresh);

  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [form, setForm] = useState<FormState | null>(null);

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openNew = (parentId: number | null) => setForm({ name: '', color: PALETTE[0], icon: 'shapes', parentId });
  const openEdit = (c: Category) => setForm({ id: c.id, name: c.name, color: c.color, icon: c.icon, parentId: c.parentId });

  const save = async () => {
    if (!form) return;
    if (!form.name.trim()) {
      showError('El nombre es obligatorio');
      return;
    }
    try {
      if (form.id) {
        await categoriesApi.update(form.id, { name: form.name.trim(), color: form.color, icon: form.icon });
        showSuccess('Categoría actualizada');
      } else {
        await categoriesApi.create({
          name: form.name.trim(),
          type: tab,
          color: form.color,
          icon: form.icon,
          parentId: form.parentId,
        });
        showSuccess('Categoría creada');
      }
      setForm(null);
      refetch();
      triggerRefresh();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  const remove = (id: number) => {
    Alert.alert('Eliminar categoría', '¿Seguro que quieres eliminar esta categoría?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await categoriesApi.remove(id);
            setForm(null);
            refetch();
            triggerRefresh();
            showSuccess('Categoría eliminada');
          } catch (err) {
            showError(getErrorMessage(err));
          }
        },
      },
    ]);
  };

  return (
    <Screen>
      <ScreenHeader
        title="Categorías"
        onBack={() => navigation.goBack()}
        right={
          <Pressable onPress={() => openNew(null)} hitSlop={10}>
            <Icon name="plus" size={24} color={theme.colors.onHeader} />
          </Pressable>
        }
      />

      <View style={styles.tabs}>
        {(['expense', 'income'] as CategoryType[]).map((t) => {
          const active = tab === t;
          const activeColor = t === 'expense' ? theme.colors.expense : theme.colors.income;
          return (
            <Pressable key={t} style={[styles.tab, active && { backgroundColor: activeColor }]} onPress={() => setTab(t)}>
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t === 'expense' ? 'Gastos' : 'Ingresos'}</Text>
            </Pressable>
          );
        })}
      </View>

      {loading && categories.length === 0 ? (
        <Loading />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => refetch(true)} tintColor={theme.colors.primary} />}
        >
          {categories.length === 0 && <EmptyState icon="shapes" text="No hay categorías. Crea la primera." />}
          {categories.map((cat) => {
            const isOpen = expanded.has(cat.id);
            const children = cat.children ?? [];
            return (
              <View key={cat.id} style={styles.group}>
                <Pressable style={styles.parentRow} onPress={() => openEdit(cat)}>
                  <View style={[styles.iconWrap, { backgroundColor: `${cat.color}22` }]}>
                    <Icon name={cat.icon} size={20} color={cat.color} />
                  </View>
                  <Text style={styles.parentName}>{cat.name}</Text>
                  <Pressable hitSlop={8} onPress={() => openNew(cat.id)} style={styles.smallBtn}>
                    <Icon name="plus" size={16} color={theme.colors.textSecondary} />
                  </Pressable>
                  {children.length > 0 && (
                    <Pressable hitSlop={8} onPress={() => toggle(cat.id)} style={styles.smallBtn}>
                      <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textSecondary} />
                    </Pressable>
                  )}
                </Pressable>

                {isOpen && (
                  <View style={styles.childrenWrap}>
                    <View style={[styles.childLine, { backgroundColor: cat.color }]} />
                    <View style={{ flex: 1 }}>
                      {children.map((child) => (
                        <Pressable key={child.id} style={styles.childRow} onPress={() => openEdit(child)}>
                          <View style={[styles.childIcon, { backgroundColor: `${child.color}26` }]}>
                            <Icon name={child.icon} size={14} color={child.color} />
                          </View>
                          <Text style={styles.childName}>{child.name}</Text>
                          <Icon name="chevron-right" size={16} color={theme.colors.textMuted} />
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Modal crear/editar */}
      <Modal visible={!!form} transparent animationType="slide" onRequestClose={() => setForm(null)}>
        <Pressable style={styles.backdrop} onPress={() => setForm(null)} />
        <KeyboardAvoidingView behavior="padding">
          <View style={[styles.sheet, { paddingBottom: theme.spacing.lg + insets.bottom }]}>
          {form && (
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.sheetTitle}>
                {form.id ? 'Editar categoría' : form.parentId ? 'Nueva subcategoría' : 'Nueva categoría'}
              </Text>
              <TextField label="Nombre" value={form.name} onChangeText={(name) => setForm({ ...form, name })} placeholder="Ej: Alimentación" />

              <Text style={styles.label}>Color</Text>
              <View style={styles.palette}>
                {PALETTE.map((c) => (
                  <Pressable key={c} style={[styles.swatch, { backgroundColor: c }, form.color === c && styles.swatchActive]} onPress={() => setForm({ ...form, color: c })}>
                    {form.color === c && <Icon name="check" size={16} color="#fff" />}
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Ícono</Text>
              <View style={styles.iconGrid}>
                {CATEGORY_ICONS.map((ic) => (
                  <Pressable key={ic} style={[styles.iconBtn, form.icon === ic && { borderColor: form.color }]} onPress={() => setForm({ ...form, icon: ic })}>
                    <Icon name={ic} size={20} color={form.icon === ic ? form.color : theme.colors.textSecondary} />
                  </Pressable>
                ))}
              </View>

              <View style={{ marginTop: theme.spacing.md }}>
                <PrimaryButton label={form.id ? 'Guardar' : 'Crear'} onPress={save} icon="check" />
              </View>
              {form.id && (
                <Pressable style={styles.deleteBtn} onPress={() => remove(form.id!)}>
                  <Icon name="trash-2" size={18} color={theme.colors.danger} />
                  <Text style={styles.deleteText}>Eliminar categoría</Text>
                </Pressable>
              )}
            </ScrollView>
          )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
  tabs: { flexDirection: 'row', gap: theme.spacing.sm, paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.sm },
  tab: { flex: 1, paddingVertical: theme.spacing.sm + 2, borderRadius: theme.borderRadius.full, backgroundColor: theme.colors.surfaceLight, alignItems: 'center' },
  tabText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.medium },
  tabTextActive: { color: theme.colors.background, fontWeight: theme.fontWeight.bold },
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  group: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, marginBottom: theme.spacing.sm, overflow: 'hidden' },
  parentRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, padding: theme.spacing.md },
  iconWrap: { width: 42, height: 42, borderRadius: theme.borderRadius.full, alignItems: 'center', justifyContent: 'center' },
  parentName: { flex: 1, color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold },
  smallBtn: { width: 30, height: 30, borderRadius: theme.borderRadius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceLight },
  childrenWrap: { flexDirection: 'row', paddingLeft: theme.spacing.lg, paddingRight: theme.spacing.md, paddingBottom: theme.spacing.sm, gap: theme.spacing.md },
  childLine: { width: 2, borderRadius: 1, marginVertical: theme.spacing.xs },
  childRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.sm },
  childIcon: { width: 28, height: 28, borderRadius: theme.borderRadius.full, alignItems: 'center', justifyContent: 'center' },
  childName: { flex: 1, color: theme.colors.text, fontSize: theme.fontSize.sm },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.borderRadius.xl, borderTopRightRadius: theme.borderRadius.xl, padding: theme.spacing.lg, maxHeight: '82%' },
  sheetTitle: { color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: theme.fontWeight.semibold, marginBottom: theme.spacing.md },
  label: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginBottom: theme.spacing.sm, marginTop: theme.spacing.sm },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  swatch: { width: 40, height: 40, borderRadius: theme.borderRadius.full, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  swatchActive: { borderColor: theme.colors.text },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  iconBtn: { width: 46, height: 46, borderRadius: theme.borderRadius.md, backgroundColor: theme.colors.surfaceLight, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm, marginTop: theme.spacing.md, padding: theme.spacing.md },
  deleteText: { color: theme.colors.expense, fontWeight: theme.fontWeight.semibold },
});
