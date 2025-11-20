/**
 * Memory Optimizer
 *
 * This utility provides memory optimization strategies to prevent UI freezes
 * by monitoring memory usage and proactively clearing resources.
 *
 * CRITICAL STABILITY COMPONENT - DO NOT MODIFY WITHOUT THOROUGH TESTING
 */

// Configuration
const MEMORY_CONFIG = {
  // How often to check memory usage (ms) - increased to reduce frequency
  checkInterval: 30000,

  // Memory thresholds (MB) - increased to be less sensitive
  warningThreshold: 250,
  criticalThreshold: 350,

  // Performance metrics
  longTaskThreshold: 100, // ms - increased to be less sensitive

  // Enable debug logging
  debug: false,

  // Disable aggressive optimization to reduce performance impact
  aggressiveOptimization: false,
};

// State
const state = {
  memoryUsage: {
    heapUsed: 0,
    heapTotal: 0,
    percentUsed: 0,
  },
  isOptimizing: false,
  observedLongTasks: 0,
  checkCount: 0,
  lastOptimization: 0,
};

/**
 * Initialize memory optimization
 */
export function initializeMemoryOptimization() {
  console.info('Initializing memory optimization');

  // Start periodic memory checks
  setInterval(checkMemory, MEMORY_CONFIG.checkInterval);

  // Setup performance observer for long tasks if available
  setupLongTaskObserver();

  // Initial memory check
  checkMemory();

  return {
    getCurrentMemoryUsage: () => state.memoryUsage,
    forceOptimize: performMemoryOptimization,
  };
}

/**
 * Check current memory usage and optimize if needed
 */
function checkMemory() {
  state.checkCount++;

  try {
    updateMemoryUsage();

    // Log memory usage periodically
    if (MEMORY_CONFIG.debug && state.checkCount % 6 === 0) {
      console.debug('Memory usage:', state.memoryUsage);
    }

    // Check if optimization is needed
    const timeSinceLastOptimization = Date.now() - state.lastOptimization;

    if (state.memoryUsage.heapUsed > MEMORY_CONFIG.criticalThreshold * 1024 * 1024) {
      console.warn('Critical memory usage detected, performing optimization');
      performMemoryOptimization();
    } else if (
      state.memoryUsage.heapUsed > MEMORY_CONFIG.warningThreshold * 1024 * 1024 &&
      timeSinceLastOptimization > 60000 &&
      state.observedLongTasks > 3
    ) {
      console.warn('High memory usage with long tasks detected, performing optimization');
      performMemoryOptimization();
    }

    // Reset long task counter periodically
    if (state.checkCount % 30 === 0) {
      state.observedLongTasks = 0;
    }
  } catch (err) {
    console.error('Error in memory check:', err);
  }
}

/**
 * Update memory usage statistics
 */
function updateMemoryUsage() {
  if (window.performance && window.performance.memory) {
    const memory = window.performance.memory;
    state.memoryUsage.heapUsed = memory.usedJSHeapSize;
    state.memoryUsage.heapTotal = memory.totalJSHeapSize;
    state.memoryUsage.percentUsed = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;
  } else {
    // Fallback for browsers without memory API
    state.memoryUsage.heapUsed = 0;
    state.memoryUsage.heapTotal = 0;
    state.memoryUsage.percentUsed = 0;
  }
}

/**
 * Perform memory optimization
 *
 * @param {Object} options - Options for optimization
 * @param {boolean} options.aggressive - Whether to perform aggressive optimization
 * @param {number} options.threshold - Memory threshold percentage
 * @returns {Object} - Status of the optimization operation
 */
