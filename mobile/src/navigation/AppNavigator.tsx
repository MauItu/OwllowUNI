import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Icon } from '../components/Icon';
import type { RootStackParamList, TabParamList } from './types';

import { HomeScreen } from '../screens/HomeScreen';
import { TransactionsScreen } from '../screens/TransactionsScreen';
import { StatsScreen } from '../screens/StatsScreen';
import { MoreScreen } from '../screens/MoreScreen';
import { AddTransactionScreen } from '../screens/AddTransactionScreen';
import { AccountsScreen } from '../screens/AccountsScreen';
import { AddAccountScreen } from '../screens/AddAccountScreen';
import { CategoriesScreen } from '../screens/CategoriesScreen';
import { TemplatesScreen } from '../screens/TemplatesScreen';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const TAB_META: Record<keyof TabParamList, { icon: string; label: string }> = {
  Home: { icon: 'house', label: 'Inicio' },
  Transactions: { icon: 'arrow-left-right', label: 'Movimientos' },
  AddTab: { icon: 'plus', label: '' },
  Stats: { icon: 'bar-chart-3', label: 'Estadísticas' },
  More: { icon: 'menu', label: 'Más' },
};

/**
 * Tab bar a medida que respeta el SafeArea inferior (botones de navegación
 * Android) y eleva el botón central "Agregar" tipo FAB integrado.
 */
function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const styles = useThemedStyles(createStyles);
  const paddingBottom = Math.max(insets.bottom, 12) + 8;

  return (
    <View style={[styles.tabBar, { paddingBottom, height: 64 + paddingBottom }]}>
      {state.routes.map((route, index) => {
        const meta = TAB_META[route.name as keyof TabParamList];
        const isFocused = state.index === index;
        const isAdd = route.name === 'AddTab';

        const onPress = () => {
          if (isAdd) {
            navigation.navigate('AddTransaction' as never);
            return;
          }
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name as never);
          }
        };

        if (isAdd) {
          return (
            <View key={route.key} style={styles.addSlot}>
              <Pressable onPress={onPress} style={styles.addFab} hitSlop={8}>
                <Icon name="plus" size={32} color={theme.colors.background} strokeWidth={2.5} />
              </Pressable>
            </View>
          );
        }

        const color = isFocused ? theme.colors.tabActive : theme.colors.tabInactive;
        return (
          <Pressable key={route.key} style={styles.tabItem} onPress={onPress} hitSlop={4}>
            <Icon name={meta.icon} size={24} color={color} strokeWidth={isFocused ? 2.4 : 2} />
            <Text style={[styles.tabLabel, { color }]} numberOfLines={1}>
              {meta.label}
            </Text>
            {/* En oscuro, el tab seleccionado lleva un dot rosa debajo */}
            {isDark && <View style={[styles.tabDot, !isFocused && { opacity: 0 }]} />}
          </Pressable>
        );
      })}
    </View>
  );
}

// Pantalla "fantasma" para el tab central (nunca se muestra; el botón intercepta el press).
function Noop() {
  const { theme } = useTheme();
  return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
}

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Transactions" component={TransactionsScreen} />
      <Tab.Screen name="AddTab" component={Noop} />
      <Tab.Screen name="Stats" component={StatsScreen} />
      <Tab.Screen name="More" component={MoreScreen} />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  const { theme, isDark } = useTheme();
  const base = isDark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.text,
      border: theme.colors.border,
      primary: theme.colors.primary,
    },
  };
  return (
    <NavigationContainer theme={navTheme}>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="Tabs" component={Tabs} />
        <RootStack.Screen
          name="AddTransaction"
          component={AddTransactionScreen}
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <RootStack.Screen name="AddAccount" component={AddAccountScreen} options={{ presentation: 'modal' }} />
        <RootStack.Screen name="Accounts" component={AccountsScreen} />
        <RootStack.Screen name="Categories" component={CategoriesScreen} />
        <RootStack.Screen name="Templates" component={TemplatesScreen} />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: theme.colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.borderLight,
    paddingTop: 10,
  },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', gap: 4 },
  tabLabel: { fontSize: theme.fontSize.xs, fontWeight: theme.fontWeight.medium },
  tabDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: theme.colors.primary, marginTop: 1 },
  addSlot: { flex: 1, alignItems: 'center' },
  addFab: {
    width: 60,
    height: 60,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -24,
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
    borderWidth: 4,
    borderColor: theme.colors.background,
  },
});
