/**
 * Secure Storage Module
 *
 * Provides enhanced storage mechanisms with encryption, integrity verification,
 * and security hardening to prevent common web attacks.
 */

import { encryptData, decryptData } from './security';

// Encryption key for additional layer of security
const STORAGE_SALT = 'trialsage-secure-storage';

/**
 * Get a secure storage key with additional entropy
 * @param {string} key - Original storage key
 * @returns {string} - Enhanced secure key
 */
function getSecureKey(key) {
  return `secure_${key}_${STORAGE_SALT}`;
}

/**
 * Store data securely with encryption
 * @param {string} key - Storage key
 * @param {any} data - Data to store
 * @param {string} storageType - 'local' or 'session'
 */
export function secureSet(key, data, storageType = 'local') {
  if (!key || data === undefined) return;

  try {
    // Generate metadata for integrity checks
    const metadata = {
      timestamp: new Date().toISOString(),
      origin: window.location.origin,
      checksum: generateChecksum(JSON.stringify(data)),
    };

    // Bundle data with metadata
    const bundle = {
      data,
      metadata,
    };

    // Encrypt the entire bundle
    const encryptedData = encryptData(bundle);

    // Store with secure key
    const secureKey = getSecureKey(key);

    if (storageType === 'session') {
      sessionStorage.setItem(secureKey, encryptedData);
    } else {
      localStorage.setItem(secureKey, encryptedData);
    }

    return true;
  } catch (error) {
    console.error('Secure storage error:', error);
    return false;
  }
}

/**
 * Retrieve and decrypt data from secure storage
 * @param {string} key - Storage key
 * @param {string} storageType - 'local' or 'session'
 * @returns {any} - Retrieved data or null if not found
 */
export function secureGet(key, storageType = 'local') {
  if (!key) return null;

  try {
    const secureKey = getSecureKey(key);
    let encryptedData;

    if (storageType === 'session') {
      encryptedData = sessionStorage.getItem(secureKey);
    } else {
      encryptedData = localStorage.getItem(secureKey);
    }

    if (!encryptedData) return null;

    // Decrypt the bundle
    const bundle = decryptData(encryptedData);
    if (!bundle || !bundle.data || !bundle.metadata) {
      console.warn('Secure storage: Corrupted or tampered data detected');
      return null;
    }

    // Verify integrity
    const currentChecksum = generateChecksum(JSON.stringify(bundle.data));
    if (currentChecksum !== bundle.metadata.checksum) {
      console.error('Secure storage: Data integrity check failed - possible tampering');
      // Automatically remove compromised data
      secureRemove(key, storageType);
      return null;
    }

    // Verify origin to prevent cross-site attacks
    if (bundle.metadata.origin !== window.location.origin) {
      console.error('Secure storage: Origin mismatch - possible XSS attempt');
      return null;
    }

    return bundle.data;
  } catch (error) {
    console.error('Secure storage retrieval error:', error);
    return null;
  }
}

/**
 * Remove data from secure storage
 * @param {string} key - Storage key
 * @param {string} storageType - 'local' or 'session'
 */
export function secureRemove(key, storageType = 'local') {
  if (!key) return;

  const secureKey = getSecureKey(key);

  if (storageType === 'session') {
    sessionStorage.removeItem(secureKey);
  } else {
    localStorage.removeItem(secureKey);
  }
}

/**
 * Clear all secure storage items
 * @param {string} storageType - 'local' or 'session'
 */
export function secureClear(storageType = 'local') {
  const storage = storageType === 'session' ? sessionStorage : localStorage;

  // Only remove secure items (that we encrypted)
  const secureItems = [];

  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && key.startsWith('secure_')) {
      secureItems.push(key);
    }
  }

  // Remove all secure items
  secureItems.forEach(key => storage.removeItem(key));
}

/**
 * Generate a simple checksum for data integrity verification
 * @param {string} data - Data to generate checksum for
 * @returns {string} - Checksum
 */
function generateChecksum(data) {
  let hash = 0;
  if (!data) return hash.toString();

  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  return hash.toString(36);
}

export default {
  set: secureSet,
  get: secureGet,
  remove: secureRemove,
  clear: secureClear,
};
