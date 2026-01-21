import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { getAccessToken } from '../../lib/authClient';
import securityService from '../../services/SecurityService';

const LoadingGate = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
  </div>
);

const AuthRoute = ({ children, redirectTo = '/login' }) => {
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = getAccessToken();
        if (!token) {
          setAllowed(false);
          setLocation(redirectTo);
          return;
        }

        const initialized = await securityService.initialize().catch(() => false);
        if (!initialized) {
          setAllowed(true);
          return;
        }
        setAllowed(true);
      } catch (error) {
        console.error('AuthRoute error:', error);
        const token = getAccessToken();
        if (token) {
          setAllowed(true);
          return;
        }
        setAllowed(false);
        setLocation(redirectTo);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [redirectTo, setLocation]);

  if (loading) return <LoadingGate />;
  return allowed ? children : null;
};

export default AuthRoute;
