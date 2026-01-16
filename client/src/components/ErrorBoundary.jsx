import React from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { AlertCircle, Home, RefreshCw } from 'lucide-react'

/**
 * Error Boundary Component
 *
 * This component provides a standardized way to handle errors across the application.
 * It provides a user-friendly UI for unexpected errors and navigation options to recover.
 *
 * Usage:
 * <ErrorBoundary>
 *   <YourComponentThatMightError />
 * </ErrorBoundary>
 */
class ErrorBoundaryFallback extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log error to monitoring service
    console.error('Error boundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });

    // Report to monitoring/analytics service if available
    if (window.analytics && typeof window.analytics.track === 'function') {
      window.analytics.track('Error Boundary Triggered', {
        error: error.toString(),
        componentStack: errorInfo.componentStack,
        url: window.location.href,
      });
    }
  }

  render() {
    if (this.state.hasError) {
      return <ErrorUI error={this.state.error} errorInfo={this.state.errorInfo} />;
    }

    return this.props.children;
  }
}

// Functional component for the error UI
function ErrorUI({ error, errorInfo }) {
  const [, navigate] = useLocation();

  const handleReload = () => {
    window.location.reload();
  };

  const handleNavigateHome = () => {
    navigate('/client-portal');
  };

  return (
    <div className="min-h-[600px] flex items-center justify-center p-6">
      <div className="bg-red-50 border border-red-200 rounded-lg shadow-lg p-8 max-w-2xl w-full">
        <div className="flex flex-col items-center text-center">
          <AlertCircle className="h-16 w-16 text-red-500 mb-4" />
          <h2 className="text-2xl font-bold text-red-700 mb-4">Something went wrong</h2>
          <p className="text-gray-700 mb-6">
            We're sorry, but an unexpected error has occurred in the application. Our team has been
            notified and is working to resolve the issue.
          </p>

          {process.env.NODE_ENV !== 'production' && (
            <div className="bg-gray-100 p-4 rounded-md mb-6 text-left w-full overflow-auto max-h-[200px] text-xs">
              <p className="font-mono text-red-600 mb-2">{error?.toString()}</p>
              {errorInfo && (
                <pre className="font-mono text-gray-700">{errorInfo.componentStack}</pre>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-4 mt-4">
            <Button variant="outline" className="flex items-center gap-2" onClick={handleReload}>
              <RefreshCw className="h-4 w-4" />
              Reload Page
            </Button>
            <Button
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700"
              onClick={handleNavigateHome}
            >
              <Home className="h-4 w-4" />
              Return to Home
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// For direct usage in JSX
export default ErrorBoundaryFallback;

// For Higher Order Component usage
export function withErrorBoundary(Component) {
  return function WithErrorBoundary(props) {
    return (
      <ErrorBoundaryFallback>
        <Component {...props} />
      </ErrorBoundaryFallback>
    );
  };
}
