/**
 * @deprecated Stage 2 beta cleanup fence.
 *
 * This entrypoint is not loaded by `client/index.html` in the live app path.
 * Current browser bootstrap is `client/src/main.tsx`.
 *
 * Keep temporarily as compatibility scaffolding only; do not add new behavior here.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { FileContextProvider } from './contexts/FileContext';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <FileContextProvider>
      <App />
    </FileContextProvider>
  </React.StrictMode>
);
