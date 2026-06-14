import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Icon } from '../components/Icon';
import { PinDots } from '../components/PinDots';
import { PinKeypad } from '../components/PinKeypad';
import { showInfo } from '../components/toastConfig';
import { useAppLock } from '../hooks/useAppLock';
import {
  PIN_LENGTH,
  setPin as persistPin,
  isBiometricAvailable,
  getBiometricKind,
  authenticateBiometric,
  setBiometricEnabled,
  type BiometricKind,
} from '../services/security';

const BIO_META: Record<BiometricKind, { icon: string; label: string }> = {
  face: { icon: 'scan-face', label: 'tu rostro' },
  fingerprint: { icon: 'fingerprint', label: 'tu huella' },
  iris: { icon: 'eye', label: 'tu iris' },
  generic: { icon: 'fingerprint', label: 'tu biometría' },
};

type Step = 'create' | 'confirm' | 'biometric' | 'done';

interface Props {
  /** Se llama al terminar el onboarding (revela el Home). */
  onDone: () => void;
}

/**
 * Onboarding obligatorio de PIN tras el primer login/registro. Flujo en pasos
 * dentro de una sola pantalla (overlay raíz, sin navegación → sin back ni gesto
 * de swipe). NO usa la lógica de bloqueo: solo configura el PIN/biometría con
 * `services/security.ts` y NO bloquea en esta sesión (el usuario recién entró).
 */
