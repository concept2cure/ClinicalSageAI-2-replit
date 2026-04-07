/**
 * Freeze Detection Utility
 *
 * This module provides detection of browser UI freezes/hangs and can
 * trigger recovery actions when freezes are detected.
 *
 * CRITICAL STABILITY COMPONENT - DO NOT MODIFY WITHOUT THOROUGH TESTING
 */

import { FREEZE_CONFIG } from '@/config/stabilityConfig';

/**
 * Globals for freeze detection
 */
const state = {
  heartbeatInterval: null,
  lastHeartbeat: Date.now(),
  workerHeartbeat: null,
  freezeHistory: [],
  recoveryAttempts: 0,
  enabled: false,
  worker: null,
};

/**
 * Initialize basic freeze detection
 */
function initBasicFreezeDetection() {
  if (state.enabled) {
    // Already initialized
    return;
  }

  console.log('Initializing freeze detection...');

  // Initialize with the last heartbeat as now
  state.lastHeartbeat = Date.now();

  // Start a worker if supported, to monitor the main thread from a separate thread
  try {
    startWorker();
  } catch (e) {
    console.error('Could not start freeze detection worker:', e);
    // Fall back to the setTimeout approach
    startMainThreadDetection();
  }

  // Load freeze history from localStorage if available
  try {
    const freezeHistory = localStorage.getItem('freeze_logs');
    if (freezeHistory) {
      state.freezeHistory = JSON.parse(freezeHistory);
      pruneOldFreezeEvents();
    }
  } catch (e) {
    // Ignore storage errors
    console.error('Could not load freeze history from localStorage:', e);
  }

  // Set up the heartbeat interval on the main thread
  state.heartbeatInterval = setInterval(() => {
    // Update the last heartbeat time
    state.lastHeartbeat = Date.now();
  }, FREEZE_CONFIG.checkInterval / 2);

  state.enabled = true;

  return {
    enabled: state.enabled,
    freezeHistory: [...state.freezeHistory],
  };
}

/**
 * Start a worker to monitor the main thread
 */
function startWorker() {
  // Create a simple worker blob that will ping the main thread
  const workerBlob = new Blob(
    [
      `
    // Worker for freeze detection

    // Configuration
    const CHECK_INTERVAL = ${FREEZE_CONFIG.checkInterval};
    const FREEZE_THRESHOLD = ${FREEZE_CONFIG.freezeThreshold};

    // State
    let lastMessageTime = Date.now();
    let checkInterval = null;

    // Start checking
    checkInterval = setInterval(() => {
      const now = Date.now();
      const timeSinceLastMessage = now - lastMessageTime;

      // If we haven't received a message in a while, the main thread might be frozen
      if (timeSinceLastMessage > FREEZE_THRESHOLD) {
        // Send a freeze event to the main thread
        postMessage({
          type: 'freeze',
          duration: timeSinceLastMessage,
          timestamp: now
        });
      }

      // Send a ping to the main thread
      postMessage({ type: 'ping', timestamp: now });
    }, CHECK_INTERVAL);

    // Listen for messages from the main thread
    self.addEventListener('message', (event) => {
      if (event.data.type === 'pong') {
        // Update the last message time
        lastMessageTime = Date.now();
      } else if (event.data.type === 'stop') {
        // Stop the interval
        clearInterval(checkInterval);
      }
    });
  `,
    ],
    { type: 'application/javascript' }
  );

  // Create a URL for the blob
  const workerUrl = URL.createObjectURL(workerBlob);

  // Create a worker
  state.worker = new Worker(workerUrl);

  // Listen for messages from the worker
  state.worker.addEventListener('message', event => {
    if (event.data.type === 'ping') {
      // Send a pong back to the worker
      state.worker.postMessage({ type: 'pong', timestamp: Date.now() });
    } else if (event.data.type === 'freeze') {
      // The worker detected a potential freeze
      const { duration, timestamp } = event.data;
      handleFreezeEvent(duration, timestamp);
    }
  });

  // Revoke the URL to free memory
  URL.revokeObjectURL(workerUrl);
}

