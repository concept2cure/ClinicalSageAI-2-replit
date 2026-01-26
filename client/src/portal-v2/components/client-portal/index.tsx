/**
 * Client Portal V2 entry point (legacy)
 *
 * This is a legacy component - use ClientPortalV2.tsx instead.
 */
import React from 'react';
import { PortalProvider } from '../../core/portalContext';
import { PortalFrame } from '../../layouts/PortalFrame';
import { Dashboard } from './Dashboard';

export { Dashboard } from './Dashboard';

const ClientPortalV2: React.FC = () => {
  return (
    <PortalProvider>
      <PortalFrame>
        <Dashboard />
      </PortalFrame>
    </PortalProvider>
  );
};

export { ClientPortalV2 };
export default ClientPortalV2;
