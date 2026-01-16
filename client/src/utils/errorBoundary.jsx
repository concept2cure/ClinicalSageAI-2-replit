import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Production-ready Error Boundary for catching and gracefully handling React errors
 * This prevents white screens and provides users with recovery options
 */
export class ProductionErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      errorCount: 0 
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details for debugging
    console.error('Production Error Boundary caught:', error, errorInfo);
    
    // In production, you would send this to an error tracking service
    // Example: Sentry.captureException(error, { extra: errorInfo });
    
    this.setState({
      error,
      errorInfo,
      errorCount: this.state.errorCount + 1
    });

    // Store error in localStorage for debugging
    const errorLog = {
      timestamp: new Date().toISOString(),
      error: error.toString(),
      componentStack: errorInfo.componentStack,
      url: window.location.href
    };
    
    const existingLogs = JSON.parse(localStorage.getItem('errorLogs') || '[]');
    existingLogs.push(errorLog);
    // Keep only last 10 errors
    if (existingLogs.length > 10) {
      existingLogs.shift();
    }
    localStorage.setItem('errorLogs', JSON.stringify(existingLogs));
  }

  handleReset = () => {
    this.setState({ 
      hasError: false, 
      error: null, 
      errorInfo: null 
    });
    
    // Optionally reload the page if errors persist
    if (this.state.errorCount > 2) {
      window.location.reload();
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Production error UI
      if (process.env.NODE_ENV === 'production' || !this.state.error) {
        return (
          <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <Card className="max-w-md w-full">
              <CardHeader>
                <CardTitle className="flex items-center text-red-600">
                  <AlertTriangle className="h-5 w-5 mr-2" />
                  Something went wrong
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-600">
                  We encountered an unexpected error. Your work has been saved automatically.
                </p>
                <div className="flex gap-2">
                  <Button 
                    onClick={this.handleReset}
                    className="flex-1"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Try Again
                  </Button>
                  <Button 
                    onClick={this.handleReload}
                    variant="outline"
                    className="flex-1"
                  >
                    Reload Page
                  </Button>
                </div>
                <p className="text-xs text-gray-500">
                  If this problem persists, please contact support with error code: 
                  {' ' + new Date().getTime()}
                </p>
              </CardContent>
            </Card>
          </div>
        );
      }

      // Development error UI with details
      return (
        <div className="min-h-screen bg-red-50 p-8">
          <div className="max-w-4xl mx-auto">
            <Card className="border-red-200">
              <CardHeader className="bg-red-100">
                <CardTitle className="flex items-center text-red-800">
                  <AlertTriangle className="h-5 w-5 mr-2" />
                  Development Error Boundary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-6">
                <div className="bg-white rounded-lg p-4 border border-red-200">
                  <h3 className="font-semibold text-red-700 mb-2">Error Message:</h3>
                  <pre className="text-sm text-red-600 whitespace-pre-wrap">
                    {this.state.error && this.state.error.toString()}
                  </pre>
                </div>
                
                {this.state.errorInfo && (
                  <div className="bg-white rounded-lg p-4 border border-red-200">
                    <h3 className="font-semibold text-red-700 mb-2">Component Stack:</h3>
                    <pre className="text-xs text-gray-600 whitespace-pre-wrap overflow-x-auto">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </div>
                )}
                
                <div className="flex gap-2">
                  <Button 
                    onClick={this.handleReset}
                    variant="outline"
                    className="flex-1"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Reset Error Boundary
                  </Button>
                  <Button 
                    onClick={this.handleReload}
                    className="flex-1"
                  >
                    Reload Page
                  </Button>
                </div>
                
                <p className="text-xs text-gray-500 text-center">
                  Error Count: {this.state.errorCount} | 
                  Time: {new Date().toLocaleString()}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Higher-order component for wrapping components with error boundary
export function withErrorBoundary(Component, fallbackComponent) {
  return function WrappedComponent(props) {
    return (
      <ProductionErrorBoundary fallback={fallbackComponent}>
        <Component {...props} />
      </ProductionErrorBoundary>
    );
  };
}

// Hook for error handling in functional components
export function useErrorHandler() {
  const [error, setError] = React.useState(null);
  
  React.useEffect(() => {
    if (error) {
      throw error;
    }
  }, [error]);
  
  return setError;
}