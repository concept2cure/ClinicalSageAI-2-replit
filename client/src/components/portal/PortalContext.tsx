/**
 * Portal Context Provider
 * 
 * Provides the computed portal experience to all child components.
 * Handles context computation and re-computation on dependency changes.
 */

import React, { createContext, useContext, useMemo } from 'react';
import { computePortalExperience, ROLE_PERMISSIONS, AGENCY_CONFIG, MODULE_REGISTRY } from './portalPolicy';
import type {
  PortalExperience,
  PortalContext,
  PortalUser,
  OrganizationConfig,
  ProductType,
  StudyType,
  SubmissionType,
  RegulatoryAgency,
  ModuleId,
} from './types';

// =============================================================================
// TYPES
// =============================================================================

interface PortalProviderProps {
  children: React.ReactNode;
  user: PortalUser;
  organization: OrganizationConfig;
  productType?: ProductType;
  studyType?: StudyType;
  submissionType?: SubmissionType;
  targetAgency?: RegulatoryAgency;
}

interface PortalContextValue {
  // Core experience
  experience: PortalExperience;
  
  // User context
  user: PortalUser;
  organization: OrganizationConfig;
  
  // Current product/study context
  productType?: ProductType;
  studyType?: StudyType;
  submissionType?: SubmissionType;
  targetAgency?: RegulatoryAgency;
  
  // Module access helpers
  isModuleEnabled: (moduleId: ModuleId) => boolean;
  canAccessModule: (moduleId: ModuleId) => boolean;
  
  // Configuration references
  agencyConfig: typeof AGENCY_CONFIG;
  moduleRegistry: typeof MODULE_REGISTRY;
}

// =============================================================================
// CONTEXT
// =============================================================================

const PortalContextReact = createContext<PortalContextValue | null>(null);

// =============================================================================
// HOOK
// =============================================================================

export function usePortal(): PortalContextValue {
  const context = useContext(PortalContextReact);
  if (!context) {
    throw new Error('usePortal must be used within a PortalProvider');
  }
  return context;
}

// =============================================================================
// PROVIDER
// =============================================================================

export function PortalProvider({
  children,
  user,
  organization,
  productType,
  studyType,
  submissionType,
  targetAgency,
}: PortalProviderProps) {
  // Build context for experience computation
  const portalContext: PortalContext = useMemo(() => ({
    user,
    organization,
    productType,
    studyType,
    submissionType,
    targetAgency,
  }), [user, organization, productType, studyType, submissionType, targetAgency]);
  
  // Compute portal experience
  const experience = useMemo(
    () => computePortalExperience(portalContext),
    [portalContext]
  );
  
  // Helper: Check if module is in enabledModules list
  const isModuleEnabled = useMemo(() => {
    return (moduleId: ModuleId): boolean => {
      return experience.enabledModules.includes(moduleId);
    };
  }, [experience.enabledModules]);
  
  // Helper: Check if user can access a specific module
  const canAccessModule = useMemo(() => {
    return (moduleId: ModuleId): boolean => {
      const module = MODULE_REGISTRY[moduleId];
      if (!module) return false;
      
      // Check organization has module enabled
      if (!organization.enabledModules.includes(moduleId)) {
        return false;
      }
      
      // Check user has required permission level
      const permissionLevels = ['none', 'read', 'write', 'admin'] as const;
      const userLevel = permissionLevels.indexOf(user.permissions[module.requiredPermission]);
      const requiredLevel = permissionLevels.indexOf(module.minPermissionLevel);
      
      return userLevel >= requiredLevel;
    };
  }, [organization.enabledModules, user.permissions]);
  
  // Build context value
  const contextValue: PortalContextValue = useMemo(() => ({
    experience,
    user,
    organization,
    productType,
    studyType,
    submissionType,
    targetAgency,
    isModuleEnabled,
    canAccessModule,
    agencyConfig: AGENCY_CONFIG,
    moduleRegistry: MODULE_REGISTRY,
  }), [
    experience,
    user,
    organization,
    productType,
    studyType,
    submissionType,
    targetAgency,
    isModuleEnabled,
    canAccessModule,
  ]);
  
  return (
    <PortalContextReact.Provider value={contextValue}>
      {children}
    </PortalContextReact.Provider>
  );
}

// =============================================================================
// DEFAULT DEMO USER & ORG (for development)
// =============================================================================

export const DEMO_USER: PortalUser = {
  id: 'demo-user-1',
  email: 'demo@concept2cure.com',
  displayName: 'Demo User',
  role: 'regulatory_lead',
  permissions: ROLE_PERMISSIONS.regulatory_lead,
  organizationId: 'demo-org-1',
  lastLogin: new Date(),
};

export const DEMO_ORGANIZATION: OrganizationConfig = {
  id: 'demo-org-1',
  name: 'Concept2Cure Demo',
  tier: 'professional',
  enabledModules: [
    'dashboard',
    'vault',
    'submissions',
    'ind_wizard',
    'cer_generator',
    '510k_builder',
    'csr_intelligence',
    'protocol_optimizer',
    'coauthor',
    'validation_hub',
    'analytics',
    'team',
    'settings',
    'ask_lumen',
  ],
  customBranding: {
    primaryColor: '#2563eb',
    accentColor: '#3b82f6',
    companyName: 'Concept2Cure',
  },
};

export { PortalContextReact };
