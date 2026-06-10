import React, { useState } from 'react';
import { View, Text, Modal, Pressable, StyleSheet } from 'react-native';
import {
  addMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  isWithinInterval,
  isAfter,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Icon } from './Icon';
import { isoFromDate } from '../utils/formatDate';

interface Props {
  visible: boolean;
  initialFrom?: Date;
  initialTo?: Date;
  onConfirm: (range: { from: string; to: string }) => void;
  onClose: () => void;
}

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

/** Selector de rango de fechas con calendario propio (sin dependencias nativas). */
export function DateRangePicker({ visible, initialFrom, initialTo, onConfirm, onClose }: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [month, setMonth] = useState(() => startOfMonth(initialFrom ?? new Date()));
  const [from, setFrom] = useState<Date | null>(initialFrom ?? null);
  const [to, setTo] = useState<Date | null>(initialTo ?? null);

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  });

  const onDayPress = (day: Date) => {
    if (!from || (from && to)) {
      setFrom(day);
      setTo(null);
    } else if (isAfter(day, from)) {
      setTo(day);
    } else {
      setTo(from);
      setFrom(day);
    }
  };

  const confirm = () => {
    if (from) {
      onConfirm({ from: isoFromDate(from), to: isoFromDate(to ?? from) });
    }
  };

  const inRange = (day: Date) =>
    from && to && isWithinInterval(day, { start: from, end: to });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.center} pointerEvents="box-none">
        <View style={styles.card}>
          <View style={styles.header}>
            <Pressable onPress={() => setMonth(addMonths(month, -1))} hitSlop={10}>
              <Icon name="chevron-left" size={22} color={theme.colors.text} />
            </Pressable>
            <Text style={styles.monthLabel}>
              {format(month, 'MMMM yyyy', { locale: es })}
            </Text>
            <Pressable onPress={() => setMonth(addMonths(month, 1))} hitSlop={10}>
              <Icon name="chevron-right" size={22} color={theme.colors.text} />
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAYS.map((w, i) => (
              <Text key={i} style={styles.weekday}>
                {w}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {days.map((day) => {
              const selectedEdge = (from && isSameDay(day, from)) || (to && isSameDay(day, to));
              const dim = !isSameMonth(day, month);
              return (
                <Pressable
                  key={day.toISOString()}
                  style={[styles.cell, inRange(day) && styles.cellInRange, selectedEdge && styles.cellSelected]}
                  onPress={() => onDayPress(day)}
                >
                  <Text style={[styles.cellText, dim && styles.cellDim, selectedEdge && styles.cellTextSelected]}>
                    {format(day, 'd')}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.footer}>
            <Text style={styles.rangeText}>
              {from ? format(from, 'd MMM', { locale: es }) : '—'} →{' '}
              {to ? format(to, 'd MMM', { locale: es }) : from ? format(from, 'd MMM', { locale: es }) : '—'}
            </Text>
            <View style={styles.actions}>
              <Pressable style={styles.btnGhost} onPress={onClose}>
                <Text style={styles.btnGhostText}>Cancelar</Text>
              </Pressable>
              <Pressable style={[styles.btn, !from && { opacity: 0.5 }]} onPress={confirm} disabled={!from}>
                <Text style={styles.btnText}>Aplicar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: theme.spacing.lg },
  card: {
    width: '100%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md },
  monthLabel: { color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: '700', textTransform: 'capitalize' },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginBottom: theme.spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  cellInRange: { backgroundColor: theme.colors.surfaceAccent },
  cellSelected: { backgroundColor: theme.colors.primary, borderRadius: theme.borderRadius.sm },
  cellText: { color: theme.colors.text, fontSize: theme.fontSize.sm },
  cellTextSelected: { color: '#fff', fontWeight: '700' },
  cellDim: { color: theme.colors.textMuted, opacity: 0.5 },
  footer: { marginTop: theme.spacing.md, gap: theme.spacing.sm },
  rangeText: { color: theme.colors.textSecondary, textAlign: 'center', fontSize: theme.fontSize.sm },
  actions: { flexDirection: 'row', gap: theme.spacing.sm },
  btnGhost: { flex: 1, padding: theme.spacing.md, alignItems: 'center', borderRadius: theme.borderRadius.md, backgroundColor: theme.colors.surfaceLight },
  btnGhostText: { color: theme.colors.textSecondary, fontWeight: '600' },
  btn: { flex: 1, padding: theme.spacing.md, alignItems: 'center', borderRadius: theme.borderRadius.md, backgroundColor: theme.colors.primary },
  btnText: { color: '#fff', fontWeight: '700' },
});
