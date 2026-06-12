import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch, StyleSheet } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, SectionTitle } from '../components/common';
import { Icon } from '../components/Icon';
import { TimePicker } from '../components/TimePicker';
import { useNotificationSettings } from '../hooks/useNotificationSettings';
import {
  getPermissionStatus,
  requestPermissions,
  openSystemSettings,
  areNotificationsSupported,
} from '../services/notifications';
import { formatTime } from '../utils/formatDate';

type PermState = 'unsupported' | 'undetermined' | 'granted' | 'denied';

export function SettingsNotificationsScreen() {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { settings, update } = useNotificationSettings();

  // Expo Go (Android, SDK 53+) no soporta el módulo de notificaciones.
  const supported = areNotificationsSupported();
  const [perm, setPerm] = useState<PermState>(supported ? 'undetermined' : 'unsupported');
  const [showTime, setShowTime] = useState(false);

  const refreshPermission = useCallback(async () => {
    if (!supported) {
      setPerm('unsupported');
      return;
    }
    const status = await getPermissionStatus();
    if (!status) {
      setPerm('unsupported');
      return;
    }
    setPerm(status.granted ? 'granted' : status.canAskAgain ? 'undetermined' : 'denied');
  }, [supported]);

  // Re-chequea permisos al entrar y al volver de los ajustes del sistema.
  useFocusEffect(
    useCallback(() => {
      refreshPermission();
    }, [refreshPermission]),
  );

  const askPermission = async () => {
    const status = await requestPermissions();
    if (!status) {
      setPerm('unsupported');
      return;
    }
    setPerm(status.granted ? 'granted' : status.canAskAgain ? 'undetermined' : 'denied');
  };

  // Los toggles solo se pueden tocar si hay soporte y permiso concedido.
  const enabled = supported && perm === 'granted';

  return (
    <Screen>
      <ScreenHeader title="Notificaciones" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Explicación + estado de permisos */}
        {perm === 'unsupported' ? (
          <View style={[styles.permCard, { backgroundColor: `${theme.colors.warning}1A`, borderColor: theme.colors.warning }]}>
            <Icon name="triangle-alert" size={22} color={theme.colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={styles.permTitle}>No disponible en Expo Go</Text>
              <Text style={styles.permText}>
                Las notificaciones no están disponibles en Expo Go. Genera el APK con eas build para probarlas.
              </Text>
            </View>
          </View>
        ) : perm === 'granted' ? (
          <View style={[styles.permCard, { backgroundColor: `${theme.colors.income}1A`, borderColor: theme.colors.income }]}>
            <Icon name="bell-ring" size={22} color={theme.colors.income} />
            <View style={{ flex: 1 }}>
              <Text style={styles.permTitle}>Notificaciones activas</Text>
              <Text style={styles.permText}>Te avisaremos según las opciones que elijas abajo.</Text>
            </View>
          </View>
        ) : perm === 'denied' ? (
          <View style={[styles.permCard, { backgroundColor: `${theme.colors.expense}1A`, borderColor: theme.colors.expense }]}>
            <Icon name="bell-off" size={22} color={theme.colors.expense} />
            <View style={{ flex: 1 }}>
              <Text style={styles.permTitle}>Permiso desactivado</Text>
              <Text style={styles.permText}>
                Las notificaciones están bloqueadas. Actívalas desde los ajustes del sistema para recibir tus
                recordatorios.
              </Text>
              <Pressable style={styles.permBtn} onPress={openSystemSettings}>
                <Icon name="settings" size={16} color="#FFFFFF" />
                <Text style={styles.permBtnText}>Abrir ajustes</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={[styles.permCard, { backgroundColor: `${theme.colors.secondary}1A`, borderColor: theme.colors.secondary }]}>
            <Icon name="bell" size={22} color={theme.colors.secondary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.permTitle}>Activa las notificaciones</Text>
              <Text style={styles.permText}>
                Usamos notificaciones locales (sin internet) para recordarte registrar tus gastos y avisarte de
                vencimientos. Nada se envía a ningún servidor.
              </Text>
              <Pressable style={[styles.permBtn, { backgroundColor: theme.colors.secondary }]} onPress={askPermission}>
                <Icon name="bell" size={16} color="#FFFFFF" />
                <Text style={styles.permBtnText}>Permitir notificaciones</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Recordatorio diario */}
        <View style={styles.sectionGap}>
          <SectionTitle title="Recordatorio diario" />
        </View>
        <View style={[styles.card, !enabled && styles.cardDisabled]}>
          <View style={[styles.iconWrap, { backgroundColor: `${theme.colors.primary}22` }]}>
            <Icon name="alarm-clock" size={22} color={theme.colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Recordarme registrar gastos</Text>
            <Text style={styles.description}>"No olvides registrar tus gastos de hoy"</Text>
          </View>
          <Switch
            value={settings.dailyReminderEnabled}
            onValueChange={(v) => update({ dailyReminderEnabled: v })}
            disabled={!enabled}
            trackColor={{ false: theme.colors.border, true: theme.colors.primaryDark }}
            thumbColor={settings.dailyReminderEnabled ? theme.colors.primary : theme.colors.surfaceLight}
          />
        </View>
        <Pressable
          style={[styles.card, (!settings.dailyReminderEnabled || !enabled) && { opacity: 0.5 }]}
          disabled={!settings.dailyReminderEnabled || !enabled}
          onPress={() => setShowTime(true)}
        >
          <View style={[styles.iconWrap, { backgroundColor: `${theme.colors.accentLight}22` }]}>
            <Icon name="clock" size={22} color={theme.colors.accentLight} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Hora del recordatorio</Text>
            <Text style={styles.description}>Toca para cambiar la hora</Text>
          </View>
          <Text style={styles.timeValue}>{formatTime(settings.dailyReminderTime)}</Text>
          <Icon name="chevron-right" size={20} color={theme.colors.textMuted} />
        </Pressable>

        {/* Alertas */}
        <View style={styles.sectionGap}>
          <SectionTitle title="Alertas" />
        </View>
        <View style={[styles.card, !enabled && styles.cardDisabled]}>
          <View style={[styles.iconWrap, { backgroundColor: `${theme.colors.expense}22` }]}>
            <Icon name="landmark" size={22} color={theme.colors.expense} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Vencimiento de deudas</Text>
            <Text style={styles.description}>Aviso 7 días antes y el día del vencimiento</Text>
          </View>
          <Switch
            value={settings.debtAlertsEnabled}
            onValueChange={(v) => update({ debtAlertsEnabled: v })}
            disabled={!enabled}
            trackColor={{ false: theme.colors.border, true: theme.colors.primaryDark }}
            thumbColor={settings.debtAlertsEnabled ? theme.colors.primary : theme.colors.surfaceLight}
          />
        </View>
        <View style={[styles.card, !enabled && styles.cardDisabled]}>
          <View style={[styles.iconWrap, { backgroundColor: `${theme.colors.income}22` }]}>
            <Icon name="piggy-bank" size={22} color={theme.colors.income} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Metas de ahorro</Text>
            <Text style={styles.description}>Aviso 7 días antes de la fecha límite</Text>
          </View>
          <Switch
            value={settings.goalAlertsEnabled}
            onValueChange={(v) => update({ goalAlertsEnabled: v })}
            disabled={!enabled}
            trackColor={{ false: theme.colors.border, true: theme.colors.primaryDark }}
            thumbColor={settings.goalAlertsEnabled ? theme.colors.primary : theme.colors.surfaceLight}
          />
        </View>

        <Text style={styles.footnote}>
          Las notificaciones son locales: se programan en tu dispositivo y funcionan sin conexión.
        </Text>
      </ScrollView>

      <TimePicker
        visible={showTime}
        value={`${settings.dailyReminderTime}:00`}
        onConfirm={(t) => {
          update({ dailyReminderTime: t.slice(0, 5) });
          setShowTime(false);
        }}
        onClose={() => setShowTime(false)}
      />
    </Screen>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { padding: theme.spacing.lg },
    permCard: {
      flexDirection: 'row',
      gap: theme.spacing.md,
      alignItems: 'flex-start',
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.md,
      borderWidth: 1,
    },
    permTitle: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold },
    permText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginTop: 2, lineHeight: 18 },
    permBtn: {
      flexDirection: 'row',
      alignSelf: 'flex-start',
      alignItems: 'center',
      gap: theme.spacing.xs,
      backgroundColor: theme.colors.expense,
      borderRadius: theme.borderRadius.full,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      marginTop: theme.spacing.sm,
    },
    permBtnText: { color: '#FFFFFF', fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold },
    sectionGap: { marginTop: theme.spacing.lg },
    card: {
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
    cardDisabled: { opacity: 0.6 },
    iconWrap: { width: 46, height: 46, borderRadius: theme.borderRadius.full, alignItems: 'center', justifyContent: 'center' },
    label: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold },
    description: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginTop: 2 },
    timeValue: { color: theme.colors.primaryLight, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.bold },
    footnote: {
      color: theme.colors.textMuted,
      fontSize: theme.fontSize.xs,
      textAlign: 'center',
      marginTop: theme.spacing.lg,
      lineHeight: 16,
    },
  });
