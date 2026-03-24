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
