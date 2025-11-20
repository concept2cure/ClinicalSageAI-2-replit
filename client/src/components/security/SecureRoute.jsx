import React, { useEffect } from 'react';
import { Route, useLocation, Redirect } from 'wouter';
import { useSecurityContext } from './SecurityProvider';

/**
 * SecureRoute Component
 * Enhanced route component that adds security features:
 * - Authentication verification
 * - Session validation
 * - Route auditing
 * - Security posture enforcement
 *
 * @param {Object} props
 * @param {string} props.path - Route path
 * @param {React.Component} props.component - Component to render
 * @param {boolean} props.requireAuth - Whether authentication is required
 * @param {string} props.requiredRole - Role required to access the route
 * @param {number} props.securityLevel - Security level (1-5) with different enforcement
 * @returns {JSX.Element}
 */
export function SecureRoute({
  path,
  component: Component,
  requireAuth = true,
  requiredRole = null,
  securityLevel = 3,
}) {
  const { sessionActive, refreshSession } = useSecurityContext();
  const [location] = useLocation();

  // Security audit logging
  useEffect(() => {
    if (securityLevel >= 3) {
      // Log route navigation (for security audit trails)
      console.info(
        `Route access [${new Date().toISOString()}]: ` +
          `Path: ${path} | Auth required: ${requireAuth} | ` +
          `Security level: ${securityLevel}`
      );
    }

    // Refresh session on navigation
    refreshSession();

    // Additional security checks based on securityLevel
    if (securityLevel >= 4) {
      // Enhanced security checks for sensitive routes
      const sensitivePathPatterns = ['/admin', '/settings', '/billing', '/api-keys'];
      if (sensitivePathPatterns.some(pattern => path.includes(pattern))) {
        // Re-validate session on sensitive route access
        if (!sessionActive) {
          console.warn(
            `Security alert: Inactive session attempted to access sensitive route: ${path}`
          );
        }

        // Additional security validations could go here
        // ...
      }
    }
  }, [path, requireAuth, securityLevel, sessionActive, refreshSession]);

  return (
    <Route path={path}>
      {() => {
        // Check for session validity
        if (requireAuth && !sessionActive) {
          console.warn(`Access denied: Inactive session attempted to access: ${path}`);
          return <Redirect to="/login" />;
        }

        // Role-based access control
        if (requiredRole && sessionActive) {
          const userRole = localStorage.getItem('userRole');
          if (userRole !== requiredRole) {
            console.warn(
              `Access denied: Insufficient role (${userRole}) for route requiring ${requiredRole}`
            );
            return <Redirect to="/unauthorized" />;
          }
        }

        // Access granted, render component with security context
        return <Component />;
      }}
    </Route>
  );
}

export default SecureRoute;