/**
 * Start freeze detection on the main thread
 * This is a fallback for browsers that don't support workers
 */
function startMainThreadDetection() {
  // Set up an interval to check for freezes
  state.workerHeartbeat = setInterval(() => {
    const now = Date.now();
    const elapsed = now - state.lastHeartbeat;

    // If the elapsed time is greater than our threshold, we might have had a freeze
    if (elapsed > FREEZE_CONFIG.freezeThreshold) {
      handleFreezeEvent(elapsed, now);
    }
  }, FREEZE_CONFIG.checkInterval);
}

/**
 * Handle a detected freeze event
 */
function handleFreezeEvent(duration, timestamp) {
  // Only log if it's a significant freeze
  if (duration < FREEZE_CONFIG.freezeThreshold) {
    return;
  }

  // Create a freeze event
  const freezeEvent = {
    duration,
    timestamp,
    url: window.location.href,
    recovery: state.recoveryAttempts > 0,
  };

  // Add to history
  state.freezeHistory.push(freezeEvent);

  // Prune old events
  pruneOldFreezeEvents();

  // Log the event
  if (FREEZE_CONFIG.logFreezeEvents) {
    console.warn(
      `UI freeze detected: ${Math.round(duration)}ms at ${new Date(timestamp).toISOString()}`
    );
  }

  // Store in localStorage
  try {
    localStorage.setItem('freeze_logs', JSON.stringify(state.freezeHistory));
  } catch (e) {
    // Ignore storage errors
  }

  // Check for consecutive freezes
  const recentFreezes = getRecentConsecutiveFreezes(timestamp);

  // Aggressive recovery for consecutive freezes
  if (recentFreezes >= 3) {
    console.warn(`Detected ${recentFreezes} consecutive freezes, attempting aggressive recovery`);
    attemptAggressiveRecovery();

    // Show recovery notification
    if (FREEZE_CONFIG.showFreezeNotifications) {
      showPageReloadSuggestion();
    }
    return;
  }

  // Show a notification if enabled
  if (FREEZE_CONFIG.showFreezeNotifications) {
    showFreezeNotification(duration);
  }

  // Attempt recovery if enabled and the freeze was severe
  if (FREEZE_CONFIG.autoRecovery && duration > FREEZE_CONFIG.freezeThreshold * 3) {
    attemptRecovery();
  }
}

// Function to detect consecutive freezes within a short time period
function getRecentConsecutiveFreezes(currentTimestamp) {
  if (state.freezeHistory.length < 2) return 1;

  // Look for freezes in the last minute
  const lastMinute = currentTimestamp - 60000;
  const recentFreezes = state.freezeHistory.filter(freeze => freeze.timestamp > lastMinute);

  // Check if they are consecutive (within ~5-6 seconds of each other)
  let consecutiveCount = 1;
  for (let i = recentFreezes.length - 1; i > 0; i--) {
    const timeDiff = recentFreezes[i].timestamp - recentFreezes[i - 1].timestamp;
    // If freezes are happening one after another with small gaps
    if (timeDiff < 10000) {
      consecutiveCount++;
    } else {
      break;
    }
  }

  return consecutiveCount;
}

/**
 * Attempt to recover from a freeze
 */
function attemptRecovery() {
  // Increment recovery attempts
  state.recoveryAttempts++;

  // Log the recovery attempt
  console.warn(`Attempting freeze recovery (attempt ${state.recoveryAttempts})`);

  // Try to clean up memory and resources

  // Force garbage collection if available
  if (window.gc) {
    try {
      window.gc();
    } catch (e) {
      // Ignore errors
    }
  }

  // Try to clear some browser caches if available
  if (window.caches && typeof caches.keys === 'function') {
    try {
      caches
        .keys()
        .then(keys => {
          // Only clear non-essential caches
          keys.forEach(key => {
            if (key.includes('dynamic') || key.includes('temp')) {
              caches.delete(key);
            }
          });
        })
        .catch(() => {
          // Ignore errors
        });
    } catch (e) {
      // Ignore errors
    }
  }

  // Try to cleanup DOM events
  cleanupDomListeners();

  // If we've tried too many times, suggest a page reload
  if (state.recoveryAttempts >= 3) {
    console.warn('Multiple freeze recovery attempts have failed. Consider reloading the page.');

    if (FREEZE_CONFIG.showFreezeNotifications) {
      showPageReloadSuggestion();
    }
  }
}

