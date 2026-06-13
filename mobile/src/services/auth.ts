/**
 * Almacenamiento del JWT de sesión en `expo-secure-store` (Keychain/Keystore),
 * NUNCA en AsyncStorage. Single source of truth del token para el interceptor
 * de Axios y el hook `useAuth`.
 *
 * Robustez: cada acceso a SecureStore va en try/catch. Ante un fallo de lectura
 * se devuelve `null` (sesión no iniciada) para no brickear la app.
 */
import * as SecureStore from 'expo-secure-store';

const KEY_TOKEN = 'wallet_auth_token';

export async function saveToken(token: string): Promise<void> {
  // Propaga el error: el llamador (login/register) decide cómo avisar.
  await SecureStore.setItemAsync(KEY_TOKEN, token);
}

export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY_TOKEN);
  } catch (err) {
    console.warn('[auth] SecureStore.get token falló:', err);
    return null;
  }
}

export async function removeToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY_TOKEN);
  } catch (err) {
    console.warn('[auth] SecureStore.delete token falló:', err);
  }
}

/** ¿Hay un token guardado? (No valida que siga vigente en el backend). */
export async function isLoggedIn(): Promise<boolean> {
  return !!(await getToken());
}
