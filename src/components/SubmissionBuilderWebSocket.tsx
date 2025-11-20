// Toast notification system upgraded to SecureToast

import React, { useEffect, useRef } from 'react';
import { useToast } from '../App';

interface SubmissionBuilderWebSocketProps {
  onStatusChange: (status: string) => void;
  onQcUpdate: (data: any) => void;
}

/**
 * WebSocket component for the Submission Builder
 * Handles connection to QC WebSocket server, reconnection,
 * and processing of incoming messages
 */
const SubmissionBuilderWebSocket: React.FC<SubmissionBuilderWebSocketProps> = ({
  onStatusChange,
  onQcUpdate,
}) => {
  // WebSocket reference
  const ws = useRef<WebSocket | null>(null);
  // Reconnection attempts counter
  const reconnectAttempt = useRef(0);
  // Maximum reconnection attempts
  const maxReconnectAttempts = 5;

  useEffect(() => {
    // Connect to WebSocket server
    const connectWebSocket = () => {
      // Close existing connection if any
      if (ws.current) {
        ws.current.close();
      }

      // Determine WebSocket URL based on current protocol
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/qc`;

      try {
        // Create new WebSocket connection
        ws.current = new WebSocket(wsUrl);

        // Handle connection open
        ws.current.onopen = () => {
          console.log('WebSocket connected');
          onStatusChange('connected');
          reconnectAttempt.current = 0;
          useToast().showToast('QC WebSocket connected', 'success');
        };

        // Handle incoming messages
        ws.current.onmessage = event => {
          try {
            const data = JSON.parse(event.data);

            // Handle different message types
            switch (data.type) {
              case 'qc':
                // Handle QC update
                onQcUpdate(data);
                break;

              case 'ping':
                // Respond to heartbeat
                if (ws.current?.readyState === WebSocket.OPEN) {
                  ws.current.send(JSON.stringify({ type: 'pong' }));
                }
                break;

              case 'connected':
                // Initial connection confirmation
                console.log('WebSocket connection confirmed:', data.message);
                break;

              default:
                console.log('Unknown message type:', data);
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        // Handle connection close
        ws.current.onclose = event => {
          console.log(`WebSocket disconnected: ${event.code} ${event.reason}`);
          onStatusChange('disconnected');

          // Attempt to reconnect if not a clean close
          if (event.code !== 1000) {
            if (reconnectAttempt.current < maxReconnectAttempts) {
              const delay = Math.min(1000 * Math.pow(2, reconnectAttempt.current), 30000);
              console.log(
                `Reconnecting in ${delay}ms (attempt ${reconnectAttempt.current + 1}/${maxReconnectAttempts})`
              );

              setTimeout(() => {
                reconnectAttempt.current++;
                connectWebSocket();
              }, delay);
            } else {
              useToast().showToast('Could not reconnect to QC server', 'error');
            }
          }
        };

        // Handle connection errors
        ws.current.onerror = error => {
          console.error('WebSocket error:', error);
          onStatusChange('error');
        };
      } catch (error) {
        console.error('Error establishing WebSocket connection:', error);
        onStatusChange('error');
      }
    };

    // Initial connection
    connectWebSocket();

    // Clean up on unmount
    return () => {
      if (ws.current) {
        ws.current.close();
        ws.current = null;
      }
    };
  }, [onStatusChange, onQcUpdate]);

  // This component doesn't render anything
  return null;
};

export default SubmissionBuilderWebSocket;
