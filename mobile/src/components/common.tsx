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
import { SafeAreaView } from 'react-native-safe-area-context';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Icon } from './Icon';

/** Contenedor base de pantalla: fondo + inset superior (status bar). */
export function Screen({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <SafeAreaView edges={['top']} style={[styles.screen, style]}>
      {children}
    </SafeAreaView>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={12} style={styles.headerBtn}>
          <Icon name="chevron-left" size={26} color={theme.colors.text} />
        </Pressable>
      ) : (
        <View style={styles.headerBtn} />
      )}
      <View style={styles.headerTitleWrap}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      <View style={styles.headerBtn}>{right}</View>
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  color,
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
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const bg = color ?? theme.colors.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.button, { backgroundColor: bg }, (disabled || loading) && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors.background} />
      ) : (
        <>
          {icon && <Icon name={icon} size={18} color={theme.colors.background} strokeWidth={2.4} />}
          <Text style={styles.buttonText}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function TextField({ label, ...props }: { label?: string } & TextInputProps) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
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
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable style={({ pressed }) => [styles.selectRow, pressed && { opacity: 0.7 }]} onPress={onPress}>
        {icon && (
          <View style={[styles.selectIcon, { backgroundColor: `${iconColor ?? theme.colors.primary}26` }]}>
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
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionTitleText}>{title}</Text>
      {action}
    </View>
  );
}

export function EmptyState({ icon = 'inbox', text }: { icon?: string; text: string }) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={36} color={theme.colors.textMuted} />
      </View>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export function Loading() {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={theme.colors.primary} size="large" />
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name="cloud-off" size={36} color={theme.colors.expense} />
      </View>
      <Text style={styles.emptyText}>{message}</Text>
      {onRetry && (
        <Pressable onPress={onRetry} style={styles.retry}>
          <Text style={styles.retryText}>Reintentar</Text>
        </Pressable>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  headerBtn: { minWidth: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitleWrap: { flex: 1, alignItems: 'center' },
  headerTitle: { color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: theme.fontWeight.semibold },
  headerSubtitle: { color: theme.colors.textSecondary, fontSize: theme.fontSize.xs, marginTop: 1 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
  },
  buttonText: { color: theme.colors.background, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.bold },
  field: { marginBottom: theme.spacing.md },
  fieldLabel: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginBottom: theme.spacing.xs },
  input: {
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  selectIcon: { width: 32, height: 32, borderRadius: theme.borderRadius.full, alignItems: 'center', justifyContent: 'center' },
  selectValue: { flex: 1, color: theme.colors.text, fontSize: theme.fontSize.md },
  sectionTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.sm },
  sectionTitleText: { color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: theme.fontWeight.semibold },
  empty: { alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl, gap: theme.spacing.md },
  emptyIcon: { width: 72, height: 72, borderRadius: theme.borderRadius.full, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.md, textAlign: 'center' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xl },
  retry: { marginTop: theme.spacing.xs, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm, backgroundColor: theme.colors.surfaceLight, borderRadius: theme.borderRadius.md },
  retryText: { color: theme.colors.primaryLight, fontWeight: theme.fontWeight.semibold },
});
