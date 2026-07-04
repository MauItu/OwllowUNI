import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { palettes, type Theme, type ThemeColors, type PaletteId } from './index';
import { useSettingsStore, type ThemeMode } from '../stores/settingsStore';

/**
 * Votación A/B en curso: durante el test, TODOS los usuarios eligen solo entre
 * estas dos paletas candidatas (ver StyleVoteScreen). Las demás paletas siguen
 * en el registro pero no se ofrecen en el selector. `professional` es el default
 * (look actual de producción). Deben coincidir con CHOICES del backend.
 */
export const VOTE_PALETTE_IDS = ['professional', 'indigo'] as const satisfies readonly PaletteId[];
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

// Solo las paletas candidatas de la votación, en orden fijo (original primero).
const AVAILABLE_PALETTES = VOTE_PALETTE_IDS.map((id) => ({
  id,
  label: palettes[id].label,
  swatch: palettes[id].swatch,
}));

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const storedPaletteId = useSettingsStore((s) => s.paletteId);
  const setPaletteId = useSettingsStore((s) => s.setPaletteId);
  const themeMode = useSettingsStore((s) => s.themeMode);
  const setThemeMode = useSettingsStore((s) => s.setThemeMode);

  const isDark =
    themeMode === 'system' ? (systemScheme ?? 'dark') === 'dark' : themeMode === 'dark';

  // Durante la votación todos eligen entre las dos candidatas. El id persistido
  // puede ser uno viejo (otra paleta, o una eliminada como 'amber'): si no es una
  // de las candidatas, caer al default en vez de crashear con `palettes[id].light`.
  const isCandidate = (VOTE_PALETTE_IDS as readonly string[]).includes(storedPaletteId);
  const paletteId: PaletteId = isCandidate ? storedPaletteId : DEFAULT_PALETTE;
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
      // Solo acepta las paletas candidatas de la votación.
      setPalette: (id: PaletteId) => {
        if ((VOTE_PALETTE_IDS as readonly string[]).includes(id)) setPaletteId(id);
      },
      availablePalettes: AVAILABLE_PALETTES,
      themeMode,
      setThemeMode,
    }),
    [theme, isDark, palette, paletteId, setPaletteId, themeMode, setThemeMode],
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
