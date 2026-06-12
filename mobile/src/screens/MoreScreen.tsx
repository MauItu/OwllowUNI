import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Switch } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, SectionTitle } from '../components/common';
import { Icon } from '../components/Icon';
import { API_BASE_URL } from '../api/client';

export function MoreScreen() {
  const navigation = useNavigation<any>();
  const { theme, isDark, toggleTheme } = useTheme();
  const styles = useThemedStyles(createStyles);

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

        <View style={styles.sectionGap}>
          <SectionTitle title="Apariencia" />
        </View>
        <View style={styles.item}>
          <View style={[styles.iconWrap, { backgroundColor: `${theme.colors.secondary}22` }]}>
            <Icon name={isDark ? 'moon' : 'sun'} size={22} color={theme.colors.secondary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Tema oscuro</Text>
            <Text style={styles.description}>
              {isDark ? 'Orquídea / Morado Velvet' : 'Minimalista Nórdico'}
            </Text>
          </View>
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{ false: theme.colors.border, true: theme.colors.primaryDark }}
            thumbColor={isDark ? theme.colors.primary : theme.colors.surfaceLight}
            accessibilityLabel="Cambiar entre tema claro y oscuro"
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerTitle}>Wallet Clone</Text>
          <Text style={styles.footerText}>v1.0.0</Text>
          <Text style={styles.footerText} numberOfLines={1}>
            API: {API_BASE_URL}
          </Text>
        </View>
      </ScrollView>
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
    footer: { alignItems: 'center', marginTop: theme.spacing.xl, gap: 2 },
    footerTitle: { color: theme.colors.textSecondary, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.bold },
    footerText: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs },
  });
