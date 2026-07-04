import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import Toast from 'react-native-toast-message';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader, SectionTitle, TextField, PrimaryButton } from '../components/common';
import { BottomSheet } from '../components/BottomSheet';
import { Icon } from '../components/Icon';
import { useAuth } from '../hooks/useAuth';
import { authApi, getErrorMessage } from '../api/client';

/**
 * Mi cuenta: datos del perfil + derechos sobre los datos (exportar todo,
 * eliminar la cuenta) + enlaces legales. El borrado exige la contraseña actual
 * y es irreversible (el backend borra TODAS las filas del usuario en una
 * transacción atómica y revoca la sesión).
 */
export function AccountScreen() {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<any>();
  const { user, logout } = useAuth();

  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  const onExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const data = await authApi.exportData();
      const filename = `mis-datos-wallet-${new Date().toISOString().slice(0, 10)}.json`;
      const uri = (FileSystem.cacheDirectory ?? '') + filename;
      await FileSystem.writeAsStringAsync(uri, JSON.stringify(data, null, 2), {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (!(await Sharing.isAvailableAsync())) {
        Toast.show({ type: 'success', text1: 'Datos exportados', text2: `Archivo: ${filename}` });
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Mis datos' });
    } catch (err) {
      Toast.show({ type: 'error', text1: 'No se pudo exportar', text2: getErrorMessage(err) });
    } finally {
      setExporting(false);
    }
  };

  const onDelete = async () => {
    if (!password) {
      Toast.show({ type: 'error', text1: 'Escribe tu contraseña para confirmar' });
      return;
    }
    setDeleting(true);
    try {
      await authApi.deleteAccount(password);
      setDeleteOpen(false);
      Toast.show({ type: 'success', text1: 'Cuenta eliminada', text2: 'Todos tus datos fueron borrados.' });
      await logout();
    } catch (err) {
      Toast.show({ type: 'error', text1: 'No se pudo eliminar la cuenta', text2: getErrorMessage(err) });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Mi cuenta" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Perfil */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Icon name="user" size={30} color={theme.colors.primary} />
          </View>
          <View style={styles.profileText}>
            <Text style={styles.name} numberOfLines={1}>
              {user?.name ?? ''}
            </Text>
            <Text style={styles.email} numberOfLines={1}>
              {user?.email ?? ''}
            </Text>
          </View>
        </View>

        {/* Derechos sobre los datos */}
        <SectionTitle title="Tus datos" />
        <Pressable
          style={styles.row}
          onPress={onExport}
          accessibilityRole="button"
          accessibilityLabel="Descargar mis datos"
        >
          <Icon name="download" size={20} color={theme.colors.secondary} />
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>{exporting ? 'Preparando archivo…' : 'Descargar mis datos'}</Text>
            <Text style={styles.rowHint}>
              Todas tus cuentas, transacciones, deudas, ahorros y demás datos en un archivo JSON.
            </Text>
          </View>
        </Pressable>

        {/* Legal */}
        <SectionTitle title="Legal" />
        <Pressable
          style={styles.row}
          onPress={() => navigation.navigate('Legal', { doc: 'privacy' })}
          accessibilityRole="button"
          accessibilityLabel="Política de privacidad"
        >
          <Icon name="shield-check" size={20} color={theme.colors.accentLight} />
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>Política de privacidad</Text>
          </View>
        </Pressable>
        <Pressable
          style={styles.row}
          onPress={() => navigation.navigate('Legal', { doc: 'terms' })}
          accessibilityRole="button"
          accessibilityLabel="Términos y condiciones"
        >
          <Icon name="file-text" size={20} color={theme.colors.accentLight} />
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>Términos y condiciones</Text>
          </View>
        </Pressable>

        {/* Zona de peligro */}
        <SectionTitle title="Zona de peligro" />
        <Pressable
          style={[styles.row, styles.dangerRow]}
          onPress={() => {
            setPassword('');
            setDeleteOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Eliminar cuenta"
        >
          <Icon name="trash-2" size={20} color={theme.colors.expense} />
          <View style={styles.rowText}>
            <Text style={[styles.rowLabel, { color: theme.colors.expense }]}>Eliminar cuenta</Text>
            <Text style={styles.rowHint}>
              Borra tu cuenta y TODOS tus datos de forma inmediata e irreversible.
            </Text>
          </View>
        </Pressable>
      </ScrollView>

      {/* Confirmación de borrado: exige la contraseña actual */}
      <BottomSheet visible={deleteOpen} title="Eliminar cuenta" onClose={() => setDeleteOpen(false)}>
        <View style={styles.sheetContent}>
          <Text style={styles.warning}>
            Esta acción es irreversible: se borrarán tu cuenta y todos tus datos (cuentas,
            transacciones, deudas, ahorros, presupuestos, gastos compartidos…). Si quieres conservar
            una copia, usa antes "Descargar mis datos".
          </Text>
          <TextField
            label="Confirma tu contraseña"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
            autoCapitalize="none"
          />
          <View style={styles.sheetButton}>
            <PrimaryButton
              label={deleting ? 'Eliminando…' : 'Eliminar definitivamente'}
              color={theme.colors.expense}
              onPress={onDelete}
              loading={deleting}
            />
          </View>
        </View>
      </BottomSheet>
    </Screen>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
    profileCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      backgroundColor: theme.colors.surfaceLight,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.lg,
      marginBottom: theme.spacing.lg,
    },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: theme.borderRadius.full,
      backgroundColor: `${theme.colors.primary}22`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    profileText: { flex: 1 },
    name: { color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: theme.fontWeight.bold },
    email: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, marginTop: 2 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      backgroundColor: theme.colors.surfaceLight,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.sm,
    },
    dangerRow: {
      borderWidth: 1,
      borderColor: `${theme.colors.expense}55`,
    },
    rowText: { flex: 1 },
    rowLabel: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold },
    rowHint: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginTop: 2 },
    sheetContent: { padding: theme.spacing.lg, gap: theme.spacing.md },
    warning: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm, lineHeight: 20 },
    sheetButton: { marginTop: theme.spacing.sm },
  });
