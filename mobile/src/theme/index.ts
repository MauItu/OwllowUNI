/**
 * Sistema de temas dual con selector de paleta:
 *  - 5 paletas (Bisexual, Gay, Lésbica, Profesional, Índigo Coral), cada una
 *    con variante claro/oscuro. La paleta activa se elige en Más → Apariencia
 *    y se persiste en `settingsStore` (`paletteId` + `themeMode`).
 *  - `lightTheme`/`darkTheme` son alias de compatibilidad de la paleta
 *    Bisexual (valor por defecto, "Minimalista Nórdico" / "Orquídea Velvet").
 *  - Todas las paletas comparten `Theme`/`ThemeColors` y cumplen WCAG AA
 *    (≥4.5:1) para texto sobre fondo y para `primary`/`accent` sobre blanco.
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

  /**
   * Color del CONTENIDO (texto/íconos) sobre las superficies de header, balance
   * y cardHighlight. En las paletas expresivas es blanco (gradientes de color);
   * en paletas planas (Índigo Coral) esas superficies son neutras y el contenido
   * usa el color de texto del tema. Siempre hex de 6 dígitos: los consumidores
   * derivan translucidez concatenando alpha (`${onHeader}33`).
   */
  onHeader: string;
  /** Variante secundaria/atenuada de `onHeader` (hex, puede llevar alpha). */
  onHeaderMuted: string;

  // Paleta para gráficas
  chart: readonly string[];
}

export interface ThemeGradients {
  header: GradientTuple; // superficie del header (contenido en colors.onHeader)
  cardHighlight: GradientTuple;
  balance: GradientTuple; // card de balance total (contenido en colors.onHeader)
  progress: GradientTuple; // barras de progreso rosa → azul
  income: GradientTuple;
  expense: GradientTuple;
  /**
   * Fill del CTA (PrimaryButton sin color explícito). Separado de `header` para
   * que una paleta plana pueda tener header neutro SIN dejar el botón invisible
   * (el texto del botón es blanco siempre).
   */
  button: GradientTuple;
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
    onHeader: '#FFFFFF',
    onHeaderMuted: '#FFFFFFD9',
    chart: chartLight,
  },
  gradients: {
    header: ['#C1437A', '#7B528C'], // rosa → morado
    button: ['#C1437A', '#7B528C'],
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
    onHeader: '#FFFFFF',
    onHeaderMuted: '#FFFFFFD9',
    chart: chartDark,
  },
  gradients: {
    header: ['#F72585', '#7209B7'], // rosa frambuesa → púrpura
    button: ['#F72585', '#7209B7'],
    cardHighlight: ['#7209B7', '#F72585'],
    balance: ['#7209B7', '#F72585'], // púrpura → rosa
    progress: ['#F72585', '#4CC9F0'], // rosa → turquesa
    income: ['#2FA45C', '#4ADE80'],
    expense: ['#A91761', '#F72585'],
  },
  ...shared,
};

// ── PALETA GAY (Vincian) — claro ────────────────────────────────────────────
const gayLightTheme: Theme = {
  colors: {
    background: '#F2FAF7',
    surface: '#E6F2ED',
    surfaceLight: '#FFFFFF',
    surfaceAccent: '#DDE8E4', // derivado: surface un paso más oscuro

    primary: '#0B6E5B',
    primaryDark: '#C9DFDB', // derivado: primary aclarado ~78% (contenedor suave)
    primaryLight: '#095C4C', // derivado: primary oscurecido ~16% (texto legible)

    secondary: '#2A6FB5',

    accent: '#3D1A78',
    accentLight: '#71589C', // derivado: accent aclarado ~27% (texto legible)

    income: '#297D4E',
    expense: '#3D1A78',
    transfer: '#2A6FB5',

    success: '#297D4E',
    danger: '#3D1A78',
    warning: '#3D1A78',

    text: '#13211F',
    textSecondary: '#5C6E6A',
    textMuted: '#909C9A', // derivado: textSecondary aclarado ~32%

    border: '#CBDCD5',
    borderLight: '#DCE8E3', // derivado: border aclarado ~33%
    cardBorder: 'transparent',

    tabActive: '#0B6E5B',
    tabInactive: '#909C9A',

    statusBar: '#DFE6E3',
    onHeader: '#FFFFFF',
    onHeaderMuted: '#FFFFFFD9', // derivado: background oscurecido ~8%
    chart: ['#0B6E5B', '#2A6FB5', '#3D1A78', '#297D4E', '#E8A838', '#4EADA1', '#D4845A', '#9B7DB8'],
  },
  gradients: {
    header: ['#0B6E5B', '#3D1A78'],
    button: ['#0B6E5B', '#3D1A78'],
    cardHighlight: ['#0B6E5B', '#3D1A78'],
    balance: ['#0B6E5B', '#3D1A78'],
    progress: ['#0B6E5B', '#2A6FB5'],
    income: ['#297D4E', '#3DA56C'],
    expense: ['#2E145A', '#3D1A78'],
  },
  ...shared,
};

