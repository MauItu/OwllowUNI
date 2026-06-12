/**
 * Servicio central de notificaciones LOCALES (sin push remoto ni servidores).
 *
 * Centraliza: permisos, canal de Android, programación/cancelación/reprogramación
 * por entidad (debtId/goalId) usando identifiers DETERMINÍSTICOS para poder
 * cancelarlas sin guardar referencias, y una sincronización global que reprograma
 * todo a partir del estado actual (recordatorio diario + deudas + metas).
 *
 * ⚠️ Expo Go (Android, SDK 53+) NO incluye el módulo `expo-notifications`: con el
 * solo hecho de importarlo se dispara un Console Error. Por eso el módulo se carga
 * de forma PEREZOSA (import dinámico) y SOLO en entornos que lo soportan. En Expo
 * Go Android todas las funciones públicas son no-ops seguros y la UI lo refleja.
 * Las notificaciones solo se prueban de verdad en un APK / development build.
 * Ver PROJECT_CONTEXT.md → "Notificaciones locales".
 */
import { Platform, Linking } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { debtsApi, savingsApi } from '../api/client';
import { parseISOSafe } from '../utils/formatDate';
import type { Debt, SavingsGoal } from '../types';
// ⚠️ SOLO tipos: `import type` se borra en compilación, NO carga el módulo en runtime.
import type { NotificationPermissionsStatus } from 'expo-notifications';

/** Tipo del módulo cargado perezosamente (solo en posición de tipo, sin runtime). */
type NotificationsModule = typeof import('expo-notifications');

// ───────────────────────── Preferencias (persistencia) ─────────────────────────

export const NOTIFICATION_SETTINGS_KEY = '@wallet/notification-settings';

export interface NotificationSettings {
  /** Recordatorio diario "No olvides registrar tus gastos de hoy". */
  dailyReminderEnabled: boolean;
  /** Hora del recordatorio diario en formato "HH:mm" (24h). */
  dailyReminderTime: string;
  /** Alertas de vencimiento de deudas/préstamos. */
  debtAlertsEnabled: boolean;
  /** Alertas de fecha límite de metas de ahorro. */
  goalAlertsEnabled: boolean;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  dailyReminderEnabled: true,
  dailyReminderTime: '20:00', // 8:00 PM
  debtAlertsEnabled: true,
  goalAlertsEnabled: true,
};

/** Lee las preferencias persistidas (con fallback a los defaults). */
export async function loadNotificationSettings(): Promise<NotificationSettings> {
  try {
    const raw = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_KEY);
    if (!raw) return DEFAULT_NOTIFICATION_SETTINGS;
    return { ...DEFAULT_NOTIFICATION_SETTINGS, ...(JSON.parse(raw) as Partial<NotificationSettings>) };
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

/** Persiste las preferencias. */
export async function saveNotificationSettings(settings: NotificationSettings): Promise<void> {
  await AsyncStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(settings));
}

// ───────────────────────────── Constantes internas ─────────────────────────────

/** Hora del día (24h) en la que se disparan las alertas de deudas y metas. */
const ALERT_HOUR = 9;
const ANDROID_CHANNEL_ID = 'reminders';

const DAILY_REMINDER_ID = 'daily-reminder';
const debtSoonId = (debtId: number) => `debt-${debtId}-soon`;
const debtDueId = (debtId: number) => `debt-${debtId}-due`;
const goalDeadlineId = (goalId: number) => `goal-${goalId}-deadline`;

// ─────────────────────── Detección de entorno + carga lazy ─────────────────────

/** ¿La app corre dentro de Expo Go (StoreClient)? */
function isExpoGo(): boolean {
  return (
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
    (Constants.appOwnership as string | null) === 'expo'
  );
}

/**
 * ¿El entorno soporta notificaciones? Expo Go en Android (SDK 53+) NO incluye el
 * módulo, así que ahí lo consideramos no soportado y nunca lo importamos.
 */
function notificationsAvailable(): boolean {
  return !(isExpoGo() && Platform.OS === 'android');
}

/** Para que la UI reaccione (banner informativo + toggles deshabilitados). */
export function areNotificationsSupported(): boolean {
  return notificationsAvailable();
}

let modulePromise: Promise<NotificationsModule | null> | null = null;
let warned = false;
let handlerConfigured = false;

/**
 * Devuelve el módulo `expo-notifications` cargado perezosamente (una sola vez,
 * cacheado). En Expo Go Android devuelve `null` SIN importar el módulo (evita el
 * Console Error) y loguea un único aviso informativo.
 */
