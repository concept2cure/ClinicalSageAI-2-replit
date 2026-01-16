import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react'

// Simple toast store
let toastListeners = [];
let toasts = [];

const addToast = (toast) => {
  const id = toast.id || Date.now().toString();
  const newToast = {
    ...toast,
    id,
    createdAt: Date.now(),
  };
  
  toasts = [...toasts, newToast];
  toastListeners.forEach(listener => listener([...toasts]));
  
  // Auto-dismiss after duration (default 5 seconds)
  const duration = toast.duration || 5000;
  if (duration > 0) {
    setTimeout(() => {
      removeToast(id);
    }, duration);
  }
  
  return id;
};

const removeToast = (id) => {
  toasts = toasts.filter(t => t.id !== id);
  toastListeners.forEach(listener => listener([...toasts]));
};

// Hook to subscribe to toast updates
const useToastStore = () => {
  const [toastList, setToastList] = useState([]);
  
  useEffect(() => {
    const listener = (newToasts) => {
      setToastList(newToasts);
    };
    
    toastListeners.push(listener);
    
    // Set initial toasts
    setToastList([...toasts]);
    
    return () => {
      toastListeners = toastListeners.filter(l => l !== listener);
    };
  }, []);
  
  return toastList;
};

// Toast component
const Toast = ({ toast, onDismiss }) => {
  const isDestructive = toast.variant === 'destructive';
  
  return (
    <div
      className={`
        pointer-events-auto flex w-full max-w-md rounded-lg shadow-lg overflow-hidden
        ${isDestructive 
          ? 'bg-red-50 border border-red-200' 
          : 'bg-white border border-gray-200'
        }
      `}
      role="alert"
    >
      <div className="flex-1 p-4">
        {toast.title && (
          <div className={`text-sm font-semibold ${isDestructive ? 'text-red-900' : 'text-gray-900'}`}>
            {toast.title}
          </div>
        )}
        {toast.description && (
          <div className={`mt-1 text-sm ${isDestructive ? 'text-red-700' : 'text-gray-600'}`}>
            {toast.description}
          </div>
        )}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className={`
          flex-shrink-0 p-2 hover:bg-gray-100 transition-colors
          ${isDestructive ? 'hover:bg-red-100' : ''}
        `}
      >
        <X className="h-4 w-4 text-gray-500" />
      </button>
    </div>
  );
};

// Main Toaster component
export const Toaster = () => {
  const toastList = useToastStore();
  
  return (
    <div className="fixed top-0 right-0 z-50 p-4 pointer-events-none">
      <div className="flex flex-col gap-2">
        {toastList.map((toast) => (
          <Toast 
            key={toast.id} 
            toast={toast} 
            onDismiss={removeToast}
          />
        ))}
      </div>
    </div>
  );
};

// Export the toast function for external use
export const toast = (props) => {
  // Ensure props is an object and has valid content
  if (!props || typeof props !== 'object') {
    console.error('Invalid toast props:', props);
    return;
  }
  
  // Extract only the properties we need for rendering
  const toastData = {
    title: props.title || '',
    description: props.description || '',
    variant: props.variant,
    duration: props.duration,
    id: props.id,
  };
  
  return addToast(toastData);
};

// Also export a hook version
export const useToast = () => {
  return {
    toast,
    dismiss: removeToast,
  };
};