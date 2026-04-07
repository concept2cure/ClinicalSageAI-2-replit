/**
 * Concept2Cure Client Portal V2 - Module Registry
 *
 * Central registry for all platform modules with metadata, routing,
 * and role-based access configuration.
 *
 * @version 2.0.0
 */

import type { ModuleId, ModuleConfig, ModuleCategory, UserRole } from './portalTypes';

// ─────────────────────────────────────────────────────────────────────────────
// MODULE CONFIGURATION REGISTRY
// ─────────────────────────────────────────────────────────────────────────────

export const MODULE_REGISTRY: Record<ModuleId, ModuleConfig> = {
  dashboard: {
    id: 'dashboard',
    label: 'Dashboard',
    description: 'Overview of projects, tasks, and key metrics',
    icon: 'LayoutDashboard',
    route: '/portal/dashboard',
    category: 'core',
    requiredRoles: [
      'viewer',
      'external_partner',
      'admin',
      'regulatory_lead',
      'clinical_ops',
      'medical_writer',
      'biostatistician',
      'quality_assurance',
      'legal_counsel',
      'executive',
      'cmc_specialist',
      'safety_officer',
      'project_manager',
    ],
  },
  vault: {
    id: 'vault',
    label: 'Document Vault',
    description: 'Secure document repository with version control',
    icon: 'FolderLock',
    route: '/portal/vault',
    category: 'core',
    requiredRoles: [
      'viewer',
      'external_partner',
      'admin',
      'regulatory_lead',
      'clinical_ops',
      'medical_writer',
      'biostatistician',
      'quality_assurance',
      'legal_counsel',
      'executive',
      'cmc_specialist',
      'safety_officer',
      'project_manager',
    ],
  },
  // ind_wizard: DEPRECATED — rolled into ectd_coauthor
  cer_generator: {
    id: 'cer_generator',
    label: 'CER Generator',
    description: 'Clinical Evaluation Report automation',
    icon: 'FileText',
    route: '/portal/cer-generator',
    category: 'submissions',
    requiredRoles: ['admin', 'regulatory_lead', 'medical_writer', 'clinical_ops'],
    badge: 'MDR',
  },
  '510k_builder': {
    id: '510k_builder',
    label: '510(k) Builder',
    description: 'FDA 510(k) premarket notification builder',
    icon: 'ClipboardCheck',
    route: '/portal/510k-builder',
    category: 'submissions',
    requiredRoles: ['admin', 'regulatory_lead', 'quality_assurance'],
    badge: 'FDA',
  },
  // [BATCH 5] ectd_coauthor remapped → document_control (canonical document workflow)
  ectd_coauthor: {
    id: 'ectd_coauthor',
    label: 'Documents',
    description: 'Regulatory document authoring and eCTD assembly',
    icon: 'FileText',
    route: '/portal/documents',
    category: 'submissions',
    requiredRoles: ['admin', 'regulatory_lead', 'medical_writer'],
  },
  regulatory_intel: {
    id: 'regulatory_intel',
    label: 'Regulatory Intelligence',
    description: 'Regulatory guidance and compliance insights',
    icon: 'Brain',
    route: '/portal/regulatory-intel',
    category: 'intelligence',
    requiredRoles: [
      'admin',
      'regulatory_lead',
      'clinical_ops',
      'medical_writer',
      'biostatistician',
      'quality_assurance',
      'legal_counsel',
      'executive',
      'cmc_specialist',
      'safety_officer',
      'project_manager',
    ],
    isNew: true,
  },
  cmc_platform: {
    id: 'cmc_platform',
    label: 'CMC Platform',
    description: 'Chemistry, Manufacturing & Controls management',
    icon: 'Beaker',
    route: '/portal/cmc-platform',
    category: 'operations',
    requiredRoles: ['admin', 'regulatory_lead', 'cmc_specialist', 'quality_assurance'],
  },
  clinical_trial: {
    id: 'clinical_trial',
    label: 'Clinical Trial Hub',
    description: 'Study design and trial management',
    icon: 'Activity',
    route: '/portal/clinical-trial',
    category: 'operations',
    requiredRoles: [
      'admin',
      'regulatory_lead',
      'clinical_ops',
      'medical_writer',
      'biostatistician',
      'safety_officer',
      'project_manager',
    ],
  },
  safety_reporting: {
    id: 'safety_reporting',
    label: 'Safety Reporting',
    description: 'Adverse event tracking and safety submissions',
    icon: 'AlertTriangle',
    route: '/portal/safety-reporting',
    category: 'operations',
    requiredRoles: ['admin', 'regulatory_lead', 'clinical_ops', 'safety_officer'],
  },
  quality_management: {
    id: 'quality_management',
    label: 'Quality Management',
    description: 'QMS, CAPA, and compliance tracking',
    icon: 'ShieldCheck',
    route: '/portal/quality-management',
    category: 'operations',
    requiredRoles: ['admin', 'regulatory_lead', 'quality_assurance'],
  },
  document_control: {
    id: 'document_control',
    label: 'Document Control',
    description: 'SOP management and version control',
    icon: 'FileSignature',
    route: '/portal/document-control',
    category: 'operations',
    requiredRoles: [
      'admin',
      'regulatory_lead',
      'medical_writer',
      'quality_assurance',
      'legal_counsel',
    ],
  },
  training: {
    id: 'training',
    label: 'Training Center',
    description: 'GxP training and certification tracking',
    icon: 'GraduationCap',
    route: '/portal/training',
    category: 'operations',
    requiredRoles: ['admin', 'quality_assurance', 'project_manager'],
  },
  analytics: {
    id: 'analytics',
    label: 'Analytics',
    description: 'Business intelligence and reporting',
    icon: 'BarChart3',
    route: '/portal/analytics',
    category: 'intelligence',
    requiredRoles: ['admin', 'regulatory_lead', 'clinical_ops', 'executive', 'project_manager'],
  },
  ai_assistant: {
    id: 'ai_assistant',
    label: 'AI Assistant',
    description: 'Intelligent regulatory guidance and document analysis',
    icon: 'Sparkles',
    route: '/portal/ai-assistant',
    category: 'intelligence',
    requiredRoles: [
      'admin',
      'regulatory_lead',
      'clinical_ops',
      'medical_writer',
      'biostatistician',
      'quality_assurance',
      'cmc_specialist',
      'safety_officer',
      'project_manager',
    ],
    isNew: true,
    isBeta: true,
  },
  project_hub: {
    id: 'project_hub',
    label: 'Project Hub',
    description: 'Program and project portfolio management',
    icon: 'FolderKanban',
    route: '/portal/project-hub',
    category: 'core',
    requiredRoles: ['admin', 'regulatory_lead', 'clinical_ops', 'executive', 'project_manager'],
  },
  timeline_planner: {
    id: 'timeline_planner',
    label: 'Timeline Planner',
    description: 'Milestone tracking and submission planning',
    icon: 'Calendar',
    route: '/portal/timeline-planner',
    category: 'core',
    requiredRoles: ['admin', 'regulatory_lead', 'clinical_ops', 'project_manager'],
  },
  platform_readiness: {
    id: 'platform_readiness',
    label: 'Platform Readiness',
    description: 'Interactive Phase 0–1 readiness audit with gap inventory and remediation roadmap',
    icon: 'Activity',
    route: '/admin/platform-readiness',
    category: 'analytics',
    requiredRoles: ['admin', 'regulatory_lead', 'executive', 'project_manager'],
    isNew: true,
  },
  ana_cortex: {
    id: 'ana_cortex',
    label: 'AnA Cortex',
    description: 'Advanced RI Co-pilot analytics engine with deep regulatory insights',
    icon: 'Brain',
    route: '/ana',
    category: 'intelligence',
    requiredRoles: [
      'admin',
      'regulatory_lead',
      'clinical_ops',
      'medical_writer',
      'executive',
      'project_manager',
    ],
    isNew: true,
    isBeta: true,
  },
  ivdr_module: {
    id: 'ivdr_module',
    label: 'EU IVDR Module',
    description:
      'EU In Vitro Diagnostic Regulation — Classification, Performance Evaluation & Technical Documentation',
    icon: 'Microscope',
    route: '/portal/ivdr',
    category: 'submissions',
    requiredRoles: ['admin', 'regulatory_lead', 'quality_assurance', 'clinical_ops'],
    badge: 'EU',
    isNew: true,
  },
  settings: {
    id: 'settings',
    label: 'Settings',
    description: 'User preferences and system configuration',
    icon: 'Settings',
    route: '/portal/settings',
    category: 'system',
    requiredRoles: [
      'admin',
      'regulatory_lead',
      'clinical_ops',
      'medical_writer',
      'biostatistician',
      'quality_assurance',
      'legal_counsel',
      'executive',
      'cmc_specialist',
      'safety_officer',
      'project_manager',
      'viewer',
      'external_partner',
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// MODULE ACCESS HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a user role has access to a specific module
 */
export function hasModuleAccess(moduleId: ModuleId, userRole: UserRole): boolean {
  const module = MODULE_REGISTRY[moduleId];
  if (!module) return false;
  return module.requiredRoles.includes(userRole);
}

/**
 * Get all modules accessible by a specific role
 */
export function getAccessibleModules(userRole: UserRole): ModuleConfig[] {
  return Object.values(MODULE_REGISTRY).filter(module => module.requiredRoles.includes(userRole));
}

/**
 * Get modules by category
 */
export function getModulesByCategory(category: ModuleConfig['category']): ModuleConfig[] {
  return Object.values(MODULE_REGISTRY).filter(module => module.category === category);
}

/**
 * Get the route for a module
 */
export function getModuleRoute(moduleId: ModuleId): string {
  return MODULE_REGISTRY[moduleId]?.route || '/portal/dashboard';
}

/**
 * Get module configuration by ID
 */
export function getModuleConfig(moduleId: ModuleId): ModuleConfig | undefined {
  return MODULE_REGISTRY[moduleId];
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

export interface CategoryConfig {
  id: ModuleCategory;
  label: string;
  description: string;
  icon: string;
  color: string;
}

export const CATEGORY_REGISTRY: Record<ModuleCategory, CategoryConfig> = {
  core: {
    id: 'core',
    label: 'Core Platform',
    description: 'Essential portal features and navigation',
    icon: 'Home',
    color: '#0d6efd',
  },
  submissions: {
    id: 'submissions',
    label: 'Submission Tools',
    description: 'Regulatory submission preparation and assembly',
    icon: 'Send',
    color: '#059669',
  },
  intelligence: {
    id: 'intelligence',
    label: 'Intelligence',
    description: 'AI-powered insights and analytics',
    icon: 'Lightbulb',
    color: '#d97706',
  },
  operations: {
    id: 'operations',
    label: 'Operations',
    description: 'Day-to-day operational workflows',
    icon: 'Cog',
    color: '#7c3aed',
  },
  system: {
    id: 'system',
    label: 'System',
    description: 'Configuration and administration',
    icon: 'Settings',
    color: '#6b7280',
  },
  regulatory: {
    id: 'regulatory',
    label: 'Regulatory',
    description: 'Regulatory affairs and compliance',
    icon: 'Shield',
    color: '#0d6efd',
  },
  clinical: {
    id: 'clinical',
    label: 'Clinical',
    description: 'Clinical operations and trials',
    icon: 'Flask',
    color: '#059669',
  },
  quality: {
    id: 'quality',
    label: 'Quality',
    description: 'Quality assurance and control',
    icon: 'CheckCircle',
    color: '#0891b2',
  },
  analytics: {
    id: 'analytics',
    label: 'Analytics',
    description: 'Data analysis and reporting',
    icon: 'BarChart',
    color: '#6a9bcc',
  },
  administration: {
    id: 'administration',
    label: 'Administration',
    description: 'System administration and settings',
    icon: 'Settings',
    color: '#6b7280',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// ROLE-BASED MODULE PRESETS
// ─────────────────────────────────────────────────────────────────────────────

export interface RoleModulePreset {
  role: UserRole;
  primaryModules: ModuleId[];
  quickActions: ModuleId[];
  defaultRoute: string;
}

export const ROLE_MODULE_PRESETS: Record<UserRole, RoleModulePreset> = {
  admin: {
    role: 'admin',
    primaryModules: ['dashboard', 'vault', 'project_hub', 'analytics', 'settings'],
    quickActions: ['ectd_coauthor', 'ai_assistant'],
    defaultRoute: '/portal/dashboard',
  },
  regulatory_lead: {
    role: 'regulatory_lead',
    primaryModules: ['dashboard', 'vault', 'ectd_coauthor', 'regulatory_intel'],
    quickActions: ['cer_generator', '510k_builder', 'timeline_planner', 'ivdr_module'],
    defaultRoute: '/portal/dashboard',
  },
  clinical_ops: {
    role: 'clinical_ops',
    primaryModules: ['dashboard', 'clinical_trial', 'safety_reporting', 'vault'],
    quickActions: ['timeline_planner', 'analytics', 'ai_assistant'],
    defaultRoute: '/portal/clinical-trial',
  },
  medical_writer: {
    role: 'medical_writer',
    primaryModules: ['dashboard', 'vault', 'ectd_coauthor', 'document_control'],
    quickActions: ['ectd_coauthor', 'cer_generator', 'ai_assistant'],
    defaultRoute: '/portal/vault',
  },
  biostatistician: {
    role: 'biostatistician',
    primaryModules: ['dashboard', 'clinical_trial', 'regulatory_intel', 'analytics'],
    quickActions: ['vault', 'ai_assistant'],
    defaultRoute: '/portal/clinical-trial',
  },
  quality_assurance: {
    role: 'quality_assurance',
    primaryModules: ['dashboard', 'quality_management', 'document_control', 'vault'],
    quickActions: ['training', '510k_builder', 'cmc_platform', 'ivdr_module'],
    defaultRoute: '/portal/quality-management',
  },
  legal_counsel: {
    role: 'legal_counsel',
    primaryModules: ['dashboard', 'vault', 'document_control'],
    quickActions: ['regulatory_intel'],
    defaultRoute: '/portal/vault',
  },
  executive: {
    role: 'executive',
    primaryModules: ['dashboard', 'analytics', 'project_hub'],
    quickActions: ['vault', 'regulatory_intel'],
    defaultRoute: '/portal/dashboard',
  },
  cmc_specialist: {
    role: 'cmc_specialist',
    primaryModules: ['dashboard', 'cmc_platform', 'vault', 'quality_management'],
    quickActions: ['ectd_coauthor', 'ai_assistant'],
    defaultRoute: '/portal/cmc-platform',
  },
  safety_officer: {
    role: 'safety_officer',
    primaryModules: ['dashboard', 'safety_reporting', 'clinical_trial', 'vault'],
    quickActions: ['ai_assistant', 'analytics'],
    defaultRoute: '/portal/safety-reporting',
  },
  project_manager: {
    role: 'project_manager',
    primaryModules: ['dashboard', 'project_hub', 'timeline_planner', 'analytics'],
    quickActions: ['vault', 'training', 'ai_assistant'],
    defaultRoute: '/portal/project-hub',
  },
  viewer: {
    role: 'viewer',
    primaryModules: ['dashboard', 'vault'],
    quickActions: ['settings'],
    defaultRoute: '/portal/dashboard',
  },
  external_partner: {
    role: 'external_partner',
    primaryModules: ['dashboard', 'vault'],
    quickActions: ['settings'],
    defaultRoute: '/portal/dashboard',
  },
};

/**
 * Get the role-based module preset
 */
export function getRolePreset(role: UserRole): RoleModulePreset {
  return ROLE_MODULE_PRESETS[role] || ROLE_MODULE_PRESETS.viewer;
}

// ─────────────────────────────────────────────────────────────────────────────
// NAVIGATION STRUCTURE
// ─────────────────────────────────────────────────────────────────────────────

export interface NavigationSection {
  category: ModuleConfig['category'];
  label: string;
  modules: ModuleId[];
}

/**
 * Get organized navigation sections for a user role
 */
export function getNavigationSections(userRole: UserRole): NavigationSection[] {
  const accessibleModules = getAccessibleModules(userRole);
  const categories = new Map<ModuleConfig['category'], ModuleId[]>();

  // Group modules by category
  for (const module of accessibleModules) {
    const existing = categories.get(module.category) || [];
    existing.push(module.id);
    categories.set(module.category, existing);
  }

  // Build sections in preferred order
  const categoryOrder: ModuleConfig['category'][] = [
    'core',
    'submissions',
    'intelligence',
    'operations',
    'system',
  ];

  return categoryOrder
    .filter(cat => categories.has(cat))
    .map(cat => ({
      category: cat,
      label: CATEGORY_REGISTRY[cat].label,
      modules: categories.get(cat)!,
    }));
}
