import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Easing, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { type Theme } from '../../theme';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';
import { Icon } from '../Icon';
import { navigationRef } from '../../navigation/navigationRef';
import type { TabParamList } from '../../navigation/types';
import { useTourRegistry, type TargetRect } from './TourContext';

interface Props {
  /** Se llama al terminar o saltar el tour (lo marca como visto). */
  onDone: () => void;
}

interface TourStep {
  /** Tab al que navegar ANTES de medir el objetivo (deja la app en contexto). */
  tab?: keyof TabParamList;
  /** Clave del objetivo a resaltar. Si falta, el paso se muestra centrado. */
  target?: string;
  icon: string;
  title: string;
  body: string;
}

/**
 * Guion del tour GUIADO e interactivo: en vez de un carrusel de diapositivas,
 * navega por la app de verdad y va señalando con un "foco" (spotlight) el botón
 * o sección real de cada paso. El orden sigue el recorrido natural de un usuario
 * nuevo (Inicio → Cuentas → registrar → Estadísticas → Más). Cada paso indica a
 * qué tab navegar y qué elemento resaltar (clave registrada con `useTourTarget`).
 *
 * Si agregas un elemento señalable nuevo, regístralo con `useTourTarget('clave')`
 * en la pantalla y añade aquí su paso con la misma clave.
 */
const STEPS: TourStep[] = [
  {
    tab: 'Home',
    icon: 'sparkles',
    title: 'Te doy un recorrido',
    body: 'Te voy mostrando los botones y secciones de la app uno por uno. Puedes saltarlo cuando quieras y repetirlo desde Más → Cómo usar la app.',
  },
  {
    tab: 'Home',
    target: 'home-profile',
    icon: 'circle-user',
    title: 'Tu perfil y sesión',
    body: 'Desde aquí abres tu perfil: nombre, correo y cerrar sesión.',
  },
  {
    tab: 'Home',
    target: 'home-balance',
    icon: 'wallet',
    title: 'Tu saldo total',
    body: 'Este es el resumen de tu dinero: saldo consolidado en tu moneda principal, ingresos y gastos del mes y cupo de crédito disponible.',
  },
  {
    tab: 'Home',
    target: 'home-search',
    icon: 'search',
    title: 'Búsqueda rápida',
    body: 'Encuentra cualquier movimiento al instante filtrando por texto, cuenta, categoría o fechas.',
  },
  {
    tab: 'AccountsTab',
    target: 'tab-accounts',
    icon: 'wallet',
    title: 'Tus cuentas y tarjetas',
    body: 'En esta pestaña creas efectivo, cuentas de banco y tarjetas de crédito. Cada una con su moneda, ícono y color; su suma forma tu saldo total.',
  },
  {
    tab: 'Home',
    target: 'tab-add',
    icon: 'plus',
    title: 'Registra un movimiento',
    body: 'El botón central crea un ingreso, gasto o transferencia entre cuentas. Eliges cuenta, monto, categoría y fecha en segundos.',
  },
  {
    tab: 'Stats',
    target: 'tab-stats',
    icon: 'bar-chart-3',
    title: 'Tus estadísticas',
    body: 'Gráficos de ingresos y gastos por categoría y periodo para ver a dónde se va tu dinero.',
  },
  {
    tab: 'More',
    target: 'tab-more',
    icon: 'layout-grid',
    title: 'Todo lo demás',
    body: 'En "Más" están metas de ahorro, deudas, presupuestos, pagos recurrentes, gastos compartidos, categorías, etiquetas y ajustes.',
  },
  {
    tab: 'More',
    target: 'more-help',
    icon: 'graduation-cap',
    title: 'Repite el tour cuando quieras',
    body: 'Aquí mismo, en "Cómo usar la app", puedes volver a ver este recorrido cuando lo necesites.',
  },
  {
    tab: 'Home',
    icon: 'rocket',
    title: '¡Listo para empezar!',
    body: 'Eso es todo. Crea tu primera cuenta y registra un movimiento. Estás en control de tu dinero.',
  },
];

const SCREEN = Dimensions.get('window');
const HOLE_PADDING = 10;
const TOOLTIP_GAP = 16;
const TOOLTIP_MARGIN = 20;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function navigateToTab(tab: keyof TabParamList) {
  if (!navigationRef.isReady()) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (navigationRef as any).navigate('Tabs', { screen: tab });
}

