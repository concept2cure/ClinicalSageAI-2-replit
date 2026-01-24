# Application Stability Measures

## Overview

This document outlines the critical stability measures implemented to ensure the application remains operational at all times, with a particular focus on preventing the regulatory module from causing system-wide failures.

## Running Tests

We use Jest + Supertest for unit & integration tests. To run them:

1. Ensure you've installed dev-dependencies:

   ```bash
   npm install
   ```

2. From the project root, run:

   ```bash
   ./test.sh
   ```

   This script will:

   - Load your `.env` (if present)
   - Invoke Jest with the proper config
   - Exit non-zero if any test fails

You can also pass Jest CLI flags, e.g.:

```bash
./test.sh --coverage
```

## Critical Components

The following components have been identified as critical to application stability:

### Automated Testing Infrastructure

1. **Unit Tests:**

   - Service-level tests in `server/services/__tests__/deviceProfileService.test.ts`
   - Validates core business logic without UI dependencies
   - Ensures device profile CRUD operations function correctly

2. **Integration Tests:**

   - API route tests in `server/routes/__tests__/deviceProfileRoutes.test.ts`
   - Tests the complete request/response cycle through HTTP
   - Verifies API contracts between frontend and backend

3. **Test Framework:**

   - Jest configuration in root `jest.config.js`
   - Test setup in `jest.setup.js`
   - Custom test runner in `run_tests.js` for executing all tests

4. **Test Documentation:**
   - Testing guide in `server/services/__tests__/README.md`
   - Details on test coverage and best practices
   - Instructions for running tests and extending the test suite

### Client-Side Measures

1. **Enhanced Error Boundaries:**

   - Global application error boundary in `client/src/ErrorBoundary.jsx`
   - Module-specific error boundary for regulatory components in `client/src/components/regulatory/ErrorBoundaryWrapper.jsx`
   - Stability container specifically for regulatory module in `client/src/components/regulatory/StabilityContainer.jsx`

2. **Stabilized File Upload Component:**

   - Wrapper component at `client/src/components/ui/file-upload-wrapper.jsx` ensures file uploads never crash the application
   - Internal error handling with fallback UI
   - Automatically logs errors for diagnostics

3. **Stability Configuration:**

   - Centralized stability settings in `client/src/config/stabilityConfig.js`
   - Controls error recovery behavior application-wide
   - Configures memory management and network request parameters

4. **Memory Management:**

   - Memory optimization utilities in `client/src/utils/memoryManagement.js`
   - Smart caching with automatic cleanup in `client/src/hooks/useMemoryOptimization.jsx`
   - Prevents memory leaks and browser tab crashes

5. **Network Resilience:**

   - Automatic request retries in `client/src/utils/networkResilience.js`
   - Offline detection and recovery in `client/src/hooks/useNetworkResilience.jsx`
   - Exponential backoff for failed requests

6. **Freeze Detection:**
   - Application freeze detection in `client/src/utils/freezeDetection.js`
   - Component-level freeze monitoring in `client/src/hooks/useFreezeDetection.jsx`
   - Automatic recovery attempts for frozen UI

### Server-Side Measures

1. **Global Error Handlers:**

   - Process-level handlers for uncaught exceptions and unhandled promise rejections in `server/utils/globalErrorHandler.ts`
   - Prevents server crashes from uncaught errors

2. **API Error Middleware:**

   - Centralized error handling for all API routes in `server/middleware/errorHandlerMiddleware.ts`
   - Provides consistent error responses
   - Prevents errors from crashing the server

3. **Health Check System:**
   - Regular system health monitoring in `server/utils/applicationHealthCheck.ts`
   - Automatic recovery attempts for degraded services
   - Detailed health metrics API at `/api/health/detailed`

## How the Stability System Works

1. **Multiple Layers of Protection:**

   - Components that have crashed in the past are wrapped in multiple error boundaries
   - Server endpoints are protected by global error handlers
   - File upload operations use a specialized error-catching wrapper
   - Memory-intensive operations have automatic cleanup mechanisms
   - Network requests automatically retry on failure

2. **Isolation of Problematic Modules:**

   - The regulatory module is completely isolated to prevent affecting other parts of the application
   - Component failures are contained within their own boundaries
   - Memory-intensive components use specialized memory optimization

3. **Automatic Recovery:**

   - Components attempt to recover from errors automatically
   - Error boundaries provide reset functionality
   - Server automatically attempts to recover degraded services
   - Network requests retry with exponential backoff
   - Memory is automatically freed when usage gets too high
   - Application freezes trigger automatic recovery attempts