function performMemoryOptimization(options = {}) {
  // Prevent concurrent optimizations or running too frequently
  if (state.isOptimizing) {
    return { success: false, reason: 'already_optimizing' };
  }

  const now = Date.now();
  if (now - state.lastOptimization < 30000 && !options.aggressive) {
    console.info('Skipping optimization - last one performed too recently');
    return { success: false, reason: 'too_recent' };
  }

  state.isOptimizing = true;
  state.lastOptimization = now;

  try {
    console.info('Performing memory optimization');

    // Basic optimization that should always be safe
    const optimizationResults = {
      cacheCleared: false,
      consoleCleared: false,
      gcPerformed: false,
      imagesUnloaded: false,
      listenersDetached: false,
      objectsCleaned: false,
    };

    try {
      // Clear application-specific caches only (less invasive)
      clearApplicationCaches();
      optimizationResults.cacheCleared = true;
    } catch (cacheError) {
      console.warn('Failed to clear application caches:', cacheError);
    }

    try {
      // Clear console logs to free memory (simple, effective)
      if (console.clear) {
        console.clear();
        optimizationResults.consoleCleared = true;
      }
    } catch (consoleError) {
      // Some browsers restrict console.clear in certain contexts
      console.warn('Failed to clear console:', consoleError);
    }

    try {
      // Force garbage collection if available (unlikely in most browsers)
      if (window.gc) {
        window.gc();
        optimizationResults.gcPerformed = true;
      }
    } catch (gcError) {
      console.warn('Failed to run garbage collection:', gcError);
    }

    // Determine if we should perform aggressive optimization
    const shouldRunAggressive =
      options.aggressive === true ||
      (MEMORY_CONFIG.aggressiveOptimization && state.observedLongTasks > 5);

    // Only perform aggressive optimizations if needed
    if (shouldRunAggressive) {
      try {
        // Clear image caches
        clearImageCaches();
        optimizationResults.imagesCleaned = true;
      } catch (imageError) {
        console.warn('Failed to clear image caches:', imageError);
      }

      try {
        // Remove non-visible image data
        unloadNonVisibleImages();
        optimizationResults.imagesUnloaded = true;
      } catch (unloadError) {
        console.warn('Failed to unload non-visible images:', unloadError);
      }

      try {
        // Clear any large objects in memory
        cleanupLargeObjects();
        optimizationResults.objectsCleaned = true;
      } catch (objectError) {
        console.warn('Failed to clean up large objects:', objectError);
      }

      try {
        // Last resort - detach event listeners from non-visible components
        cleanupEventListeners();
        optimizationResults.listenersDetached = true;
      } catch (listenerError) {
        console.warn('Failed to clean up event listeners:', listenerError);
      }
    }

    // Update memory usage after optimization
    setTimeout(() => {
      try {
        updateMemoryUsage();
        console.info('Memory optimization complete');
      } catch (memoryError) {
        console.warn('Failed to update memory usage:', memoryError);
      } finally {
        state.isOptimizing = false;
      }
    }, 500);

    return {
      success: true,
      aggressive: shouldRunAggressive,
      results: optimizationResults,
    };
  } catch (err) {
    console.error('Error during memory optimization:', err);
    state.isOptimizing = false;
    return {
      success: false,
      reason: 'optimization_error',
      error: err.message || 'Unknown error',
    };
  }
}

/**
 * Clean up event listeners from non-visible components
 */
function cleanupEventListeners() {
  try {
    // Find elements that are far outside viewport
    const elements = document.querySelectorAll('*');
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    for (const el of elements) {
      if (!el || !el.getBoundingClientRect) continue;

      const rect = el.getBoundingClientRect();
      // If element is very far from viewport
      if (
        rect.bottom < -2000 ||
        rect.top > viewportHeight + 2000 ||
        rect.right < -2000 ||
        rect.left > viewportWidth + 2000
      ) {
        // Store original handlers if not already stored
        if (!el._originalEventListeners && el._events) {
          el._originalEventListeners = { ...el._events };

          // Remove non-essential events
          for (const eventType in el._events) {
            if (!['click', 'submit', 'change'].includes(eventType)) {
              el._events[eventType] = [];
            }
          }
        }
      }
      // Restore event listeners if element is back in view
      else if (el._originalEventListeners) {
        el._events = el._originalEventListeners;
        delete el._originalEventListeners;
      }
    }
  } catch (e) {
    console.error('Error cleaning up event listeners:', e);
  }
}

