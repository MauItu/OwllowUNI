import React from 'react';
import { View, Text, Modal, Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Icon } from './Icon';

interface Props {
  visible: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  maxHeight?: ViewStyle['maxHeight'];
}

/**
 * Hoja inferior reutilizable: sube desde abajo, con handle de arrastre,
 * fondo surface, esquinas superiores redondeadas y respeto del SafeArea.
 */
export function BottomSheet({ visible, title, onClose, children, maxHeight = '80%' }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      {/* La hoja sube por encima del teclado (keyboard-controller funciona
          dentro de Modals y con edge-to-edge en Android). */}
      <KeyboardAvoidingView behavior="padding" style={styles.kav} pointerEvents="box-none">
        <View style={[styles.sheet, { maxHeight, paddingBottom: Math.max(insets.bottom, theme.spacing.md) }]}>
          <View style={styles.handle} />
          {title && (
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <Pressable onPress={onClose} hitSlop={10} style={styles.close}>
                <Icon name="x" size={20} color={theme.colors.textSecondary} />
              </Pressable>
            </View>
          )}
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  kav: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: theme.borderRadius.full, backgroundColor: theme.colors.borderLight, marginBottom: theme.spacing.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md },
  title: { color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: theme.fontWeight.semibold },
  close: { width: 32, height: 32, borderRadius: theme.borderRadius.full, backgroundColor: theme.colors.surfaceLight, alignItems: 'center', justifyContent: 'center' },
});
