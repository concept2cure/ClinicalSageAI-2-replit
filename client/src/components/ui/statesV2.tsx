/**
 * UI State Components - Enterprise Edition
 *
 * Accessible, WCAG 2.1 AA compliant UI states for loading, empty, and error states.
 * Includes proper ARIA labels, keyboard navigation, and screen reader support.
 *
 * @version 3.0.0
 * @module client/src/components/ui/statesV2
 */

import React, { useId, useEffect, useRef } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// LOADING STATE - Accessible
// ═══════════════════════════════════════════════════════════════════════════════

interface LoadingStateProps {
  /** Loading message displayed to users */
  message?: string;
  /** Size of the spinner */
  size?: 'sm' | 'md' | 'lg';
  /** Whether to display as a full-screen overlay */
  fullScreen?: boolean;
  /** Aria label for screen readers */
  ariaLabel?: string;
  /** Test ID for testing */
  testId?: string;
}

/**
 * Accessible loading state component with animated spinner.
 * Announces loading state to screen readers.
 */
export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading...',
  size = 'md',
  fullScreen = false,
  ariaLabel,
  testId = 'loading-state',
}) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };

  const content = (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={ariaLabel || message}
      className="flex flex-col items-center justify-center gap-3"
      data-testid={testId}
    >
      {/* Spinner with accessible hidden text */}
      <div
        className={`animate-spin rounded-full border-2 border-gray-200 border-t-blue-600 ${sizeClasses[size]}`}
        aria-hidden="true"
      />
      {/* Visible message */}
      {message && (
        <p className="text-sm text-gray-500" id={`${testId}-message`}>
          {message}
        </p>
      )}
      {/* Screen reader announcement */}
      <span className="sr-only">{message}</span>
    </div>
  );

  if (fullScreen) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm z-50"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${testId}-message`}
      >
        {content}
      </div>
    );
  }

  return <div className="flex items-center justify-center p-8">{content}</div>;
};

// ═══════════════════════════════════════════════════════════════════════════════
// EMPTY STATE - Accessible
// ═══════════════════════════════════════════════════════════════════════════════

interface EmptyStateProps {
  /** Icon to display (optional) */
  icon?: React.ReactNode;
  /** Title of the empty state */
  title: string;
  /** Description text */
  description?: string;
  /** Action button configuration */
  action?: {
    label: string;
    onClick: () => void;
    /** Whether action is destructive (changes button styling) */
    variant?: 'primary' | 'secondary' | 'destructive';
  };
  /** Additional actions */
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  /** Test ID for testing */
  testId?: string;
}

/**
 * Accessible empty state component with optional action button.
 * Properly labeled for screen readers.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  secondaryAction,
  testId = 'empty-state',
}) => {
  const titleId = useId();
  const descId = useId();

  const actionVariantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-stone-400',
    secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-500',
    destructive: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
  };

  return (
    <div
      className="flex flex-col items-center justify-center p-12 text-center"
      role="region"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      data-testid={testId}
    >
      {icon && (
        <div className="mb-4 text-gray-300" aria-hidden="true">
          {icon}
        </div>
      )}
      <h3 id={titleId} className="text-lg font-medium text-gray-900 mb-1">
        {title}
      </h3>
      {description && (
        <p id={descId} className="text-sm text-gray-500 max-w-sm mb-4">
          {description}
        </p>
      )}
      {(action || secondaryAction) && (
        <div className="flex items-center gap-3 mt-2" role="group" aria-label="Actions">
          {action && (
            <button
              onClick={action.onClick}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                actionVariantClasses[action.variant || 'primary']
              }`}
              type="button"
              data-testid={`${testId}-action`}
            >
              {action.label}
            </button>
          )}
          {secondaryAction && (
            <button
              onClick={secondaryAction.onClick}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 rounded-md transition-colors"
              type="button"
              data-testid={`${testId}-secondary-action`}
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR STATE - Accessible
// ═══════════════════════════════════════════════════════════════════════════════

interface ErrorStateProps {
  /** Error title */
  title?: string;
  /** Error message */
  message: string;
  /** Technical details (shown in expandable section) */
  details?: string;
  /** Retry callback */
  retry?: () => void;
  /** Whether to display as full screen */
  fullScreen?: boolean;
  /** Error code for support reference */
  errorCode?: string;
  /** Support link */
  supportLink?: string;
  /** Test ID for testing */
  testId?: string;
}

