import React from 'react';

/**
 * Global Error Boundary
 *
 * CRITICAL STABILITY COMPONENT: This error boundary prevents the entire
 * application from crashing when rendering errors occur in React components.
 *
 * This is a critical part of the application's stability measures and should
 * not be removed or modified without thorough testing.
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
        <div className="error-boundary-fallback">
          <h2>{title || 'Something went wrong'}</h2>
          <p>{description || 'An unexpected error occurred in this component.'}</p>

          {process.env.NODE_ENV !== 'production' && this.state.error && (
            <pre className="error-message">{this.state.error.toString()}</pre>
          )}

          <button onClick={this.resetErrorBoundary}>Try Again</button>

          {showHomeButton && <button onClick={() => (window.location.href = '/')}>Go Home</button>}
        </div>
      );
    }

    return this.props.children;
  }
}

export { ErrorBoundary };
export default ErrorBoundary;
