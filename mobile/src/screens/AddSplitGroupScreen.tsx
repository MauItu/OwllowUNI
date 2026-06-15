import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { type Theme, PALETTE } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, PrimaryButton, TextField, FormScrollView } from '../components/common';
import { Icon } from '../components/Icon';
import { useAppStore } from '../stores/appStore';
import { splitsApi, getErrorMessage } from '../api/client';
import { showError, showSuccess } from '../components/toastConfig';
import type { RootStackParamList } from '../navigation/types';

const GROUP_ICONS = [
  'users', 'home', 'plane', 'utensils', 'party-popper',
  'briefcase', 'heart', 'gamepad-2', 'tent', 'shopping-cart',
];

interface DraftMember {
  // id presente solo en miembros que ya existen en el backend (modo edición).
  id?: number;
  name: string;
  isMe: boolean;
}

export function AddSplitGroupScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, 'AddSplitGroup'>>();
  const groupId = route.params?.groupId;
  const isEdit = groupId != null;
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const triggerRefresh = useAppStore((s) => s.triggerRefresh);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#3A60A1');
  const [icon, setIcon] = useState('users');
  const [members, setMembers] = useState<DraftMember[]>([{ name: 'Yo', isMe: true }]);
  const [memberInput, setMemberInput] = useState('');
  const [saving, setSaving] = useState(false);

  // Carga el grupo al editar (incluye sus miembros con id).
  useEffect(() => {
    if (!groupId) return;
    (async () => {
      try {
        const g = await splitsApi.get(groupId);
        setName(g.name);
        setDescription(g.description ?? '');
        setColor(g.color);
        setIcon(g.icon);
        setMembers((g.members ?? []).map((m) => ({ id: m.id, name: m.name, isMe: m.isMe })));
      } catch (err) {
        showError(getErrorMessage(err));
      }
    })();
  }, [groupId]);

  const addMember = async () => {
    const trimmed = memberInput.trim();
    if (!trimmed) return;
    if (members.some((m) => m.name.toLowerCase() === trimmed.toLowerCase())) {
      showError('Ya hay un miembro con ese nombre');
      return;
    }
    if (isEdit) {
      // En edición los miembros se persisten en el acto vía endpoint dedicado.
      try {
        const created = await splitsApi.addMember(groupId!, { name: trimmed });
        setMembers([...members, { id: created.id, name: created.name, isMe: created.isMe }]);
        setMemberInput('');
      } catch (err) {
        showError(getErrorMessage(err));
      }
      return;
    }
    setMembers([...members, { name: trimmed, isMe: false }]);
    setMemberInput('');
  };

  const removeMember = async (index: number) => {
    const m = members[index];
    if (m.isMe) {
      showError('El grupo debe incluirte a ti');
      return;
    }
    if (isEdit && m.id != null) {
      // El backend rechaza eliminar miembros con gastos asociados (400).
      try {
        await splitsApi.removeMember(groupId!, m.id);
        setMembers(members.filter((_, i) => i !== index));
      } catch (err) {
        showError(getErrorMessage(err));
      }
      return;
    }
    setMembers(members.filter((_, i) => i !== index));
  };

  const markAsMe = (index: number) => {
    // Reasignar "Yo" solo aplica al crear (no hay endpoint para cambiarlo luego).
    setMembers(members.map((m, i) => ({ ...m, isMe: i === index })));
  };

  const save = async () => {
    if (!name.trim()) {
      showError('Escribe un nombre para el grupo');
      return;
    }
    if (members.length < 2) {
      showError('Agrega al menos 2 miembros');
      return;
    }
    try {
      setSaving(true);
      if (isEdit) {
        await splitsApi.update(groupId!, {
          name: name.trim(),
          description: description.trim() || null,
          color,
          icon,
        });
        showSuccess('Grupo actualizado');
      } else {
        await splitsApi.create({
          name: name.trim(),
          description: description.trim() || null,
          color,
          icon,
          members: members.map((m) => ({ name: m.name, isMe: m.isMe })),
        });
        showSuccess('Grupo creado');
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
      <ScreenHeader title={isEdit ? 'Editar grupo' : 'Nuevo grupo'} onBack={() => navigation.goBack()} />
      <FormScrollView contentContainerStyle={styles.content}>
        <TextField label="Nombre" value={name} onChangeText={setName} placeholder="Ej: Viaje a Santa Marta" maxLength={100} />
        <TextField
          label="Descripción (opcional)"
          value={description}
          onChangeText={setDescription}
          placeholder="¿Para qué es este grupo?"
          maxLength={255}
        />

        <Text style={styles.fieldLabel}>Miembros ({members.length})</Text>
        <View style={styles.memberInputRow}>
          <View style={{ flex: 1 }}>
            <TextField
              value={memberInput}
              onChangeText={setMemberInput}
              placeholder="Nombre del miembro"
              maxLength={100}
              onSubmitEditing={addMember}
              returnKeyType="done"
            />
          </View>
          <Pressable style={styles.addBtn} onPress={addMember}>
            <Icon name="plus" size={22} color="#FFFFFF" strokeWidth={2.6} />
          </Pressable>
        </View>

        {members.map((m, i) => (
          <View key={m.id ?? `${m.name}-${i}`} style={styles.memberRow}>
            <View style={[styles.memberIcon, { backgroundColor: m.isMe ? `${theme.colors.primary}26` : `${theme.colors.secondary}26` }]}>
              <Icon name={m.isMe ? 'user-check' : 'user'} size={18} color={m.isMe ? theme.colors.primary : theme.colors.secondary} />
            </View>
            <Text style={styles.memberName} numberOfLines={1}>{m.name}</Text>
            {m.isMe ? (
              <View style={styles.meBadge}>
                <Text style={styles.meBadgeText}>Yo</Text>
              </View>
            ) : (
              <>
                {!isEdit && (
                  <Pressable hitSlop={8} onPress={() => markAsMe(i)}>
                    <Text style={styles.markMe}>Soy yo</Text>
                  </Pressable>
                )}
                <Pressable hitSlop={8} onPress={() => removeMember(i)}>
                  <Icon name="x" size={18} color={theme.colors.expense} />
                </Pressable>
              </>
            )}
          </View>
        ))}

        <Text style={[styles.fieldLabel, { marginTop: theme.spacing.md }]}>Color</Text>
        <View style={styles.swatches}>
          {PALETTE.map((c) => (
            <Pressable
              key={c}
              style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchActive]}
              onPress={() => setColor(c)}
            >
              {color === c && <Icon name="check" size={14} color="#FFFFFF" strokeWidth={3} />}
            </Pressable>
          ))}
        </View>

        <Text style={styles.fieldLabel}>Ícono</Text>
        <View style={styles.swatches}>
          {GROUP_ICONS.map((i) => (
            <Pressable
              key={i}
              style={[styles.iconSwatch, icon === i && { backgroundColor: `${color}26`, borderColor: color }]}
              onPress={() => setIcon(i)}
            >
              <Icon name={i} size={20} color={icon === i ? color : theme.colors.textSecondary} />
            </Pressable>
          ))}
        </View>

        <PrimaryButton label={isEdit ? 'Guardar cambios' : 'Crear grupo'} onPress={save} loading={saving} icon="users" />
      </FormScrollView>
    </Screen>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
    fieldLabel: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginBottom: theme.spacing.xs },
    memberInputRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm },
    addBtn: {
      width: 48,
      height: 48,
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.sm + 2,
      marginBottom: theme.spacing.xs,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
    },
    memberIcon: { width: 34, height: 34, borderRadius: theme.borderRadius.full, alignItems: 'center', justifyContent: 'center' },
    memberName: { flex: 1, color: theme.colors.text, fontSize: theme.fontSize.md },
    meBadge: {
      backgroundColor: theme.colors.primary,
      borderRadius: theme.borderRadius.full,
      paddingHorizontal: theme.spacing.sm + 2,
      paddingVertical: 3,
    },
    meBadgeText: { color: '#FFFFFF', fontSize: theme.fontSize.xs, fontWeight: theme.fontWeight.bold },
    markMe: { color: theme.colors.secondary, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold, marginRight: theme.spacing.sm },
    swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginBottom: theme.spacing.md },
    swatch: {
      width: 36,
      height: 36,
      borderRadius: theme.borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    swatchActive: { borderWidth: 3, borderColor: theme.colors.text },
    iconSwatch: {
      width: 44,
      height: 44,
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.surfaceLight,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
