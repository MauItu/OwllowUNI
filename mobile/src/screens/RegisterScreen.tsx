import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import { type Theme } from '../theme';
import { useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, PrimaryButton, TextField, FormScrollView } from '../components/common';
import { Icon } from '../components/Icon';
import { useAuth } from '../hooks/useAuth';
import { getErrorMessage } from '../api/client';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RegisterScreen() {
  const navigation = useNavigation<any>();
  const styles = useThemedStyles(createStyles);
  const { register } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (!name.trim()) {
      Toast.show({ type: 'error', text1: 'Ingresa tu nombre' });
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      Toast.show({ type: 'error', text1: 'Correo inválido' });
      return;
    }
    if (password.length < 8) {
      Toast.show({ type: 'error', text1: 'La contraseña debe tener al menos 8 caracteres' });
      return;
    }
    if (password !== confirm) {
      Toast.show({ type: 'error', text1: 'Las contraseñas no coinciden' });
      return;
    }
    if (!accepted) {
      Toast.show({
        type: 'error',
        text1: 'Debes aceptar los términos y la política de privacidad',
      });
      return;
    }
    setLoading(true);
    try {
      // Registro exitoso → login automático (el provider guarda el token).
      await register(email.trim(), password, name.trim());
    } catch (err) {
      Toast.show({ type: 'error', text1: 'No se pudo crear la cuenta', text2: getErrorMessage(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader title="Crear cuenta" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FormScrollView contentContainerStyle={styles.content}>
          <Text style={styles.intro}>Crea tu cuenta para empezar a controlar tus finanzas.</Text>

          <TextField
            label="Nombre"
            value={name}
            onChangeText={setName}
            placeholder="Tu nombre"
            autoCapitalize="words"
          />
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
            placeholder="Mínimo 8 caracteres"
            secureTextEntry
            autoCapitalize="none"
          />
          <TextField
            label="Confirmar contraseña"
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Repite la contraseña"
            secureTextEntry
            autoCapitalize="none"
          />

          {/* Consentimiento de datos (habeas data): obligatorio para registrarse. */}
          <Pressable
            style={styles.consentRow}
            onPress={() => setAccepted((v) => !v)}
            hitSlop={8}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: accepted }}
            accessibilityLabel="Acepto los términos y condiciones y la política de privacidad"
          >
            <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>
              {accepted && <Icon name="check" size={14} color="#FFFFFF" strokeWidth={3} />}
            </View>
            <Text style={styles.consentText}>
              Acepto los{' '}
              <Text
                style={styles.consentLink}
                onPress={() => navigation.navigate('Legal', { doc: 'terms' })}
              >
                Términos y condiciones
              </Text>{' '}
              y la{' '}
              <Text
                style={styles.consentLink}
                onPress={() => navigation.navigate('Legal', { doc: 'privacy' })}
              >
                Política de privacidad
              </Text>
              , y autorizo el tratamiento de mis datos para prestar el servicio.
            </Text>
          </Pressable>

          <View style={styles.buttonWrap}>
            <PrimaryButton label="Crear cuenta" onPress={onSubmit} loading={loading} />
          </View>

          <Pressable style={styles.linkRow} onPress={() => navigation.goBack()} hitSlop={8}>
            <Text style={styles.linkText}>¿Ya tenés cuenta? </Text>
            <Text style={styles.linkAction}>Iniciá sesión</Text>
          </Pressable>
        </FormScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    flex: { flex: 1 },
    content: { padding: theme.spacing.lg },
    intro: {
      color: theme.colors.textSecondary,
      fontSize: theme.fontSize.md,
      marginBottom: theme.spacing.lg,
    },
    buttonWrap: { marginTop: theme.spacing.md },
    consentRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: theme.spacing.sm,
      marginTop: theme.spacing.sm,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: theme.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    checkboxChecked: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    consentText: {
      flex: 1,
      color: theme.colors.textSecondary,
      fontSize: theme.fontSize.sm,
      lineHeight: 19,
    },
    consentLink: {
      color: theme.colors.primaryLight,
      fontWeight: theme.fontWeight.bold,
    },
    linkRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginTop: theme.spacing.xl,
    },
    linkText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.md },
    linkAction: { color: theme.colors.primaryLight, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.bold },
  });
