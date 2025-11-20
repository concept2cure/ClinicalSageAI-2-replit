/**
 * Stability Configuration
 *
 * This file contains global configuration settings for all stability features.
 * Modify these settings to adjust the behavior of memory management,
 * error handling, network resilience, and other stability features.
 */

/**
 * Memory Management Configuration
 */
export const MEMORY_CONFIG = {
  // Maximum heap size in MB before cleanup is triggered
  heapThreshold: 500,

  // Interval in ms for memory monitoring
  monitoringInterval: 30000,

  // Whether to attempt explicit garbage collection when available
  enableExplicitGC: true,

  // Maximum cache size in MB for component caches
  maxCacheSize: 100,

  // Whether to automatically clean up component caches when memory is low
  autoCacheCleanup: true,

  // Minimum age in ms for items to be cleared from component caches
  cacheItemMinAge: 300000, // 5 minutes
};

/**
 * Network Resilience Configuration
 */
export const NETWORK_CONFIG = {
  // Maximum number of retry attempts for failed requests
  maxRetries: 3,

  // Base delay in ms before retrying (will increase exponentially)
  baseRetryDelay: 1000,

  // Maximum delay in ms between retries
  maxRetryDelay: 10000,

  // Request timeout in ms
  requestTimeout: 30000,

  // Whether to automatically retry idempotent requests
  autoRetryIdempotent: true,

  // Whether to queue offline requests for later
  queueOfflineRequests: true,

  // Maximum number of requests to queue when offline
  maxQueueSize: 50,

  // Whether to show reconnection notifications
  showReconnectionNotifications: true,
};

/**
 * Error Handling Configuration
 */
export const ERROR_CONFIG = {
  // Whether to attempt recovery from non-critical errors
  autoRecovery: true,

  // Whether to log all errors to the console
  consoleLogging: true,

  // Whether to send critical errors to the server
  serverLogging: true,

  // Maximum number of recovery attempts before giving up
  maxRecoveryAttempts: 3,

  // Whether to show error notifications to users
  showErrorNotifications: true,

  // Whether to collect error analytics
  collectErrorAnalytics: true,

  // Maximum number of errors to store in memory
  maxErrorsInMemory: 100,
};

/**
 * Freeze Detection Configuration
 */
export const FREEZE_CONFIG = {
  // Interval in ms for checking UI responsiveness - increased to reduce frequency
  checkInterval: 15000,

  // Threshold in ms for considering the UI frozen - increased to be less sensitive
  freezeThreshold: 8000,

  // Whether to attempt recovery from freezes - disabled to prevent unnecessary interventions
  autoRecovery: false,

  // Whether to log freeze events - keeping for diagnostic purposes
  logFreezeEvents: true,

  // Whether to show notifications about freeze events - disabled to improve UX
  showFreezeNotifications: false,
};

/**
 * Component Error Boundary Configuration
 */
export const ERROR_BOUNDARY_CONFIG = {
  // Whether to show detailed error information (dev only)
  showDetails: import.meta.env.DEV,

  // Whether to attempt to recover automatically
  autoRecovery: true,

  // Maximum number of recovery attempts
  maxRecoveryAttempts: 3,

  // Whether to log errors to the console
  consoleLogging: true,

  // Whether to fall back to a simplified UI on error
  useFallbackUI: true,

  // Whether to isolate errors to individual components when possible
  isolateErrors: true,
};

/**
 * Logging Configuration
 */
export const LOGGING_CONFIG = {
  // Minimum log level to record
  minLevel: import.meta.env.DEV ? 'debug' : 'warn',

  // Whether to include timestamps in logs
  includeTimestamp: true,

  // Whether to persist logs to localStorage
  persistLogs: true,

  // Maximum number of log entries to persist
  maxPersistedLogs: 1000,

  // Whether to batch logs when sending to server
  batchServerLogs: true,

  // Batch size for server logs
  serverLogBatchSize: 50,

  // Whether to log performance metrics
  logPerformanceMetrics: true,
};

/**
 * Storage Resilience Configuration
 */
export const STORAGE_CONFIG = {
  // Whether to back up storage data to memory
  backupToMemory: true,

  // Whether to validate storage data on read
  validateOnRead: false,

  // Whether to compress large storage items
  compressLargeItems: true,

  // Size threshold in bytes for compression
  compressionThreshold: 10000,

  // Maximum size in bytes for individual storage items
  maxItemSize: 5000000, // 5MB

  // Whether to automatically partition large items
  autoPartition: true,

  // Whether to retry failed storage operations
  retryFailedOperations: true,

  // Maximum number of retry attempts
  maxRetries: 3,
};

/**
 * Cross-Tab Communication Configuration
 */
export const CROSS_TAB_CONFIG = {
  // Whether to use SharedWorkers for cross-tab communication when available
  useSharedWorker: true,

  // Fallback to localStorage for browsers without SharedWorker support
  fallbackToLocalStorage: true,

  // Heartbeat interval in ms for detecting disconnected tabs
  heartbeatInterval: 10000,

  // Whether to elect a leader tab for coordinated actions
  useLeaderElection: true,

  // Whether to sync state between tabs
  syncStateBetweenTabs: true,

  // Types of data to sync between tabs
  syncTypes: ['preferences', 'authentication', 'errors'],
};

/**
 * Global Stability Configuration
 */
export const STABILITY_CONFIG = {
  // Whether to enable all stability features
  enabled: true,

  // Whether to enable detailed error information (for development)
  showDetailedErrors: import.meta.env.DEV,

  // Whether to show stability status indicators
  showStatusIndicators: import.meta.env.DEV,

  // Environment-specific settings
  environment: import.meta.env.MODE || 'development',

  // Whether to collect and report stability metrics
  collectMetrics: true,

  // Application version (for error tracking)
  appVersion: import.meta.env.VITE_APP_VERSION || '1.0.0',

  // Whether to enable maintenance mode automatically when too many errors occur
  autoMaintenanceMode: true,

  // Threshold for number of critical errors before triggering maintenance mode
  maintenanceModeErrorThreshold: 10,

  // Whether to enable all diagnostic tools
  enableDiagnosticTools: import.meta.env.DEV,
};

export default {
  MEMORY_CONFIG,
  NETWORK_CONFIG,
  ERROR_CONFIG,
  FREEZE_CONFIG,
  ERROR_BOUNDARY_CONFIG,
  LOGGING_CONFIG,
  STORAGE_CONFIG,
  CROSS_TAB_CONFIG,
  STABILITY_CONFIG,
};
