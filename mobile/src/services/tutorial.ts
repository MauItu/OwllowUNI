/**
 * Persistencia del tutorial de bienvenida (onboarding visual de "cómo se usa la
 * app"). Se muestra UNA sola vez tras el primer login/registro y se puede saltar.
 *
 * El flag se guarda en AsyncStorage namespaceado por usuario, igual que las
 * preferencias (`wallet_tutorial_seen_<userId>`), para que cada cuenta vea el
 * tutorial la primera vez aunque compartan el mismo dispositivo. No es un dato
 * sensible, así que AsyncStorage (no SecureStore) es suficiente.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const keyFor = (userId: string | number) => `wallet_tutorial_seen_${userId}`;

/** true si el usuario ya vio (o saltó) el tutorial alguna vez. */
export async function hasSeenTutorial(userId: string | number): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(keyFor(userId))) === '1';
  } catch {
    // Ante un fallo de almacenamiento asumimos "ya visto" para no insistir en
    // bucle con el tutorial en cada login.
    return true;
  }
}

/** Marca el tutorial como visto/saltado para que no vuelva a aparecer. */
export async function markTutorialSeen(userId: string | number): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(userId), '1');
  } catch {
    // Silencioso: si no se pudo persistir, en el peor caso reaparece una vez más.
  }
}