// ── PALETA GAY (Vincian) — oscuro ───────────────────────────────────────────
const gayDarkTheme: Theme = {
  colors: {
    background: '#0E1C18',
    surface: '#162422',
    surfaceLight: '#1F3330',
    surfaceAccent: '#2E403D', // derivado: surfaceLight aclarado ~6.5%

    primary: '#1FAE90',
    primaryDark: '#157662', // derivado: primary oscurecido ~32% (pressed)
    primaryLight: '#8DD6C6', // derivado: primary aclarado ~49% (texto legible)

    secondary: '#7BADE2',

    accent: '#8E7BEA',
    accentLight: '#C4BAF4', // derivado: accent aclarado ~48% (texto legible)

    income: '#4ADE80',
    expense: '#8E7BEA',
    transfer: '#7BADE2',

    success: '#4ADE80',
    danger: '#8E7BEA',
    warning: '#C4BAF4',

    text: '#F0DFD4',
    textSecondary: '#6E8783', // ajustado de #6B8580 a #6E8783 para WCAG AA (ratio:4.55)
    textMuted: '#516461', // derivado: textSecondary oscurecido ~26%

    border: '#233C37',
    borderLight: '#39504B', // derivado: border aclarado ~10%
    cardBorder: '#233C37',

    tabActive: '#7BADE2',
    tabInactive: '#516461',

    statusBar: '#0B1512',
    onHeader: '#FFFFFF',
    onHeaderMuted: '#FFFFFFD9', // derivado: background oscurecido ~25%
    chart: ['#1FAE90', '#7BADE2', '#8E7BEA', '#4ADE80', '#FF8FC2', '#B47EE8', '#E8A838', '#4EADA1'],
  },
  gradients: {
    header: ['#1FAE90', '#8E7BEA'],
    button: ['#1FAE90', '#8E7BEA'],
    cardHighlight: ['#8E7BEA', '#1FAE90'],
    balance: ['#8E7BEA', '#1FAE90'],
    progress: ['#1FAE90', '#7BADE2'],
    income: ['#2FA45C', '#4ADE80'],
    expense: ['#6B5CB0', '#8E7BEA'],
  },
  ...shared,
};

// ── PALETA LÉSBICA (sunset 2018) — claro ────────────────────────────────────
const lesbianLightTheme: Theme = {
  colors: {
    background: '#FFF8F4',
    surface: '#FEECE3',
    surfaceLight: '#FFFFFF',
    surfaceAccent: '#F4E3DA', // derivado: surface un paso más oscuro

    primary: '#C8442A',
    primaryDark: '#F3D6D0', // derivado: primary aclarado ~78% (contenedor suave)
    primaryLight: '#A83923', // derivado: primary oscurecido ~16% (texto legible)

    secondary: '#A30262',

    accent: '#D362A4',
    accentLight: '#A94E83', // derivado: accent oscurecido ~20% para WCAG AA (ratio:4.87)

    income: '#297D4E',
    expense: '#C8442A',
    transfer: '#A30262',

    success: '#297D4E',
    danger: '#C8442A',
    warning: '#D362A4',

    text: '#2D1611',
    textSecondary: '#7E645F',
    textMuted: '#A79692', // derivado: textSecondary aclarado ~32%

    border: '#ECD2C7',
    borderLight: '#F2E1D9', // derivado: border aclarado ~33%
    cardBorder: 'transparent',

    tabActive: '#C8442A',
    tabInactive: '#A79692',

    statusBar: '#EBE4E0',
    onHeader: '#FFFFFF',
    onHeaderMuted: '#FFFFFFD9', // derivado: background oscurecido ~8%
    chart: ['#C8442A', '#A30262', '#D362A4', '#297D4E', '#E8A838', '#4EADA1', '#D4845A', '#9B7DB8'],
  },
  gradients: {
    header: ['#C8442A', '#A30262'],
    button: ['#C8442A', '#A30262'],
    cardHighlight: ['#C8442A', '#A30262'],
    balance: ['#C8442A', '#A30262'],
    progress: ['#C8442A', '#A30262'],
    income: ['#297D4E', '#3DA56C'],
    expense: ['#A83923', '#C8442A'],
  },
  ...shared,
};

