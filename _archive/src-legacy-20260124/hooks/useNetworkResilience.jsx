/**
 * Network Resilience Hook
 *
 * This hook provides network status monitoring and resilient fetch operations
 * with automatic retries, offline queueing, and error recovery.
 *
 * CRITICAL STABILITY COMPONENT - DO NOT MODIFY WITHOUT THOROUGH TESTING
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { NETWORK_CONFIG } from '@/config/stabilityConfig';

/**
 * Hook for monitoring network status and providing resilient API operations
 *
 * @param {Object} options - Hook configuration
 * @param {number} options.maxRetries - Maximum retry attempts (default from config)
 * @param {number} options.baseRetryDelay - Base delay in ms between retries (default from config)
 * @param {number} options.maxRetryDelay - Maximum delay in ms between retries (default from config)
 * @param {boolean} options.queueOfflineRequests - Whether to queue requests when offline (default from config)
 * @returns {Object} - Network status and resilient fetch operations
 */
export function useNetworkResilience(options = {}) {
  // Extract configuration with fallbacks to global config
  const {
    maxRetries = NETWORK_CONFIG.maxRetries,
    baseRetryDelay = NETWORK_CONFIG.baseRetryDelay,
    maxRetryDelay = NETWORK_CONFIG.maxRetryDelay,
    queueOfflineRequests = NETWORK_CONFIG.queueOfflineRequests,
  } = options;

  // Network status
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Request tracking
  const [pendingRequests, setPendingRequests] = useState(0);
  const [failedRequests, setFailedRequests] = useState(0);
  const [succeededRequests, setSucceededRequests] = useState(0);

  // Request queue for offline mode
  const requestQueue = useRef([]);

  // Function to perform a fetch with automatic retries
  const resilientFetch = useCallback(
    async (url, options = {}) => {
      // Increment pending requests
      setPendingRequests(prev => prev + 1);

      // If we're offline and queueing is enabled, queue the request
      if (!navigator.onLine && queueOfflineRequests) {
        return new Promise((resolve, reject) => {
          // Generate a unique request ID
          const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

          requestQueue.current.push({
            id: requestId,
            url,
            options,
            resolve,
            reject,
            timestamp: Date.now(),
          });

          // If the request has a timeout option, honor it
          if (options.timeout) {
            setTimeout(() => {
              // Find and remove the queued request by its unique ID
              const index = requestQueue.current.findIndex(req => req.id === requestId);

              if (index !== -1) {
                const request = requestQueue.current.splice(index, 1)[0];
                request.reject(new Error('Request timed out while queued offline'));

                // Update stats
                setPendingRequests(prev => Math.max(0, prev - 1));
                setFailedRequests(prev => prev + 1);
              }
            }, options.timeout);
          }
        });
      }

      // Attempt the fetch with retries
      let attempt = 0;
      let lastError = null;

      while (attempt <= maxRetries) {
        try {
          const response = await fetch(url, options);

          // Check if the request was successful
          if (response.ok) {
            // Update stats
            setPendingRequests(prev => Math.max(0, prev - 1));
            setSucceededRequests(prev => prev + 1);

            return response;
          }

          // If we get here, the response was not ok
          lastError = new Error(`HTTP error ${response.status}: ${response.statusText}`);
          lastError.response = response;

          // Check if we should retry based on status code
          const shouldRetry = [408, 429, 500, 502, 503, 504].includes(response.status);

          if (!shouldRetry || attempt >= maxRetries) {
            break;
          }
        } catch (error) {
          lastError = error;

          // Network errors should be retried if we're online
          if (!navigator.onLine || attempt >= maxRetries) {
            break;
          }
        }

        // Increment attempt counter
        attempt++;

        // If we're going to retry, calculate the delay with exponential backoff
        if (attempt <= maxRetries) {
          const delay = Math.min(maxRetryDelay, baseRetryDelay * Math.pow(2, attempt - 1));

          // Add some jitter to avoid request storms
          const jitter = delay * 0.2 * Math.random();
          const finalDelay = delay + jitter;

          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, finalDelay));
        }
      }

      // If we get here, we've exhausted our retries or hit a non-retryable error
      setPendingRequests(prev => Math.max(0, prev - 1));
      setFailedRequests(prev => prev + 1);

      // If we're offline and queueing is enabled, queue the request for later
      if (!navigator.onLine && queueOfflineRequests) {
        return new Promise((resolve, reject) => {
          // Generate a unique request ID
          const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

          requestQueue.current.push({
            id: requestId,
            url,
            options,
            resolve,
            reject,
            timestamp: Date.now(),
          });
        });
      }

      throw lastError;
    },
    [maxRetries, baseRetryDelay, maxRetryDelay, queueOfflineRequests]
  );

  // Process the request queue when we come back online
  const processQueue = useCallback(async () => {
    if (requestQueue.current.length === 0) {
      return;
    }

    console.log(`Processing ${requestQueue.current.length} queued requests`);

    // Create a copy of the queue and clear it
    const queueCopy = [...requestQueue.current];
    requestQueue.current = [];

    // Process each request
    for (const request of queueCopy) {
      try {
        console.log(`Processing queued request with ID: ${request.id}`);
        // Use resilientFetch instead of direct fetch to get retry benefits
        // but we need to avoid re-queueing, so we'll use a direct fetch inside
        const response = await fetch(request.url, request.options);
        console.log(`Successfully processed queued request ID: ${request.id}`);
        request.resolve(response);
        setSucceededRequests(prev => prev + 1);
      } catch (error) {
        console.error(`Error processing queued request with ID: ${request.id}`, error);
        request.reject(error);
        setFailedRequests(prev => prev + 1);
      }
    }
  }, []);

  // Set up event listeners for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);

      // Process queued requests when we come back online
      if (queueOfflineRequests) {
        processQueue();
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [queueOfflineRequests, processQueue]);

  // Return the network status and resilient fetch function
  return {
    isOnline,
    pendingRequests,
    failedRequests,
    succeededRequests,
    requestQueue: requestQueue.current,
    resilientFetch,
  };
}
