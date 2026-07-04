import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, PrimaryButton, TextField } from '../components/common';
import { Icon } from '../components/Icon';
import { useAuth } from '../hooks/useAuth';
import { getErrorMessage } from '../api/client';

export function LoginScreen() {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!email.trim() || !password) {
      Toast.show({ type: 'error', text1: 'Completa tu correo y contraseña' });
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
      // El cambio de isAuthenticated re-renderiza el navigator hacia la app.
    } catch (err) {
      Toast.show({ type: 'error', text1: 'No se pudo iniciar sesión', text2: getErrorMessage(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          <View style={styles.logoWrap}>
            <Icon name="wallet" size={44} color={theme.colors.primary} strokeWidth={2.2} />
          </View>
          <Text style={styles.title}>Bienvenido de nuevo</Text>
          <Text style={styles.subtitle}>Inicia sesión para continuar</Text>

          <View style={styles.form}>
            <TextField
              label="Correo electrónico"
              value={email}
              onChangeText={setEmail}
              placeholder="tu@correo.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
            />
            <TextField
              label="Contraseña"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              autoCapitalize="none"
            />
            <View style={styles.buttonWrap}>
              <PrimaryButton label="Iniciar sesión" onPress={onSubmit} loading={loading} />
            </View>
            <Pressable
              style={styles.forgotRow}
              onPress={() => navigation.navigate('ForgotPassword')}
              hitSlop={8}
            >
              <Text style={styles.forgotText}>¿Olvidaste tu contraseña?</Text>
            </Pressable>
          </View>

          <Pressable
            style={styles.linkRow}
            onPress={() => navigation.navigate('Register')}
            hitSlop={8}
          >
            <Text style={styles.linkText}>¿No tenés cuenta? </Text>
            <Text style={styles.linkAction}>Regístrate</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    flex: { flex: 1 },
    content: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.lg,
    },
    logoWrap: {
      alignSelf: 'center',
      width: 84,
      height: 84,
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: theme.spacing.lg,
    },
    title: {
      color: theme.colors.text,
      fontSize: theme.fontSize.xxl,
      fontWeight: theme.fontWeight.bold,
      textAlign: 'center',
    },
    subtitle: {
      color: theme.colors.textSecondary,
      fontSize: theme.fontSize.md,
      textAlign: 'center',
      marginTop: theme.spacing.xs,
      marginBottom: theme.spacing.xl,
    },
    form: { gap: theme.spacing.xs },
    buttonWrap: { marginTop: theme.spacing.md },
    forgotRow: { alignItems: 'center', marginTop: theme.spacing.md },
    forgotText: {
      color: theme.colors.primaryLight,
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.medium,
    },
    linkRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginTop: theme.spacing.xl,
    },
    linkText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.md },
    linkAction: { color: theme.colors.primaryLight, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.bold },
  });