// ── PALETA LÉSBICA (sunset 2018) — oscuro ───────────────────────────────────
const lesbianDarkTheme: Theme = {
  colors: {
    background: '#221310',
    surface: '#271813',
    surfaceLight: '#38241D',
    surfaceAccent: '#45322C', // derivado: surfaceLight aclarado ~6.5%

    primary: '#E8631C',
    primaryDark: '#9E4313', // derivado: primary oscurecido ~32% (pressed)
    primaryLight: '#F3AF8B', // derivado: primary aclarado ~49% (texto legible)

    secondary: '#FF8FC2',

    accent: '#D362A4',
    accentLight: '#E8ADD0', // derivado: accent aclarado ~48% (texto legible)

    income: '#4ADE80',
    expense: '#E8631C',
    transfer: '#FF8FC2',

    success: '#4ADE80',
    danger: '#E8631C',
    warning: '#E8ADD0',

    text: '#FFF6F2',
    textSecondary: '#967974', // ajustado de #957873 a #967974 para WCAG AA (ratio:4.52)
    textMuted: '#6F5A56', // derivado: textSecondary oscurecido ~26%

    border: '#442D26',
    borderLight: '#57423C', // derivado: border aclarado ~10%
    cardBorder: '#442D26',

    tabActive: '#FF8FC2',
    tabInactive: '#6F5A56',

    statusBar: '#1A0E0C',
    onHeader: '#FFFFFF',
    onHeaderMuted: '#FFFFFFD9', // derivado: background oscurecido ~25%
    chart: ['#E8631C', '#FF8FC2', '#D362A4', '#4ADE80', '#E8A838', '#4EADA1', '#D4845A', '#9B7DB8'],
  },
  gradients: {
    header: ['#E8631C', '#FF8FC2'],
    button: ['#E8631C', '#FF8FC2'],
    cardHighlight: ['#FF8FC2', '#E8631C'],
    balance: ['#FF8FC2', '#E8631C'],
    progress: ['#E8631C', '#FF8FC2'],
    income: ['#2FA45C', '#4ADE80'],
    expense: ['#9E4313', '#E8631C'],
  },
  ...shared,
};

// ── PALETA PROFESIONAL (fintech corporativo) — claro ────────────────────────
const proLightTheme: Theme = {
  colors: {
    background: '#F7F8FA',
    surface: '#F1F5F9',
    surfaceLight: '#FFFFFF',
    surfaceAccent: '#E7EBEF', // derivado: surface un paso más oscuro

    primary: '#2F5BD0',
    primaryDark: '#D1DBF5', // derivado: primary aclarado ~78% (contenedor suave)
    primaryLight: '#274CAF', // derivado: primary oscurecido ~16% (texto legible)

    secondary: '#0F766E',

    accent: '#6366F1',
    accentLight: '#595CD9', // derivado: accent oscurecido ~10% para WCAG AA (ratio:4.99)

    income: '#15803D',
    expense: '#DC2626',
    transfer: '#2563EB',

    success: '#15803D',
    danger: '#DC2626',
    warning: '#6366F1',

    text: '#1E293B',
    textSecondary: '#63738A', // ajustado de #64748B a #63738A para WCAG AA (ratio:4.54)
    textMuted: '#95A0AF', // derivado: textSecondary aclarado ~32%

    border: '#E2E8F0',
    borderLight: '#ECF0F5', // derivado: border aclarado ~33%
    cardBorder: 'transparent',

    tabActive: '#2F5BD0',
    tabInactive: '#95A0AF',

    statusBar: '#E3E4E6',
    onHeader: '#FFFFFF',
    onHeaderMuted: '#FFFFFFD9', // derivado: background oscurecido ~8%
    chart: ['#2F5BD0', '#0F766E', '#6366F1', '#15803D', '#E8A838', '#4EADA1', '#D4845A', '#9B7DB8'],
  },
  gradients: {
    header: ['#2F5BD0', '#0F766E'],
    button: ['#2F5BD0', '#0F766E'],
    cardHighlight: ['#2F5BD0', '#0F766E'],
    balance: ['#2F5BD0', '#0F766E'],
    progress: ['#2F5BD0', '#0F766E'],
    income: ['#15803D', '#4ADE80'],
    expense: ['#B91C1C', '#DC2626'],
  },
  ...shared,
};

