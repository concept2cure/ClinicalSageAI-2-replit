/**
 * Portal Type Definitions
 *
 * Core interfaces and type definitions for the Concept2Cure V.2 Client Portal.
 * These types define the structure for roles, agencies, study types, and modules.
 */

// =============================================================================
// USER ROLES & PERMISSIONS
// =============================================================================

export type UserRole =
  | 'admin'
  | 'regulatory_lead'
  | 'clinical_ops'
  | 'medical_writer'
  | 'biostatistician'
  | 'quality_assurance'
  | 'external_reviewer'
  | 'sponsor_viewer'
  | 'cro_manager'
  | 'site_coordinator';

export type PermissionLevel = 'none' | 'read' | 'write' | 'admin';

export interface UserPermissions {
  documents: PermissionLevel;
  submissions: PermissionLevel;
  analytics: PermissionLevel;
  settings: PermissionLevel;
  team: PermissionLevel;
  ai_assistant: PermissionLevel;
}

export interface PortalUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  organizationId: string;
  permissions: UserPermissions;
  preferences: UserPreferences;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  sidebarCollapsed: boolean;
  defaultModule: string | null;
  notifications: NotificationPreferences;
}

export interface NotificationPreferences {
  email: boolean;
  inApp: boolean;
  deadlineReminders: boolean;
  submissionUpdates: boolean;
}

// =============================================================================
// REGULATORY AGENCIES & REGIONS
// =============================================================================

export type RegulatoryAgency =
  | 'FDA' // US Food and Drug Administration
  | 'EMA' // European Medicines Agency
  | 'PMDA' // Japan Pharmaceuticals and Medical Devices Agency
  | 'Health_Canada' // Health Canada
  | 'TGA' // Australia Therapeutic Goods Administration
  | 'MHRA' // UK Medicines and Healthcare products Regulatory Agency
  | 'NMPA' // China National Medical Products Administration
  | 'ANVISA' // Brazil National Health Surveillance Agency
  | 'COFEPRIS'; // Mexico Federal Commission for Protection against Sanitary Risks

export type Region =
  | 'US'
  | 'EU'
  | 'Japan'
  | 'Canada'
  | 'Australia'
  | 'UK'
  | 'China'
  | 'Brazil'
  | 'Mexico'
  | 'Global';

export interface AgencyConfig {
  id: RegulatoryAgency;
  name: string;
  region: Region;
  ectdVersion: string;
  requiresLocalAgent: boolean;
  submissionFormats: string[];
}

// =============================================================================
// PRODUCT & STUDY TYPES
// =============================================================================

export type ProductType =
  | 'drug'
  | 'biologic'
  | 'medical_device'
  | 'combination_product'
  | 'ivd' // In Vitro Diagnostic
  | 'cell_therapy'
  | 'gene_therapy'
  | 'vaccine';

export type StudyType =
  | 'phase_1'
  | 'phase_2'
  | 'phase_3'
  | 'phase_4'
  | 'first_in_human'
  | 'bioequivalence'
  | 'observational'
  | 'registry'
  | 'expanded_access'
  | 'pivotal';

export type SubmissionType =
  | 'IND' // Investigational New Drug
  | 'NDA' // New Drug Application
  | 'BLA' // Biologics License Application
  | '510k' // 510(k) Premarket Notification
  | 'PMA' // Premarket Approval
  | 'De_Novo' // De Novo Classification
  | 'CER' // Clinical Evaluation Report (EU MDR)
  | 'MAA' // Marketing Authorization Application (EU)
  | 'ANDA' // Abbreviated New Drug Application
  | 'CTD' // Common Technical Document
  | 'PSUR' // Periodic Safety Update Report
  | 'Annual_Report';

export interface StudyContext {
  studyId: string;
  studyName: string;
  sponsorName: string;
  productType: ProductType;
  studyType: StudyType;
  therapeuticArea: string;
  targetAgencies: RegulatoryAgency[];
  phase: string;
  status: 'planning' | 'active' | 'completed' | 'suspended';
}

// =============================================================================
// PORTAL MODULES
// =============================================================================

export type ModuleId =
  | 'dashboard'
  | 'vault'
  | 'cer_generator'
  | '510k_builder'
  | 'csr_intelligence'
  | 'protocol_optimizer'
  | 'coauthor'
  | 'validation_hub'
  | 'analytics'
  | 'submissions'
  | 'team'
  | 'settings'
  | 'ask_lumen';

export interface PortalModule {
  id: ModuleId;
  name: string;
  description: string;
  icon: string;
  route: string;
  category: ModuleCategory;
  requiredPermission: keyof UserPermissions;
  minPermissionLevel: PermissionLevel;
  productTypes: ProductType[] | 'all';
  agencies: RegulatoryAgency[] | 'all';
  badge?: ModuleBadge;
  isNew?: boolean;
  isBeta?: boolean;
}

export type ModuleCategory =
  | 'core'
  | 'regulatory'
  | 'clinical'
  | 'quality'
  | 'intelligence'
  | 'administration';

export interface ModuleBadge {
  text: string;
  variant: 'default' | 'new' | 'beta' | 'updated';
}

// =============================================================================
// NAVIGATION & UI
// =============================================================================

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  route: string;
  children?: NavItem[];
  badge?: string;
  isExternal?: boolean;
}

export interface NavSection {
  id: string;
  title: string;
  items: NavItem[];
  collapsible?: boolean;
}

export interface DashboardWidget {
  id: string;
  type: WidgetType;
  title: string;
  size: 'small' | 'medium' | 'large' | 'full';
  position: { row: number; col: number };
  config?: Record<string, unknown>;
}

export type WidgetType =
  | 'stats_card'
  | 'activity_feed'
  | 'deadline_tracker'
  | 'quick_actions'
  | 'submission_status'
  | 'compliance_score'
  | 'team_activity'
  | 'ai_insights'
  | 'document_recent'
  | 'project_progress';

// =============================================================================
// PORTAL EXPERIENCE (computed result)
// =============================================================================

export interface PortalExperience {
  navigation: NavSection[];
  dashboardWidgets: DashboardWidget[];
  enabledModules: ModuleId[];
  quickActions: QuickAction[];
  theme: PortalTheme;
  features: FeatureFlags;
}

export interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: string;
  route: string;
  priority: number;
}

export interface PortalTheme {
  primaryColor: string;
  accentColor: string;
  logoUrl?: string;
  companyName?: string;
}

export interface FeatureFlags {
  aiAssistant: boolean;
  realTimeCollaboration: boolean;
  advancedAnalytics: boolean;
  ectdPublishing: boolean;
  multiRegionSubmission: boolean;
  auditTrail: boolean;
}

// =============================================================================
// CONTEXT INPUT (for computing portal experience)
// =============================================================================

export interface PortalContext {
  user: PortalUser;
  organization: OrganizationConfig;
  activeStudy?: StudyContext;
  targetAgency?: RegulatoryAgency;
  productType?: ProductType;
}

export interface OrganizationConfig {
  id: string;
  name: string;
  tier: 'starter' | 'professional' | 'enterprise';
  enabledModules: ModuleId[];
  customBranding?: PortalTheme;
  regions: Region[];
}
