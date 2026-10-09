import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { isNetworkError } from './errors';

const DAY = 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: DAY,
      // Retry transient failures only; 4xx-style errors will not improve by retrying.
      retry: (count, error) => count < 2 && (isNetworkError(error) || /5\d\d|timeout/i.test(String((error as Error)?.message))),
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});

export const queryPersister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'infinity-query-cache-v1', throttleTime: 2000 });

/**
 * Only public, read-only catalogue/content queries opt in with `meta: { persist: true }`.
 * Availability, stock, prices at checkout, payments and bookings are never persisted or trusted from cache.
 */
export const persistOptions = {
  persister: queryPersister,
  maxAge: DAY,
  buster: 'v1',
  dehydrateOptions: { shouldDehydrateQuery: (q: { meta?: Record<string, unknown>; state: { status: string } }) => q.meta?.persist === true && q.state.status === 'success' },
};

export const PERSIST = { persist: true } as const;
