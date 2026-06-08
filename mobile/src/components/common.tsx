import React from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../theme';
import { Icon } from './Icon';

/** Contenedor base de pantalla con fondo e insets superiores. */
export function Screen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.screen, { paddingTop: insets.top }, style]}>{children}</View>;
}

export function ScreenHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={12} style={styles.headerBtn}>
          <Icon name="chevron-left" size={26} color={theme.colors.text} />
        </Pressable>
      ) : (
        <View style={styles.headerBtn} />
      )}
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.headerBtn}>{right}</View>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  color = theme.colors.primary,
  disabled,
  loading,
  icon,
}: {
  label: string;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
  loading?: boolean;
  icon?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.button, { backgroundColor: color }, (disabled || loading) && { opacity: 0.5 }, pressed && { opacity: 0.8 }]}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <>
          {icon && <Icon name={icon} size={18} color="#fff" />}
          <Text style={styles.buttonText}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function TextField({ label, ...props }: { label?: string } & TextInputProps) {
  return (
    <View style={styles.field}>
      {label && <Text style={styles.fieldLabel}>{label}</Text>}
      <TextInput
        placeholderTextColor={theme.colors.textMuted}
        style={styles.input}
        {...props}
      />
    </View>
  );
}

/** Fila tipo "select": etiqueta a la izquierda, valor + chevron a la derecha. */
export function SelectRow({
  label,
  value,
  placeholder,
  icon,
  iconColor,
  onPress,
}: {
  label: string;
  value?: string | null;
  placeholder?: string;
  icon?: string;
  iconColor?: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable style={({ pressed }) => [styles.selectRow, pressed && { opacity: 0.7 }]} onPress={onPress}>
        {icon && (
          <View style={[styles.selectIcon, { backgroundColor: `${iconColor ?? theme.colors.primary}22` }]}>
            <Icon name={icon} size={18} color={iconColor ?? theme.colors.primary} />
          </View>
        )}
        <Text style={[styles.selectValue, !value && { color: theme.colors.textMuted }]} numberOfLines={1}>
          {value || placeholder || 'Seleccionar'}
        </Text>
        <Icon name="chevron-right" size={20} color={theme.colors.textMuted} />
      </Pressable>
    </View>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionTitleText}>{title}</Text>
      {action}
    </View>
  );
}

export function EmptyState({ icon = 'inbox', text }: { icon?: string; text: string }) {
  return (
    <View style={styles.empty}>
      <Icon name={icon} size={42} color={theme.colors.textMuted} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={theme.colors.primary} size="large" />
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.empty}>
      <Icon name="cloud-off" size={42} color={theme.colors.danger} />
      <Text style={styles.emptyText}>{message}</Text>
      {onRetry && (
        <Pressable onPress={onRetry} style={styles.retry}>
          <Text style={styles.retryText}>Reintentar</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  headerBtn: { minWidth: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: '700' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
  },
  buttonText: { color: '#fff', fontSize: theme.fontSize.md, fontWeight: '700' },
  field: { marginBottom: theme.spacing.md },
  fieldLabel: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginBottom: theme.spacing.xs },
  input: {
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
  },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  selectIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  selectValue: { flex: 1, color: theme.colors.text, fontSize: theme.fontSize.md },
  sectionTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.sm },
  sectionTitleText: { color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: '700' },
  empty: { alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl, gap: theme.spacing.sm },
  emptyText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.md, textAlign: 'center' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl },
  retry: { marginTop: theme.spacing.sm, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm, backgroundColor: theme.colors.surfaceLight, borderRadius: theme.borderRadius.md },
  retryText: { color: theme.colors.primaryLight, fontWeight: '600' },
});
