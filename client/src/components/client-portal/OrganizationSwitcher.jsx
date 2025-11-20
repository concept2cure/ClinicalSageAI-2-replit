/**
 * Organization Switcher Component
 *
 * This component provides an interface for switching between organizations
 * in the multi-tenant TrialSage platform.
 */

import React, { useState } from 'react';
import { Search, Building, Globe, X, CheckCircle } from 'lucide-react';
import { useIntegration } from '../integration/ModuleIntegrationLayer';

const OrganizationSwitcher = ({ onClose, onSwitchOrg }) => {
  const { securityService } = useIntegration();
  const [searchQuery, setSearchQuery] = useState('');

  const currentOrg = securityService.getCurrentOrganization();
  const accessibleOrgs = securityService.getAccessibleOrganizations();

  // Filter organizations based on search query
  const filteredOrgs = accessibleOrgs.filter(org =>
    org.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get organization type icon
  const getOrgIcon = type => {
    switch (type) {
      case 'cro':
        return <Globe size={20} className="text-blue-500" />;
      case 'pharma':
        return <Building size={20} className="text-purple-500" />;
      case 'biotech':
        return <Building size={20} className="text-green-500" />;
      default:
        return <Building size={20} className="text-gray-500" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4 sm:px-0">
      <div className="absolute inset-0 bg-black/25" onClick={onClose}></div>

      <div className="bg-white rounded-lg shadow-xl w-full max-w-md z-10 relative">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h3 className="font-semibold">Switch Organization</h3>
          <button className="text-gray-400 hover:text-gray-500" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="p-4">
          {/* Search */}
          <div className="relative mb-4">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search size={16} className="text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full bg-gray-100 border-transparent pl-10 pr-3 py-2 rounded-md focus:bg-white focus:border-gray-300 focus:ring-0 text-sm"
              placeholder="Search organizations..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Organization list */}
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {filteredOrgs.length > 0 ? (
              filteredOrgs.map(org => (
                <button
                  key={org.id}
                  className={`w-full text-left p-3 rounded-md flex items-center ${
                    currentOrg && org.id === currentOrg.id
                      ? 'bg-primary-light border border-primary'
                      : 'hover:bg-gray-50 border border-gray-200'
                  }`}
                  onClick={() => onSwitchOrg(org.id)}
                >
                  <div className="mr-3">{getOrgIcon(org.type)}</div>

                  <div className="flex-1">
                    <h4 className="font-medium">
                      {org.name}
                      {currentOrg && org.id === currentOrg.id && (
                        <span className="text-xs ml-2 text-primary-dark">Current</span>
                      )}
                    </h4>
                    <div className="text-xs text-gray-500 flex items-center mt-0.5">
                      <span className="uppercase">{org.type}</span>
                      <span className="mx-1">•</span>
                      <span className="capitalize">{org.role}</span>
                    </div>
                  </div>

                  {currentOrg && org.id === currentOrg.id && (
                    <div className="text-primary">
                      <CheckCircle size={16} />
                    </div>
                  )}
                </button>
              ))
            ) : (
              <div className="text-center py-6 text-gray-500">
                <Building size={32} className="mx-auto mb-2 text-gray-400" />
                <p>No organizations found</p>
              </div>
            )}
          </div>

          {/* Manage organizations link */}
          <div className="mt-4 pt-4 border-t text-center">
            <a
              href="#manage-organizations"
              className="text-sm text-primary hover:text-primary-dark"
            >
              Manage Organizations
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrganizationSwitcher;
