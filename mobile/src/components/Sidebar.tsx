import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Animated,
  Dimensions,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Icon } from './Icon';
import { CurrencyPicker } from './CurrencyPicker';
import { useAuth } from '../hooks/useAuth';
import { useSidebarStore } from '../stores/sidebarStore';
import { useSettingsStore } from '../stores/settingsStore';
import { navigate } from '../navigation/navigationRef';
import { currencyInfo } from '../utils/currencies';
import type { RootStackParamList } from '../navigation/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.8, 320);

type Route = keyof RootStackParamList;
interface NavItem {
  label: string;
  icon: string;
  route: Route;
  color: (t: Theme) => string;
}

// Opciones de navegación (las que estaban en MoreScreen), agrupadas por sección.
const FINANZAS: NavItem[] = [
  { label: 'Categorías', icon: 'shapes', route: 'Categories', color: (t) => t.colors.accentLight },
  { label: 'Plantillas', icon: 'zap', route: 'Templates', color: (t) => t.colors.income },
  { label: 'Etiquetas', icon: 'tag', route: 'Tags', color: (t) => t.colors.secondary },
  { label: 'Metas de ahorro', icon: 'piggy-bank', route: 'Savings', color: (t) => t.colors.income },
  { label: 'Deudas y préstamos', icon: 'landmark', route: 'Debts', color: (t) => t.colors.expense },
  { label: 'Presupuestos', icon: 'pie-chart', route: 'Budgets', color: (t) => t.colors.primary },
  { label: 'Gastos compartidos', icon: 'users', route: 'Splits', color: (t) => t.colors.accentLight },
];

const ANALISIS: NavItem[] = [
  { label: 'Estadísticas', icon: 'bar-chart-3', route: 'Stats', color: (t) => t.colors.secondary },
  { label: 'Insights', icon: 'lightbulb', route: 'Insights', color: (t) => t.colors.accentLight },
  { label: 'Tasas de cambio', icon: 'arrow-right-left', route: 'Rates', color: (t) => t.colors.income },
  { label: 'Importar / Exportar', icon: 'arrow-down-up', route: 'ImportExport', color: (t) => t.colors.secondary },
];

const AJUSTES: NavItem[] = [
  { label: 'Notificaciones', icon: 'bell', route: 'SettingsNotifications', color: (t) => t.colors.accentLight },
  { label: 'Seguridad', icon: 'lock-keyhole', route: 'Security', color: (t) => t.colors.primary },
  { label: 'Apariencia', icon: 'palette', route: 'Appearance', color: (t) => t.colors.secondary },
];

export function Sidebar() {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const isOpen = useSidebarStore((s) => s.isOpen);
  const close = useSidebarStore((s) => s.close);
  const mainCurrency = useSettingsStore((s) => s.mainCurrency);
  const setMainCurrency = useSettingsStore((s) => s.setMainCurrency);

  const progress = useRef(new Animated.Value(0)).current;
  // Mantiene el drawer montado durante la animación de cierre; lo desmonta al
  // terminar para no capturar toques mientras está oculto.
  const [mounted, setMounted] = useState(isOpen);
  const [showCurrency, setShowCurrency] = useState(false);

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

  const go = (route: Route) => {
    close();
    navigate(route);
  };

  const onLogout = () => {
    close();
    Alert.alert('Cerrar sesión', '¿Seguro que querés cerrar sesión?', [
      { text: 'Cancelar', style: 'cancel' },
      // Al cerrar sesión, isAuthenticated pasa a false y el navigator vuelve al login.
      { text: 'Cerrar sesión', style: 'destructive', onPress: () => logout() },
    ]);
  };

  const renderItem = (item: NavItem) => {
    const color = item.color(theme);
    return (
      <Pressable
        key={item.route}
        style={({ pressed }) => [styles.item, pressed && { backgroundColor: theme.colors.surfaceLight }]}
        onPress={() => go(item.route)}
      >
        <View style={[styles.iconWrap, { backgroundColor: `${color}22` }]}>
          <Icon name={item.icon} size={20} color={color} />
        </View>
        <Text style={styles.itemLabel}>{item.label}</Text>
      </Pressable>
    );
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
        {/* Perfil del usuario */}
        <View style={styles.profile}>
          <View style={styles.avatar}>
            <Icon name="user" size={26} color={theme.colors.primary} />
          </View>
          <Text style={styles.profileName} numberOfLines={1}>
            {user?.name ?? 'Mi cuenta'}
          </Text>
          <Text style={styles.profileEmail} numberOfLines={1}>
            {user?.email ?? ''}
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + theme.spacing.lg }}
          showsVerticalScrollIndicator={false}
        >
          {FINANZAS.map(renderItem)}

          <View style={styles.divider} />
          {ANALISIS.map(renderItem)}

          {/* Moneda principal abre el selector (preserva la opción de MoreScreen) */}
          <Pressable
            style={({ pressed }) => [styles.item, pressed && { backgroundColor: theme.colors.surfaceLight }]}
            onPress={() => setShowCurrency(true)}
          >
            <View style={[styles.iconWrap, { backgroundColor: `${theme.colors.income}22` }]}>
              <Icon name="circle-dollar-sign" size={20} color={theme.colors.income} />
            </View>
            <Text style={styles.itemLabel}>Moneda principal</Text>
            <Text style={styles.itemValue}>{mainCurrency}</Text>
          </Pressable>

          <View style={styles.divider} />
          {AJUSTES.map(renderItem)}

          <View style={styles.divider} />
          <Pressable
            style={({ pressed }) => [styles.item, pressed && { backgroundColor: theme.colors.surfaceLight }]}
            onPress={onLogout}
          >
            <View style={[styles.iconWrap, { backgroundColor: `${theme.colors.expense}22` }]}>
              <Icon name="log-out" size={20} color={theme.colors.expense} />
            </View>
            <Text style={[styles.itemLabel, { color: theme.colors.expense }]}>Cerrar sesión</Text>
          </Pressable>
        </ScrollView>
      </Animated.View>

      <CurrencyPicker
        visible={showCurrency}
        title="Moneda principal"
        selected={mainCurrency}
        onSelect={setMainCurrency}
        onClose={() => setShowCurrency(false)}
      />
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
    },
    profile: {
      paddingHorizontal: theme.spacing.lg,
      paddingBottom: theme.spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: theme.borderRadius.full,
      backgroundColor: `${theme.colors.primary}22`,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: theme.spacing.sm,
    },
    profileName: { color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: theme.fontWeight.bold },
    profileEmail: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginTop: 2 },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.sm,
    },
    iconWrap: {
      width: 38,
      height: 38,
      borderRadius: theme.borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemLabel: { flex: 1, color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.medium },
    itemValue: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border,
      marginVertical: theme.spacing.sm,
      marginHorizontal: theme.spacing.lg,
    },
  });
