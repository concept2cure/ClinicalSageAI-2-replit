/**
 * Database Status Indicator Component
 *
 * This component shows the current status of the database connection
 * and provides a way for users to retry the connection when it fails.
 */

import React from 'react';
import { useHealthCheck } from '@/hooks/useHealthCheck';
import { AlertCircle, Database, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/hooks/use-toast';

export function DatabaseStatusIndicator() {
  const { isDatabaseConnected, isLoading, refetch } = useHealthCheck();

  const handleRetry = async () => {
    try {
      toast({
        title: 'Reconnecting to database',
        description: 'Attempting to reestablish database connection...',
      });

      await refetch();

      if (isDatabaseConnected) {
        toast({
          title: 'Connection restored',
          description: 'Database connection has been successfully restored.',
          variant: 'success',
        });
      } else {
        toast({
          title: 'Connection failed',
          description: 'Unable to connect to the database. Please try again later.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Connection error',
        description: error.message || 'An error occurred while trying to reconnect.',
        variant: 'destructive',
      });
    }
  };

  // Don't show anything if the database is connected
  if (isDatabaseConnected) {
    return null;
  }

  // Show a loading state if we're checking the connection
  if (isLoading) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="fixed bottom-4 right-4 flex items-center gap-2 rounded-md bg-amber-500 px-3 py-2 text-sm text-white">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Checking database connection...</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Verifying database connectivity</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Show an error state if the database is not connected
  return (
    <div className="fixed bottom-4 right-4 flex items-center gap-2 rounded-md bg-destructive px-4 py-3 text-white shadow-lg">
      <AlertCircle className="h-5 w-5" />
      <div>
        <h3 className="font-semibold">Database Connection Error</h3>
        <p className="text-xs text-white/90">Some features may be unavailable</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="ml-2 bg-transparent text-white hover:bg-white hover:text-destructive"
        onClick={handleRetry}
      >
        <RefreshCw className="mr-1 h-3 w-3" />
        Retry
      </Button>
    </div>
  );
}
