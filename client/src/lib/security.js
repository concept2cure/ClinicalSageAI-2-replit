/**
 * Concept2Cure Client-Side Security Module
 *
 * This module provides client-side security features including:
 * - Encrypted storage for sensitive data
 * - Security token management
 * - Content hash verification
 * - Session integrity monitoring
 * - User activity logging for audit trails
 */

import { getCookie, setCookie, removeCookie } from './cookies';
import CryptoJS from 'crypto-js';

// Configuration
const SECURITY_VERSION = '1.0.0';
const INTEGRITY_CHECK_INTERVAL = 60000; // 1 minute
const TOKEN_REFRESH_THRESHOLD = 300000; // 5 minutes
const MAX_FAILED_ATTEMPTS = 5;

// Security state
let securityState = {
  initialized: false,
  integrityCheckTimer: null,
  lastActivity: Date.now(),
  userSessionIntegrity: true,
  failedAttempts: 0,
  lastVerifiedDocumentHashes: {},
};

/**
 * Initialize security features
 */
export function initializeSecurity() {
  if (securityState.initialized) return;

  // Set up activity monitoring
  document.addEventListener('click', recordUserActivity);
  document.addEventListener('keypress', recordUserActivity);

  // Set up session integrity checking
  securityState.integrityCheckTimer = setInterval(checkSessionIntegrity, INTEGRITY_CHECK_INTERVAL);

  // Set initial security state
  securityState.initialized = true;
  securityState.lastActivity = Date.now();

  // Log security initialization
  logSecurityEvent('SECURITY_INITIALIZED', {
    version: SECURITY_VERSION,
    timestamp: new Date().toISOString(),
  });

  return true;
}

/**
 * Record user activity for session maintenance
 */
function recordUserActivity() {
  securityState.lastActivity = Date.now();
}

/**
 * Check session integrity periodically
 */
function checkSessionIntegrity() {
  const currentTime = Date.now();
  const sessionTimeout = parseInt(getCookie('session_timeout') || '3600000'); // Default 1 hour
  const timeElapsed = currentTime - securityState.lastActivity;

  // Check for session timeout
  if (timeElapsed > sessionTimeout) {
    logSecurityEvent('SESSION_TIMEOUT', {
      lastActivity: new Date(securityState.lastActivity).toISOString(),
      currentTime: new Date(currentTime).toISOString(),
      timeElapsed,
    });
    terminateSession('Session timed out due to inactivity');
    return;
  }

  // Check if token needs refresh
  const tokenExpiry = parseInt(getCookie('token_expiry') || '0');
  if (tokenExpiry && tokenExpiry - currentTime < TOKEN_REFRESH_THRESHOLD) {
    refreshSecurityToken();
  }
}

/**
 * Refresh security token
 */
export async function refreshSecurityToken() {
  try {
    const response = await fetch('/api/security/refresh-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to refresh token');
    }

    const data = await response.json();

    if (data.token_expiry) {
      setCookie('token_expiry', data.token_expiry.toString(), { secure: true, sameSite: 'strict' });
    }

    logSecurityEvent('TOKEN_REFRESHED', {
      newExpiry: new Date(parseInt(data.token_expiry)).toISOString(),
    });

    return true;
  } catch (error) {
    logSecurityEvent('TOKEN_REFRESH_FAILED', {
      error: error.message,
    });
    handleSecurityFailure('token_refresh_failed');
    return false;
  }
}

/**
 * Terminate the current user session
 */
export function terminateSession(reason) {
  // Log the session termination
  logSecurityEvent('SESSION_TERMINATED', { reason });

  // Clear security timers
  if (securityState.integrityCheckTimer) {
    clearInterval(securityState.integrityCheckTimer);
  }

  // Clear security cookies
  removeCookie('token_expiry');

  // Reset security state
  securityState = {
    initialized: false,
    integrityCheckTimer: null,
    lastActivity: 0,
    userSessionIntegrity: false,
    failedAttempts: 0,
    lastVerifiedDocumentHashes: {},
  };

  // Redirect to login page
  window.location.href = '/concept2cure/login?reason=session_terminated';
}