export function SetupPinScreen({ onDone }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { refresh: refreshLock } = useAppLock();

  const [step, setStep] = useState<Step>('create');
  const [pin, setPin] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [error, setError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioKind, setBioKind] = useState<BiometricKind>('generic');
  const busyRef = useRef(false);

  const shake = useRef(new Animated.Value(0)).current;

  // Detecta disponibilidad de biometría una vez (decide si se muestra el paso 3).
  useEffect(() => {
    let active = true;
    (async () => {
      const available = await isBiometricAvailable();
      if (!active) return;
      setBioAvailable(available);
      if (available) setBioKind(await getBiometricKind());
    })();
    return () => {
      active = false;
    };
  }, []);

  const runShake = useCallback(() => {
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 1, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shake]);

  // Tras confirmar el PIN: lo guarda y decide si pasa a biometría o a la confirmación.
  const savePin = useCallback(
    async (value: string) => {
      busyRef.current = true;
      try {
        await persistPin(value);
        // El AppLock ahora sabe que hay PIN (no bloquea en esta sesión).
        await refreshLock();
        setPin('');
        setStep(bioAvailable ? 'biometric' : 'done');
      } catch {
        setMessage('No se pudo guardar el PIN. Intenta de nuevo.');
        setError(true);
        runShake();
        setPin('');
        setFirstPin('');
        setStep('create');
      } finally {
        busyRef.current = false;
      }
    },
    [bioAvailable, refreshLock, runShake],
  );

  const handleDigit = (d: string) => {
    if (busyRef.current || pin.length >= PIN_LENGTH) return;
    setError(false);
    setMessage(null);
    const next = pin + d;
    setPin(next);
    if (next.length < PIN_LENGTH) return;

    if (step === 'create') {
      setFirstPin(next);
      setPin('');
      setStep('confirm');
      return;
    }
    if (step === 'confirm') {
      if (next === firstPin) {
        void savePin(next);
      } else {
        setError(true);
        setMessage('Los PINs no coinciden. Intenta de nuevo.');
        runShake();
        setPin('');
        setFirstPin('');
        setStep('create');
      }
    }
  };

  const handleDelete = () => {
    if (busyRef.current) return;
    setError(false);
    setPin((p) => p.slice(0, -1));
  };

  const enableBio = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const ok = await authenticateBiometric();
      if (ok) {
        await setBiometricEnabled(true);
      } else {
        showInfo('Puedes activarlo después en Seguridad.', 'No se pudo verificar');
      }
    } catch {
      showInfo('Puedes activarlo después en Seguridad.', 'No se pudo verificar');
    } finally {
      busyRef.current = false;
      setStep('done');
    }
  };

  // ─────────────────────────── Render por paso ───────────────────────────

  if (step === 'biometric') {
    const bio = BIO_META[bioKind];
    return (
      <View style={[styles.container, { paddingTop: insets.top + theme.spacing.xl, paddingBottom: insets.bottom + theme.spacing.lg }]}>
        <View style={styles.top}>
          <View style={styles.logo}>
            <Icon name={bio.icon} size={34} color="#FFFFFF" />
          </View>
          <Text style={styles.title}>Desbloqueo rápido</Text>
          <Text style={styles.subtitle}>¿Deseas usar {bio.label} para desbloquear la app?</Text>
        </View>
        <View style={styles.bottom}>
          <Pressable style={styles.primaryBtn} onPress={enableBio}>
            <Text style={styles.primaryBtnText}>Activar</Text>
          </Pressable>
          <Pressable style={styles.ghostBtn} onPress={() => setStep('done')}>
            <Text style={styles.ghostBtnText}>Ahora no</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (step === 'done') {
    return (
      <View style={[styles.container, { paddingTop: insets.top + theme.spacing.xl, paddingBottom: insets.bottom + theme.spacing.lg }]}>
        <View style={styles.top}>
          <View style={[styles.logo, { backgroundColor: theme.colors.income }]}>
            <Icon name="shield-check" size={36} color="#FFFFFF" />
          </View>
          <Text style={styles.title}>¡Listo!</Text>
          <Text style={styles.subtitle}>Tu app está protegida.</Text>
        </View>
        <View style={styles.bottom}>
          <Pressable style={styles.primaryBtn} onPress={onDone}>
            <Text style={styles.primaryBtnText}>Continuar</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Pasos 1 y 2 (create / confirm): teclado + dots.
  const isConfirm = step === 'confirm';
  return (
    <View style={[styles.container, { paddingTop: insets.top + theme.spacing.xl, paddingBottom: insets.bottom + theme.spacing.lg }]}>
      <View style={styles.top}>
        <View style={styles.logo}>
          <Icon name="lock-keyhole" size={34} color="#FFFFFF" />
        </View>
        <Text style={styles.title}>{isConfirm ? 'Confirma tu PIN' : 'Configura tu PIN'}</Text>
        <Text style={styles.subtitle}>
          {isConfirm ? 'Ingresa el mismo PIN otra vez' : 'Elige un PIN de 4 dígitos'}
        </Text>

        <Animated.View
          style={[
            styles.dots,
            { transform: [{ translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-10, 10] }) }] },
          ]}
        >
          <PinDots filled={pin.length} error={error} />
        </Animated.View>

        <Text style={[styles.message, error && { color: theme.colors.expense }]}>{message ?? ' '}</Text>
      </View>

      <View style={styles.bottom}>
        <PinKeypad onDigit={handleDigit} onDelete={handleDelete} />
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.colors.background,
      paddingHorizontal: theme.spacing.lg,
      justifyContent: 'space-between',
      zIndex: 1000,
      elevation: 1000,
    },
    top: { alignItems: 'center', gap: theme.spacing.sm, marginTop: theme.spacing.xl },
    logo: {
      width: 76,
      height: 76,
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: theme.spacing.md,
      shadowColor: theme.colors.primary,
      shadowOpacity: 0.4,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 8,
    },
    title: { color: theme.colors.text, fontSize: theme.fontSize.xl, fontWeight: theme.fontWeight.bold, textAlign: 'center' },
    subtitle: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, textAlign: 'center', paddingHorizontal: theme.spacing.lg },
    dots: { marginTop: theme.spacing.xl },
    message: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginTop: theme.spacing.lg, minHeight: 20, textAlign: 'center' },
    bottom: { gap: theme.spacing.md },
    primaryBtn: {
      backgroundColor: theme.colors.primary,
      borderRadius: theme.borderRadius.lg,
      paddingVertical: theme.spacing.md,
      alignItems: 'center',
    },
    primaryBtnText: { color: '#FFFFFF', fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold },
    ghostBtn: { paddingVertical: theme.spacing.md, alignItems: 'center' },
    ghostBtnText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.medium },
  });
