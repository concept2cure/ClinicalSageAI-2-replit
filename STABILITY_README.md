# Application Stability System

## Purpose

This README provides practical guidance on how to use the stability features implemented in the application. These features ensure the application never crashes, even when encountering errors, network failures, memory issues, or UI freezes.

## Quick Start Guide

### 1. Importing Stability Components

```jsx
// Import the stability components you need
import { StabilityContainer } from '@/components/regulatory/StabilityContainer';
import { FileUpload } from '@/components/ui/file-upload-wrapper';
import useMemoryOptimization from '@/hooks/useMemoryOptimization';
import useNetworkResilience from '@/hooks/useNetworkResilience';
import useFreezeDetection from '@/hooks/useFreezeDetection';
```

### 2. Wrapping Components for Error Protection

```jsx
function YourRiskyComponent() {
  return <StabilityContainer>{/* Your component content here */}</StabilityContainer>;
}
```

### 3. Using Memory Management

```jsx
function DataIntensiveComponent() {
  const { cache, memoryUsage } = useMemoryOptimization({
    componentName: 'DataIntensiveComponent',
    maxCacheItems: 200,
  });

  // Use the memory-efficient cache
  const loadData = id => {
    // Check if data is already in cache
    const cachedData = cache.get(id);
    if (cachedData) return cachedData;

    // Otherwise fetch and cache
    const data = fetchDataFromServer(id);
    cache.set(id, data);
    return data;
  };

  return (
    <div>
      {/* Component content */}
      {memoryUsage.cacheSize > 100 && <p>Cache is getting large, consider clearing unused items</p>}
    </div>
  );
}
```

### 4. Using Network Resilience

```jsx
function ApiComponent() {
  const { api, isOnline, pendingRequests } = useNetworkResilience();

  const handleSubmit = async formData => {
    try {
      // This will automatically retry on network failures
      const response = await api.post('/api/submit', formData);
      return response;
    } catch (error) {
      // This will only be called after all retry attempts fail
      console.error('Failed after multiple retries:', error);
    }
  };

  return (
    <div>
      {!isOnline && <p>You are currently offline. Data will be saved when you reconnect.</p>}
      {pendingRequests > 0 && <p>Syncing data...</p>}

      {/* Component content */}
    </div>
  );
}
```

### 5. Using Freeze Detection

```jsx
function ComplexUIComponent() {
  const { updateHeartbeat } = useFreezeDetection({
    componentName: 'ComplexUIComponent',
    isCritical: true,
    onFreezeDetected: duration => {
      console.warn(`Component was frozen for ${duration}ms`);
    },
  });

  // Call updateHeartbeat in render or effects to indicate the component is alive
  useEffect(() => {
    const interval = setInterval(() => {
      updateHeartbeat();
    }, 1000);

    return () => clearInterval(interval);
  }, [updateHeartbeat]);

  return <div>{/* Complex component content */}</div>;
}
```

### 6. Using Stabilized File Uploads

```jsx
function DocumentUploader() {
  return (
    <div>
      {/* Always use the stabilized FileUpload component */}
      <FileUpload accept=".pdf,.docx" onUpload={handleUpload} onError={handleError} />
    </div>
  );
}
```

## Integration with Server Stability Features

The server has been enhanced with several stability features that work in conjunction with the client-side measures:

1. **Health Check API**: Access detailed health information at `/api/health/detailed`
2. **Automatic Recovery**: The server attempts to recover from degraded states automatically
3. **Error Logging**: Server errors are logged to `logs/uncaught_errors.log`

## Guidelines for Different Component Types

### Data-Intensive Components

For components that deal with large datasets, reports, or complex visualizations:

1. Use `useMemoryOptimization` to prevent memory leaks
2. Implement cleanup in all useEffect hooks
3. Break large lists into virtualized components
4. Clear data structures when unmounting

### Network-Dependent Components

For components that rely on API calls:

1. Use `useNetworkResilience` to handle network failures
2. Always provide loading and error states
3. Implement offline support for critical operations
4. Consider request batching for multiple related calls

### Complex UI Components

For components with complex rendering logic:

1. Use `useFreezeDetection` to detect and recover from UI freezes
2. Break rendering into smaller chunks or use virtualization
3. Use React.memo and useCallback to prevent unnecessary renders
4. Consider debouncing or throttling for frequent updates

### Regulatory Module Components

For components in the regulatory module (historically problematic):

1. Wrap with `StabilityContainer`
2. Use `FileUpload` for any file upload operations
3. Apply both memory optimization and network resilience
4. Enable freeze detection for complex operations
5. Keep component functionality focused and limited

## Stability Monitoring

The application includes built-in stability monitoring:

1. Check the browser console for stability warnings
2. Look in localStorage for:
   - `freeze_logs`: Records of application freezes
   - `component_errors`: Component-specific errors
   - `network_failures`: Failed network requests
3. Check server logs in `logs/uncaught_errors.log`

## Troubleshooting

### Common Issues and Solutions

1. **Component crashes repeatedly**:

   - Wrap with StabilityContainer
   - Add defensive error handling
   - Check for undefined values

2. **Memory leaks**:

   - Use useMemoryOptimization
   - Implement cleanup in useEffect
   - Check for retained references

3. **Network failures**:

   - Use useNetworkResilience
   - Add retry logic
   - Implement offline support

4. **UI freezes**:
   - Use useFreezeDetection
   - Optimize rendering performance
   - Break up complex operations

## Further Reading

For more detailed information, see:

1. [STABILITY_MEASURES.md](./STABILITY_MEASURES.md): Comprehensive documentation of all stability measures
2. Browse the source code of stability components for implementation details
