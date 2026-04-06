import React, { useState, useEffect, useCallback, useContext } from 'react';

/**
 * FAILSAFE TOAST SYSTEM
 *
 * This is a completely dependency-free toast implementation
 * designed to be extremely reliable and stable. It uses only
 * React core features to ensure it continues to work even if
 * external dependencies fail.
 *
 * Features:
 * - Zero external dependencies
 * - Inline styles for zero CSS dependencies
 * - Graceful error handling with fallbacks
 * - Works in any React environment
 */

// Create toast context with fallback
const ToastContext = React.createContext({
 // Fallback implementations that work even if context fails
 showToast: message => {
 console.log('Toast (fallback):', message);
 },
 removeToast: () => {},
 success: message => {
 console.log('Success toast (fallback):', message);
 },
 error: message => {
 console.log('Error toast (fallback):', message);
 },
 warning: message => {
 console.log('Warning toast (fallback):', message);
 },
 info: message => {
 console.log('Info toast (fallback):', message);
 },
});

// Custom hook to use toast with error handling
export const useToast = () => {
 try {
 const context = useContext(ToastContext);
 // Always return at least the fallback implementation
 return context || ToastContext._currentValue;
 } catch (err) {
 console.error('Toast error (handled):', err);
 // Return a working implementation even if context fails
 return {
 showToast: message => {
 console.log('Toast (recovery):', message);
 },
 removeToast: () => {},
 success: message => {
 console.log('Success toast (recovery):', message);
 },
 error: message => {
 console.log('Error toast (recovery):', message);
 },
 warning: message => {
 console.log('Warning toast (recovery):', message);
 },
 info: message => {
 console.log('Info toast (recovery):', message);
 },
 };
 }
};

// Simple toast styles added inline to avoid CSS dependency
const toastStyles = {
 container: {
 position: 'fixed',
 top: '1rem',
 right: '1rem',
 zIndex: 9999,
 display: 'flex',
 flexDirection: 'column',
 gap: '0.5rem',
 maxWidth: '100%',
 width: '320px',
 },
 toast: {
 padding: '1rem',
 borderRadius: '0.375rem',
 boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
 display: 'flex',
 justifyContent: 'space-between',
 alignItems: 'center',
 animation: 'slideIn 0.3s ease-out forwards',
 color: 'white',
 fontWeight: 500,
 },
 info: {
 backgroundColor: '#78716c',
 },
 success: {
 backgroundColor: '#788c5d',
 },
 error: {
 backgroundColor: '#ef4444',
 },
 warning: {
 backgroundColor: '#f59e0b',
 },
 closeButton: {
 background: 'transparent',
 border: 'none',
 color: 'white',
 cursor: 'pointer',
 fontSize: '1rem',
 marginLeft: '0.5rem',
 },
};

// CSS Animation for toasts defined as a string to avoid external CSS files
const cssAnimation = `
@keyframes secureToastSlideIn {
 from { transform: translateX(100%); opacity: 0; }
 to { transform: translateX(0); opacity: 1; }
}

@keyframes secureToastSlideOut {
 from { transform: translateX(0); opacity: 1; }
 to { transform: translateX(100%); opacity: 0; }
}
`;

// Toast Provider component with extensive error handling
export const ToastProvider = ({ children }) => {
 // Insert CSS animations into the document head
 useEffect(() => {
 try {
 const styleElement = document.createElement('style');
 styleElement.textContent = cssAnimation;
 document.head.appendChild(styleElement);

 return () => {
 try {
 document.head.removeChild(styleElement);
 } catch (e) {
 console.warn('Toast cleanup error (handled):', e);
 }
 };
 } catch (e) {
 console.warn('Toast style error (handled):', e);
 }
 }, []);

 // State with error recovery
 const [toasts, setToasts] = useState([]);
 const [errorState, setErrorState] = useState(false);

 // Function to add a toast with error handling
 const showToast = useCallback((message, type = 'info', duration = 3000) => {
 try {
 if (typeof message !== 'string') {
 // Handle non-string messages gracefully
 message = String(message || 'Notification');
 }

 const id = Date.now();
 setToasts(prevToasts => {
 try {
 return [...prevToasts, { id, message, type }];
 } catch (e) {
 console.warn('Toast state error (handled):', e);
 return [{ id, message, type }]; // Reset state if broken
 }
 });

 if (duration !== Infinity) {
 setTimeout(() => {
 try {
 setToasts(prevToasts => prevToasts.filter(toast => toast.id !== id));
 } catch (e) {
 console.warn('Toast removal error (handled):', e);
 setToasts([]); // Failsafe: clear all if error
 }
 }, duration);
 }

 return id;
 } catch (e) {
 console.error('Critical toast error (handled):', e);
 // Log fallback output when toast system fails
 console.log(`Toast (${type}):`, message);
 return 0; // Return a safe ID
 }
 }, []);

 // Function to remove a toast with error handling
 const removeToast = useCallback(id => {
 try {
 setToasts(prevToasts => prevToasts.filter(toast => toast.id !== id));
 } catch (e) {
 console.warn('Toast removal error (handled):', e);
 // Attempt recovery by resetting state
 setToasts([]);
 }
 }, []);

 // Helper functions for different toast types with error boundaries
 const success = useCallback(
 (message, options) => {
 try {
 return showToast(message, 'success', options?.duration);
 } catch (e) {
 console.warn('Success toast error (handled):', e);
 console.log('Success toast (fallback):', message);
 return 0;
 }
 },
 [showToast]
 );

 const error = useCallback(
 (message, options) => {
 try {
 return showToast(message, 'error', options?.duration);
 } catch (e) {
 console.warn('Error toast error (handled):', e);
 console.log('Error toast (fallback):', message);
 return 0;
 }
 },
 [showToast]
 );

 const info = useCallback(
 (message, options) => {
 try {
 return showToast(message, 'info', options?.duration);
 } catch (e) {
 console.warn('Info toast error (handled):', e);
 console.log('Info toast (fallback):', message);
 return 0;
 }
 },
 [showToast]
 );

 const warning = useCallback(
 (message, options) => {
 try {
 return showToast(message, 'warning', options?.duration);
 } catch (e) {
 console.warn('Warning toast error (handled):', e);
 console.log('Warning toast (fallback):', message);
 return 0;
 }
 },
 [showToast]
 );

 // Error boundary for the toast system
 if (errorState) {
 // Minimal working implementation if the component enters an error state
 return (
 <>
 {children}
 <div style={{ display: 'none' }}>Toast system disabled due to errors</div>
 </>
 );
 }

 try {
 return (
 <ToastContext.Provider value={{ showToast, removeToast, success, error, info, warning }}>
 {children}
 <div style={toastStyles.container}>
 {toasts.map(toast => (
 <div
 key={toast.id}
 style={{
 ...toastStyles.toast,
 ...toastStyles[toast.type],
 animation: 'secureToastSlideIn 0.3s ease-out forwards',
 }}
 >
 <span>{toast.message}</span>
 <button style={toastStyles.closeButton} onClick={() => removeToast(toast.id)}>
 ×
 </button>
 </div>
 ))}
 </div>
 </ToastContext.Provider>
 );
 } catch (e) {
 // Catch any render errors and switch to minimal mode
 console.error('Toast render error (handled):', e);
 setErrorState(true);
 return <>{children}</>;
 }
};

export default ToastProvider;
