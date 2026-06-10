import React, { createContext, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { darkTheme, lightTheme, type Theme, type ThemeColors } from './index';

interface ThemeContextValue {
  theme: Theme;
  colors: ThemeColors;
  isDark: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  // El esquema del sistema define el default; el toggle lo sobreescribe en sesión.
  const [override, setOverride] = useState<'light' | 'dark' | null>(null);

  const isDark = (override ?? systemScheme ?? 'dark') === 'dark';
  const theme = isDark ? darkTheme : lightTheme;

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      colors: theme.colors,
      isDark,
      toggleTheme: () => setOverride(isDark ? 'light' : 'dark'),
    }),
    [theme, isDark],
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