/**
 * Verify document integrity using SHA-256 hash
 */
export function verifyDocumentIntegrity(documentId, contentHash) {
  // Get the stored hash for comparison
  const storedHash = securityState.lastVerifiedDocumentHashes[documentId];

  // If we don't have a stored hash, store this one and return true
  if (!storedHash) {
    securityState.lastVerifiedDocumentHashes[documentId] = contentHash;
    return true;
  }

  // Compare the hashes
  const integrityVerified = storedHash === contentHash;

  // Log the verification result
  logSecurityEvent('DOCUMENT_INTEGRITY_CHECK', {
    documentId,
    verified: integrityVerified,
    storedHash: storedHash.substring(0, 10) + '...',
    providedHash: contentHash.substring(0, 10) + '...',
  });

  // If integrity verification fails, handle it
  if (!integrityVerified) {
    handleSecurityFailure('document_integrity_failed');
  }

  return integrityVerified;
}

/**
 * Generate SHA-256 hash for document content
 */
export function generateContentHash(content) {
  return CryptoJS.SHA256(content).toString();
}

/**
 * Encrypt sensitive data
 */
export function encryptData(data, key = getCookie('encryption_key')) {
  if (!key) {
    // Use a default key if none is provided (not recommended for production)
    key = 'Concept2Cure_Secure_Default_Key';
  }

  return CryptoJS.AES.encrypt(JSON.stringify(data), key).toString();
}

/**
 * Decrypt sensitive data
 */
export function decryptData(encryptedData, key = getCookie('encryption_key')) {
  if (!key) {
    // Use a default key if none is provided (not recommended for production)
    key = 'Concept2Cure_Secure_Default_Key';
  }

  try {
    const bytes = CryptoJS.AES.decrypt(encryptedData, key);
    const decryptedText = bytes.toString(CryptoJS.enc.Utf8);
    return JSON.parse(decryptedText);
  } catch (error) {
    logSecurityEvent('DECRYPTION_FAILED', { error: error.message });
    return null;
  }
}

/**
 * Handle security failures
 */
function handleSecurityFailure(type) {
  securityState.failedAttempts++;
  securityState.userSessionIntegrity = false;

  logSecurityEvent('SECURITY_FAILURE', {
    type,
    failedAttempts: securityState.failedAttempts,
    threshold: MAX_FAILED_ATTEMPTS,
  });

  // If too many failures, terminate the session
  if (securityState.failedAttempts >= MAX_FAILED_ATTEMPTS) {
    terminateSession('Too many security failures');
  }
}

/**
 * Log security events for audit
 */
export async function logSecurityEvent(eventType, eventData) {
  const logEntry = {
    eventType,
    timestamp: new Date().toISOString(),
    userId: getCookie('user_id') || 'anonymous',
    sessionId: getCookie('session_id') || 'unknown',
    userAgent: navigator.userAgent,
    data: eventData,
  };

  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.log('[SECURITY]', logEntry);
  }

  // Send to server for permanent audit logging
  try {
    await fetch('/api/security/audit-log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(logEntry),
      credentials: 'include',
    });
  } catch (error) {
    console.error('Failed to send security log to server:', error);
  }

  return logEntry;
}

/**
 * Get the current security state (for debugging/monitoring)
 */
export function getSecurityState() {
  return {
    initialized: securityState.initialized,
    lastActivity: new Date(securityState.lastActivity).toISOString(),
    userSessionIntegrity: securityState.userSessionIntegrity,
    failedAttempts: securityState.failedAttempts,
  };
}

// Export security module
export default {
  initializeSecurity,
  refreshSecurityToken,
  terminateSession,
  verifyDocumentIntegrity,
  generateContentHash,
  encryptData,
  decryptData,
  logSecurityEvent,
  getSecurityState,
};
