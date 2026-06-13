import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import axios from 'axios';
import Toast from 'react-native-toast-message';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, PrimaryButton } from '../components/common';
import { authApi, getErrorMessage } from '../api/client';
import type { AuthStackParamList } from '../navigation/types';

const CODE_LENGTH = 6;
const CODE_TTL_SECONDS = 15 * 60; // 15 minutos
const RESEND_COOLDOWN_SECONDS = 60;

/** Formatea segundos como mm:ss. */
function formatTimer(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function VerifyResetCodeScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<AuthStackParamList, 'VerifyResetCode'>>();
  const { email } = route.params;
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(CODE_TTL_SECONDS);
  const [resendIn, setResendIn] = useState(RESEND_COOLDOWN_SECONDS);

  const inputs = useRef<(TextInput | null)[]>([]);

  // Cuenta regresiva de expiración (15 min) y del throttle de reenvío (60 s).
  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
      setResendIn((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const code = digits.join('');
  const expired = secondsLeft === 0;
  const complete = code.length === CODE_LENGTH;

  const setDigit = (index: number, value: string) => {
    // Permite pegar el código completo en el primer input.
    const onlyDigits = value.replace(/\D/g, '');
    if (onlyDigits.length > 1) {
      const next = onlyDigits.slice(0, CODE_LENGTH).split('');
      const filled = [...Array(CODE_LENGTH)].map((_, i) => next[i] ?? '');
      setDigits(filled);
      const lastIdx = Math.min(onlyDigits.length, CODE_LENGTH) - 1;
      inputs.current[lastIdx]?.focus();
      return;
    }
    setDigits((prev) => {
      const copy = [...prev];
      copy[index] = onlyDigits;
      return copy;
    });
    if (onlyDigits && index < CODE_LENGTH - 1) {
      inputs.current[index + 1]?.focus();
    }
  };

  const onKeyPress = (
    index: number,
    e: NativeSyntheticEvent<TextInputKeyPressEventData>,
  ) => {
    // Backspace en un input vacío: vuelve al anterior.
    if (e.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const onVerify = async () => {
    if (!complete) {
      Toast.show({ type: 'error', text1: 'Ingresá los 6 dígitos del código' });
      return;
    }
    if (expired) {
      Toast.show({ type: 'error', text1: 'El código expiró', text2: 'Pedí uno nuevo.' });
      return;
    }
    setLoading(true);
    try {
      const { token } = await authApi.verifyResetCode({ email, code });
      navigation.navigate('ResetPassword', { token });
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Código inválido o expirado', text2: getErrorMessage(err) });
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    if (resendIn > 0) return;
    setResending(true);
    try {
      await authApi.forgotPassword({ email });
      Toast.show({ type: 'success', text1: 'Código reenviado', text2: 'Revisá tu correo.' });
      setSecondsLeft(CODE_TTL_SECONDS);
      setResendIn(RESEND_COOLDOWN_SECONDS);
      setDigits(Array(CODE_LENGTH).fill(''));
      inputs.current[0]?.focus();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 429) {
        Toast.show({ type: 'error', text1: 'Demasiados intentos, espera un momento' });
      } else {
        Toast.show({ type: 'error', text1: 'No se pudo reenviar', text2: getErrorMessage(err) });
      }
    } finally {
      setResending(false);
    }
  };

  const timerColor = useMemo(
    () => (expired ? theme.colors.expense : theme.colors.textSecondary),
    [expired, theme],
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader title="Verificar código" onBack={() => navigation.goBack()} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          <Text style={styles.intro}>
            Escribí el código de 6 dígitos que enviamos a{'\n'}
            <Text style={styles.email}>{email}</Text>
          </Text>

          <View style={styles.otpRow}>
            {digits.map((digit, i) => (
              <TextInput
                key={i}
                ref={(el) => {
                  inputs.current[i] = el;
                }}
                style={[styles.otpBox, digit && styles.otpBoxFilled]}
                value={digit}
                onChangeText={(v) => setDigit(i, v)}
                onKeyPress={(e) => onKeyPress(i, e)}
                keyboardType="number-pad"
                maxLength={CODE_LENGTH}
                textAlign="center"
                autoFocus={i === 0}
                returnKeyType="done"
              />
            ))}
          </View>

          <Text style={[styles.timer, { color: timerColor }]}>
            {expired ? 'El código expiró' : `Expira en ${formatTimer(secondsLeft)}`}
          </Text>

          <View style={styles.buttonWrap}>
            <PrimaryButton
              label="Verificar"
              onPress={onVerify}
              loading={loading}
              disabled={!complete || expired}
            />
          </View>

          <Pressable
            style={styles.linkRow}
            onPress={onResend}
            disabled={resendIn > 0 || resending}
            hitSlop={8}
          >
            <Text style={[styles.linkAction, (resendIn > 0 || resending) && styles.linkDisabled]}>
              {resendIn > 0 ? `Reenviar código en ${resendIn}s` : 'Reenviar código'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    flex: { flex: 1 },
    content: { flex: 1, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md },
    intro: {
      color: theme.colors.textSecondary,
      fontSize: theme.fontSize.md,
      textAlign: 'center',
      marginBottom: theme.spacing.xl,
    },
    email: { color: theme.colors.text, fontWeight: theme.fontWeight.semibold },
    otpRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: theme.spacing.sm,
    },
    otpBox: {
      width: 48,
      height: 56,
      borderRadius: theme.borderRadius.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceLight,
      color: theme.colors.text,
      fontSize: theme.fontSize.xl,
      fontWeight: theme.fontWeight.bold,
    },
    otpBoxFilled: { borderColor: theme.colors.primary },
    timer: {
      textAlign: 'center',
      fontSize: theme.fontSize.sm,
      marginTop: theme.spacing.md,
    },
    buttonWrap: { marginTop: theme.spacing.xl },
    linkRow: { alignItems: 'center', marginTop: theme.spacing.lg },
    linkAction: {
      color: theme.colors.primaryLight,
      fontSize: theme.fontSize.md,
      fontWeight: theme.fontWeight.bold,
    },
    linkDisabled: { color: theme.colors.textMuted },
  });
