/**
 * Sistema de temas dual:
 *  - MODO CLARO  → "Minimalista Nórdico"  (rosa viejo + azul slate + morado opaco)
 *  - MODO OSCURO → "Orquídea / Morado Velvet" (rosa frambuesa + turquesa + púrpura)
 *
 * Contrastes WCAG verificados (ratio ≥ 4.5:1):
 *  - secondary #3A60A1 sobre #F8F9FA → 5.92:1
 *  - secondary #4CC9F0 sobre #241B35 → 8.51:1
 *
 * Los alias semánticos (success/danger/warning) se mantienen apuntando a
 * income/expense/accent para no romper componentes legacy.
 */

export type GradientTuple = readonly [string, string];

export interface ThemeColors {
  // Fondos
  background: string;
  surface: string;
  surfaceLight: string; // inputs, campos elevados
  surfaceAccent: string; // hover, teclas de acción, rangos seleccionados

  // Primarios (CTA principal)
  primary: string;
  primaryDark: string; // fondos de teclas/op pressed
  primaryLight: string; // texto/íconos de acento sobre el fondo

  // Secundario (enlaces, navegación, transfer)
  secondary: string;

  // Acento (tags, alertas)
  accent: string;
  accentLight: string;

  // Semánticos
  income: string;
  expense: string;
  transfer: string;

  // Alias legacy → semánticos
  success: string;
  danger: string;
  warning: string;

  // Texto
  text: string;
  textSecondary: string;
  textMuted: string;

  // Bordes
  border: string;
  borderLight: string;
  cardBorder: string; // borde sutil de cards (visible solo en oscuro)

  // Tab bar
  tabActive: string;
  tabInactive: string;

  // Barra de estado del sistema
  statusBar: string;

  // Paleta para gráficas
  chart: readonly string[];
}

export interface ThemeGradients {
  header: GradientTuple; // rosa → morado, texto blanco encima
  cardHighlight: GradientTuple;
  balance: GradientTuple; // card de balance total, texto blanco
  progress: GradientTuple; // barras de progreso rosa → azul
  income: GradientTuple;
  expense: GradientTuple;
}

// Tokens compartidos entre ambos temas
const shared = {
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 },
  borderRadius: { sm: 8, md: 12, lg: 16, xl: 24, full: 999 },
  fontSize: { xs: 11, sm: 13, md: 15, lg: 18, xl: 24, xxl: 32, hero: 40 },
  fontWeight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  } as const satisfies Record<string, '400' | '500' | '600' | '700'>,
} as const;

// Rosa, azul y morado SIEMPRE como los 3 primeros colores de las gráficas.
const chartLight = [
  '#C1437A', '#3A60A1', '#7B528C', '#2E8B57',
  '#E8A838', '#4EADA1', '#D4845A', '#9B7DB8',
] as const;

const chartDark = [
  '#F72585', '#4CC9F0', '#9D4EDD', '#4ADE80',
  '#FF8FC2', '#B47EE8', '#E8A838', '#4EADA1',
] as const;

export interface Theme {
  colors: ThemeColors;
  gradients: ThemeGradients;
  spacing: typeof shared.spacing;
  borderRadius: typeof shared.borderRadius;
  fontSize: typeof shared.fontSize;
  fontWeight: typeof shared.fontWeight;
}

// ── MODO CLARO — "Minimalista Nórdico" ──────────────────────────────────────
export const lightTheme: Theme = {
  colors: {
    background: '#F8F9FA',
    surface: '#E9ECEF',
    surfaceLight: '#FFFFFF',
    surfaceAccent: '#DDE3E9',

    primary: '#C1437A', // Rosa viejo/mate — CTA principal
    primaryDark: '#F1D7E2', // contenedor suave (teclas de operador)
    primaryLight: '#A8336B', // variante legible como texto sobre fondo claro

    secondary: '#3A60A1', // Azul slate — enlaces, navegación

    accent: '#7B528C', // Morado opaco — tags, alertas
    accentLight: '#9B7DB8',

    income: '#2E8B57',
    expense: '#C1437A',
    transfer: '#3A60A1',

    success: '#2E8B57',
    danger: '#C1437A',
    warning: '#7B528C',

    text: '#212529',
    textSecondary: '#6C757D',
    textMuted: '#99A1A8',

    border: '#CED4DA',
    borderLight: '#DEE2E6',
    cardBorder: 'transparent',

    tabActive: '#C1437A', // tab activo rosa
    tabInactive: '#ADB5BD', // inactivo gris claro

    statusBar: '#E2E6EA',
    chart: chartLight,
  },
  gradients: {
    header: ['#C1437A', '#7B528C'], // rosa → morado
    cardHighlight: ['#C1437A', '#7B528C'],
    balance: ['#C1437A', '#7B528C'],
    progress: ['#C1437A', '#3A60A1'], // rosa → azul
    income: ['#2E8B57', '#3DA56C'],
    expense: ['#A8336B', '#C1437A'],
  },
  ...shared,
};

// ── MODO OSCURO — "Orquídea / Morado Velvet" ────────────────────────────────
export const darkTheme: Theme = {
  colors: {
    background: '#241B35',
    surface: '#32264A',
    surfaceLight: '#3C2E58',
    surfaceAccent: '#473768',

    primary: '#F72585', // Rosa frambuesa — CTA principal
    primaryDark: '#A91761', // teclas de operador / pressed
    primaryLight: '#FF8FC2', // texto de acento sobre fondo oscuro

    secondary: '#4CC9F0', // Azul turquesa — enlaces, navegación

    accent: '#7209B7', // Púrpura imperial — fondos de tags/alertas
    accentLight: '#B47EE8', // variante legible como texto sobre fondo oscuro

    income: '#4ADE80',
    expense: '#F72585',
    transfer: '#4CC9F0',

    success: '#4ADE80',
    danger: '#F72585',
    warning: '#B47EE8',

    text: '#F4EFFA',
    textSecondary: '#A393BF',
    textMuted: '#75689A',

    border: '#443465',
    borderLight: '#554478',
    cardBorder: '#443465', // borde sutil púrpura en cards

    tabActive: '#4CC9F0', // íconos activos turquesa (+ dot rosa)
    tabInactive: '#75689A',

    statusBar: '#1B1428',
    chart: chartDark,
  },
  gradients: {
    header: ['#F72585', '#7209B7'], // rosa frambuesa → púrpura
    cardHighlight: ['#7209B7', '#F72585'],
    balance: ['#7209B7', '#F72585'], // púrpura → rosa
    progress: ['#F72585', '#4CC9F0'], // rosa → turquesa
    income: ['#2FA45C', '#4ADE80'],
    expense: ['#A91761', '#F72585'],
  },
  ...shared,
};

// Paleta para escoger color de cuentas/categorías en formularios.
// Mezcla tonos que funcionan en ambos modos.
export const PALETTE = [
  '#C1437A', '#F72585', '#3A60A1', '#4CC9F0',
  '#7B528C', '#7209B7', '#2E8B57', '#4ADE80',
  '#E8A838', '#4EADA1', '#D4845A', '#9B7DB8',
];
