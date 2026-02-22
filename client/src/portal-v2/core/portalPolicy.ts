/**
 * TrialSage Client Portal V2 - Policy Engine
 *
 * Role-based experience configuration with feature flags,
 * notification preferences, and branding customization.
 *
 * @version 2.0.0
 */

import type {
  ExperienceConfig,
  ModuleId,
  RegulatoryAgency,
  UserRole,
  FeatureFlags,
  NotificationPreferences,
  BrandingConfig,
} from './portalTypes';
import { getAccessibleModules, getRolePreset } from './moduleRegistry';

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT CONFIGURATIONS
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  aiAssistantEnabled: true,
  advancedAnalytics: true,
  multiAgencyReporting: false,
  collaborativeEditing: true,
  eSignatureIntegration: false,
  auditTrailExport: true,
  customWorkflows: false,
  mobileAccess: true,
};

const DEFAULT_NOTIFICATIONS: NotificationPreferences = {
  email: true,
  inApp: true,
  desktop: false,
  digest: 'daily',
};

const DEFAULT_BRANDING: BrandingConfig = {
  theme: 'light',
  accentColor: '#0d6efd',
  companyName: 'TrialSage',
};

// ─────────────────────────────────────────────────────────────────────────────
// ROLE-BASED FEATURE FLAG OVERRIDES
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_FEATURE_OVERRIDES: Partial<Record<UserRole, Partial<FeatureFlags>>> = {
  admin: {
    customWorkflows: true,
    eSignatureIntegration: true,
    multiAgencyReporting: true,
  },
  regulatory_lead: {
    multiAgencyReporting: true,
    eSignatureIntegration: true,
    customWorkflows: true,
  },
  executive: {
    advancedAnalytics: true,
  },
  viewer: {
    aiAssistantEnabled: false,
    collaborativeEditing: false,
    customWorkflows: false,
  },
  external_partner: {
    aiAssistantEnabled: false,
    collaborativeEditing: false,
    auditTrailExport: false,
    customWorkflows: false,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPERIENCE CONFIGURATION BUILDER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the complete experience configuration for a user based on their role
 * and the regulatory agencies they work with.
 */
export function getExperienceConfig(
  role: UserRole,
  agencies: RegulatoryAgency[] = [],
  organizationBranding?: Partial<BrandingConfig>
): ExperienceConfig {
  // Get accessible modules for this role
  const accessibleModules = getAccessibleModules(role);
  const moduleIds = accessibleModules.map(m => m.id);

  // Get role preset for default module ordering
  const rolePreset = getRolePreset(role);

  // Build feature flags with role-specific overrides
  const roleOverrides = ROLE_FEATURE_OVERRIDES[role] || {};
  const featureFlags: FeatureFlags = {
    ...DEFAULT_FEATURE_FLAGS,
    ...roleOverrides,
    // Enable multi-agency reporting if user works with multiple agencies
    multiAgencyReporting: agencies.length > 1 || roleOverrides.multiAgencyReporting || false,
  };

  // Build feature list (for backward compatibility)
  const features: string[] = ['portal_v2'];
  if (featureFlags.aiAssistantEnabled) features.push('ai_assistant');
  if (featureFlags.advancedAnalytics) features.push('advanced_analytics');
  if (featureFlags.multiAgencyReporting) features.push('multi_agency_reporting');
  if (featureFlags.collaborativeEditing) features.push('collaborative_editing');
  if (featureFlags.eSignatureIntegration) features.push('e_signature');
  if (featureFlags.customWorkflows) features.push('custom_workflows');

  // Add agency-specific features
  if (agencies.includes('FDA')) features.push('fda_submissions');
  if (agencies.includes('EMA')) features.push('ema_submissions');
  if (agencies.includes('PMDA')) features.push('pmda_submissions');

  // Build branding config
  const branding: BrandingConfig = {
    ...DEFAULT_BRANDING,
    ...organizationBranding,
  };

  return {
    modules: moduleIds,
    defaultDashboard: 'dashboard',
    features,
    featureFlags,
    branding,
    notifications: DEFAULT_NOTIFICATIONS,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PERMISSION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Permission types for fine-grained access control */
export type Permission =
  | 'documents:read'
  | 'documents:write'
  | 'documents:delete'
  | 'documents:approve'
  | 'documents:publish'
  | 'projects:read'
  | 'projects:write'
  | 'projects:delete'
  | 'projects:manage'
  | 'workflows:read'
  | 'workflows:execute'
  | 'workflows:create'
  | 'workflows:manage'
  | 'users:read'
  | 'users:invite'
  | 'users:manage'
  | 'analytics:read'
  | 'analytics:export'
  | 'ai:query'
  | 'ai:configure'
  | 'settings:read'
  | 'settings:write'
  | 'audit:read'
  | 'audit:export'
  | 'submissions:read'
  | 'submissions:write'
  | 'submissions:submit'
  | 'ivdr:read'
  | 'ivdr:write'
  | 'ivdr:classify'
  | 'ivdr:approve'
  | 'admin:full';

/** Role permission mappings */
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [
    'documents:read',
    'documents:write',
    'documents:delete',
    'documents:approve',
    'documents:publish',
    'projects:read',
    'projects:write',
    'projects:delete',
    'projects:manage',
    'workflows:read',
    'workflows:execute',
    'workflows:create',
    'workflows:manage',
    'users:read',
    'users:invite',
    'users:manage',
    'analytics:read',
    'analytics:export',
    'ai:query',
    'ai:configure',
    'settings:read',
    'settings:write',
    'audit:read',
    'audit:export',
    'submissions:read',
    'submissions:write',
    'submissions:submit',
    'ivdr:read',
    'ivdr:write',
    'ivdr:classify',
    'ivdr:approve',
    'admin:full',
  ],
  regulatory_lead: [
    'documents:read',
    'documents:write',
    'documents:approve',
    'documents:publish',
    'projects:read',
    'projects:write',
    'projects:manage',
    'workflows:read',
    'workflows:execute',
    'workflows:create',
    'users:read',
    'users:invite',
    'analytics:read',
    'analytics:export',
    'ai:query',
    'settings:read',
    'settings:write',
    'audit:read',
    'audit:export',
    'submissions:read',
    'submissions:write',
    'submissions:submit',
    'ivdr:read',
    'ivdr:write',
    'ivdr:classify',
    'ivdr:approve',
  ],
  clinical_ops: [
    'documents:read',
    'documents:write',
    'projects:read',
    'projects:write',
    'workflows:read',
    'workflows:execute',
    'users:read',
    'analytics:read',
    'ai:query',
    'settings:read',
    'audit:read',
    'submissions:read',
    'ivdr:read',
  ],
  medical_writer: [
    'documents:read',
    'documents:write',
    'projects:read',
    'workflows:read',
    'workflows:execute',
    'users:read',
    'ai:query',
    'settings:read',
    'submissions:read',
    'submissions:write',
  ],
  biostatistician: [
    'documents:read',
    'documents:write',
    'projects:read',
    'workflows:read',
    'workflows:execute',
    'users:read',
    'analytics:read',
    'analytics:export',
    'ai:query',
    'settings:read',
    'submissions:read',
  ],
  quality_assurance: [
    'documents:read',
    'documents:write',
    'documents:approve',
    'projects:read',
    'projects:write',
    'workflows:read',
    'workflows:execute',
    'workflows:create',
    'users:read',
    'analytics:read',
    'ai:query',
    'settings:read',
    'audit:read',
    'audit:export',
    'submissions:read',
    'ivdr:read',
    'ivdr:write',
    'ivdr:classify',
  ],
  legal_counsel: [
    'documents:read',
    'documents:approve',
    'projects:read',
    'workflows:read',
    'users:read',
    'settings:read',
    'audit:read',
    'submissions:read',
  ],
  executive: [
    'documents:read',
    'projects:read',
    'workflows:read',
    'users:read',
    'analytics:read',
    'analytics:export',
    'settings:read',
    'audit:read',
    'submissions:read',
  ],
  cmc_specialist: [
    'documents:read',
    'documents:write',
    'projects:read',
    'projects:write',
    'workflows:read',
    'workflows:execute',
    'users:read',
    'ai:query',
    'settings:read',
    'submissions:read',
    'submissions:write',
  ],
  safety_officer: [
    'documents:read',
    'documents:write',
    'projects:read',
    'workflows:read',
    'workflows:execute',
    'users:read',
    'analytics:read',
    'ai:query',
    'settings:read',
    'audit:read',
    'submissions:read',
    'submissions:write',
  ],
  project_manager: [
    'documents:read',
    'documents:write',
    'projects:read',
    'projects:write',
    'projects:manage',
    'workflows:read',
    'workflows:execute',
    'workflows:create',
    'users:read',
    'users:invite',
    'analytics:read',
    'analytics:export',
    'ai:query',
    'settings:read',
    'audit:read',
    'submissions:read',
  ],
  viewer: ['documents:read', 'projects:read', 'workflows:read', 'settings:read'],
  external_partner: ['documents:read', 'projects:read', 'settings:read'],
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes(permission) || permissions.includes('admin:full');
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] || [];
}

/**
 * Check if a role can perform an action on a resource
 */
export function canPerformAction(
  role: UserRole,
  resource:
    | 'documents'
    | 'projects'
    | 'workflows'
    | 'users'
    | 'analytics'
    | 'ai'
    | 'settings'
    | 'audit'
    | 'submissions',
  action:
    | 'read'
    | 'write'
    | 'delete'
    | 'approve'
    | 'publish'
    | 'manage'
    | 'execute'
    | 'create'
    | 'invite'
    | 'export'
    | 'query'
    | 'configure'
    | 'submit'
): boolean {
  const permission = `${resource}:${action}` as Permission;
  return hasPermission(role, permission);
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENCY-SPECIFIC CONFIGURATIONS
// ─────────────────────────────────────────────────────────────────────────────

export interface AgencyWorkflowConfig {
  agency: RegulatoryAgency;
  submissionTypes: string[];
  requiredDocuments: string[];
  reviewTimelines: {
    standard: number;
    priority: number;
  };
}

export const AGENCY_WORKFLOW_CONFIGS: Partial<Record<RegulatoryAgency, AgencyWorkflowConfig>> = {
  FDA: {
    agency: 'FDA',
    submissionTypes: ['IND', 'NDA', 'BLA', 'ANDA', '510k', 'PMA', 'De_Novo'],
    requiredDocuments: ['Cover Letter', 'Form FDA 356h', 'eCTD backbone'],
    reviewTimelines: { standard: 180, priority: 60 },
  },
  EMA: {
    agency: 'EMA',
    submissionTypes: ['MAA', 'CTA', 'IMPD'],
    requiredDocuments: ['Cover Letter', 'Application Form', 'eCTD backbone'],
    reviewTimelines: { standard: 210, priority: 150 },
  },
  PMDA: {
    agency: 'PMDA',
    submissionTypes: ['CTN', 'NDA', 'PMDA consultation'],
    requiredDocuments: ['Application Form', 'CTD in Japanese', 'Summary'],
    reviewTimelines: { standard: 240, priority: 180 },
  },
};

/**
 * Get agency-specific workflow configuration
 */
export function getAgencyWorkflowConfig(
  agency: RegulatoryAgency
): AgencyWorkflowConfig | undefined {
  return AGENCY_WORKFLOW_CONFIGS[agency];
}