async function getNotificationsModule(): Promise<NotificationsModule | null> {
  if (!notificationsAvailable()) {
    if (!warned) {
      warned = true;
      console.log('[notifications] Deshabilitadas en Expo Go — usar APK/development build');
    }
    return null;
  }
  if (!modulePromise) {
    modulePromise = import('expo-notifications')
      .then((mod) => {
        configureHandler(mod);
        return mod;
      })
      .catch(() => null);
  }
  return modulePromise;
}

/** Configura cómo se muestran las notificaciones en primer plano (una sola vez). */
function configureHandler(mod: NotificationsModule): void {
  if (handlerConfigured) return;
  handlerConfigured = true;
  mod.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// ─────────────────────────────────── Permisos ──────────────────────────────────

/** Estado de permisos, o `null` si el entorno no soporta notificaciones. */
export async function getPermissionStatus(): Promise<NotificationPermissionsStatus | null> {
  const mod = await getNotificationsModule();
  if (!mod) return null;
  return mod.getPermissionsAsync();
}

/** Pide permisos al sistema; `null` si el entorno no los soporta. */
export async function requestPermissions(): Promise<NotificationPermissionsStatus | null> {
  const mod = await getNotificationsModule();
  if (!mod) return null;
  return mod.requestPermissionsAsync();
}

/** Abre los ajustes del sistema de la app (para reactivar permisos denegados). */
export function openSystemSettings(): void {
  Linking.openSettings().catch(() => {});
}

async function hasPermission(mod: NotificationsModule): Promise<boolean> {
  const { granted } = await mod.getPermissionsAsync();
  return granted;
}

/** Crea/asegura el canal de Android (necesario para que se muestren con sonido). */
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const mod = await getNotificationsModule();
  if (!mod) return;
  await mod.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Recordatorios',
    importance: mod.AndroidImportance.HIGH,
    lightColor: '#C1437A',
  });
}

// ─────────────────────────── Helpers de programación ───────────────────────────

