import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SettingsState {
  /** Moneda principal de visualización para balances consolidados y stats. */
  mainCurrency: string;
  setMainCurrency: (currency: string) => void;
  /** true una vez rehidratado desde AsyncStorage. */
  hydrated: boolean;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      mainCurrency: 'COP',
      setMainCurrency: (mainCurrency) => set({ mainCurrency }),
      hydrated: false,
    }),
    {
      name: 'wallet-settings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ mainCurrency: s.mainCurrency }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);
