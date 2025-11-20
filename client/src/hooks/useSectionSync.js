import { useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';

/**
 * React hook for real-time section synchronization
 * Subscribes to SSE events for cross-document updates
 */
export function useSectionSync({
  projectId,
  leafId,
  onSectionUpdate,
  onConflict,
  enabled = true
}) {
  const [syncStatus, setSyncStatus] = useState('disconnected'); // disconnected, connecting, connected, syncing, error
  const [pendingUpdates, setPendingUpdates] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [connectionRetries, setConnectionRetries] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  const eventSourceRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const updateQueueRef = useRef([]);
  const versionMapRef = useRef(new Map());
  const { toast } = useToast();

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setSyncStatus('connecting');
      connectToSSE();
      toast({
        title: "Back Online",
        description: "Reconnecting to sync service...",
        duration: 3000
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus('disconnected');
      toast({
        title: "Offline Mode",
        description: "Changes will sync when connection is restored",
        variant: "warning",
        duration: 5000
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Connect to SSE endpoint
  const connectToSSE = useCallback(() => {
    if (!enabled || !projectId || !isOnline) return;

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setSyncStatus('connecting');
    const url = `/api/sections/subscribe/${projectId}`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    // Handle connection opened
    eventSource.onopen = () => {
      console.log('SSE connection established for project:', projectId);
      setSyncStatus('connected');
      setConnectionRetries(0);
      
      // Process any queued updates
      processUpdateQueue();
    };

    // Handle section update events
    eventSource.addEventListener('section.updated', (event) => {
      const data = JSON.parse(event.data);
      handleSectionUpdate(data);
    });

    // Handle conflict events
    eventSource.addEventListener('section.conflict', (event) => {
      const data = JSON.parse(event.data);
      handleSectionConflict(data);
    });

    // Handle sync status events
    eventSource.addEventListener('sync.status', (event) => {
      const data = JSON.parse(event.data);
      handleSyncStatus(data);
    });

    // Handle heartbeat
    eventSource.addEventListener('heartbeat', (event) => {
      setLastSyncTime(new Date().toISOString());
    });

    // Handle errors
    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      setSyncStatus('error');
      eventSource.close();
      eventSourceRef.current = null;

      // Implement exponential backoff for reconnection
      if (connectionRetries < 5 && isOnline) {
        const delay = Math.min(1000 * Math.pow(2, connectionRetries), 30000);
        setConnectionRetries(prev => prev + 1);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log(`Attempting to reconnect (retry ${connectionRetries + 1})...`);
          connectToSSE();
        }, delay);
      } else {
        setSyncStatus('disconnected');
        toast({
          title: "Sync Connection Lost",
          description: "Unable to maintain real-time sync. Please refresh the page.",
          variant: "destructive",
          duration: 0
        });
      }
    };

    return () => {
      eventSource.close();
    };
  }, [projectId, enabled, isOnline, connectionRetries]);

  // Handle incoming section updates
  const handleSectionUpdate = useCallback((data) => {
    const {
      sectionId,
      leafId: sourceLeafId,
      affectedDocuments,
      patch,
      author,
      timestamp
    } = data;

    // Check if this update affects our current document
    if (affectedDocuments.includes(leafId)) {
      setSyncStatus('syncing');
      
      // Check for version conflicts
      const currentVersion = versionMapRef.current.get(sectionId) || 0;
      if (patch.version && patch.version <= currentVersion) {
        // Potential conflict - queue for resolution
        handleSectionConflict({
          sectionId,
          localVersion: currentVersion,
          remoteVersion: patch.version,
          patch,
          author
        });
        return;
      }

      // Update version map
      versionMapRef.current.set(sectionId, patch.version || currentVersion + 1);

      // Add to pending updates
      const update = {
        id: `update_${Date.now()}`,
        sectionId,
        sourceLeafId,
        patch,
        author,
        timestamp,
        status: 'pending'
      };
      
      setPendingUpdates(prev => [...prev, update]);

      // Notify parent component
      if (onSectionUpdate) {
        onSectionUpdate(update);
      }

      // Show notification
      toast({
        title: "Document Updated",
        description: `${author.name} updated a linked section`,
        duration: 3000,
        action: {
          label: "View",
          onClick: () => {
            // Scroll to updated section
            const element = document.querySelector(`[data-section-id="${sectionId}"]`);
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });
              element.classList.add('highlight-update');
              setTimeout(() => element.classList.remove('highlight-update'), 3000);
            }
          }
        }
      });

      // Invalidate relevant queries
      queryClient.invalidateQueries(['/api/leaves', leafId]);
      queryClient.invalidateQueries(['/api/sections', sectionId]);

      // Mark as synced after a short delay
      setTimeout(() => {
        setSyncStatus('connected');
        setLastSyncTime(new Date().toISOString());
      }, 500);
    }
  }, [leafId, onSectionUpdate]);

  // Handle section conflicts
  const handleSectionConflict = useCallback((data) => {
    const conflict = {
      id: `conflict_${Date.now()}`,
      ...data,
      timestamp: new Date().toISOString()
    };

    setConflicts(prev => [...prev, conflict]);

    // Notify parent component
    if (onConflict) {
      onConflict(conflict);
    }

    // Show conflict notification
    toast({
      title: "Merge Conflict Detected",
      description: `Your changes conflict with ${data.author?.name || 'another user'}'s edits`,
      variant: "warning",
      duration: 0,
      action: {
        label: "Resolve",
        onClick: () => {
          // Trigger conflict resolution UI
          if (onConflict) {
            onConflict(conflict);
          }
        }
      }
    });
  }, [onConflict]);

  // Handle sync status updates
  const handleSyncStatus = useCallback((data) => {
    const { status, message, stats } = data;
    
    if (stats) {
      console.log('Sync statistics:', stats);
    }

    if (message) {
      toast({
        title: "Sync Status",
        description: message,
        duration: 3000
      });
    }
  }, []);

  // Process queued updates when connection is restored
  const processUpdateQueue = useCallback(() => {
    if (updateQueueRef.current.length === 0) return;

    const queue = [...updateQueueRef.current];
    updateQueueRef.current = [];

    queue.forEach(update => {
      // Re-send the update
      fetch('/api/sections/patch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(update)
      })
      .then(response => response.json())
      .then(data => {
        console.log('Queued update sent successfully:', data);
      })
      .catch(error => {
        console.error('Failed to send queued update:', error);
        // Re-queue if failed
        updateQueueRef.current.push(update);
      });
    });
  }, []);

  // Queue an update for sending
  const queueUpdate = useCallback((update) => {
    if (isOnline && syncStatus === 'connected') {
      // Send immediately if connected
      return sendUpdate(update);
    } else {
      // Queue for later
      updateQueueRef.current.push(update);
      toast({
        title: "Update Queued",
        description: "Your changes will sync when connection is restored",
        duration: 3000
      });
      return Promise.resolve({ queued: true });
    }
  }, [isOnline, syncStatus]);

  // Send an update to the server
  const sendUpdate = useCallback(async (update) => {
    try {
      const response = await fetch('/api/sections/patch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(update)
      });

      if (!response.ok) {
        throw new Error(`Failed to send update: ${response.statusText}`);
      }

      const data = await response.json();
      setLastSyncTime(new Date().toISOString());
      return data;
    } catch (error) {
      console.error('Error sending update:', error);
      // Queue for retry
      updateQueueRef.current.push(update);
      throw error;
    }
  }, []);

  // Resolve a conflict
  const resolveConflict = useCallback((conflictId, resolution) => {
    setConflicts(prev => prev.filter(c => c.id !== conflictId));
    
    // Send resolution to server
    return fetch('/api/sections/resolve-conflict', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conflictId,
        resolution
      })
    });
  }, []);

  // Clear pending updates
  const clearPendingUpdates = useCallback(() => {
    setPendingUpdates([]);
  }, []);

  // Initialize connection
  useEffect(() => {
    if (enabled && projectId && isOnline) {
      connectToSSE();
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [projectId, enabled, connectToSSE]);

  return {
    // Status
    syncStatus,
    isOnline,
    lastSyncTime,
    connectionRetries,
    
    // Updates and conflicts
    pendingUpdates,
    conflicts,
    
    // Actions
    queueUpdate,
    sendUpdate,
    resolveConflict,
    clearPendingUpdates,
    reconnect: connectToSSE,
    
    // Metadata
    sectionVersions: versionMapRef.current,
    updateQueue: updateQueueRef.current
  };
}

export default useSectionSync;