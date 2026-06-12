import React, { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, Modal, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Icon } from './Icon';
import { receiptUri, receiptExists } from '../utils/receiptStorage';

interface Props {
  visible: boolean;
  filename: string | null;
  onClose: () => void;
  /** Si se pasa, muestra el botón "Eliminar foto". */
  onDelete?: () => void;
}

/**
 * Preview de recibo a pantalla completa: fondo negro, la imagen centrada,
 * botón cerrar y (opcional) "Eliminar foto". Si el archivo no existe muestra
 * un placeholder "Imagen no disponible" sin crashear.
 */
export function ReceiptViewer({ visible, filename, onClose, onDelete }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [status, setStatus] = useState<'loading' | 'ok' | 'missing'>('loading');

  useEffect(() => {
    if (!visible) return;
    if (!filename) {
      setStatus('missing');
      return;
    }
    let active = true;
    setStatus('loading');
    receiptExists(filename).then((exists) => {
      if (active) setStatus(exists ? 'ok' : 'missing');
    });
    return () => {
      active = false;
    };
  }, [visible, filename]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.iconBtn}>
            <Icon name="x" size={24} color="#FFFFFF" />
          </Pressable>
        </View>

        <View style={styles.center}>
          {status === 'loading' && <ActivityIndicator color="#FFFFFF" size="large" />}
          {status === 'ok' && filename && (
            <Image source={{ uri: receiptUri(filename) }} style={styles.image} resizeMode="contain" />
          )}
          {status === 'missing' && (
            <View style={styles.placeholder}>
              <Icon name="image-off" size={52} color="rgba(255,255,255,0.6)" />
              <Text style={styles.placeholderText}>Imagen no disponible</Text>
            </View>
          )}
        </View>

        {onDelete && (
          <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
            <Pressable
              style={({ pressed }) => [styles.deleteBtn, { backgroundColor: theme.colors.expense }, pressed && { opacity: 0.85 }]}
              onPress={onDelete}
            >
              <Icon name="trash-2" size={18} color="#FFFFFF" />
              <Text style={styles.deleteText}>Eliminar foto</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

// Visor intencionalmente de fondo negro (independiente del tema).
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000000' },
  topBar: { paddingHorizontal: 16, alignItems: 'flex-end' },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  placeholder: { alignItems: 'center', gap: 12 },
  placeholderText: { color: 'rgba(255,255,255,0.7)', fontSize: 15 },
  bottomBar: { paddingHorizontal: 24, alignItems: 'center' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999 },
  deleteText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
