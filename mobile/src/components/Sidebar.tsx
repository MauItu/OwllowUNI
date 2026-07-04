import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Dimensions,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Icon } from './Icon';
import { useAuth } from '../hooks/useAuth';
import { useSidebarStore } from '../stores/sidebarStore';
import { getUserRole } from '../utils/roles';
import { navigationRef } from '../navigation/navigationRef';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.8, 320);

/**
 * Drawer lateral de PERFIL. Se abre desde el botón superior izquierdo de Home y
 * muestra los datos de la cuenta (nombre, correo) y el botón de cerrar sesión.
 * El menú de navegación vive ahora en el tab "Más" (ver `MoreScreen`).
 */
export function Sidebar() {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const isOpen = useSidebarStore((s) => s.isOpen);
  const close = useSidebarStore((s) => s.close);
  const role = getUserRole(user?.email);

  const progress = useRef(new Animated.Value(0)).current;
  // Mantiene el drawer montado durante la animación de cierre; lo desmonta al
  // terminar para no capturar toques mientras está oculto.
  const [mounted, setMounted] = useState(isOpen);

  useEffect(() => {
    if (isOpen) setMounted(true);
    Animated.timing(progress, {
      toValue: isOpen ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !isOpen) setMounted(false);
    });
  }, [isOpen, progress]);

  if (!mounted) return null;

  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-DRAWER_WIDTH, 0] });

  const onLogout = () => {
    close();
    Alert.alert('Cerrar sesión', '¿Seguro que querés cerrar sesión?', [
      { text: 'Cancelar', style: 'cancel' },
      // Al cerrar sesión, isAuthenticated pasa a false y el navigator vuelve al login.
      { text: 'Cerrar sesión', style: 'destructive', onPress: () => logout() },
    ]);
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Overlay semi-transparente: al tocarlo cierra el drawer */}
      <Animated.View style={[styles.overlay, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
      </Animated.View>

      <Animated.View
        style={[
          styles.drawer,
          { paddingTop: insets.top + theme.spacing.lg, transform: [{ translateX }] },
        ]}
      >
        {/* Encabezado: botón de cerrar el drawer */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Mi perfil</Text>
          <Pressable hitSlop={10} onPress={close} style={styles.closeBtn}>
            <Icon name="x" size={20} color={theme.colors.textSecondary} />
          </Pressable>
        </View>

        {/* Perfil del usuario */}
        <View style={styles.profile}>
          <View style={styles.avatar}>
            <Icon name="user" size={34} color={theme.colors.primary} />
          </View>
          <Text style={styles.profileName} numberOfLines={1}>
            {user?.name ?? 'Mi cuenta'}
          </Text>
          <Text style={styles.profileEmail} numberOfLines={1}>
            {user?.email ?? ''}
          </Text>
          {/* Insignia de rol (solo usuarios con rol especial, p.ej. Alpha Tester). */}
          {role && (
            <View style={styles.roleBadge}>
              <Icon name="shield-check" size={13} color={theme.colors.accent} />
              <Text style={styles.roleText}>{role}</Text>
            </View>
          )}
        </View>

        {/* Mi cuenta: exportar datos, legal y eliminar cuenta. El Sidebar vive
            FUERA del NavigationContainer → se navega vía navigationRef. */}
        <Pressable
          style={({ pressed }) => [styles.accountRow, pressed && { opacity: 0.7 }]}
          onPress={() => {
            close();
            if (navigationRef.isReady()) navigationRef.navigate('Account' as never);
          }}
          accessibilityRole="button"
          accessibilityLabel="Mi cuenta"
        >
          <Icon name="circle-user" size={20} color={theme.colors.secondary} />
          <Text style={styles.accountText}>Mi cuenta</Text>
          <Icon name="chevron-right" size={18} color={theme.colors.textMuted} />
        </Pressable>

        <View style={{ flex: 1 }} />

        {/* Cerrar sesión, anclado al fondo */}
        <Pressable
          style={({ pressed }) => [styles.logout, pressed && { backgroundColor: `${theme.colors.expense}26` }]}
          onPress={onLogout}
        >
          <Icon name="log-out" size={20} color={theme.colors.expense} />
          <Text style={styles.logoutText}>Cerrar sesión</Text>
        </Pressable>
        <View style={{ height: insets.bottom + theme.spacing.lg }} />
      </Animated.View>
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
    drawer: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: DRAWER_WIDTH,
      backgroundColor: theme.colors.surface,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: theme.colors.border,
      paddingHorizontal: theme.spacing.lg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: theme.spacing.lg,
    },
    headerTitle: { color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: theme.fontWeight.bold },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.surfaceLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    profile: {
      alignItems: 'center',
      paddingVertical: theme.spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    avatar: {
      width: 84,
      height: 84,
      borderRadius: theme.borderRadius.full,
      backgroundColor: `${theme.colors.primary}22`,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: theme.spacing.md,
    },
    profileName: { color: theme.colors.text, fontSize: theme.fontSize.xl, fontWeight: theme.fontWeight.bold, textAlign: 'center' },
    profileEmail: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginTop: 4, textAlign: 'center' },
    roleBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginTop: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 5,
      borderRadius: theme.borderRadius.full,
      backgroundColor: `${theme.colors.accent}1F`,
      borderWidth: 1,
      borderColor: `${theme.colors.accent}55`,
    },
    roleText: { color: theme.colors.accent, fontSize: theme.fontSize.xs, fontWeight: theme.fontWeight.bold, letterSpacing: 0.3 },
    accountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    accountText: {
      flex: 1,
      color: theme.colors.text,
      fontSize: theme.fontSize.md,
      fontWeight: theme.fontWeight.semibold,
    },
    logout: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.borderRadius.lg,
      borderWidth: 1,
      borderColor: theme.colors.expense,
    },
    logoutText: { color: theme.colors.expense, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.bold },
  });