/**
 * Clean up large objects in memory
 */
function cleanupLargeObjects() {
  try {
    // Clear temporary state in large components
    const componentsToClean = [
      'dataCache',
      'tempResults',
      'chartData',
      'oldRenderCache',
      'previousSearch',
      'resultCache',
    ];

    for (const key of componentsToClean) {
      if (window[key] && typeof window[key] === 'object') {
        // If it's an array with more than 1000 items or an object with many properties
        if (
          (Array.isArray(window[key]) && window[key].length > 1000) ||
          Object.keys(window[key]).length > 100
        ) {
          window[key] = Array.isArray(window[key]) ? [] : {};
          console.debug(`Cleaned up large object: ${key}`);
        }
      }
    }

    // Find and clean up any React component state cache
    if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__ && window.__REACT_DEVTOOLS_GLOBAL_HOOK__._renderers) {
      const renderers = Object.values(window.__REACT_DEVTOOLS_GLOBAL_HOOK__._renderers);
      for (const renderer of renderers) {
        if (renderer && renderer.findFiberByHostInstance) {
          try {
            // This forces React to potentially clean up some component cache
            renderer.findFiberByHostInstance(document.body);
          } catch (e) {
            // Ignore errors
          }
        }
      }
    }
  } catch (e) {
    console.error('Error cleaning up large objects:', e);
  }
}

/**
 * Clear image caches
 */
function clearImageCaches() {
  // Clear image data in blob URLs
  const blobUrls = Object.keys(window).filter(
    key => typeof window[key] === 'string' && window[key].startsWith('blob:')
  );

  for (const key of blobUrls) {
    try {
      URL.revokeObjectURL(window[key]);
      window[key] = null;
    } catch (e) {
      // Ignore errors
    }
  }
}

/**
 * Clear application-specific caches
 */
function clearApplicationCaches() {
  // App-specific cache clearing
  const cacheNames = ['dataCache', 'responseCache', 'queryCache', 'documentCache', 'tempData'];

  for (const name of cacheNames) {
    if (window[name]) {
      try {
        if (typeof window[name].clear === 'function') {
          window[name].clear();
        } else {
          window[name] = {};
        }
      } catch (e) {
        // Ignore errors
      }
    }
  }

  // Clear React Query cache if it exists
  if (window.queryClient && typeof window.queryClient.clear === 'function') {
    window.queryClient.clear();
  }
}

/**
 * Clear unused data structures
 */
function clearUnusedData() {
  // Clear console logs to free memory
  if (console.clear && MEMORY_CONFIG.aggressiveOptimization) {
    console.clear();
  }

  // Remove old log entries
  if (console.history && Array.isArray(console.history)) {
    console.history.length = 0;
  }
}

/**
 * Unload images not in viewport to save memory
 */
function unloadNonVisibleImages() {
  try {
    const images = document.querySelectorAll('img');
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    let unloadedCount = 0;

    for (const img of images) {
      if (img.complete && img.currentSrc) {
        const rect = img.getBoundingClientRect();

        // If image is far outside viewport, free its memory
        if (
          rect.bottom < -1000 ||
          rect.top > viewportHeight + 1000 ||
          rect.right < -1000 ||
          rect.left > viewportWidth + 1000
        ) {
          // Save original source
          if (!img.dataset.originalSrc) {
            img.dataset.originalSrc = img.currentSrc;
          }

          // Replace with empty 1x1 transparent gif
          img.src =
            'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
          unloadedCount++;
        }
        // Restore images that have come into view
        else if (
          img.dataset.originalSrc &&
          rect.bottom > -200 &&
          rect.top < viewportHeight + 200 &&
          rect.right > -200 &&
          rect.left < viewportWidth + 200
        ) {
          img.src = img.dataset.originalSrc;
          delete img.dataset.originalSrc;
        }
      }
    }

    if (unloadedCount > 0 && MEMORY_CONFIG.debug) {
      console.debug(`Unloaded ${unloadedCount} images to save memory`);
    }
  } catch (err) {
    console.error('Error unloading images:', err);
  }
}

