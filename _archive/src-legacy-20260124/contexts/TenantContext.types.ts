/**
 * Type definitions for TenantContext
 */

export interface Organization {
  id: string;
  name: string;
  logo?: string;
}

export interface ClientWorkspace {
  id: string;
  name: string;
  organizationId: string;
  logo?: string;
}

export interface Module {
  id: string;
  name: string;
  path: string;
  icon?: string;
}

export interface TenantContextType {
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
}
