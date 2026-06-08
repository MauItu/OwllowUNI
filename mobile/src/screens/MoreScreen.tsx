import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../theme';
import { Screen, ScreenHeader } from '../components/common';
import { Icon } from '../components/Icon';
import { API_BASE_URL } from '../api/client';

const ITEMS: { label: string; description: string; icon: string; route: string; color: string }[] = [
  { label: 'Cuentas', description: 'Gestiona tus cuentas y tarjetas', icon: 'wallet', route: 'Accounts', color: theme.colors.primary },
  { label: 'Categorías', description: 'Organiza ingresos y gastos', icon: 'shapes', route: 'Categories', color: theme.colors.warning },
  { label: 'Plantillas', description: 'Movimientos frecuentes', icon: 'bookmark', route: 'Templates', color: theme.colors.success },
];

export function MoreScreen() {
  const navigation = useNavigation<any>();
  return (
    <Screen>
      <ScreenHeader title="Más" />
      <ScrollView contentContainerStyle={styles.content}>
        {ITEMS.map((item) => (
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

const styles = StyleSheet.create({
  content: { padding: theme.spacing.md },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  iconWrap: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  label: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: '600' },
  description: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginTop: 2 },
  footer: { alignItems: 'center', marginTop: theme.spacing.xl, gap: 2 },
  footerTitle: { color: theme.colors.textSecondary, fontSize: theme.fontSize.md, fontWeight: '700' },
  footerText: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs },
});
