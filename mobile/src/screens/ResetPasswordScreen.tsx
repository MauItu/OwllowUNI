import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import { type Theme } from '../theme';
import { useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, PrimaryButton, TextField, FormScrollView } from '../components/common';
import { authApi, getErrorMessage } from '../api/client';
import type { AuthStackParamList } from '../navigation/types';

export function ResetPasswordScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<AuthStackParamList, 'ResetPassword'>>();
  const { token } = route.params;
  const styles = useThemedStyles(createStyles);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (password.length < 6) {
      Toast.show({ type: 'error', text1: 'La contraseña debe tener al menos 6 caracteres' });
      return;
    }
    if (password !== confirm) {
      Toast.show({ type: 'error', text1: 'Las contraseñas no coinciden' });
      return;
    }
    setLoading(true);
    try {
      await authApi.resetPassword({ token, newPassword: password });
      Toast.show({
        type: 'success',
        text1: 'Contraseña actualizada',
        text2: 'Ya podés iniciar sesión.',
      });
      // Vuelve al login (raíz del stack de auth).
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    } catch (err) {
      Toast.show({ type: 'error', text1: 'No se pudo cambiar la contraseña', text2: getErrorMessage(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader title="Nueva contraseña" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FormScrollView contentContainerStyle={styles.content}>
          <Text style={styles.intro}>Elegí una nueva contraseña para tu cuenta.</Text>

          <TextField
            label="Nueva contraseña"
            value={password}
            onChangeText={setPassword}
            placeholder="Mínimo 6 caracteres"
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

          <View style={styles.buttonWrap}>
            <PrimaryButton label="Cambiar contraseña" onPress={onSubmit} loading={loading} />
          </View>
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
  });
