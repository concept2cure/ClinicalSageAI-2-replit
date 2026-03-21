/**
 * AI Action System — Shared Types
 *
 * Canonical contracts for the unified AI action API.
 * Used by both server (action registry, routes) and client (useAIAction hook).
 *
 * Phase 1 foundation — Phase 2 extension points marked with comments.
 */

// ---------------------------------------------------------------------------
// Action Types
// ---------------------------------------------------------------------------

/** All supported AI action types. Extend this union as new actions are added. */
export type AIActionType =
  | 'create_document_from_artifact'
  | 'promote_artifact'
  | 'save_document_version'
  | 'run_validation'
  | 'route_document_to_module'
  | 'export_document'
  | 'attach_sources_to_document'
  | 'refine_with_validation'
  // Phase 2 — inline AI actions
  | 'summarize_selection'
  | 'explain_selection'
  | 'rewrite_selection'
  | 'extract_structured_data'
  | 'compare_selection'
  | 'refine_with_validation_findings'
  | 'create_followup_task'
  | 'attach_selection_as_source';

/** Target entity types that actions can operate on. */
export type AIActionTargetType =
  | 'artifact'
  | 'document'
  | 'project'
  | 'section'
  | 'task'; // Phase 2: add 'dossier', 'submission', etc.

/** Where the action was invoked from — for analytics and context routing. */
export type AIActionSourceSurface =
  | 'global_panel'        // AnaPersistentPanel
  | 'contextual_rail'     // DrSagePanel
  | 'inline_action'       // Inline editor actions
  | 'command_palette'     // ⌘K
  | 'workflow_trigger'    // Automated workflow
  | 'chat_action'         // Chat action dispatch
  | 'inline_menu'         // Phase 2: InlineAIMenu on tables/forms
  | 'inline_button'       // Phase 2: InlineAIButton on rows/cards
  | 'validation_surface'  // Phase 2: Validation findings refinement
  | 'api';                // Direct API call

/** Module types aligned with existing moduleTypeEnum. */
export type AIActionModuleType =
  | 'cmc'
  | 'cer'
  | 'study'
  | 'ectd'
  | '510k'
  | 'vault'
  | 'ind'
  | 'nda'
  | 'ivdr';

// ---------------------------------------------------------------------------
// Status Model
// ---------------------------------------------------------------------------

/** Artifact lifecycle status — superset of existing concept2cureArtifacts statuses. */
export type ArtifactLifecycleStatus =
  | 'draft'
  | 'needs_review'
  | 'validated'
  | 'promoted'
  | 'routed'
  | 'exported'
  | 'review'      // existing: maps to needs_review
  | 'approved'    // existing
  | 'locked';     // existing

/** Document status — aligned with existing documentStatusEnum. */
export type DocumentStatus =
  | 'draft'
  | 'in_review'
  | 'approved'
  | 'published'
  | 'archived'
  | 'rejected';

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

export interface AIActionRequest {
  /** Which action to execute. */
  actionType: AIActionType;

  /** What type of entity this action targets. */
  targetType: AIActionTargetType;

  /** ID of the target entity (null for create actions). */
  targetId: string | number | null;

  /** Project scope. */
  projectId: number;

  /** Module context (optional — not all actions are module-scoped). */
  module?: AIActionModuleType;

  /** Additional context passed to the action handler. */
  context?: AIActionContext;

  /** Action-specific payload. */
  payload: Record<string, unknown>;

  /** User requesting the action (populated server-side from auth, but accepted in type for testing). */
  requestedBy?: AIActionRequestedBy;

  /** Where the action was triggered. */
  sourceSurface: AIActionSourceSurface;

  /** Conversation/thread linkage for continuity. */
  conversationId?: number | string;
  threadId?: string;
}

export interface AIActionContext {
  /** Submission type for regulatory context. */
  submissionType?: string;
  /** CTD section code. */
  sectionCode?: string;
  /** Document type for validation rules. */
  documentType?: string;
  /** Additional key-value context. */
  [key: string]: unknown;
}

export interface AIActionRequestedBy {
  userId: number;
  userName: string;
  userRole?: string;
  organizationId: number;
  organizationName?: string;
}