// More aggressive recovery for consecutive freezes but with better performance
function attemptAggressiveRecovery() {
  // Increment recovery attempts
  state.recoveryAttempts++;

  console.warn(`Attempting AGGRESSIVE freeze recovery (attempt ${state.recoveryAttempts})`);

  // Force garbage collection
  if (window.gc) {
    try {
      window.gc();
    } catch (e) {
      // Ignore errors
    }
  }

  // Clear only non-essential caches to avoid complete app reload
  if (window.caches && typeof caches.keys === 'function') {
    try {
      caches
        .keys()
        .then(keys => {
          keys.forEach(key => {
            // Only clear non-essential caches
            if (key.includes('dynamic') || key.includes('temp')) {
              caches.delete(key);
            }
          });
        })
        .catch(() => {
          // Ignore errors
        });
    } catch (e) {
      // Ignore errors
    }
  }

  // Cleanup DOM listeners more selectively
  cleanupDomListenersSelectively();

  // Cleanup memory-intensive objects
  cleanupMemoryObjects();

  // Reset parts of application state
  partialAppStateReset();

  // Allow DOM to settle
  setTimeout(() => {
    console.info('Aggressive recovery completed');
  }, 200); // Increased to 200ms to allow for more cleanup time
}

// More selective DOM cleanup to avoid breaking essential functionality
function cleanupDomListenersSelectively() {
  try {
    // Find elements with many listeners
    const elements = document.querySelectorAll('*');
    let cleanedCount = 0;

    for (const el of elements) {
      if (el._events && Object.keys(el._events).length > 15) {
        // These elements have too many listeners, which can indicate a memory leak
        // Clear non-essential event listeners on elements with many listeners
        if (typeof el.removeEventListener === 'function') {
          const originalEvents = { ...el._events };

          for (const eventType in el._events) {
            // Keep only essential events
            if (
              !['click', 'submit', 'change', 'keydown', 'keyup', 'input', 'focus', 'blur'].includes(
                eventType
              )
            ) {
              el._events[eventType] = [];
              cleanedCount++;
            }
          }

          // Store original listeners in case they need to be restored
          el._originalEvents = originalEvents;
        }
      }
    }

    console.debug(`Cleaned up ${cleanedCount} event listeners`);
  } catch (e) {
    console.error('Error during selective DOM listener cleanup:', e);
  }
}

// Reset only parts of application state to avoid complete disruption
function partialAppStateReset() {
  try {
    // Clear any cached large data objects in window
    const propertiesToClean = [
      'cachedData',
      'tempResults',
      'largeDatasets',
      'imageCache',
      'responseCache',
      'dataCache',
    ];

    for (const prop of propertiesToClean) {
      if (window[prop]) {
        // Clean objects rather than nullify them
        if (Array.isArray(window[prop])) {
          window[prop] = [];
        } else if (typeof window[prop] === 'object') {
          // Preserve the object reference but clear contents
          const keys = Object.keys(window[prop]);
          for (const key of keys) {
            delete window[prop][key];
          }
        }
      }
    }

    // If there's an app-level cache, clear it but don't destroy it
    if (window.app && window.app.cache && typeof window.app.cache.clear === 'function') {
      window.app.cache.clear();
    }

    // Remove non-essential timeouts and intervals
    const highestTimeoutId = setTimeout(() => {}, 0);
    for (let i = highestTimeoutId; i > highestTimeoutId - 100; i--) {
      window.clearTimeout(i);
    }

    // Clear unused image data
    const images = document.querySelectorAll('img[src^="data:"]');
    for (const img of images) {
      if (!isElementInViewport(img)) {
        img.src = '';
      }
    }

    console.debug('Partial application state reset completed');
  } catch (e) {
    console.error('Error during partial app state reset:', e);
  }
}

