import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import axios from 'axios';
import Toast from 'react-native-toast-message';
import { type Theme } from '../theme';
import { useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, PrimaryButton, TextField, FormScrollView } from '../components/common';
import { authApi, getErrorMessage } from '../api/client';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ForgotPasswordScreen() {
  const navigation = useNavigation<any>();
  const styles = useThemedStyles(createStyles);

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      Toast.show({ type: 'error', text1: 'Correo inválido' });
      return;
    }
    setLoading(true);
    try {
      await authApi.forgotPassword({ email: trimmed });
      Toast.show({
        type: 'success',
        text1: 'Código enviado',
        text2: 'Revisá tu correo (incluida la carpeta de spam).',
      });
      navigation.navigate('VerifyResetCode', { email: trimmed });
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 429) {
        Toast.show({ type: 'error', text1: 'Demasiados intentos, espera un momento' });
      } else {
        Toast.show({ type: 'error', text1: 'No se pudo enviar el código', text2: getErrorMessage(err) });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader title="Recuperar contraseña" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FormScrollView contentContainerStyle={styles.content}>
          <Text style={styles.intro}>
            Ingresá el correo de tu cuenta y te enviaremos un código de 6 dígitos para crear una nueva
            contraseña.
          </Text>

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

          <View style={styles.buttonWrap}>
            <PrimaryButton label="Enviar código" onPress={onSubmit} loading={loading} />
          </View>

          <Pressable style={styles.linkRow} onPress={() => navigation.goBack()} hitSlop={8}>
            <Text style={styles.linkText}>¿Ya tenés el código? </Text>
            <Text style={styles.linkAction}>Volver</Text>
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
    linkRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginTop: theme.spacing.xl,
    },
    linkText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.md },
    linkAction: {
      color: theme.colors.primaryLight,
      fontSize: theme.fontSize.md,
      fontWeight: theme.fontWeight.bold,
    },
  });