/**
 * Accessible error state component with retry capability.
 * Announces error to screen readers via live region.
 */
export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message,
  details,
  retry,
  fullScreen = false,
  errorCode,
  supportLink,
  testId = 'error-state',
}) => {
  const titleId = useId();
  const descId = useId();
  const detailsRef = useRef<HTMLDetailsElement>(null);

  // Focus management for full-screen errors
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (fullScreen && containerRef.current) {
      containerRef.current.focus();
    }
  }, [fullScreen]);

  // Handle keyboard navigation for retry button
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      retry?.();
    }
  };

  const content = (
    <div
      ref={containerRef}
      className="flex flex-col items-center justify-center p-8 text-center"
      role="alert"
      aria-live="assertive"
      aria-labelledby={titleId}
      aria-describedby={descId}
      tabIndex={fullScreen ? -1 : undefined}
      data-testid={testId}
    >
      {/* Error icon */}
      <div className="mb-4 p-3 bg-red-100 rounded-full" aria-hidden="true">
        <svg
          className="h-8 w-8 text-red-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>

      {/* Error title */}
      <h3 id={titleId} className="text-lg font-medium text-gray-900 mb-1">
        {title}
      </h3>

      {/* Error message */}
      <p id={descId} className="text-sm text-gray-600 max-w-md mb-2">
        {message}
      </p>

      {/* Error code */}
      {errorCode && (
        <p className="text-xs text-gray-400 mb-2">
          Error code: <code className="font-mono">{errorCode}</code>
        </p>
      )}

      {/* Technical details (expandable) */}
      {details && (
        <details
          ref={detailsRef}
          className="text-xs text-gray-400 mb-4 max-w-md"
          data-testid={`${testId}-details`}
        >
          <summary className="cursor-pointer hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:ring-offset-2 rounded">
            Technical details
          </summary>
          <pre
            className="mt-2 p-2 bg-gray-100 rounded text-left overflow-auto max-h-40"
            role="region"
            aria-label="Technical error details"
          >
            {details}
          </pre>
        </details>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3" role="group" aria-label="Error actions">
        {retry && (
          <button
            onClick={retry}
            onKeyDown={handleKeyDown}
            className="px-4 py-2 bg-gray-800 text-white text-sm font-medium rounded-md hover:bg-gray-900 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
            type="button"
            data-testid={`${testId}-retry`}
          >
            Try Again
          </button>
        )}
        {supportLink && (
          <a
            href={supportLink}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 rounded-md transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            Get Help
          </a>
        )}
      </div>
    </div>
  );

  if (fullScreen) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center bg-white z-50"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {content}
      </div>
    );
  }

  return content;
};

// ═══════════════════════════════════════════════════════════════════════════════
// SKELETON LOADERS - Accessible
// ═══════════════════════════════════════════════════════════════════════════════

interface SkeletonProps {
  /** Additional CSS classes */
  className?: string;
  /** Accessible label for screen readers */
  label?: string;
  /** Test ID for testing */
  testId?: string;
}

/**
 * Accessible skeleton loader component.
 * Announces loading state to screen readers.
 */
export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  label = 'Loading content',
  testId,
}) => {
  return (
    <div
      className={`animate-pulse bg-gray-200 rounded ${className}`}
      role="status"
      aria-label={label}
      aria-busy="true"
      data-testid={testId}
    >
      <span className="sr-only">{label}</span>
    </div>
  );
};

interface SkeletonTextProps {
  /** Number of lines to display */
  lines?: number;
  /** Accessible label */
  label?: string;
  /** Test ID for testing */
  testId?: string;
}

/**
 * Skeleton text placeholder component.
 */
