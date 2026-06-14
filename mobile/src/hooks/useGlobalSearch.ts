import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { api } from '../api/client';
import { useAccounts } from './useAccounts';
import { useCategories } from './useCategories';
import { useSavings } from './useSavings';
import { useDebts } from './useDebts';
import { useTags } from './useTags';
import type { Account, Category, SavingsGoal, Debt, Tag, Transaction, Paginated } from '../types';

const TX_LIMIT = 5;

export interface GlobalSearchResults {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  savings: SavingsGoal[];
  debts: Debt[];
  tags: Tag[];
}

const EMPTY: GlobalSearchResults = {
  transactions: [],
  accounts: [],
  categories: [],
  savings: [],
  debts: [],
  tags: [],
};

/**
 * Búsqueda global client-side sobre los datos que los hooks existentes ya tienen
 * cacheados (cuentas, categorías, metas, deudas, etiquetas) + un fetch ligero al
 * servidor SOLO para transacciones (la única que va a la red). El término llega
 * ya debounceado desde GlobalSearchBar. Filtro case-insensitive con `.includes()`.
 */
export function useGlobalSearch(term: string) {
  const { accounts, loading: lAcc } = useAccounts();
  const { categories, loading: lCat } = useCategories();
  const { goals, loading: lSav } = useSavings();
  const { debts, loading: lDebt } = useDebts();
  const { tags, loading: lTags } = useTags();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);

  // Transacciones: fetch al servidor con debounce (ya aplicado) + AbortController
  // para cancelar la búsqueda anterior si el usuario sigue escribiendo.
  useEffect(() => {
    if (!term) {
      setTransactions([]);
      setTxLoading(false);
      return;
    }
    const controller = new AbortController();
    setTxLoading(true);
    api
      .get<Paginated<Transaction>>('/transactions', {
        params: { search: term, limit: TX_LIMIT },
        signal: controller.signal,
      })
      .then((r) => setTransactions(r.data.data))
      .catch((err) => {
        if (!axios.isCancel(err)) setTransactions([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setTxLoading(false);
      });
    return () => controller.abort();
  }, [term]);

  // Aplana categorías padre + subcategorías para que ambas sean buscables.
  const allCategories = useMemo(
    () => categories.flatMap((c) => [c, ...(c.children ?? [])]),
    [categories],
  );

  const results = useMemo<GlobalSearchResults>(() => {
    if (!term) return EMPTY;
    const q = term.toLowerCase();
    const has = (s?: string | null) => !!s && s.toLowerCase().includes(q);
    return {
      transactions,
      accounts: accounts.filter((a) => has(a.name)),
      categories: allCategories.filter((c) => has(c.name)),
      savings: goals.filter((g) => has(g.name)),
      debts: debts.filter((d) => has(d.name) || has(d.creditorDebtor)),
      tags: tags.filter((t) => has(t.name)),
    };
  }, [term, transactions, accounts, allCategories, goals, debts, tags]);

  const hasResults =
    results.transactions.length > 0 ||
    results.accounts.length > 0 ||
    results.categories.length > 0 ||
    results.savings.length > 0 ||
    results.debts.length > 0 ||
    results.tags.length > 0;

  const loading = txLoading || lAcc || lCat || lSav || lDebt || lTags;

  return { results, loading, hasResults };
}
