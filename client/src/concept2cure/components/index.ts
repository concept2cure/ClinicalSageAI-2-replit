/**
 * Concept2Cure - Components Index
 * @module concept2cure/components
 * @version 3.0.0
 */

// Error boundary (must be imported first for wrapping other components)
export { ErrorBoundary, useErrorThrower } from './ErrorBoundary';

// Common utility components (transitions, loaders, skeletons)
export * from './common';

// Sidebar components
export * from './sidebar';

// Chat components
export * from './chat';

// Artifact components
export * from './artifacts';

// Template components
export * from './templates';

// ─────────────────────────────────────────────────────────────────────────────
// CONVERGENT CANVAS - Phase 52 Sherpa System
// ─────────────────────────────────────────────────────────────────────────────

export {
  ConvergentCanvas,
  MorningBriefingPanel,
  CouncilThreadPanel,
  IndustryWorkspace,
  SHERPA_PERSONAS,
  CANVAS_ZONES,
  type CanvasZone,
  type IndustryMode,
  type IndustryWorkspaceProps,
  type SherpaPersonaId,
} from './canvas';

// ─────────────────────────────────────────────────────────────────────────────
// ZEN MINIMALIST COMPONENTS (Claude.ai / ChatGPT style)
// ─────────────────────────────────────────────────────────────────────────────

// Command Palette
export { ZenCommandPalette } from './command';

// Settings
export { ZenSettings } from './settings';

// Projects
export { ProjectSwitcher } from './projects';

// Welcome & Onboarding (Claude.ai style)
export { WelcomeBackScreen } from './common/WelcomeBackScreen';

// Assistant Components
export { LumenProjectAssistant } from './assistant/LumenProjectAssistant';

// Artifact Viewer (Claude.ai style)
export { ArtifactViewer } from './artifacts/ArtifactViewer';

// ─────────────────────────────────────────────────────────────────────────────
// ENTERPRISE REGULATORY COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

// Dashboard Components
export { RoleDashboard } from './dashboards/RoleDashboard';
export { IndustryRoleDashboard } from './dashboards/IndustryRoleDashboard';

// Calendar Components
export { RegulatoryCalendar } from './calendar/RegulatoryCalendar';

// Submission Components
export { DossierNavigator } from './submission/DossierNavigator';

// Medical Writing Components
export { MedicalWriterQueue } from './writing/MedicalWriterQueue';

// CRO Components
export { CROResourceDashboard } from './cro/CROResourceDashboard';

// Collaboration Components
export { TeamCollaborationPanel } from './collaboration/TeamCollaborationPanel';

// Wizard Components
export { QuickStartWizard } from './wizard/QuickStartWizard';

// Shell Components
export { IndustryWorkspaceShell } from './shell/IndustryWorkspaceShell';

// Projects
export { ProjectTimeline } from './projects/ProjectTimeline';

// Quality Components
export { SOPManagement } from './quality/SOPManagement';

// Clinical Components
export { StudyProtocolDesigner } from './clinical/StudyProtocolDesigner';

// Regulatory Components
export {
  CAPAManagement,
  PostMarketSurveillance,
  ECTDNavigator,
  InspectionReadiness,
  RegulatoryIntelligence,
  REGULATORY_COMPONENTS,
} from './regulatory';

// ─────────────────────────────────────────────────────────────────────────────
// MODULE REGISTRY
// ─────────────────────────────────────────────────────────────────────────────

export const CONCEPT2CURE_MODULES = {
  // Dashboard
  roleDashboard: {
    path: '/concept2cure/dashboard',
    component: 'RoleDashboard',
    title: 'Role Dashboard',
    description: 'Personalized dashboard by role',
    icon: 'LayoutDashboard',
    category: 'dashboard',
  },
  
  // Quality
  sopManagement: {
    path: '/concept2cure/quality/sops',
    component: 'SOPManagement',
    title: 'SOP Management',
    description: 'Standard Operating Procedure lifecycle',
    icon: 'FileText',
    category: 'quality',
  },
  
  // Clinical
  protocolDesigner: {
    path: '/concept2cure/clinical/protocol-designer',
    component: 'StudyProtocolDesigner',
    title: 'Protocol Designer',
    description: 'Clinical study protocol builder',
    icon: 'FlaskConical',
    category: 'clinical',
  },
  
  // Regulatory
  capaManagement: {
    path: '/concept2cure/regulatory/capa',
    component: 'CAPAManagement',
    title: 'CAPA Management',
    description: 'Corrective and Preventive Actions',
    icon: 'AlertTriangle',
    category: 'regulatory',
  },
  postMarketSurveillance: {
    path: '/concept2cure/regulatory/pms',
    component: 'PostMarketSurveillance',
    title: 'Post-Market Surveillance',
    description: 'Safety monitoring and reporting',
    icon: 'Shield',
    category: 'regulatory',
  },
  ectdNavigator: {
    path: '/concept2cure/regulatory/ectd',
    component: 'ECTDNavigator',
    title: 'eCTD Navigator',
    description: 'Electronic submission management',
    icon: 'Package',
    category: 'regulatory',
  },
  inspectionReadiness: {
    path: '/concept2cure/regulatory/inspections',
    component: 'InspectionReadiness',
    title: 'Inspection Readiness',
    description: 'Audit preparation and tracking',
    icon: 'ClipboardCheck',
    category: 'regulatory',
  },
  regulatoryIntelligence: {
    path: '/concept2cure/regulatory/intelligence',
    component: 'RegulatoryIntelligence',
    title: 'Regulatory Intelligence',
    description: 'Guidance and competitive analysis',
    icon: 'Globe',
    category: 'regulatory',
  },
} as const;

export type Concept2CureModuleKey = keyof typeof CONCEPT2CURE_MODULES;

/**
 * Get modules by category
 */
export function getModulesByCategory(category: string) {
  return Object.entries(CONCEPT2CURE_MODULES)
    .filter(([, module]) => module.category === category)
    .map(([key, module]) => ({ key, ...module }));
}

/**
 * Get all module categories
 */
export function getModuleCategories(): string[] {
  return [...new Set(Object.values(CONCEPT2CURE_MODULES).map(m => m.category))];
}

// ─────────────────────────────────────────────────────────────────────────────
// ZEN MODULES REGISTRY
// ─────────────────────────────────────────────────────────────────────────────

export const ZEN_MODULES = {
  zenChat: {
    name: 'AI Assistant',
    description: 'Conversational AI for regulatory guidance',
    icon: 'MessageCircle',
    category: 'core',
  },
  zenCommand: {
    name: 'Command Palette',
    description: 'Quick actions and navigation',
    icon: 'Command',
    category: 'core',
  },
  zenSettings: {
    name: 'Settings',
    description: 'Application preferences',
    icon: 'Settings',
    category: 'core',
  },
  zenProjects: {
    name: 'Projects',
    description: 'Submission workspace switcher',
    icon: 'FolderKanban',
    category: 'core',
  },
} as const;

export type ZenModuleKey = keyof typeof ZEN_MODULES;
