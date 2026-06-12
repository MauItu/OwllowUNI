import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Icon } from './Icon';
import { PinDots } from './PinDots';
import { PinKeypad } from './PinKeypad';
import {
  PIN_LENGTH,
  verifyPin,
  isBiometricEnabled,
  isBiometricAvailable,
  authenticateBiometric,
} from '../services/security';

type Mode = 'create' | 'verify';

interface Props {
  visible: boolean;
  mode: Mode;
  /** Para `verify`, permite usar biometría si está activa (default true). */
  allowBiometric?: boolean;
  onClose: () => void;
  /** `create` entrega el PIN nuevo; `verify` no entrega nada (ya autenticó). */
  onComplete: (pin?: string) => void;
}

/**
 * Modal de PIN reutilizable para la pantalla de Seguridad:
 *  - `create`: ingresar PIN nuevo + confirmarlo (entrega el PIN).
 *  - `verify`: confirmar el PIN actual (o biometría) antes de una acción sensible.
 */
export function PinModal({ visible, mode, allowBiometric = true, onClose, onComplete }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [pin, setPin] = useState('');
  const [firstPin, setFirstPin] = useState<string | null>(null); // create: primer ingreso
  const [error, setError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [bioOn, setBioOn] = useState(false);
  const busyRef = useRef(false);
  const bioTriedRef = useRef(false);

  const reset = useCallback(() => {
    setPin('');
    setFirstPin(null);
    setError(false);
    setMessage(null);
    busyRef.current = false;
    bioTriedRef.current = false;
  }, []);

  const doBiometric = useCallback(async () => {
    const ok = await authenticateBiometric();
    if (ok) onComplete();
  }, [onComplete]);

  // Al abrir: resetea y, en verify con biometría, intenta biometría una vez.
  useEffect(() => {
    if (!visible) return;
    reset();
    if (mode !== 'verify' || !allowBiometric) return;
    (async () => {
      const [enabled, available] = await Promise.all([isBiometricEnabled(), isBiometricAvailable()]);
      const useBio = enabled && available;
      setBioOn(useBio);
      if (useBio && !bioTriedRef.current) {
        bioTriedRef.current = true;
        doBiometric();
      }
    })();
  }, [visible, mode, allowBiometric, reset, doBiometric]);

  const title =
    mode === 'create'
      ? firstPin == null
        ? 'Crea tu PIN'
        : 'Confirma tu PIN'
      : 'Ingresa tu PIN';
  const subtitle =
    mode === 'create'
      ? firstPin == null
        ? 'Elige un PIN de 4 dígitos'
        : 'Vuelve a ingresarlo para confirmar'
      : 'Confirma tu identidad para continuar';

  const handleComplete = async (candidate: string) => {
    if (mode === 'create') {
      if (firstPin == null) {
        setFirstPin(candidate);
        setPin('');
        return;
      }
      if (candidate === firstPin) {
        onComplete(candidate);
      } else {
        setError(true);
        setMessage('Los PIN no coinciden. Empieza de nuevo.');
        setFirstPin(null);
        setPin('');
      }
      return;
    }
    // verify
    busyRef.current = true;
    const ok = await verifyPin(candidate);
    busyRef.current = false;
    if (ok) {
      onComplete();
    } else {
      setError(true);
      setMessage('PIN incorrecto. Inténtalo de nuevo.');
      setPin('');
    }
  };

  const handleDigit = (d: string) => {
    if (busyRef.current || pin.length >= PIN_LENGTH) return;
    setError(false);
    setMessage(null);
    const next = pin + d;
    setPin(next);
    if (next.length === PIN_LENGTH) void handleComplete(next);
  };

  const handleDelete = () => {
    if (busyRef.current) return;
    setError(false);
    setPin((p) => p.slice(0, -1));
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View
        style={[
          styles.container,
          { paddingTop: insets.top + theme.spacing.md, paddingBottom: insets.bottom + theme.spacing.lg },
        ]}
      >
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.close}>
            <Icon name="x" size={22} color={theme.colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.top}>
          <View style={styles.logo}>
            <Icon name={mode === 'create' ? 'shield-plus' : 'shield-check'} size={30} color="#FFFFFF" />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          <View style={styles.dots}>
            <PinDots filled={pin.length} error={error} />
          </View>
          <Text style={[styles.message, error && { color: theme.colors.expense }]}>{message ?? ' '}</Text>
        </View>

        <View style={styles.bottom}>
          <PinKeypad
            onDigit={handleDigit}
            onDelete={handleDelete}
            onBiometric={mode === 'verify' && bioOn ? doBiometric : undefined}
          />
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background, paddingHorizontal: theme.spacing.lg },
    header: { flexDirection: 'row', justifyContent: 'flex-end' },
    close: { width: 40, height: 40, borderRadius: theme.borderRadius.full, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' },
    top: { alignItems: 'center', gap: theme.spacing.sm, marginTop: theme.spacing.md },
    logo: {
      width: 72,
      height: 72,
      borderRadius: theme.borderRadius.full,
      backgroundColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: theme.spacing.sm,
    },
    title: { color: theme.colors.text, fontSize: theme.fontSize.xl, fontWeight: theme.fontWeight.bold },
    subtitle: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, textAlign: 'center' },
    dots: { marginTop: theme.spacing.xl },
    message: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginTop: theme.spacing.lg, minHeight: 20, textAlign: 'center' },
    bottom: { gap: theme.spacing.md },
  });
