/**
 * AuthoringContextPack — Canonical typed payload for section/document-bound authoring work.
 *
 * This is the SINGLE source of truth for authoring context that flows from
 * the surviving UI surfaces into AnA and related authoring helpers.
 *
 * @module shared/types/authoring-context
 */

// ─── Core Types ──────────────────────────────────────────────────────────────

export type WorkflowStage =
  | 'project-home'
  | 'dossier'
  | 'documents'
  | 'section-workspace'
  | 'review'
  | 'submissions';

export type BlockerSeverity = 'critical' | 'major' | 'minor' | 'info';

export interface ReadinessBlocker {
  code: string;
  severity: BlockerSeverity;
  message: string;
  source?: string;
}

export interface ContradictionEntry {
  id: string;
  type: string;
  severity: BlockerSeverity;
  explanation: string;
  relatedObjectIds?: string[];
}

export interface AssumptionEntry {
  id: string;
  status: string;
  summary: string;
}

export interface DecisionEntry {
  id: string;
  status: string;
  summary: string;
}

export interface ReadinessSnapshot {
  score?: number;
  blocked?: boolean;
  blockers?: ReadinessBlocker[];
}

// ─── AuthoringContextPack ────────────────────────────────────────────────────

export interface AuthoringContextPack {
  /** Always required — identifies the project */
  projectId: string;

  /** Always required — which workflow stage the user is in */
  workflowStage: WorkflowStage;

  /** Artifact identity — present when a specific document is open */
  artifactId?: string;
  artifactVersionId?: string;
  artifactStatus?: string;

  /** Dossier/section identity — present when a section is active */
  dossierId?: string;
  moduleCode?: string;
  sectionCode?: string;
  sectionTitle?: string;

  /** Regulatory metadata */
  regulatorBody?: string;
  domainTrack?: string;
  submissionType?: string;

  /** Cross-section linkage */
  linkedSectionCodes?: string[];

  /** Readiness intelligence (populated when available) */
  readiness?: ReadinessSnapshot;

  /** Contradiction intelligence (populated when available) */
  contradictions?: ContradictionEntry[];

  /** Assumption context */
  assumptions?: AssumptionEntry[];

  /** Decision context */
  decisions?: DecisionEntry[];

  /** Recent resolution bundle reference */
  recentResolutionBundleId?: string;

  /** Source artifact IDs feeding this context */
  sourceArtifactIds?: string[];
}

// ─── Minimum viable context (non-negotiable four fields) ─────────────────────

export type MinimumAuthoringContext = Pick<
  AuthoringContextPack,
  'projectId' | 'workflowStage'
> &
  Partial<Pick<AuthoringContextPack, 'sectionCode' | 'artifactId' | 'artifactVersionId'>>;

/**
 * Type guard: is this context rich enough for section-aware AnA actions?
 */
export function hasSectionContext(
  ctx: AuthoringContextPack | null | undefined
): ctx is AuthoringContextPack & { sectionCode: string } {
  return !!ctx && typeof ctx.sectionCode === 'string' && ctx.sectionCode.length > 0;
}

/**
 * Type guard: is this context rich enough for artifact-aware AnA actions?
 */
export function hasArtifactContext(
  ctx: AuthoringContextPack | null | undefined
): ctx is AuthoringContextPack & { artifactId: string } {
  return !!ctx && typeof ctx.artifactId === 'string' && ctx.artifactId.length > 0;
}

/**
 * Type guard: does this context have version information for diff/compare?
 */
export function hasVersionContext(
  ctx: AuthoringContextPack | null | undefined
): ctx is AuthoringContextPack & { artifactId: string; artifactVersionId: string } {
  return (
    hasArtifactContext(ctx) &&
    typeof ctx.artifactVersionId === 'string' &&
    ctx.artifactVersionId.length > 0
  );
}

// ─── Authoring Action Types ──────────────────────────────────────────────────

/** Wave 1 action identifiers */
export type AuthoringActionId =
  | 'resume_last_section'
  | 'draft_section_from_context'
  | 'explain_promotion_blockers'
  | 'compare_against_approved'
  | 'promote_to_review';

/** Wave 2 action identifiers */
export type AuthoringActionWave2Id =
  | 'correction_draft'
  | 'harmonize_sections'
  | 'section_contradictions'
  | 'resolution_changelog'
  | 'module_readiness';

/** Wave 3 action identifiers — Contradiction → Resolution bridge */
export type AuthoringActionWave3Id =
  | 'plan_contradiction_resolution'
  | 'execute_contradiction_resolution'
  | 'explain_contradiction_resolution'
  | 'project_resolution_status';

/** Strongly typed action request */
export interface AuthoringActionRequest {
  actionId: AuthoringActionId | AuthoringActionWave2Id | AuthoringActionWave3Id;
  context: AuthoringContextPack;
  /** Additional parameters specific to the action */
  params?: Record<string, unknown>;
}

/** Strongly typed action result */
export interface AuthoringActionResult {
  success: boolean;
  actionId: string;
  message: string;
  /** Structured data from the action */
  data?: Record<string, unknown>;
  /** Navigation target if the action requires a view change */
  navigateTo?: { layoutMode: string; sectionCode?: string; artifactId?: string };
  /** Content to insert into editor if the action produces draft content */
  draftContent?: { content: string; title: string; ctdSection?: string };
}