// Helper to clean up DOM listeners that might be leaking
function cleanupDomListeners() {
  try {
    // Find elements with many listeners
    const elements = document.querySelectorAll('*');
    for (const el of elements) {
      if (el._events && Object.keys(el._events).length > 10) {
        // Clear non-essential event listeners on elements with many listeners
        if (typeof el.removeEventListener === 'function') {
          for (const eventType in el._events) {
            // Keep only essential events
            if (!['click', 'submit', 'change'].includes(eventType)) {
              el._events[eventType] = [];
            }
          }
        }
      }
    }
  } catch (e) {
    console.error('Error during DOM listener cleanup:', e);
  }
}

// Cleanup memory-intensive objects
function cleanupMemoryObjects() {
  try {
    // Clear any cached large data objects in window
    const propertiesToClean = [
      'cachedData',
      'tempResults',
      'largeDatasets',
      'imageCache',
      'responseCache',
      'dataCache',
    ];

    for (const prop of propertiesToClean) {
      if (window[prop]) {
        window[prop] = null;
      }
    }

    // Clear any application level caches if they exist
    if (window.app && window.app.cache) {
      window.app.cache.clear();
    }

    // Clear unused image data
    const images = document.querySelectorAll('img[src^="data:"]');
    for (const img of images) {
      if (!isElementInViewport(img)) {
        img.src = '';
      }
    }
  } catch (e) {
    console.error('Error during memory cleanup:', e);
  }
}

// Check if element is in viewport
function isElementInViewport(el) {
  const rect = el.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

// Reset application state to minimize memory usage
function resetAppState() {
  try {
    // If React is available
    if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
      // Find React instances that might be leaking
      const reactInstances = Object.values(window.__REACT_DEVTOOLS_GLOBAL_HOOK__._renderers || {});
      for (const instance of reactInstances) {
        if (instance.findHostInstancesForRefresh) {
          // Clear any stale React component state
          try {
            instance.findHostInstancesForRefresh();
          } catch (e) {
            // Ignore errors
          }
        }
      }
    }

    // Purge Redux store if available
    if (window.store && typeof window.store.dispatch === 'function') {
      window.store.dispatch({ type: 'MEMORY_CLEANUP' });
    }
  } catch (e) {
    console.error('Error during app state reset:', e);
  }
}

/**
 * Show a notification about a detected freeze
 */
function showFreezeNotification(duration) {
  // Only show if we're in a browser environment with notifications
  if (typeof document === 'undefined') {
    return;
  }

  try {
    // Create a notification element
    const notification = document.createElement('div');
    notification.style.position = 'fixed';
    notification.style.bottom = '16px';
    notification.style.left = '16px';
    notification.style.padding = '8px 16px';
    notification.style.borderRadius = '4px';
    notification.style.backgroundColor = 'rgba(255, 200, 10, 0.9)';
    notification.style.color = '#333';
    notification.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
    notification.style.zIndex = '9999';
    notification.style.transition = 'opacity 0.5s';
    notification.style.fontSize = '13px';
    notification.style.fontFamily = 'system-ui, -apple-system, sans-serif';

    // Add a close button
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '×';
    closeButton.style.background = 'none';
    closeButton.style.border = 'none';
    closeButton.style.color = '#333';
    closeButton.style.float = 'right';
    closeButton.style.fontSize = '16px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.marginLeft = '8px';
    closeButton.style.padding = '0 4px';

    closeButton.addEventListener('click', () => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    });

    // Add the message
    notification.appendChild(closeButton);
    notification.appendChild(
      document.createTextNode(
        `UI freeze detected: ${Math.round(duration)}ms. Performance may be degraded.`
      )
    );

    // Add to the document
    document.body.appendChild(notification);

    // Remove after a delay
    setTimeout(() => {
      notification.style.opacity = '0';

      // Remove from DOM after fade out
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 500);
    }, 5000);
  } catch (e) {
    // Ignore errors when showing the notification
  }
}

/**
 * Show a notification suggesting a page reload
 */
