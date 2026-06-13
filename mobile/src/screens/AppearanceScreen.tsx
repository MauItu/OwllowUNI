import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, SectionTitle } from '../components/common';
import { Icon } from '../components/Icon';
import type { ThemeMode } from '../stores/settingsStore';

const THEME_MODES: { key: ThemeMode; label: string; icon: string }[] = [
  { key: 'system', label: 'Sistema', icon: 'smartphone' },
  { key: 'light', label: 'Claro', icon: 'sun' },
  { key: 'dark', label: 'Oscuro', icon: 'moon' },
];

export function AppearanceScreen() {
  const navigation = useNavigation<any>();
  const { theme, paletteId, setPalette, availablePalettes, themeMode, setThemeMode } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <Screen>
      <ScreenHeader title="Apariencia" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <SectionTitle title="Tema" />
        <View style={styles.segmented}>
          {THEME_MODES.map((m) => {
            const active = themeMode === m.key;
            return (
              <Pressable
                key={m.key}
                style={[styles.segment, active && styles.segmentActive]}
                onPress={() => setThemeMode(m.key)}
              >
                <Icon name={m.icon} size={16} color={active ? '#FFFFFF' : theme.colors.textSecondary} />
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{m.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.sectionGap}>
          <SectionTitle title="Paleta de colores" />
        </View>
        {availablePalettes.map((p) => {
          const selected = paletteId === p.id;
          return (
            <Pressable
              key={p.id}
              style={[styles.card, selected && styles.cardSelected]}
              onPress={() => setPalette(p.id)}
            >
              <View style={styles.swatchRow}>
                {p.swatch.map((color, i) => (
                  <View key={i} style={[styles.swatch, { backgroundColor: color }]} />
                ))}
              </View>
              <Text style={styles.cardLabel}>{p.label}</Text>
              {selected && (
                <View style={styles.checkWrap}>
                  <Icon name="check" size={20} color={theme.colors.primary} />
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { padding: theme.spacing.lg },
    sectionGap: { marginTop: theme.spacing.lg },
    segmented: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    segment: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: theme.spacing.sm + 2,
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.surface,
    },
    segmentActive: {
      backgroundColor: theme.colors.primary,
    },
    segmentText: {
      color: theme.colors.textSecondary,
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.medium,
    },
    segmentTextActive: {
      color: '#FFFFFF',
      fontWeight: theme.fontWeight.bold,
    },
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
    cardSelected: {
      borderColor: theme.colors.primary,
    },
    swatchRow: {
      flexDirection: 'row',
    },
    swatch: {
      width: 28,
      height: 28,
      borderRadius: theme.borderRadius.full,
      borderWidth: 2,
      borderColor: theme.colors.surface,
      marginRight: -10,
    },
    cardLabel: {
      flex: 1,
      marginLeft: theme.spacing.sm,
      color: theme.colors.text,
      fontSize: theme.fontSize.md,
      fontWeight: theme.fontWeight.semibold,
    },
    checkWrap: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
