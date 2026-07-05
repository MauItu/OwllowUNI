import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { palettes, type Theme, type ThemeColors, type PaletteId } from './index';
import { useSettingsStore, type ThemeMode } from '../stores/settingsStore';
import { useAuth } from '../hooks/useAuth';

/**
 * Votación A/B en curso: durante el test, los usuarios no admin eligen solo
 * entre estas dos paletas candidatas (ver StyleVoteScreen). Los admins también
 * pueden seleccionar las paletas internas de orgullo para revisar la app, pero
 * esas paletas no participan en la votación. Deben coincidir con CHOICES del
 * backend.
 */
export const VOTE_PALETTE_IDS = ['professional', 'indigo'] as const satisfies readonly PaletteId[];
const ADMIN_PALETTE_IDS = [
  'bisexual',
  'gay',
  'lesbian',
  ...VOTE_PALETTE_IDS,
] as const satisfies readonly PaletteId[];
const DEFAULT_PALETTE: PaletteId = 'professional';

interface ThemeContextValue {
  theme: Theme;
  colors: ThemeColors;
  isDark: boolean;
  toggleTheme: () => void;
  /** 3 colores protagonistas de la paleta activa (EmptyState, selector). */
  swatch: readonly string[];
  paletteId: PaletteId;
  setPalette: (id: PaletteId) => void;
  availablePalettes: { id: PaletteId; label: string; swatch: readonly string[] }[];
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function paletteOptions(ids: readonly PaletteId[]) {
  return ids.map((id) => ({
    id,
    label: palettes[id].label,
    swatch: palettes[id].swatch,
  }));
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const systemScheme = useColorScheme();
  const storedPaletteId = useSettingsStore((s) => s.paletteId);
  const setPaletteId = useSettingsStore((s) => s.setPaletteId);
  const themeMode = useSettingsStore((s) => s.themeMode);
  const setThemeMode = useSettingsStore((s) => s.setThemeMode);
  const isAdmin = user?.isAdmin === true;
  const selectablePaletteIds = isAdmin ? ADMIN_PALETTE_IDS : VOTE_PALETTE_IDS;
  const availablePalettes = useMemo(
    () => paletteOptions(selectablePaletteIds),
    [selectablePaletteIds],
  );

  const isDark =
    themeMode === 'system' ? (systemScheme ?? 'dark') === 'dark' : themeMode === 'dark';

  // Durante la votación los no-admin eligen entre las dos candidatas; admins
  // también pueden usar paletas internas. El id persistido puede no estar
  // permitido para la sesión actual: caer al default evita crashear.
  const isSelectable = (selectablePaletteIds as readonly string[]).includes(storedPaletteId);
  const paletteId: PaletteId = isSelectable ? storedPaletteId : DEFAULT_PALETTE;
  const palette = palettes[paletteId];
  const theme = isDark ? palette.dark : palette.light;

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      colors: theme.colors,
      isDark,
      toggleTheme: () => setThemeMode(isDark ? 'light' : 'dark'),
      swatch: palette.swatch,
      paletteId,
      // Solo acepta paletas disponibles para el usuario actual.
      setPalette: (id: PaletteId) => {
        if ((selectablePaletteIds as readonly string[]).includes(id)) setPaletteId(id);
      },
      availablePalettes,
      themeMode,
      setThemeMode,
    }),
    [
      theme,
      isDark,
      palette,
      paletteId,
      setPaletteId,
      selectablePaletteIds,
      availablePalettes,
      themeMode,
      setThemeMode,
    ],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme debe usarse dentro de <ThemeProvider>');
  return ctx;
}

/**
 * Memoiza una factory de estilos dependiente del tema activo.
 * Patrón: `const styles = useThemedStyles(createStyles);`
 * con `const createStyles = (theme: Theme) => StyleSheet.create({...})`.
 */
export function useThemedStyles<T>(factory: (theme: Theme) => T): T {
  const { theme } = useTheme();
  return useMemo(() => factory(theme), [factory, theme]);
}
