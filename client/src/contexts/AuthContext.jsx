// import React, { createContext, useState, useEffect, useContext } from 'react';

/**
 * @deprecated Legacy auth context. Use portal-v2 authService provider instead.
 */
export {};
/*
export const AuthContext = createContext({ role: 'viewer' });

// Custom hook for using auth context
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [role, setRole] = useState('viewer');

  useEffect(() => {
    // Fetch user info from server or window.__USER__
    // For now, simulate a network request
    const simulateFetch = async () => {
      // In a real app, this would be an actual API call
      // fetch('/api/user/me')
      //   .then(res => res.json())
      //   .then(data => setRole(data.role));

      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 300));

      // For development, we'll use window.__USER__ if available
      if (window.__USER__?.role) {
        setRole(window.__USER__.role);
      } else {
        // Default role if no user info found
        setRole('viewer');

        // For development purposes only - expose a way to change roles
        // Remove this in production
        window.setUserRole = newRole => {
          if (['viewer', 'editor', 'admin'].includes(newRole)) {
            setRole(newRole);
            console.log(`Role changed to: ${newRole}`);
          } else {
            console.error(`Invalid role: ${newRole}. Valid roles are: viewer, editor, admin`);
          }
        };
      }
    };

    simulateFetch();
  }, []);

  // Provide role and helper methods
  const value = {
    role,
    canEdit: role === 'editor' || role === 'admin',
    canView: true, // All roles can view
    canAdmin: role === 'admin',
    // Helper method to check permissions
    hasPermission: action => {
      switch (action) {
        case 'view':
          return true; // All roles can view
        case 'edit':
          return role === 'editor' || role === 'admin';
        case 'admin':
          return role === 'admin';
        default:
          return false;
      }
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

*/
