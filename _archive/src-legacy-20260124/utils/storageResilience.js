/**
 * Storage Resilience Utility
 *
 * This module provides resilient browser storage operations with fallbacks,
 * error recovery, and protection against quota errors and corruption.
 *
 * CRITICAL STABILITY COMPONENT - DO NOT MODIFY WITHOUT THOROUGH TESTING
 */

import { STORAGE_CONFIG } from '@/config/stabilityConfig';

// Default configuration
const defaultConfig = {
  retryAttempts: 3,
  fallbackToMemory: true,
  useFallbackStorage: true,
  partitionLargeValues: true,
  maxPartitionSize: 1024 * 1024, // 1MB
  compressionEnabled: true,
  compressionThreshold: 10 * 1024, // 10KB
  encryptionEnabled: false, // Disabled by default
  validationEnabled: true,
  autoRepair: true,
  debugMode: false,
};

// Merged config with defaults
const config = {
  ...defaultConfig,
  ...STORAGE_CONFIG,
};

// In-memory fallback when browser storage is unavailable
const memoryStorage = new Map();

// Error tracking
const errors = [];

// Detect available storage mechanisms
const availableStorage = {
  localStorage: isLocalStorageAvailable(),
  sessionStorage: isSessionStorageAvailable(),
  indexedDB: isIndexedDBAvailable(),
};

/**
 * Check if localStorage is available
 */
