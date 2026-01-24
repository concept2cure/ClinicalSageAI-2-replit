import React from 'react';
import { useDatabaseStatus } from '@/components/providers/database-status-provider';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './card';
import { Button } from './button';
import { Skeleton } from './skeleton';
import { AlertCircle, RefreshCw } from 'lucide-react';

/**
 * Database Aware Component
 *
 * This component wraps children and displays a fallback UI when the database
 * is not connected. It's useful for any component that relies on database data.
 *
 * Usage:
 * <DatabaseAware fallback={<CustomFallback />}>
 *   <YourDatabaseDependentComponent />
 * </DatabaseAware>
 */
export function DatabaseAware({
  children,
  fallback,
  title = 'Database Connection Issue',
  description = 'The system is currently unable to connect to the database. Some features may be unavailable.',
  showRetry = true,
  loadingFallback = null,
  minHeight = 200,
}) {
  const { isConnected, isLoading, retryConnection } = useDatabaseStatus();

  // Show loading fallback if specified
  if (isLoading) {
    if (loadingFallback) {
      return loadingFallback;
    }

    return (
      <div className="space-y-2" style={{ minHeight: `${minHeight}px` }}>
        <Skeleton className="h-8 w-3/4 mb-4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  // If connected, show the children
  if (isConnected) {
    return children;
  }

  // Show custom fallback if provided
  if (fallback) {
    return typeof fallback === 'function' ? fallback({ retry: retryConnection }) : fallback;
  }

  // Default fallback UI
  return (
    <Card className="border-muted-foreground/20" style={{ minHeight: `${minHeight}px` }}>
      <CardHeader>
        <CardTitle className="text-muted-foreground flex items-center">
          <AlertCircle className="mr-2 h-5 w-5 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">{description}</p>
      </CardContent>
      {showRetry && (
        <CardFooter>
          <Button variant="outline" size="sm" onClick={retryConnection} className="text-xs">
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Retry Connection
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

/**
 * Data Aware Component
 *
 * This component wraps children and handles data loading states elegantly.
 * It will display appropriate loading and error states.
 *
 * Usage:
 * <DataAware
 *   data={yourData}
 *   isLoading={isLoading}
 *   error={error}
 *   loadingFallback={<CustomLoading />}
 *   errorFallback={<CustomError />}
 * >
 *   {(data) => <YourComponent data={data} />}
 * </DataAware>
 */
export function DataAware({
  children,
  data,
  isLoading,
  error,
  loadingFallback,
  errorFallback,
  retry,
  emptyMessage = 'No data available',
  minHeight = 200,
}) {
  // Show loading state
  if (isLoading) {
    if (loadingFallback) {
      return loadingFallback;
    }

    return (
      <div className="space-y-2" style={{ minHeight: `${minHeight}px` }}>
        <Skeleton className="h-8 w-3/4 mb-4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  // Show error state
  if (error) {
    if (errorFallback) {
      return typeof errorFallback === 'function' ? errorFallback({ error, retry }) : errorFallback;
    }

    return (
      <Card className="border-destructive/20" style={{ minHeight: `${minHeight}px` }}>
        <CardHeader>
          <CardTitle className="text-destructive flex items-center">
            <AlertCircle className="mr-2 h-5 w-5" />
            Error Loading Data
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            {error.message || 'An error occurred while loading data.'}
          </p>
        </CardContent>
        {retry && (
          <CardFooter>
            <Button variant="outline" size="sm" onClick={retry} className="text-xs">
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Retry
            </Button>
          </CardFooter>
        )}
      </Card>
    );
  }

  // Show empty state
  if (!data || (Array.isArray(data) && data.length === 0)) {
    return (
      <Card className="border-muted-foreground/20" style={{ minHeight: `${minHeight}px` }}>
        <CardContent className="flex items-center justify-center h-full">
          <p className="text-muted-foreground text-sm">{emptyMessage}</p>
        </CardContent>
      </Card>
    );
  }

  // Render children with data
  return typeof children === 'function' ? children(data) : children;
}