/**
 * Tour guiado e interactivo: overlay raíz (sobre el navigator) que recorre la app
 * resaltando elementos reales. En cada paso navega al tab correspondiente, mide el
 * elemento objetivo (con reintentos, porque la pantalla puede estar en transición)
 * y dibuja un foco con un tooltip anclado al lado. Si el objetivo no aparece, cae
 * con gracia a una tarjeta centrada con el mismo texto (el tour nunca se atasca).
 *
 * Al terminar o saltar llama `onDone`, que persiste el "ya visto".
 */
export function GuidedTour({ onDone }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { measure } = useTourRegistry();

  const [index, setIndex] = useState(0);
  // rect del objetivo en coordenadas de ventana; null = paso centrado (o midiendo).
  const [rect, setRect] = useState<TargetRect | null>(null);
  const fade = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  const total = STEPS.length;
  const isLast = index === total - 1;
  const step = STEPS[index];

  // Pulso suave del anillo del foco, para guiar la mirada al elemento.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  // En cada paso: navega al tab, mide el objetivo (con reintentos) y revela.
  useEffect(() => {
    let cancelled = false;
    fade.setValue(0);
    setRect(null);

    const run = async () => {
      if (step.tab) navigateToTab(step.tab);

      if (step.target) {
        // La pantalla puede estar montándose/animando: reintenta hasta que mida.
        const attempts = 14;
        for (let i = 0; i < attempts && !cancelled; i++) {
          await delay(i === 0 ? (step.tab ? 380 : 140) : 110);
          const r = await measure(step.target);
          if (cancelled) return;
          if (r) {
            setRect(r);
            break;
          }
        }
      } else {
        // Paso centrado: pequeña pausa para que termine la navegación de fondo.
        await delay(step.tab ? 320 : 80);
      }

      if (cancelled) return;
      Animated.timing(fade, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    };

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const goTo = useCallback(
    (next: number) => {
      Animated.timing(fade, { toValue: 0, duration: 120, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(
        () => setIndex(next),
      );
    },
    [fade],
  );

  const handleNext = useCallback(() => {
    if (isLast) onDone();
    else goTo(index + 1);
  }, [isLast, index, goTo, onDone]);

  const handleBack = useCallback(() => {
    if (index > 0) goTo(index - 1);
  }, [index, goTo]);

  // Geometría del foco recortado alrededor del objetivo (con padding y clamp).
  const hole = rect
    ? {
        left: Math.max(rect.x - HOLE_PADDING, 0),
        top: Math.max(rect.y - HOLE_PADDING, 0),
        width: Math.min(rect.width + HOLE_PADDING * 2, SCREEN.width),
        height: rect.height + HOLE_PADDING * 2,
      }
    : null;

  // El tooltip va debajo del objetivo si está en la mitad superior; si no, arriba.
  const placeBelow = hole ? hole.top + hole.height / 2 < SCREEN.height / 2 : true;

  const ringStyle = hole
    ? {
        position: 'absolute' as const,
        left: hole.left,
        top: hole.top,
        width: hole.width,
        height: hole.height,
        borderRadius: theme.borderRadius.lg,
        borderWidth: 2.5,
        borderColor: theme.colors.primaryLight,
        opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
      }
    : null;

  const progress = (
    <View style={styles.progressRow}>
      <View style={styles.dots}>
        {STEPS.map((_, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>
      <Text style={styles.counter}>
        {index + 1} / {total}
      </Text>
    </View>
  );

  const card = (anchored: boolean) => (
    <View style={[styles.card, anchored ? styles.cardAnchored : styles.cardCentered]}>
      <View style={styles.cardHead}>
        <LinearGradient
          colors={theme.gradients.header}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.iconCircle}
        >
          <Icon name={step.icon} size={22} color="#FFFFFF" strokeWidth={2.2} />
        </LinearGradient>
        <Text style={styles.title}>{step.title}</Text>
      </View>
      <Text style={styles.body}>{step.body}</Text>

      {progress}

      <View style={styles.nav}>
        <Pressable
          onPress={handleBack}
          disabled={index === 0}
          hitSlop={8}
          style={({ pressed }) => [styles.backBtn, index === 0 && { opacity: 0 }, pressed && { opacity: 0.6 }]}
        >
          <Icon name="chevron-left" size={18} color={theme.colors.textSecondary} />
          <Text style={styles.backText}>Atrás</Text>
        </Pressable>

        <Pressable onPress={handleNext} style={({ pressed }) => pressed && { opacity: 0.85 }}>
          <LinearGradient
            colors={theme.gradients.header}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.nextBtn}
          >
            <Text style={styles.nextText}>{isLast ? 'Empezar' : 'Siguiente'}</Text>
            <Icon name={isLast ? 'check' : 'chevron-right'} size={16} color="#FFFFFF" strokeWidth={2.6} />
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Capa que captura los toques: tocar fuera de los botones avanza. Queda por
          DEBAJO del foco y la tarjeta, así que tampoco deja interactuar con la app. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={handleNext} />

      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]} pointerEvents="box-none">
        {hole ? (
          <>
            {/* Cuatro rectángulos oscuros alrededor del objetivo dejan un "hueco"
                que muestra el elemento real iluminado. pointerEvents none: los
                toques pasan a la capa de captura de abajo. */}
            <View pointerEvents="none" style={[styles.dim, { left: 0, top: 0, right: 0, height: hole.top }]} />
            <View
              pointerEvents="none"
              style={[styles.dim, { left: 0, top: hole.top + hole.height, right: 0, bottom: 0 }]}
            />
            <View
              pointerEvents="none"
              style={[styles.dim, { left: 0, top: hole.top, width: hole.left, height: hole.height }]}
            />
            <View
              pointerEvents="none"
              style={[styles.dim, { left: hole.left + hole.width, top: hole.top, right: 0, height: hole.height }]}
            />
            <Animated.View pointerEvents="none" style={ringStyle!} />

            {/* Tooltip anclado al objetivo (arriba o abajo según su posición). */}
            <View
              style={[
                styles.anchorWrap,
                placeBelow
                  ? { top: hole.top + hole.height + TOOLTIP_GAP }
                  : { bottom: SCREEN.height - hole.top + TOOLTIP_GAP },
              ]}
              pointerEvents="box-none"
            >
              {card(true)}
            </View>
          </>
        ) : (
          // Paso centrado (bienvenida/cierre) o fallback si no se pudo medir.
          <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.fullDim, styles.centerWrap]}>
            {card(false)}
          </View>
        )}
      </Animated.View>

      {/* Saltar: siempre visible, por encima de todo. */}
      <Pressable
        onPress={onDone}
        hitSlop={12}
        style={({ pressed }) => [styles.skip, { top: insets.top + theme.spacing.sm }, pressed && { opacity: 0.6 }]}
      >
        <Text style={styles.skipText}>Saltar</Text>
      </Pressable>
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    dim: {
      position: 'absolute',
      backgroundColor: 'rgba(0,0,0,0.78)',
    },
    fullDim: {
      backgroundColor: 'rgba(0,0,0,0.82)',
    },
    centerWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.lg,
    },
    anchorWrap: {
      position: 'absolute',
      left: TOOLTIP_MARGIN,
      right: TOOLTIP_MARGIN,
      alignItems: 'center',
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.xl,
      padding: theme.spacing.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.borderLight,
      shadowColor: '#000',
      shadowOpacity: 0.3,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 14,
    },
    cardAnchored: {
      width: '100%',
    },
    cardCentered: {
      width: '100%',
      maxWidth: 420,
    },
    cardHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      marginBottom: theme.spacing.sm,
    },
    iconCircle: {
      width: 44,
      height: 44,
      borderRadius: theme.borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      flex: 1,
      color: theme.colors.text,
      fontSize: theme.fontSize.lg,
      fontWeight: theme.fontWeight.bold,
    },
    body: {
      color: theme.colors.textSecondary,
      fontSize: theme.fontSize.md,
      lineHeight: theme.fontSize.md * 1.5,
    },
    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: theme.spacing.lg,
      marginBottom: theme.spacing.md,
    },
    dots: {
      flexDirection: 'row',
      gap: 6,
      flex: 1,
      flexWrap: 'wrap',
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: theme.colors.border,
    },
    dotActive: {
      width: 18,
      backgroundColor: theme.colors.primary,
    },
    counter: {
      color: theme.colors.textMuted,
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.semibold,
      marginLeft: theme.spacing.sm,
    },
    nav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    backBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: theme.spacing.xs,
      paddingRight: theme.spacing.sm,
    },
    backText: {
      color: theme.colors.textSecondary,
      fontSize: theme.fontSize.md,
      fontWeight: theme.fontWeight.semibold,
    },
    nextBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
      paddingVertical: theme.spacing.sm + 2,
      paddingHorizontal: theme.spacing.lg,
      borderRadius: theme.borderRadius.full,
    },
    nextText: {
      color: '#FFFFFF',
      fontSize: theme.fontSize.md,
      fontWeight: theme.fontWeight.bold,
    },
    skip: {
      position: 'absolute',
      right: theme.spacing.lg,
      paddingVertical: theme.spacing.xs,
      paddingHorizontal: theme.spacing.sm,
      backgroundColor: 'rgba(0,0,0,0.35)',
      borderRadius: theme.borderRadius.full,
    },
    skipText: {
      color: '#FFFFFF',
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.bold,
    },
  });
