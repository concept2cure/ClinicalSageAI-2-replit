/**
 * EMERGENCY STABILITY PATCH
 *
 * This module provides emergency fixes for critical application stability issues.
 * It implements aggressive memory management, crash recovery, and preventative measures
 * to stop the application from freezing or crashing.
 */

// Constants
const EMERGENCY_CONFIG = {
  // Memory thresholds in MB
  MEMORY_CRITICAL: 300,

  // Check intervals in ms
  CHECK_INTERVAL: 10000,

  // Max number of components to render in lists
  MAX_LIST_ITEMS: 100,

  // Time between DOM cleanups in ms
  CLEANUP_INTERVAL: 30000,

  // Debug mode
  DEBUG: false,
};

// Emergency state
const emergencyState = {
  patchApplied: false,
  lastCleanup: 0,
  recoveryAttempts: 0,
  errorCount: 0,
  watchdogActive: false,
};

/**
 * Apply emergency stability patch
 */
export function applyEmergencyPatch() {
  if (emergencyState.patchApplied) {
    console.log('Emergency stability patch already applied');
    return;
  }

  console.log('🚨 Applying emergency stability patch');

  try {
    // Apply all stabilization measures
    setupErrorProtection();
    setupMemoryLimits();
    startEmergencyWatchdog();
    disableHeavyFeatures();
    patchRenderingFunctions();

    emergencyState.patchApplied = true;

    // Clean up immediately
    performEmergencyCleanup();

    console.log('✅ Emergency stability patch applied successfully');
  } catch (error) {
    console.error('Failed to apply emergency patch:', error);
  }
}

/**
 * Set up enhanced error protection
 */
function setupErrorProtection() {
  const originalConsoleError = console.error;

  // Override console.error to track error frequency
  console.error = function (...args) {
    emergencyState.errorCount++;

    // If we're seeing too many errors, trigger cleanup
    if (emergencyState.errorCount > 10) {
      emergencyState.errorCount = 0;
      setTimeout(performEmergencyCleanup, 0);
    }

    return originalConsoleError.apply(this, args);
  };

  // Set up additional global error handler
  window.addEventListener(
    'error',
    event => {
      emergencyState.errorCount++;

      // Check if this is a memory-related error
      const isMemoryError =
        event.message &&
        (event.message.includes('memory') ||
          event.message.includes('allocation') ||
          event.message.includes('heap'));

      if (isMemoryError || emergencyState.errorCount > 5) {
        console.warn('🔄 Emergency recovery triggered due to errors');
        performEmergencyCleanup();
      }

      return false;
    },
    true
  );

  // Additionally handle unhandled promise rejections
  window.addEventListener('unhandledrejection', event => {
    emergencyState.errorCount++;
    // Don't do cleanup here as it might be unrelated
    return false;
  });
}

/**
 * Set up memory limits and monitoring
 */
function setupMemoryLimits() {
  // Check memory usage periodically
  setInterval(() => {
    try {
      const memoryInfo = getMemoryInfo();

      if (memoryInfo && memoryInfo.usedHeapSize > EMERGENCY_CONFIG.MEMORY_CRITICAL * 1024 * 1024) {
        console.warn(
          `🚨 Critical memory usage detected: ${Math.round(memoryInfo.usedHeapSize / (1024 * 1024))}MB`
        );
        performEmergencyCleanup();
      }
    } catch (error) {
      // Ignore memory measurement errors
    }
  }, EMERGENCY_CONFIG.CHECK_INTERVAL);
}

/**
 * Get current memory information
 */
function getMemoryInfo() {
  if (window.performance && window.performance.memory) {
    return {
      usedHeapSize: window.performance.memory.usedJSHeapSize,
      totalHeapSize: window.performance.memory.totalJSHeapSize,
      limit: window.performance.memory.jsHeapSizeLimit,
    };
  }
  return null;
}

/**
 * Start emergency watchdog to detect freezes
 */
