import React from 'react';

/**
 * A simplified error boundary component that catches errors in its children
 * and displays a fallback UI instead of crashing the entire application.
 *
 * Usage:
 * <SimpleErrorBoundary fallback={<div>Something went wrong</div>}>
 *   <YourComponent />
 * </SimpleErrorBoundary>
 */
class SimpleErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // You can log the error to an error reporting service
    console.error('SimpleErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // You can render any custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="p-4 bg-white rounded shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-[#003057] mb-2">Component Error</h2>
          <p className="text-sm text-[#666] mb-4">This component couldn't be displayed.</p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="text-xs text-blue-600 hover:text-blue-800 underline"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default SimpleErrorBoundary;
