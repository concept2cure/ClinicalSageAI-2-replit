// Sibling declaration for ErrorBoundary.jsx so .tsx callers (main.tsx)
// don't trip TS7016. The .jsx component accepts these props but is
// untyped on the JSX side; tighten when migrated to .tsx.
import type { ComponentType, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children?: ReactNode;
  fallback?: ReactNode | ((args: { error: unknown; resetErrorBoundary: () => void }) => ReactNode);
  title?: string;
  description?: string;
  showHomeButton?: boolean;
  onReset?: () => void;
}

declare const ErrorBoundary: ComponentType<ErrorBoundaryProps>;

export default ErrorBoundary;
export { ErrorBoundary };
