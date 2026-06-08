import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator, type BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../theme';
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

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: theme.colors.background,
    card: theme.colors.surface,
    text: theme.colors.text,
    border: theme.colors.border,
    primary: theme.colors.primary,
  },
};

const TAB_ICONS: Record<keyof TabParamList, string> = {
  Home: 'house',
  Transactions: 'list',
  AddTab: 'plus',
  Stats: 'pie-chart',
  More: 'menu',
};

const TAB_LABELS: Record<keyof TabParamList, string> = {
  Home: 'Inicio',
  Transactions: 'Movimientos',
  AddTab: '',
  Stats: 'Stats',
  More: 'Más',
};

/** Botón central tipo FAB que abre el modal de Agregar transacción. */
function AddTabButton({ children }: BottomTabBarButtonProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <Pressable style={styles.fabWrap} onPress={() => navigation.navigate('AddTransaction')}>
      <View style={styles.fab}>{children}</View>
    </Pressable>
  );
}

// Pantalla "fantasma" para el tab central (nunca se muestra; el botón intercepta el press).
function Noop() {
  return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
}

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: theme.colors.primaryLight,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarLabelStyle: { fontSize: 11 },
        tabBarIcon: ({ color }) => {
          const name = TAB_ICONS[route.name as keyof TabParamList];
          const size = route.name === 'AddTab' ? 28 : 22;
          const iconColor = route.name === 'AddTab' ? '#fff' : color;
          return <Icon name={name} size={size} color={iconColor} />;
        },
        tabBarLabel: TAB_LABELS[route.name as keyof TabParamList],
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Transactions" component={TransactionsScreen} />
      <Tab.Screen
        name="AddTab"
        component={Noop}
        options={{ tabBarButton: (props) => <AddTabButton {...props} /> }}
      />
      <Tab.Screen name="Stats" component={StatsScreen} />
      <Tab.Screen name="More" component={MoreScreen} />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
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

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: theme.colors.surface,
    borderTopColor: theme.colors.border,
    height: 64,
    paddingBottom: 8,
    paddingTop: 6,
  },
  fabWrap: { top: -18, justifyContent: 'center', alignItems: 'center' },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});
