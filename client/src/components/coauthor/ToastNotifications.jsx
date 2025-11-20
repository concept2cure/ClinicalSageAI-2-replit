/**
 * SharePoint-style Toast Notifications Component
 * Shows sliding toast notifications from top-right corner
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  X,
  Eye,
  ChevronRight,
  Bell,
  MessageSquare,
  FileText,
  Package,
  Shield,
  Share2,
  UserPlus,
  Clock,
} from 'lucide-react';

// Toast context for global usage
const ToastContext = React.createContext();

/**
 * Get toast icon based on type
 */
function getToastIcon(type) {
  switch (type) {
    case 'success':
      return <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />;
    case 'error':
      return <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />;
    case 'warning':
      return <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />;
    case 'info':
      return <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />;
    case 'notification':
      return <Bell className="h-5 w-5 text-purple-600 dark:text-purple-400" />;
    case 'mention':
      return <MessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />;
    case 'document':
      return <FileText className="h-5 w-5 text-slate-600 dark:text-slate-400" />;
    case 'component':
      return <Package className="h-5 w-5 text-purple-600 dark:text-purple-400" />;
    case 'compliance':
      return <Shield className="h-5 w-5 text-red-600 dark:text-red-400" />;
    case 'share':
      return <Share2 className="h-5 w-5 text-green-600 dark:text-green-400" />;
    case 'user':
      return <UserPlus className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />;
    default:
      return <Info className="h-5 w-5 text-slate-600 dark:text-slate-400" />;
  }
}

/**
 * Get toast background color based on type
 */
function getToastBackground(type) {
  switch (type) {
    case 'success':
      return 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800';
    case 'error':
      return 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800';
    case 'warning':
      return 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800';
    case 'info':
      return 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800';
    case 'notification':
      return 'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800';
    default:
      return 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800';
  }
}

/**
 * Individual Toast Component
 */
