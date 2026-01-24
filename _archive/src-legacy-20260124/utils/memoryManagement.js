/**
 * Memory Management Utility
 *
 * This module provides browser memory monitoring and optimization to prevent
 * memory leaks and reduce the risk of application crashes due to memory issues.
 *
 * CRITICAL STABILITY COMPONENT - DO NOT MODIFY WITHOUT THOROUGH TESTING
 */

import { MEMORY_CONFIG } from '@/config/stabilityConfig';

// Current memory snapshot and settings
const memoryState = {
  currentUsage: null,
  isMonitoring: false,
  monitoringInterval: null,
  lastCleanup: null,
  componentCaches: new Map(), // Track registered component caches
  memoryWarningThreshold: MEMORY_CONFIG.heapThreshold || 500, // MB
  monitoringIntervalMs: MEMORY_CONFIG.monitoringInterval || 30000, // 30 seconds
  enableGarbageCollection: MEMORY_CONFIG.enableExplicitGC || true,
  cleanupHistory: [],
  diagnosticsEnabled: process.env.NODE_ENV === 'development',
};

// Remember native methods to avoid issues if they get monkey-patched
const nativeMethods = {
  setTimeout: window.setTimeout.bind(window),
  clearTimeout: window.clearTimeout.bind(window),
  setInterval: window.setInterval.bind(window),
  clearInterval: window.clearInterval.bind(window),
};

/**
 * Set up browser memory monitoring
 */
export function setupMemoryMonitoring() {
  if (memoryState.isMonitoring) {
    return; // Already monitoring
  }

  // Check if performance.memory is available (Chrome/Edge)
  const hasMemoryAPI = !!(window.performance && performance.memory);

  if (hasMemoryAPI) {
    console.log('Performance.memory API available, setting up memory monitoring');

    // Take initial snapshot
    updateMemorySnapshot();

    // Set up interval to monitor memory
    memoryState.monitoringInterval = nativeMethods.setInterval(() => {
      updateMemorySnapshot();
      checkMemoryUsage();
    }, memoryState.monitoringIntervalMs);

    memoryState.isMonitoring = true;
  } else {
    console.log('Performance.memory API not available, using limited memory monitoring');

    // Still set the monitoring flag to avoid repeated setup attempts
    memoryState.isMonitoring = true;

    // Use a simpler interval to check for general issues
    // This won't have actual memory metrics, but can still help manage component caches
    memoryState.monitoringInterval = nativeMethods.setInterval(() => {
      // Periodically clear caches if there are any registered
      if (memoryState.componentCaches.size > 0 && shouldPerformCleanup()) {
        performCleanup('scheduled');
      }
    }, 300000); // Every 5 minutes
  }

  return memoryState.isMonitoring;
}

/**
 * Update the current memory snapshot
 */
function updateMemorySnapshot() {
  if (window.performance && performance.memory) {
    const { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit } = performance.memory;

    memoryState.currentUsage = {
      used: usedJSHeapSize,
      total: totalJSHeapSize,
      limit: jsHeapSizeLimit,
      usedMB: Math.round(usedJSHeapSize / (1024 * 1024)),
      totalMB: Math.round(totalJSHeapSize / (1024 * 1024)),
      limitMB: Math.round(jsHeapSizeLimit / (1024 * 1024)),
      percentUsed: Math.round((usedJSHeapSize / jsHeapSizeLimit) * 100),
      timestamp: Date.now(),
    };
  }
}

/**
 * Check memory usage against thresholds
 */
function checkMemoryUsage() {
  if (!memoryState.currentUsage) {
    return;
  }

  const { usedMB, percentUsed } = memoryState.currentUsage;

  // If memory usage is above the warning threshold or using more than 80% of available heap
  if (usedMB > memoryState.memoryWarningThreshold || percentUsed > 80) {
    console.warn(
      `High memory usage detected: ${usedMB}MB (${percentUsed}% of available heap). ` +
        `Performing emergency cleanup.`
    );

    performCleanup('emergency');

    // If extremely high, suggest a page reload
    if (percentUsed > 90) {
      console.error(
        `Critical memory usage detected: ${usedMB}MB (${percentUsed}% of available heap). ` +
          `Consider reloading the page to prevent a crash.`
      );

      // In development mode, show a more conspicuous message
      if (process.env.NODE_ENV === 'development') {
        console.error('%c CRITICAL MEMORY WARNING! ', 'background:red;color:white;font-size:16px;');
      }
    }
  }
}

/**
 * Check if we should perform a cleanup based on time since last cleanup
 */
function shouldPerformCleanup() {
  if (!memoryState.lastCleanup) {
    return true; // First cleanup
  }

  const now = Date.now();
  const timeSinceLastCleanup = now - memoryState.lastCleanup;

  // Don't clean up more than once every 2 minutes unless it's an emergency
  return timeSinceLastCleanup > 120000;
}

/**
 * Perform memory cleanup operations
 */
