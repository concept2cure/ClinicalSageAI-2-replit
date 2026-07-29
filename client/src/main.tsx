// CSP nonce plumbing MUST load first — installs document.createElement
// patch so every runtime-injected <style> (Tiptap, Radix, our own React
// components) gets nonced before any other import has a chance to create
// one.
import './cspNonce';

// Initialize Sentry error monitoring early, before other imports
import './utils/sentry';

// Initialize i18next (side-effect import) before any component renders so the
// first paint already reflects the detected language and <html lang>.
import i18n from './i18n';

import React from 'react';
import ReactDOM from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { QueryClientProvider } from '@tanstack/react-query';
import queryClient from './lib/queryClient';
// Canonical design-system tokens (Claude Design bundle). MUST load before any
// component CSS or CSS module so var(--accent-100), var(--bg-000), etc.
// resolve everywhere. See design-system/CLAUDE.md "Token import" section.
import '../../design-system/colors_and_type.css';
// Phase 3 Projects surface stylesheet — lifted verbatim from
// design-system/ui_kits/home/styles.css. Loads after tokens, before any
// component CSS, so its var() references resolve and downstream styles
// (CSS modules etc.) can still override on element-level basis if ever
// needed. See client/src/styles/projects-prototype.css header.
import './styles/projects-prototype.css';
import './index.css';
import App from './App';
import ErrorBoundary from './ErrorBoundary';
import { FileContextProvider } from './contexts/FileContext';
import { Toaster } from './components/ui/toaster';

// Render the app with React 18 createRoot API - using the main App component
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <FileContextProvider>
            <App />
            <Toaster />
          </FileContextProvider>
        </QueryClientProvider>
      </I18nextProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
