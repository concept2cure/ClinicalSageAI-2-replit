import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';

/**
 * Higher-order component (HOC) to protect routes that require authentication
 *
 * @param {React.ComponentType} Component - The component to be protected
 * @returns {React.ComponentType} - The protected component
 */
const withAuthGuard = Component => {
  const ProtectedComponent = props => {
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [loading, setLoading] = useState(true);
    const [, setLocation] = useLocation();

    useEffect(() => {
      // Check if user is authenticated
      const token = localStorage.getItem('token');

      if (!token) {
        // Redirect to login page if no token found
        setLocation('/auth');
      } else {
        // Token exists, user is authenticated
        setIsAuthorized(true);
      }

      setLoading(false);
    }, [setLocation]);

    // Show loading spinner while checking authentication
    if (loading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700"></div>
        </div>
      );
    }

    // Render the protected component if authorized
    return isAuthorized ? <Component {...props} /> : null;
  };

  return ProtectedComponent;
};

export default withAuthGuard;