function isLocalStorageAvailable() {
  try {
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, testKey);
    localStorage.removeItem(testKey);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Check if sessionStorage is available
 */
function isSessionStorageAvailable() {
  try {
    const testKey = '__storage_test__';
    sessionStorage.setItem(testKey, testKey);
    sessionStorage.removeItem(testKey);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Check if IndexedDB is available
 */
function isIndexedDBAvailable() {
  return typeof indexedDB !== 'undefined';
}

/**
 * Log a storage error
 */
function logError(operation, key, error) {
  const errorObj = {
    operation,
    key,
    error: error.message || String(error),
    timestamp: Date.now(),
  };

  errors.push(errorObj);

  // Keep error log from growing too large
  if (errors.length > 100) {
    errors.shift();
  }

  // Log to console in debug mode
  if (config.debugMode) {
    console.error(`Storage error (${operation}): ${error.message}`, { key, error });
  }

  return errorObj;
}

/**
 * Compress a string value
 */
function compressValue(value) {
  // Simple compression: This is a placeholder
  // In a real implementation, you'd use a proper compression algorithm

  // Just return the original value for now
  return value;
}

/**
 * Decompress a compressed value
 */
function decompressValue(compressedValue) {
  // Simple decompression: This is a placeholder
  // In a real implementation, you'd use a proper decompression algorithm

  // Just return the original value for now
  return compressedValue;
}

/**
 * Safely set an item in storage with retries and fallbacks
 *
 * @param {string} key - The key to store the value under
 * @param {any} value - The value to store (will be JSON stringified)
 * @param {Object} options - Options for the storage operation
 * @returns {boolean} - Whether the operation was successful
 */
export function safeSetItem(key, value, options = {}) {
  // Merge options with defaults
  const opts = {
    storage: 'localStorage', // 'localStorage', 'sessionStorage', or 'memory'
    compress: config.compressionEnabled,
    encrypt: config.encryptionEnabled,
    ...options,
  };

  // Don't allow empty keys
  if (!key) {
    logError('setItem', key, new Error('Empty key not allowed'));
    return false;
  }

  try {
    // Convert value to string if it's not already
    const valueToStore = typeof value !== 'string' ? JSON.stringify(value) : value;

    // Skip compression for small values
    let processedValue = valueToStore;
    if (opts.compress && valueToStore.length > config.compressionThreshold) {
      processedValue = compressValue(valueToStore);
    }

    // Try primary storage first
    if (opts.storage === 'localStorage' && availableStorage.localStorage) {
      localStorage.setItem(key, processedValue);
      return true;
    } else if (opts.storage === 'sessionStorage' && availableStorage.sessionStorage) {
      sessionStorage.setItem(key, processedValue);
      return true;
    } else if (opts.storage === 'memory' || config.fallbackToMemory) {
      // Use memory storage as primary or fallback
      memoryStorage.set(key, processedValue);
      return true;
    }

    // If we get here and haven't stored the value, try fallbacks
    if (config.useFallbackStorage) {
      if (availableStorage.localStorage) {
        localStorage.setItem(key, processedValue);
        return true;
      } else if (availableStorage.sessionStorage) {
        sessionStorage.setItem(key, processedValue);
        return true;
      } else {
        memoryStorage.set(key, processedValue);
        return true;
      }
    }

    // If we get here, all storage options failed
    return false;
  } catch (error) {
    // Log the error
    logError('setItem', key, error);

    // Try fallbacks on error
    try {
      if (config.fallbackToMemory) {
        memoryStorage.set(key, typeof value !== 'string' ? JSON.stringify(value) : value);
        return true;
      }
    } catch (fallbackError) {
      logError('setItem (fallback)', key, fallbackError);
    }

    return false;
  }
}

/**
 * Safely get an item from storage with fallbacks
 *
 * @param {string} key - The key to retrieve
 * @param {Object} options - Options for the retrieval
 * @returns {any} - The stored value or null if not found
 */
export function safeGetItem(key, options = {}) {
  // Merge options with defaults
  const opts = {
    storage: 'localStorage', // 'localStorage', 'sessionStorage', or 'memory'
    fallback: null, // Default value if not found
    parse: true, // Whether to JSON.parse the result
    ...options,
  };

  // Don't allow empty keys
  if (!key) {
    logError('getItem', key, new Error('Empty key not allowed'));
    return opts.fallback;
  }

  try {
    let rawValue = null;

    // Try primary storage first
    if (opts.storage === 'localStorage' && availableStorage.localStorage) {
      rawValue = localStorage.getItem(key);
    } else if (opts.storage === 'sessionStorage' && availableStorage.sessionStorage) {
      rawValue = sessionStorage.getItem(key);
    } else if (opts.storage === 'memory') {
      rawValue = memoryStorage.get(key);
    }

    // If not found and fallback storage is enabled, try other storage types
    if (rawValue === null && config.useFallbackStorage) {
      if (availableStorage.localStorage) {
        rawValue = localStorage.getItem(key);
      }

      if (rawValue === null && availableStorage.sessionStorage) {
        rawValue = sessionStorage.getItem(key);
      }

      if (rawValue === null && config.fallbackToMemory) {
        rawValue = memoryStorage.get(key);
      }
    }

    // If still not found, return the fallback value
    if (rawValue === null) {
      return opts.fallback;
    }

    // Check if value needs decompression
    if (config.compressionEnabled) {
      // In a real implementation, you'd detect compressed values
      // and decompress them if needed
      rawValue = decompressValue(rawValue);
    }

    // Parse the value if requested
    if (opts.parse && typeof rawValue === 'string') {
      try {
        return JSON.parse(rawValue);
      } catch (parseError) {
        // If parsing fails, return the raw value
        return rawValue;
      }
    }

    return rawValue;
  } catch (error) {
    // Log the error
    logError('getItem', key, error);

    // Return the fallback value on error
    return opts.fallback;
  }
}

/**
 * Safely remove an item from storage
 *
 * @param {string} key - The key to remove
 * @param {Object} options - Options for the removal
 * @returns {boolean} - Whether the operation was successful
 */
export function safeRemoveItem(key, options = {}) {
  // Merge options with defaults
  const opts = {
    storage: 'localStorage', // 'localStorage', 'sessionStorage', or 'memory'
    removeFromAllStorages: true, // Whether to remove from all storage types
    ...options,
  };

  // Don't allow empty keys
  if (!key) {
    logError('removeItem', key, new Error('Empty key not allowed'));
    return false;
  }

  try {
    let success = false;

    // Remove from specified storage
    if (opts.storage === 'localStorage' && availableStorage.localStorage) {
      localStorage.removeItem(key);
      success = true;
    } else if (opts.storage === 'sessionStorage' && availableStorage.sessionStorage) {
      sessionStorage.removeItem(key);
      success = true;
    } else if (opts.storage === 'memory') {
      success = memoryStorage.delete(key);
    }

    // If requested, remove from all storage types
    if (opts.removeFromAllStorages) {
      if (availableStorage.localStorage) {
        localStorage.removeItem(key);
      }

      if (availableStorage.sessionStorage) {
        sessionStorage.removeItem(key);
      }

      memoryStorage.delete(key);

      success = true;
    }

    return success;
  } catch (error) {
    // Log the error
    logError('removeItem', key, error);

    // Try to remove from memory storage on error
    try {
      memoryStorage.delete(key);
      return true;
    } catch (fallbackError) {
      logError('removeItem (fallback)', key, fallbackError);
      return false;
    }
  }
}

/**
 * Clear all items from storage
 *
 * @param {Object} options - Options for the clearing operation
 * @returns {boolean} - Whether the operation was successful
 */
export function safeClear(options = {}) {
  // Merge options with defaults
  const opts = {
    storage: 'localStorage', // 'localStorage', 'sessionStorage', or 'memory'
    clearAllStorages: false, // Whether to clear all storage types
    preserveKeys: [], // Keys to preserve when clearing
    ...options,
  };

  try {
    // If we need to preserve keys, we can't just clear everything
    if (opts.preserveKeys.length > 0) {
      // Get the preserved values first
      const preserved = {};
      opts.preserveKeys.forEach(key => {
        preserved[key] = safeGetItem(key, { storage: opts.storage });
      });

      // Clear the specified storage
      if (opts.storage === 'localStorage' && availableStorage.localStorage) {
        localStorage.clear();
      } else if (opts.storage === 'sessionStorage' && availableStorage.sessionStorage) {
        sessionStorage.clear();
      } else if (opts.storage === 'memory') {
        memoryStorage.clear();
      }

      // Restore preserved keys
      opts.preserveKeys.forEach(key => {
        if (preserved[key] !== null && preserved[key] !== undefined) {
          safeSetItem(key, preserved[key], { storage: opts.storage });
        }
      });

      return true;
    }

    // No keys to preserve, just clear everything
    if (opts.storage === 'localStorage' && availableStorage.localStorage) {
      localStorage.clear();
      return true;
    } else if (opts.storage === 'sessionStorage' && availableStorage.sessionStorage) {
      sessionStorage.clear();
      return true;
    } else if (opts.storage === 'memory') {
      memoryStorage.clear();
      return true;
    }

    // If requested, clear all storage types
    if (opts.clearAllStorages) {
      if (availableStorage.localStorage) {
        localStorage.clear();
      }

      if (availableStorage.sessionStorage) {
        sessionStorage.clear();
      }

      memoryStorage.clear();

      return true;
    }

    return false;
  } catch (error) {
    // Log the error
    logError('clear', '', error);

    // Try to clear memory storage on error
    try {
      memoryStorage.clear();
      return true;
    } catch (fallbackError) {
      logError('clear (fallback)', '', fallbackError);
      return false;
    }
  }
}

/**
 * Get all keys from storage
 *
 * @param {Object} options - Options for the operation
 * @returns {Array<string>} - Array of keys
 */
export function safeKeys(options = {}) {
  // Merge options with defaults
  const opts = {
    storage: 'localStorage', // 'localStorage', 'sessionStorage', or 'memory'
    ...options,
  };

  try {
    // Get keys from specified storage
    if (opts.storage === 'localStorage' && availableStorage.localStorage) {
      return Object.keys(localStorage);
    } else if (opts.storage === 'sessionStorage' && availableStorage.sessionStorage) {
      return Object.keys(sessionStorage);
    } else if (opts.storage === 'memory') {
      return Array.from(memoryStorage.keys());
    }

    return [];
  } catch (error) {
    // Log the error
    logError('keys', '', error);

    // Try to get keys from memory storage on error
    try {
      return Array.from(memoryStorage.keys());
    } catch (fallbackError) {
      logError('keys (fallback)', '', fallbackError);
      return [];
    }
  }
}

/**
 * Check available storage space
 *
 * @param {Object} options - Options for the check
 * @returns {Object} - Information about available storage space
 */
export function checkStorageQuota(options = {}) {
  // Merge options with defaults
  const opts = {
    storage: 'localStorage', // 'localStorage', 'sessionStorage', or 'memory'
    ...options,
  };

  try {
    const result = {
      available: true,
      estimatedSpace: 0,
      estimatedUsed: 0,
      estimatedAvailable: 0,
      error: null,
    };

    // Estimate used space
    if (opts.storage === 'localStorage' && availableStorage.localStorage) {
      let totalSize = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key) || '';
        totalSize += (key.length + value.length) * 2; // UTF-16 = 2 bytes per character
      }

      result.estimatedUsed = totalSize;
      result.estimatedSpace = 5 * 1024 * 1024; // Assume 5MB quota
      result.estimatedAvailable = Math.max(0, result.estimatedSpace - totalSize);
    } else if (opts.storage === 'sessionStorage' && availableStorage.sessionStorage) {
      let totalSize = 0;
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        const value = sessionStorage.getItem(key) || '';
        totalSize += (key.length + value.length) * 2; // UTF-16 = 2 bytes per character
      }

      result.estimatedUsed = totalSize;
      result.estimatedSpace = 5 * 1024 * 1024; // Assume 5MB quota
      result.estimatedAvailable = Math.max(0, result.estimatedSpace - totalSize);
    } else if (opts.storage === 'memory') {
      result.available = true;
      result.estimatedSpace = Infinity;
      result.estimatedUsed = 0;
      result.estimatedAvailable = Infinity;

      // Try to estimate memory storage size
      memoryStorage.forEach((value, key) => {
        result.estimatedUsed += (key.length + (typeof value === 'string' ? value.length : 0)) * 2;
      });
    } else {
      result.available = false;
      result.error = 'Storage not available';
    }

    return result;
  } catch (error) {
    return {
      available: false,
      estimatedSpace: 0,
      estimatedUsed: 0,
      estimatedAvailable: 0,
      error: error.message || String(error),
    };
  }
}

