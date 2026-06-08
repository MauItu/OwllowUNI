export const theme = {
  colors: {
    background: '#0F0F14',
    surface: '#1A1A24',
    surfaceLight: '#252535',
    primary: '#6C5CE7',
    primaryLight: '#A78BFA',
    success: '#10B981',
    danger: '#EF4444',
    warning: '#F59E0B',
    text: '#FFFFFF',
    textSecondary: '#9CA3AF',
    textMuted: '#6B7280',
    border: '#2D2D3D',
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  borderRadius: { sm: 8, md: 12, lg: 16, xl: 24 },
  fontSize: { xs: 12, sm: 14, md: 16, lg: 20, xl: 28, xxl: 36 },
} as const;

export type Theme = typeof theme;

// Paleta para escoger color de cuentas/categorías en formularios.
export const PALETTE = [
  '#6C5CE7', '#A78BFA', '#EF4444', '#F59E0B', '#10B981',
  '#3B82F6', '#EC4899', '#14B8A6', '#8B5CF6', '#F97316',
  '#06B6D4', '#84CC16',
];
