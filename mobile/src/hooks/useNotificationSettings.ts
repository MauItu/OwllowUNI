import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  loadNotificationSettings,
  saveNotificationSettings,
  syncAllNotifications,
  type NotificationSettings,
} from '../services/notifications';

/**
 * Maneja las preferencias de notificaciones: las carga desde AsyncStorage al
 * montar y, en cada cambio, las persiste y reprograma TODAS las notificaciones
 * con el nuevo estado (recordatorio diario + alertas de deudas/metas).
 */
export function useNotificationSettings() {
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    loadNotificationSettings().then((s) => {
      if (active) {
        setSettings(s);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const update = useCallback((patch: Partial<NotificationSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      // Persistimos y reprogramamos con el nuevo estado (fuera del render).
      saveNotificationSettings(next)
        .then(() => syncAllNotifications(next))
        .catch(() => {});
      return next;
    });
  }, []);

  return { settings, loading, update };
}
