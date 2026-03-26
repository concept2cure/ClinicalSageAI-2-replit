/**
 * Concept2Cure Types
 *
 * Type definitions for the Claude.ai-style regulatory interface.
 * Designed for FDA 21 CFR Part 11 compliance.
 *
 * @module concept2cure/types
 * @version 2.0.0
 * @license Proprietary - Concept2Cure, Inc.
 */

// ─────────────────────────────────────────────────────────────────────────────
// FDA 21 CFR PART 11 COMPLIANCE TYPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Audit trail entry for 21 CFR Part 11 compliance.
 * Every significant action must be logged with this structure.
 */
export interface AuditEntry {
  /** Unique identifier for the audit entry */
  id: string;
  /** ISO 8601 timestamp of the action */
  timestamp: string;
  /** User who performed the action */
  userId: string;
  /** User's display name */
  userName: string;
  /** Type of action performed */
  action: AuditAction;
  /** Entity type being acted upon */
  entityType: 'project' | 'conversation' | 'message' | 'artifact' | 'document';
  /** ID of the entity being acted upon */
  entityId: string;
  /** Previous value (for updates) */
  previousValue?: unknown;
  /** New value (for creates/updates) */
  newValue?: unknown;
  /** IP address of the client */
  ipAddress?: string;
  /** Session ID for traceability */
  sessionId?: string;
  /** SHA-256 hash for integrity verification */
  integrityHash?: string;
}

/**
 * Audit action types for 21 CFR Part 11 compliance.
 */
export type AuditAction =
  | 'CREATE'
  | 'READ'
  | 'UPDATE'
  | 'DELETE'
  | 'SIGN'
  | 'APPROVE'
  | 'REJECT'
  | 'EXPORT'
  | 'IMPORT'
  | 'LOGIN'
  | 'LOGOUT';

/**
 * Electronic signature for 21 CFR Part 11 compliance.
 */
