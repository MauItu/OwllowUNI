import { create } from 'zustand';

/**
 * Estado del drawer lateral (sidebar custom). Vive en un store global para poder
 * abrirlo desde el header de cualquier pantalla y renderizar el `Sidebar` como
 * overlay en `App.tsx` (fuera del NavigationContainer, igual que `LockScreen`).
 */
interface SidebarState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
}));
