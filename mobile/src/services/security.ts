/**
 * Servicio de seguridad: bloqueo de la app con PIN de 4 dígitos + biometría
 * opcional. TODO es LOCAL (single-user, sin backend de auth).
 *
 * - El PIN se guarda **hasheado** (SHA-256 con salt aleatorio) en `expo-secure-store`
 *   (Keychain/Keystore del sistema). NUNCA en claro ni en AsyncStorage.
 * - La biometría usa `expo-local-authentication` (huella/rostro del sistema).
 * - El contador de intentos fallidos + el lockout se persisten en SecureStore
 *   para que cerrar la app no los resetee.
 *
 * Robustez: cada acceso a SecureStore va envuelto en try/catch. Si SecureStore
 * falla, las lecturas devuelven valores seguros (sin bloqueo) — la app NUNCA
 * queda brickeada; las escrituras propagan el error para avisar al usuario.
 *
 * ⚠️ Expo Go vs APK: `expo-secure-store`, `expo-local-authentication` y
 * `expo-crypto` SÍ vienen en Expo Go (SDK 54), así que el PIN funciona en Expo
 * Go. La **biometría** depende del hardware/enrolamiento del dispositivo y puede
 * no estar disponible en emuladores o en Expo Go; se prueba de verdad en el APK.
 */
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Crypto from 'expo-crypto';

// ───────────────────────────── Constantes ──────────────────────────────
export const PIN_LENGTH = 4;
export const MAX_ATTEMPTS = 5;
export const LOCKOUT_MS = 30_000; // 30s tras MAX_ATTEMPTS fallos
export const AUTO_LOCK_MS = 60_000; // re-bloquea al volver de background si pasó > 60s

const KEY_PIN_HASH = 'wallet_pin_hash';
const KEY_PIN_SALT = 'wallet_pin_salt';
const KEY_BIOMETRIC = 'wallet_pin_biometric'; // '1' | '0'
const KEY_ATTEMPTS = 'wallet_pin_attempts'; // entero
const KEY_LOCK_UNTIL = 'wallet_pin_lock_until'; // epoch ms

// ─────────────────────── Wrappers seguros de SecureStore ───────────────────────

async function secureGet(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch (err) {
    console.warn('[security] SecureStore.get falló:', err);
    return null;
  }
}

async function secureSet(key: string, value: string): Promise<void> {
  // Propaga el error: el llamador decide cómo avisar (toast).
  await SecureStore.setItemAsync(key, value);
}

async function secureDelete(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (err) {
    console.warn('[security] SecureStore.delete falló:', err);
  }
}

// ─────────────────────────────── Hashing ───────────────────────────────

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Genera un salt aleatorio (16 bytes) en hex. */
async function generateSalt(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(16);
  return toHex(bytes);
}

/** SHA-256 de `salt:pin` → hex. */
export async function hashPin(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

// ──────────────────────────── Estado del PIN ───────────────────────────

/** ¿Hay un PIN configurado (bloqueo activo)? Seguro ante fallos de SecureStore. */
export async function isPinEnabled(): Promise<boolean> {
  const hash = await secureGet(KEY_PIN_HASH);
  return !!hash;
}

/** Crea/reemplaza el PIN: genera salt nuevo, guarda hash+salt. Puede lanzar. */
export async function setPin(pin: string): Promise<void> {
  const salt = await generateSalt();
  const hash = await hashPin(pin, salt);
  await secureSet(KEY_PIN_SALT, salt);
  await secureSet(KEY_PIN_HASH, hash);
  await resetAttempts();
}

/** Verifica un PIN contra el hash guardado. */
export async function verifyPin(pin: string): Promise<boolean> {
  const [hash, salt] = await Promise.all([secureGet(KEY_PIN_HASH), secureGet(KEY_PIN_SALT)]);
  if (!hash || !salt) return false;
  const candidate = await hashPin(pin, salt);
  return candidate === hash;
}

/** Desactiva el bloqueo: borra PIN, salt, biometría y estado de intentos. */
export async function disableLock(): Promise<void> {
  await Promise.all([
    secureDelete(KEY_PIN_HASH),
    secureDelete(KEY_PIN_SALT),
    secureDelete(KEY_BIOMETRIC),
    secureDelete(KEY_ATTEMPTS),
    secureDelete(KEY_LOCK_UNTIL),
  ]);
}

// ──────────────────────────────── Biometría ────────────────────────────

export type BiometricKind = 'face' | 'fingerprint' | 'iris' | 'generic';

/** ¿El dispositivo tiene hardware biométrico Y hay biometría enrolada? */
export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const [hasHardware, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    return hasHardware && enrolled;
  } catch {
    return false;
  }
}

/** Tipo de biometría disponible (para el ícono/etiqueta de la UI). */
export async function getBiometricKind(): Promise<BiometricKind> {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return 'face';
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return 'fingerprint';
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) return 'iris';
    return 'generic';
  } catch {
    return 'generic';
  }
}

/** ¿El usuario activó el desbloqueo biométrico? (requiere también disponibilidad). */
export async function isBiometricEnabled(): Promise<boolean> {
  const v = await secureGet(KEY_BIOMETRIC);
  return v === '1';
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await secureSet(KEY_BIOMETRIC, enabled ? '1' : '0');
}

/**
 * Lanza el prompt biométrico del sistema. Devuelve true si autenticó.
 * Si el usuario quitó la huella del sistema, `isBiometricAvailable()` ya lo
 * detecta antes; aquí, ante cualquier error, devolvemos false (cae a PIN).
 */
export async function authenticateBiometric(): Promise<boolean> {
  try {
    if (!(await isBiometricAvailable())) return false;
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Desbloquea Owllow',
      cancelLabel: 'Usar PIN',
      // Mostramos NUESTRO PIN como fallback, no el del sistema.
      disableDeviceFallback: true,
    });
    return res.success;
  } catch {
    return false;
  }
}

// ──────────────────────── Intentos fallidos / lockout ───────────────────

export interface LockState {
  /** Intentos fallidos acumulados desde el último éxito. */
  attempts: number;
  /** Epoch ms hasta el que el ingreso está bloqueado (0 = no bloqueado). */
  lockUntil: number;
}

export async function getLockState(): Promise<LockState> {
  const [a, l] = await Promise.all([secureGet(KEY_ATTEMPTS), secureGet(KEY_LOCK_UNTIL)]);
  return { attempts: Number(a) || 0, lockUntil: Number(l) || 0 };
}

/** Registra un intento fallido; al llegar a MAX_ATTEMPTS activa el lockout. */
export async function recordFailedAttempt(): Promise<LockState> {
  const { attempts } = await getLockState();
  const next = attempts + 1;
  if (next >= MAX_ATTEMPTS) {
    const lockUntil = Date.now() + LOCKOUT_MS;
    // Reinicia el contador pero deja el lockout activo.
    await Promise.all([
      secureSet(KEY_ATTEMPTS, '0').catch(() => {}),
      secureSet(KEY_LOCK_UNTIL, String(lockUntil)).catch(() => {}),
    ]);
    return { attempts: 0, lockUntil };
  }
  await secureSet(KEY_ATTEMPTS, String(next)).catch(() => {});
  return { attempts: next, lockUntil: 0 };
}

/** Limpia intentos y lockout (tras un desbloqueo correcto). */
export async function resetAttempts(): Promise<void> {
  await Promise.all([secureDelete(KEY_ATTEMPTS), secureDelete(KEY_LOCK_UNTIL)]);
}