function performCleanup(reason = 'manual') {
  // Only perform if it's been a while since the last cleanup
  // or if this is an emergency cleanup
  if (reason !== 'emergency' && !shouldPerformCleanup()) {
    return;
  }

  console.log(`Performing memory cleanup (reason: ${reason})`);

  // Clear component caches
  clearComponentCaches();

  // Attempt to force garbage collection if enabled and available
  if (memoryState.enableGarbageCollection && window.gc) {
    try {
      window.gc();
      console.log('Forced garbage collection completed');
    } catch (e) {
      // Ignore errors
    }
  }

  // Update the last cleanup time
  memoryState.lastCleanup = Date.now();

  // Record the cleanup in history
  memoryState.cleanupHistory.push({
    timestamp: Date.now(),
    reason,
    memoryBefore: memoryState.currentUsage ? { ...memoryState.currentUsage } : null,
  });

  // Keep history limited
  if (memoryState.cleanupHistory.length > 20) {
    memoryState.cleanupHistory.shift();
  }

  // Update memory snapshot after cleanup
  nativeMethods.setTimeout(() => {
    updateMemorySnapshot();

    // Record the post-cleanup memory state
    if (memoryState.currentUsage && memoryState.cleanupHistory.length > 0) {
      const latestCleanup = memoryState.cleanupHistory[memoryState.cleanupHistory.length - 1];
      latestCleanup.memoryAfter = { ...memoryState.currentUsage };

      // Calculate savings if we have before and after
      if (latestCleanup.memoryBefore) {
        const savedBytes = latestCleanup.memoryBefore.used - latestCleanup.memoryAfter.used;
        const savedMB = Math.round(savedBytes / (1024 * 1024));

        if (savedMB > 0) {
          console.log(`Memory cleanup freed approximately ${savedMB}MB`);
        }
      }
    }
  }, 1000);
}

/**
 * Clear all registered component caches
 */
function clearComponentCaches() {
  if (memoryState.componentCaches.size === 0) {
    return;
  }

  console.log(`Clearing ${memoryState.componentCaches.size} component caches`);

  let totalItemsCleared = 0;

  // Clear each registered cache
  memoryState.componentCaches.forEach((cache, name) => {
    if (typeof cache.clear === 'function') {
      try {
        const size = cache.size || 0;
        cache.clear();
        totalItemsCleared += size;
        console.log(`Cleared ${name} cache (${size} items)`);
      } catch (e) {
        console.error(`Error clearing ${name} cache:`, e);
      }
    } else if (Array.isArray(cache)) {
      const size = cache.length;
      cache.length = 0;
      totalItemsCleared += size;
      console.log(`Cleared ${name} cache array (${size} items)`);
    } else if (typeof cache === 'object') {
      const size = Object.keys(cache).length;
      for (const key in cache) {
        delete cache[key];
      }
      totalItemsCleared += size;
      console.log(`Cleared ${name} cache object (${size} items)`);
    }
  });

  console.log(`Total items cleared from caches: ${totalItemsCleared}`);
}

/**
 * Register a component cache for automatic cleanup
 *
 * @param {string} name - Name of the component/cache
 * @param {object|Map|Set|Array} cache - Reference to the cache object
 * @returns {function} - Function to unregister the cache
 */
export function registerComponentCache(name, cache) {
  if (!cache) {
    console.error('Cannot register null or undefined cache');
    return () => {};
  }

  console.log(`Registering component cache: ${name}`);
  memoryState.componentCaches.set(name, cache);

  // Return a function to unregister
  return () => {
    memoryState.componentCaches.delete(name);
    console.log(`Unregistered component cache: ${name}`);
  };
}

/**
 * Clear specific component caches by name
 *
 * @param {string|Array<string>} cacheNames - Names of caches to clear
 */
export function clearComponentCache(cacheNames) {
  const namesToClear = Array.isArray(cacheNames) ? cacheNames : [cacheNames];

  namesToClear.forEach(name => {
    const cache = memoryState.componentCaches.get(name);
    if (cache) {
      if (typeof cache.clear === 'function') {
        try {
          const size = cache.size || 0;
          cache.clear();
          console.log(`Cleared ${name} cache (${size} items)`);
        } catch (e) {
          console.error(`Error clearing ${name} cache:`, e);
        }
      } else if (Array.isArray(cache)) {
        const size = cache.length;
        cache.length = 0;
        console.log(`Cleared ${name} cache array (${size} items)`);
      } else if (typeof cache === 'object') {
        const size = Object.keys(cache).length;
        for (const key in cache) {
          delete cache[key];
        }
        console.log(`Cleared ${name} cache object (${size} items)`);
      }
    } else {
      console.warn(`Cache not found: ${name}`);
    }
  });
}

/**
 * Clear all component caches (public method)
 */
export function clearAllComponentCaches() {
  clearComponentCaches();
}

/**
 * Get the current memory usage
 */
export function getMemoryUsage() {
  updateMemorySnapshot();
  return memoryState.currentUsage;
}

/**
 * Get statistics about memory management
 */
export function getMemoryStats() {
  return {
    isMonitoring: memoryState.isMonitoring,
    currentUsage: memoryState.currentUsage,
    registeredCaches: Array.from(memoryState.componentCaches.keys()),
    cleanupHistory: [...memoryState.cleanupHistory],
    lastCleanup: memoryState.lastCleanup,
    config: {
      memoryWarningThreshold: memoryState.memoryWarningThreshold,
      monitoringIntervalMs: memoryState.monitoringIntervalMs,
      enableGarbageCollection: memoryState.enableGarbageCollection,
    },
  };
}

/**
 * Stop memory monitoring
 */
export function stopMemoryMonitoring() {
  if (memoryState.monitoringInterval) {
    nativeMethods.clearInterval(memoryState.monitoringInterval);
    memoryState.monitoringInterval = null;
  }

  memoryState.isMonitoring = false;
  console.log('Memory monitoring stopped');
}

export default {
  setupMemoryMonitoring,
  registerComponentCache,
  clearComponentCache,
  clearAllComponentCaches,
  getMemoryUsage,
  getMemoryStats,
  stopMemoryMonitoring,
};
