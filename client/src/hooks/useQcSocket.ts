// Toast notification system upgraded to SecureToast

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../App';

// QC Event interface for WebSocket messages
export interface QcEvent {
  id: string;
  status: 'passed' | 'failed' | 'running';
  errors?: string[];
  warnings?: string[];
  module?: string;
}

/**
 * Custom hook for managing QC WebSocket connection and document statuses
 *
 * @param documentIds Array of document IDs to track
 * @returns Object containing QC states and helper functions
 */
export const useQcSocket = (documentIds: string[]) => {
  // Store QC status for each document
  const [qcStatus, setQcStatus] = useState<Record<string, QcEvent>>({});
  // Track connection status
  const [socketStatus, setSocketStatus] = useState<'connecting' | 'connected' | 'disconnected'>(
    'disconnected'
  );
  // Reference to WebSocket
  const [socket, setSocket] = useState<WebSocket | null>(null);
  // Retry counter for connection attempts
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 5;

  // Function to establish WebSocket connection
  const connectSocket = useCallback(() => {
    if (socket !== null) return; // Don't connect if already connected

    try {
      setSocketStatus('connecting');

      // Setup WebSocket with dynamic protocol
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/qc`;

      console.log('Connecting to QC WebSocket:', wsUrl);
      const newSocket = new WebSocket(wsUrl);

      // WebSocket event handlers
      newSocket.onopen = () => {
        console.log('QC WebSocket connected');
        setSocketStatus('connected');
        setRetryCount(0); // Reset retry counter on successful connection

        // Subscribe to QC updates for the specified document IDs
        if (documentIds.length > 0) {
          newSocket.send(
            JSON.stringify({
              action: 'subscribe',
              document_ids: documentIds,
            })
          );
        }
      };

      newSocket.onmessage = event => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'qc_update') {
            // Update the QC status for the document
            setQcStatus(prev => ({
              ...prev,
              [data.id]: {
                id: data.id,
                status: data.status,
                errors: data.errors || [],
                warnings: data.warnings || [],
                module: data.module,
              },
            }));

            // Show toast notification for status changes
            if (data.status === 'passed') {
              useToast().showToast(`Document ${data.id.substring(0, 8, 'success')}... passed QC`);
            } else if (data.status === 'failed') {
              useToast().showToast(
                `Document ${data.id.substring(0, 8, 'error')}... failed QC: ${data.errors?.length || 0} errors`
              );
            }
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };

      newSocket.onclose = () => {
        console.log('QC WebSocket connection closed');
        setSocketStatus('disconnected');
        setSocket(null);

        // Implement reconnection with exponential backoff
        if (retryCount < MAX_RETRIES) {
          const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
          console.log(`Reconnecting in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);

          setTimeout(() => {
            setRetryCount(prevCount => prevCount + 1);
            connectSocket();
          }, delay);
        } else {
          console.error('Max WebSocket reconnection attempts reached');
          useToast().showToast('Connection to QC service lost. Please refresh the page.', 'error');
        }
      };

      newSocket.onerror = error => {
        console.error('QC WebSocket error:', error);
        // Let onclose handle reconnection
      };

      setSocket(newSocket);
    } catch (error) {
      console.error('Failed to connect to QC WebSocket:', error);
      setSocketStatus('disconnected');
    }
  }, [documentIds, retryCount, socket]);

  // Connect when the component mounts
  useEffect(() => {
    connectSocket();

    // Cleanup function to close the WebSocket when component unmounts
    return () => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  }, [connectSocket]);

  // When document IDs change, resubscribe
  useEffect(() => {
    if (socket && socket.readyState === WebSocket.OPEN && documentIds.length > 0) {
      socket.send(
        JSON.stringify({
          action: 'subscribe',
          document_ids: documentIds,
        })
      );
    }
  }, [documentIds, socket]);

  // Function to manually trigger QC for a document
  const triggerQc = useCallback(
    (documentId: string) => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            action: 'trigger_qc',
            document_id: documentId,
          })
        );

        // Set initial running status
        setQcStatus(prev => ({
          ...prev,
          [documentId]: {
            id: documentId,
            status: 'running',
          },
        }));

        return true;
      }
      return false;
    },
    [socket]
  );

  // Function to trigger QC for multiple documents (bulk)
  const triggerBulkQc = useCallback(
    (ids: string[]) => {
      if (socket && socket.readyState === WebSocket.OPEN && ids.length > 0) {
        socket.send(
          JSON.stringify({
            action: 'trigger_bulk_qc',
            document_ids: ids,
          })
        );

        // Set initial running status for all
        const updates: Record<string, QcEvent> = {};
        ids.forEach(id => {
          updates[id] = {
            id,
            status: 'running',
          };
        });

        setQcStatus(prev => ({
          ...prev,
          ...updates,
        }));

        return true;
      }
      return false;
    },
    [socket]
  );

  // Function to get QC status for a specific document
  const getDocumentQcStatus = useCallback(
    (documentId: string): QcEvent | undefined => {
      return qcStatus[documentId];
    },
    [qcStatus]
  );

  return {
    socketStatus,
    qcStatus,
    triggerQc,
    triggerBulkQc,
    getDocumentQcStatus,
    reconnect: connectSocket,
  };
};

export default useQcSocket;
