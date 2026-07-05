import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, PrimaryButton } from '../components/common';
import { Icon } from '../components/Icon';
import { useStyleVote } from '../hooks/useStyleVote';
import { useAuth } from '../hooks/useAuth';
import { getErrorMessage } from '../api/client';
import type { StyleVoteChoice } from '../types';

/** Descripción de cada candidato (id = paletteId). */
const OPTIONS: {
  id: StyleVoteChoice;
  name: string;
  tagline: string;
  description: string;
}[] = [
  {
    id: 'professional',
    name: 'Clásico',
    tagline: 'Expresivo y con color',
    description: 'Headers y tarjetas con degradados de color. Vivo, con más presencia visual.',
  },
  {
    id: 'indigo',
    name: 'Minimal',
    tagline: 'Plano y premium',
    description: 'Fondos limpios sin degradados; el color aparece solo en lo importante. El saldo es el protagonista.',
  },
];

export function StyleVoteScreen() {
  const navigation = useNavigation<any>();
  const { theme, paletteId, setPalette, swatch } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { myVote, tallies, total, vote } = useStyleVote();
  const { user } = useAuth();
  const isAdmin = user?.isAdmin === true;

  // La opción "seleccionada" arranca en la paleta activa (para previsualizar).
  const [selected, setSelected] = useState<StyleVoteChoice>(
    paletteId === 'indigo' ? 'indigo' : 'professional',
  );
  const [saving, setSaving] = useState(false);

  // Tocar una opción la aplica en vivo (preview) además de seleccionarla.
  const preview = (id: StyleVoteChoice) => {
    setSelected(id);
    setPalette(id);
  };

  const submit = async () => {
    if (isAdmin) {
      Toast.show({
        type: 'info',
        text1: 'Vista de administrador',
        text2: 'Puedes probar estilos, pero no participas en esta votación.',
      });
      return;
    }
    setSaving(true);
    try {
      await vote(selected);
      Toast.show({
        type: 'success',
        text1: '¡Gracias por votar!',
        text2: `Registramos tu voto por "${OPTIONS.find((o) => o.id === selected)?.name}".`,
      });
    } catch (err) {
      Toast.show({ type: 'error', text1: 'No se pudo votar', text2: getErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader title="Vota por el estilo" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.intro}>
          <Text style={styles.introTitle}>Estamos probando un nuevo estilo ✨</Text>
          <Text style={styles.introBody}>
            Toca cada opción para verla aplicada en la app y elige cuál te gustaría que se quede como
            el estilo definitivo. Puedes cambiar tu voto cuando quieras.
          </Text>
        </View>

        {OPTIONS.map((o) => {
          const active = selected === o.id;
          const voted = myVote === o.id;
          return (
            <Pressable
              key={o.id}
              style={[styles.card, active && styles.cardActive]}
              onPress={() => preview(o.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Estilo ${o.name}`}
            >
              <View style={styles.cardHead}>
                <View style={styles.swatchRow}>
                  {/* Muestra el swatch de ESA paleta (no la activa). */}
                  {swatchFor(o.id).map((c, i) => (
                    <View key={i} style={[styles.swatch, { backgroundColor: c }]} />
                  ))}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardName}>{o.name}</Text>
                  <Text style={styles.cardTagline}>{o.tagline}</Text>
                </View>
                <View style={[styles.radio, active && styles.radioActive]}>
                  {active && <Icon name="check" size={14} color="#FFFFFF" />}
                </View>
              </View>
              <Text style={styles.cardDesc}>{o.description}</Text>

              {/* Barra de resultados en vivo */}
              <View style={styles.resultRow}>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      { width: `${pct(tallies[o.id])}%`, backgroundColor: theme.colors.primary },
                    ]}
                  />
                </View>
                <Text style={styles.resultPct}>{pct(tallies[o.id])}%</Text>
              </View>
              <Text style={styles.resultCount}>
                {tallies[o.id]} voto{tallies[o.id] === 1 ? '' : 's'}
                {!isAdmin && voted ? ' · tu voto' : ''}
              </Text>
            </Pressable>
          );
        })}

        <Text style={styles.total}>
          {total} {total === 1 ? 'persona ha votado' : 'personas han votado'} en total
        </Text>

        <View style={styles.buttonWrap}>
          <PrimaryButton
            label={
              saving
                ? 'Guardando…'
                : isAdmin
                  ? 'Vista admin: no cuenta como voto'
                : myVote === selected
                  ? 'Ya es tu voto'
                  : myVote
                    ? `Cambiar mi voto a "${OPTIONS.find((o) => o.id === selected)?.name}"`
                    : `Votar por "${OPTIONS.find((o) => o.id === selected)?.name}"`
            }
            onPress={submit}
            loading={saving}
            disabled={isAdmin || myVote === selected}
          />
        </View>
        <Text style={styles.footNote}>
          Tu selección también cambia cómo se ve la app ahora mismo (Más → Apariencia).
        </Text>
      </ScrollView>
    </Screen>
  );
}

// Swatches por candidato (deben coincidir con palettes[id].swatch en theme/index).
function swatchFor(id: StyleVoteChoice): string[] {
  return id === 'indigo'
    ? ['#4F46E5', '#F43F5E', '#1A1D27']
    : ['#2F5BD0', '#6366F1', '#0F766E'];
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
    intro: { marginBottom: theme.spacing.lg },
    introTitle: {
      color: theme.colors.text,
      fontSize: theme.fontSize.lg,
      fontWeight: theme.fontWeight.bold,
      marginBottom: theme.spacing.xs,
    },
    introBody: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, lineHeight: 20 },
    card: {
      backgroundColor: theme.colors.surfaceLight,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.md,
      borderWidth: 1.5,
      borderColor: theme.colors.cardBorder,
    },
    cardActive: { borderColor: theme.colors.primary },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
    swatchRow: { flexDirection: 'row' },
    swatch: {
      width: 26,
      height: 26,
      borderRadius: theme.borderRadius.full,
      borderWidth: 2,
      borderColor: theme.colors.surfaceLight,
      marginRight: -9,
    },
    cardName: {
      marginLeft: theme.spacing.sm,
      color: theme.colors.text,
      fontSize: theme.fontSize.md,
      fontWeight: theme.fontWeight.bold,
    },
    cardTagline: {
      marginLeft: theme.spacing.sm,
      color: theme.colors.textMuted,
      fontSize: theme.fontSize.xs,
      marginTop: 1,
    },
    radio: {
      width: 24,
      height: 24,
      borderRadius: theme.borderRadius.full,
      borderWidth: 2,
      borderColor: theme.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    cardDesc: {
      color: theme.colors.textSecondary,
      fontSize: theme.fontSize.sm,
      lineHeight: 19,
      marginTop: theme.spacing.sm,
    },
    resultRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginTop: theme.spacing.md },
    barTrack: {
      flex: 1,
      height: 8,
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.surfaceAccent,
      overflow: 'hidden',
    },
    barFill: { height: 8, borderRadius: theme.borderRadius.full },
    resultPct: {
      color: theme.colors.text,
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.bold,
      minWidth: 38,
      textAlign: 'right',
    },
    resultCount: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginTop: 4 },
    total: {
      color: theme.colors.textSecondary,
      fontSize: theme.fontSize.sm,
      textAlign: 'center',
      marginVertical: theme.spacing.sm,
    },
    buttonWrap: { marginTop: theme.spacing.sm },
    footNote: {
      color: theme.colors.textMuted,
      fontSize: theme.fontSize.xs,
      textAlign: 'center',
      marginTop: theme.spacing.md,
    },
  });