// ---------------------------------------------------------------------------
// Response
// ---------------------------------------------------------------------------

export interface AIActionResponse {
  /** Whether the action completed successfully. */
  success: boolean;

  /** Echo of the action type. */
  actionType: AIActionType;

  /** Execution status. */
  status: 'completed' | 'queued' | 'partial' | 'failed';

  /** Action-specific result data. */
  result: Record<string, unknown> | null;

  /** Objects created by this action. */
  createdObjects: AIActionObjectRef[];

  /** Objects updated by this action. */
  updatedObjects: AIActionObjectRef[];

  /** Non-fatal warnings. */
  warnings: string[];

  /** Errors (populated when success=false). */
  errors: AIActionError[];

  /** Provenance metadata for audit trail. */
  provenance: AIActionProvenance;

  /** Suggested follow-up actions. */
  nextSuggestedActions: AIActionSuggestion[];
}

export interface AIActionObjectRef {
  type: AIActionTargetType | string;
  id: string | number;
  title?: string;
  status?: string;
  url?: string; // Client-side navigation URL
}

export interface AIActionError {
  code: string;
  message: string;
  field?: string;
  details?: unknown;
}

export interface AIActionProvenance {
  actionId: string;         // Unique execution ID
  timestamp: string;        // ISO 8601
  userId: number;
  organizationId: number;
  projectId: number;
  sourceSurface: AIActionSourceSurface;
  auditLogId?: string;      // Reference to regulatoryAuditLogs entry
  versionId?: string;       // Reference to atomVersion entry
  integrityHash?: string;   // SHA-256 of action + result
}

export interface AIActionSuggestion {
  actionType: AIActionType;
  label: string;
  description: string;
  payload?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Validation-specific types
// ---------------------------------------------------------------------------

export interface ValidationFinding {
  /** Finding severity. */
  severity: 'critical' | 'major' | 'minor' | 'info';
  /** Category of the issue. */
  issueType: 'content' | 'terminology' | 'compliance' | 'citation' | 'completeness' | 'formatting';
  /** Human-readable description. */
  message: string;
  /** Affected section or field, if identifiable. */
  affectedSection?: string;
  /** Character position range in the content. */
  position?: { start: number; end: number };
  /** Actionable recommendation. */
  recommendation: string;
  /** Confidence 0-1 in this finding. */
  confidence: number;
}

export interface ValidationReport {
  /** Overall validity. */
  isValid: boolean;
  /** Compliance score 0-100. */
  complianceScore: number;
  /** Structured findings. */
  findings: ValidationFinding[];
  /** Document type validated against. */
  documentType: string;
  /** Timestamp. */
  validatedAt: string;
}

export interface RefinementRequest {
  /** Original content to refine. */
  originalContent: string;
  /** Validation findings to address. */
  findings: ValidationFinding[];
  /** Which findings to prioritize (by index). */
  priorityFindings?: number[];
  /** Preserve original structure/formatting. */
  preserveStructure?: boolean;
}

// ---------------------------------------------------------------------------
// Action Handler Interface (server-side)
// ---------------------------------------------------------------------------

/** Every action handler must implement this interface. */
export interface AIActionHandler {
  /** The action type this handler processes. */
  actionType: AIActionType;

  /** Execute the action. Throw AIActionHandlerError on failure. */
  execute(
    request: AIActionRequest,
    context: AIActionExecutionContext
  ): Promise<AIActionResponse>;

  /** Validate the request before execution (optional fast check). */
  validate?(request: AIActionRequest): AIActionError[];
}

/** Server-side execution context injected by the dispatcher. */
export interface AIActionExecutionContext {
  /** Authenticated user info. */
  user: AIActionRequestedBy;
  /** Database connection/transaction handle. */
  db: unknown; // Drizzle instance — typed as unknown to avoid circular deps
  /** Unique action execution ID (for provenance). */
  actionId: string;
  /** IP address for audit. */
  ipAddress: string;
  /** Session ID for audit. */
  sessionId?: string;
}

/** Standard error type thrown by handlers. */
export class AIActionHandlerError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AIActionHandlerError';
  }
}
