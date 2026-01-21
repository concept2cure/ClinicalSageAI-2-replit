import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import securityService from '../../services/SecurityService';
import { getAccessToken } from '../../lib/authClient';

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
        const token = getAccessToken();
        if (!token) {
          setAllowed(false);
          setLocation('/login');
          return;
        }

        const initialized = await securityService.initialize().catch(() => false);
        if (!initialized) {
          setAllowed(true);
          return;
        }
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
        const token = getAccessToken();
        if (token) {
          setAllowed(true);
          return;
        }
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
