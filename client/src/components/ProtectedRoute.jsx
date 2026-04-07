import React, { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '../portal-v2/services/authService';

/**
 * Protected Route Component
 *
 * Ensures the user is authenticated before rendering children components.
 * Redirects to the login page if not authenticated.
 */
export const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    // Only redirect after we've checked authentication status
    if (!isLoading && !isAuthenticated) {
      // Store the attempted URL for redirecting back after login
      sessionStorage.setItem('redirectAfterLogin', location);

      // Redirect to login
      setLocation('/concept2cure/login');
    }
  }, [isAuthenticated, isLoading, location, setLocation]);

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Only render children if authenticated
  return isAuthenticated ? children : null;
};

export default ProtectedRoute;