function startEmergencyWatchdog() {
  if (emergencyState.watchdogActive) return;

  let lastPingTime = Date.now();
  let watchdogInterval = null;

  // Main thread ping
  const pingInterval = setInterval(() => {
    lastPingTime = Date.now();
  }, 2000);

  // Watchdog checks if main thread is frozen
  watchdogInterval = setInterval(() => {
    const currentTime = Date.now();
    const timeSinceLastPing = currentTime - lastPingTime;

    // If more than 5 seconds between pings, main thread was likely frozen
    if (timeSinceLastPing > 5000) {
      console.warn(
        `🚨 Application freeze detected (${Math.round(timeSinceLastPing / 1000)}s), triggering recovery`
      );

      // Force immediate cleanup
      performEmergencyCleanup();

      // Reset ping time to avoid multiple recoveries
      lastPingTime = Date.now();
    }
  }, 2000);

  emergencyState.watchdogActive = true;
}

/**
 * Disable known heavy features that may cause stability issues
 */
function disableHeavyFeatures() {
  // Set a global flag that components can check
  window.__STABILITY_EMERGENCY__ = true;

  // Add a CSS class to body to trigger emergency CSS
  document.body.classList.add('emergency-stability-mode');
}

/**
 * Apply patches to React rendering functions to prevent complex renders
 */
function patchRenderingFunctions() {
  try {
    // Limit array renders in React
    const originalMap = Array.prototype.map;
    Array.prototype.map = function (...args) {
      // Only limit arrays in render functions (typically longer)
      if (
        this.length > EMERGENCY_CONFIG.MAX_LIST_ITEMS &&
        args[0] &&
        args[0].toString().includes('React')
      ) {
        console.warn(
          `🛡️ Limiting rendered list from ${this.length} to ${EMERGENCY_CONFIG.MAX_LIST_ITEMS} items`
        );

        // Return only first N items
        const limitedArray = this.slice(0, EMERGENCY_CONFIG.MAX_LIST_ITEMS);
        return originalMap.apply(limitedArray, args);
      }

      // Normal behavior for other cases
      return originalMap.apply(this, args);
    };
  } catch (error) {
    console.error('Failed to patch rendering functions:', error);
  }
}

/**
 * Perform emergency cleanup to recover from instability
 */
export function performEmergencyCleanup() {
  const now = Date.now();
  const timeSinceLastCleanup = now - emergencyState.lastCleanup;

  // Don't run cleanup too frequently
  if (timeSinceLastCleanup < 10000) {
    if (EMERGENCY_CONFIG.DEBUG) {
      console.log(`Skipping cleanup, last one was ${timeSinceLastCleanup}ms ago`);
    }
    return false;
  }

  console.warn('🧹 Performing emergency application cleanup');
  emergencyState.lastCleanup = now;
  emergencyState.recoveryAttempts++;

  try {
    // Clear all timeouts and intervals except our watchdog
    clearAllTimers();

    // Clear console to free memory
    console.clear();

    // Clear application caches
    clearApplicationCaches();

    // Revoke any blob URLs
    clearBlobResources();

    // Clear detached DOM nodes
    removeDetachedDomNodes();

    // Force browser garbage collection if available
    if (window.gc) {
      window.gc();
    }

    console.log('✅ Emergency cleanup completed successfully');
    return true;
  } catch (error) {
    console.error('Emergency cleanup failed:', error);
    return false;
  }
}

/**
 * Clear all timeouts and intervals
 */
function clearAllTimers() {
  try {
    // Clear all registered intervals and timeouts
    // This is a nuclear option but can help recover from timer-related memory leaks
    let id = window.setTimeout(() => {}, 0);

    while (id > 0) {
      window.clearTimeout(id);
      window.clearInterval(id);
      id--;
    }

    // Restore essential timers
    startEmergencyWatchdog();
  } catch (error) {
    console.error('Failed to clear timers:', error);
  }
}

