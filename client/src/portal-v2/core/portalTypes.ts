/**
 * Concept2Cure Client Portal V2 - Enterprise Types
 *
 * Comprehensive type definitions for the regulatory intelligence platform.
 * Designed for biotech/pharma professionals with role-based experiences.
 *
 * @version 2.0.0
 * @author Concept2Cure Engineering
 */

// ─────────────────────────────────────────────────────────────────────────────
// USER & ROLE TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** User roles with granular permissions for regulatory workflows */
export type UserRole =
  | 'admin'
  | 'regulatory_lead'
  | 'clinical_ops'
  | 'medical_writer'
  | 'biostatistician'
  | 'quality_assurance'
  | 'legal_counsel'
  | 'executive'
  | 'cmc_specialist'
  | 'safety_officer'
  | 'project_manager'
  | 'viewer'
  | 'external_partner';

/** Role display metadata for UI components */
export interface RoleDisplayInfo {
  id: UserRole;
  label: string;
  description: string;
  color: string;
  icon: string;
}

export const ROLE_DISPLAY_MAP: Record<UserRole, RoleDisplayInfo> = {
  admin: {
    id: 'admin',
    label: 'Administrator',
    description: 'Full system access',
    color: '#7c3aed',
    icon: 'Shield',
  },
  regulatory_lead: {
    id: 'regulatory_lead',
    label: 'Regulatory Lead',
    description: 'Submission management',
    color: '#0d6efd',
    icon: 'FileCheck',
  },
  clinical_ops: {
    id: 'clinical_ops',
    label: 'Clinical Operations',
    description: 'Trial management',
    color: '#059669',
    icon: 'Activity',
  },
  medical_writer: {
    id: 'medical_writer',
    label: 'Medical Writer',
    description: 'Document authoring',
    color: '#d97706',
    icon: 'PenTool',
  },
  biostatistician: {
    id: 'biostatistician',
    label: 'Biostatistician',
    description: 'Statistical analysis',
    color: '#dc2626',
    icon: 'BarChart2',
  },
  quality_assurance: {
    id: 'quality_assurance',
    label: 'Quality Assurance',
    description: 'Compliance oversight',
    color: '#0891b2',
    icon: 'CheckCircle',
  },
  legal_counsel: {
    id: 'legal_counsel',
    label: 'Legal Counsel',
    description: 'Legal review',
    color: '#4b5563',
    icon: 'Scale',
  },
  executive: {
    id: 'executive',
    label: 'Executive',
    description: 'Strategic oversight',
    color: '#1e40af',
    icon: 'Briefcase',
  },
  cmc_specialist: {
    id: 'cmc_specialist',
    label: 'CMC Specialist',
    description: 'Manufacturing science',
    color: '#7c2d12',
    icon: 'Beaker',
  },
  safety_officer: {
    id: 'safety_officer',
    label: 'Safety Officer',
    description: 'Pharmacovigilance',
    color: '#be123c',
    icon: 'AlertTriangle',
  },
  project_manager: {
    id: 'project_manager',
    label: 'Project Manager',
    description: 'Program coordination',
    color: '#d97757',
    icon: 'Layout',
  },
  viewer: {
    id: 'viewer',
    label: 'Viewer',
    description: 'Read-only access',
    color: '#6b7280',
    icon: 'Eye',
  },
  external_partner: {
    id: 'external_partner',
    label: 'External Partner',
    description: 'Limited collaboration',
    color: '#9ca3af',
    icon: 'Users',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// REGULATORY AGENCY TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Global regulatory agencies supported by the platform */
export type RegulatoryAgency =
  | 'FDA'
  | 'EMA'
  | 'PMDA'
  | 'Health_Canada'
  | 'TGA'
  | 'MHRA'
  | 'NMPA'
  | 'ANVISA'
  | 'COFEPRIS'
  | 'Swissmedic'
  | 'KFDA'
  | 'CDSCO';

/** Agency display metadata with regional context */
export interface AgencyInfo {
  id: RegulatoryAgency;
  name: string;
  country: string;
  region: 'North America' | 'Europe' | 'Asia Pacific' | 'Latin America';
  primaryLanguage: string;
  submissionFormat: 'eCTD' | 'ACTD' | 'CTD' | 'Custom';
}

export const AGENCY_INFO_MAP: Record<RegulatoryAgency, AgencyInfo> = {
  FDA: {
    id: 'FDA',
    name: 'Food and Drug Administration',
    country: 'United States',
    region: 'North America',
    primaryLanguage: 'English',
    submissionFormat: 'eCTD',
  },
  EMA: {
    id: 'EMA',
    name: 'European Medicines Agency',
    country: 'European Union',
    region: 'Europe',
    primaryLanguage: 'English',
    submissionFormat: 'eCTD',
  },
  PMDA: {
    id: 'PMDA',
    name: 'Pharmaceuticals and Medical Devices Agency',
    country: 'Japan',
    region: 'Asia Pacific',
    primaryLanguage: 'Japanese',
    submissionFormat: 'eCTD',
  },
  Health_Canada: {
    id: 'Health_Canada',
    name: 'Health Canada',
    country: 'Canada',
    region: 'North America',
    primaryLanguage: 'English',
    submissionFormat: 'eCTD',
  },
  TGA: {
    id: 'TGA',
    name: 'Therapeutic Goods Administration',
    country: 'Australia',
    region: 'Asia Pacific',
    primaryLanguage: 'English',
    submissionFormat: 'eCTD',
  },
  MHRA: {
    id: 'MHRA',
    name: 'Medicines and Healthcare products Regulatory Agency',
    country: 'United Kingdom',
    region: 'Europe',
    primaryLanguage: 'English',
    submissionFormat: 'eCTD',
  },
  NMPA: {
    id: 'NMPA',
    name: 'National Medical Products Administration',
    country: 'China',
    region: 'Asia Pacific',
    primaryLanguage: 'Chinese',
    submissionFormat: 'CTD',
  },
  ANVISA: {
    id: 'ANVISA',
    name: 'National Health Surveillance Agency',
    country: 'Brazil',
    region: 'Latin America',
    primaryLanguage: 'Portuguese',
    submissionFormat: 'CTD',
  },
  COFEPRIS: {
    id: 'COFEPRIS',
    name: 'Federal Commission for Protection against Sanitary Risks',
    country: 'Mexico',
    region: 'Latin America',
    primaryLanguage: 'Spanish',
    submissionFormat: 'CTD',
  },
  Swissmedic: {
    id: 'Swissmedic',
    name: 'Swiss Agency for Therapeutic Products',
    country: 'Switzerland',
    region: 'Europe',
    primaryLanguage: 'German',
    submissionFormat: 'eCTD',
  },
  KFDA: {
    id: 'KFDA',
    name: 'Korea Food and Drug Administration',
    country: 'South Korea',
    region: 'Asia Pacific',
    primaryLanguage: 'Korean',
    submissionFormat: 'eCTD',
  },
  CDSCO: {
    id: 'CDSCO',
    name: 'Central Drugs Standard Control Organisation',
    country: 'India',
    region: 'Asia Pacific',
    primaryLanguage: 'English',
    submissionFormat: 'CTD',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT & SUBMISSION TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Product types supported by the platform */
export type ProductType =
  | 'drug'
  | 'biologic'
  | 'medical_device'
  | 'ivd'
  | 'cell_therapy'
  | 'gene_therapy'
  | 'vaccine'
  | 'combination_product'
  | 'biosimilar'
  | 'generic';

/** Submission types for regulatory filings */
export type SubmissionType =
  | 'IND'
  | 'NDA'
  | 'BLA'
  | 'ANDA'
  | '510k'
  | 'PMA'
  | 'De_Novo'
  | 'MAA'
  | 'CTA'
  | 'IMPD'
  | 'DMF'
  | 'IVDR'
  | 'Annual_Report'
  | 'Safety_Report'
  | 'Amendment'
  | 'Supplement';

/** Document status for workflow tracking */
export type DocumentStatus =
  | 'draft'
  | 'in_review'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'superseded'
  | 'archived'
  | 'effective';

/** Priority levels for tasks and workflows */
export type Priority = 'critical' | 'high' | 'medium' | 'low';

/** Task priority with alias for backward compatibility */
export type TaskPriority = Priority;

/** Task status for workflow tracking */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled';

/** Priority display configuration */
export const TASK_PRIORITY_CONFIG: Record<
  Priority,
  { label: string; color: string; bgColor: string }
> = {
  critical: { label: 'Critical', color: '#dc2626', bgColor: '#fef2f2' },
  high: { label: 'High', color: '#ea580c', bgColor: '#fff7ed' },
  medium: { label: 'Medium', color: '#ca8a04', bgColor: '#fefce8' },
  low: { label: 'Low', color: '#647746', bgColor: '#f0fdf4' },
};

/** Task status display configuration */
export const TASK_STATUS_CONFIG: Record<
  TaskStatus,
  { label: string; color: string; bgColor: string }
> = {
  pending: { label: 'Pending', color: '#6b7280', bgColor: '#f9fafb' },
  in_progress: { label: 'In Progress', color: '#5585b3', bgColor: '#eff6ff' },
  completed: { label: 'Completed', color: '#647746', bgColor: '#f0fdf4' },
  blocked: { label: 'Blocked', color: '#dc2626', bgColor: '#fef2f2' },
  cancelled: { label: 'Cancelled', color: '#9ca3af', bgColor: '#f3f4f6' },
};

// ─────────────────────────────────────────────────────────────────────────────
// MODULE SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

/** Module categories for navigation grouping */
export type ModuleCategory =
  | 'core'
  | 'submissions'
  | 'intelligence'
  | 'operations'
  | 'system'
  | 'regulatory'
  | 'clinical'
  | 'quality'
  | 'analytics'
  | 'administration';

/** Platform modules available in the portal */
export type ModuleId =
  | 'dashboard'
  | 'vault'
  | 'cer_generator'
  | '510k_builder'
  | 'ectd_coauthor' // [BATCH 5] remapped to document_control route; ID retained for role presets
  | 'regulatory_intel'
  | 'cmc_platform'
  | 'clinical_trial'
  | 'safety_reporting'
  | 'quality_management'
  | 'document_control'
  | 'training'
  | 'analytics'
  | 'ai_assistant'
  | 'project_hub'
  | 'timeline_planner'
  | 'platform_readiness'
  | 'lumen_cortex'
  | 'ivdr_module'
  | 'settings';

/** Module metadata for navigation and display */
export interface ModuleConfig {
  id: ModuleId;
  label: string;
  description: string;
  icon: string;
  route: string;
  category: ModuleCategory;
  requiredRoles: UserRole[];
  badge?: string;
  isNew?: boolean;
  isBeta?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPERIENCE CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

/** Theme configuration for branding */
export interface BrandingConfig {
  theme: 'light' | 'dark' | 'system';
  accentColor: string;
  logoUrl?: string;
  companyName?: string;
}

/** Feature flags for progressive rollout */
export interface FeatureFlags {
  aiAssistantEnabled: boolean;
  advancedAnalytics: boolean;
  multiAgencyReporting: boolean;
  collaborativeEditing: boolean;
  eSignatureIntegration: boolean;
  auditTrailExport: boolean;
  customWorkflows: boolean;
  mobileAccess: boolean;
}

/** User experience configuration */
export interface ExperienceConfig {
  modules: ModuleId[];
  defaultDashboard: ModuleId;
  features: string[];
  featureFlags: FeatureFlags;
  branding: BrandingConfig;
  notifications: NotificationPreferences;
}

/** Notification preferences */
export interface NotificationPreferences {
  email: boolean;
  inApp: boolean;
  desktop: boolean;
  digest: 'realtime' | 'hourly' | 'daily' | 'weekly';
}

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT & STUDY TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Clinical trial phases */
export type StudyPhase =
  | 'preclinical'
  | 'phase_1'
  | 'phase_1_2'
  | 'phase_2'
  | 'phase_2_3'
  | 'phase_3'
  | 'phase_4'
  | 'post_marketing';

/** Project status for tracking */
export type ProjectStatus =
  | 'planning'
  | 'active'
  | 'on_hold'
  | 'completed'
  | 'cancelled'
  | 'archived';

/** Project summary for dashboard display */
export interface ProjectSummary {
  id: string;
  name: string;
  productName: string;
  productType: ProductType;
  indication: string;
  phase: StudyPhase;
  status: ProjectStatus;
  targetAgencies: RegulatoryAgency[];
  milestones: MilestoneSummary[];
  teamSize: number;
  lastActivity: Date;
  progress: number;
}

/** Milestone for timeline tracking */
export interface MilestoneSummary {
  id: string;
  name: string;
  targetDate: Date;
  actualDate?: Date;
  status: 'pending' | 'in_progress' | 'completed' | 'overdue' | 'at_risk';
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Document category for organization */
export type DocumentCategory =
  | 'protocol'
  | 'investigator_brochure'
  | 'csr'
  | 'cmc'
  | 'nonclinical'
  | 'clinical'
  | 'regulatory'
  | 'quality'
  | 'safety'
  | 'administrative'
  | 'labeling'
  | 'correspondence';

/** CTD Module sections */
export type CTDModule = 'm1' | 'm2' | 'm3' | 'm4' | 'm5';

/** Document summary for listings */
export interface DocumentSummary {
  id: string;
  name: string;
  category: DocumentCategory;
  ctdModule?: CTDModule;
  status: DocumentStatus;
  version: string;
  author: string;
  createdAt: Date;
  updatedAt: Date;
  projectId?: string;
  studyId?: string;
  size: number;
  fileType: string;
  tags: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// WORKFLOW & TASK TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Task type classification */
export type TaskType =
  | 'document_review'
  | 'document_approval'
  | 'submission_prep'
  | 'data_entry'
  | 'quality_check'
  | 'training'
  | 'meeting'
  | 'correspondence'
  | 'general';

/** Task summary for dashboard */
export interface TaskSummary {
  id: string;
  title: string;
  description: string;
  type: TaskType;
  status: TaskStatus;
  priority: Priority;
  assignee: string;
  dueDate: Date;
  projectId?: string;
  documentId?: string;
  createdAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Metric card for dashboard display */
export interface MetricCard {
  id: string;
  label: string;
  value: number | string;
  change?: number;
  changeLabel?: string;
  trend?: 'up' | 'down' | 'stable';
  icon?: string;
  color?: string;
}

/** Chart data point */
export interface ChartDataPoint {
  label: string;
  value: number;
  category?: string;
}

/** Dashboard widget configuration */
export interface WidgetConfig {
  id: string;
  type: 'metric' | 'chart' | 'table' | 'timeline' | 'list';
  title: string;
  size: 'small' | 'medium' | 'large' | 'full';
  refreshInterval?: number;
  dataSource: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// AI ASSISTANT TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** AI assistant conversation message */
export interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  attachments?: AIAttachment[];
  citations?: AICitation[];
}

/** AI assistant attachment */
export interface AIAttachment {
  id: string;
  type: 'document' | 'image' | 'data';
  name: string;
  url?: string;
}

/** AI citation for source tracking */
export interface AICitation {
  id: string;
  documentId: string;
  documentName: string;
  excerpt: string;
  page?: number;
  confidence: number;
}

/** AI assistant context for targeted responses */
export interface AIContext {
  currentModule: ModuleId;
  activeProject?: string;
  activeDocument?: string;
  userRole: UserRole;
  recentActions: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Notification category for UI display */
export type NotificationCategory =
  | 'info'
  | 'success'
  | 'warning'
  | 'error'
  | 'task'
  | 'document'
  | 'system';

/** Notification action classification */
export type NotificationAction =
  | 'task_assigned'
  | 'task_completed'
  | 'document_uploaded'
  | 'document_approved'
  | 'document_rejected'
  | 'comment_added'
  | 'mention'
  | 'deadline_approaching'
  | 'deadline_missed'
  | 'system_alert'
  | 'ai_insight';

/** Notification for in-app alerts */
export interface Notification {
  id: string;
  type: NotificationCategory;
  action?: NotificationAction;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  actionUrl?: string;
  priority: Priority;
  sourceId?: string;
  sourceType?: 'project' | 'document' | 'task' | 'workflow';
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Pagination parameters */
export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/** Paginated response wrapper */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Filter options for list views */
export interface FilterOption {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'in';
  value: string | number | string[] | number[];
}

/** Search parameters */
export interface SearchParams {
  query: string;
  filters?: FilterOption[];
  pagination?: PaginationParams;
  includeArchived?: boolean;
}

/** API response wrapper */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta?: {
    requestId: string;
    timestamp: Date;
    duration: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD & TIMELINE TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Timeline phase for submission tracking */
export interface TimelinePhase {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  status: 'completed' | 'in_progress' | 'upcoming' | 'delayed';
  progress: number;
  milestones?: MilestoneSummary[];
}

/** Submission timeline for dashboard display */
export interface SubmissionTimeline {
  id: string;
  submissionId: string;
  submissionType: SubmissionType;
  agency: RegulatoryAgency;
  productName: string;
  phases: TimelinePhase[];
  targetDate: Date;
  status: 'on_track' | 'at_risk' | 'delayed' | 'completed';
}

/** Team activity for dashboard display */
export interface TeamActivity {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  action: string;
  targetType: 'document' | 'project' | 'workflow' | 'task' | 'comment';
  targetId: string;
  targetName: string;
  timestamp: Date;
}

/** Portal user for context and display */
export interface PortalUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
  department?: string;
  organizations: string[];
  lastLogin?: Date;
}
