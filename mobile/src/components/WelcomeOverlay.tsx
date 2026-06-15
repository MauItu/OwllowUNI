import React, { useEffect, useRef } from 'react';
import { Text, StyleSheet, Animated, Easing } from 'react-native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Icon } from './Icon';

/**
 * Bienvenida épica a pantalla completa que aparece UNA vez tras el login para
 * usuarios con rol especial (p.ej. Alpha Tester). Entra con fade + escala, late
 * un instante y se desvanece llamando `onDone` para que el usuario siga usando
 * la app. Es un overlay informativo (no bloquea de forma persistente).
 */
const ACCENT = '#FF2D4B'; // rojo épico, armoniza con los acentos rojos de la app

export function WelcomeOverlay({ role, onDone }: { role: string; onDone: () => void }) {
  const styles = useThemedStyles(createStyles);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.8)).current;
  const halo = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const seq = Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 6, tension: 70, useNativeDriver: true }),
      ]),
      Animated.delay(1600),
      Animated.timing(opacity, { toValue: 0, duration: 480, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]);
    seq.start(({ finished }) => {
      if (finished) onDone();
    });

    // Halo pulsante detrás del ícono mientras el overlay está visible.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(halo, { toValue: 1, duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(halo, { toValue: 0, duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      seq.stop();
      loop.stop();
    };
  }, [halo, onDone, opacity, scale]);

  const haloScale = halo.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.25] });
  const haloOpacity = halo.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.05] });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity }]} pointerEvents="none">
      <Animated.View style={[styles.content, { transform: [{ scale }] }]}>
        <Animated.View style={[styles.halo, { opacity: haloOpacity, transform: [{ scale: haloScale }] }]} />
        <Icon name="sparkles" size={56} color={ACCENT} strokeWidth={2.2} />
        <Text style={styles.welcome}>Bienvenido de vuelta</Text>
        <Text style={styles.role} numberOfLines={1} adjustsFontSizeToFit>
          {role}
        </Text>
        <Text style={styles.subtitle}>¡Gracias por probar la app!</Text>
      </Animated.View>
    </Animated.View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    backdrop: {
      backgroundColor: 'rgba(8,4,10,0.92)',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    },
    content: { alignItems: 'center', paddingHorizontal: theme.spacing.xl },
    halo: {
      position: 'absolute',
      top: -28,
      width: 160,
      height: 160,
      borderRadius: 80,
      backgroundColor: ACCENT,
    },
    welcome: {
      color: '#FFFFFF',
      fontSize: theme.fontSize.xl,
      fontWeight: theme.fontWeight.semibold,
      marginTop: theme.spacing.lg,
      letterSpacing: 0.5,
    },
    role: {
      color: ACCENT,
      fontSize: 44,
      fontWeight: theme.fontWeight.bold,
      letterSpacing: 1,
      marginTop: theme.spacing.xs,
      textShadowColor: ACCENT,
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 18,
      textAlign: 'center',
    },
    subtitle: {
      color: 'rgba(255,255,255,0.7)',
      fontSize: theme.fontSize.sm,
      marginTop: theme.spacing.md,
    },
  });
