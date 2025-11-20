import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  Database,
  FileText,
  FlaskConical,
  BarChartBig,
  ShieldCheck,
  BookText,
  Building,
} from 'lucide-react';
import { useModuleIntegration } from './integration/ModuleIntegrationLayer';
import TrialVaultModule from './trial-vault/TrialVaultModule';
import ClientPortal from './client-portal/ClientPortal';

const UnifiedPlatform = () => {
  const { addAuditEntry } = useModuleIntegration();
  const [location, navigate] = useLocation();
  const [activeModule, setActiveModule] = useState('');

  // Determine which module to load based on the current URL
  useEffect(() => {
    const path = location.split('/')[1]; // Get the first part of the URL path
    let module = path;

    // Map URL paths to module names
    if (path === 'portal') {
      module = 'client-portal';
    } else if (path === 'vault') {
      module = 'vault';
    } else if (!path || path === '') {
      module = 'client-portal'; // Default to client portal
    }

    setActiveModule(module);
    handleModuleClick(module);
  }, [location]);

  const handleModuleClick = moduleName => {
    addAuditEntry('module_selected', { module: moduleName });
  };

  // Render the appropriate module based on the URL
  const renderModule = () => {
    switch (activeModule) {
      case 'vault':
        return <TrialVaultModule />;
      case 'client-portal':
        return <ClientPortal />;
      default:
        return <ClientPortal />;
    }
  };

  return <div className="flex flex-col">{renderModule()}</div>;
};

export default UnifiedPlatform;