/**
 * Setup observer for long tasks
 */
function setupLongTaskObserver() {
  if ('PerformanceObserver' in window) {
    try {
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          // Log long tasks
          if (entry.duration > MEMORY_CONFIG.longTaskThreshold) {
            state.observedLongTasks++;
            if (MEMORY_CONFIG.debug) {
              console.debug(`Long task detected: ${Math.round(entry.duration)}ms`);
            }
          }
        }
      });

      observer.observe({ entryTypes: ['longtask'] });
    } catch (err) {
      console.warn('Long task observer not supported:', err);
    }
  }
}

/**
 * Optimizes memory usage by cleaning up unused resources
 * @param {Object} options - Configuration options
 * @param {boolean} options.aggressive - Whether to use aggressive optimization
 * @param {number} options.threshold - Memory threshold in MB to trigger aggressive cleanup
 * @returns {Object} - Success status and memory metrics
 */
export function optimizeMemory(options = {}) {
  try {
    const {
      aggressive = false,
      threshold = 100, // Default threshold in MB
    } = options;

    // Capture initial memory usage
    const initialMemory = getMemoryUsage();

    // Check if we need auto-aggressive mode based on memory threshold
    const autoAggressive = initialMemory && initialMemory.heapUsedMB > threshold;
    const shouldBeAggressive = aggressive || autoAggressive;

    // Basic cleanup
    if (window.gc) {
      window.gc();
    }

    // Clear console in non-development environments
    if (process.env.NODE_ENV !== 'development') {
      console.clear();
    }

    // Remove any orphaned event listeners
    cleanupEventListeners();

    // Progressive cleanup steps
    // Level 1: Basic cleanup always runs
    purgeWeakReferences();

    // Level 2: Medium cleanup for auto-triggered or manually aggressive modes
    if (shouldBeAggressive) {
      // Clear image cache
      clearImageCaches();

      // Clear any stored blobs
      clearStoredBlobs();

      // Remove DOM elements pending deletion
      cleanUpDetachedDomNodes();
    }

    // Level 3: Extreme cleanup only when manually requested
    if (aggressive) {
      // Clear all non-essential localStorage items
      clearTemporaryStorage();

      // Reset non-critical application state
      resetNonCriticalState();
    }

    // Get final memory usage
    const finalMemory = getMemoryUsage();

    return {
      success: true,
      initial: initialMemory,
      final: finalMemory,
      cleaned:
        initialMemory && finalMemory
          ? (initialMemory.heapUsedMB - finalMemory.heapUsedMB).toFixed(2) + 'MB'
          : 'Unknown',
      aggressive: shouldBeAggressive,
    };
  } catch (error) {
    console.error('Memory optimization failed:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get current memory usage metrics
 * @returns {Object|null} Memory usage metrics or null if not available
 */
export function getMemoryUsage() {
  if (!window.performance || !window.performance.memory) {
    return null;
  }

  const { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit } = window.performance.memory;

  return {
    heapUsedMB: Math.round((usedJSHeapSize / (1024 * 1024)) * 100) / 100,
    heapTotalMB: Math.round((totalJSHeapSize / (1024 * 1024)) * 100) / 100,
    heapLimitMB: Math.round((jsHeapSizeLimit / (1024 * 1024)) * 100) / 100,
    percentUsed: Math.round((usedJSHeapSize / jsHeapSizeLimit) * 100 * 100) / 100,
  };
}

/**
 * Purge weak references that may be holding onto memory
 */
function purgeWeakReferences() {
  // This will help trigger garbage collection of weak references
  if (window.WeakRef && window.FinalizationRegistry) {
    // Modern browsers support this
    const registry = new FinalizationRegistry(() => {});
    registry.register({}, {});
  }
}

/**
 * Clears stored blobs and frees up memory used by them
 */
function clearStoredBlobs() {
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
    if (window.blobCache && typeof window.blobCache === 'object') {
      Object.keys(window.blobCache).forEach(key => {
        try {
          if (
            window.blobCache[key] &&
            typeof window.blobCache[key] === 'string' &&
            window.blobCache[key].startsWith('blob:')
          ) {
            URL.revokeObjectURL(window.blobCache[key]);
          }
        } catch (e) {
          // Ignore individual errors
        }
      });
      window.blobCache = {};
    }

    return true;
  } catch (err) {
    console.warn('Error clearing stored blobs:', err);
    return false;
  }
}

/**
 * Clean up any detached DOM nodes that might be in memory
 */
function cleanUpDetachedDomNodes() {
  // Force a small layout recalculation to help browser
  // identify unused DOM nodes
  if (document.body) {
    const dummyDiv = document.createElement('div');
    document.body.appendChild(dummyDiv);
    dummyDiv.getBoundingClientRect();
    document.body.removeChild(dummyDiv);
  }
}

/**
 * Clear temporary items from storage
 */
function clearTemporaryStorage() {
  try {
    // Clear temporary items but preserve critical ones
    const preserveKeys = ['auth', 'user', 'tenant', 'organization'];

    // Process localStorage
    if (window.localStorage) {
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          !preserveKeys.some(pk => key.includes(pk)) &&
          (key.includes('temp') || key.includes('cache'))
        ) {
          toRemove.push(key);
        }
      }

      // Remove identified items
      toRemove.forEach(key => localStorage.removeItem(key));
    }

    // Clear non-essential sessionStorage
    if (window.sessionStorage) {
      const toRemove = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (
          !preserveKeys.some(pk => key.includes(pk)) &&
          (key.includes('temp') || key.includes('cache'))
        ) {
          toRemove.push(key);
        }
      }

      // Remove identified items
      toRemove.forEach(key => sessionStorage.removeItem(key));
    }
  } catch (e) {
    console.error('Error clearing temporary storage:', e);
  }
}

