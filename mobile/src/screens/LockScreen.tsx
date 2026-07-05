import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Icon } from '../components/Icon';
import { PinDots } from '../components/PinDots';
import { PinKeypad } from '../components/PinKeypad';
import {
  PIN_LENGTH,
  MAX_ATTEMPTS,
  verifyPin,
  recordFailedAttempt,
  resetAttempts,
  getLockState,
  isBiometricEnabled,
  isBiometricAvailable,
  getBiometricKind,
  authenticateBiometric,
  type BiometricKind,
} from '../services/security';

const BIO_ICON: Record<BiometricKind, string> = {
  face: 'scan-face',
  fingerprint: 'fingerprint',
  iris: 'eye',
  generic: 'fingerprint',
};

interface Props {
  onUnlock: () => void;
}

/** Pantalla de bloqueo a nivel raíz: PIN + biometría opcional + lockout por intentos. */
export function LockScreen({ onUnlock }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lockUntil, setLockUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioKind, setBioKind] = useState<BiometricKind>('generic');
  const verifyingRef = useRef(false);
  const bioTriedRef = useRef(false);

  const lockedOut = lockUntil > now;
  const remainingSecs = Math.max(0, Math.ceil((lockUntil - now) / 1000));

  const tryBiometric = useCallback(async () => {
    const ok = await authenticateBiometric();
    if (ok) {
      await resetAttempts();
      onUnlock();
    }
  }, [onUnlock]);

  // Carga inicial: estado de lockout + disponibilidad de biometría; auto-dispara biometría.
  useEffect(() => {
    let active = true;
    (async () => {
      const state = await getLockState();
      if (!active) return;
      setLockUntil(state.lockUntil);

      const [enabled, available] = await Promise.all([isBiometricEnabled(), isBiometricAvailable()]);
      if (!active) return;
      const useBio = enabled && available;
      setBioEnabled(useBio);
      if (useBio) setBioKind(await getBiometricKind());

      // Dispara la biometría automáticamente al montar (si no hay lockout activo).
      if (useBio && !bioTriedRef.current && state.lockUntil <= Date.now()) {
        bioTriedRef.current = true;
        tryBiometric();
      }
    })();
    return () => {
      active = false;
    };
  }, [tryBiometric]);

  // Tick del contador mientras dure el lockout.
  useEffect(() => {
    if (!lockedOut) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [lockedOut]);

  const handleDigit = (d: string) => {
    if (lockedOut || verifyingRef.current || pin.length >= PIN_LENGTH) return;
    setError(false);
    setMessage(null);
    const next = pin + d;
    setPin(next);
    if (next.length === PIN_LENGTH) void check(next);
  };

  const handleDelete = () => {
    if (lockedOut || verifyingRef.current) return;
    setError(false);
    setPin((p) => p.slice(0, -1));
  };

  const check = async (candidate: string) => {
    verifyingRef.current = true;
    const ok = await verifyPin(candidate);
    if (ok) {
      await resetAttempts();
      verifyingRef.current = false;
      onUnlock();
      return;
    }
    const state = await recordFailedAttempt();
    setError(true);
    setPin('');
    if (state.lockUntil > 0) {
      setLockUntil(state.lockUntil);
      setNow(Date.now());
      setMessage('Demasiados intentos. Espera unos segundos.');
    } else {
      const left = MAX_ATTEMPTS - state.attempts;
      setMessage(`PIN incorrecto. Te ${left === 1 ? 'queda' : 'quedan'} ${left} intento${left === 1 ? '' : 's'}.`);
    }
    verifyingRef.current = false;
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + theme.spacing.xl, paddingBottom: insets.bottom + theme.spacing.lg }]}>
      <View style={styles.top}>
        <View style={styles.logo}>
          <Icon name="lock-keyhole" size={34} color="#FFFFFF" />
        </View>
        <Text style={styles.title}>Owllow bloqueada</Text>
        <Text style={styles.subtitle}>Ingresa tu PIN para continuar</Text>

        <View style={styles.dots}>
          <PinDots filled={pin.length} error={error} />
        </View>

        <Text style={[styles.message, lockedOut && { color: theme.colors.expense }]}>
          {lockedOut ? `Inténtalo de nuevo en ${remainingSecs}s` : message ?? ' '}
        </Text>
      </View>

      <View style={styles.bottom}>
        <PinKeypad
          onDigit={handleDigit}
          onDelete={handleDelete}
          onBiometric={bioEnabled ? tryBiometric : undefined}
          biometricIcon={BIO_ICON[bioKind]}
          disabled={lockedOut}
        />
        {bioEnabled && !lockedOut && (
          <Pressable style={styles.bioLink} onPress={tryBiometric} hitSlop={8}>
            <Icon name={BIO_ICON[bioKind]} size={16} color={theme.colors.primaryLight} />
            <Text style={styles.bioLinkText}>Usar biometría</Text>
          </Pressable>
        )}
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
    title: { color: theme.colors.text, fontSize: theme.fontSize.xl, fontWeight: theme.fontWeight.bold },
    subtitle: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm },
    dots: { marginTop: theme.spacing.xl },
    message: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginTop: theme.spacing.lg, minHeight: 20, textAlign: 'center' },
    bottom: { gap: theme.spacing.md },
    bioLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.sm },
    bioLinkText: { color: theme.colors.primaryLight, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold },
  });
