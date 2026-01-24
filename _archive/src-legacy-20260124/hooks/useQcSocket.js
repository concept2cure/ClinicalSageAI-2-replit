import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * React hook for connecting to the QC WebSocket service
 * Features:
 * - Automatic connection
 * - Authentication via token
 * - Message handling
 * - Reconnection logic with exponential backoff
 * - Connection status tracking
 *
 * @param {Object} options Configuration options
 * @param {string} options.token Optional authentication token
 * @param {Function} options.onQcUpdate Callback for QC update events
 * @param {boolean} options.autoConnect Whether to connect automatically (default: true)
 * @returns {Object} Socket management interface
 */
export default function useQcSocket({ token = null, onQcUpdate = null, autoConnect = true }) {
  const [status, setStatus] = useState('disconnected');
  const [error, setError] = useState(null);
  const socket = useRef(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimeout = useRef(null);
  const maxReconnectAttempts = 5;

  // Connect to the WebSocket server
  const connect = useCallback(() => {
    if (socket.current?.readyState === WebSocket.OPEN) return;

    try {
      // Clear any pending reconnection attempts
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = null;
      }

      setStatus('connecting');

      // Determine WebSocket URL and protocol
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const baseUrl = `${protocol}//${window.location.host}/ws/qc`;
      const url = token ? `${baseUrl}?token=${encodeURIComponent(token)}` : baseUrl;

      // Create WebSocket connection
      socket.current = new WebSocket(url);

      // Set up event handlers
      socket.current.onopen = () => {
        setStatus('connected');
        setError(null);
        reconnectAttempts.current = 0;
        console.log('QC WebSocket connected');
      };

      socket.current.onclose = event => {
        setStatus('disconnected');
        console.log(`QC WebSocket disconnected: ${event.code} ${event.reason}`);

        // Attempt to reconnect with exponential backoff
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 30000);
          console.log(
            `Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`
          );

          reconnectTimeout.current = setTimeout(() => {
            reconnectAttempts.current += 1;
            connect();
          }, delay);
        } else {
          setError('Maximum reconnection attempts reached');
        }
      };

      socket.current.onerror = event => {
        console.error('QC WebSocket error:', event);
        setError('Connection error');
      };

      socket.current.onmessage = event => {
        try {
          const data = JSON.parse(event.data);

          // Handle different message types
          switch (data.type) {
            case 'qc':
              if (onQcUpdate) {
                onQcUpdate(data);
              }
              break;

            case 'ping':
              // Respond to heartbeat
              if (socket.current?.readyState === WebSocket.OPEN) {
                socket.current.send(JSON.stringify({ type: 'pong' }));
              }
              break;

            case 'connected':
              console.log('QC WebSocket connection confirmed:', data.message);
              break;

            default:
              console.log('Unknown message type:', data);
          }
        } catch (err) {
          console.error('Error processing WebSocket message:', err);
        }
      };
    } catch (err) {
      setStatus('error');
      setError(err.message);
      console.error('Error establishing WebSocket connection:', err);
    }
  }, [token, onQcUpdate]);

  // Disconnect from the WebSocket server
  const disconnect = useCallback(() => {
    if (socket.current) {
      socket.current.close();
      socket.current = null;
    }

    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }

    setStatus('disconnected');
  }, []);

  // Send a message to the WebSocket server
  const sendMessage = useCallback(data => {
    if (socket.current?.readyState === WebSocket.OPEN) {
      const message = typeof data === 'string' ? data : JSON.stringify(data);
      socket.current.send(message);
      return true;
    }
    return false;
  }, []);

  // Auto-connect on mount if enabled
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    // Clean up on unmount
    return () => {
      disconnect();
    };
  }, [connect, disconnect, autoConnect]);

  return {
    status,
    error,
    connect,
    disconnect,
    sendMessage,
    isConnected: status === 'connected',
  };
}
