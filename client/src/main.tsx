import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import queryClient from './lib/queryClient';
import './index.css';
import App from './App';
import ErrorBoundary from './ErrorBoundary';
import { FileContextProvider } from './contexts/FileContext';
import { AuthProvider } from './contexts/AuthContext';
import { Toaster } from './components/ui/toaster';

// Render the app with React 18 createRoot API - using the main App component
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <FileContextProvider>
          <AuthProvider>
            <App />
            <Toaster />
          </AuthProvider>
        </FileContextProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
