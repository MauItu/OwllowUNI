import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { palettes, type Theme, type ThemeColors, type PaletteId } from './index';
import { useSettingsStore, type ThemeMode } from '../stores/settingsStore';

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

const AVAILABLE_PALETTES = Object.entries(palettes).map(([id, p]) => ({
  id: id as PaletteId,
  label: p.label,
  swatch: p.swatch,
}));

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const paletteId = useSettingsStore((s) => s.paletteId);
  const setPaletteId = useSettingsStore((s) => s.setPaletteId);
  const themeMode = useSettingsStore((s) => s.themeMode);
  const setThemeMode = useSettingsStore((s) => s.setThemeMode);

  const isDark =
    themeMode === 'system' ? (systemScheme ?? 'dark') === 'dark' : themeMode === 'dark';

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
      setPalette: setPaletteId,
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
