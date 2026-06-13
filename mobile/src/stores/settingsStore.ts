import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PaletteId } from '../theme';

export type ThemeMode = 'system' | 'light' | 'dark';

interface SettingsState {
  /** Moneda principal de visualización para balances consolidados y stats. */
  mainCurrency: string;
  setMainCurrency: (currency: string) => void;
  /** Paleta de colores activa (Más → Apariencia). */
  paletteId: PaletteId;
  setPaletteId: (id: PaletteId) => void;
  /** Modo de tema: sigue al sistema o se fuerza claro/oscuro. */
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  /** true una vez rehidratado desde AsyncStorage. */
  hydrated: boolean;
}

// El usuario activo define la clave de persistencia (`wallet-settings-<userId>`),
// así las preferencias de un usuario no afectan a otro y persisten al re-login.
let currentUserKey = 'guest';

/**
 * Storage de AsyncStorage que namespacea por usuario. La clave lógica es fija
 * (`wallet-settings`) pero la física incluye el usuario activo.
 */
const userScopedStorage = createJSONStorage(() => ({
  getItem: (name: string) => AsyncStorage.getItem(`${name}-${currentUserKey}`),
  setItem: (name: string, value: string) => AsyncStorage.setItem(`${name}-${currentUserKey}`, value),
  removeItem: (name: string) => AsyncStorage.removeItem(`${name}-${currentUserKey}`),
}));

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      mainCurrency: 'COP',
      setMainCurrency: (mainCurrency) => set({ mainCurrency }),
      paletteId: 'bisexual',
      setPaletteId: (paletteId) => set({ paletteId }),
      themeMode: 'system',
      setThemeMode: (themeMode) => set({ themeMode }),
      hydrated: false,
    }),
    {
      name: 'wallet-settings',
      storage: userScopedStorage,
      partialize: (s) => ({ mainCurrency: s.mainCurrency, paletteId: s.paletteId, themeMode: s.themeMode }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);

/**
 * Cambia el usuario activo de las preferencias y rehidrata desde su clave.
 * Lo llama `useAuth` al iniciar/cerrar sesión. NO borra el store al desloguear
 * (las preferencias persisten para el próximo login del mismo usuario).
 */
export async function loadSettingsForUser(userId: number | string | null): Promise<void> {
  const nextKey = userId == null ? 'guest' : String(userId);
  if (nextKey === currentUserKey && useSettingsStore.getState().hydrated) return;
  currentUserKey = nextKey;
  await useSettingsStore.persist.rehydrate();
}
