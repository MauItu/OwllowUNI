import React from 'react';
import * as Lucide from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';

type IconComponent = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
const registry = Lucide as unknown as Record<string, IconComponent>;

interface IconProps {
  name?: string | null;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/** Convierte 'shopping-cart' → 'ShoppingCart' para mapear a lucide-react-native. */
function toPascal(name: string): string {
  return name
    .split(/[-_ ]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
}

/**
 * Renderiza un ícono de Lucide a partir de su nombre en kebab-case.
 * Si el nombre no existe, usa un ícono por defecto.
 */
export function Icon({ name, size = 22, color, strokeWidth = 2 }: IconProps) {
  const { colors } = useTheme();
  const key = name ? toPascal(name) : 'CircleHelp';
  const LucideIcon: IconComponent = registry[key] ?? registry.CircleHelp ?? registry.HelpCircle;
  return <LucideIcon size={size} color={color ?? colors.text} strokeWidth={strokeWidth} />;
}

// Íconos disponibles para escoger en formularios de cuentas/categorías.
// Todos verificados contra lucide-react-native ^0.460.
export const ACCOUNT_ICONS = [
  'wallet', 'banknote', 'credit-card', 'piggy-bank', 'landmark',
  'smartphone', 'coins', 'building-2', 'dollar-sign', 'briefcase',
  'vault', 'bitcoin', 'circle-dollar-sign', 'hand-coins', 'receipt',
  'gem', 'trending-up', 'shield', 'lock', 'globe',
  'store', 'package', 'badge-dollar-sign', 'nfc', 'wallet-cards',
];

export const CATEGORY_ICONS = [
  'utensils', 'shopping-cart', 'bus', 'car', 'fuel', 'home', 'wifi',
  'heart-pulse', 'pill', 'dumbbell', 'graduation-cap', 'book-open',
  'shirt', 'smartphone', 'tv', 'gamepad-2', 'gift', 'briefcase',
  'trending-up', 'plane', 'coffee', 'baby', 'paw-print', 'wrench',
  'pizza', 'beer', 'wine', 'ice-cream-cone', 'apple', 'bike',
  'train-front', 'parking-meter', 'zap', 'droplets', 'flame', 'music',
  'clapperboard', 'ticket', 'palette', 'camera', 'scissors', 'sparkles',
  'stethoscope', 'glasses', 'school', 'pen-tool', 'laptop', 'headphones',
  'watch', 'sofa', 'bed', 'trees', 'mountain', 'umbrella',
  'cake', 'party-popper', 'dog', 'cat', 'shopping-bag', 'hand-platter',
];
