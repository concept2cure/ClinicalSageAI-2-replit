/**
 * Stability Enabled Layout
 *
 * This component wraps the application in all stability features, providing
 * a comprehensive stability solution that includes error boundaries,
 * memory management, network resilience, and cross-tab coordination.
 *
 * CRITICAL STABILITY COMPONENT - DO NOT MODIFY WITHOUT THOROUGH TESTING
 */

import React, { useState, useEffect } from 'react';
import ErrorBoundary from '@/ErrorBoundary';
import { useHealthMonitor } from '@/hooks/useHealthMonitor';
import { useNetworkResilience } from '@/hooks/useNetworkResilience';
import errorAnalytics from '@/utils/errorAnalytics';
import storageResilience from '@/utils/storageResilience';
import memoryManagement from '@/utils/memoryManagement';
import freezeDetection from '@/utils/freezeDetection';
import { STABILITY_CONFIG } from '@/config/stabilityConfig';
import { AlertTriangle, Wifi, WifiOff, X } from 'lucide-react';

/**
 * Main layout component with all stability features
 */
export default function StabilityEnabledLayout({ children }) {
  // Initialize all stability features on first render
  useEffect(() => {
    console.log('🛡️ Initializing all stability features...');

    // Initialize error analytics
    const analyticsInfo = errorAnalytics.initErrorAnalytics();
    console.log('Error analytics initialized with session ID:', analyticsInfo.sessionId);

    // Initialize storage resilience
    if (typeof storageResilience.initStorageResilience === 'function') {
      storageResilience
        .initStorageResilience()
        .then(status => {
          console.log('Storage resilience initialized:', status);
        })
        .catch(err => {
          console.error('Failed to initialize storage resilience:', err);
        });
    } else {
      console.warn('Storage resilience initialization function not available, using defaults');
    }

    // Initialize memory management monitoring
    memoryManagement.setupMemoryMonitoring();
    console.log('Memory management initialized');

    // Initialize freeze detection
    freezeDetection.initFreezeDetection();
    console.log('Freeze detection initialized');

    // Make these utilities available globally for emergency debugging
    window.stabilityUtils = {
      errorAnalytics,
      storageResilience,
      memoryManagement,
      freezeDetection,
    };

    return () => {
      // Cleanup when unmounting (though this should never happen in practice)
      freezeDetection.cleanupFreezeDetection();
    };
  }, []);

  // Network resilience for API calls
  const { isOnline, pendingRequests, failedRequests } = useNetworkResilience();

  // Cross-tab health monitoring
  const {
    isConnected: isHealthMonitorConnected,
    tabCount,
    healthStatus,
    isMaintenanceMode,
    markRecoveryComplete,
  } = useHealthMonitor({
    onRecoveryRequest: handleRecoveryRequest,
    onMaintenanceModeChange: handleMaintenanceModeChange,
  });

  // State for notifications
  const [notifications, setNotifications] = useState([]);

  /**
   * Handle recovery request from health monitor
   */
  function handleRecoveryRequest(request) {
    console.log('Recovery requested:', request);

    // If we're the recovery leader, coordinate the recovery
    if (request.isLeader) {
      console.log('This tab is the recovery leader');

      // Perform recovery actions
      performRecoveryActions();

      // Mark recovery as complete
      setTimeout(() => {
        markRecoveryComplete();
      }, 5000);
    }
    // Otherwise, follow the recovery process
    else {
      // Perform follow recovery actions
      performFollowRecoveryActions();
    }

    // Show notification
    addNotification({
      type: 'warning',
      message: `Recovery ${request.isLeader ? 'led' : 'following'} for reason: ${request.reason}`,
      duration: 10000,
    });
  }

  /**
   * Handle maintenance mode change from health monitor
   */
  function handleMaintenanceModeChange(change) {
    // Show notification
    addNotification({
      type: change.enabled ? 'warning' : 'info',
      message: change.enabled
        ? `Maintenance mode enabled: ${change.reason}`
        : 'Maintenance mode disabled',
      duration: 10000,
    });
  }

  /**
   * Add a notification
   */
  function addNotification(notification) {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, ...notification }]);

    // Auto-remove after duration
    if (notification.duration) {
      setTimeout(() => {
        removeNotification(id);
      }, notification.duration);
    }
  }

  /**
   * Remove a notification
   */
  function removeNotification(id) {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }

  /**
   * Perform recovery actions as the recovery leader
   */
  function performRecoveryActions() {
    // Clear caches and free memory
    memoryManagement.clearAllComponentCaches();

    // Attempt garbage collection
    if (window.gc) {
      window.gc();
    }

    // Clear error states
    window.localStorage.removeItem('freeze_logs');
    window.localStorage.removeItem('component_errors');

    console.log('Recovery actions completed');
  }

  /**
   * Perform recovery actions as a follower
   */
  function performFollowRecoveryActions() {
    // Similar to leader but less aggressive
    memoryManagement.clearAllComponentCaches();

    console.log('Follow recovery actions completed');
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col relative">
        {/* Offline indicator */}
        {!isOnline && (
          <div className="bg-amber-50 border-b border-amber-200 py-2 px-4 text-amber-800 flex items-center justify-center">
            <WifiOff className="h-4 w-4 mr-2" />
            <span>You are currently offline. Some features may be unavailable.</span>
          </div>
        )}

        {/* Maintenance mode indicator */}
        {isMaintenanceMode && (
          <div className="bg-blue-50 border-b border-blue-200 py-2 px-4 text-blue-800 flex items-center justify-center">
            <AlertTriangle className="h-4 w-4 mr-2" />
            <span>Maintenance mode is active. Some features may be temporarily unavailable.</span>
          </div>
        )}

        {/* Main content */}
        <div className="flex-1">{children}</div>

        {/* Status indicators (only in development) */}
        {STABILITY_CONFIG.showDetailedErrors && (
          <div className="fixed bottom-4 right-4 flex flex-col gap-2 items-end z-50">
            {/* Network status */}
            <div
              className={`flex items-center px-3 py-1 rounded-full text-sm ${
                isOnline ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
              }`}
            >
              {isOnline ? <Wifi className="h-4 w-4 mr-1" /> : <WifiOff className="h-4 w-4 mr-1" />}
              <span>{isOnline ? 'Online' : 'Offline'}</span>

              {pendingRequests > 0 && (
                <span className="ml-2 text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full">
                  {pendingRequests} pending
                </span>
              )}

              {failedRequests > 0 && (
                <span className="ml-2 text-xs bg-red-200 text-red-800 px-2 py-0.5 rounded-full">
                  {failedRequests} failed
                </span>
              )}
            </div>

            {/* Health monitor status */}
            {isHealthMonitorConnected && (
              <div className="flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800">
                <span>
                  {tabCount} {tabCount === 1 ? 'tab' : 'tabs'} connected
                </span>
              </div>
            )}
          </div>
        )}

        {/* Notifications */}
        <div className="fixed top-4 right-4 flex flex-col gap-2 items-end z-50 max-w-md">
          {notifications.map(notification => (
            <div
              key={notification.id}
              className={`flex items-center justify-between px-4 py-2 rounded-md shadow-md text-sm ${
                notification.type === 'warning'
                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                  : notification.type === 'error'
                    ? 'bg-red-50 text-red-800 border border-red-200'
                    : 'bg-blue-50 text-blue-800 border border-blue-200'
              }`}
            >
              <span>{notification.message}</span>
              <button
                onClick={() => removeNotification(notification.id)}
                className="ml-3 text-gray-500 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </ErrorBoundary>
  );
}
