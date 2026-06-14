import React, { Suspense } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Icon } from '../components/Icon';
import { useAuth } from '../hooks/useAuth';
import { navigationRef } from './navigationRef';
import type { RootStackParamList, TabParamList, AuthStackParamList } from './types';

// Pantallas críticas (tab principal + flujos calientes): import estático.
import { HomeScreen } from '../screens/HomeScreen';
import { TransactionsScreen } from '../screens/TransactionsScreen';
import { AddTransactionScreen } from '../screens/AddTransactionScreen';
import { AccountsScreen } from '../screens/AccountsScreen';
import { AddAccountScreen } from '../screens/AddAccountScreen';
import { CategoriesScreen } from '../screens/CategoriesScreen';
import { TemplatesScreen } from '../screens/TemplatesScreen';
import { TagsScreen } from '../screens/TagsScreen';
import { SavingsScreen } from '../screens/SavingsScreen';
import { AddSavingsGoalScreen } from '../screens/AddSavingsGoalScreen';
import { SavingsDetailScreen } from '../screens/SavingsDetailScreen';
import { DebtsScreen } from '../screens/DebtsScreen';
import { AddDebtScreen } from '../screens/AddDebtScreen';
import { DebtDetailScreen } from '../screens/DebtDetailScreen';
import { RatesScreen } from '../screens/RatesScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';
import { VerifyResetCodeScreen } from '../screens/VerifyResetCodeScreen';
import { ResetPasswordScreen } from '../screens/ResetPasswordScreen';

/** Fallback mínimo (spinner centrado con color del tema) mientras carga una pantalla diferida. */
function ScreenFallback() {
  const { theme } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}>
      <ActivityIndicator color={theme.colors.primary} />
    </View>
  );
}

/**
 * Carga diferida de pantallas pesadas: envuelve un import() dinámico en
 * React.lazy + Suspense y devuelve un componente estable. Metro soporta import()
 * dinámico desde RN 0.72, así que esto aligera el bundle inicial / el arranque.
 * Las pantallas del tab crítico (Home/Transactions/Accounts/AddTransaction)
 * siguen siendo estáticas (ruta crítica). `any` en props es consistente con el
 * resto de la navegación (useNavigation<any>()).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lazyScreen(loader: () => Promise<{ default: React.ComponentType<any> }>): React.ComponentType<any> {
  const Lazy = React.lazy(loader);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function LazyScreen(props: any) {
    return (
      <Suspense fallback={<ScreenFallback />}>
        <Lazy {...props} />
      </Suspense>
    );
  };
}

// Pantallas pesadas: carga diferida (Stats, Insights, ImportExport, Splits*, Settings*).
const StatsScreen = lazyScreen(() => import('../screens/StatsScreen').then((m) => ({ default: m.StatsScreen })));
const InsightsScreen = lazyScreen(() => import('../screens/InsightsScreen').then((m) => ({ default: m.InsightsScreen })));
const ImportExportScreen = lazyScreen(() => import('../screens/ImportExportScreen').then((m) => ({ default: m.ImportExportScreen })));
const SplitsScreen = lazyScreen(() => import('../screens/SplitsScreen').then((m) => ({ default: m.SplitsScreen })));
const AddSplitGroupScreen = lazyScreen(() => import('../screens/AddSplitGroupScreen').then((m) => ({ default: m.AddSplitGroupScreen })));
const SplitGroupDetailScreen = lazyScreen(() => import('../screens/SplitGroupDetailScreen').then((m) => ({ default: m.SplitGroupDetailScreen })));
const AddSplitExpenseScreen = lazyScreen(() => import('../screens/AddSplitExpenseScreen').then((m) => ({ default: m.AddSplitExpenseScreen })));
const BudgetsScreen = lazyScreen(() => import('../screens/BudgetsScreen').then((m) => ({ default: m.BudgetsScreen })));
const SearchScreen = lazyScreen(() => import('../screens/SearchScreen').then((m) => ({ default: m.SearchScreen })));
const SettingsNotificationsScreen = lazyScreen(() => import('../screens/SettingsNotificationsScreen').then((m) => ({ default: m.SettingsNotificationsScreen })));
const SecurityScreen = lazyScreen(() => import('../screens/SecurityScreen').then((m) => ({ default: m.SecurityScreen })));
const AppearanceScreen = lazyScreen(() => import('../screens/AppearanceScreen').then((m) => ({ default: m.AppearanceScreen })));

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const TAB_META: Record<keyof TabParamList, { icon: string; label: string }> = {
  Home: { icon: 'house', label: 'Inicio' },
  AddTab: { icon: 'plus', label: '' },
  Accounts: { icon: 'wallet', label: 'Cuentas' },
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
      <Tab.Screen name="AddTab" component={Noop} />
      <Tab.Screen name="Accounts" component={AccountsScreen} />
    </Tab.Navigator>
  );
}

/** Stack de autenticación (sin tabs): login + registro. */
function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <AuthStack.Screen name="VerifyResetCode" component={VerifyResetCodeScreen} />
      <AuthStack.Screen name="ResetPassword" component={ResetPasswordScreen} />
    </AuthStack.Navigator>
  );
}

