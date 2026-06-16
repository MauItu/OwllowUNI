import React, { useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Icon } from './Icon';

interface Props {
  /** Se llama al terminar o saltar el tutorial (lo marca como visto). */
  onDone: () => void;
}

interface Slide {
  /** Capítulo al que pertenece el paso (chip superior). */
  section: string;
  icon: string;
  title: string;
  body: string;
}

/**
 * Guion COMPLETO del tutorial: recorre todas las funciones de la app, capítulo
 * por capítulo, en el mismo orden lógico en que un usuario nuevo las descubriría
 * (inicio → registrar → organizar → planear → analizar → ajustes). Cada paso es
 * corto (1-2 frases) para entrar sin scroll. Si agregas una función a la app,
 * agrega aquí su paso para que la guía siga siendo exhaustiva.
 */
const SLIDES: Slide[] = [
  // ── Bienvenida ──────────────────────────────────────────────────────
  {
    section: 'Bienvenida',
    icon: 'sparkles',
    title: 'Te muestro cómo funciona',
    body: 'Una guía rápida por todas las funciones de la app. Puedes saltarla cuando quieras y volver a verla después desde Más → Cómo usar la app.',
  },
  // ── Inicio ──────────────────────────────────────────────────────────
  {
    section: 'Inicio',
    icon: 'home',
    title: 'Tu panorama financiero',
    body: 'La pantalla de inicio resume tu saldo total consolidado en tu moneda principal, tus movimientos recientes y accesos rápidos.',
  },
  {
    section: 'Inicio',
    icon: 'menu',
    title: 'Menú lateral y pestañas',
    body: 'Abre el menú lateral desde el ícono del encabezado. Abajo tienes las pestañas principales y, en "Más", el resto de funciones agrupadas.',
  },
  // ── Cuentas ─────────────────────────────────────────────────────────
  {
    section: 'Cuentas',
    icon: 'wallet',
    title: 'Crea tus cuentas',
    body: 'Agrega efectivo, cuentas de banco y tarjetas. Cada una con su moneda, ícono y color. Su suma forma tu saldo total.',
  },
  {
    section: 'Cuentas',
    icon: 'credit-card',
    title: 'Tarjetas de crédito',
    body: 'Las tarjetas manejan deuda y cupo. Puedes congelarlas: una tarjeta congelada aún permite pagar su deuda, pero no aparece para nuevos gastos.',
  },
  // ── Registrar movimientos ───────────────────────────────────────────
  {
    section: 'Movimientos',
    icon: 'plus-circle',
    title: 'Registra en segundos',
    body: 'El botón + crea un movimiento: ingreso, gasto o transferencia entre cuentas. Elige cuenta, monto, categoría y fecha.',
  },
  {
    section: 'Movimientos',
    icon: 'arrow-right-left',
    title: 'Transferencias y multimoneda',
    body: 'Mueve dinero entre cuentas, incluso de distinta moneda: indicas cuánto sale y cuánto llega, y la app calcula la tasa usada.',
  },
  {
    section: 'Movimientos',
    icon: 'paperclip',
    title: 'Recibos y notas',
    body: 'Adjunta una foto del recibo y añade notas a cada movimiento para tener el respaldo siempre a la mano.',
  },
  // ── Organización ────────────────────────────────────────────────────
  {
    section: 'Organización',
    icon: 'shapes',
    title: 'Categorías',
    body: 'Clasifica cada movimiento por categoría (comida, transporte, sueldo…). Son la base de tus estadísticas y presupuestos.',
  },
  {
    section: 'Organización',
    icon: 'tag',
    title: 'Etiquetas',
    body: 'Marca movimientos con etiquetas libres (ej. "viaje", "regalo") para agruparlos de forma transversal a las categorías.',
  },
  {
    section: 'Organización',
    icon: 'zap',
    title: 'Plantillas',
    body: 'Guarda movimientos que repites (café, transporte, arriendo) como plantillas y regístralos con un solo toque.',
  },
  // ── Automatización ──────────────────────────────────────────────────
  {
    section: 'Automatización',
    icon: 'repeat',
    title: 'Pagos recurrentes',
    body: 'Crea reglas para suscripciones, arriendo o nómina y la app los registra solos en su fecha, sin que se te olviden.',
  },
  {
    section: 'Automatización',
    icon: 'building-2',
    title: 'Cuota de manejo',
    body: 'La cuota de manejo de tus tarjetas es una regla recurrente más: se cobra automáticamente cada mes sobre la tarjeta correspondiente.',
  },
  // ── Planeación ──────────────────────────────────────────────────────
  {
    section: 'Planeación',
    icon: 'piggy-bank',
    title: 'Metas de ahorro',
    body: 'Define metas con monto objetivo y haz aportes desde una cuenta real. Verás tu progreso hasta alcanzarlas.',
  },
  {
    section: 'Planeación',
    icon: 'landmark',
    title: 'Deudas y préstamos',
    body: 'Lleva el control de lo que debes y lo que te deben, con abonos y fechas de vencimiento para no perder el hilo.',
  },
  {
    section: 'Planeación',
    icon: 'pie-chart',
    title: 'Presupuestos',
    body: 'Asigna un tope mensual por categoría y la app te avisa cómo vas para que no se te pase la mano.',
  },
  {
    section: 'Planeación',
    icon: 'users',
    title: 'Gastos compartidos',
    body: 'Crea grupos para gastos en común (viajes, roomies), divide cuentas y lleva quién debe a quién y cuánto.',
  },
  // ── Análisis ────────────────────────────────────────────────────────
  {
    section: 'Análisis',
    icon: 'bar-chart-3',
    title: 'Estadísticas',
    body: 'Gráficos de tus ingresos y gastos por categoría y periodo para ver a dónde se va tu dinero.',
  },
  {
    section: 'Análisis',
    icon: 'lightbulb',
    title: 'Insights',
    body: 'La app analiza tus hábitos y te da consejos accionables para gastar mejor mes a mes.',
  },
  {
    section: 'Análisis',
    icon: 'search',
    title: 'Búsqueda',
    body: 'Encuentra cualquier movimiento al instante filtrando por texto, cuenta, categoría, etiqueta o rango de fechas.',
  },
  {
    section: 'Análisis',
    icon: 'arrow-right-left',
    title: 'Tasas de cambio',
    body: 'Consulta y ajusta las tasas entre monedas que usa la app para consolidar tus saldos multimoneda.',
  },
  {
    section: 'Análisis',
    icon: 'arrow-down-up',
    title: 'Importar / Exportar',
    body: 'Respalda o migra tu información exportándola, e impórtala de vuelta cuando lo necesites.',
  },
  // ── Ajustes ─────────────────────────────────────────────────────────
  {
    section: 'Ajustes',
    icon: 'bell',
    title: 'Notificaciones',
    body: 'Activa recordatorios diarios y alertas de vencimientos de deudas y metas para mantenerte al día.',
  },
  {
    section: 'Ajustes',
    icon: 'lock-keyhole',
    title: 'Seguridad',
    body: 'Tu app se protege con PIN y biometría. Puedes cambiarlos cuando quieras desde Más → Seguridad.',
  },
  {
    section: 'Ajustes',
    icon: 'palette',
    title: 'Apariencia',
    body: 'Elige tema claro u oscuro y la paleta de colores que más te guste desde Más → Apariencia.',
  },
  // ── Cierre ──────────────────────────────────────────────────────────
  {
    section: '¡Listo!',
    icon: 'rocket',
    title: 'Ya conoces la app',
    body: 'Eso es todo: empieza creando una cuenta y registrando tu primer movimiento. Puedes repasar esta guía cuando quieras desde Más.',
  },
];

