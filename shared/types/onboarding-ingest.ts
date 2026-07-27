/**
 * AnA agentic onboarding — the shared proposal contract (P2/P3).
 *
 * This is the ONE shape the ingest backend, the AnA `onboarding_ingest` tool,
 * and the review/approve UI all speak. It is deliberately in `shared/` so the
 * server and client import the SAME definition — the seam where a mismatched
 * field shape becomes a silent wiring bug (see PR #1057's CodeQL/Codex round).
 *
 * Honesty / 21 CFR Part 11 guardrails encoded here:
 *  - Every proposed value is PROVENANCE-linked to its source (file + page/section).
 *    A field with no confident source is simply absent — never invented.
 *  - Every value carries a CONFIDENCE in [0,1]; below NEEDS_REVIEW_THRESHOLD the
 *    UI must flag it for the human rather than let it pass quietly.
 *  - Nothing is committed by extraction. A proposal's status walks
 *    proposed -> (edited) -> approved|rejected under HUMAN control; only
 *    `approved` fields are eligible for the governed commit (P3), which writes
 *    through the existing audited org/program/profile routes attributed
 *    "AnA on behalf of <user>".
 *  - Everything is tenant-scoped to the client's workspace; ingest never crosses
 *    client boundaries.
 *
 * @module shared/types/onboarding-ingest
 */

/** Below this confidence, a proposed field is surfaced as "needs review". */
export const NEEDS_REVIEW_THRESHOLD = 0.7;

/** The entities onboarding can auto-populate (fields-first scope, P2/P3). */
export type OnboardingEntity = 'org_profile' | 'program' | 'contact';

/** Where a proposed value came from — no value is proposed without one. */
export interface ProposalProvenance {
  /** Source document file name (as uploaded). */
  file: string;
  /** 1-based page, when the extractor can attribute one (PDF/OCR). */
  page?: number;
  /** A section/label anchor when a page number doesn't apply (DOCX/XLSX). */
  section?: string;
  /** The verbatim snippet the value was read from, for the human to verify. */
  snippet?: string;
}

/** Lifecycle of a single proposed field — human-controlled after extraction. */
export type ProposalStatus =
  | 'proposed' // AnA's extraction, awaiting review
  | 'needs_review' // extracted but low-confidence — flagged for the human
  | 'edited' // the human changed the value before approving
  | 'approved' // the human accepted it — eligible for the governed commit
  | 'rejected'; // the human declined it — never committed

/** One proposed value for one onboarding target field. */
export interface OnboardingProposalField {
  /** Stable id for this proposal within the ingest result. */
  id: string;
  /** Which entity this field belongs to. */
  entity: OnboardingEntity;
  /**
   * The target the value maps to. A dotted path into the governed write body
   * (e.g. 'org_profile.name', 'program.pathway'). Kept a string — the concrete
   * catalog is owned by the ingest mapper + the governed routes, not this type,
   * so adding a mappable column never changes the envelope.
   */
  targetField: string;
  /** Human-readable label for the review UI. */
  label: string;
  /** The extracted value (post-edit if the human changed it). Null = no value. */
  value: string | null;
  /** AnA's original extraction, preserved even after a human edit (audit trail). */
  extractedValue: string | null;
  /** Source attribution — required for any non-null proposed value. */
  provenance: ProposalProvenance;
  /** Extraction confidence in [0,1]. */
  confidence: number;
  /** Human-controlled lifecycle state. */
  status: ProposalStatus;
}

/** Proposals grouped by the entity they populate, for the review UI. */
export interface OnboardingProposalGroup {
  entity: OnboardingEntity;
  /** Section label, e.g. "Organization profile", "First program". */
  label: string;
  fields: OnboardingProposalField[];
}

/** The result of an ingest run over one or more uploaded documents. */
export interface OnboardingIngestResult {
  /** The proposals AnA extracted, grouped by entity. */
  groups: OnboardingProposalGroup[];
  /** The source documents this run read. */
  sources: Array<{ file: string; pages?: number; bytes?: number }>;
  /**
   * Honest, non-blocking notes: unreadable pages, unsupported sections, fields
   * the model saw but could not confidently attribute, etc. Never fabricated
   * content — a transparency signal for the human reviewer.
   */
  warnings: string[];
}

/** The body the client sends to commit the human-approved proposals (P3). */
export interface OnboardingCommitRequest {
  /** Only `approved` (or human-`edited`-then-approved) fields belong here. */
  approved: OnboardingProposalField[];
  /**
   * The reason-for-change recorded on the governed writes' Part 11 audit. The
   * UI supplies a default ("Applied AnA onboarding proposals reviewed by <user>")
   * that the human can amend.
   */
  reason: string;
}

/** What actually happened when approved proposals were committed (P3). */
export interface OnboardingCommitResult {
  /** Per-entity outcome, so the UI reports exactly what landed. */
  applied: Array<{ entity: OnboardingEntity; targetField: string; ok: boolean; error?: string }>;
  /** Governed writes performed (org profile patched, program created, ...). */
  writes: string[];
  /** Count that failed — the UI must show partial success honestly. */
  failures: number;
}

/** True when a field is eligible for the governed commit (human-approved). */
export function isCommittable(f: OnboardingProposalField): boolean {
  return f.status === 'approved' && f.value !== null && f.value.trim().length > 0;
}

/** Assign proposed|needs_review from confidence — extraction default state. */
export function initialStatus(confidence: number): ProposalStatus {
  return confidence < NEEDS_REVIEW_THRESHOLD ? 'needs_review' : 'proposed';
}
