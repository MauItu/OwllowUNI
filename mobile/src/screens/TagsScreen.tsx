import React, { useState } from 'react';
import { View, Text, FlatList, Pressable, TextInput, RefreshControl, StyleSheet } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, EmptyState, ErrorState, Loading, PrimaryButton } from '../components/common';
import { BottomSheet } from '../components/BottomSheet';
import { Icon } from '../components/Icon';
import { useTags } from '../hooks/useTags';
import { useAppStore } from '../stores/appStore';
import { tagsApi, getErrorMessage } from '../api/client';
import { showError, showSuccess } from '../components/toastConfig';
import type { Tag } from '../types';

// Paleta simple de 8 colores predefinidos para etiquetas (funciona en ambos temas)
const TAG_COLORS = ['#C1437A', '#F72585', '#3A60A1', '#4CC9F0', '#7B528C', '#2E8B57', '#E8A838', '#6C757D'];

export function TagsScreen() {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { tags, loading, refreshing, error, refetch } = useTags();
  const triggerRefresh = useAppStore((s) => s.triggerRefresh);

  // Form del BottomSheet (crear o editar)
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Tag | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(TAG_COLORS[0]);
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setColor(TAG_COLORS[0]);
    setSheetOpen(true);
  };

  const openEdit = (tag: Tag) => {
    setEditing(tag);
    setName(tag.name);
    setColor(tag.color);
    setSheetOpen(true);
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      showError('Escribe un nombre para la etiqueta');
      return;
    }
    try {
      setSaving(true);
      if (editing) {
        await tagsApi.update(editing.id, { name: trimmed, color });
        showSuccess('Etiqueta actualizada');
      } else {
        await tagsApi.create({ name: trimmed, color });
        showSuccess('Etiqueta creada');
      }
      setSheetOpen(false);
      triggerRefresh();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (tag: Tag) => {
    try {
      await tagsApi.remove(tag.id);
      showSuccess('Etiqueta eliminada');
      triggerRefresh();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  const renderRightActions = (tag: Tag) => (
    <Pressable style={styles.deleteAction} onPress={() => remove(tag)}>
      <Icon name="trash-2" size={22} color="#FFFFFF" />
    </Pressable>
  );

  return (
    <Screen>
      <ScreenHeader
        title="Etiquetas"
        onBack={() => navigation.goBack()}
        right={
          <Pressable hitSlop={10} onPress={openCreate}>
            <Icon name="plus" size={24} color="#FFFFFF" strokeWidth={2.4} />
          </Pressable>
        }
      />

      {loading && tags.length === 0 ? (
        <Loading />
      ) : error && tags.length === 0 ? (
        <ErrorState message={error} onRetry={() => refetch()} />
      ) : (
        <FlatList
          data={tags}
          keyExtractor={(t) => String(t.id)}
          removeClippedSubviews
          maxToRenderPerBatch={15}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => refetch(true)} tintColor={theme.colors.primary} />
          }
          ListEmptyComponent={<EmptyState icon="tag" text="Aún no tienes etiquetas. Crea la primera con el botón +." />}
          renderItem={({ item }) => (
            <Swipeable renderRightActions={() => renderRightActions(item)} overshootRight={false}>
              <Pressable
                style={({ pressed }) => [styles.card, pressed && { backgroundColor: theme.colors.surfaceLight }]}
                onPress={() => openEdit(item)}
              >
                <View style={[styles.iconWrap, { backgroundColor: `${item.color}26` }]}>
                  <Icon name={item.icon} size={20} color={item.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.meta}>
                    {item.transactionCount === 1 ? '1 movimiento' : `${item.transactionCount ?? 0} movimientos`}
                  </Text>
                </View>
                <View style={[styles.colorDot, { backgroundColor: item.color }]} />
                <Icon name="chevron-right" size={20} color={theme.colors.textMuted} />
              </Pressable>
            </Swipeable>
          )}
        />
      )}

      <BottomSheet
        visible={sheetOpen}
        title={editing ? 'Editar etiqueta' : 'Nueva etiqueta'}
        onClose={() => setSheetOpen(false)}
      >
        <Text style={styles.fieldLabel}>Nombre</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Ej: Vacaciones"
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
          maxLength={50}
        />

        <Text style={styles.fieldLabel}>Color</Text>
        <View style={styles.colors}>
          {TAG_COLORS.map((c) => (
            <Pressable
              key={c}
              style={[styles.colorSwatch, { backgroundColor: c }, color === c && styles.colorSwatchActive]}
              onPress={() => setColor(c)}
            >
              {color === c && <Icon name="check" size={16} color="#FFFFFF" strokeWidth={3} />}
            </Pressable>
          ))}
        </View>

        <PrimaryButton
          label={editing ? 'Guardar cambios' : 'Crear etiqueta'}
          onPress={save}
          loading={saving}
          icon="tag"
        />
      </BottomSheet>
    </Screen>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    list: { padding: theme.spacing.lg, paddingTop: theme.spacing.sm },
    card: {
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
    iconWrap: { width: 44, height: 44, borderRadius: theme.borderRadius.full, alignItems: 'center', justifyContent: 'center' },
    name: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold },
    meta: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginTop: 2 },
    colorDot: { width: 14, height: 14, borderRadius: theme.borderRadius.full },
    deleteAction: {
      backgroundColor: theme.colors.expense,
      justifyContent: 'center',
      alignItems: 'center',
      width: 72,
      marginBottom: theme.spacing.sm,
      borderRadius: theme.borderRadius.lg,
      marginLeft: theme.spacing.sm,
    },
    fieldLabel: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginBottom: theme.spacing.xs },
    input: {
      backgroundColor: theme.colors.surfaceLight,
      borderRadius: theme.borderRadius.md,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.md,
      color: theme.colors.text,
      fontSize: theme.fontSize.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginBottom: theme.spacing.md,
    },
    colors: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginBottom: theme.spacing.lg },
    colorSwatch: {
      width: 40,
      height: 40,
      borderRadius: theme.borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    colorSwatchActive: { borderWidth: 3, borderColor: theme.colors.text },
  });
