import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { type Theme } from '../theme';
import { useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader } from '../components/common';
import { PRIVACY_POLICY, TERMS } from '../legal/texts';

type Params = { Legal: { doc: 'privacy' | 'terms' } };

/**
 * Muestra la política de privacidad o los términos y condiciones. Se registra
 * tanto en el stack autenticado (Más → Ayuda) como en el de auth (link del
 * consentimiento en el registro).
 */
export function LegalScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<Params, 'Legal'>>();
  const styles = useThemedStyles(createStyles);

  const doc = route.params?.doc === 'terms' ? TERMS : PRIVACY_POLICY;

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader title={doc.title} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.updated}>Última actualización: {doc.updatedAt}</Text>
        {doc.sections.map((s) => (
          <View key={s.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{s.title}</Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
    updated: {
      color: theme.colors.textMuted,
      fontSize: theme.fontSize.sm,
      marginBottom: theme.spacing.lg,
    },
    section: { marginBottom: theme.spacing.lg },
    sectionTitle: {
      color: theme.colors.text,
      fontSize: theme.fontSize.md,
      fontWeight: theme.fontWeight.bold,
      marginBottom: theme.spacing.sm,
    },
    body: {
      color: theme.colors.textSecondary,
      fontSize: theme.fontSize.sm,
      lineHeight: 21,
    },
  });
