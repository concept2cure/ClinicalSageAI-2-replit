import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { FileContextProvider } from './contexts/FileContext';
import { AuthProvider } from './contexts/AuthContext';
import { Toaster } from './components/ui/toaster';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <FileContextProvider>
      <AuthProvider>
        <App />
        <Toaster />
      </AuthProvider>
    </FileContextProvider>
  </React.StrictMode>
);