function atHour(d: Date, hour: number): Date {
  const r = new Date(d);
  r.setHours(hour, 0, 0, 0);
  return r;
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

/** Programa una notificación puntual SOLO si la fecha es futura (evita duplicados/spam). */
async function scheduleAt(
  mod: NotificationsModule,
  identifier: string,
  date: Date,
  title: string,
  body: string,
): Promise<void> {
  if (date.getTime() <= Date.now()) return;
  await mod.scheduleNotificationAsync({
    identifier,
    content: { title, body },
    trigger: {
      type: mod.SchedulableTriggerInputTypes.DATE,
      date,
      channelId: ANDROID_CHANNEL_ID,
    },
  });
}

async function cancelId(mod: NotificationsModule, identifier: string): Promise<void> {
  await mod.cancelScheduledNotificationAsync(identifier).catch(() => {});
}

// ──────────────────────────── Recordatorio diario ──────────────────────────────

export async function scheduleDailyReminder(settings: NotificationSettings): Promise<void> {
  const mod = await getNotificationsModule();
  if (!mod) return;
  await cancelId(mod, DAILY_REMINDER_ID);
  if (!settings.dailyReminderEnabled) return;
  if (!(await hasPermission(mod))) return;

  const [h, m] = settings.dailyReminderTime.split(':').map((n) => Number(n));
  await mod.scheduleNotificationAsync({
    identifier: DAILY_REMINDER_ID,
    content: {
      title: '💸 Registra tus gastos',
      body: 'No olvides registrar tus gastos de hoy.',
    },
    trigger: {
      type: mod.SchedulableTriggerInputTypes.DAILY,
      hour: Number.isFinite(h) ? h : 20,
      minute: Number.isFinite(m) ? m : 0,
      channelId: ANDROID_CHANNEL_ID,
    },
  });
}

// ─────────────────────────── Alertas de deudas ─────────────────────────────────

export async function cancelDebtNotifications(debtId: number): Promise<void> {
  const mod = await getNotificationsModule();
  if (!mod) return;
  await Promise.all([cancelId(mod, debtSoonId(debtId)), cancelId(mod, debtDueId(debtId))]);
}

/**
 * Programa (reemplazando) las alertas de una deuda: una 7 días antes del
 * vencimiento y otra el día del vencimiento. No programa nada si está saldada,
 * sin fecha de vencimiento, las alertas están desactivadas o falta permiso.
 */
export async function scheduleDebtNotifications(debt: Debt, settings: NotificationSettings): Promise<void> {
  const mod = await getNotificationsModule();
  if (!mod) return;
  await Promise.all([cancelId(mod, debtSoonId(debt.id)), cancelId(mod, debtDueId(debt.id))]);
  if (!settings.debtAlertsEnabled) return;
  if (debt.isPaidOff || !debt.dueDate) return;
  if (!(await hasPermission(mod))) return;

  const due = parseISOSafe(debt.dueDate);
  const isDebt = debt.type === 'debt';
  const who = debt.creditorDebtor ? ` (${debt.creditorDebtor})` : '';

  await scheduleAt(
    mod,
    debtSoonId(debt.id),
    atHour(addDays(due, -7), ALERT_HOUR),
    isDebt ? '📅 Una deuda vence pronto' : '📅 Te deben pronto',
    isDebt ? `"${debt.name}"${who} vence en 7 días.` : `El préstamo "${debt.name}"${who} vence en 7 días.`,
  );

  await scheduleAt(
    mod,
    debtDueId(debt.id),
    atHour(due, ALERT_HOUR),
    isDebt ? '⏰ Hoy vence una deuda' : '⏰ Hoy te deben',
    isDebt ? `Hoy vence "${debt.name}"${who}.` : `Hoy vence el préstamo "${debt.name}"${who}.`,
  );
}

/** Reprograma las alertas de una deuda leyendo las preferencias actuales. */
export async function rescheduleDebtNotifications(debt: Debt): Promise<void> {
  await scheduleDebtNotifications(debt, await loadNotificationSettings());
}

// ─────────────────────────── Alertas de metas ──────────────────────────────────

export async function cancelGoalNotifications(goalId: number): Promise<void> {
  const mod = await getNotificationsModule();
  if (!mod) return;
  await cancelId(mod, goalDeadlineId(goalId));
}

/**
 * Programa (reemplazando) la alerta de una meta: 7 días antes de la fecha
 * límite. No programa nada si está completada, sin fecha límite, las alertas
 * están desactivadas o falta permiso.
 */
export async function scheduleGoalNotifications(goal: SavingsGoal, settings: NotificationSettings): Promise<void> {
  const mod = await getNotificationsModule();
  if (!mod) return;
  await cancelId(mod, goalDeadlineId(goal.id));
  if (!settings.goalAlertsEnabled) return;
  if (goal.isCompleted || !goal.deadline) return;
  if (!(await hasPermission(mod))) return;

  const deadline = parseISOSafe(goal.deadline);
  await scheduleAt(
    mod,
    goalDeadlineId(goal.id),
    atHour(addDays(deadline, -7), ALERT_HOUR),
    '🎯 Tu meta de ahorro se acerca',
    `Faltan 7 días para la fecha límite de "${goal.name}".`,
  );
}

/** Reprograma la alerta de una meta leyendo las preferencias actuales. */
export async function rescheduleGoalNotifications(goal: SavingsGoal): Promise<void> {
  await scheduleGoalNotifications(goal, await loadNotificationSettings());
}

// ──────────────────────── Sincronización global ────────────────────────────────

/**
 * Reprograma TODAS las notificaciones desde el estado actual: cancela lo
 * existente y vuelve a programar el recordatorio diario + las alertas de cada
 * deuda activa y meta no completada (leídas del backend). Úsalo al iniciar la
 * app y cada vez que cambien las preferencias. Sin red, deja al menos el
 * recordatorio diario programado. No-op si el entorno no soporta notificaciones.
 */
export async function syncAllNotifications(settings?: NotificationSettings): Promise<void> {
  const mod = await getNotificationsModule();
  if (!mod) return;
  const s = settings ?? (await loadNotificationSettings());
  await ensureAndroidChannel();
  await mod.cancelAllScheduledNotificationsAsync().catch(() => {});

  await scheduleDailyReminder(s);

  if (!(await hasPermission(mod))) return;
  try {
    if (s.debtAlertsEnabled) {
      const debts = await debtsApi.list();
      await Promise.all(
        debts.filter((d) => !d.isPaidOff && d.dueDate).map((d) => scheduleDebtNotifications(d, s)),
      );
    }
    if (s.goalAlertsEnabled) {
      const goals = await savingsApi.list();
      await Promise.all(
        goals.filter((g) => !g.isCompleted && g.deadline).map((g) => scheduleGoalNotifications(g, s)),
      );
    }
  } catch {
    // Sin conexión: el recordatorio diario ya quedó programado; las alertas de
    // deudas/metas se reprograman en el próximo arranque o al editarlas.
  }
}

/**
 * Inicialización al arrancar la app: canal de Android + sync con el estado
 * actual. No-op silencioso (con un único aviso) en Expo Go Android.
 */
export async function initNotifications(): Promise<void> {
  await ensureAndroidChannel();
  await syncAllNotifications();
}