// ── PALETA PROFESIONAL (fintech corporativo) — oscuro ───────────────────────
const proDarkTheme: Theme = {
  colors: {
    background: '#0E1525',
    surface: '#1E293B',
    surfaceLight: '#334155',
    surfaceAccent: '#404D60', // derivado: surfaceLight aclarado ~6.5%

    primary: '#3B82F6',
    primaryDark: '#2858A7', // derivado: primary oscurecido ~32% (pressed)
    primaryLight: '#9BBFFA', // derivado: primary aclarado ~49% (texto legible)

    secondary: '#2DD4BF',

    accent: '#818CF8',
    accentLight: '#BDC3FB', // derivado: accent aclarado ~48% (texto legible)

    income: '#34D399',
    expense: '#F87171',
    transfer: '#60A5FA',

    success: '#34D399',
    danger: '#F87171',
    warning: '#BDC3FB',

    text: '#F8FAFC',
    textSecondary: '#94A3B8',
    textMuted: '#6E7988', // derivado: textSecondary oscurecido ~26%

    border: '#334155',
    borderLight: '#475466', // derivado: border aclarado ~10%
    cardBorder: '#334155',

    tabActive: '#2DD4BF',
    tabInactive: '#6E7988',

    statusBar: '#0B101C',
    onHeader: '#FFFFFF',
    onHeaderMuted: '#FFFFFFD9', // derivado: background oscurecido ~25%
    chart: ['#3B82F6', '#2DD4BF', '#818CF8', '#34D399', '#E8A838', '#4EADA1', '#D4845A', '#9B7DB8'],
  },
  gradients: {
    header: ['#3B82F6', '#2DD4BF'],
    button: ['#3B82F6', '#2DD4BF'],
    cardHighlight: ['#2DD4BF', '#3B82F6'],
    balance: ['#2DD4BF', '#3B82F6'],
    progress: ['#3B82F6', '#2DD4BF'],
    income: ['#10B981', '#34D399'],
    expense: ['#DC2626', '#F87171'],
  },
  ...shared,
};

// ── PALETA ÍNDIGO CORAL (rediseño Claude v2, jul-2026) — claro ───────────────
// Concepto elegido por el usuario vía test de gustos: premium + energía, índigo
// protagonista, MINIMALISMO PLANO. Header y card de balance son superficies
// NEUTRAS (gradientes planos del color de fondo/surface) y el contenido encima
// usa `onHeader` = color de texto del tema: el número es el protagonista. El
// coral aparece poco (acento/gasto) y por eso se nota. Todos los tokens de
// texto verificados WCAG AA (ratios anotados); blanco sobre el fill del botón
// ≥3.99 en ambos modos.
const indigoLightTheme: Theme = {
  colors: {
    background: '#FAFAFC',
    surface: '#F1F2F6',
    surfaceLight: '#FFFFFF',
    surfaceAccent: '#E8EAF1',

    primary: '#4338CA', // índigo profundo — CTA (7.58 vs fondo; blanco encima 7.9)
    primaryDark: '#DEDDF9', // contenedor suave (teclas de operador)
    primaryLight: '#3730A3', // texto índigo legible (9.53)

    secondary: '#4F46E5', // enlaces/navegación (6.03)

    accent: '#E11D48', // coral — el guiño de la paleta (4.51; fondos de chips/alertas)
    accentLight: '#BE123C', // variante texto (6.03)

    income: '#0B815A', // (4.68)
    expense: '#E11D48', // coral = gasto: coherente con el acento (4.51)
    transfer: '#2563EB', // (4.96)

    success: '#0B815A',
    danger: '#E11D48',
    warning: '#BE123C',

    text: '#1A1D27', // tinta (16.13)
    textSecondary: '#5B6172', // (5.93)
    textMuted: '#8B90A0',

    border: '#E3E5EC',
    borderLight: '#EEEFF4',
    cardBorder: '#E3E5EC', // hairline: separa las cards planas del fondo

    tabActive: '#4338CA',
    tabInactive: '#9AA0B0',

    statusBar: '#EFF0F4',
    onHeader: '#1A1D27', // header NEUTRO: contenido en color de texto
    onHeaderMuted: '#5B6172',
    chart: ['#4F46E5', '#F43F5E', '#0EA5E9', '#10B981', '#8B5CF6', '#F59E0B', '#64748B', '#EC4899'],
  },
  gradients: {
    header: ['#FAFAFC', '#FAFAFC'], // plano = fondo (minimalismo total)
    button: ['#4338CA', '#4F46E5'], // el CTA SÍ lleva índigo (texto blanco 7.9)
    cardHighlight: ['#FFFFFF', '#FFFFFF'], // card blanca con cardBorder hairline
    balance: ['#FFFFFF', '#FFFFFF'],
    progress: ['#4F46E5', '#818CF8'],
    income: ['#0B815A', '#10B981'],
    expense: ['#BE123C', '#E11D48'],
  },
  ...shared,
};

