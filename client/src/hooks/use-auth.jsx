import { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';
import { useToast } from './use-toast';

// Create a context for authentication data and functions
const AuthContext = createContext(null);

// AuthProvider component will wrap the app and provide auth state
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Check if user is logged in on initial load
  useEffect(() => {
    const checkLoggedIn = async () => {
      const token = localStorage.getItem('token');

      if (token) {
        try {
          // Validate token and get user data
          const response = await api.get('/user');
          setUser(response.data);
        } catch (error) {
          console.error('Auth token validation error:', error);
          // If token is invalid, remove it
          localStorage.removeItem('token');
        }
      }

      setLoading(false);
    };

    checkLoggedIn();
  }, []);

  // Login function - calls real backend API
  const login = async credentials => {
    try {
      // Call the real backend auth API (api base is /api, so just use /auth/login)
      const response = await api.post('/auth/login', {
        email: credentials.username, // Backend accepts email or username
        password: credentials.password,
      });

      const { token, user } = response.data;

      // Save token to localStorage
      localStorage.setItem('token', token);

      // Update user state
      setUser(user);

      // Set token on the API instance
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      toast({
        title: 'Login successful',
        description: `Welcome back, ${user.name || user.username}!`,
        variant: 'default',
      });

      return true;
    } catch (error) {
      console.error('Login error:', error);

      toast({
        title: 'Login failed',
        description: error.response?.data?.message || 'Invalid username or password',
        variant: 'destructive',
      });

      return false;
    }
  };

  // Register function - calls real backend API
  const register = async userData => {
    try {
      // Call the real backend registration API
      const response = await api.post('/auth/register', {
        email: userData.email,
        username: userData.username,
        password: userData.password,
        name: userData.name || userData.username,
      });

      const { token, user } = response.data;

      // Save token to localStorage
      localStorage.setItem('token', token);

      // Update user state
      setUser(user);

      // Set token on the API instance
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      toast({
        title: 'Registration successful',
        description: `Welcome, ${user.name || user.username}!`,
        variant: 'default',
      });

      return true;
    } catch (error) {
      console.error('Registration error:', error);

      toast({
        title: 'Registration failed',
        description: error.response?.data?.message || 'Registration failed. Please try again.',
        variant: 'destructive',
      });

      return false;
    }
  };

  // Logout function
  const logout = () => {
    // Remove token from localStorage
    localStorage.removeItem('token');

    // Clear user data
    setUser(null);

    // Remove auth header
    delete api.defaults.headers.common['Authorization'];

    toast({
      title: 'Logged out',
      description: 'You have been successfully logged out.',
    });
  };

  // Create the auth context value
  const contextValue = {
    user,
    loading,
    login,
    register,
    logout,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

// Custom hook for using the auth context
export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
};

export default useAuth;
