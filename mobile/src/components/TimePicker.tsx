import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { BottomSheet } from './BottomSheet';
import { PrimaryButton } from './common';

interface Props {
  visible: boolean;
  /** Valor inicial "HH:mm" o "HH:mm:ss". */
  value: string;
  onConfirm: (time: string) => void;
  onClose: () => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const ROW_H = 44;

function parse(value: string): { h: number; m: number } {
  const [h, m] = value.split(':');
  return { h: Math.min(23, Math.max(0, Number(h) || 0)), m: Math.min(59, Math.max(0, Number(m) || 0)) };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Selector de hora con dos columnas scrolleables (24h). Devuelve "HH:mm:00". */
export function TimePicker({ visible, value, onConfirm, onClose }: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const initial = useMemo(() => parse(value), [value]);
  const [hour, setHour] = useState(initial.h);
  const [minute, setMinute] = useState(initial.m);

  // Resincroniza al abrir con un valor distinto
  useEffect(() => {
    if (visible) {
      setHour(initial.h);
      setMinute(initial.m);
    }
  }, [visible, initial.h, initial.m]);

  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;

  return (
    <BottomSheet visible={visible} title="Selecciona la hora" onClose={onClose} maxHeight="70%">
      <Text style={styles.preview}>
        {h12}:{pad(minute)} {ampm}
      </Text>
      <View style={styles.columns}>
        <Column data={HOURS} selected={hour} onSelect={setHour} label="Hora" styles={styles} rowH={ROW_H} format={pad} />
        <Text style={styles.colon}>:</Text>
        <Column data={MINUTES} selected={minute} onSelect={setMinute} label="Minuto" styles={styles} rowH={ROW_H} format={pad} />
      </View>
      <PrimaryButton
        label="Confirmar hora"
        icon="clock"
        onPress={() => onConfirm(`${pad(hour)}:${pad(minute)}:00`)}
      />
    </BottomSheet>
  );
}

function Column({
  data,
  selected,
  onSelect,
  label,
  styles,
  rowH,
  format,
}: {
  data: number[];
  selected: number;
  onSelect: (v: number) => void;
  label: string;
  styles: ReturnType<typeof createStyles>;
  rowH: number;
  format: (n: number) => string;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.column}>
      <Text style={styles.colLabel}>{label}</Text>
      <ScrollView
        style={{ height: rowH * 5 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: rowH * 2 }}
        snapToInterval={rowH}
        decelerationRate="fast"
      >
        {data.map((n) => {
          const active = n === selected;
          return (
            <Pressable key={n} style={[styles.cell, { height: rowH }]} onPress={() => onSelect(n)}>
              <Text
                style={[
                  styles.cellText,
                  active && { color: theme.colors.primaryLight, fontWeight: theme.fontWeight.bold, fontSize: theme.fontSize.xl },
                ]}
              >
                {format(n)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    preview: {
      color: theme.colors.text,
      fontSize: theme.fontSize.xxl,
      fontWeight: theme.fontWeight.bold,
      textAlign: 'center',
      marginBottom: theme.spacing.md,
    },
    columns: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.lg,
    },
    column: { alignItems: 'center' },
    colLabel: { color: theme.colors.textMuted, fontSize: theme.fontSize.xs, marginBottom: theme.spacing.xs },
    colon: { color: theme.colors.textSecondary, fontSize: theme.fontSize.xl, fontWeight: theme.fontWeight.bold, marginTop: theme.spacing.lg },
    cell: { minWidth: 64, alignItems: 'center', justifyContent: 'center' },
    cellText: { color: theme.colors.textSecondary, fontSize: theme.fontSize.lg },
  });