/**
 * Tutorial de bienvenida a pantalla completa: una guía paso a paso por TODAS las
 * funciones de la app. Aparece una vez tras el primer login/registro y también
 * se puede relanzar desde Más → Cómo usar la app. Tiene chip de capítulo, barra
 * de progreso con contador, navegación atrás/siguiente y un botón "Saltar"
 * siempre visible. Al terminar o saltar llama `onDone`, que persiste el "ya
 * visto" para no repetirlo automáticamente.
 *
 * Overlay raíz (sobre el navigator) — no usa navegación, así que no hay back de
 * hardware ni gesto de swipe que lo cierre por accidente.
 */
export function TutorialOverlay({ onDone }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [index, setIndex] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  const total = SLIDES.length;
  const isLast = index === total - 1;
  const slide = SLIDES[index];

  // Transición entre pasos: desvanece, cambia el contenido y vuelve a aparecer.
  const goTo = useCallback(
    (next: number) => {
      Animated.timing(fade, {
        toValue: 0,
        duration: 130,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        setIndex(next);
        Animated.timing(fade, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      });
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

  return (
    <View style={[StyleSheet.absoluteFill, styles.backdrop]}>
      <View
        style={[
          styles.container,
          { paddingTop: insets.top + theme.spacing.md, paddingBottom: insets.bottom + theme.spacing.lg },
        ]}
      >
        {/* Saltar: siempre disponible para omitir el tutorial. */}
        <View style={styles.topBar}>
          <Pressable onPress={onDone} hitSlop={12} style={({ pressed }) => pressed && { opacity: 0.6 }}>
            <Text style={styles.skip}>Saltar</Text>
          </Pressable>
        </View>

        <Animated.View style={[styles.slide, { opacity: fade }]}>
          <View style={styles.chip}>
            <Text style={styles.chipText}>{slide.section}</Text>
          </View>
          <LinearGradient
            colors={theme.gradients.header}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconCircle}
          >
            <Icon name={slide.icon} size={46} color="#FFFFFF" strokeWidth={2.1} />
          </LinearGradient>
          <Text style={styles.title}>{slide.title}</Text>
          <Text style={styles.body}>{slide.body}</Text>
        </Animated.View>

        {/* Progreso: barra proporcional + contador (escala a muchos pasos). */}
        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${((index + 1) / total) * 100}%` }]} />
          </View>
          <Text style={styles.counter}>
            {index + 1} / {total}
          </Text>
        </View>

        <View style={styles.nav}>
          <Pressable
            onPress={handleBack}
            disabled={index === 0}
            hitSlop={8}
            style={({ pressed }) => [styles.backBtn, index === 0 && { opacity: 0 }, pressed && { opacity: 0.6 }]}
          >
            <Icon name="chevron-left" size={20} color={theme.colors.textSecondary} />
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
              <Icon name={isLast ? 'check' : 'chevron-right'} size={18} color="#FFFFFF" strokeWidth={2.6} />
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    backdrop: {
      backgroundColor: theme.colors.background,
      zIndex: 900,
    },
    container: {
      flex: 1,
      paddingHorizontal: theme.spacing.lg,
    },
    topBar: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
    },
    skip: {
      color: theme.colors.textSecondary,
      fontSize: theme.fontSize.md,
      fontWeight: theme.fontWeight.semibold,
      paddingVertical: theme.spacing.xs,
      paddingHorizontal: theme.spacing.sm,
    },
    slide: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.md,
    },
    chip: {
      backgroundColor: theme.colors.surfaceAccent,
      paddingVertical: theme.spacing.xs,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.borderRadius.full,
      marginBottom: theme.spacing.xl,
    },
    chipText: {
      color: theme.colors.primaryLight,
      fontSize: theme.fontSize.xs,
      fontWeight: theme.fontWeight.bold,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    iconCircle: {
      width: 116,
      height: 116,
      borderRadius: 58,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: theme.spacing.xl,
    },
    title: {
      color: theme.colors.text,
      fontSize: theme.fontSize.xl,
      fontWeight: theme.fontWeight.bold,
      textAlign: 'center',
      marginBottom: theme.spacing.md,
    },
    body: {
      color: theme.colors.textSecondary,
      fontSize: theme.fontSize.md,
      lineHeight: theme.fontSize.md * 1.5,
      textAlign: 'center',
    },
    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      marginBottom: theme.spacing.lg,
    },
    progressTrack: {
      flex: 1,
      height: 6,
      borderRadius: 3,
      backgroundColor: theme.colors.border,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: 3,
      backgroundColor: theme.colors.primary,
    },
    counter: {
      color: theme.colors.textMuted,
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.semibold,
      minWidth: 48,
      textAlign: 'right',
    },
    nav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    backBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.sm,
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
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.xl,
      borderRadius: theme.borderRadius.full,
    },
    nextText: {
      color: '#FFFFFF',
      fontSize: theme.fontSize.md,
      fontWeight: theme.fontWeight.bold,
    },
  });
