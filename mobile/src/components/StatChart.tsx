import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, G, Circle, Polyline, Line, Text as SvgText } from 'react-native-svg';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { formatCurrency } from '../utils/formatCurrency';

// ───────────────────────── Donut ─────────────────────────
interface DonutSlice {
  value: number;
  color: string;
  label: string;
}

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** Rectángulo con esquinas superiores redondeadas (para barras). */
function topRoundedRect(x: number, y: number, w: number, h: number, r: number): string {
  const radius = Math.min(r, w / 2, h);
  if (h <= 0) return '';
  return `M ${x} ${y + h} L ${x} ${y + radius} Q ${x} ${y} ${x + radius} ${y} L ${x + w - radius} ${y} Q ${x + w} ${y} ${x + w} ${y + radius} L ${x + w} ${y + h} Z`;
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

export function DonutChart({ data, size = 180, centerLabel }: { data: DonutSlice[]; size?: number; centerLabel?: string }) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const total = data.reduce((acc, d) => acc + d.value, 0);
  const stroke = 26;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;

  if (total <= 0) {
    return (
      <View style={[styles.emptyChart, { height: size }]}>
        <Text style={styles.emptyText}>Sin datos para mostrar</Text>
      </View>
    );
  }

  let angle = 0;
  const segments = data.map((d, i) => {
    const sweep = (d.value / total) * 360;
    const path = arcPath(cx, cy, r, angle, angle + Math.max(sweep, 0.5));
    angle += sweep;
    return <Path key={i} d={path} stroke={d.color} strokeWidth={stroke} fill="none" strokeLinecap="butt" />;
  });

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cy} r={r} stroke={theme.colors.surfaceLight} strokeWidth={stroke} fill="none" />
        <G>{segments}</G>
      </Svg>
      {!!centerLabel && (
        <View style={[styles.donutCenter, { width: size, height: size }]} pointerEvents="none">
          <Text style={styles.donutCenterText} numberOfLines={1}>
            {centerLabel}
          </Text>
        </View>
      )}
    </View>
  );
}

// ───────────────────────── Barras ─────────────────────────
interface BarPoint {
  label: string;
  income: number;
  expense: number;
}

export function BarChart({ data, height = 200, currency = 'COP' }: { data: BarPoint[]; height?: number; currency?: string }) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const width = 320;
  const padding = { left: 8, right: 8, top: 10, bottom: 26 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const max = Math.max(1, ...data.map((d) => Math.max(d.income, d.expense)));
  // Limita la cantidad de grupos visibles para no saturar.
  const points = data.slice(-7);
  const groupW = chartW / Math.max(points.length, 1);
  const barW = Math.min(14, groupW / 3);

  if (points.length === 0) {
    return (
      <View style={[styles.emptyChart, { height }]}>
        <Text style={styles.emptyText}>Sin datos en el período</Text>
      </View>
    );
  }

  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Line x1={padding.left} y1={padding.top + chartH} x2={width - padding.right} y2={padding.top + chartH} stroke={theme.colors.border} strokeWidth={1} />
        {points.map((d, i) => {
          const gx = padding.left + i * groupW + groupW / 2;
          const incH = (d.income / max) * chartH;
          const expH = (d.expense / max) * chartH;
          return (
            <G key={i}>
              <Path d={topRoundedRect(gx - barW - 1, padding.top + chartH - incH, barW, incH, theme.borderRadius.sm)} fill={theme.colors.income} />
              <Path d={topRoundedRect(gx + 1, padding.top + chartH - expH, barW, expH, theme.borderRadius.sm)} fill={theme.colors.expense} />
              <SvgText x={gx} y={height - 8} fontSize={9} fill={theme.colors.textMuted} textAnchor="middle">
                {d.label}
              </SvgText>
            </G>
          );
        })}
      </Svg>
      <View style={styles.legend}>
        <Legend color={theme.colors.income} text="Ingresos" />
        <Legend color={theme.colors.expense} text="Gastos" />
      </View>
    </View>
  );
}

// ───────────────────────── Línea ─────────────────────────
interface LinePoint {
  label: string;
  value: number;
}

export function LineChart({ data, height = 180 }: { data: LinePoint[]; height?: number }) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const width = 320;
  const padding = { left: 8, right: 8, top: 12, bottom: 24 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  if (data.length < 2) {
    return (
      <View style={[styles.emptyChart, { height }]}>
        <Text style={styles.emptyText}>Sin suficientes datos</Text>
      </View>
    );
  }

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = chartW / (data.length - 1);

  const coords = data.map((d, i) => {
    const x = padding.left + i * stepX;
    const y = padding.top + chartH - ((d.value - min) / span) * chartH;
    return { x, y };
  });
  const polyline = coords.map((c) => `${c.x},${c.y}`).join(' ');

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      <Polyline points={polyline} fill="none" stroke={theme.colors.accentLight} strokeWidth={2.5} strokeLinejoin="round" />
      {coords.map((c, i) => (
        <Circle key={i} cx={c.x} cy={c.y} r={2.5} fill={theme.colors.accentLight} />
      ))}
    </Svg>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{text}</Text>
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
  emptyChart: { alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: theme.colors.textMuted, fontSize: theme.fontSize.sm },
  donutCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  donutCenterText: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: '700' },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: theme.spacing.lg, marginTop: theme.spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.sm },
});
