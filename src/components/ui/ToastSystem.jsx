import React, { useState, useEffect, createContext } from 'react';
import { X, AlertTriangle, CheckCircle, Info, ArrowRight } from 'lucide-react';

// --- SIMPLE EVENT BUS ---
const listeners = new Set();
export const eventBus = {
  emit: (event) => listeners.forEach(l => l(event)),
  subscribe: (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
};

// --- TOAST CONTEXT ---
const ToastContext = createContext();

export function ToastProvider({ children, onNavigate }) {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    // Listen for Global Events
    const unsubscribe = eventBus.subscribe((event) => {
       if (event.type === 'SHOW_TOAST') {
         addToast(event.payload);
       }
    });
    return unsubscribe;
  }, []);

  const addToast = (toast) => {
    const id = Date.now();
    setToasts(prev => [...prev, { ...toast, id }]);
    // Auto-dismiss after 5s
    setTimeout(() => removeToast(id), 8000);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {/* TOAST CONTAINER */}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
        {toasts.map(t => (
          <div 
            key={t.id} 
            className="pointer-events-auto bg-white border border-gray-200 shadow-2xl rounded-lg p-4 w-80 animate-in slide-in-from-right-12 fade-in duration-300 flex gap-3 relative overflow-hidden"
          >
            {/* TYPE INDICATOR */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${t.variant === 'danger' ? 'bg-red-500' : 'bg-blue-500'}`}></div>
            
            <div className={`mt-0.5 ${t.variant === 'danger' ? 'text-red-500' : 'text-blue-500'}`}>
               {t.variant === 'danger' ? <AlertTriangle size={18} /> : <Info size={18} />}
            </div>
            
            <div className="flex-1">
               <h4 className="text-sm font-bold text-gray-900">{t.title}</h4>
               <p className="text-xs text-gray-500 mt-1 leading-relaxed">{t.message}</p>
               
               {t.action && (
                  <button 
                    onClick={() => {
                        t.action.onClick();
                        removeToast(t.id);
                    }}
                    className="mt-2 text-xs font-bold text-blue-600 flex items-center gap-1 hover:underline"
                  >
                    {t.action.label} <ArrowRight size={12} />
                  </button>
               )}
            </div>

            <button onClick={() => removeToast(t.id)} className="text-gray-400 hover:text-gray-600 h-fit">
               <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
