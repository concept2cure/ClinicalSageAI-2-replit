// Simplified toast context that doesn't depend on external components

import React, { createContext, useContext, ReactNode, useState } from 'react';

// Define our own simple toast system to avoid circular dependencies
export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

// Define the context type
interface ToastContextProps {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
  toasts: ToastMessage[];
  removeToast: (id: string) => void;
}

// Create the context with default fallback values
const ToastContext = createContext<ToastContextProps>({
  success: msg => console.log(`Toast success: ${msg}`),
  error: msg => console.log(`Toast error: ${msg}`),
  info: msg => console.log(`Toast info: ${msg}`),
  warning: msg => console.log(`Toast warning: ${msg}`),
  toasts: [],
  removeToast: () => {},
});

// Create a provider component
export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Generate a unique id
  const generateId = () => Math.random().toString(36).substring(2, 9);

  // Add a toast
  const addToast = (message: string, type: 'success' | 'error' | 'info' | 'warning') => {
    const id = generateId();
    setToasts(prev => [...prev, { id, message, type }]);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      removeToast(id);
    }, 5000);
  };

  // Remove a toast
  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  // Define toast functions
  const success = (message: string) => addToast(message, 'success');
  const error = (message: string) => addToast(message, 'error');
  const info = (message: string) => addToast(message, 'info');
  const warning = (message: string) => addToast(message, 'warning');

  return (
    <ToastContext.Provider
      value={{
        success,
        error,
        info,
        warning,
        toasts,
        removeToast,
      }}
    >
      {children}

      {/* Simple toast container */}
      {toasts.length > 0 && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          {toasts.map(toast => (
            <div
              key={toast.id}
              style={{
                padding: '10px 15px',
                backgroundColor:
                  toast.type === 'success'
                    ? '#4caf50'
                    : toast.type === 'error'
                      ? '#f44336'
                      : toast.type === 'warning'
                        ? '#ff9800'
                        : '#2196f3',
                color: 'white',
                borderRadius: '4px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                minWidth: '200px',
                maxWidth: '350px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>{toast.message}</span>
              <button
                onClick={() => removeToast(toast.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '16px',
                  marginLeft: '10px',
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
};

// Create a custom hook to use the toast context
export const useToast = () => {
  return useContext(ToastContext);
};

// Simple WebSocket hook that doesn't use complex dependencies
export const useWebSocketStatus = () => {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>(
    'connecting'
  );

  // Effect for checking WebSocket status without actually breaking anything
  React.useEffect(() => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      console.log('Checking WebSocket status:', wsUrl);

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('WebSocket connected');
        setStatus('connected');
      };

      ws.onerror = () => {
        console.log('WebSocket error');
        setStatus('error');
      };

      ws.onclose = () => {
        console.log('WebSocket closed');
        setStatus('disconnected');
      };

      return () => {
        try {
          ws.close();
        } catch (err) {
          console.error('Error closing WebSocket:', err);
        }
      };
    } catch (err) {
      console.error('Error creating WebSocket:', err);
      setStatus('error');
    }
  }, []);

  return status;
};
