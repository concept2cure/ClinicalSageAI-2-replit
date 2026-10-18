/**
 * Export review gate — the ONE implementation of the export-governance
 * validation contract shared by every export surface (concept2cure chat
 * exports, eCTD package export, CERV2 document exports, and the Artifacts
 * Center export, which reuses shouldEnforceExportReviewGate() against its
 * persisted review state).
 *
 * This module owns the decision logic only:
 *   1. the governance payload schema,
 *   2. the reviewer-attribution rule — `humanReviewApproved: true` is a
 *      GxP-relevant claim and is refused (INCOMPLETE_HUMAN_REVIEW) unless it
 *      names WHO reviewed (reviewerName), in WHAT capacity (reviewerRole), and
 *      WHEN (reviewTimestamp),
 *   3. the environment-driven strict gate (HUMAN_REVIEW_REQUIRED), and
 *   4. the governance response headers, and the attestation each route
 *      records in its export audit row.
 *
 * What the gate checks is that the request body ASSERTS a review, with a name,
 * role and time — free text bound to no session user and no Part 11
 * signature. 2026-10-15: the headers stamped that as
 * `Human-Review-Approved: true` / `Reviewer` / `Review-Timestamp`, and nothing
 * recorded it. They now say whose word it is, and `exportReviewAttestation`
 * is recorded with the authenticated user who made the assertion.
 *
 * Routes keep their own thin adapters that render a rejection into their
 * established wire shape (concept2cure's `{ success:false, error:{...} }`
 * envelope vs. the flat `{ error, message }` bodies of the eCTD/CERV2
 * routes) — those response formats are public contracts pinned by tests, but
 * the RULES may never diverge between surfaces again, which is exactly how the
 * reviewer-attribution rule previously landed on one gate and not the other
 * two.
 */
import { z } from 'zod';

export const exportGovernanceSchema = z.object({
  aiGenerated: z.boolean().default(true),
  humanReviewApproved: z.boolean().default(false),
  reviewerName: z.string().trim().min(1).max(200).optional(),
  reviewerRole: z.string().trim().min(1).max(200).optional(),
  reviewTimestamp: z.string().datetime().optional(),
});

export type ExportGovernance = z.infer<typeof exportGovernanceSchema>;

export const REVIEWER_ATTRIBUTION_FIELDS = [
  'governance.reviewerName',
  'governance.reviewerRole',
  'governance.reviewTimestamp',
] as const;

/**
 * The ONE enable decision for every export review gate.
 *
 * Production is ALWAYS enforced — no environment variable may disable it.
 * (Deliberate behavior change: CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW='false'
 * previously disabled the gate even in production; that fail-open hole is
 * closed. Fail closed, never fabricate.)
 *
 * Outside production the gate is opt-in via EITHER legacy spelling — both are
 * kept working so existing docs/runbooks stay valid (e.g.
 * docs/proof/golden-journeys/WO-06_GOVERNED_EVIDENCE_DRAFT.md starts the
 * server with EXPORT_REVIEW_GATE=enforce):
 *   CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW='true'  → enforced
 *   EXPORT_REVIEW_GATE='enforce'                      → enforced
 * Any other value (including 'false' / 'off' / unset) leaves it off in
 * non-production only.
 */
export function shouldEnforceExportReviewGate(): boolean {
  if (process.env.NODE_ENV === 'production') return true;
  if (process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW === 'true') return true;
  if (process.env.EXPORT_REVIEW_GATE === 'enforce') return true;
  return false;
}

export type ExportGovernanceRejection = {
  ok: false;
  status: 400 | 403;
  code: 'VALIDATION_ERROR' | 'INCOMPLETE_HUMAN_REVIEW' | 'HUMAN_REVIEW_REQUIRED';
  message: string;
  details: unknown;
};

export type ExportGovernanceEvaluation =
  | { ok: true; governance: ExportGovernance }
  | ExportGovernanceRejection;

/**
 * Validate a caller-supplied `governance` payload and apply the shared rules.
 * Pure — no request/response types — so every export route (and its tests)
 * exercises the same decisions.
 */
