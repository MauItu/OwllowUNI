import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { type Theme, PALETTE } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { BottomSheet } from './BottomSheet';
import { TagChip } from './TagChip';
import { Icon } from './Icon';
import { useTags } from '../hooks/useTags';
import { tagsApi, getErrorMessage } from '../api/client';
import { showError } from './toastConfig';
import type { Tag } from '../types';

interface Props {
  visible: boolean;
  title?: string;
  selectedIds: number[];
  onToggle: (tag: Tag) => void;
  onClose: () => void;
}

/**
 * BottomSheet con los tags existentes como chips seleccionables
 * + input para crear un tag nuevo inline (nombre + botón "+").
 */
export function TagPicker({ visible, title = 'Etiquetas', selectedIds, onToggle, onClose }: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { tags, loading, refetch } = useTags();
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const createTag = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      setCreating(true);
      // Color rotativo de la paleta para que cada tag nuevo se distinga
      const color = PALETTE[tags.length % PALETTE.length];
      const created = await tagsApi.create({ name, color });
      setNewName('');
      await refetch(true);
      onToggle(created);
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <BottomSheet visible={visible} title={title} onClose={onClose} maxHeight="70%">
      {/* Crear tag inline */}
      <View style={styles.createRow}>
        <Icon name="tag" size={16} color={theme.colors.textMuted} />
        <TextInput
          value={newName}
          onChangeText={setNewName}
          placeholder="Nueva etiqueta"
          placeholderTextColor={theme.colors.textMuted}
          style={styles.createInput}
          maxLength={50}
          returnKeyType="done"
          onSubmitEditing={createTag}
        />
        <Pressable
          onPress={createTag}
          disabled={creating || !newName.trim()}
          style={[styles.createBtn, (creating || !newName.trim()) && { opacity: 0.4 }]}
        >
          {creating ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Icon name="plus" size={18} color="#FFFFFF" strokeWidth={2.6} />
          )}
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        {loading ? (
          <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: theme.spacing.lg }} />
        ) : tags.length === 0 ? (
          <Text style={styles.empty}>Aún no tienes etiquetas. Crea la primera arriba.</Text>
        ) : (
          <View style={styles.chips}>
            {tags.map((tag) => (
              <TagChip
                key={tag.id}
                tag={tag}
                selected={selectedIds.includes(tag.id)}
                onPress={() => onToggle(tag)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    createRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      backgroundColor: theme.colors.surfaceLight,
      borderRadius: theme.borderRadius.md,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.xs,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginBottom: theme.spacing.md,
    },
    createInput: { flex: 1, color: theme.colors.text, fontSize: theme.fontSize.md, paddingVertical: theme.spacing.sm },
    createBtn: {
      width: 34,
      height: 34,
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    list: { paddingBottom: theme.spacing.lg },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
    empty: { color: theme.colors.textSecondary, textAlign: 'center', paddingVertical: theme.spacing.lg },
  });
