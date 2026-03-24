/**
 * Canonical AuthoringContextPack resolver.
 *
 * ONE place that assembles authoring context from the various state sources
 * available in the app (project state, section state, artifact state, layout mode).
 * All surfaces use this instead of ad-hoc context assembly.
 *
 * @module concept2cure/services/authoring-context-resolver
 */

import type {
  AuthoringContextPack,
  WorkflowStage,
  ReadinessSnapshot,
  ContradictionEntry,
} from '../../../../shared/types/authoring-context';

// ─── Layout → WorkflowStage mapping ─────────────────────────────────────────

const LAYOUT_TO_STAGE: Record<string, WorkflowStage> = {
  'project-home': 'project-home',
  'dossier-map': 'dossier',
  dossier: 'dossier',
  documents: 'documents',
  'section-workspace': 'section-workspace',
  review: 'review',
  'review-readiness': 'review',
  submissions: 'submissions',
  // workspace/regulatory-workspace map to project-home by default
  workspace: 'project-home',
  'regulatory-workspace': 'project-home',
};

export function resolveWorkflowStage(layoutMode: string): WorkflowStage {
  return LAYOUT_TO_STAGE[layoutMode] || 'project-home';
}

// ─── Module code extraction from section code ────────────────────────────────

export function extractModuleCode(sectionCode: string | undefined): string | undefined {
  if (!sectionCode) return undefined;
  const major = sectionCode.split('.')[0];
  const moduleMap: Record<string, string> = {
    '1': 'm1',
    '2': 'm2',
    '3': 'm3',
    '4': 'm4',
    '5': 'm5',
  };
  return moduleMap[major];
}

// ─── Context builder inputs ──────────────────────────────────────────────────

export interface ContextResolverInput {
  /** Current project ID (required) */
  projectId: string | undefined;
  /** Current layout mode from ZenApp */
  layoutMode: string;
  /** Submission/product type (IND, NDA, 510K, etc.) */
  submissionType?: string;
  /** Active section code (e.g., "2.5") from activeSectionCode state */
  sectionCode?: string | null;
  /** Active section title */
  sectionTitle?: string;
  /** Active artifact ID */
  artifactId?: string;
  /** Active artifact version (number or string) */
  artifactVersion?: string | number;
  /** Active artifact status */
  artifactStatus?: string;
  /** Active artifact CTD section */
  artifactCtdSection?: string;
  /** Readiness data if fetched */
  readiness?: ReadinessSnapshot;
  /** Contradiction data if fetched */
  contradictions?: ContradictionEntry[];
  /** Recent resolution bundle ID */
  recentResolutionBundleId?: string;
}

/**
 * Build an AuthoringContextPack from available state.
 * Returns null if projectId is missing (no project context).
 */
export function resolveAuthoringContext(
  input: ContextResolverInput
): AuthoringContextPack | null {
  if (!input.projectId) return null;

  const workflowStage = resolveWorkflowStage(input.layoutMode);
  const sectionCode = input.sectionCode || input.artifactCtdSection || undefined;
  const moduleCode = extractModuleCode(sectionCode);

  return {
    projectId: input.projectId,
    workflowStage,
    artifactId: input.artifactId,
    artifactVersionId: input.artifactVersion != null ? String(input.artifactVersion) : undefined,
    artifactStatus: input.artifactStatus,
    moduleCode,
    sectionCode: sectionCode || undefined,
    sectionTitle: input.sectionTitle,
    submissionType: input.submissionType,
    readiness: input.readiness,
    contradictions: input.contradictions,
    recentResolutionBundleId: input.recentResolutionBundleId,
  };
}

/**
 * Serialize context pack for transmission to backend chat endpoints.
 * Strips undefined fields for clean payloads.
 */
export function serializeContextForChat(ctx: AuthoringContextPack): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(ctx)) {
    if (value !== undefined && value !== null) {
      result[key] = value;
    }
  }
  return result;
}