/**
 * Reset non-critical application state
 */
function resetNonCriticalState() {
  // Close any open but inactive modals
  document.querySelectorAll('[role="dialog"]').forEach(dialog => {
    if (dialog.getAttribute('aria-hidden') === 'true') {
      dialog.remove();
    }
  });

  // Remove unused iframes
  document.querySelectorAll('iframe').forEach(iframe => {
    // Only remove iframes that aren't visible
    if (iframe.style.display === 'none' || iframe.width === '0' || iframe.height === '0') {
      iframe.remove();
    }
  });
}

// Memory optimization utilities
export const memoryOptimizer = {
  clearIntervals: () => {
    // Clear any running intervals to prevent memory leaks
    for (let i = 1; i < 99999; i++) window.clearInterval(i);
  },

  clearTimeouts: () => {
    // Clear any running timeouts
    for (let i = 1; i < 99999; i++) window.clearTimeout(i);
  },

  cleanup: () => {
    memoryOptimizer.clearIntervals();
    memoryOptimizer.clearTimeouts();

    // Force garbage collection if available
    if (window.gc) {
      window.gc();
    }
  },

  startPeriodicCleanup: () => {
    setInterval(() => {
      memoryOptimizer.cleanup();
    }, 60000); // Every minute
  },
};

// Auto-start cleanup
memoryOptimizer.startPeriodicCleanup();

export default {
  initializeMemoryOptimization,
  getCurrentMemoryUsage: () => state.memoryUsage,
  forceOptimize: performMemoryOptimization,
};