/** Minimum context required for each Wave 1 action */
export const ACTION_REQUIRED_CONTEXT: Record<AuthoringActionId, (keyof AuthoringContextPack)[]> = {
  resume_last_section: ['projectId'],
  draft_section_from_context: ['projectId', 'sectionCode'],
  explain_promotion_blockers: ['projectId'],
  compare_against_approved: ['projectId', 'artifactId'],
  promote_to_review: ['projectId', 'artifactId'],
};

/** Minimum context required for each Wave 3 action */
export const WAVE3_ACTION_REQUIRED_CONTEXT: Record<AuthoringActionWave3Id, (keyof AuthoringContextPack)[]> = {
  plan_contradiction_resolution: ['projectId'],
  execute_contradiction_resolution: ['projectId'],
  explain_contradiction_resolution: ['projectId'],
  project_resolution_status: ['projectId'],
};

/**
 * Check if context has the minimum fields required for a given action.
 * Returns missing field names, or empty array if all present.
 */
export function validateActionContext(
  actionId: AuthoringActionId,
  ctx: AuthoringContextPack | null | undefined
): string[] {
  if (!ctx) return ['projectId', 'workflowStage'];
  const required = ACTION_REQUIRED_CONTEXT[actionId] || [];
  return required.filter(field => {
    const value = ctx[field];
    return value === undefined || value === null || value === '';
  });
}

// ─── Section Preflight (Pass 5) ──────────────────────────────────────────────

export type PreflightCheckStatus = 'pass' | 'warn' | 'fail' | 'unknown';
export type PreflightOverall = 'ready' | 'blocked' | 'provisional' | 'needs-review' | 'needs-reapproval';
export type PreflightActionId =
  | 'prepare-correction-draft'
  | 'harmonize-linked-sections'
  | 'gather-body-evidence'
  | 'compare-approved'
  | 'explain-blockers'
  | 'promote-to-review';

export interface PreflightCheck {
  status: PreflightCheckStatus;
}

export interface BodyExpectationsCheck extends PreflightCheck {
  missing?: string[];
  weak?: string[];
  requiredLevel?: string;
}

export interface ContradictionsCheck extends PreflightCheck {
  items?: Array<{ id: string; severity: string; explanation: string }>;
}

export interface CrossSectionCheck extends PreflightCheck {
  consistencyScore?: number;
  items?: Array<{ type: string; severity: string; explanation: string; linkedSections?: string[] }>;
}

export interface ApprovedBaselineCheck extends PreflightCheck {
  conflictRisk?: 'low' | 'moderate' | 'high';
  summary?: string;
}

export interface ReadinessCheck extends PreflightCheck {
  score?: number;
  blockers?: Array<{ code: string; severity: string; message: string }>;
}

export interface SectionPreflightResult {
  sectionCode?: string;
  artifactId?: string;
  artifactVersionId?: string;
  workflowStage?: string;
  regulatorBody?: string;
  submissionType?: string;

  overall: PreflightOverall;
  summary: string;

  checks: {
    bodyExpectations?: BodyExpectationsCheck;
    contradictions?: ContradictionsCheck;
    crossSectionConsistency?: CrossSectionCheck;
    approvedBaselineCompare?: ApprovedBaselineCheck;
    readiness?: ReadinessCheck;
  };

  recommendedActions: Array<{
    id: PreflightActionId;
    label: string;
    reason: string;
  }>;
}

// ─── Module + Dossier Preflight (Pass 6) ─────────────────────────────────────

export type ModulePreflightActionId =
  | 'open-blocked-section'
  | 'prepare-correction-draft'
  | 'harmonize-linked-sections'
  | 'gather-body-evidence'
  | 'compare-approved'
  | 'run-section-preflight'
  | 'promote-module-when-clean';

export type PreflightBlockerKind =
  | 'body-gap'
  | 'contradiction'
  | 'cross-section-inconsistency'
  | 'approved-baseline-conflict'
  | 'readiness-blocker'
  | 'missing-section'
  | 'reapproval-required';

export interface PreflightBlocker {
  sectionCode?: string;
  moduleCode?: string;
  kind: PreflightBlockerKind;
  severity: 'critical' | 'major' | 'minor' | 'info';
  message: string;
}

export interface ModulePreflightResult {
  moduleCode: string;
  regulatorBody?: string;
  submissionType?: string;

  overall: PreflightOverall;
  summary: string;

  sectionResults: SectionPreflightResult[];

  counts: {
    total: number;
    ready: number;
    blocked: number;
    provisional: number;
    needsReview: number;
    needsReapproval: number;
  };

  majorBlockers: PreflightBlocker[];

  recommendedActions: Array<{
    id: ModulePreflightActionId;
    label: string;
    reason: string;
    targetSectionCode?: string;
  }>;
}

export type DossierPreflightActionId =
  | 'open-blocked-module'
  | 'open-blocked-section'
  | 'run-module-preflight'
  | 'run-section-preflight'
  | 'prepare-correction-draft'
  | 'gather-body-evidence'
  | 'promote-dossier-when-clean';

export interface DossierPreflightResult {
  dossierId?: string;
  regulatorBody?: string;
  submissionType?: string;

  overall: PreflightOverall;
  summary: string;

  moduleResults: ModulePreflightResult[];

  counts: {
    totalModules: number;
    readyModules: number;
    blockedModules: number;
    provisionalModules: number;
    needsReviewModules: number;
    needsReapprovalModules: number;
  };

  majorBlockers: PreflightBlocker[];

  recommendedActions: Array<{
    id: DossierPreflightActionId;
    label: string;
    reason: string;
    targetModuleCode?: string;
    targetSectionCode?: string;
  }>;
}
