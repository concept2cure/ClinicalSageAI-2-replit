import { useState, useEffect, createContext, useContext } from 'react';

// Create an auth context
const AuthContext = createContext(null);

// Auth provider component
export function AuthProvider({ children }) {
  const [session, setSession] = useState({
    user: { canEdit: true }, // Default to allowing edit for development
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // In a real app, we would fetch the session data from a backend API
    const checkSession = async () => {
      try {
        // Simulating API call
        await new Promise(resolve => setTimeout(resolve, 500));

        // Mock user response
        setSession({
          user: {
            id: 1,
            username: 'demo_user',
            display_name: 'Demo User',
            canEdit: true, // For RBAC in documents
          },
          isAuthenticated: true,
        });
      } catch (error) {
        console.error('Failed to fetch session:', error);
        setSession({ isAuthenticated: false });
      } finally {
        setLoading(false);
      }
    };

    checkSession();
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading, setSession }}>{children}</AuthContext.Provider>
  );
}

// Hook to use auth context
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
