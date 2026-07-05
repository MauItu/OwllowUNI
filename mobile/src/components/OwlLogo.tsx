import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';
import { useTheme } from '../theme/ThemeContext';

interface OwlLogoProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/**
 * Marca de Owllow: un búho geométrico minimalista dibujado en el mismo
 * lenguaje visual que los íconos de Lucide (trazos redondeados, 24x24),
 * para que conviva con el resto de la iconografía de la app.
 */
export function OwlLogo({ size = 44, color, strokeWidth = 2 }: OwlLogoProps) {
  const { colors } = useTheme();
  const stroke = color ?? colors.primary;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Cabeza y cuerpo en una sola silueta redondeada */}
      <Path
        d="M12 4c4.4 0 7 2.9 7 7.2v2.3c0 4.2-2.9 6.5-7 6.5s-7-2.3-7-6.5v-2.3C5 6.9 7.6 4 12 4Z"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Plumas de las orejas */}
      <Path d="M7.6 4.9 6 2.8" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M16.4 4.9 18 2.8" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" />
      {/* Ojos grandes, el rasgo distintivo del búho */}
      <Circle cx="8.9" cy="11" r="2.4" stroke={stroke} strokeWidth={strokeWidth} />
      <Circle cx="15.1" cy="11" r="2.4" stroke={stroke} strokeWidth={strokeWidth} />
      <Circle cx="8.9" cy="11" r="0.9" fill={stroke} />
      <Circle cx="15.1" cy="11" r="0.9" fill={stroke} />
      {/* Pico */}
      <Path
        d="M10.7 15.6 12 17.2l1.3-1.6"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