function showPageReloadSuggestion() {
  // Only show if we're in a browser environment with notifications
  if (typeof document === 'undefined') {
    return;
  }

  try {
    // Create a notification element
    const notification = document.createElement('div');
    notification.style.position = 'fixed';
    notification.style.top = '50%';
    notification.style.left = '50%';
    notification.style.transform = 'translate(-50%, -50%)';
    notification.style.padding = '16px 24px';
    notification.style.borderRadius = '8px';
    notification.style.backgroundColor = 'rgba(240, 240, 240, 0.95)';
    notification.style.color = '#333';
    notification.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.15)';
    notification.style.zIndex = '10000';
    notification.style.transition = 'opacity 0.5s';
    notification.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    notification.style.textAlign = 'center';
    notification.style.maxWidth = '400px';
    notification.style.width = '80%';

    // Add a header
    const header = document.createElement('h3');
    header.textContent = 'Performance Issue Detected';
    header.style.margin = '0 0 8px 0';
    header.style.fontSize = '16px';
    header.style.fontWeight = '600';

    // Add the message
    const message = document.createElement('p');
    message.textContent =
      'Multiple UI freezes detected. Reloading the page may improve performance.';
    message.style.margin = '0 0 16px 0';
    message.style.fontSize = '14px';

    // Add buttons
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'center';
    buttonContainer.style.gap = '8px';

    const reloadButton = document.createElement('button');
    reloadButton.textContent = 'Reload Page';
    reloadButton.style.padding = '8px 16px';
    reloadButton.style.backgroundColor = '#d97757';
    reloadButton.style.color = 'white';
    reloadButton.style.border = 'none';
    reloadButton.style.borderRadius = '4px';
    reloadButton.style.cursor = 'pointer';
    reloadButton.style.fontSize = '14px';

    reloadButton.addEventListener('click', () => {
      window.location.reload();
    });

    const ignoreButton = document.createElement('button');
    ignoreButton.textContent = 'Ignore';
    ignoreButton.style.padding = '8px 16px';
    ignoreButton.style.backgroundColor = '#f3f4f6';
    ignoreButton.style.color = '#4b5563';
    ignoreButton.style.border = '1px solid #d1d5db';
    ignoreButton.style.borderRadius = '4px';
    ignoreButton.style.cursor = 'pointer';
    ignoreButton.style.fontSize = '14px';

    ignoreButton.addEventListener('click', () => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    });

    buttonContainer.appendChild(reloadButton);
    buttonContainer.appendChild(ignoreButton);

    notification.appendChild(header);
    notification.appendChild(message);
    notification.appendChild(buttonContainer);

    // Create a semi-transparent overlay
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    overlay.style.zIndex = '9999';

    // Add to the document
    document.body.appendChild(overlay);
    document.body.appendChild(notification);

    // Remove when ignore is clicked
    ignoreButton.addEventListener('click', () => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    });
  } catch (e) {
    // Ignore errors when showing the notification
  }
}

/**
 * Remove freeze events older than 24 hours
 */
function pruneOldFreezeEvents() {
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;

  state.freezeHistory = state.freezeHistory.filter(event => event.timestamp > oneDayAgo);
}

/**
 * Cleanup freeze detection resources
 */
export function cleanupFreezeDetection() {
  if (state.heartbeatInterval) {
    clearInterval(state.heartbeatInterval);
    state.heartbeatInterval = null;
  }

  if (state.workerHeartbeat) {
    clearInterval(state.workerHeartbeat);
    state.workerHeartbeat = null;
  }

  if (state.worker) {
    state.worker.postMessage({ type: 'stop' });
    state.worker.terminate();
    state.worker = null;
  }

  state.enabled = false;
}

/**
 * Get freeze history
 */
export function getFreezeHistory() {
  return [...state.freezeHistory];
}

/**
 * Get current freeze detection status
 */
export function getStatus() {
  return {
    enabled: state.enabled,
    recoveryAttempts: state.recoveryAttempts,
    freezeEvents: state.freezeHistory.length,
  };
}

export default {
  initFreezeDetection,
  cleanupFreezeDetection,
  getFreezeHistory,
  getStatus,
};

