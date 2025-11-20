/**
 * Tenant Context Provider
 *
 * This context manages organization and client workspace selection,
 * providing tenant context across the entire application.
 *
 * It handles:
 * - Loading available organizations and client workspaces
 * - Setting the current organization and client workspace
 * - Persisting selections to localStorage
 * - Providing tenant headers for API requests
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface Organization {
  id: string | number;
  name: string;
  slug?: string;
  domain?: string;
  industryType?: string;
  status?: string;
  logo?: string;
}

interface ClientWorkspace {
  id: string;
  name: string;
  organizationId: string;
  logo?: string;
}

interface Module {
  id: string;
  name: string;
  path: string;
  icon?: string;
}

interface TenantContextType {
  // Organizations
  organizations: Organization[];
  currentOrganization: Organization | null;
  setCurrentOrganization: (org: Organization | null) => void;

  // Client Workspaces
  clientWorkspaces: ClientWorkspace[];
  currentClientWorkspace: ClientWorkspace | null;
  setCurrentClientWorkspace: (client: ClientWorkspace | null) => void;
  filteredClientWorkspaces: ClientWorkspace[];

  // Modules
  modules: Module[];
  currentModule: Module | null;
  setCurrentModule: (module: Module | null) => void;

  // Loading states
  isLoading: boolean;

  // API Headers
  getTenantHeaders: () => Record<string, string>;

  // Refresh functions
  refreshClientWorkspaces: () => Promise<ClientWorkspace[]>;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export const useTenantContext = () => {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenantContext must be used within a TenantProvider');
  }
  return context;
};

// Export the same hook with an alternate name to maintain backward compatibility
// with components using the old name
export const useTenant = () => {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
};

interface TenantProviderProps {
  children: ReactNode;
}

export const TenantProvider = ({ children }: TenantProviderProps) => {
  // State for organizations
  const [organizations, setOrganizations] = React.useState<Organization[]>([]);
  const [currentOrganization, setCurrentOrganization] = React.useState<Organization | null>(null);

  // State for client workspaces
  const [clientWorkspaces, setClientWorkspaces] = React.useState<ClientWorkspace[]>([]);
  const [currentClientWorkspace, setCurrentClientWorkspace] =
    React.useState<ClientWorkspace | null>(null);

  // State for modules
  const [modules, setModules] = useState<Module[]>([
    { id: 'cer', name: 'Clinical Evaluation Reports', path: '/cer', icon: 'file-text' },
    { id: 'ind', name: 'IND Wizard', path: '/ind-wizard', icon: 'wand-2' },
    { id: 'vault', name: 'Document Vault', path: '/vault', icon: 'archive' },
    { id: 'csr', name: 'CSR Builder', path: '/csr', icon: 'file-code' },
  ]);
  const [currentModule, setCurrentModule] = useState<Module | null>(null);

  // Loading state
  const [isLoading, setIsLoading] = useState(true);

  // Filter client workspaces based on selected organization
  // If no organization is selected, show all client workspaces
  // If an organization is selected, show only workspaces from that organization
  const filteredClientWorkspaces = currentOrganization
    ? clientWorkspaces.filter(c => c.organizationId === String(currentOrganization.id))
    : clientWorkspaces; // Show all when no organization selected

  // Global client workspaces (all clients from all organizations)
  const globalClientWorkspaces = clientWorkspaces;

  // Removed console.log to prevent potential API key exposure

  // Load organizations and client workspaces from database
  useEffect(() => {
    const loadTenantData = async () => {
      setIsLoading(true);

      try {
        // Fetch organizations from database API
        const response = await fetch('/api/tenants');
        if (!response.ok) {
          throw new Error('Failed to fetch organizations');
        }

        const orgData: Organization[] = await response.json();
        // Organizations loaded successfully

        // Fetch all client workspaces for all organizations
        let allClientWorkspaces: ClientWorkspace[] = [];

        for (const org of orgData) {
          try {
            const clientResponse = await fetch(`/api/clients?organizationId=${org.id}`);
            if (clientResponse.ok) {
              const clientResult = await clientResponse.json();
              if (clientResult.success && clientResult.clients) {
                const orgClients = clientResult.clients.map((client: any) => ({
                  id: client.id,
                  name: client.name,
                  organizationId: String(client.organizationId),
                  logo: client.logo,
                }));
                allClientWorkspaces = [...allClientWorkspaces, ...orgClients];
              }
            }
          } catch (error) {
            console.error(`Error fetching client workspaces for organization ${org.id}:`, error);
          }
        }

        // Client workspaces loaded successfully

        setOrganizations(orgData);
        setClientWorkspaces(allClientWorkspaces);

        // Don't clear localStorage on every page load - only clear if corrupted
        // Checking localStorage state...

        // Load saved preferences from localStorage
        const savedOrgId = localStorage.getItem('currentOrganizationId');
        const savedClientId = localStorage.getItem('currentClientWorkspaceId');
        const savedModuleId = localStorage.getItem('currentModuleId');

        // TenantContext initialization in progress

        let selectedOrg = null;
        if (savedOrgId) {
          selectedOrg = orgData.find(o => String(o.id) === savedOrgId);
          // Found saved organization
        }

        // If no saved organization or saved org not found, auto-select Biotech Innovations
        // to access real pharmaceutical data
        if (!selectedOrg && orgData.length > 0) {
          // No saved organization - auto-selecting for CMC data access
          // Auto-select Biotech Innovations (ID: 7) which contains the Pembrolizumab project
          selectedOrg = orgData.find(o => o.id === 7 || o.id === '7') || orgData[0];
          // Auto-selected organization
        }

        if (selectedOrg) {
          // Setting current organization
          setCurrentOrganization(selectedOrg);
        }

        // Handle client workspace selection
        let selectedClient = null;
        if (savedClientId && selectedOrg) {
          const savedClient = allClientWorkspaces.find(c => c.id === savedClientId);
          if (savedClient && savedClient.organizationId === String(selectedOrg.id)) {
            // Saved client is valid for current organization
            selectedClient = savedClient;
            // Restoring saved client workspace
          }
        }

        // If no valid saved client, auto-select first client workspace for the organization
        if (!selectedClient && selectedOrg && allClientWorkspaces.length > 0) {
          const firstClientForOrg = allClientWorkspaces.find(
            c => c.organizationId === String(selectedOrg.id)
          );
          if (firstClientForOrg) {
            selectedClient = firstClientForOrg;
            // Auto-selecting first client workspace
          }
        }

        if (selectedClient) {
          setCurrentClientWorkspace(selectedClient);
        }

        if (savedModuleId) {
          const savedModule = modules.find(m => m.id === savedModuleId);
          if (savedModule) setCurrentModule(savedModule);
        }
      } catch (error) {
        console.error('Error loading tenant data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadTenantData();
  }, []);

  // Save selections to localStorage
  useEffect(() => {
    if (currentOrganization) {
      localStorage.setItem('currentOrganizationId', String(currentOrganization.id));
    } else {
      localStorage.removeItem('currentOrganizationId');
    }
  }, [currentOrganization]);

  useEffect(() => {
    if (currentClientWorkspace) {
      localStorage.setItem('currentClientWorkspaceId', currentClientWorkspace.id);
    } else {
      localStorage.removeItem('currentClientWorkspaceId');
    }
  }, [currentClientWorkspace]);

  useEffect(() => {
    if (currentModule) {
      localStorage.setItem('currentModuleId', currentModule.id);
    } else {
      localStorage.removeItem('currentModuleId');
    }
  }, [currentModule]);

  // Reset client workspace when organization changes if client doesn't belong to new org
  useEffect(() => {
    if (currentOrganization && currentClientWorkspace) {
      // Check if current client workspace belongs to the selected organization
      const clientBelongsToOrg =
        currentClientWorkspace.organizationId === String(currentOrganization.id);

      if (!clientBelongsToOrg) {
        // Client workspace does not belong to current organization, clearing...
        setCurrentClientWorkspace(null);

        // Auto-select first client workspace from the new organization
        const firstClientForOrg = clientWorkspaces.find(
          c => c.organizationId === String(currentOrganization.id)
        );
        if (firstClientForOrg) {
          // Auto-selecting first client workspace for new organization
          setCurrentClientWorkspace(firstClientForOrg);
        }
      }
    }
  }, [currentOrganization, clientWorkspaces]);

  // Helper to get tenant headers for API requests
  const getTenantHeaders = () => {
    const headers: Record<string, string> = {};

    if (currentOrganization) {
      headers['X-Org-ID'] = String(currentOrganization.id);
    }

    if (currentClientWorkspace) {
      headers['X-Client-ID'] = currentClientWorkspace.id;
    }

    if (currentModule) {
      headers['X-Module'] = currentModule.id;
    }

    return headers;
  };

  // Function to refresh client workspaces from the database
  const refreshClientWorkspaces = async () => {
    // Refreshing client workspaces from database
    try {
      let allClientWorkspaces: ClientWorkspace[] = [];

      for (const org of organizations) {
        try {
          // Fetching client workspaces for organization
          const clientResponse = await fetch(`/api/clients?organizationId=${org.id}`);
          if (clientResponse.ok) {
            const clientResult = await clientResponse.json();
            if (clientResult.success && clientResult.clients) {
              // Found client workspaces for organization
              const orgClients = clientResult.clients.map((client: any) => ({
                id: client.id,
                name: client.name,
                organizationId: String(client.organizationId),
                logo: client.logo,
              }));
              allClientWorkspaces = [...allClientWorkspaces, ...orgClients];
            }
          }
        } catch (error) {
          console.error(`Error fetching client workspaces for organization ${org.id}:`, error);
        }
      }

      // Refreshed client workspaces - setting new data
      setClientWorkspaces(allClientWorkspaces);

      return allClientWorkspaces;
    } catch (error) {
      console.error('Error refreshing client workspaces:', error);
      return [];
    }
  };

  // Custom handlers for organization and client workspace selection
  const handleSetCurrentOrganization = (org: Organization | null) => {
    setCurrentOrganization(org);

    // NOTE: Removed organization-based client workspace auto-selection per user preference
    // User wants to allow cross-organization client workspace selection
    // Client workspace selection is now independent of organization selection

    // Only auto-select a client workspace if none is currently selected
    if (org && !currentClientWorkspace && clientWorkspaces.length > 0) {
      // Try to find a client from the selected organization first, but allow any client as fallback
      const firstClientForOrg = clientWorkspaces.find(c => c.organizationId === String(org.id));
      const firstAvailableClient = firstClientForOrg || clientWorkspaces[0];
      if (firstAvailableClient) {
        // No client selected - auto-selecting first available client workspace
        setCurrentClientWorkspace(firstAvailableClient);
      }
    } else if (!org) {
      // If organization is cleared, clear client workspace too
      setCurrentClientWorkspace(null);
    }
  };

  return (
    <TenantContext.Provider
      value={{
        // Organizations
        organizations,
        currentOrganization,
        setCurrentOrganization: handleSetCurrentOrganization,

        // Client Workspaces
        clientWorkspaces,
        currentClientWorkspace,
        setCurrentClientWorkspace,
        filteredClientWorkspaces,

        // Modules
        modules,
        currentModule,
        setCurrentModule,

        // Loading state
        isLoading,

        // API Headers
        getTenantHeaders,

        // Refresh function
        refreshClientWorkspaces,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
};

export default TenantContext;
