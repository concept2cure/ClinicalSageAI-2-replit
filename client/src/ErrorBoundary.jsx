import React from 'react';
import { reportClientError } from './utils/reportClientError';
import { isChunkLoadFailure } from './concept2cure/v2/SurfaceScaffold';
import './error-boundary.css';

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
    this.setState({ errorInfo });

    // Report to the monitoring backend the app already ships (Sentry, via
    // utils/reportClientError). This used to be a console line plus a call to
    // `window.appMonitor.logError` — and `window.appMonitor` is assigned
    // NOWHERE in this repository, so the guard was always false and the only
    // record of an app-level crash was a console line in one user's browser.
    // reportClientError still writes that console line; it just also leaves the
    // machine.
    reportClientError(error, {
      boundary: 'ErrorBoundary',
      componentStack: errorInfo?.componentStack,
    });
  }

  /**
   * Reset the error boundary state
   */
  resetErrorBoundary = () => {
    // A chunk that never arrived cannot be retried in place: React.lazy caches
    // the rejected import and rethrows it on every render. Only a page load
    // fetches the current index.html and the chunks it names (a tab opened on
    // the sign-in page before a release first imports V2App after MFA).
    if (this.isChunkLoadFailure()) {
      window.location.reload();
      return;
    }
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

  isChunkLoadFailure() {
    return isChunkLoadFailure(String(this.state.error?.message ?? this.state.error ?? ''));
  }

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
          <h2>{title || (this.isChunkLoadFailure() ? 'This page didn’t finish loading' : 'Something went wrong')}</h2>
          <p>
            {description ||
              (this.isChunkLoadFailure()
                ? 'Part of the app didn’t arrive, usually because a new version was released. Try again to load it.'
                : 'An unexpected error occurred in this component.')}
          </p>

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