4. **Error Logging and Diagnostics:**
   - Errors are logged with detailed information for debugging
   - Critical errors trigger alerts
   - Error logs are preserved for post-mortem analysis
   - Network failures are tracked for pattern detection
   - Memory usage anomalies are logged for optimization
   - Application freezes are recorded with detailed diagnostics

## Maintenance Guidelines

### DO NOT MODIFY THESE FILES WITHOUT EXTENSIVE TESTING:

- `client/src/ErrorBoundary.jsx`
- `client/src/components/regulatory/ErrorBoundaryWrapper.jsx`
- `client/src/components/regulatory/StabilityContainer.jsx`
- `client/src/components/ui/file-upload-wrapper.jsx`
- `client/src/config/stabilityConfig.js`
- `client/src/utils/memoryManagement.js`
- `client/src/utils/networkResilience.js`
- `client/src/utils/freezeDetection.js`
- `client/src/hooks/useMemoryOptimization.jsx`
- `client/src/hooks/useNetworkResilience.jsx`
- `client/src/hooks/useFreezeDetection.jsx`
- `server/middleware/errorHandlerMiddleware.ts`
- `server/utils/globalErrorHandler.ts`
- `server/utils/applicationHealthCheck.ts`
- `server/routes/healthCheck.ts`

### When Adding New Components:

1. Import file upload components ONLY from `client/src/components/ui/file-upload-wrapper.jsx`
2. Wrap regulatory module components in `RegulatoryStabilityContainer`
3. Use `useMemoryOptimization` hook for components that manage large datasets
4. Use `useNetworkResilience` hook for components that make critical API calls
5. Use `useFreezeDetection` hook for components with complex rendering logic
6. Ensure new routes are added to the Express app BEFORE the error handler middleware

## Troubleshooting

If the application does crash despite these measures:

1. Check the logs in `logs/uncaught_errors.log` for server-side issues
2. Examine browser console and `localStorage` for client-side errors
3. Check localStorage for `freeze_logs`, `component_errors`, and other stability diagnostics
4. Look for error patterns in the logs to identify root causes
5. Restart the application with `npm run dev`

## Best Practices

1. Always use the error boundaries and stability containers for new components
2. Add defensive error handling in critical operations
3. Keep error boundaries as close to potential error sources as possible
4. Use memory optimization hooks for data-intensive components
5. Use network resilience for critical API requests
6. Test error scenarios thoroughly during development
7. Never remove or disable stability measures without understanding the consequences

## Automated Testing

Automated tests are a critical part of our stability strategy. We use Jest to test both service-level logic and API endpoints. Here's how to work with our testing infrastructure:

### Running Tests

To run all tests:

```
node run_tests.js
```

To run specific test files:

```
node run_tests.js -- server/services/__tests__/deviceProfileService.test.ts
```

To run tests with specific patterns:

```
node run_tests.js -- -t "create profile"
```

### Test Coverage

The tests cover the following:

1. **Service Layer**:

   - Creating profiles
   - Retrieving profiles by ID
   - Listing all profiles
   - Updating profiles
   - Deleting profiles
   - Error handling

2. **API Layer**:
   - HTTP request/response cycle
   - Input validation
   - Error handling
   - Data transformation

### Extending Tests

When adding new functionality:

1. Add unit tests for new service methods before implementation
2. Add integration tests for new API endpoints
3. Run the entire test suite before committing changes
4. Ensure both happy paths and error scenarios are tested

## Memory Usage Guidelines

Memory leaks and excessive memory usage are common causes of browser tab crashes. To prevent these:

1. Use the `useMemoryOptimization` hook for components that store large datasets
2. Implement cleanup functions in all useEffect hooks that create subscriptions or timers
3. Clear large objects, images, and arrays when components unmount
4. Minimize the use of closures that reference large objects
5. Be careful with event listeners that capture component state

## Network Resilience Guidelines

Network errors should never crash the application. To ensure this:

1. Use the `useNetworkResilience` hook for components that make critical API calls
2. Implement proper loading and error states for all network operations
3. Use network resilience for file uploads, especially in the regulatory module
4. Never assume network requests will succeed
5. Always provide fallback behavior for network failures

## Regulatory Module Special Handling

The regulatory module (RegulatorySubmissionsPage, DocumentUploadDialog, etc.) has historically been the source of application crashes. These components are now wrapped in multiple layers of protection:

1. Component-specific error boundaries
2. A specialized stability container
3. File upload operations are fully isolated
4. Memory optimization prevents tab crashes during large file uploads
5. Network resilience ensures uploads don't fail permanently due to connectivity issues
6. Freeze detection monitors for UI hangs during complex operations
7. Server-side error handling for submissions

By using this multi-layered approach, the application can continue functioning even if the regulatory module encounters issues.
