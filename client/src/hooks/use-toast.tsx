import React, { createContext, useContext, useState } from 'react';

type ToastType = 'default' | 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  title?: string;
  description: string;
  type: ToastType;
  duration?: number;
  onClose?: () => void;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prevToasts => [...prevToasts, { ...toast, id, type: toast.type || 'default' }]);

    // Auto-remove toast after duration (default: 5000ms)
    if (toast.duration !== Infinity) {
      setTimeout(() => {
        removeToast(id);
        toast.onClose?.();
      }, toast.duration || 5000);
    }
  };

  const removeToast = (id: string) => {
    setToasts(prevToasts => prevToasts.filter(toast => toast.id !== id));
  };

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <div className="toast-container fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`toast p-4 rounded-md shadow-md flex items-start max-w-md 
            ${toast.type === 'success' ? 'bg-stone-100 border-l-4 border-stone-1000' : ''}
            ${toast.type === 'error' ? 'bg-stone-100 border-l-4 border-stone-1000' : ''}
            ${toast.type === 'warning' ? 'bg-stone-100 border-l-4 border-stone-1000' : ''}
            ${toast.type === 'info' ? 'bg-stone-100 border-l-4 border-stone-1000' : ''}
            ${toast.type === 'default' ? 'bg-white border-l-4 border-stone-300' : ''}
            `}
          >
            <div className="flex-grow">
              {toast.title && <h4 className="font-semibold mb-1">{toast.title}</h4>}
              <p className="text-sm">{toast.description}</p>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="ml-4 text-stone-500 hover:text-stone-800"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }

  return {
    toast: {
      success: (
        description: string,
        options?: { title?: string; duration?: number; onClose?: () => void }
      ) => {
        context.addToast({ type: 'success', description, ...options });
      },
      error: (
        description: string,
        options?: { title?: string; duration?: number; onClose?: () => void }
      ) => {
        context.addToast({ type: 'error', description, ...options });
      },
      warning: (
        description: string,
        options?: { title?: string; duration?: number; onClose?: () => void }
      ) => {
        context.addToast({ type: 'warning', description, ...options });
      },
      info: (
        description: string,
        options?: { title?: string; duration?: number; onClose?: () => void }
      ) => {
        context.addToast({ type: 'info', description, ...options });
      },
      default: (
        description: string,
        options?: { title?: string; duration?: number; onClose?: () => void }
      ) => {
        context.addToast({ type: 'default', description, ...options });
      },
    },
    toasts: context.toasts,
    dismissToast: context.removeToast,
  };
};