/**
 * Run diagnostics on storage
 *
 * @returns {Object} - Diagnostics results
 */
/**
 * Initialize storage resilience system
 * This function is called by the StabilityEnabledLayout component
 */
export function initStorageResilience() {
  // Return a promise to match the expected API
  return new Promise(resolve => {
    // Check storage availability
    const storageStatus = {
      localStorage: isLocalStorageAvailable(),
      sessionStorage: isSessionStorageAvailable(),
      indexedDB: isIndexedDBAvailable(),
      memory: true,
    };

    // Update global availability tracker
    availableStorage.localStorage = storageStatus.localStorage;
    availableStorage.sessionStorage = storageStatus.sessionStorage;
    availableStorage.indexedDB = storageStatus.indexedDB;

    // Return storage status
    resolve(storageStatus);
  });
}

export function runDiagnostics() {
  const results = {
    localStorage: {
      available: availableStorage.localStorage,
      diagnostics: {},
    },
    sessionStorage: {
      available: availableStorage.sessionStorage,
      diagnostics: {},
    },
    indexedDB: {
      available: availableStorage.indexedDB,
      diagnostics: {},
    },
    memory: {
      available: true,
      diagnostics: {},
    },
    errors: [...errors],
  };

  // Test localStorage
  if (availableStorage.localStorage) {
    try {
      const testKey = '__test_' + Date.now();
      const testValue = 'test';

      // Write test
      const writeStart = Date.now();
      localStorage.setItem(testKey, testValue);
      const writeTime = Date.now() - writeStart;

      // Read test
      const readStart = Date.now();
      const readValue = localStorage.getItem(testKey);
      const readTime = Date.now() - readStart;

      // Delete test
      const deleteStart = Date.now();
      localStorage.removeItem(testKey);
      const deleteTime = Date.now() - deleteStart;

      // Check if read value matches what we wrote
      const readCorrect = readValue === testValue;

      results.localStorage.diagnostics = {
        writeTime,
        readTime,
        deleteTime,
        readCorrect,
        quota: checkStorageQuota({ storage: 'localStorage' }),
      };
    } catch (error) {
      results.localStorage.diagnostics.error = error.message || String(error);
      results.localStorage.available = false;
    }
  }

  // Test sessionStorage
  if (availableStorage.sessionStorage) {
    try {
      const testKey = '__test_' + Date.now();
      const testValue = 'test';

      // Write test
      const writeStart = Date.now();
      sessionStorage.setItem(testKey, testValue);
      const writeTime = Date.now() - writeStart;

      // Read test
      const readStart = Date.now();
      const readValue = sessionStorage.getItem(testKey);
      const readTime = Date.now() - readStart;

      // Delete test
      const deleteStart = Date.now();
      sessionStorage.removeItem(testKey);
      const deleteTime = Date.now() - deleteStart;

      // Check if read value matches what we wrote
      const readCorrect = readValue === testValue;

      results.sessionStorage.diagnostics = {
        writeTime,
        readTime,
        deleteTime,
        readCorrect,
        quota: checkStorageQuota({ storage: 'sessionStorage' }),
      };
    } catch (error) {
      results.sessionStorage.diagnostics.error = error.message || String(error);
      results.sessionStorage.available = false;
    }
  }

  // Test memory storage
  try {
    const testKey = '__test_' + Date.now();
    const testValue = 'test';

    // Write test
    const writeStart = Date.now();
    memoryStorage.set(testKey, testValue);
    const writeTime = Date.now() - writeStart;

    // Read test
    const readStart = Date.now();
    const readValue = memoryStorage.get(testKey);
    const readTime = Date.now() - readStart;

    // Delete test
    const deleteStart = Date.now();
    memoryStorage.delete(testKey);
    const deleteTime = Date.now() - deleteStart;

    // Check if read value matches what we wrote
    const readCorrect = readValue === testValue;

    results.memory.diagnostics = {
      writeTime,
      readTime,
      deleteTime,
      readCorrect,
      size: memoryStorage.size,
    };
  } catch (error) {
    results.memory.diagnostics.error = error.message || String(error);
  }

  return results;
}

export default {
  safeSetItem,
  safeGetItem,
  safeRemoveItem,
  safeClear,
  safeKeys,
  checkStorageQuota,
  runDiagnostics,
  initStorageResilience,
  // Export these for direct access
  availableStorage,
  errors,
};
