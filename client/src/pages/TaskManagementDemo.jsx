import React from 'react';
import TaskManagementSystemEnhanced from '../components/cmc/TaskManagementSystemEnhanced';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';

// Create a query client for the demo
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const TaskManagementDemo = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-zinc-50 dark:bg-gray-900">
        <div className="h-screen flex flex-col">
          <TaskManagementSystemEnhanced 
            processId="demo-process-1"
            moduleType="CMC"
          />
        </div>
        <Toaster />
      </div>
    </QueryClientProvider>
  );
};

export default TaskManagementDemo;