function Toast({ toast, onDismiss, position = 'top-right' }) {
  const [progress, setProgress] = useState(100);
  const progressInterval = useRef(null);

  useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const startTime = Date.now();
      
      progressInterval.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 100 - (elapsed / toast.duration) * 100);
        setProgress(remaining);
        
        if (remaining === 0) {
          clearInterval(progressInterval.current);
          onDismiss(toast.id);
        }
      }, 50);

      return () => {
        if (progressInterval.current) {
          clearInterval(progressInterval.current);
        }
      };
    }
  }, [toast, onDismiss]);

  const handleMouseEnter = () => {
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
      setProgress(100);
    }
  };

  const handleMouseLeave = () => {
    if (toast.duration && toast.duration > 0) {
      const remainingTime = (progress / 100) * toast.duration;
      const startTime = Date.now();
      
      progressInterval.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, progress - (elapsed / remainingTime) * progress);
        setProgress(remaining);
        
        if (remaining === 0) {
          clearInterval(progressInterval.current);
          onDismiss(toast.id);
        }
      }, 50);
    }
  };

  const positionClasses = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'top-center': 'top-4 left-1/2 -translate-x-1/2',
    'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: position.includes('top') ? -50 : 50, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={`fixed z-[9999] ${positionClasses[position]} pointer-events-auto`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Card className={`w-96 overflow-hidden shadow-2xl border ${getToastBackground(toast.type)}`}>
        <div className="p-4">
          <div className="flex gap-3">
            {/* Icon or Avatar */}
            {toast.avatar ? (
              <Avatar className="h-10 w-10">
                <AvatarImage src={toast.avatar} alt={toast.userName || ''} />
                <AvatarFallback>
                  {toast.userName?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
            ) : (
              <div className="flex-shrink-0">
                {getToastIcon(toast.type)}
              </div>
            )}

            {/* Content */}
            <div className="flex-1 min-w-0">
              {toast.title && (
                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
                  {toast.title}
                </h4>
              )}
              {toast.message && (
                <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                  {toast.message}
                </p>
              )}
              {toast.timestamp && (
                <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                  {toast.timestamp}
                </p>
              )}
              
              {/* Action Buttons */}
              {(toast.actions || toast.actionUrl) && (
                <div className="flex gap-2 mt-3">
                  {toast.actionUrl && (
                    <Button
                      size="sm"
                      variant="default"
                      className="h-7 text-xs"
                      onClick={() => {
                        window.location.href = toast.actionUrl;
                        onDismiss(toast.id);
                      }}
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      View
                    </Button>
                  )}
                  {toast.actions?.map((action, index) => (
                    <Button
                      key={index}
                      size="sm"
                      variant={action.variant || 'outline'}
                      className="h-7 text-xs"
                      onClick={() => {
                        action.onClick?.();
                        if (action.dismissOnClick !== false) {
                          onDismiss(toast.id);
                        }
                      }}
                    >
                      {action.icon && <span className="mr-1">{action.icon}</span>}
                      {action.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>

            {/* Close Button */}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 flex-shrink-0 hover:bg-white/50 dark:hover:bg-black/50"
              onClick={() => onDismiss(toast.id)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Progress Bar */}
        {toast.duration && toast.duration > 0 && (
          <div className="h-1 bg-slate-200 dark:bg-slate-800">
            <motion.div
              className="h-full bg-gradient-to-r from-blue-500 to-purple-600"
              initial={{ width: '100%' }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.1, ease: 'linear' }}
            />
          </div>
        )}
      </Card>
    </motion.div>
  );
}

/**
 * Toast Container Component
 */
function ToastContainer({ position = 'top-right' }) {
  const [toasts, setToasts] = useState([]);

  // Add toast function
  const addToast = useCallback((options) => {
    const id = Date.now().toString();
    const toast = {
      id,
      duration: 5000, // Default 5 seconds
      type: 'info',
      ...options,
    };
    
    setToasts(prev => [...prev, toast]);
    return id;
  }, []);

  // Remove toast function
  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Clear all toasts
  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  // Expose methods via context
  React.useImperativeHandle(toastRef, () => ({
    addToast,
    removeToast,
    clearToasts,
  }), [addToast, removeToast, clearToasts]);

  return createPortal(
    <div className="fixed inset-0 pointer-events-none z-[9999]">
      <AnimatePresence mode="sync">
        {toasts.map((toast, index) => (
          <div
            key={toast.id}
            style={{
              transform: position.includes('top') 
                ? `translateY(${index * 110}px)` 
                : `translateY(-${index * 110}px)`,
            }}
          >
            <Toast
              toast={toast}
              onDismiss={removeToast}
              position={position.replace(/-\d+$/, '')} // Remove stacking index from position
            />
          </div>
        ))}
      </AnimatePresence>
    </div>,
    document.body
  );
}

// Global toast ref
let toastRef = React.createRef();

/**
 * Toast Provider Component
 */
export function ToastProvider({ children, position = 'top-right' }) {
  return (
    <>
      {children}
      <ToastContainer ref={toastRef} position={position} />
    </>
  );
}

/**
 * Hook to use toast notifications
 */
export function useSharePointToast() {
  const showToast = useCallback((options) => {
    if (toastRef.current) {
      return toastRef.current.addToast(options);
    }
  }, []);

  const hideToast = useCallback((id) => {
    if (toastRef.current) {
      toastRef.current.removeToast(id);
    }
  }, []);

  const clearAllToasts = useCallback(() => {
    if (toastRef.current) {
      toastRef.current.clearToasts();
    }
  }, []);

  return {
    // Main toast methods
    showToast,
    hideToast,
    clearAllToasts,

    // Convenience methods for different types
    success: (options) => showToast({ ...options, type: 'success' }),
    error: (options) => showToast({ ...options, type: 'error' }),
    warning: (options) => showToast({ ...options, type: 'warning' }),
    info: (options) => showToast({ ...options, type: 'info' }),
    notification: (options) => showToast({ ...options, type: 'notification' }),

    // Activity notification
    activity: (options) => showToast({
      type: 'notification',
      duration: 7000,
      ...options,
    }),

    // Mention notification
    mention: (options) => showToast({
      type: 'mention',
      title: 'You were mentioned',
      duration: 10000,
      ...options,
    }),

    // Document notification
    document: (options) => showToast({
      type: 'document',
      duration: 5000,
      ...options,
    }),

    // Component notification
    component: (options) => showToast({
      type: 'component',
      duration: 5000,
      ...options,
    }),

    // Compliance alert
    compliance: (options) => showToast({
      type: 'compliance',
      duration: 0, // Don't auto-dismiss compliance alerts
      ...options,
    }),

    // Share notification
    share: (options) => showToast({
      type: 'share',
      title: 'Shared with you',
      duration: 5000,
      ...options,
    }),
  };
}

// Default export
export default ToastContainer;