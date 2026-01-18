/**
 * React Query Provider Configuration
 * 
 * Wraps the app with QueryClientProvider and configures defaults
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

// Create a client with sensible defaults
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache for 5 minutes
      staleTime: 5 * 60 * 1000,
      // Keep unused data for 10 minutes
      gcTime: 10 * 60 * 1000,
      // Retry failed requests 1 time
      retry: 1,
      // Don't refetch on window focus (too aggressive for enterprise UX)
      refetchOnWindowFocus: false,
      // Don't refetch on mount unless data is stale
      refetchOnMount: 'stale',
    },
    mutations: {
      // Don't retry mutations by default (user should explicitly retry)
      retry: 0,
    },
  },
});

/**
 * Provider component to wrap app
 */
export function CERv2QueryProvider({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* Only show devtools in development */}
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
