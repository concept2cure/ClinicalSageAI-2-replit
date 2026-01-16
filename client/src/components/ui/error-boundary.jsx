import React from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react'
import { Button } from './button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './card';
import { Alert, AlertTitle, AlertDescription } from './alert';

/**
 * Error Boundary Component
 *
 * This component catches JavaScript errors anywhere in its child component tree,
 * logs those errors, and displays a fallback UI instead of crashing the whole app.
 *
 * Usage:
 * <ErrorBoundary>
 *   <YourComponent />
 * </ErrorBoundary>
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error to an error reporting service
    console.error('Error caught by boundary:', error, errorInfo);
    this.setState({ errorInfo });

    // Log to application monitoring service if available
    if (window.appMonitor && typeof window.appMonitor.logError === 'function') {
      window.appMonitor.logError(error, errorInfo);
    }
  }

  /**
   * Reset the error boundary state
   */
  resetErrorBoundary = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });

    // Call onReset callback if provided
    if (this.props.onReset && typeof this.props.onReset === 'function') {
      this.props.onReset();
    }
  };

  render() {
    const { fallback, title, description, showHomeButton } = this.props;

    if (this.state.hasError) {
      // You can render any custom fallback UI
      if (fallback) {
        return typeof fallback === 'function'
          ? fallback({
              error: this.state.error,
              resetErrorBoundary: this.resetErrorBoundary,
            })
          : fallback;
      }

      // Default error UI
      return (
        <Card className="border-destructive/20 my-4">
          <CardHeader>
            <CardTitle className="flex items-center text-destructive">
              <AlertTriangle className="mr-2 h-5 w-5" />
              {title || 'Something went wrong'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-muted-foreground text-sm">
              {description || 'An unexpected error occurred in this component.'}
            </p>

            {process.env.NODE_ENV !== 'production' && this.state.error && (
              <div className="p-2 bg-muted/50 rounded text-xs font-mono overflow-auto max-h-32">
                {this.state.error.toString()}
              </div>
            )}
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={this.resetErrorBoundary}
              className="text-xs"
            >
              <RotateCw className="mr-1 h-3.5 w-3.5" />
              Try Again
            </Button>

            {showHomeButton && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => (window.location.href = '/')}
                className="text-xs"
              >
                Go Home
              </Button>
            )}
          </CardFooter>
        </Card>
      );
    }

    return this.props.children;
  }
}

/**
 * Error boundary component for handling application errors
 * Specifically designed to catch Vite module loading errors
 */
export class ModuleErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Module error caught:', error, errorInfo);

    // Check if this is a Vite module loading error
    const isViteModuleError =
      error.message &&
      (error.message.includes('does not provide an export') ||
        error.message.includes('Failed to load module'));

    if (isViteModuleError) {
      this.setState({ isViteError: true });
    }
  }

  handleReload = () => {
    // Clear any cached resources that might be causing the issue
    if (window.localStorage) {
      const viteKeys = Object.keys(localStorage).filter(
        key => key.startsWith('vite') || key.includes('hmr') || key.includes('react-refresh')
      );

      viteKeys.forEach(key => localStorage.removeItem(key));
    }

    // Force reload the page
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="fixed inset-0 bg-black/30 z-[9999] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-950 shadow-lg rounded-lg overflow-hidden">
          <div className="bg-red-600 dark:bg-red-800 p-4 flex items-center space-x-3">
            <AlertTriangle className="h-6 w-6 text-white" />
            <h2 className="text-lg font-bold text-white">Module Loading Error</h2>
          </div>

          <Alert variant="destructive" className="border-0 rounded-none">
            <AlertTitle className="text-lg font-bold mb-2">Application Error</AlertTitle>
            <AlertDescription className="text-base">
              {this.state.isViteError
                ? 'A Vite module loading error occurred. This is often caused by cache issues or incompatible modules.'
                : 'An unexpected application error occurred.'}
            </AlertDescription>
          </Alert>

          <div className="p-4 bg-slate-50 dark:bg-slate-900 flex flex-col space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {this.state.error?.message || 'Unknown error'}
            </p>

            <div className="flex space-x-2 justify-end">
              <Button variant="outline" onClick={this.handleReload} className="font-medium">
                Clear Cache & Reload
              </Button>

              <Button
                variant="destructive"
                onClick={() => (window.location.href = '/')}
                className="font-bold"
              >
                Go to Homepage
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
