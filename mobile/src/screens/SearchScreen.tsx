import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { type Theme } from '../theme';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Screen, ScreenHeader } from '../components/common';
import { GlobalSearchBar } from '../components/GlobalSearchBar';
import { Icon } from '../components/Icon';
import { TransactionCard } from '../components/TransactionCard';
import { AccountCard } from '../components/AccountCard';
import { SavingsGoalCard } from '../components/SavingsGoalCard';
import { DebtCard } from '../components/DebtCard';
import { TagChip } from '../components/TagChip';
import { useGlobalSearch } from '../hooks/useGlobalSearch';

const TX_LIMIT = 5;

export function SearchScreen() {
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [term, setTerm] = useState('');
  const { results, loading, hasResults } = useGlobalSearch(term);

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );

  return (
    <Screen>
      <ScreenHeader title="Buscar" onBack={() => navigation.goBack()} />

      <View style={styles.searchWrap}>
        <GlobalSearchBar
          autoFocus
          onDebouncedChange={setTerm}
          placeholder="Buscar transacciones, cuentas, categorías…"
        />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!term ? (
          <View style={styles.hintWrap}>
            <Icon name="search" size={40} color={theme.colors.textMuted} strokeWidth={1.6} />
            <Text style={styles.hint}>
              Busca transacciones, cuentas, categorías, metas, deudas y etiquetas.
            </Text>
          </View>
        ) : loading && !hasResults ? (
          <View style={styles.hintWrap}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : !hasResults ? (
          <View style={styles.hintWrap}>
            <Icon name="search-x" size={40} color={theme.colors.textMuted} strokeWidth={1.6} />
            <Text style={styles.hint}>No se encontraron resultados para &quot;{term}&quot;.</Text>
          </View>
        ) : (
          <>
            {results.transactions.length > 0 && (
              <Section title="Transacciones">
                {results.transactions.map((t) => (
                  <TransactionCard
                    key={t.id}
                    transaction={t}
                    onPress={() => navigation.navigate('AddTransaction', { transactionId: t.id })}
                  />
                ))}
                {results.transactions.length >= TX_LIMIT && (
                  <Pressable
                    style={styles.seeMore}
                    onPress={() => navigation.navigate('Transactions', { search: term })}
                  >
                    <Text style={styles.seeMoreText}>Ver más transacciones →</Text>
                  </Pressable>
                )}
              </Section>
            )}

            {results.accounts.length > 0 && (
              <Section title="Cuentas">
                {results.accounts.map((a) => (
                  <AccountCard
                    key={a.id}
                    account={a}
                    onPress={() => navigation.navigate('Transactions', { accountId: a.id })}
                  />
                ))}
              </Section>
            )}

            {results.categories.length > 0 && (
              <Section title="Categorías">
                {results.categories.map((c) => (
                  <Pressable
                    key={c.id}
                    style={styles.catRow}
                    onPress={() => navigation.navigate('Categories')}
                  >
                    <View style={[styles.catIcon, { backgroundColor: `${c.color}26` }]}>
                      <Icon name={c.icon} size={18} color={c.color} />
                    </View>
                    <Text style={styles.catName} numberOfLines={1}>
                      {c.name}
                    </Text>
                    <Icon name="chevron-right" size={18} color={theme.colors.textMuted} />
                  </Pressable>
                ))}
              </Section>
            )}

            {results.savings.length > 0 && (
              <Section title="Metas de ahorro">
                {results.savings.map((g) => (
                  <SavingsGoalCard
                    key={g.id}
                    goal={g}
                    onPress={() => navigation.navigate('SavingsDetail', { goalId: g.id })}
                  />
                ))}
              </Section>
            )}

            {results.debts.length > 0 && (
              <Section title="Deudas">
                {results.debts.map((d) => (
                  <DebtCard
                    key={d.id}
                    debt={d}
                    onPress={() => navigation.navigate('DebtDetail', { debtId: d.id })}
                  />
                ))}
              </Section>
            )}

            {results.tags.length > 0 && (
              <Section title="Etiquetas">
                <View style={styles.tagsWrap}>
                  {results.tags.map((t) => (
                    <TagChip key={t.id} tag={t} />
                  ))}
                </View>
              </Section>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    searchWrap: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.sm },
    content: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
    section: { marginTop: theme.spacing.lg },
    sectionTitle: {
      color: theme.colors.textSecondary,
      fontSize: theme.fontSize.sm,
      fontWeight: theme.fontWeight.semibold,
      marginBottom: theme.spacing.sm,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    seeMore: { alignItems: 'center', justifyContent: 'center', paddingVertical: theme.spacing.sm },
    seeMoreText: { color: theme.colors.primary, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold },
    catRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.lg,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
    },
    catIcon: { width: 38, height: 38, borderRadius: theme.borderRadius.full, alignItems: 'center', justifyContent: 'center' },
    catName: { flex: 1, color: theme.colors.text, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.medium },
    tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
    hintWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: theme.spacing.xxl, gap: theme.spacing.md },
    hint: { color: theme.colors.textSecondary, fontSize: theme.fontSize.md, textAlign: 'center', paddingHorizontal: theme.spacing.xl },
  });
