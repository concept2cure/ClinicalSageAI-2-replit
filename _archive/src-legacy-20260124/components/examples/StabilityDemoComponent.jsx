/**
 * StabilityDemoComponent
 *
 * This is an example component that demonstrates proper implementation
 * of all stability features in a single component.
 *
 * Use this as a reference when implementing stability measures in your components.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { StabilityContainer } from '@/components/regulatory/StabilityContainer';
import { FileUpload } from '@/components/ui/file-upload-wrapper';
import useMemoryOptimization from '@/hooks/useMemoryOptimization';
import useNetworkResilience from '@/hooks/useNetworkResilience';
import useFreezeDetection from '@/hooks/useFreezeDetection';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { AlertCircle, Clock, Database, RefreshCw, Wifi, WifiOff } from 'lucide-react';

/**
 * Example component demonstrating all stability features
 */
function StabilityDemoComponentInner() {
  // State for the demo
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // 1. Memory Optimization
  const { cache, memoryUsage, isCacheFull } = useMemoryOptimization({
    componentName: 'StabilityDemoComponent',
    maxCacheItems: 100,
    cleanupDependencies: [documents],
  });

  // 2. Network Resilience
  const { api, isOnline, pendingRequests, failedRequests, retryFailedRequests } =
    useNetworkResilience({
      baseUrl: '', // Use relative URLs
      defaultOptions: {
        headers: {
          'Content-Type': 'application/json',
        },
      },
    });

  // 3. Freeze Detection
  const { updateHeartbeat, registerAsCritical, unregisterAsCritical } = useFreezeDetection({
    componentName: 'StabilityDemoComponent',
    isCritical: true,
    onFreezeDetected: duration => {
      console.warn(`Component was frozen for ${duration}ms`);
      setError(`UI freeze detected (${duration}ms). Performance may be degraded.`);
    },
  });

  // Load documents from API with stability features
  const loadDocuments = useCallback(async () => {
    // Update heartbeat to indicate component is responsive
    updateHeartbeat();

    // Check if we already have cached documents
    const cachedDocs = cache.get('documents');
    if (cachedDocs) {
      setDocuments(cachedDocs);
      return;
    }

    // If not cached, load from API with network resilience
    setIsLoading(true);
    setError(null);

    try {
      // This API call will automatically retry on failures
      const docsData = await api.get('/api/documents');

      // Cache the results to avoid unnecessary API calls
      cache.set('documents', docsData);
      setDocuments(docsData);
    } catch (err) {
      // This only happens after all retries have failed
      setError(`Failed to load documents: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [api, cache, updateHeartbeat]);

  // Example of uploading a document with stability features
  const handleUpload = useCallback(
    async file => {
      // Update heartbeat to indicate component is responsive
      updateHeartbeat();

      setIsLoading(true);
      setError(null);

      try {
        // Create a FormData object
        const formData = new FormData();
        formData.append('file', file);

        // Use network-resilient API to upload
        const response = await api.post('/api/documents', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          // This is a critical operation that should be retried when online
          critical: true,
        });

        // Add the new document to our state
        setDocuments(prev => {
          const newDocs = [...prev, response];
          // Update the cache with the new documents
          cache.set('documents', newDocs);
          return newDocs;
        });
      } catch (err) {
        setError(`Failed to upload document: ${err.message}`);
      } finally {
        setIsLoading(false);
      }
    },
    [api, cache, updateHeartbeat]
  );

  // Example of a CPU-intensive operation that could freeze the UI
  const simulateComplexOperation = useCallback(() => {
    // Register as critical before starting complex operation
    registerAsCritical();

    // Simulate a complex operation that might freeze the UI
    const start = Date.now();
    console.log('Starting complex operation...');

    // This operation will be monitored by freeze detection
    try {
      // Simulate something CPU intensive
      let result = 0;
      for (let i = 0; i < 10000000; i++) {
        result += Math.sqrt(i);
      }

      console.log(`Complex operation completed in ${Date.now() - start}ms`);
    } catch (err) {
      setError(`Operation failed: ${err.message}`);
    } finally {
      // Unregister as critical when done
      unregisterAsCritical();
    }
  }, [registerAsCritical, unregisterAsCritical]);

  // Initialize component
  useEffect(() => {
    console.log('StabilityDemoComponent mounted');
    loadDocuments();

    // Clean up component
    return () => {
      console.log('StabilityDemoComponent unmounting, clearing cache');
      cache.clear();
    };
  }, [loadDocuments, cache]);

  // Update heartbeat every second to prove component is responsive
  useEffect(() => {
    const interval = setInterval(() => {
      updateHeartbeat();
    }, 1000);

    return () => clearInterval(interval);
  }, [updateHeartbeat]);

  return (
    <div className="p-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Stability Demo Component</CardTitle>
          <CardDescription>Demonstrating all stability features in one component</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Network status indicator */}
          <div className="flex items-center gap-2 mb-4">
            {isOnline ? (
              <div className="flex items-center text-green-600">
                <Wifi className="w-4 h-4 mr-1" />
                <span>Online</span>
              </div>
            ) : (
              <div className="flex items-center text-orange-600">
                <WifiOff className="w-4 h-4 mr-1" />
                <span>Offline (changes will sync when online)</span>
              </div>
            )}

            {pendingRequests > 0 && (
              <div className="flex items-center text-blue-600 ml-4">
                <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                <span>Syncing...</span>
              </div>
            )}
          </div>

          {/* Memory usage indicator */}
          <div className="mb-4">
            <div className="text-sm text-gray-500 flex items-center">
              <Database className="w-4 h-4 mr-1" />
              <span>
                Memory Usage: {memoryUsage.cacheSize} items (
                {Math.round(memoryUsage.estimatedBytes / 1024)} KB)
              </span>

              {isCacheFull && <span className="ml-2 text-amber-600">Cache full</span>}
            </div>

            <div className="h-2 bg-gray-100 rounded-full mt-1">
              <div
                className="h-2 bg-blue-500 rounded-full"
                style={{ width: `${Math.min(100, (memoryUsage.cacheSize / 100) * 100)}%` }}
              ></div>
            </div>
          </div>

          {/* Error display with recovery option */}
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>

              <div className="mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setError(null);
                    if (failedRequests > 0) {
                      retryFailedRequests();
                    }
                  }}
                >
                  Try Again
                </Button>
              </div>
            </Alert>
          )}

          {/* File upload component with stability wrapper */}
          <div className="my-4">
            <h3 className="text-md font-medium mb-2">Upload Document</h3>
            <FileUpload
              accept=".pdf,.docx,.txt"
              onUpload={handleUpload}
              onError={err => setError(`Upload error: ${err.message}`)}
            />
          </div>

          {/* Document list with loading state */}
          <div className="my-4">
            <h3 className="text-md font-medium mb-2">Documents</h3>

            {isLoading ? (
              <div className="flex items-center gap-2 text-gray-500">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Loading documents...</span>
              </div>
            ) : documents.length === 0 ? (
              <div className="text-gray-500">No documents available</div>
            ) : (
              <ul className="space-y-1">
                {documents.map((doc, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span>{doc.name || `Document ${index + 1}`}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={loadDocuments} disabled={isLoading}>
            Refresh Documents
          </Button>

          <Button variant="secondary" onClick={simulateComplexOperation}>
            Run Complex Operation
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

// Wrap the component in the StabilityContainer for error isolation
export default function StabilityDemoComponent() {
  return (
    <StabilityContainer>
      <StabilityDemoComponentInner />
    </StabilityContainer>
  );
}
