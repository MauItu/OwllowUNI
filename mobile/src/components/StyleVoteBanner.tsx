import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Icon } from './Icon';
import { useStyleVote } from '../hooks/useStyleVote';

/**
 * Aviso ("span") que aparece cada vez que el usuario entra a la app MIENTRAS no
 * haya votado el estilo definitivo. Se descarta por sesión (reaparece al próximo
 * arranque) y desaparece para siempre en cuanto vota. Se renderiza al tope del
 * Home (la pantalla de entrada). La lógica de visibilidad vive en useStyleVote.
 */
export function StyleVoteBanner() {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { showBanner, dismissBanner } = useStyleVote();

  if (!showBanner) return null;

  return (
    <Pressable
      style={styles.banner}
      onPress={() => navigation.navigate('StyleVote')}
      accessibilityRole="button"
      accessibilityLabel="Nuevo estilo disponible, vota por cuál debería quedarse"
    >
      <View style={styles.iconWrap}>
        <Icon name="sparkles" size={18} color={theme.colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Nuevo estilo disponible</Text>
        <Text style={styles.body} numberOfLines={2}>
          Míralo y vota por cuál debería quedarse en la app.
        </Text>
      </View>
      <View style={styles.cta}>
        <Text style={styles.ctaText}>Votar</Text>
      </View>
      <Pressable
        onPress={dismissBanner}
        hitSlop={10}
        style={styles.close}
        accessibilityRole="button"
        accessibilityLabel="Descartar aviso"
      >
        <Icon name="x" size={16} color={theme.colors.textMuted} />
      </Pressable>
    </Pressable>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      backgroundColor: theme.colors.surfaceLight,
      borderRadius: theme.borderRadius.lg,
      borderWidth: 1,
      borderColor: `${theme.colors.accent}55`,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      marginBottom: theme.spacing.md,
    },
    iconWrap: {
      width: 34,
      height: 34,
      borderRadius: theme.borderRadius.full,
      backgroundColor: `${theme.colors.accent}22`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { color: theme.colors.text, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.bold },
    body: { color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, marginTop: 1 },
    cta: {
      backgroundColor: theme.colors.primary,
      borderRadius: theme.borderRadius.full,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 6,
    },
    ctaText: { color: '#FFFFFF', fontSize: theme.fontSize.xs, fontWeight: theme.fontWeight.bold },
    close: { padding: 2 },
  });
