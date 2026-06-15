import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, SectionTitle } from '../components/common';
import { CurrencyPicker } from '../components/CurrencyPicker';
import { Icon } from '../components/Icon';
import { useSettingsStore } from '../stores/settingsStore';
import type { RootStackParamList } from '../navigation/types';

type Route = keyof RootStackParamList;
interface NavItem {
  label: string;
  icon: string;
  route: Route;
  color: (t: Theme) => string;
}

// Menú de navegación (antes vivía en el Sidebar), agrupado por sección.
const FINANZAS: NavItem[] = [
  { label: 'Cuentas', icon: 'wallet', route: 'Accounts', color: (t) => t.colors.primary },
  { label: 'Categorías', icon: 'shapes', route: 'Categories', color: (t) => t.colors.accentLight },
  { label: 'Plantillas', icon: 'zap', route: 'Templates', color: (t) => t.colors.income },
  { label: 'Etiquetas', icon: 'tag', route: 'Tags', color: (t) => t.colors.secondary },
  { label: 'Metas de ahorro', icon: 'piggy-bank', route: 'Savings', color: (t) => t.colors.income },
  { label: 'Deudas y préstamos', icon: 'landmark', route: 'Debts', color: (t) => t.colors.expense },
  { label: 'Presupuestos', icon: 'pie-chart', route: 'Budgets', color: (t) => t.colors.primary },
  { label: 'Pagos recurrentes', icon: 'repeat', route: 'Recurring', color: (t) => t.colors.secondary },
  { label: 'Gastos compartidos', icon: 'users', route: 'Splits', color: (t) => t.colors.accentLight },
];

const ANALISIS: NavItem[] = [
  { label: 'Insights', icon: 'lightbulb', route: 'Insights', color: (t) => t.colors.accentLight },
  { label: 'Tasas de cambio', icon: 'arrow-right-left', route: 'Rates', color: (t) => t.colors.income },
  { label: 'Importar / Exportar', icon: 'arrow-down-up', route: 'ImportExport', color: (t) => t.colors.secondary },
];

const AJUSTES: NavItem[] = [
  { label: 'Notificaciones', icon: 'bell', route: 'SettingsNotifications', color: (t) => t.colors.accentLight },
  { label: 'Seguridad', icon: 'lock-keyhole', route: 'Security', color: (t) => t.colors.primary },
  { label: 'Apariencia', icon: 'palette', route: 'Appearance', color: (t) => t.colors.secondary },
];

export function MoreScreen() {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<any>();
  const mainCurrency = useSettingsStore((s) => s.mainCurrency);
  const setMainCurrency = useSettingsStore((s) => s.setMainCurrency);
  const [showCurrency, setShowCurrency] = useState(false);

  const renderItem = (item: NavItem) => {
    const color = item.color(theme);
    return (
      <Pressable
        key={item.route}
        style={({ pressed }) => [styles.item, pressed && { backgroundColor: theme.colors.surfaceLight }]}
        onPress={() => navigation.navigate(item.route)}
      >
        <View style={[styles.iconWrap, { backgroundColor: `${color}22` }]}>
          <Icon name={item.icon} size={20} color={color} />
        </View>
        <Text style={styles.itemLabel}>{item.label}</Text>
        <Icon name="chevron-right" size={18} color={theme.colors.textMuted} />
      </Pressable>
    );
  };

  return (
    <Screen>
      {/* Tab raíz: sin botón de volver. */}
      <ScreenHeader title="Más" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SectionTitle title="Finanzas" />
        {FINANZAS.map(renderItem)}

        <View style={{ marginTop: theme.spacing.md }}>
          <SectionTitle title="Análisis" />
        </View>
        {ANALISIS.map(renderItem)}

        <View style={{ marginTop: theme.spacing.md }}>
          <SectionTitle title="Preferencias" />
        </View>
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
        {AJUSTES.map(renderItem)}
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
    content: { padding: theme.spacing.lg, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.xxl },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.sm + 2,
      paddingHorizontal: theme.spacing.xs,
      borderRadius: theme.borderRadius.md,
    },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: theme.borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemLabel: { flex: 1, color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.medium },
    itemValue: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold },
  });