export interface ElectronicSignature {
  /** User ID who signed */
  signerId: string;
  /** User's full name */
  signerName: string;
  /** User's title/role */
  signerTitle: string;
  /** ISO 8601 timestamp of signature */
  signedAt: string;
  /** Meaning of signature (e.g., "Approved", "Reviewed") */
  meaning: string;
  /** Digital signature hash (FIPS 186-5 compliant) */
  signatureHash: string;
  /** Certificate or key reference */
  certificateRef?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT TYPES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Regulatory submission types supported by Concept2Cure.
 */
export type SubmissionType =
  | '510K'
  | 'IND'
  | 'NDA'
  | 'BLA'
  | 'MAA'
  | 'PMA'
  | 'DE_NOVO'
  | 'EUA'
  | 'IVDR';

/**
 * A regulatory submission project.
 * Projects are the top-level container for all submission-related work.
 */
export interface Project {
  /** Unique project identifier (prefixed with 'proj_') */
  id: string;
  /** Human-readable project name */
  name: string;
  /** @deprecated Use submissionType instead */
  type?: SubmissionType;
  /** Regulatory submission type */
  submissionType: SubmissionType;
  /** Project description */
  description?: string;
  /** Sponsor or client organization */
  sponsor?: string;
  /** Product, device, or molecule name */
  product?: string;
  /** Target regulatory region/agency */
  region?: string;
  /** ISO 8601 creation timestamp */
  createdAt: Date;
  /** ISO 8601 last update timestamp */
  updatedAt: Date;
  /** ISO 8601 last activity timestamp */
  lastActiveAt?: Date;
  /** Number of conversations in the project */
  conversationCount?: number;
  /** Number of artifacts generated */
  artifactCount?: number;
  /** Conversations within the project */
  conversations: Conversation[];
  /** Project knowledge base (uploaded documents, context) */
  knowledge?: ProjectKnowledge;
  /** AI custom instructions for this project */
  customInstructions?: string;
  /** Project lifecycle status */
  status?: ProjectStatus;
  /** Additional metadata */
  metadata?: ProjectMetadata;
  /** Audit trail for 21 CFR Part 11 compliance */
  auditTrail?: AuditEntry[];
  /** Electronic signatures on the project */
  signatures?: ElectronicSignature[];
  /** Canonical project-owned collaboration and governance modules */
  ownership?: ProjectOwnership;
}

export type ProjectReviewState =
  | 'not_started'
  | 'in_review'
  | 'changes_requested'
  | 'approval_pending'
  | 'approved';

export type ProjectReadinessState = 'not_ready' | 'at_risk' | 'ready_for_review' | 'ready';

export type WorkbenchMode =
  | 'project-home'
  | 'regulatory-workspace'
  | 'documents'
  | 'review'
  | 'review-readiness'
  | 'submissions'
  | 'section-workspace'
  | 'report-engine';

export interface OwnershipReportRef {
  id: string;
  title: string;
  kind: 'artifact_report' | 'submission_snapshot';
  status: 'draft' | 'review' | 'approved' | 'published' | 'locked';
  updatedAt?: string;
}

export interface ProjectOwnershipDerived {
  chatHistory: Conversation[];
  documentInventory: UploadedDocument[];
  vaultLinkedFilesEvidence: UploadedDocument[];
  reports: OwnershipReportRef[];
  reviewState: ProjectReviewState;
  approvals: ElectronicSignature[];
  readinessState: ProjectReadinessState;
  activityHistory: AuditEntry[];
}

export interface ProjectOwnershipPreferences {
  projectInstructions: string;
  reusableSnippetsKnowledge: string[];
  currentWorkbenchContext: WorkbenchMode;
}

export interface ProjectOwnership {
  derived: ProjectOwnershipDerived;
  preferences: ProjectOwnershipPreferences;
  /** @deprecated Backward-compatible flat mirror for legacy consumers */
  chatHistory?: Conversation[];
  /** @deprecated Backward-compatible flat mirror for legacy consumers */
  documentInventory?: UploadedDocument[];
  /** @deprecated Backward-compatible flat mirror for legacy consumers */
  vaultLinkedFilesEvidence?: UploadedDocument[];
  /** @deprecated Backward-compatible flat mirror for legacy consumers */
  projectInstructions?: string;
  /** @deprecated Backward-compatible flat mirror for legacy consumers */
  reusableSnippetsKnowledge?: string[];
  /** @deprecated Backward-compatible flat mirror for legacy consumers */
  reports?: OwnershipReportRef[];
  /** @deprecated Backward-compatible flat mirror for legacy consumers */
  reviewState?: ProjectReviewState;
  /** @deprecated Backward-compatible flat mirror for legacy consumers */
  approvals?: ElectronicSignature[];
  /** @deprecated Backward-compatible flat mirror for legacy consumers */
  readinessState?: ProjectReadinessState;
  /** @deprecated Backward-compatible flat mirror for legacy consumers */
  activityHistory?: AuditEntry[];
  /** @deprecated Backward-compatible flat mirror for legacy consumers */
  currentWorkbenchContext?: WorkbenchMode;
}

/**
 * Project lifecycle status.
 */
export type ProjectStatus =
  | 'draft'
  | 'active'
  | 'in_review'
  | 'approved'
  | 'archived'
  | 'submitted';

/**
 * Project metadata for regulatory context.
 */
export interface ProjectMetadata {
  /** Target regulatory agency */
  targetAgency?: string;
  /** Target submission date */
  targetSubmissionDate?: string;
  /** Assigned regulatory lead */
  regulatoryLead?: string;
  /** Organization ID for multi-tenancy */
  organizationId?: number;
  /** Risk level assessment */
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  /** Compliance score (0-100) */
  complianceScore?: number;
  /** Custom fields */
  [key: string]: unknown;
}

export interface ProjectKnowledge {
  documents: UploadedDocument[];
  context: string;
  deviceInfo?: DeviceInfo;
  predicateInfo?: PredicateInfo;
  companyInfo?: CompanyInfo;
}

export interface DeviceInfo {
  name: string;
  classification?: string;
  productCode?: string;
  intendedUse?: string;
  indications?: string;
  technicalCharacteristics?: string[];
}

export interface PredicateInfo {
  kNumber?: string;
  deviceName?: string;
  manufacturer?: string;
  clearanceDate?: Date;
  similarities?: string[];
  differences?: string[];
}

export interface CompanyInfo {
  name: string;
  address?: string;
  contact?: string;
  establishmentNumber?: string;
}

export interface UploadedDocument {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: Date;
  extractedText?: string;
  embedding?: number[];
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVERSATION TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface Conversation {
  id: string;
  projectId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messages: Message[];
  artifacts: string[]; // Artifact IDs created in this conversation
  parentConversationId?: string; // For forked conversations
  forkPointMessageId?: string; // Message ID where fork occurred
  summary?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  attachments?: MessageAttachment[];
  citations?: Citation[];
  artifactId?: string; // If this message created an artifact
  edited?: boolean;
  editedAt?: Date;
  originalContent?: string;
}

export interface MessageAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url?: string;
}

export interface Citation {
  id: string;
  documentId: string;
  documentName: string;
  excerpt: string;
  page?: number;
  section?: string;
  confidence: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// ARTIFACT TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type ArtifactType =
  // ── MedTech / Device Document Artifacts ──
  | 'cover_letter'
  | 'device_description'
  | 'ifu_statement'
  | 'clinical_summary'
  | 'se_summary'
  | 'performance_summary'
  | 'labeling'
  | 'user_manual'
  | 'biocompatibility_summary'
  | 'software_documentation'
  | 'sterilization_summary'
  // ── Pharma / Biotech Document Artifacts ──
  | 'ind_cover_letter'
  | 'investigators_brochure'
  | 'clinical_protocol'
  | 'statistical_analysis_plan'
  | 'clinical_study_report'
  | 'clinical_overview'
  | 'nonclinical_overview'
  | 'quality_overall_summary'
  | 'drug_substance'
  | 'drug_product'
  | 'pharmacology_summary'
  | 'toxicology_summary'
  | 'pharmacokinetics_summary'
  | 'clinical_pharmacology'
  | 'cmc_overview'
  | 'sop'
  | 'dsur'
  | 'psur'
  | 'regulatory_response'
  | 'briefing_document'
  | 'nda_summary'
  // ── EU / International Document Artifacts ──
  | 'cer_report'
  | 'ivdr_technical_file'
  | 'maa_cover_letter'
  | 'impd'
  // ── Interactive artifacts ──
  | 'pyramid_gantt'
  | 'risk_heatmap'
  | 'traceability_matrix'
  | 'protocol_designer'
  | 'ifu_checker'
  | 'predicate_search'
  | 'timeline_planner'
  // ── Visualization artifacts ──
  | 'knowledge_graph'
  | 'compliance_dashboard'
  | 'submission_progress'
  // ── Generic ──
  | 'document'
  | 'code'
  | 'table'
  | 'chart';

export type ArtifactCategory = 'document' | 'interactive' | 'visualization';

export interface Artifact {
  id: string;
  projectId: string;
  conversationId: string;
  type: ArtifactType;
  category: ArtifactCategory;
  title: string;
  content: string | object; // String for documents, object for interactive/viz
  createdAt: Date;
  updatedAt: Date;
  version: number;
  versions: ArtifactVersion[];
  published?: boolean;
  publishedAt?: Date;
  shareLink?: string;
  isPublic?: boolean;
  remixCount?: number;
  remixedFrom?: string; // Original artifact ID if this is a remix
  metadata?: ArtifactMetadata;
}

export interface ArtifactVersion {
  /** Version number (starts at 1) */
  version: number;
  /** Content at this version */
  content: string | object;
  /** ISO 8601 creation timestamp */
  createdAt: Date;
  /** Message ID that created this version */
  messageId?: string;
  /** Description of changes */
  changelog?: string;
  /** User who created this version */
  createdBy?: string;
  /** Integrity hash for verification */
  contentHash?: string;
}

/**
 * Artifact metadata for compliance and tracking.
 */
export interface ArtifactMetadata {
  /** Word count */
  wordCount?: number;
  /** Estimated page count */
  pageCount?: number;
  /** Last editor's user ID */
  lastEditor?: string;
  /** Review workflow status */
  reviewStatus?: 'draft' | 'in_review' | 'approved' | 'rejected' | 'locked';
  /** Compliance score (0-100) */
  complianceScore?: number;
  /** Validation warnings */
  warnings?: string[];
  /** CTD section reference (e.g., "2.7.1") */
  ctdSection?: string;
  /** Document classification */
  classification?: 'internal' | 'confidential' | 'restricted';
  /** Electronic signatures */
  signatures?: ElectronicSignature[];
  /** Audit trail entries */
  auditEntries?: AuditEntry[];
  /** SHA-256 content hash for integrity */
  integrityHash?: string;
  /** Lock status for editing */
  isLocked?: boolean;
  /** Lock timestamp */
  lockedAt?: Date;
  /** Lock reason */
  lockReason?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// UI STATE TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface UIState {
  sidebarCollapsed: boolean;
  activeProjectId: string | null;
  activeConversationId: string | null;
  activeArtifactId: string | null;
  artifactPanelVisible: boolean;
  artifactPanelWidth: number; // Percentage
  chatInputFocused: boolean;
  isTyping: boolean;
  theme: 'light' | 'dark' | 'system';
}

export interface AppState {
  projects: Project[];
  conversations: Conversation[];
  artifacts: Artifact[];
  ui: UIState;
  user: UserInfo | null;
}

export interface UserInfo {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  organization?: string;
  role?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// API TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface LumenChatRequest {
  projectId: string;
  conversationId: string;
  message: string;
  attachments?: File[];
  context?: {
    activeArtifactId?: string;
    referencedArtifacts?: string[];
  };
}

export interface LumenChatResponse {
  messageId: string;
  content: string;
  citations?: Citation[];
  artifact?: {
    id: string;
    type: ArtifactType;
    title: string;
    content: string | object;
  };
  suggestedActions?: SuggestedAction[];
}

export interface SuggestedAction {
  id: string;
  label: string;
  description?: string;
  action: 'create_artifact' | 'update_artifact' | 'search' | 'analyze' | 'navigate';
  params?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface ArtifactTemplate {
  id: string;
  name: string;
  description: string;
  type: ArtifactType;
  category: ArtifactCategory;
  content: string | object;
  submissionTypes: SubmissionType[];
  tags: string[];
  author?: string;
  organization?: string;
  usageCount: number;
  rating?: number;
  isOfficial: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateCatalogFilters {
  submissionType?: SubmissionType;
  artifactType?: ArtifactType;
  category?: ArtifactCategory;
  search?: string;
  tags?: string[];
  sortBy?: 'popular' | 'recent' | 'rating';
}
