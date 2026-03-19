/**
 * Client Context Bar Component
 *
 * This component provides the organization context for the current user session
 * in the multi-tenant Concept2Cure platform.
 */

import React, { useState } from 'react';
import { Building, ChevronDown } from 'lucide-react';
import { useIntegration } from '../integration/ModuleIntegrationLayer';
import OrganizationSwitcher from './OrganizationSwitcher';

const ClientContextBar = () => {
  const { securityService } = useIntegration();
  const [showOrgSwitcher, setShowOrgSwitcher] = useState(false);

  const currentUser = securityService.currentUser;
  const currentOrg = securityService.getCurrentOrganization();

  // Toggle organization switcher
  const toggleOrgSwitcher = () => {
    setShowOrgSwitcher(!showOrgSwitcher);
  };

  // Handle organization switch
  const handleSwitchOrg = async orgId => {
    try {
      await securityService.switchOrganization(orgId);
      setShowOrgSwitcher(false);
      // In a real app, this might reload certain data
    } catch (error) {
      console.error('Error switching organization:', error);
    }
  };

  // Get organization type badge class
  const getOrgTypeBadgeClass = type => {
    switch (type?.toLowerCase()) {
      case 'cro':
        return 'bg-blue-100 text-blue-800';
      case 'pharma':
        return 'bg-purple-100 text-purple-800';
      case 'biotech':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (!currentUser || !currentOrg) {
    return null; // Don't render if no user or org
  }

  return (
    <div className="bg-gray-100 py-1.5 px-4 border-b text-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <button
            onClick={toggleOrgSwitcher}
            className="flex items-center hover:bg-gray-200 rounded px-2 py-1"
          >
            <Building size={16} className="mr-2 text-gray-500" />
            <span className="font-medium">{currentOrg.name}</span>
            <ChevronDown size={14} className="ml-1 text-gray-500" />
          </button>

          <span className="mx-2 text-gray-300">|</span>

          <span
            className={`px-2 py-0.5 rounded text-xs font-medium ${getOrgTypeBadgeClass(currentOrg.type)}`}
          >
            {currentOrg.type}
          </span>

          <span className="mx-2 text-gray-400 hidden md:inline">•</span>

          <span className="text-gray-500 hidden md:inline">
            Role: <span className="font-medium">{currentOrg.role}</span>
          </span>
        </div>

        <div className="flex items-center text-xs text-gray-500">
          <span>
            Serving <span className="font-medium">{securityService.getClientCount()}</span> clients
          </span>
          <span className="mx-2">•</span>
          <span>
            Last updated: <time dateTime={currentOrg.lastUpdated}>{currentOrg.lastUpdated}</time>
          </span>
        </div>
      </div>

      {/* Organization Switcher Modal */}
      {showOrgSwitcher && (
        <OrganizationSwitcher
          onClose={() => setShowOrgSwitcher(false)}
          onSwitchOrg={handleSwitchOrg}
        />
      )}
    </div>
  );
};

export default ClientContextBar;
