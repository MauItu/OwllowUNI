import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, Loading } from '../components/common';
import { Icon } from '../components/Icon';
import { PinModal } from '../components/PinModal';
import { useAppLock } from '../hooks/useAppLock';
import { showSuccess, showError, showInfo } from '../components/toastConfig';
import {
  isPinEnabled,
  setPin,
  disableLock,
  isBiometricAvailable,
  isBiometricEnabled,
  setBiometricEnabled,
  getBiometricKind,
  authenticateBiometric,
  type BiometricKind,
} from '../services/security';

const BIO_META: Record<BiometricKind, { icon: string; label: string }> = {
  face: { icon: 'scan-face', label: 'Reconocimiento facial' },
  fingerprint: { icon: 'fingerprint', label: 'Huella digital' },
  iris: { icon: 'eye', label: 'Iris' },
  generic: { icon: 'fingerprint', label: 'Biometría' },
};

type Purpose = 'enable' | 'disable' | 'change-verify' | 'change-create';
interface ModalState {
  mode: 'create' | 'verify';
  purpose: Purpose;
}

export function SecurityScreen() {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { refresh: refreshLock } = useAppLock();

  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioKind, setBioKind] = useState<BiometricKind>('generic');
  const [modal, setModal] = useState<ModalState | null>(null);

  const reload = useCallback(async () => {
    const [on, available, kind] = await Promise.all([
      isPinEnabled(),
      isBiometricAvailable(),
      getBiometricKind(),
    ]);
    setEnabled(on);
    setBioAvailable(available);
    setBioKind(kind);
    setBioEnabled(on && available ? await isBiometricEnabled() : false);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const applySetPin = async (pin: string) => {
    try {
      await setPin(pin);
      showSuccess('PIN configurado');
      await reload();
      await refreshLock();
    } catch {
      showError('No se pudo guardar el PIN. Inténtalo de nuevo.');
    }
  };

  const applyDisable = async () => {
    try {
      await disableLock();
      showSuccess('Bloqueo desactivado');
      await reload();
      await refreshLock();
    } catch {
      showError('No se pudo desactivar el bloqueo.');
    }
  };

  const handleModalComplete = async (pin?: string) => {
    const m = modal;
    if (!m) return;
    if (m.purpose === 'enable') {
      setModal(null);
      if (pin) await applySetPin(pin);
    } else if (m.purpose === 'disable') {
      setModal(null);
      await applyDisable();
    } else if (m.purpose === 'change-verify') {
      // Verificado el PIN actual → ahora pedir el nuevo.
      setModal({ mode: 'create', purpose: 'change-create' });
    } else if (m.purpose === 'change-create') {
      setModal(null);
      if (pin) await applySetPin(pin);
    }
  };

  const onTogglePin = (value: boolean) => {
    if (value) setModal({ mode: 'create', purpose: 'enable' });
    else setModal({ mode: 'verify', purpose: 'disable' });
  };

  const onToggleBiometric = async (value: boolean) => {
    if (!value) {
      await setBiometricEnabled(false);
      setBioEnabled(false);
      return;
    }
    // Al activar, confirmamos que la biometría funciona antes de guardarla.
    const ok = await authenticateBiometric();
    if (ok) {
      await setBiometricEnabled(true);
      setBioEnabled(true);
      showSuccess('Desbloqueo biométrico activado');
    } else {
      showInfo('No se pudo verificar la biometría');
    }
  };

  if (loading) {
    return (
      <Screen>
        <ScreenHeader title="Seguridad" onBack={() => navigation.goBack()} />
        <Loading />
      </Screen>
    );
  }

  const bio = BIO_META[bioKind];

  return (
    <Screen>
      <ScreenHeader title="Seguridad" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Protege la app con un PIN de 4 dígitos. Todo se guarda de forma local y cifrada en este dispositivo.
        </Text>

        {/* Bloqueo con PIN */}
        <View style={styles.row}>
          <View style={[styles.iconWrap, { backgroundColor: `${theme.colors.primary}22` }]}>
            <Icon name="lock-keyhole" size={22} color={theme.colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Bloquear app con PIN</Text>
            <Text style={styles.description}>Pide el PIN al abrir y tras 60s en segundo plano</Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={onTogglePin}
            trackColor={{ false: theme.colors.border, true: theme.colors.primaryDark }}
            thumbColor={enabled ? theme.colors.primary : theme.colors.surfaceLight}
          />
        </View>

        {/* Biometría (solo si hay PIN activo) */}
        {enabled && (
          <View style={[styles.row, !bioAvailable && { opacity: 0.6 }]}>
            <View style={[styles.iconWrap, { backgroundColor: `${theme.colors.secondary}22` }]}>
              <Icon name={bio.icon} size={22} color={theme.colors.secondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Desbloquear con {bio.label.toLowerCase()}</Text>
              <Text style={styles.description}>
                {bioAvailable
                  ? 'Usa tu biometría en vez del PIN'
                  : 'Configura la biometría en los ajustes del sistema'}
              </Text>
            </View>
            <Switch
              value={bioEnabled}
              onValueChange={onToggleBiometric}
              disabled={!bioAvailable}
              trackColor={{ false: theme.colors.border, true: theme.colors.secondary }}
              thumbColor={bioEnabled ? theme.colors.secondary : theme.colors.surfaceLight}
            />
          </View>
        )}

        {/* Cambiar PIN */}
        {enabled && (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            onPress={() => setModal({ mode: 'verify', purpose: 'change-verify' })}
          >
            <View style={[styles.iconWrap, { backgroundColor: `${theme.colors.accent}22` }]}>
              <Icon name="key-round" size={22} color={theme.colors.accentLight} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Cambiar PIN</Text>
              <Text style={styles.description}>Requiere tu PIN actual o biometría</Text>
            </View>
            <Icon name="chevron-right" size={20} color={theme.colors.textMuted} />
          </Pressable>
        )}

        <View style={styles.note}>
          <Icon name="info" size={15} color={theme.colors.textMuted} />
          <Text style={styles.noteText}>
            La biometría se prueba de verdad en el APK / development build; en Expo Go o emuladores puede no estar
            disponible y la app cae al PIN.
          </Text>
        </View>
      </ScrollView>

      <PinModal
        visible={modal != null}
        mode={modal?.mode ?? 'verify'}
        onClose={() => setModal(null)}
        onComplete={handleModalComplete}
      />
    </Screen>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { padding: theme.spacing.lg },
    intro: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginBottom: theme.spacing.lg, lineHeight: 19 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
    },
    iconWrap: { width: 46, height: 46, borderRadius: theme.borderRadius.full, alignItems: 'center', justifyContent: 'center' },
    label: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold },
    description: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginTop: 2 },
    note: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.lg, paddingHorizontal: theme.spacing.xs },
    noteText: { flex: 1, color: theme.colors.textMuted, fontSize: theme.fontSize.xs, lineHeight: 16 },
  });
