/**
 * Health Check Hook
 *
 * This hook provides information about system health and database connectivity.
 */

import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

export function useHealthCheck() {
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ['/api/health/deep'],
    queryFn: async () => {
      try {
        const result = await apiRequest('GET', '/api/health/deep');
        return await result.json();
      } catch (error) {
        console.error('Health check failed:', error);
        return {
          status: 'error',
          components: {
            database: { status: 'error', error: error.message },
          },
        };
      }
    },
    staleTime: 60000, // Re-fetch every minute
    retry: 3,
    retryDelay: 1000,
  });

  // Determine overall health status
  const isHealthy = data?.status === 'ok';
  const isDatabaseConnected = data?.components?.database?.status === 'ok';

  return {
    isHealthy,
    isDatabaseConnected,
    healthData: data,
    isLoading,
    error,
    refetch,
  };
}