export function AppNavigator() {
  const { theme, isDark } = useTheme();
  const { isAuthenticated, isLoading } = useAuth();
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

  // Mientras se restaura la sesión, tapa con el color de fondo (evita parpadeo).
  if (isLoading) {
    return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;
  }

  return (
    <NavigationContainer theme={navTheme} ref={navigationRef}>
      {!isAuthenticated ? (
        <AuthNavigator />
      ) : (
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="Tabs" component={Tabs} />
        <RootStack.Screen name="Transactions" component={TransactionsScreen} />
        <RootStack.Screen
          name="AddTransaction"
          component={AddTransactionScreen}
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <RootStack.Screen name="AddAccount" component={AddAccountScreen} options={{ presentation: 'modal' }} />
        <RootStack.Screen name="Categories" component={CategoriesScreen} />
        <RootStack.Screen name="Templates" component={TemplatesScreen} />
        <RootStack.Screen name="Tags" component={TagsScreen} />
        <RootStack.Screen name="Savings" component={SavingsScreen} />
        <RootStack.Screen name="AddSavingsGoal" component={AddSavingsGoalScreen} options={{ presentation: 'modal' }} />
        <RootStack.Screen name="SavingsDetail" component={SavingsDetailScreen} />
        <RootStack.Screen name="Debts" component={DebtsScreen} />
        <RootStack.Screen name="AddDebt" component={AddDebtScreen} options={{ presentation: 'modal' }} />
        <RootStack.Screen name="DebtDetail" component={DebtDetailScreen} />
        <RootStack.Screen name="Budgets" component={BudgetsScreen} />
        <RootStack.Screen name="Search" component={SearchScreen} />
        <RootStack.Screen name="Splits" component={SplitsScreen} />
        <RootStack.Screen name="AddSplitGroup" component={AddSplitGroupScreen} options={{ presentation: 'modal' }} />
        <RootStack.Screen name="SplitGroupDetail" component={SplitGroupDetailScreen} />
        <RootStack.Screen name="AddSplitExpense" component={AddSplitExpenseScreen} options={{ presentation: 'modal' }} />
        <RootStack.Screen name="SettingsNotifications" component={SettingsNotificationsScreen} />
        <RootStack.Screen name="ImportExport" component={ImportExportScreen} />
        <RootStack.Screen name="Stats" component={StatsScreen} />
        <RootStack.Screen name="Insights" component={InsightsScreen} />
        <RootStack.Screen name="Rates" component={RatesScreen} />
        <RootStack.Screen name="Security" component={SecurityScreen} />
        <RootStack.Screen name="Appearance" component={AppearanceScreen} />
      </RootStack.Navigator>
      )}
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
