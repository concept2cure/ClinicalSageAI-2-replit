import { useState, useEffect, useRef, useCallback } from 'react';
import { getWsUrl } from '../utils/getWsUrl';

/**
 * Connection status types for the WebSocket connection
 */
export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'reconnecting';

/**
 * QC WebSocket Hook
 * Manages a WebSocket connection for real-time QC updates
 *
 * @param region - The regulatory region to subscribe to ('FDA', 'EMA', 'PMDA')
 * @param onMsg - Callback function for handling incoming messages
 * @returns Object with send method and connection status
 */
export const useQCWebSocket = (region = 'FDA', onMsg: (msg: any) => void) => {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const socket = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY = 3000;

  // Send function that handles WebSocket availability
  const send = useCallback((data: any): boolean => {
    if (socket.current && socket.current.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify(data));
      return true;
    } else {
      console.warn('[QC WebSocket] Cannot send, socket not connected');
      return false;
    }
  }, []);

  // Handle socket reconnection logic
  const reconnect = useCallback(() => {
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[QC WebSocket] Max reconnection attempts reached');
      setStatus('disconnected');
      return;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectAttemptsRef.current += 1;
      setStatus('reconnecting');
      initSocket();
    }, RECONNECT_DELAY);
  }, []);

  // Initialize WebSocket connection
  const initSocket = useCallback(() => {
    if (socket.current) {
      socket.current.close();
    }

    try {
      // Use origin-aware WebSocket URL builder
      const wsUrl = getWsUrl('/ws/qc');
      socket.current = new WebSocket(wsUrl);

      socket.current.onopen = () => {
        console.log(`[QC WebSocket] Connected to ${region} QC service`);
        setStatus('connected');
        reconnectAttemptsRef.current = 0;

        // Register for region-specific updates
        if (socket.current && socket.current.readyState === WebSocket.OPEN) {
          socket.current.send(
            JSON.stringify({
              action: 'subscribe',
              region: region,
            })
          );
        }
      };

      socket.current.onmessage = event => {
        try {
          const data = JSON.parse(event.data);

          // Handle ping/pong for keeping connection alive
          if (data.type === 'ping') {
            if (socket.current && socket.current.readyState === WebSocket.OPEN) {
              socket.current.send(
                JSON.stringify({
                  type: 'pong',
                  timestamp: new Date().toISOString(),
                })
              );
            }
            return;
          }

          onMsg(data);
        } catch (error) {
          console.error('[QC WebSocket] Error parsing message:', error);
        }
      };

      socket.current.onclose = event => {
        console.log(`[QC WebSocket] Connection closed: ${event.code} ${event.reason}`);
        setStatus('disconnected');
        reconnect();
      };

      socket.current.onerror = error => {
        console.error('[QC WebSocket] Error:', error);
        setStatus('disconnected');
      };
    } catch (error) {
      console.error('[QC WebSocket] Setup error:', error);
      setStatus('disconnected');
      reconnect();
    }
  }, [onMsg, reconnect, region]);

  // Set up connection and cleanup on unmount
  useEffect(() => {
    initSocket();

    // Cleanup function
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      if (socket.current) {
        socket.current.close();
      }
    };
  }, [region, initSocket]);

  return { status, send };
};

export default useQCWebSocket;