/**
 * Clear application caches
 */
function clearApplicationCaches() {
  try {
    // Clear React Query cache
    if (window.queryClient && typeof window.queryClient.clear === 'function') {
      window.queryClient.clear();
    }

    // Clear any application-specific caches
    const cacheKeys = [
      'dataCache',
      'responseCache',
      'queryCache',
      'documentCache',
      'tempData',
      'renderCache',
    ];

    for (const key of cacheKeys) {
      if (window[key]) {
        if (typeof window[key].clear === 'function') {
          window[key].clear();
        } else if (typeof window[key] === 'object') {
          window[key] = Array.isArray(window[key]) ? [] : {};
        }
      }
    }
  } catch (error) {
    console.error('Failed to clear application caches:', error);
  }
}

/**
 * Clear blob resources
 */
function clearBlobResources() {
  try {
    // Revoke any object URLs that might be stored
    if (window.URL && typeof window.URL.revokeObjectURL === 'function') {
      // Find blob URLs in the window object
      Object.keys(window).forEach(key => {
        if (typeof window[key] === 'string' && window[key].startsWith('blob:')) {
          try {
            URL.revokeObjectURL(window[key]);
            window[key] = null;
          } catch (e) {
            // Ignore errors for individual revokes
          }
        }
      });
    }

    // Clear any application-specific blob storage
    const blobStores = ['blobCache', 'blobStore', 'fileCache', 'documentBlobs'];

    for (const storeName of blobStores) {
      const store = window[storeName];
      if (store && typeof store === 'object') {
        for (const key in store) {
          if (store[key] && typeof store[key] === 'string' && store[key].startsWith('blob:')) {
            try {
              URL.revokeObjectURL(store[key]);
            } catch (e) {
              // Ignore errors
            }
          }
        }
        window[storeName] = {};
      }
    }
  } catch (error) {
    console.error('Failed to clear blob resources:', error);
  }
}

/**
 * Remove detached DOM nodes to prevent memory leaks
 */
function removeDetachedDomNodes() {
  try {
    // Clean up any React portal containers that might be orphaned
    document.querySelectorAll('[data-reactroot]').forEach(el => {
      const parent = el.parentNode;
      // Check if this is an orphaned portal by looking at its parent
      if (
        parent &&
        (parent.id === 'portal-root' ||
          parent.className.includes('portal') ||
          parent.id.includes('modal') ||
          parent.id.includes('popup'))
      ) {
        // Check if portal is no longer in use (no visible children)
        let hasVisibleContent = false;

        for (let i = 0; i < el.children.length; i++) {
          const child = el.children[i];
          const style = window.getComputedStyle(child);

          if (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            child.innerHTML.trim() !== ''
          ) {
            hasVisibleContent = true;
            break;
          }
        }

        if (!hasVisibleContent) {
          parent.innerHTML = '';
        }
      }
    });

    // Check for other common containers that might have orphaned content
    const containerSelectors = [
      '.tooltip-container',
      '.dropdown-menu',
      '.popup-content',
      '.toast-container',
    ];

    containerSelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(container => {
        if (!container.querySelector(':scope > *:not([aria-hidden="true"])')) {
          container.innerHTML = '';
        }
      });
    });
  } catch (error) {
    console.error('Failed to remove detached DOM nodes:', error);
  }
}

// Export utility functions
export const EmergencyStability = {
  applyPatch: applyEmergencyPatch,
  performCleanup: performEmergencyCleanup,
  getStatus: () => ({
    patchApplied: emergencyState.patchApplied,
    recoveryAttempts: emergencyState.recoveryAttempts,
    lastCleanup: emergencyState.lastCleanup,
    errorCount: emergencyState.errorCount,
  }),
};

// Emergency stability measures - disabled to prevent stuck state
if (false && process.env.NODE_ENV !== 'production') {
  setTimeout(applyEmergencyPatch, 1000);
}
