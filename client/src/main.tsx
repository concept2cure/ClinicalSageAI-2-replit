// Initialize Sentry error monitoring early, before other imports
import './utils/sentry';

import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import queryClient from './lib/queryClient';
// Canonical design-system tokens (Claude Design bundle). MUST load before any
// component CSS or CSS module so var(--accent-100), var(--bg-000), etc.
// resolve everywhere. See design-system/CLAUDE.md "Token import" section.
import '../../design-system/colors_and_type.css';
import './index.css';
import App from './App';
import ErrorBoundary from './ErrorBoundary';
import { FileContextProvider } from './contexts/FileContext';
import { Toaster } from './components/ui/toaster';

// Render the app with React 18 createRoot API - using the main App component
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <FileContextProvider>
          <App />
          <Toaster />
        </FileContextProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
