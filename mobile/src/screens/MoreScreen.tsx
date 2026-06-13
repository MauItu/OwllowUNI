import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, SectionTitle } from '../components/common';
import { Icon } from '../components/Icon';
import { CurrencyPicker } from '../components/CurrencyPicker';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuth } from '../hooks/useAuth';
import { currencyInfo } from '../utils/currencies';
import { API_BASE_URL } from '../api/client';

export function MoreScreen() {
  const navigation = useNavigation<any>();
  const { theme, isDark, availablePalettes, paletteId } = useTheme();
  const styles = useThemedStyles(createStyles);
  const mainCurrency = useSettingsStore((s) => s.mainCurrency);
  const setMainCurrency = useSettingsStore((s) => s.setMainCurrency);
  const { user, logout } = useAuth();
  const [showCurrency, setShowCurrency] = useState(false);

  const onLogout = () => {
    Alert.alert('Cerrar sesión', '¿Seguro que querés cerrar sesión?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        style: 'destructive',
        // Al cerrar sesión, isAuthenticated pasa a false y el navigator
        // vuelve al stack de login automáticamente.
        onPress: () => {
          logout();
        },
      },
    ]);
  };

  const items: { label: string; description: string; icon: string; route: string; color: string }[] = [
    { label: 'Insights', description: 'Análisis automático de tus gastos', icon: 'lightbulb', route: 'Insights', color: theme.colors.accentLight },
    { label: 'Cuentas', description: 'Gestiona tus cuentas y tarjetas', icon: 'wallet', route: 'Accounts', color: theme.colors.primary },
    { label: 'Categorías', description: 'Organiza ingresos y gastos', icon: 'shapes', route: 'Categories', color: theme.colors.accentLight },
    { label: 'Plantillas', description: 'Movimientos frecuentes', icon: 'zap', route: 'Templates', color: theme.colors.income },
    { label: 'Etiquetas', description: 'Etiqueta libre para tus movimientos', icon: 'tag', route: 'Tags', color: theme.colors.secondary },
    { label: 'Metas de ahorro', description: 'Ahorra para tus objetivos', icon: 'piggy-bank', route: 'Savings', color: theme.colors.income },
    { label: 'Deudas y préstamos', description: 'Controla lo que debes y te deben', icon: 'landmark', route: 'Debts', color: theme.colors.expense },
    { label: 'Gastos compartidos', description: 'Divide gastos con tu gente', icon: 'users', route: 'Splits', color: theme.colors.accentLight },
  ];

  return (
    <Screen>
      <ScreenHeader title="Más" />
      <ScrollView contentContainerStyle={styles.content}>
        {items.map((item) => (
          <Pressable
            key={item.route}
            style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}
            onPress={() => navigation.navigate(item.route)}
          >
            <View style={[styles.iconWrap, { backgroundColor: `${item.color}22` }]}>
              <Icon name={item.icon} size={22} color={item.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{item.label}</Text>
              <Text style={styles.description}>{item.description}</Text>
            </View>
            <Icon name="chevron-right" size={20} color={theme.colors.textMuted} />
          </Pressable>
        ))}

        <View style={styles.sectionGap}>
          <SectionTitle title="Ajustes" />
        </View>
        <Pressable
          style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}
          onPress={() => setShowCurrency(true)}
        >
          <View style={[styles.iconWrap, { backgroundColor: `${theme.colors.income}22` }]}>
            <Icon name="circle-dollar-sign" size={22} color={theme.colors.income} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Moneda principal</Text>
            <Text style={styles.description}>
              {currencyInfo(mainCurrency)
                ? `${mainCurrency} · ${currencyInfo(mainCurrency)!.name}`
                : mainCurrency}{' '}
              · para el balance consolidado
            </Text>
          </View>
          <Icon name="chevron-right" size={20} color={theme.colors.textMuted} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}
          onPress={() => navigation.navigate('ImportExport')}
        >
          <View style={[styles.iconWrap, { backgroundColor: `${theme.colors.secondary}22` }]}>
            <Icon name="arrow-down-up" size={22} color={theme.colors.secondary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Importar / Exportar</Text>
            <Text style={styles.description}>Respalda o restaura tus movimientos (CSV/JSON)</Text>
          </View>
          <Icon name="chevron-right" size={20} color={theme.colors.textMuted} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}
          onPress={() => navigation.navigate('Security')}
        >
          <View style={[styles.iconWrap, { backgroundColor: `${theme.colors.primary}22` }]}>
            <Icon name="lock-keyhole" size={22} color={theme.colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Seguridad</Text>
            <Text style={styles.description}>Bloqueo con PIN y biometría</Text>
          </View>
          <Icon name="chevron-right" size={20} color={theme.colors.textMuted} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}
          onPress={() => navigation.navigate('SettingsNotifications')}
        >
          <View style={[styles.iconWrap, { backgroundColor: `${theme.colors.accent}22` }]}>
            <Icon name="bell" size={22} color={theme.colors.accentLight} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Notificaciones</Text>
            <Text style={styles.description}>Recordatorios y alertas de vencimientos</Text>
          </View>
          <Icon name="chevron-right" size={20} color={theme.colors.textMuted} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}
          onPress={() => navigation.navigate('Appearance')}
        >
          <View style={[styles.iconWrap, { backgroundColor: `${theme.colors.secondary}22` }]}>
            <Icon name="palette" size={22} color={theme.colors.secondary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Apariencia</Text>
            <Text style={styles.description}>
              {availablePalettes.find((p) => p.id === paletteId)?.label} · {isDark ? 'Oscuro' : 'Claro'}
            </Text>
          </View>
          <Icon name="chevron-right" size={20} color={theme.colors.textMuted} />
        </Pressable>

        <View style={styles.sectionGap}>
          <SectionTitle title="Cuenta" />
        </View>
        <View style={styles.accountCard}>
          <View style={[styles.iconWrap, { backgroundColor: `${theme.colors.secondary}22` }]}>
            <Icon name="user" size={22} color={theme.colors.secondary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{user?.name ?? 'Mi cuenta'}</Text>
            <Text style={styles.description} numberOfLines={1}>
              {user?.email ?? ''}
            </Text>
          </View>
        </View>
        <Pressable
          style={({ pressed }) => [styles.logout, pressed && { opacity: 0.6 }]}
          onPress={onLogout}
        >
          <Icon name="log-out" size={20} color={theme.colors.expense} />
          <Text style={styles.logoutText}>Cerrar sesión</Text>
        </Pressable>

        <View style={styles.footer}>
          <Text style={styles.footerTitle}>Wallet Clone</Text>
          <Text style={styles.footerText}>v1.0.0</Text>
          <Text style={styles.footerText} numberOfLines={1}>
            API: {API_BASE_URL}
          </Text>
        </View>
      </ScrollView>

      <CurrencyPicker
        visible={showCurrency}
        title="Moneda principal"
        selected={mainCurrency}
        onSelect={setMainCurrency}
        onClose={() => setShowCurrency(false)}
      />
    </Screen>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { padding: theme.spacing.lg },
    item: {
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
    iconWrap: { width: 46, height: 46, borderRadius: theme.borderRadius.full, alignItems: 'center', justifyContent: 'center' },
    label: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold },
    description: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginTop: 2 },
    sectionGap: { marginTop: theme.spacing.lg },
    accountCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.md,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
    },
    logout: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.md,
      marginTop: theme.spacing.sm,
    },
    logoutText: {
      color: theme.colors.expense,
      fontSize: theme.fontSize.md,
      fontWeight: theme.fontWeight.semibold,
    },
    footer: { alignItems: 'center', marginTop: theme.spacing.xl, gap: 2 },
    footerTitle: { color: theme.colors.textSecondary, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.bold },
    footerText: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs },
  });
