/**
 * Portal Policy Configuration
 * 
 * Defines the business rules and policies that govern portal behavior.
 * Includes module registry, role permissions, and the core computePortalExperience function.
 */

import type {
  PortalModule,
  ModuleId,
  UserRole,
  UserPermissions,
  PermissionLevel,
  RegulatoryAgency,
  AgencyConfig,
  ProductType,
  PortalContext,
  PortalExperience,
  NavSection,
  NavItem,
  DashboardWidget,
  QuickAction,
  FeatureFlags,
} from './types';

// =============================================================================
// ROLE PERMISSION DEFAULTS
// =============================================================================

export const ROLE_PERMISSIONS: Record<UserRole, UserPermissions> = {
  admin: {
    documents: 'admin',
    submissions: 'admin',
    analytics: 'admin',
    settings: 'admin',
    team: 'admin',
    ai_assistant: 'admin',
  },
  regulatory_lead: {
    documents: 'write',
    submissions: 'write',
    analytics: 'write',
    settings: 'read',
    team: 'write',
    ai_assistant: 'write',
  },
  clinical_ops: {
    documents: 'write',
    submissions: 'read',
    analytics: 'read',
    settings: 'none',
    team: 'read',
    ai_assistant: 'write',
  },
  medical_writer: {
    documents: 'write',
    submissions: 'read',
    analytics: 'read',
    settings: 'none',
    team: 'read',
    ai_assistant: 'write',
  },
  biostatistician: {
    documents: 'write',
    submissions: 'read',
    analytics: 'write',
    settings: 'none',
    team: 'read',
    ai_assistant: 'write',
  },
  quality_assurance: {
    documents: 'read',
    submissions: 'read',
    analytics: 'read',
    settings: 'none',
    team: 'read',
    ai_assistant: 'read',
  },
  external_reviewer: {
    documents: 'read',
    submissions: 'read',
    analytics: 'none',
    settings: 'none',
    team: 'none',
    ai_assistant: 'read',
  },
  sponsor_viewer: {
    documents: 'read',
    submissions: 'read',
    analytics: 'read',
    settings: 'none',
    team: 'none',
    ai_assistant: 'none',
  },
  cro_manager: {
    documents: 'write',
    submissions: 'read',
    analytics: 'write',
    settings: 'read',
    team: 'write',
    ai_assistant: 'write',
  },
  site_coordinator: {
    documents: 'read',
    submissions: 'none',
    analytics: 'none',
    settings: 'none',
    team: 'read',
    ai_assistant: 'read',
  },
};

// =============================================================================
// AGENCY CONFIGURATIONS
// =============================================================================

export const AGENCY_CONFIG: Record<RegulatoryAgency, AgencyConfig> = {
  FDA: {
    id: 'FDA',
    name: 'US Food and Drug Administration',
    region: 'US',
    ectdVersion: '4.0',
    requiresLocalAgent: false,
    submissionFormats: ['eCTD', 'PDF', 'eSTAR'],
  },
  EMA: {
    id: 'EMA',
    name: 'European Medicines Agency',
    region: 'EU',
    ectdVersion: '4.0',
    requiresLocalAgent: false,
    submissionFormats: ['eCTD', 'PDF'],
  },
  PMDA: {
    id: 'PMDA',
    name: 'Pharmaceuticals and Medical Devices Agency',
    region: 'Japan',
    ectdVersion: '4.0',
    requiresLocalAgent: true,
    submissionFormats: ['eCTD', 'PDF'],
  },
  Health_Canada: {
    id: 'Health_Canada',
    name: 'Health Canada',
    region: 'Canada',
    ectdVersion: '4.0',
    requiresLocalAgent: false,
    submissionFormats: ['eCTD', 'PDF'],
  },
  TGA: {
    id: 'TGA',
    name: 'Therapeutic Goods Administration',
    region: 'Australia',
    ectdVersion: '3.2.2',
    requiresLocalAgent: false,
    submissionFormats: ['eCTD', 'PDF'],
  },
  MHRA: {
    id: 'MHRA',
    name: 'Medicines and Healthcare products Regulatory Agency',
    region: 'UK',
    ectdVersion: '4.0',
    requiresLocalAgent: false,
    submissionFormats: ['eCTD', 'PDF'],
  },
  NMPA: {
    id: 'NMPA',
    name: 'National Medical Products Administration',
    region: 'China',
    ectdVersion: '3.2.2',
    requiresLocalAgent: true,
    submissionFormats: ['eCTD', 'PDF'],
  },
  ANVISA: {
    id: 'ANVISA',
    name: 'National Health Surveillance Agency',
    region: 'Brazil',
    ectdVersion: '3.2.2',
    requiresLocalAgent: true,
    submissionFormats: ['PDF'],
  },
  COFEPRIS: {
    id: 'COFEPRIS',
    name: 'Federal Commission for Protection against Sanitary Risks',
    region: 'Mexico',
    ectdVersion: '3.2.2',
    requiresLocalAgent: true,
    submissionFormats: ['PDF'],
  },
};