export const SkeletonText: React.FC<SkeletonTextProps> = ({
  lines = 3,
  label = 'Loading text content',
  testId = 'skeleton-text',
}) => {
  return (
    <div
      className="space-y-2"
      role="status"
      aria-label={label}
      aria-busy="true"
      data-testid={testId}
    >
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={`animate-pulse bg-gray-200 rounded h-4 ${i === lines - 1 ? 'w-3/4' : 'w-full'}`}
          aria-hidden="true"
        />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
};

interface SkeletonCardProps {
  /** Accessible label */
  label?: string;
  /** Test ID for testing */
  testId?: string;
}

/**
 * Skeleton card placeholder component.
 */
export const SkeletonCard: React.FC<SkeletonCardProps> = ({
  label = 'Loading card',
  testId = 'skeleton-card',
}) => {
  return (
    <div
      className="border border-gray-200 rounded-lg p-4 space-y-4"
      role="status"
      aria-label={label}
      aria-busy="true"
      data-testid={testId}
    >
      <div className="flex items-center gap-3">
        <div className="animate-pulse bg-gray-200 h-10 w-10 rounded-full" aria-hidden="true" />
        <div className="flex-1 space-y-2">
          <div className="animate-pulse bg-gray-200 rounded h-4 w-1/3" aria-hidden="true" />
          <div className="animate-pulse bg-gray-200 rounded h-3 w-1/4" aria-hidden="true" />
        </div>
      </div>
      <div className="space-y-2" aria-hidden="true">
        <div className="animate-pulse bg-gray-200 rounded h-4 w-full" />
        <div className="animate-pulse bg-gray-200 rounded h-4 w-3/4" />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
};

interface SkeletonTableProps {
  /** Number of rows */
  rows?: number;
  /** Number of columns */
  columns?: number;
  /** Accessible label */
  label?: string;
  /** Test ID for testing */
  testId?: string;
}

/**
 * Skeleton table placeholder component.
 */
export const SkeletonTable: React.FC<SkeletonTableProps> = ({
  rows = 5,
  columns = 4,
  label = 'Loading table data',
  testId = 'skeleton-table',
}) => {
  return (
    <div
      className="border border-gray-200 rounded-lg overflow-hidden"
      role="status"
      aria-label={label}
      aria-busy="true"
      data-testid={testId}
    >
      {/* Header */}
      <div className="flex gap-4 p-4 bg-gray-50 border-b" aria-hidden="true">
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="animate-pulse bg-gray-200 rounded h-4 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 p-4 border-b last:border-0" aria-hidden="true">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <div key={colIndex} className="animate-pulse bg-gray-200 rounded h-4 flex-1" />
          ))}
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// DATA STATE WRAPPER - Enterprise Grade
// ═══════════════════════════════════════════════════════════════════════════════

interface DataStateWrapperProps<T> {
  /** Whether data is loading */
  isLoading: boolean;
  /** Error object if failed */
  error: Error | null;
  /** The data to display */
  data: T | null | undefined;
  /** Custom loading component */
  loadingComponent?: React.ReactNode;
  /** Loading message */
  loadingMessage?: string;
  /** Custom error component */
  errorComponent?: React.ReactNode;
  /** Custom empty state component */
  emptyComponent?: React.ReactNode;
  /** Empty state title */
  emptyTitle?: string;
  /** Empty state description */
  emptyDescription?: string;
  /** Empty state action */
  emptyAction?: {
    label: string;
    onClick: () => void;
  };
  /** Render function for data */
  children: (data: T) => React.ReactNode;
  /** Retry callback for error state */
  retry?: () => void;
  /** Custom empty check function */
  isEmpty?: (data: T) => boolean;
  /** Test ID prefix */
  testId?: string;
}

/**
 * Enterprise data state wrapper that handles loading, error, and empty states.
 * Provides consistent UX and accessibility across the application.
 */
export function DataStateWrapper<T>({
  isLoading,
  error,
  data,
  loadingComponent,
  loadingMessage,
  errorComponent,
  emptyComponent,
  emptyTitle = 'No data found',
  emptyDescription = "There's nothing here yet.",
  emptyAction,
  children,
  retry,
  isEmpty,
  testId = 'data-state',
}: DataStateWrapperProps<T>): React.ReactElement {
  // Loading state
  if (isLoading) {
    return (
      <>
        {loadingComponent || <LoadingState message={loadingMessage} testId={`${testId}-loading`} />}
      </>
    );
  }

  // Error state
  if (error) {
    return (
      <>
        {errorComponent || (
          <ErrorState message={error.message} retry={retry} testId={`${testId}-error`} />
        )}
      </>
    );
  }

  // Empty state check
  const checkEmpty =
    isEmpty ||
    ((d: T) => {
      if (d === null || d === undefined) return true;
      if (Array.isArray(d) && d.length === 0) return true;
      if (typeof d === 'object' && Object.keys(d).length === 0) return true;
      return false;
    });

  if (!data || checkEmpty(data)) {
    return (
      <>
        {emptyComponent || (
          <EmptyState
            title={emptyTitle}
            description={emptyDescription}
            action={emptyAction}
            testId={`${testId}-empty`}
          />
        )}
      </>
    );
  }

  // Success state - render children with data
  return <>{children(data)}</>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INLINE LOADING INDICATOR
// ═══════════════════════════════════════════════════════════════════════════════

interface InlineLoadingProps {
  /** Accessible label */
  label?: string;
  /** Test ID */
  testId?: string;
}

/**
 * Small inline loading indicator for buttons and inline actions.
 */
export const InlineLoading: React.FC<InlineLoadingProps> = ({
  label = 'Loading',
  testId = 'inline-loading',
}) => {
  return (
    <span
      className="inline-flex items-center gap-1"
      role="status"
      aria-label={label}
      data-testid={testId}
    >
      <span
        className="animate-spin h-3 w-3 border border-current border-t-transparent rounded-full"
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </span>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRESS INDICATOR
// ═══════════════════════════════════════════════════════════════════════════════

interface ProgressIndicatorProps {
  /** Progress value (0-100) */
  value: number;
  /** Maximum value */
  max?: number;
  /** Label */
  label?: string;
  /** Show percentage text */
  showPercentage?: boolean;
  /** Color variant */
  variant?: 'default' | 'success' | 'warning' | 'error';
  /** Size */
  size?: 'sm' | 'md' | 'lg';
  /** Test ID */
  testId?: string;
}

/**
 * Accessible progress indicator component.
 */
export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  value,
  max = 100,
  label,
  showPercentage = true,
  variant = 'default',
  size = 'md',
  testId = 'progress',
}) => {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
  const labelId = useId();

  const variantClasses = {
    default: 'bg-blue-600',
    success: 'bg-green-600',
    warning: 'bg-yellow-500',
    error: 'bg-red-600',
  };

  const sizeClasses = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3',
  };

  return (
    <div className="w-full" data-testid={testId}>
      {(label || showPercentage) && (
        <div className="flex justify-between mb-1 text-sm">
          {label && (
            <span id={labelId} className="text-gray-700">
              {label}
            </span>
          )}
          {showPercentage && (
            <span className="text-gray-500" aria-hidden="true">
              {Math.round(percentage)}%
            </span>
          )}
        </div>
      )}
      <div
        className={`w-full bg-gray-200 rounded-full overflow-hidden ${sizeClasses[size]}`}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-labelledby={label ? labelId : undefined}
        aria-label={!label ? `Progress: ${Math.round(percentage)}%` : undefined}
      >
        <div
          className={`${variantClasses[variant]} ${sizeClasses[size]} rounded-full transition-all duration-300 ease-out`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// INLINE ERROR STATE — Field-level / section-level inline error
// ═══════════════════════════════════════════════════════════════════════════════

interface InlineErrorStateProps {
  /** Error message */
  message: string;
  /** Retry callback */
  retry?: () => void;
  /** Test ID */
  testId?: string;
}

/**
 * Small inline error indicator for field-level or section-level failures.
 * Use when a full ErrorState would be too heavy.
 */
export const InlineErrorState: React.FC<InlineErrorStateProps> = ({
  message,
  retry,
  testId = 'inline-error',
}) => {
  return (
    <div
      className="flex items-center gap-2 text-sm text-red-600 py-1.5"
      role="alert"
      aria-live="assertive"
      data-testid={testId}
    >
      <svg
        className="h-4 w-4 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
      <span>{message}</span>
      {retry && (
        <button
          onClick={retry}
          className="text-xs font-medium text-red-700 hover:text-red-900 underline underline-offset-2 transition-colors"
          type="button"
          data-testid={`${testId}-retry`}
        >
          Retry
        </button>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// NO RESULTS STATE — Search-specific empty with query context
// ═══════════════════════════════════════════════════════════════════════════════

interface NoResultsStateProps {
  /** The search query that returned no results */
  query?: string;
  /** Suggestion text */
  suggestion?: string;
  /** Action to clear/reset search */
  onClear?: () => void;
  /** Test ID */
  testId?: string;
}

/**
 * Search-specific empty state showing what was searched and how to recover.
 */
export const NoResultsState: React.FC<NoResultsStateProps> = ({
  query,
  suggestion = 'Try broadening your search or adjusting filters.',
  onClear,
  testId = 'no-results',
}) => {
  const titleId = useId();

  return (
    <div
      className="flex flex-col items-center justify-center p-8 text-center"
      role="region"
      aria-labelledby={titleId}
      data-testid={testId}
    >
      <div className="mb-3 p-3 bg-gray-100 rounded-full" aria-hidden="true">
        <svg
          className="h-6 w-6 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>
      <h3 id={titleId} className="text-sm font-medium text-gray-900 mb-1">
        {query ? `No results for "${query}"` : 'No results found'}
      </h3>
      <p className="text-xs text-gray-500 max-w-sm mb-3">{suggestion}</p>
      {onClear && (
        <button
          onClick={onClear}
          className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
          type="button"
          data-testid={`${testId}-clear`}
        >
          Clear search
        </button>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCKED STATE — Permission denied / locked / unauthorized
// ═══════════════════════════════════════════════════════════════════════════════

interface BlockedStateProps {
  /** What is blocked */
  title?: string;
  /** Why it is blocked */
  message: string;
  /** Action to request access or navigate away */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Test ID */
  testId?: string;
}

/**
 * Blocked/permission-denied state. Use when the user cannot access a resource.
 */
export const BlockedState: React.FC<BlockedStateProps> = ({
  title = 'Access restricted',
  message,
  action,
  testId = 'blocked-state',
}) => {
  const titleId = useId();
  const descId = useId();

  return (
    <div
      className="flex flex-col items-center justify-center p-8 text-center"
      role="region"
      aria-labelledby={titleId}
      aria-describedby={descId}
      data-testid={testId}
    >
      <div className="mb-4 p-3 bg-amber-50 rounded-full" aria-hidden="true">
        <svg
          className="h-7 w-7 text-amber-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
      </div>
      <h3 id={titleId} className="text-sm font-medium text-gray-900 mb-1">
        {title}
      </h3>
      <p id={descId} className="text-xs text-gray-500 max-w-sm mb-3">
        {message}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
          type="button"
          data-testid={`${testId}-action`}
        >
          {action.label}
        </button>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MISSING CONFIGURATION STATE — Setup required / not configured
// ═══════════════════════════════════════════════════════════════════════════════

interface MissingConfigurationStateProps {
  /** What is not configured */
  title?: string;
  /** Description of what needs to be set up */
  message: string;
  /** Action to begin configuration */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Test ID */
  testId?: string;
}

/**
 * Missing configuration state. Use when a feature requires setup before use.
 */
export const MissingConfigurationState: React.FC<MissingConfigurationStateProps> = ({
  title = 'Configuration required',
  message,
  action,
  testId = 'missing-config',
}) => {
  const titleId = useId();
  const descId = useId();

  return (
    <div
      className="flex flex-col items-center justify-center p-8 text-center"
      role="region"
      aria-labelledby={titleId}
      aria-describedby={descId}
      data-testid={testId}
    >
      <div className="mb-4 p-3 bg-blue-50 rounded-full" aria-hidden="true">
        <svg
          className="h-7 w-7 text-blue-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </div>
      <h3 id={titleId} className="text-sm font-medium text-gray-900 mb-1">
        {title}
      </h3>
      <p id={descId} className="text-xs text-gray-500 max-w-sm mb-3">
        {message}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-stone-400"
          type="button"
          data-testid={`${testId}-action`}
        >
          {action.label}
        </button>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  LoadingState,
  EmptyState,
  ErrorState,
  Skeleton,
  SkeletonText,
  SkeletonCard,
  SkeletonTable,
  DataStateWrapper,
  InlineLoading,
  InlineErrorState,
  NoResultsState,
  BlockedState,
  MissingConfigurationState,
  ProgressIndicator,
};
