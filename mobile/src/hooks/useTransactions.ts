import { useCallback, useEffect, useState } from 'react';
import { transactionsApi, getErrorMessage } from '../api/client';
import { useAppStore } from '../stores/appStore';
import type { Transaction, TransactionFilters } from '../types';

export function useTransactions(filters: TransactionFilters = {}, limit = 30) {
  const [data, setData] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const refreshKey = useAppStore((s) => s.refreshKey);

  const filtersKey = JSON.stringify(filters);

  const load = useCallback(
    async (targetPage: number, mode: 'initial' | 'refresh' | 'more') => {
      try {
        if (mode === 'refresh') setRefreshing(true);
        else if (mode === 'more') setLoadingMore(true);
        else setLoading(true);
        setError(null);

        const res = await transactionsApi.list({ ...filters, page: targetPage, limit });
        setTotalPages(res.pagination.totalPages);
        setPage(targetPage);
        setData((prev) => (mode === 'more' ? [...prev, ...res.data] : res.data));
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtersKey, limit],
  );

  useEffect(() => {
    load(1, 'initial');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, refreshKey]);

  const refresh = useCallback(() => load(1, 'refresh'), [load]);
  const loadMore = useCallback(() => {
    if (!loadingMore && !loading && page < totalPages) load(page + 1, 'more');
  }, [load, loadingMore, loading, page, totalPages]);

  return { transactions: data, loading, refreshing, loadingMore, error, refresh, loadMore, hasMore: page < totalPages };
}
