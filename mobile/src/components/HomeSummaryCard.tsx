import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Icon } from './Icon';

interface Props {
  icon: string;
  color: string;
  title: string;
  /** Valor principal (monto ya formateado). */
  value: string;
  valueColor?: string;
  subtitle?: string;
  /** Contenido adicional debajo de la fila principal (p.ej. alertas). */
  extra?: React.ReactNode;
  onPress: () => void;
}

/** Card compacto para resúmenes en el Home (ahorro, deudas, splits, crédito). */
export function HomeSummaryCard({ icon, color, title, value, valueColor, subtitle, extra, onPress }: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: theme.colors.surfaceLight }]}
    >
      <View style={styles.row}>
        <View style={[styles.iconWrap, { backgroundColor: `${color}26` }]}>
          <Icon name={icon} size={20} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          {!!subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
        </View>
        <Text style={[styles.value, { color: valueColor ?? theme.colors.text }]} numberOfLines={1}>
          {value}
        </Text>
        <Icon name="chevron-right" size={18} color={theme.colors.textMuted} />
      </View>
      {!!extra && extra}
    </Pressable>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.md,
      marginTop: theme.spacing.md,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
    },
    iconWrap: { width: 40, height: 40, borderRadius: theme.borderRadius.full, alignItems: 'center', justifyContent: 'center' },
    title: { color: theme.colors.text, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold },
    subtitle: { color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, marginTop: 1 },
    value: { fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.bold, maxWidth: 130 },
  });
