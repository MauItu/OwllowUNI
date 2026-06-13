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
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ mainCurrency: s.mainCurrency, paletteId: s.paletteId, themeMode: s.themeMode }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);
