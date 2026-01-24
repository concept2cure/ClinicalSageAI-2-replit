import React, { createContext, useContext, useState, useCallback } from 'react';

/**
 * Toast notification types
 */
export const TOAST_TYPES = {
  DEFAULT: 'default',
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
};

// Create Toast Context
export const ToastContext = createContext(null);

/**
 * Toast Provider Component
 *
 * Wraps the application and provides toast functionality
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((content, options = {}) => {
    const id = Math.random().toString(36).substring(2, 9);
    const toast = {
      id,
      content,
      type: options.type || TOAST_TYPES.DEFAULT,
      title: options.title || '',
      duration: options.duration || 5000,
      ...options,
    };

    setToasts(prevToasts => [...prevToasts, toast]);

    if (options.duration !== 0) {
      setTimeout(() => {
        removeToast(id);
      }, toast.duration);
    }

    return id;
  }, []);

  const removeToast = useCallback(id => {
    setToasts(prevToasts => prevToasts.filter(toast => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  );
}

/**
 * Toast Container Component
 *
 * Displays the toast notifications
 */
function ToastContainer() {
  const { toasts, removeToast } = useContext(ToastContext);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-0 right-0 p-4 w-full md:max-w-sm z-50 space-y-4">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`${getToastClasses(
            toast.type
          )} rounded-lg shadow-lg overflow-hidden max-w-full`}
          role="alert"
        >
          <div className="p-4">
            {toast.title && (
              <div className="flex items-start">
                <div className="flex-1">
                  <h3 className="text-sm font-medium">{toast.title}</h3>
                </div>
                <div className="ml-3 flex-shrink-0">
                  <button
                    type="button"
                    className="inline-flex rounded-md text-gray-400 hover:text-gray-500 focus:outline-none"
                    onClick={() => removeToast(toast.id)}
                  >
                    <span className="sr-only">Close</span>
                    <svg
                      className="h-5 w-5"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            )}
            <div className={toast.title ? 'mt-2' : ''}>
              <p className="text-sm text-gray-700">{toast.content}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Get CSS classes for toast based on type
 */
function getToastClasses(type) {
  switch (type) {
    case TOAST_TYPES.SUCCESS:
      return 'bg-green-50 border-l-4 border-green-400';
    case TOAST_TYPES.ERROR:
      return 'bg-red-50 border-l-4 border-red-400';
    case TOAST_TYPES.WARNING:
      return 'bg-yellow-50 border-l-4 border-yellow-400';
    case TOAST_TYPES.INFO:
      return 'bg-blue-50 border-l-4 border-blue-400';
    default:
      return 'bg-white border-l-4 border-gray-300';
  }
}

/**
 * useToast Hook
 *
 * Custom hook to use toast functionality
 */
export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }

  const { addToast, removeToast } = context;

  return {
    toast: (content, options) => addToast(content, options),
    success: (content, options) => addToast(content, { ...options, type: TOAST_TYPES.SUCCESS }),
    error: (content, options) => addToast(content, { ...options, type: TOAST_TYPES.ERROR }),
    warning: (content, options) => addToast(content, { ...options, type: TOAST_TYPES.WARNING }),
    info: (content, options) => addToast(content, { ...options, type: TOAST_TYPES.INFO }),
    remove: id => removeToast(id),
  };
}
