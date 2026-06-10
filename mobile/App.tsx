import 'react-native-gesture-handler';
import React, { useCallback, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { AppNavigator } from './src/navigation/AppNavigator';
import { createToastConfig } from './src/components/toastConfig';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';

SplashScreen.preventAutoHideAsync().catch(() => {});

console.log('APP MOUNTED — root module evaluated');

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={eb.container}>
          <Text style={eb.title}>Algo salió mal</Text>
          <Text style={eb.message}>{this.state.error.message}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const eb = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#241B35', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { color: '#F72585', fontSize: 22, fontWeight: '700', marginBottom: 12 },
  message: { color: '#F4EFFA', fontSize: 14, textAlign: 'center' },
});

/** Capa interna: ya tiene acceso al tema activo. */
function ThemedApp() {
  const { theme, isDark } = useTheme();
  const toastConfig = useMemo(() => createToastConfig(theme), [theme]);

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={theme.colors.statusBar} translucent />
      <AppNavigator />
      <Toast config={toastConfig} />
    </>
  );
}

export default function App() {
  const onLayoutRootView = useCallback(async () => {
    await SplashScreen.hideAsync();
    console.log('APP MOUNTED — splash hidden, UI visible');
  }, []);

  useEffect(() => {
    onLayoutRootView();
  }, [onLayoutRootView]);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ThemeProvider>
            <ThemedApp />
          </ThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
