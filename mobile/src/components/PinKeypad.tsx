import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Icon } from './Icon';

interface Props {
  onDigit: (d: string) => void;
  onDelete: () => void;
  /** Si se pasa, muestra el botón de biometría abajo-izquierda. */
  onBiometric?: () => void;
  biometricIcon?: string;
  disabled?: boolean;
}

/** Teclado numérico estilo Calculator (mismas teclas/colores del tema). */
export function PinKeypad({ onDigit, onDelete, onBiometric, biometricIcon = 'fingerprint', disabled }: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  const Key = ({ label }: { label: string }) => (
    <Pressable
      onPress={() => onDigit(label)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.key, pressed && styles.keyPressed, disabled && styles.keyDisabled]}
    >
      <Text style={styles.keyText}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.pad}>
      <View style={styles.row}>
        <Key label="1" />
        <Key label="2" />
        <Key label="3" />
      </View>
      <View style={styles.row}>
        <Key label="4" />
        <Key label="5" />
        <Key label="6" />
      </View>
      <View style={styles.row}>
        <Key label="7" />
        <Key label="8" />
        <Key label="9" />
      </View>
      <View style={styles.row}>
        {onBiometric ? (
          <Pressable
            onPress={onBiometric}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel="Desbloquear con biometría"
            style={({ pressed }) => [styles.key, styles.keyGhost, pressed && styles.keyPressed]}
          >
            <Icon name={biometricIcon} size={26} color={theme.colors.primaryLight} />
          </Pressable>
        ) : (
          <View style={[styles.key, styles.keyGhost]} />
        )}
        <Key label="0" />
        <Pressable
          onPress={onDelete}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Borrar dígito"
          style={({ pressed }) => [styles.key, styles.keyGhost, pressed && styles.keyPressed, disabled && styles.keyDisabled]}
        >
          <Icon name="delete" size={26} color={theme.colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    pad: { gap: theme.spacing.md, alignSelf: 'center', width: '100%', maxWidth: 320 },
    row: { flexDirection: 'row', gap: theme.spacing.md, justifyContent: 'center' },
    key: {
      flex: 1,
      height: 68,
      borderRadius: theme.borderRadius.lg,
      backgroundColor: theme.colors.surfaceLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    keyGhost: { backgroundColor: 'transparent' },
    keyPressed: { opacity: 0.55, backgroundColor: theme.colors.surfaceAccent },
    keyDisabled: { opacity: 0.4 },
    keyText: { color: theme.colors.text, fontSize: theme.fontSize.xxl, fontWeight: theme.fontWeight.medium },
  });
