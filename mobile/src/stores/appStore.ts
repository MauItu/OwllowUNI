import { create } from 'zustand';
import type { TransactionFilters, Template } from '../types';

interface AppState {
  /** Se incrementa para forzar refrescos de datos tras mutaciones. */
  refreshKey: number;
  triggerRefresh: () => void;

  /** Filtros activos en la pantalla de transacciones. */
  filters: TransactionFilters;
  setFilters: (f: TransactionFilters) => void;
  resetFilters: () => void;

  /** Plantilla seleccionada para pre-llenar AddTransaction. */
  pendingTemplate: Template | null;
  setPendingTemplate: (t: Template | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  refreshKey: 0,
  triggerRefresh: () => set((s) => ({ refreshKey: s.refreshKey + 1 })),

  filters: {},
  setFilters: (filters) => set({ filters }),
  resetFilters: () => set({ filters: {} }),

  pendingTemplate: null,
  setPendingTemplate: (pendingTemplate) => set({ pendingTemplate }),
}));