// ── PALETA ÍNDIGO CORAL — oscuro "Grafito" ───────────────────────────────────
const indigoDarkTheme: Theme = {
  colors: {
    background: '#0D1117', // grafito azulado
    surface: '#151B23',
    surfaceLight: '#1C242E',
    surfaceAccent: '#27303C',

    primary: '#6D70F3', // índigo luminoso — CTA (4.74 vs fondo; blanco encima 3.99)
    primaryDark: '#4547B0', // pressed
    primaryLight: '#A5B4FC', // texto índigo legible (9.49)

    secondary: '#8FA5FF', // enlaces/navegación (8.11)

    accent: '#FB7185', // coral (7.03)
    accentLight: '#FDA4AF', // variante texto (10.01)

    income: '#34D399', // (9.84)
    expense: '#FB7185', // coral = gasto (7.03)
    transfer: '#60A5FA', // (7.44)

    success: '#34D399',
    danger: '#FB7185',
    warning: '#FDA4AF',

    text: '#F0F2F8', // (16.91)
    textSecondary: '#98A1B3', // (7.29)
    textMuted: '#6A7284',

    border: '#232B36',
    borderLight: '#303947',
    cardBorder: '#232B36',

    tabActive: '#A5B4FC',
    tabInactive: '#6A7284',

    statusBar: '#090D12',
    onHeader: '#F0F2F8', // header NEUTRO también en oscuro
    onHeaderMuted: '#98A1B3',
    chart: ['#818CF8', '#FB7185', '#38BDF8', '#34D399', '#A78BFA', '#FBBF24', '#94A3B8', '#F472B6'],
  },
  gradients: {
    header: ['#0D1117', '#0D1117'], // plano = fondo
    button: ['#5A5CE6', '#6D70F3'],
    cardHighlight: ['#151B23', '#151B23'], // card surface con cardBorder
    balance: ['#151B23', '#151B23'],
    progress: ['#6D70F3', '#A5B4FC'],
    income: ['#10B981', '#34D399'],
    expense: ['#E11D48', '#FB7185'],
  },
  ...shared,
};

// ── Selector de paletas ──────────────────────────────────────────────────────
// `swatch`: 3 colores protagonistas de cada paleta, usados en las tarjetas de
// selección (Más → Apariencia) y en la ilustración de EmptyState.
export const palettes = {
  bisexual: {
    label: 'Bisexual',
    light: lightTheme,
    dark: darkTheme,
    swatch: ['#C1437A', '#7B528C', '#3A60A1'],
  },
  gay: {
    label: 'Gay',
    light: gayLightTheme,
    dark: gayDarkTheme,
    swatch: ['#0B6E5B', '#3D1A78', '#2A6FB5'],
  },
  lesbian: {
    label: 'Lésbica',
    light: lesbianLightTheme,
    dark: lesbianDarkTheme,
    swatch: ['#C8442A', '#D362A4', '#A30262'],
  },
  professional: {
    // "Clásico": el look actual de producción — expresivo, con gradientes de color
    // en headers y cards. Candidato ORIGINAL de la votación A/B.
    label: 'Clásico',
    light: proLightTheme,
    dark: proDarkTheme,
    swatch: ['#2F5BD0', '#6366F1', '#0F766E'],
  },
  // "Minimal": rediseño plano (índigo protagonista, coral como guiño, superficies
  // neutras — el número es el protagonista). Candidato NUEVO de la votación A/B.
  indigo: {
    label: 'Minimal',
    light: indigoLightTheme,
    dark: indigoDarkTheme,
    swatch: ['#4F46E5', '#F43F5E', '#1A1D27'],
  },
} as const;

export type PaletteId = keyof typeof palettes;

// Paleta para escoger color de cuentas/categorías en formularios.
// Los primeros 12 se conservan (datos existentes los usan y PALETTE[0] es el default).
// Mezcla tonos que funcionan en ambos modos (ni muy oscuros ni muy claros).
export const PALETTE = [
  '#C1437A', '#F72585', '#3A60A1', '#4CC9F0',
  '#7B528C', '#7209B7', '#2E8B57', '#4ADE80',
  '#E8A838', '#4EADA1', '#D4845A', '#9B7DB8',
  '#E63946', '#F4A261', '#E76F51', '#06D6A0',
  '#118AB2', '#3D8BFD', '#8338EC', '#FF6B9D',
  '#5E8C61', '#B5838D', '#C77DFF', '#FF9E40',
];
