import React, { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '../hooks/use-auth';

/**
 * AuthRedirector Component
 *
 * This component checks if the user is authenticated and redirects them
 * to the enhanced client portal page instead of the home page.
 *
 * For non-authenticated users, it renders the children (marketing home page)
 */
const AuthRedirector = ({ children }) => {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && user) {
      // Check if the user is a Founder (user role or username can indicate this)
      // For this example, we're directing all logged-in users to Lumen Bio landing
      // In a real implementation, you would check user.role === "founder" or similar
      if (user.username === 'founder' || user.role === 'founder') {
        // Redirect founder accounts to Lumen Bio landing page
        setLocation('/lumen-bio');
      } else {
        // Redirect other authenticated users to the enhanced client portal
        setLocation('/portal/client');
      }
    }
  }, [user, isLoading, setLocation]);

  // While checking authentication status, show a loading indicator
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full"></div>
        <p className="ml-4 text-lg font-medium text-black">Preparing your Concept2Cure workspace...</p>
      </div>
    );
  }

  // For non-authenticated users, render the children (marketing page)
  return children;
};

export default AuthRedirector;
