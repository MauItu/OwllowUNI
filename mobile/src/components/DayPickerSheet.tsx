import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { BottomSheet } from './BottomSheet';

interface Props {
  visible: boolean;
  title: string;
  value: number;
  onConfirm: (day: number) => void;
  onClose: () => void;
}

const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

/** Hoja con cuadrícula de días 1-28 (ciclos de facturación que no dependen del mes). */
export function DayPickerSheet({ visible, title, value, onConfirm, onClose }: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <BottomSheet visible={visible} title={title} onClose={onClose} maxHeight="60%">
      <View style={styles.grid}>
        {DAYS.map((day) => {
          const active = day === value;
          return (
            <Pressable
              key={day}
              style={[styles.cell, active && { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]}
              onPress={() => {
                onConfirm(day);
                onClose();
              }}
            >
              <Text style={[styles.cellText, active && { color: '#FFFFFF', fontWeight: theme.fontWeight.bold }]}>{day}</Text>
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingBottom: theme.spacing.lg },
  cell: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.sm,
  },
  cellText: { color: theme.colors.text, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium },
});
