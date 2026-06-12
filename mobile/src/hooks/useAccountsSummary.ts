import { useCallback, useEffect, useState } from 'react';
import { accountsApi, getErrorMessage } from '../api/client';
import { useAppStore } from '../stores/appStore';
import type { AccountsSummary } from '../types';

/** Balance consolidado convertido a `displayCurrency` (GET /api/accounts/summary). */
export function useAccountsSummary(displayCurrency: string) {
  const [summary, setSummary] = useState<AccountsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshKey = useAppStore((s) => s.refreshKey);

  const fetch = useCallback(
    async (force = false) => {
      try {
        setLoading(true);
        setError(null);
        setSummary(await accountsApi.summary(displayCurrency, force));
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [displayCurrency],
  );

  useEffect(() => {
    fetch();
  }, [fetch, refreshKey]);

  return { summary, loading, error, refetch: fetch };
}