// =============================================================================
// MODULE REGISTRY
// =============================================================================

export const MODULE_REGISTRY: Record<ModuleId, PortalModule> = {
  dashboard: {
    id: 'dashboard',
    name: 'Dashboard',
    description: 'Overview of your regulatory activities',
    icon: 'layout-dashboard',
    route: '/portal',
    category: 'core',
    requiredPermission: 'documents',
    minPermissionLevel: 'read',
    productTypes: 'all',
    agencies: 'all',
  },
  vault: {
    id: 'vault',
    name: 'Document Vault',
    description: 'Secure document management and versioning',
    icon: 'folder-lock',
    route: '/portal/vault',
    category: 'core',
    requiredPermission: 'documents',
    minPermissionLevel: 'read',
    productTypes: 'all',
    agencies: 'all',
  },
  ind_wizard: {
    id: 'ind_wizard',
    name: 'IND Wizard',
    description: 'Guided IND application builder',
    icon: 'wand-2',
    route: '/portal/ind-wizard',
    category: 'regulatory',
    requiredPermission: 'submissions',
    minPermissionLevel: 'write',
    productTypes: ['drug', 'biologic', 'cell_therapy', 'gene_therapy'],
    agencies: ['FDA'],
    badge: { text: 'Popular', variant: 'default' },
  },
  cer_generator: {
    id: 'cer_generator',
    name: 'CER Generator',
    description: 'Clinical Evaluation Report builder for EU MDR',
    icon: 'file-text',
    route: '/portal/cer-generator',
    category: 'regulatory',
    requiredPermission: 'submissions',
    minPermissionLevel: 'write',
    productTypes: ['medical_device', 'ivd'],
    agencies: ['EMA', 'MHRA'],
  },
  '510k_builder': {
    id: '510k_builder',
    name: '510(k) Builder',
    description: 'FDA 510(k) submission preparation',
    icon: 'shield-check',
    route: '/portal/510k',
    category: 'regulatory',
    requiredPermission: 'submissions',
    minPermissionLevel: 'write',
    productTypes: ['medical_device', 'ivd'],
    agencies: ['FDA'],
  },
  csr_intelligence: {
    id: 'csr_intelligence',
    name: 'CSR Intelligence',
    description: 'Clinical Study Report analysis and insights',
    icon: 'brain',
    route: '/portal/csr-intelligence',
    category: 'intelligence',
    requiredPermission: 'analytics',
    minPermissionLevel: 'read',
    productTypes: 'all',
    agencies: 'all',
    isNew: true,
  },
  protocol_optimizer: {
    id: 'protocol_optimizer',
    name: 'Protocol Optimizer',
    description: 'AI-powered protocol design and optimization',
    icon: 'settings-2',
    route: '/portal/protocol-optimizer',
    category: 'clinical',
    requiredPermission: 'documents',
    minPermissionLevel: 'write',
    productTypes: ['drug', 'biologic', 'vaccine'],
    agencies: 'all',
    isBeta: true,
  },
  coauthor: {
    id: 'coauthor',
    name: 'eCTD Co-Author',
    description: 'Collaborative eCTD document authoring',
    icon: 'users',
    route: '/portal/coauthor',
    category: 'regulatory',
    requiredPermission: 'documents',
    minPermissionLevel: 'write',
    productTypes: 'all',
    agencies: 'all',
  },
  validation_hub: {
    id: 'validation_hub',
    name: 'Validation Hub',
    description: '21 CFR Part 11 compliance validation',
    icon: 'check-circle',
    route: '/portal/validation',
    category: 'quality',
    requiredPermission: 'submissions',
    minPermissionLevel: 'read',
    productTypes: 'all',
    agencies: 'all',
  },
  analytics: {
    id: 'analytics',
    name: 'Analytics',
    description: 'Regulatory intelligence and insights',
    icon: 'bar-chart-3',
    route: '/portal/analytics',
    category: 'intelligence',
    requiredPermission: 'analytics',
    minPermissionLevel: 'read',
    productTypes: 'all',
    agencies: 'all',
  },
  submissions: {
    id: 'submissions',
    name: 'Submissions',
    description: 'Track and manage regulatory submissions',
    icon: 'send',
    route: '/portal/submissions',
    category: 'regulatory',
    requiredPermission: 'submissions',
    minPermissionLevel: 'read',
    productTypes: 'all',
    agencies: 'all',
  },
  team: {
    id: 'team',
    name: 'Team',
    description: 'Manage team members and permissions',
    icon: 'users-2',
    route: '/portal/team',
    category: 'administration',
    requiredPermission: 'team',
    minPermissionLevel: 'read',
    productTypes: 'all',
    agencies: 'all',
  },
  settings: {
    id: 'settings',
    name: 'Settings',
    description: 'Portal and account settings',
    icon: 'settings',
    route: '/portal/settings',
    category: 'administration',
    requiredPermission: 'settings',
    minPermissionLevel: 'read',
    productTypes: 'all',
    agencies: 'all',
  },
  ask_lumen: {
    id: 'ask_lumen',
    name: 'Ask Lumen',
    description: 'AI regulatory assistant',
    icon: 'message-circle',
    route: '/portal/ask-lumen',
    category: 'intelligence',
    requiredPermission: 'ai_assistant',
    minPermissionLevel: 'read',
    productTypes: 'all',
    agencies: 'all',
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function hasPermission(
  userPermissions: UserPermissions,
  required: keyof UserPermissions,
  minLevel: PermissionLevel
): boolean {
  const levels: PermissionLevel[] = ['none', 'read', 'write', 'admin'];
  const userLevel = levels.indexOf(userPermissions[required]);
  const requiredLevel = levels.indexOf(minLevel);
  return userLevel >= requiredLevel;
}

function isModuleApplicable(
  module: PortalModule,
  productType?: ProductType,
  agency?: RegulatoryAgency
): boolean {
  // Check product type compatibility
  if (module.productTypes !== 'all' && productType) {
    if (!module.productTypes.includes(productType)) {
      return false;
    }
  }
  
  // Check agency compatibility
  if (module.agencies !== 'all' && agency) {
    if (!module.agencies.includes(agency)) {
      return false;
    }
  }
  
  return true;
}

function getEnabledModules(context: PortalContext): ModuleId[] {
  const { user, organization, productType, targetAgency } = context;
  
  return Object.values(MODULE_REGISTRY)
    .filter(module => {
      // Check organization has module enabled
      if (!organization.enabledModules.includes(module.id)) {
        return false;
      }
      
      // Check user has permission
      if (!hasPermission(user.permissions, module.requiredPermission, module.minPermissionLevel)) {
        return false;
      }
      
      // Check module applicability
      if (!isModuleApplicable(module, productType, targetAgency)) {
        return false;
      }
      
      return true;
    })
    .map(m => m.id);
}

// =============================================================================
// NAVIGATION BUILDER
// =============================================================================

function buildNavigation(enabledModules: ModuleId[]): NavSection[] {
  const sections: NavSection[] = [];
  
  // Core section
  const coreItems: NavItem[] = [];
  if (enabledModules.includes('dashboard')) {
    coreItems.push({ id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard', route: '/portal' });
  }
  if (enabledModules.includes('vault')) {
    coreItems.push({ id: 'vault', label: 'Document Vault', icon: 'folder-lock', route: '/portal/vault' });
  }
  if (enabledModules.includes('submissions')) {
    coreItems.push({ id: 'submissions', label: 'Submissions', icon: 'send', route: '/portal/submissions' });
  }
  if (coreItems.length > 0) {
    sections.push({ id: 'core', title: 'Overview', items: coreItems });
  }
  
  // Regulatory Tools section
  const regulatoryItems: NavItem[] = [];
  if (enabledModules.includes('ind_wizard')) {
    regulatoryItems.push({ id: 'ind_wizard', label: 'IND Wizard', icon: 'wand-2', route: '/portal/ind-wizard' });
  }
  if (enabledModules.includes('cer_generator')) {
    regulatoryItems.push({ id: 'cer_generator', label: 'CER Generator', icon: 'file-text', route: '/portal/cer-generator' });
  }
  if (enabledModules.includes('510k_builder')) {
    regulatoryItems.push({ id: '510k_builder', label: '510(k) Builder', icon: 'shield-check', route: '/portal/510k' });
  }
  if (enabledModules.includes('coauthor')) {
    regulatoryItems.push({ id: 'coauthor', label: 'eCTD Co-Author', icon: 'users', route: '/portal/coauthor' });
  }
  if (enabledModules.includes('validation_hub')) {
    regulatoryItems.push({ id: 'validation_hub', label: 'Validation Hub', icon: 'check-circle', route: '/portal/validation' });
  }
  if (regulatoryItems.length > 0) {
    sections.push({ id: 'regulatory', title: 'Regulatory Tools', items: regulatoryItems, collapsible: true });
  }
  
  // Intelligence section
  const intelligenceItems: NavItem[] = [];
  if (enabledModules.includes('csr_intelligence')) {
    intelligenceItems.push({ id: 'csr_intelligence', label: 'CSR Intelligence', icon: 'brain', route: '/portal/csr-intelligence', badge: 'New' });
  }
  if (enabledModules.includes('protocol_optimizer')) {
    intelligenceItems.push({ id: 'protocol_optimizer', label: 'Protocol Optimizer', icon: 'settings-2', route: '/portal/protocol-optimizer', badge: 'Beta' });
  }
  if (enabledModules.includes('analytics')) {
    intelligenceItems.push({ id: 'analytics', label: 'Analytics', icon: 'bar-chart-3', route: '/portal/analytics' });
  }
  if (enabledModules.includes('ask_lumen')) {
    intelligenceItems.push({ id: 'ask_lumen', label: 'Ask Lumen', icon: 'message-circle', route: '/portal/ask-lumen' });
  }
  if (intelligenceItems.length > 0) {
    sections.push({ id: 'intelligence', title: 'Intelligence', items: intelligenceItems, collapsible: true });
  }
  
  // Administration section
  const adminItems: NavItem[] = [];
  if (enabledModules.includes('team')) {
    adminItems.push({ id: 'team', label: 'Team', icon: 'users-2', route: '/portal/team' });
  }
  if (enabledModules.includes('settings')) {
    adminItems.push({ id: 'settings', label: 'Settings', icon: 'settings', route: '/portal/settings' });
  }
  if (adminItems.length > 0) {
    sections.push({ id: 'admin', title: 'Administration', items: adminItems });
  }
  
  return sections;
}

// =============================================================================
// DASHBOARD WIDGET BUILDER
// =============================================================================

function buildDashboardWidgets(
  enabledModules: ModuleId[],
  role: UserRole
): DashboardWidget[] {
  const widgets: DashboardWidget[] = [];
  let row = 0;
  
  // Stats cards row (always shown)
  widgets.push({
    id: 'stats_submissions',
    type: 'stats_card',
    title: 'Active Submissions',
    size: 'small',
    position: { row, col: 0 },
    config: { metric: 'submissions' },
  });
  widgets.push({
    id: 'stats_pending',
    type: 'stats_card',
    title: 'Pending Reviews',
    size: 'small',
    position: { row, col: 1 },
    config: { metric: 'pending' },
  });
  widgets.push({
    id: 'stats_approved',
    type: 'stats_card',
    title: 'Approved',
    size: 'small',
    position: { row, col: 2 },
    config: { metric: 'approved' },
  });
  widgets.push({
    id: 'stats_attention',
    type: 'stats_card',
    title: 'Requires Attention',
    size: 'small',
    position: { row, col: 3 },
    config: { metric: 'attention' },
  });
  row++;
  
  // Main content row
  if (enabledModules.includes('submissions')) {
    widgets.push({
      id: 'submission_status',
      type: 'submission_status',
      title: 'Submission Pipeline',
      size: 'large',
      position: { row, col: 0 },
    });
  }
  
  // Quick actions
  widgets.push({
    id: 'quick_actions',
    type: 'quick_actions',
    title: 'Quick Actions',
    size: 'medium',
    position: { row, col: 2 },
  });
  row++;
  
  // Activity and deadlines row
  widgets.push({
    id: 'activity_feed',
    type: 'activity_feed',
    title: 'Recent Activity',
    size: 'medium',
    position: { row, col: 0 },
  });
  
  widgets.push({
    id: 'deadline_tracker',
    type: 'deadline_tracker',
    title: 'Upcoming Deadlines',
    size: 'medium',
    position: { row, col: 1 },
  });
  
  // AI insights for eligible users
  if (enabledModules.includes('ask_lumen') && role !== 'sponsor_viewer' && role !== 'external_reviewer') {
    widgets.push({
      id: 'ai_insights',
      type: 'ai_insights',
      title: 'AI Insights',
      size: 'medium',
      position: { row, col: 2 },
    });
  }
  
  return widgets;
}

// =============================================================================
// QUICK ACTIONS BUILDER
// =============================================================================

function buildQuickActions(
  enabledModules: ModuleId[],
  productType?: ProductType
): QuickAction[] {
  const actions: QuickAction[] = [];
  let priority = 0;
  
  // Document upload (always available if vault is enabled)
  if (enabledModules.includes('vault')) {
    actions.push({
      id: 'upload_docs',
      label: 'Upload Documents',
      description: 'Add files to your vault',
      icon: 'upload',
      route: '/portal/vault?action=upload',
      priority: priority++,
    });
  }
  
  // Product-specific actions
  if (productType === 'drug' || productType === 'biologic') {
    if (enabledModules.includes('ind_wizard')) {
      actions.push({
        id: 'new_ind',
        label: 'Start IND Application',
        description: 'Begin a new IND submission',
        icon: 'wand-2',
        route: '/portal/ind-wizard/new',
        priority: priority++,
      });
    }
  }
  
  if (productType === 'medical_device' || productType === 'ivd') {
    if (enabledModules.includes('510k_builder')) {
      actions.push({
        id: 'new_510k',
        label: 'Start 510(k)',
        description: 'Begin a new 510(k) submission',
        icon: 'shield-check',
        route: '/portal/510k/new',
        priority: priority++,
      });
    }
    if (enabledModules.includes('cer_generator')) {
      actions.push({
        id: 'generate_cer',
        label: 'Generate CER',
        description: 'Create Clinical Evaluation Report',
        icon: 'file-text',
        route: '/portal/cer-generator/new',
        priority: priority++,
      });
    }
  }
  
  // Validation (always useful)
  if (enabledModules.includes('validation_hub')) {
    actions.push({
      id: 'run_validation',
      label: 'Run Validation',
      description: 'Check compliance status',
      icon: 'check-circle',
      route: '/portal/validation',
      priority: priority++,
    });
  }
  
  // AI Assistant
  if (enabledModules.includes('ask_lumen')) {
    actions.push({
      id: 'ask_lumen',
      label: 'Ask Lumen AI',
      description: 'Get regulatory guidance',
      icon: 'message-circle',
      route: '/portal/ask-lumen',
      priority: priority++,
    });
  }
  
  return actions.sort((a, b) => a.priority - b.priority).slice(0, 6);
}

// =============================================================================
// FEATURE FLAGS
// =============================================================================

function getFeatureFlags(context: PortalContext): FeatureFlags {
  const { organization, user } = context;
  const isEnterprise = organization.tier === 'enterprise';
  const isProfessional = organization.tier === 'professional' || isEnterprise;
  
  return {
    aiAssistant: isProfessional && hasPermission(user.permissions, 'ai_assistant', 'read'),
    realTimeCollaboration: isEnterprise,
    advancedAnalytics: isProfessional,
    ectdPublishing: isProfessional,
    multiRegionSubmission: isEnterprise,
    auditTrail: true, // Always enabled for compliance
  };
}

// =============================================================================
// MAIN FUNCTION: COMPUTE PORTAL EXPERIENCE
// =============================================================================

export function computePortalExperience(context: PortalContext): PortalExperience {
  const { user, organization, productType, targetAgency } = context;
  
  // Determine enabled modules based on permissions and context
  const enabledModules = getEnabledModules(context);
  
  // Build navigation structure
  const navigation = buildNavigation(enabledModules);
  
  // Build dashboard widgets
  const dashboardWidgets = buildDashboardWidgets(enabledModules, user.role);
  
  // Build quick actions
  const quickActions = buildQuickActions(enabledModules, productType);
  
  // Get feature flags
  const features = getFeatureFlags(context);
  
  // Determine theme
  const theme = organization.customBranding || {
    primaryColor: '#2563eb',
    accentColor: '#3b82f6',
    companyName: 'Concept2Cure',
  };
  
  return {
    navigation,
    dashboardWidgets,
    enabledModules,
    quickActions,
    theme,
    features,
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  hasPermission,
  isModuleApplicable,
  getEnabledModules,
  buildNavigation,
  buildDashboardWidgets,
  buildQuickActions,
  getFeatureFlags,
};
