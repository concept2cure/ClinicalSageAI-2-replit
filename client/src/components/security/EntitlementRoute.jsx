import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import securityService from '../../services/SecurityService';
import { authService } from '../../services/authService';

const LoadingGate = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
  </div>
);

const EntitlementRoute = ({ moduleId, children, fallbackPath = '/subscriptions' }) => {
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const token = authService.getToken();
        if (!token) {
          setAllowed(false);
          setLocation('/login');
          return;
        }

        await securityService.initialize();
        const moduleIds = Array.isArray(moduleId) ? moduleId : [moduleId];
        const hasAccess = moduleIds.some(id => securityService.hasModuleAccess(id));
        if (!hasAccess) {
          setAllowed(false);
          setLocation(fallbackPath);
          return;
        }

        setAllowed(true);
      } catch (error) {
        console.error('EntitlementRoute error:', error);
        setAllowed(false);
        setLocation('/login');
      } finally {
        setLoading(false);
      }
    };

    checkAccess();
  }, [moduleId, setLocation, fallbackPath]);

  if (loading) return <LoadingGate />;
  return allowed ? children : null;
};

export default EntitlementRoute;