/**
 * Initializes freeze detection to identify UI lag
 * @param {Object} options - Configuration options
 * @param {number} options.threshold - Freeze threshold in milliseconds (default: 1000)
 * @param {number} options.severeFreezeThreshold - Severe freeze threshold in ms (default: 5000)
 * @param {Function} options.onFreeze - Callback when freeze is detected
 * @param {Function} options.onSevereFreeze - Callback when severe freeze is detected
 * @param {boolean} options.attemptRecovery - Whether to attempt recovery from severe freezes
 * @returns {Object} - Control interface with cleanup and diagnostics functions
 */
export function initFreezeDetection(options = {}) {
  const {
    threshold = 1000,
    severeFreezeThreshold = 5000,
    onFreeze = null,
    onSevereFreeze = null,
    attemptRecovery = true,
  } = options;

  // State tracking
  let isActive = true;
  let freezeCount = 0;
  let severeFreezesCount = 0;
  let totalFreezeTime = 0;
  let longestFreezeDuration = 0;
  let lastFreezeTime = null;

  if (!window.requestAnimationFrame) {
    console.warn('Freeze detection not supported in this browser');
    return {
      cleanup: () => {},
      isActive: () => false,
      getMetrics: () => ({ supported: false }),
    };
  }

  let lastTickTime = performance.now();
  let animationFrameId = null;
  let checkInterval = null;
  let recoveryTimer = null;

  // Function to update the last tick time
  const tick = () => {
    lastTickTime = performance.now();
    animationFrameId = window.requestAnimationFrame(tick);
  };

  // Start the animation frame loop
  animationFrameId = window.requestAnimationFrame(tick);

  // Emergency recovery function for severe freezes
  const attemptEmergencyRecovery = () => {
    if (!attemptRecovery) return;

    try {
      // Clear any heavy animations
      document.querySelectorAll('.animate-spin, .animate-pulse, .animate-bounce').forEach(el => {
        el.classList.remove('animate-spin', 'animate-pulse', 'animate-bounce');
      });

      // Force garbage collection if available
      if (window.gc) {
        window.gc();
      }

      // Clear any large blobs
      const urls = [];
      document.querySelectorAll('img, video, audio, iframe').forEach(el => {
        const src = el.src;
        if (src && src.startsWith('blob:')) {
          urls.push(src);
          el.removeAttribute('src');
        }
      });

      // Revoke the blob URLs
      urls.forEach(url => {
        try {
          URL.revokeObjectURL(url);
        } catch (e) {
          // Ignore errors when revoking
        }
      });

      console.log(`Emergency recovery completed after severe freeze`);
    } catch (e) {
      console.error('Error during emergency recovery:', e);
    }
  };

  // Set up interval to check for freezes
  checkInterval = setInterval(() => {
    if (!isActive) return;

    const currentTime = performance.now();
    const timeSinceLastTick = currentTime - lastTickTime;

    if (timeSinceLastTick > threshold) {
      // Calculate metrics
      freezeCount++;
      totalFreezeTime += timeSinceLastTick;
      lastFreezeTime = new Date().toISOString();

      if (timeSinceLastTick > longestFreezeDuration) {
        longestFreezeDuration = timeSinceLastTick;
      }

      console.warn(`UI freeze detected: ${Math.round(timeSinceLastTick)}ms at ${lastFreezeTime}`);

      // Check for severe freeze
      if (timeSinceLastTick > severeFreezeThreshold) {
        severeFreezesCount++;

        console.error(
          `SEVERE UI freeze detected: ${Math.round(timeSinceLastTick)}ms at ${lastFreezeTime}`
        );

        // Attempt recovery after severe freeze
        if (attemptRecovery) {
          // Use a small timeout to ensure we don't block the current event loop cycle
          if (recoveryTimer) clearTimeout(recoveryTimer);
          recoveryTimer = setTimeout(attemptEmergencyRecovery, 50);
        }

        // Call severe freeze callback if provided
        if (onSevereFreeze && typeof onSevereFreeze === 'function') {
          onSevereFreeze({
            duration: timeSinceLastTick,
            timestamp: lastFreezeTime,
            metrics: getMetrics(),
          });
        }
      }

      // Call standard freeze callback
      if (onFreeze && typeof onFreeze === 'function') {
        onFreeze({
          duration: timeSinceLastTick,
          timestamp: lastFreezeTime,
          isSevere: timeSinceLastTick > severeFreezeThreshold,
          metrics: getMetrics(),
        });
      }
    }
  }, 1000);

  // Get current metrics
  const getMetrics = () => {
    return {
      supported: true,
      freezeCount,
      severeFreezesCount,
      totalFreezeTime,
      longestFreezeDuration,
      lastFreezeTime,
      averageDuration: freezeCount > 0 ? totalFreezeTime / freezeCount : 0,
      isActive,
    };
  };

  // Pause detection
  const pause = () => {
    isActive = false;
  };

  // Resume detection
  const resume = () => {
    isActive = true;
    lastTickTime = performance.now(); // Reset to avoid false positive after resume
  };

  // Reset metrics
  const resetMetrics = () => {
    freezeCount = 0;
    severeFreezesCount = 0;
    totalFreezeTime = 0;
    longestFreezeDuration = 0;
    lastFreezeTime = null;
  };

  // Cleanup function
  const cleanup = () => {
    isActive = false;

    if (animationFrameId !== null) {
      window.cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    if (checkInterval !== null) {
      clearInterval(checkInterval);
      checkInterval = null;
    }

    if (recoveryTimer !== null) {
      clearTimeout(recoveryTimer);
      recoveryTimer = null;
    }
  };

  // Return control interface
  return {
    cleanup,
    getMetrics,
    pause,
    resume,
    resetMetrics,
    isActive: () => isActive,
  };
}

/**
 * Analyzes the current page for potential freeze-causing elements
 * @returns {Object} Analysis results with recommendations
 */
export function analyzeFreezeRisks() {
  if (typeof document === 'undefined') return { risks: [] };

  const risks = [];

  try {
    // Check for large images without width/height
    const images = document.querySelectorAll('img');
    let largeImagesWithoutDimensions = 0;

    images.forEach(img => {
      if (!img.width && !img.height && !img.style.width && !img.style.height) {
        largeImagesWithoutDimensions++;
      }
    });

    if (largeImagesWithoutDimensions > 3) {
      risks.push({
        type: 'images',
        level: 'medium',
        message: `Found ${largeImagesWithoutDimensions} images without explicit dimensions which may cause layout shifts`,
        recommendation: 'Add width and height attributes to images to prevent layout shifts',
      });
    }

    // Check for excessive animations
    const animatingElements = document.querySelectorAll(
      '.animate-spin, .animate-pulse, .animate-bounce, [class*="animate-"]'
    );
    if (animatingElements.length > 5) {
      risks.push({
        type: 'animations',
        level: 'high',
        message: `Found ${animatingElements.length} animated elements which may impact performance`,
        recommendation: 'Reduce the number of simultaneous animations',
      });
    }

    // Check for complex layouts that might cause reflows
    const deepNesting = document.querySelectorAll('div > div > div > div > div > div');
    if (deepNesting.length > 20) {
      risks.push({
        type: 'dom-complexity',
        level: 'medium',
        message:
          'Deeply nested DOM structure detected which may cause expensive layout calculations',
        recommendation: 'Simplify DOM structure or use virtualization for large lists',
      });
    }

    // Check for potential memory leaks via event listeners on elements
    const eventfulElements = document.querySelectorAll(
      '[onclick], [onchange], [onmouseover], [onmouseout]'
    );
    if (eventfulElements.length > 50) {
      risks.push({
        type: 'event-listeners',
        level: 'low',
        message: `Found ${eventfulElements.length} inline event listeners which may prevent garbage collection`,
        recommendation: 'Use event delegation or React event handling instead of inline listeners',
      });
    }
  } catch (e) {
    console.error('Error analyzing freeze risks:', e);
  }

  return {
    risks,
    timestamp: new Date().toISOString(),
    recommendations:
      risks.length > 0
        ? 'Consider implementing the recommendations to improve UI responsiveness'
        : 'No significant freeze risks detected',
  };
}