export function evaluateExportGovernance(rawGovernance: unknown): ExportGovernanceEvaluation {
  const parsed = exportGovernanceSchema.safeParse(rawGovernance ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid export governance payload',
      details: parsed.error.flatten(),
    };
  }

  const governance = parsed.data;
  if (
    governance.humanReviewApproved &&
    (!governance.reviewerName || !governance.reviewerRole || !governance.reviewTimestamp)
  ) {
    return {
      ok: false,
      status: 400,
      code: 'INCOMPLETE_HUMAN_REVIEW',
      message: 'Reviewer identity, role, and timestamp are required when human review is approved',
      details: { required: [...REVIEWER_ATTRIBUTION_FIELDS] },
    };
  }

  if (shouldEnforceExportReviewGate() && !governance.humanReviewApproved) {
    return {
      ok: false,
      status: 403,
      code: 'HUMAN_REVIEW_REQUIRED',
      message: 'Human review approval is required before export in this environment',
      details: {
        required: 'governance.humanReviewApproved=true',
        reviewerFields: [...REVIEWER_ATTRIBUTION_FIELDS],
      },
    };
  }

  return { ok: true, governance };
}

/** What authorized an export through this gate. The Artifacts Center export
 * reports its persisted review state on the same header
 * ('persisted-review-decision' | 'current-version-signature' | 'none'). */
export type ExportAuthorization = 'caller-asserted-review' | 'none';

function exportAuthorization(governance: ExportGovernance): ExportAuthorization {
  return governance.humanReviewApproved ? 'caller-asserted-review' : 'none';
}

/**
 * Stamp the shared governance headers on an accepted export response.
 * `extraHeaders` lets a surface add its route-specific headers (e.g. CERV2's
 * review-notice/persistence headers) without forking the base set.
 *
 * 2026-10-15: these were `Human-Review-Approved: <bool>`, `Reviewer` and
 * `Review-Timestamp`, and `AI-Generated: false` on the caller's word — request
 * text presented as a verified approval. Each value now names its source.
 */
export function applyExportGovernanceHeaders(
  res: { setHeader(name: string, value: string): unknown },
  governance: ExportGovernance,
  extraHeaders?: Record<string, string>
): void {
  res.setHeader('X-Concept2Cure-AI-Generated', governance.aiGenerated ? 'true' : 'caller-asserted-false');
  res.setHeader('X-Concept2Cure-Export-Authorization', exportAuthorization(governance));
  res.setHeader('X-Concept2Cure-Review-Required', 'true');
  for (const [name, value] of Object.entries(extraHeaders ?? {})) {
    res.setHeader(name, value);
  }
  if (governance.reviewerName) {
    res.setHeader('X-Concept2Cure-Asserted-Reviewer', encodeURIComponent(governance.reviewerName));
  }
  if (governance.reviewTimestamp) {
    res.setHeader('X-Concept2Cure-Asserted-Review-Timestamp', governance.reviewTimestamp);
  }
}

/**
 * What an export audit row records about the review gate: the caller's
 * assertion, as an assertion, bound to the authenticated user who made it.
 * Nothing in it was verified — no signature, no persisted review decision;
 * `reviewTimestamp` is the caller's clock.
 */
export interface ExportReviewAttestation {
  authorization: ExportAuthorization;
  /** The session principal that sent the assertion (not necessarily the named reviewer). */
  assertedByUserId: number;
  aiGenerated: boolean;
  reviewerName: string | null;
  reviewerRole: string | null;
  reviewTimestamp: string | null;
}

export function exportReviewAttestation(
  governance: ExportGovernance,
  assertedByUserId: number
): ExportReviewAttestation {
  return {
    authorization: exportAuthorization(governance),
    assertedByUserId,
    aiGenerated: governance.aiGenerated,
    reviewerName: governance.reviewerName ?? null,
    reviewerRole: governance.reviewerRole ?? null,
    reviewTimestamp: governance.reviewTimestamp ?? null,
  };
}
