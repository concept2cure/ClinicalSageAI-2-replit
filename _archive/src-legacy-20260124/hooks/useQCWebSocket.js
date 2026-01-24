import { useState, useEffect, useCallback } from 'react';

/**
 * A hook for managing WebSocket connections for QC updates
 * @param {string} region - The regulatory region (FDA, EMA, PMDA)
 * @param {Function} onMessage - Callback function for handling messages
 * @returns {{ send: Function, status: string }} - WebSocket sender and connection status
 */
export function useQCWebSocket(region, onMessage) {
  const [socket, setSocket] = useState(null);
  const [status, setStatus] = useState('disconnected');

  // Set up WebSocket connection
  useEffect(() => {
    // Determine protocol based on the current connection
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    console.log(`Connecting to QC WebSocket (${region}):`, wsUrl);

    // Create new WebSocket connection
    const ws = new WebSocket(wsUrl);

    // Set up event handlers
    ws.onopen = () => {
      console.log(`QC WebSocket connected for ${region}`);
      setStatus('connected');

      // Send initial message to set region
      ws.send(
        JSON.stringify({
          type: 'SET_REGION',
          region: region,
        })
      );
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
      setStatus('error');
    };

    ws.onclose = () => {
      console.log('QC WebSocket closed');
      setStatus('disconnected');
    };

    // Store the WebSocket instance
    setSocket(ws);

    // Clean up function
    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [region, onMessage]);

  // Send message function
  const send = useCallback(
    data => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
        return true;
      }
      console.warn('WebSocket not connected, cannot send message');
      return false;
    },
    [socket]
  );

  return { send, status };
}

export default useQCWebSocket;
