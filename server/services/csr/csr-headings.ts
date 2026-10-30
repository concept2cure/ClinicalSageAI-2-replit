/**
 * The canonical ICH E3 heading tree of one CSR build, with each heading's
 * output and review state (D2/W1, 2026-10-30).
 *
 * Moved here from server/routes/csr-workflow-routes.ts, where it was served
 * only by GET /api/csr-workflow/board, which production refuses. The board
 * and GET /api/csr/jobs/:jobId/headings (csr-jobs.ts, the Submission Center
 * CSR card) both read it from this one module.
 *
 * Every heading of the tree, at every depth, is listed: 'not_drafted' when the
 * job has no output for it, else its effective review state (an approval of
 * since-redrafted text reads as a draft, csr-section-review.ts).
 */
import { flattenICHE3Sections, type CSRSection } from '../csr-builder.js';
import type { getCSRSectionOutputs } from './csr-job-runner.js';
import { effectiveReviewState, type CsrSectionReviewState } from './csr-section-review';

/** One heading of the canonical ICH E3 tree, with the job's output state for it. */
export interface CsrWorkflowHeading {
  num: string;
  label: string;
  depth: number;
  /** 'manual' headings (§3, §14–16) are prepared from records, never drafted by a job. */
  manual: boolean;
  state: 'not_drafted' | CsrSectionReviewState;
  staleApproval?: true;
  contentHash?: string;
  reviewerId?: number | null;
  decidedAt?: string | null;
  reason?: string | null;
}

type SectionOutputRow = Awaited<ReturnType<typeof getCSRSectionOutputs>>[number];

function iso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' && value ? value : null;
}

/** Every heading of the canonical tree, with the job's output and review state. */
export function buildHeadings(structure: CSRSection[], outputs: readonly Partial<SectionOutputRow>[]): CsrWorkflowHeading[] {
  const bySection = new Map(outputs.map((o) => [String(o.sectionNumber), o]));
  return flattenICHE3Sections(structure).map((node) => {
    const heading: CsrWorkflowHeading = {
      num: node.number, label: node.title, depth: node.number.split('.').length,
      manual: node.draftingMode === 'manual', state: 'not_drafted',
    };
    const output = bySection.get(node.number);
    if (!output) return heading;
    const { state, staleApproval } = effectiveReviewState(output);
    return {
      ...heading, state, ...(staleApproval ? { staleApproval: true as const } : {}),
      contentHash: typeof output.contentHash === 'string' ? output.contentHash : undefined,
      reviewerId: output.reviewerId ?? null, decidedAt: iso(output.reviewDecidedAt), reason: output.reviewReason ?? null,
    };
  });
}
