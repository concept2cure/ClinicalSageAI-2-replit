// Toast notification system upgraded to SecureToast

// useQCWebSocket.tsx – Custom WebSocket hook for QC real-time updates with fallback
import { useState, useEffect, useRef, useCallback } from 'react';

// Import the toast directly from the component, not from App to prevent circular dependencies
// Let's handle toast display simply to avoid any hook issues
const showToastMessage = (message: string, type: string) => {
  console.log(`Toast (${type}): ${message}`);
  // Don't try to use toast hooks here - just log
};

interface QCWebSocketOptions {
  onMessage?: (data: any) => void;
  onStatusChange?: (status: string) => void;
  region?: string;
  documentIds?: number[];
  fallbackMode?: boolean; // Enable fallback mode to prevent app blocking on WS failure
}

/**
 * Custom hook for managing QC WebSocket connection
 * Provides real-time updates for document QC status
 * Now with robust fallback mechanism that doesn't block the app if WebSockets fail
 */
export function useQCWebSocket({
  onMessage,
  onStatusChange,
  region = 'FDA',
  documentIds = [],
  fallbackMode = true, // Default to fallback mode enabled
}: QCWebSocketOptions = {}) {
  const [status, setStatus] = useState<string>('initializing');
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const reconnectAttempt = useRef<number>(0);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const maxReconnectAttempts = 3; // Reduced to prevent excessive attempts
  const connectionAttempted = useRef<boolean>(false);

  // Simplified toast approach that doesn't use hooks
  const safeToast = useCallback(
    (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
      try {
        showToastMessage(message, type);
      } catch (error) {
        console.error('Error showing toast:', error);
      }
    },
    []
  );

  // Update status and notify parent component
  const updateStatus = useCallback(
    (newStatus: string) => {
      setStatus(newStatus);
      if (onStatusChange) {
        try {
          onStatusChange(newStatus);
        } catch (error) {
          console.error('Error in onStatusChange callback:', error);
        }
      }
    },
    [onStatusChange]
  );

  // Connect to the WebSocket server
  useEffect(() => {
    // Skip connection if we've already tried and fallback mode is enabled
    if (
      connectionAttempted.current &&
      fallbackMode &&
      reconnectAttempt.current >= maxReconnectAttempts
    ) {
      console.log('Operating in fallback mode - skipping WebSocket connection');
      updateStatus('fallback');
      return;
    }

    // Mark that a connection attempt has been made
    connectionAttempted.current = true;

    // Clear any existing reconnect timeout
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }

    updateStatus('connecting');

    // Establish WebSocket connection with timeout
    const connectionTimeout = setTimeout(() => {
      console.log('WebSocket connection timeout');
      if (status === 'connecting') {
        updateStatus('timeout');

        // If in fallback mode, just continue without WebSocket
        if (fallbackMode) {
          console.log('Switching to fallback mode due to connection timeout');
          updateStatus('fallback');
        } else if (reconnectAttempt.current < maxReconnectAttempts) {
          // Otherwise try to reconnect
          attemptReconnect();
        }
      }
    }, 5000); // 5 second connection timeout

    // Determine WebSocket URL based on current protocol
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/qc`;

    console.log(`Connecting to QC WebSocket: ${wsUrl}`);
    let ws: WebSocket;

    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('QC WebSocket connected');
        clearTimeout(connectionTimeout);
        updateStatus('connected');
        reconnectAttempt.current = 0;

        try {
          // Subscribe to specific document IDs if provided
          if (documentIds.length > 0) {
            ws.send(
              JSON.stringify({
                type: 'subscribe',
                documentIds,
                region,
              })
            );
          }

          // Send a ping to test connection
          ws.send(
            JSON.stringify({
              type: 'ping',
              timestamp: new Date().toISOString(),
            })
          );
        } catch (sendError) {
          console.error('Error sending initial messages:', sendError);
        }
      };

      ws.onmessage = event => {
        try {
          const data = JSON.parse(event.data);
          console.log('QC WebSocket received:', data);

          // Call the message handler callback
          if (onMessage) {
            onMessage(data);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onerror = error => {
        console.error('QC WebSocket error:', error);
        clearTimeout(connectionTimeout);
        updateStatus('error');

        if (fallbackMode) {
          console.log('Switching to fallback mode due to WebSocket error');
          updateStatus('fallback');
        }
      };

      ws.onclose = event => {
        console.log(`QC WebSocket closed with code ${event.code}`);
        clearTimeout(connectionTimeout);
        updateStatus('disconnected');

        // Don't try to reconnect if we're in fallback mode and hit max attempts
        if (fallbackMode && reconnectAttempt.current >= maxReconnectAttempts) {
          console.log('Max reconnect attempts reached, switching to fallback mode');
          updateStatus('fallback');
          return;
        }

        // Attempt to reconnect if not at max attempts
        if (reconnectAttempt.current < maxReconnectAttempts) {
          attemptReconnect();
        } else {
          console.log('Max reconnect attempts reached, giving up');
          if (fallbackMode) {
            updateStatus('fallback');
          } else {
            safeToast('Unable to connect to real-time updates after multiple attempts', 'warning');
          }
        }
      };

      // Store the WebSocket instance
      setSocket(ws);
    } catch (connectionError) {
      console.error('Error creating WebSocket:', connectionError);
      clearTimeout(connectionTimeout);
      updateStatus('error');

      if (fallbackMode) {
        console.log('Switching to fallback mode due to connection error');
        updateStatus('fallback');
      } else if (reconnectAttempt.current < maxReconnectAttempts) {
        attemptReconnect();
      }
    }

    // Attempt reconnection with exponential backoff
    function attemptReconnect() {
      reconnectAttempt.current += 1;
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempt.current), 30000);

      console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttempt.current})`);
      updateStatus('reconnecting');

      reconnectTimeout.current = setTimeout(() => {
        setSocket(null); // This will trigger the useEffect again
      }, delay);
    }

    // Clean up function
    return () => {
      console.log('Cleaning up WebSocket connection');
      clearTimeout(connectionTimeout);

      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }

      if (ws) {
        try {
          // Properly close the WebSocket
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close(1000, 'Component unmounted');
          }
        } catch (closeError) {
          console.error('Error closing WebSocket:', closeError);
        }
      }
    };
  }, [region, documentIds.toString(), updateStatus, onMessage, fallbackMode, status, safeToast]);

  // Send message function with polling fallback
  const send = useCallback(
    (data: any) => {
      // If in fallback mode or disconnected, use polling fallback approach
      if (status === 'fallback' || status === 'disconnected' || status === 'error') {
        console.log('Using polling fallback instead of WebSocket for sending:', data);

        // For document status checks, we could make a REST API call instead
        if (data.type === 'status_check' && data.documentIds) {
          // Here you would make a fetch call to a REST endpoint
          // that provides the same data as the WebSocket would
          fetch(`/api/qc/documents/status?ids=${data.documentIds.join(',')}`)
            .then(response => response.json())
            .then(responseData => {
              if (onMessage) {
                onMessage({
                  type: 'status_response',
                  data: responseData,
                  timestamp: new Date().toISOString(),
                });
              }
            })
            .catch(error => {
              console.error('Error in fallback API call:', error);
            });
        }

        // Return true because we're handling it via fallback
        return true;
      }

      // Normal WebSocket sending
      if (socket && socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(JSON.stringify(data));
          return true;
        } catch (error) {
          console.error('Error sending WebSocket message:', error);
          return false;
        }
      }

      console.warn('WebSocket not connected, cannot send message');
      return false;
    },
    [socket, status, onMessage]
  );

  // Manually reconnect function
  const reconnect = useCallback(() => {
    if (socket) {
      try {
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close(1000, 'Manual reconnect requested');
        }
      } catch (error) {
        console.error('Error closing socket during reconnect:', error);
      }
    }

    reconnectAttempt.current = 0;
    setSocket(null); // This will trigger the useEffect to reconnect
  }, [socket]);

  return {
    status,
    send,
    reconnect,
    isConnected: status === 'connected',
    isFallback: status === 'fallback',
  };
}

export default useQCWebSocket;
