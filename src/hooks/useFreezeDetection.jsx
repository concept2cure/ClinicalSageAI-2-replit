/**
 * Freeze Detection Hook
 *
 * This hook provides freeze detection capabilities to React components,
 * allowing them to register as critical components and detect freezes.
 *
 * CRITICAL STABILITY COMPONENT - DO NOT MODIFY WITHOUT THOROUGH TESTING
 */

import { useEffect, useRef, useCallback } from 'react';
import freezeDetection from '@/utils/freezeDetection';

/**
 * Hook for integrating freeze detection in React components
 *
 * @param {Object} options Hook configuration
 * @param {string} options.componentName Name of the component (for tracking)
 * @param {boolean} options.isCritical Whether this is a critical component that should be monitored
 * @param {function} options.onFreezeDetected Callback when a freeze is detected
 * @returns {Object} Freeze detection utilities
 */
export default function useFreezeDetection({
  componentName = 'UnnamedComponent',
  isCritical = false,
  onFreezeDetected = null,
} = {}) {
  // Use a ref to store the heartbeat interval
  const heartbeatIntervalRef = useRef(null);
  const lastHeartbeatRef = useRef(Date.now());

  // Register this component as critical if needed
  useEffect(() => {
    if (isCritical) {
      freezeDetection.registerCriticalComponent(componentName);

      // Set up heartbeat to update component's timestamp
      heartbeatIntervalRef.current = setInterval(() => {
        // Update component's timestamp in the freeze detection system
        freezeDetection.updateCriticalComponent(componentName);

        // Check for local component freeze
        const now = Date.now();
        const elapsed = now - lastHeartbeatRef.current;

        // If more than 2 seconds have passed, this component might be frozen
        if (elapsed > 2000 && onFreezeDetected) {
          onFreezeDetected(elapsed);
        }

        lastHeartbeatRef.current = now;
      }, 1000);
    }

    // Cleanup when component unmounts
    return () => {
      if (isCritical) {
        freezeDetection.unregisterCriticalComponent(componentName);

        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }
      }
    };
  }, [componentName, isCritical, onFreezeDetected]);

  /**
   * Manually update the component's heartbeat
   * Call this in your component's render or useEffect to indicate activity
   */
  const updateHeartbeat = useCallback(() => {
    if (isCritical) {
      freezeDetection.updateCriticalComponent(componentName);
      lastHeartbeatRef.current = Date.now();
    }
  }, [componentName, isCritical]);

  /**
   * Register this component as critical after it's already mounted
   */
  const registerAsCritical = useCallback(() => {
    freezeDetection.registerCriticalComponent(componentName);

    // Setup heartbeat if not already set up
    if (!heartbeatIntervalRef.current) {
      heartbeatIntervalRef.current = setInterval(() => {
        freezeDetection.updateCriticalComponent(componentName);
        lastHeartbeatRef.current = Date.now();
      }, 1000);
    }
  }, [componentName]);

  /**
   * Unregister this component as critical
   */
  const unregisterAsCritical = useCallback(() => {
    freezeDetection.unregisterCriticalComponent(componentName);

    // Clear heartbeat
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, [componentName]);

  return {
    updateHeartbeat,
    registerAsCritical,
    unregisterAsCritical,
  };
}
