import React, { createContext, useContext, useEffect, useState } from 'react';
import { setupCSP, setupSessionTimeout, validateSession } from '../../lib/security';

// Create security context for global access
const SecurityContext = createContext({
 initialized: false,
 sessionActive: true,
 csrfToken: null,
 setSessionActive: () => {},
 refreshSession: () => {},
});

/**
 * Security Provider Component
 * Adds enterprise-grade security features to the application:
 * - Content Security Policy (CSP)
 * - Session management and timeout
 * - CSRF protection
 * - Security audit logging
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components
 * @returns {JSX.Element}
 */
export function SecurityProvider({ children }) {
 const [initialized, setInitialized] = useState(false);
 const [sessionActive, setSessionActive] = useState(true);
 const [csrfToken, setCsrfToken] = useState(null);
 // No longer using toast directly
 // const { toast } = useToast();

 // Generate CSRF token
 const generateCsrfToken = () => {
 const token = Array.from(window.crypto.getRandomValues(new Uint8Array(32)), byte =>
 byte.toString(16).padStart(2, '0')
 ).join('');

 localStorage.setItem('csrfToken', token);
 setCsrfToken(token);

 // Add CSRF meta tag for form submissions
 const meta = document.createElement('meta');
 meta.name = 'csrf-token';
 meta.content = token;
 document.head.appendChild(meta);

 return token;
 };

 // Setup security features on component mount
 useEffect(() => {
 // Initialize Content Security Policy
 setupCSP();

 // Generate CSRF token
 const token = generateCsrfToken();

 // Setup session timeout (30 minutes of inactivity)
 setupSessionTimeout(30);

 // Add session timeout listener
 const handleSessionTimeout = () => {
 setSessionActive(false);
 // Toast notification for session expiration
 console.log('Session expired notification would be shown');
 };

 window.addEventListener('session-timeout', handleSessionTimeout);

 // Security audit logging - anonymized for privacy
 console.info(
 `Security initialized [${new Date().toISOString()}] | ` +
 `CSP: enabled | Session timeout: 30 minutes | ` +
 `CSRF protection: enabled (${token.substring(0, 8)}...)`
 );

 setInitialized(true);

 // Cleanup on unmount
 return () => {
 window.removeEventListener('session-timeout', handleSessionTimeout);
 };
 }, []);

 // Check session validity periodically
 useEffect(() => {
 const intervalId = setInterval(() => {
 const isValid = validateSession();
 setSessionActive(isValid);
 }, 60000); // Check every minute

 return () => clearInterval(intervalId);
 }, []);

 // Method to manually refresh the session
 const refreshSession = () => {
 setupSessionTimeout(30);
 setSessionActive(true);
 };

 return (
 <SecurityContext.Provider
 value={{
 initialized,
 sessionActive,
 csrfToken,
 setSessionActive,
 refreshSession,
 }}
 >
 {children}

 {/* Session timeout modal */}
 {!sessionActive && (
 <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
 <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
 <h3 className="text-xl font-bold mb-4">Session Expired</h3>
 <p className="mb-6">
 Your session has expired due to inactivity. Please log in again to continue.
 </p>
 <div className="flex justify-end">
 <button
 className="px-4 py-2 bg-stone-800 text-white rounded hover:bg-stone-900"
 onClick={() => (window.location.href = '/login')}
 >
 Log In
 </button>
 </div>
 </div>
 </div>
 )}
 </SecurityContext.Provider>
 );
}

// Hook for consuming the security context
export function useSecurityContext() {
 const context = useContext(SecurityContext);
 if (!context) {
 throw new Error('useSecurityContext must be used within a SecurityProvider');
 }
 return context;
}
