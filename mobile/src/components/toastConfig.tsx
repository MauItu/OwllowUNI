import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ToastConfig } from 'react-native-toast-message';
import { theme } from '../theme';
import { Icon } from './Icon';

function Base({ color, icon, text1, text2 }: { color: string; icon: string; text1?: string; text2?: string }) {
  return (
    <View style={[styles.container, { borderLeftColor: color }]}>
      <Icon name={icon} size={20} color={color} />
      <View style={styles.textWrap}>
        {!!text1 && <Text style={styles.title}>{text1}</Text>}
        {!!text2 && <Text style={styles.subtitle}>{text2}</Text>}
      </View>
    </View>
  );
}

export const toastConfig: ToastConfig = {
  success: ({ text1, text2 }) => (
    <Base color={theme.colors.success} icon="circle-check" text1={text1} text2={text2} />
  ),
  error: ({ text1, text2 }) => (
    <Base color={theme.colors.danger} icon="circle-alert" text1={text1} text2={text2} />
  ),
  info: ({ text1, text2 }) => (
    <Base color={theme.colors.primary} icon="info" text1={text1} text2={text2} />
  ),
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLight,
    borderLeftWidth: 4,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    marginHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
    width: '92%',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  textWrap: { flex: 1 },
  title: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: '600' },
  subtitle: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginTop: 2 },
});

// Helpers para disparar toasts desde cualquier parte.
import Toast from 'react-native-toast-message';
export const showError = (msg: string, title = 'Error') =>
  Toast.show({ type: 'error', text1: title, text2: msg });
export const showSuccess = (msg: string, title = 'Listo') =>
  Toast.show({ type: 'success', text1: title, text2: msg });
export const showInfo = (msg: string, title?: string) =>
  Toast.show({ type: 'info', text1: title ?? msg, text2: title ? msg : undefined });
