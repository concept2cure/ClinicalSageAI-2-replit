import React, { createContext, useContext, useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { apiRequest } from '@/lib/queryClient';

// Create a context for database status
const DatabaseStatusContext = createContext({
 isConnected: true,
 isLoading: true,
 lastError: null,
 lastChecked: null,
 retryConnection: () => {},
});

// Hook to use the database status in components
export const useDatabaseStatus = () => useContext(DatabaseStatusContext);

// Default polling interval in milliseconds (15 seconds)
const DEFAULT_POLL_INTERVAL = 15000;

/**
 * Database Status Provider
 *
 * This component provides information about the database connection status
 * throughout the application, along with handling for connection issues.
 */
export function DatabaseStatusProvider({
 children,
 pollInterval = DEFAULT_POLL_INTERVAL,
 showAlert = true,
}) {
 const queryClient = useQueryClient();
 const [shouldRefetch, setShouldRefetch] = useState(false);

 // Fetch database health status
 const { data, isLoading, error, refetch, dataUpdatedAt } = useQuery({
 queryKey: ['/api/health/deep'],
 queryFn: async () => {
 try {
 const response = await apiRequest('GET', '/api/health/deep');
 if (!response.ok) {
 throw new Error('Failed to fetch database status');
 }
 return response.json();
 } catch (error) {
 console.error('Database health check failed:', error);
 throw error;
 }
 },
 refetchInterval: pollInterval,
 refetchIntervalInBackground: true,
 refetchOnWindowFocus: true,
 retry: 2,
 staleTime: pollInterval * 0.75, // 75% of poll interval
 enabled: true,
 });

 // Force a refetch when requested
 useEffect(() => {
 if (shouldRefetch) {
 refetch();
 setShouldRefetch(false);
 }
 }, [shouldRefetch, refetch]);

 // Extract database status information
 const databaseStatus = {
 isConnected: data?.components?.database?.status === 'ok',
 isLoading,
 lastError:
 data?.components?.database?.status !== 'ok'
 ? {
 message: data?.components?.database?.error || 'Database connection issue',
 details: data?.components?.database?.pool?.errorMessage,
 }
 : error
 ? { message: error.message }
 : null,
 lastChecked: dataUpdatedAt ? new Date(dataUpdatedAt) : null,
 status: data?.components?.database?.status,
 poolStats: data?.components?.database?.pool,
 latency: data?.components?.database?.latency,
 retryConnection: () => setShouldRefetch(true),
 };

 return (
 <DatabaseStatusContext.Provider value={databaseStatus}>
 {showAlert && !databaseStatus.isConnected && !databaseStatus.isLoading && (
 <Alert variant="destructive" className="mb-4">
 <AlertCircle className="h-4 w-4" />
 <AlertTitle>Database Connection Issue</AlertTitle>
 <AlertDescription className="flex flex-col space-y-2">
 <p>{databaseStatus.lastError?.message || 'Unable to connect to the database'}</p>
 {databaseStatus.lastError?.details && (
 <p className="text-xs">{databaseStatus.lastError.details}</p>
 )}
 <p className="text-xs mt-2">
 Some features may be unavailable. The system will automatically retry connecting.
 </p>
 </AlertDescription>
 </Alert>
 )}
 {children}
 </DatabaseStatusContext.Provider>
 );
}
