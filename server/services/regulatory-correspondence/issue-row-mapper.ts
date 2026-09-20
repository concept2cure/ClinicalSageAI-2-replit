/**
 * `c2c_correspondence_issues` rows → the `CorrespondenceIssue` contract.
 *
 * This exists because `POST /response-packages` passed
 * `SELECT * FROM c2c_correspondence_issues` straight into
 * `compileGovernedResponseAssembly` as `issueRows.rows as any`, and the row is
 * snake_case while the contract is camelCase. Measured 2026-09-20 with the
 * exact row the route selects:
 *
 *     row.mapped_ctd_sections = ['E1']   →  compiler read mappedCtdSections  = undefined
 *     row.mapped_artifact_ids = ['art-1']→  compiler read mappedArtifactIds  = undefined
 *                                        →  impactedSections: []
 *                                        →  issueMatrix[0].sectionKeys: []
 *                                        →  evidenceChecklist: the generic fallback
 *
 * So every response package the system has compiled carried an empty issue
 * matrix and a checklist that named no real evidence — while the data to fill
 * both was in the row being passed. The `as any` is what made it typecheck.
 *
 * One mapper, exported, so the next reader of these rows cannot reintroduce the
 * same gap with a second hand-rolled projection.
 *
 * @module server/services/regulatory-correspondence/issue-row-mapper
 */

import type { CorrespondenceIssue } from '@shared/types/regulatory-correspondence';

/** A `c2c_correspondence_issues` row, as node-postgres returns it. */
export interface CorrespondenceIssueRow {
  id: string;
  correspondence_id: string;
  category: string;
  subcategory?: string | null;
  severity: string;
  blocker: boolean;
  response_required: boolean;
  source_excerpt?: string | null;
  confidence?: string | number | null;
  human_review_status: string;
  due_date?: string | Date | null;
  mapped_ctd_sections?: unknown;
  mapped_artifact_ids?: unknown;
  owner_user_id?: number | null;
  resolution_status: string;
  structured_extraction?: unknown;
}

/** A jsonb column that should hold string[], however the driver hands it over. */
function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string') {
    // Some drivers return jsonb as text; a malformed value is no sections, not a throw.
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    } catch {
      return [];
    }
  }
  return [];
}

function structured(value: unknown): CorrespondenceIssue['structuredExtraction'] {
  const raw =
    typeof value === 'string'
      ? (() => {
          try {
            return JSON.parse(value);
          } catch {
            return null;
          }
        })()
      : value;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  // `{}` is what the column defaults to on a row written before it existed.
  // Undefined is the honest answer there: the extraction was not recorded, and
  // an object of empty strings would read as one that was.
  if (Object.keys(r).length === 0) return undefined;
  return {
    regulatorAskType: String(r.regulatorAskType ?? ''),
    impactedSubmissionComponent: String(r.impactedSubmissionComponent ?? ''),
    sectionCandidates: stringArray(r.sectionCandidates),
    recommendedOwnerFunction: String(r.recommendedOwnerFunction ?? ''),
    recommendedResponsePackageType: String(r.recommendedResponsePackageType ?? ''),
    evidenceNeeds: stringArray(r.evidenceNeeds),
    confidenceTrace: Array.isArray(r.confidenceTrace)
      ? (r.confidenceTrace as CorrespondenceIssue['structuredExtraction'] extends undefined
          ? never
          : NonNullable<CorrespondenceIssue['structuredExtraction']>['confidenceTrace'])
      : [],
    humanReviewRequired: r.humanReviewRequired !== false,
    ...(typeof r.responseDeadlineSignal === 'string'
      ? { responseDeadlineSignal: r.responseDeadlineSignal }
      : {}),
  };
}

export function issueRowToCorrespondenceIssue(row: CorrespondenceIssueRow): CorrespondenceIssue {
  const confidence =
    typeof row.confidence === 'number'
      ? row.confidence
      : row.confidence != null
        ? Number(row.confidence)
        : 0;
  return {
    id: String(row.id),
    correspondenceId: String(row.correspondence_id),
    category: row.category as CorrespondenceIssue['category'],
    ...(row.subcategory ? { subcategory: String(row.subcategory) } : {}),
    severity: row.severity as CorrespondenceIssue['severity'],
    blocker: !!row.blocker,
    responseRequired: row.response_required !== false,
    ...(row.source_excerpt ? { sourceExcerpt: String(row.source_excerpt) } : {}),
    confidence: Number.isFinite(confidence) ? confidence : 0,
    humanReviewStatus: row.human_review_status as CorrespondenceIssue['humanReviewStatus'],
    ...(row.due_date ? { dueDate: new Date(row.due_date).toISOString() } : {}),
    mappedCtdSections: stringArray(row.mapped_ctd_sections),
    mappedArtifactIds: stringArray(row.mapped_artifact_ids),
    ...(row.owner_user_id != null ? { owner: String(row.owner_user_id) } : {}),
    resolutionStatus: row.resolution_status as CorrespondenceIssue['resolutionStatus'],
    ...(structured(row.structured_extraction)
      ? { structuredExtraction: structured(row.structured_extraction) }
      : {}),
  };
}

export function issueRowsToCorrespondenceIssues(
  rows: readonly CorrespondenceIssueRow[],
): CorrespondenceIssue[] {
  return rows.map(issueRowToCorrespondenceIssue);
}

export default { issueRowToCorrespondenceIssue, issueRowsToCorrespondenceIssues };
