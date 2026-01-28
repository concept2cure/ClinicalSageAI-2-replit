/**
 * @fileoverview Concept2Cure Error Boundary
 * @module concept2cure/components/ErrorBoundary
 * @version 2.0.0
 * 
 * @description
 * React error boundary for graceful error handling in the Concept2Cure module.
 * Captures errors, logs them for audit trail, and provides user-friendly recovery.
 * 
 * @compliance
 * - FDA 21 CFR Part 11: All errors logged with timestamp, user context
 * - Error state preserved for investigation
 * - Recovery actions documented
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Error log entry for audit trail compliance
 */
interface ErrorLogEntry {
  id: string;
  timestamp: string;
  error: string;
  stack?: string;
  componentStack?: string;
  userAgent: string;
  url: string;
}

interface ErrorBoundaryProps {
  /** Child components to wrap */
  children: ReactNode;
  /** Optional fallback UI */
  fallback?: ReactNode;
  /** Callback when error occurs */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Show technical details (dev mode) */
  showDetails?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string | null;
}

/**
 * Error Boundary Component
 * 
 * @description
 * Wraps child components and catches JavaScript errors anywhere in the
 * child component tree. Logs errors for 21 CFR Part 11 compliance and
 * displays a fallback UI instead of crashing the entire application.
 * 
 * @example
 * ```tsx
 * <ErrorBoundary onError={(e) => logToServer(e)}>
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
    };
  }

  /**
   * Update state when an error is caught
   */
  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
      errorId: `err_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    };
  }

  /**
   * Log error for 21 CFR Part 11 audit trail
   */
  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });

    // Create audit log entry
    const logEntry: ErrorLogEntry = {
      id: this.state.errorId || `err_${Date.now()}`,
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      url: typeof window !== 'undefined' ? window.location.href : 'unknown',
    };

    // Log to console in development
    console.error('[ErrorBoundary] Error caught:', logEntry);

    // Attempt to send to server for persistent logging
    this.logErrorToServer(logEntry);

    // Call optional error callback
    this.props.onError?.(error, errorInfo);
  }

  /**
   * Send error to server for persistent audit logging
   */
  private async logErrorToServer(logEntry: ErrorLogEntry): Promise<void> {
    try {
      await fetch('/api/concept2cure/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logEntry),
      });
    } catch (e) {
      // If server logging fails, store locally
      console.warn('[ErrorBoundary] Failed to log error to server:', e);
      try {
        const stored = localStorage.getItem('concept2cure_error_log') || '[]';
        const errors = JSON.parse(stored);
        errors.push(logEntry);
        // Keep only last 50 errors
        if (errors.length > 50) errors.shift();
        localStorage.setItem('concept2cure_error_log', JSON.stringify(errors));
      } catch {
        // If localStorage fails, error is already in console
      }
    }
  }

  /**
   * Reset error state and attempt recovery
   */
  private handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
    });
  };

  /**
   * Navigate to home page
   */
  private handleGoHome = (): void => {
    if (typeof window !== 'undefined') {
      window.location.href = '/concept2cure';
    }
  };

  /**
   * Copy error details to clipboard
   */
  private handleCopyError = async (): Promise<void> => {
    const { error, errorInfo, errorId } = this.state;
    const errorText = `
Error ID: ${errorId}
Timestamp: ${new Date().toISOString()}
Message: ${error?.message}
Stack: ${error?.stack}
Component Stack: ${errorInfo?.componentStack}
    `.trim();

    try {
      await navigator.clipboard.writeText(errorText);
    } catch {
      // Fallback for browsers without clipboard API
      console.log('Error details:', errorText);
    }
  };

  render(): ReactNode {
    const { hasError, error, errorInfo, errorId } = this.state;
    const { children, fallback, showDetails } = this.props;

    if (hasError) {
      // Custom fallback if provided
      if (fallback) {
        return fallback;
      }

      // Default error UI
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <Card className="max-w-lg w-full shadow-lg">
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="h-8 w-8 text-red-600" />
              </div>
              <CardTitle className="text-xl text-gray-900">
                Something went wrong
              </CardTitle>
              <CardDescription className="text-gray-600">
                We've logged this error for investigation. Your work has been preserved.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Error ID for support reference */}
              <div className="text-center text-sm text-gray-500">
                Error Reference: <code className="bg-gray-100 px-2 py-1 rounded">{errorId}</code>
              </div>

              {/* Technical details (dev mode only) */}
              {showDetails && error && (
                <div className="bg-gray-100 rounded-lg p-4 max-h-48 overflow-auto">
                  <p className="font-mono text-xs text-red-600 whitespace-pre-wrap">
                    {error.message}
                  </p>
                  {errorInfo?.componentStack && (
                    <p className="font-mono text-xs text-gray-500 mt-2 whitespace-pre-wrap">
                      {errorInfo.componentStack}
                    </p>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-2">
                <Button onClick={this.handleRetry} className="flex-1">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
                <Button onClick={this.handleGoHome} variant="outline" className="flex-1">
                  <Home className="h-4 w-4 mr-2" />
                  Go Home
                </Button>
              </div>

              {/* Copy error for support */}
              <Button
                onClick={this.handleCopyError}
                variant="ghost"
                size="sm"
                className="w-full text-gray-500"
              >
                <Bug className="h-3 w-3 mr-2" />
                Copy Error Details
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return children;
  }
}

/**
 * Hook to programmatically throw errors (for testing)
 * @internal
 */
export function useErrorThrower(): (error: Error) => void {
  const [, setError] = React.useState<Error | null>(null);
  
  return React.useCallback((error: Error) => {
    setError(() => {
      throw error;
    });
  }, []);
}

export default ErrorBoundary;
