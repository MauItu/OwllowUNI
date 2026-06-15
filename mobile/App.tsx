import 'react-native-gesture-handler';
import React, { useCallback, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { AppNavigator } from './src/navigation/AppNavigator';
import { LockScreen } from './src/screens/LockScreen';
import { SetupPinScreen } from './src/screens/SetupPinScreen';
import { Sidebar } from './src/components/Sidebar';
import { WelcomeOverlay } from './src/components/WelcomeOverlay';
import { createToastConfig } from './src/components/toastConfig';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { AppLockProvider, useAppLock } from './src/hooks/useAppLock';
import { AuthProvider, useAuth } from './src/hooks/useAuth';
import { initNotifications } from './src/services/notifications';

SplashScreen.preventAutoHideAsync().catch(() => {});

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

/** Capa interna: ya tiene acceso al tema activo, la sesión y el estado de bloqueo. */
function ThemedApp() {
  const { theme, isDark } = useTheme();
  const { ready, locked, unlock } = useAppLock();
  const { isAuthenticated, needsPinSetup, completePinSetup, welcome, dismissWelcome } = useAuth();
  const toastConfig = useMemo(() => createToastConfig(theme), [theme]);

  // Programa el recordatorio diario y reprograma alertas de deudas/metas SOLO
  // cuando hay sesión (las queries del backend requieren autenticación).
  useEffect(() => {
    if (isAuthenticated) initNotifications().catch(() => {});
  }, [isAuthenticated]);

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={theme.colors.statusBar} translucent />
      <AppNavigator />
      {/* Drawer lateral custom: overlay sobre el navigator (se abre desde el header de Home). */}
      {isAuthenticated && <Sidebar />}
      {/* El bloqueo con PIN solo aplica DESPUÉS de estar autenticado. */}
      {isAuthenticated && !ready && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.background }]} />
      )}
      {isAuthenticated && ready && locked && <LockScreen onUnlock={unlock} />}
      {/* Onboarding obligatorio de PIN tras el primer login/registro (overlay
          one-way: sin back ni gesto de swipe). Tiene prioridad sobre el lock. */}
      {isAuthenticated && needsPinSetup && <SetupPinScreen onDone={completePinSetup} />}
      {/* Bienvenida épica tras el login para usuarios con rol especial (se desvanece sola). */}
      {isAuthenticated && welcome && <WelcomeOverlay role={welcome.role} onDone={dismissWelcome} />}
      <Toast config={toastConfig} />
    </>
  );
}

export default function App() {
  const onLayoutRootView = useCallback(async () => {
    await SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    onLayoutRootView();
  }, [onLayoutRootView]);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
          <SafeAreaProvider>
            <AuthProvider>
              <ThemeProvider>
                <AppLockProvider>
                  <ThemedApp />
                </AppLockProvider>
              </ThemeProvider>
            </AuthProvider>
          </SafeAreaProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
