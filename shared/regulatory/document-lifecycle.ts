/**
 * Canonical regulated-document lifecycle spine.
 *
 * ONE spine for a regulated document's whole journey: authoring → approval →
 * dossier placement → packaging → submission, with an audit event emitted on
 * every transition. This module is the single source of truth for the stages,
 * the legal transitions between them, and the fail-closed gate that guards each
 * transition. It is pure (no DB); the server orchestrator
 * (`server/services/regulatory/documentLifecycle.ts`) binds these stages to the
 * existing subsystems rather than reimplementing them:
 *
 *   authoring   → coauthor_documents / AnA drafting + artifact-version store
 *   in_review   → medical-writing QC + ai-actions run-validation
 *   approved    → ai-actions promote-artifact → unified_documents (21 CFR Part 11
 *                 e-signature; approved versions are immutable)
 *   placed      → submission_leaves (CTD/eCTD coordinate binding)
 *   packaged    → server/services/ectd assemble-from-core / package-from-core
 *   submitted   → ESG / regional gateway dispatch
 *   (every transition) → regulatory_audit_logs
 *
 * Design rules (per AGENTS.md): approval/placement/packaging/submission gates
 * fail closed (default deny); approved content is immutable — a change creates a
 * new version and supersedes, it never mutates an approved document in place.
 *
 * @module shared/regulatory/document-lifecycle
 */

// ─── Lifecycle stages ─────────────────────────────────────────────────────────

/**
 * The canonical stages, in forward order. `superseded` and `withdrawn` are
 * terminal branches reachable from several stages.
 */
export type DocumentStage =
  | 'authoring'   // being drafted; content mutable
  | 'in_review'   // submitted for QC / scientific / regulatory review
  | 'approved'    // signed off (Part 11); content locked/immutable
  | 'placed'      // bound to a dossier CTD/eCTD coordinate
  | 'packaged'    // included in an assembled eCTD sequence
  | 'submitted'   // dispatched to the agency
  | 'superseded'  // replaced by a newer approved version
  | 'withdrawn';  // pulled from the lifecycle

export const DOCUMENT_STAGES: readonly DocumentStage[] = [
  'authoring', 'in_review', 'approved', 'placed', 'packaged', 'submitted', 'superseded', 'withdrawn',
];

/** Forward progression order (used to compute progress; terminal branches excluded). */
export const FORWARD_STAGE_ORDER: readonly DocumentStage[] = [
  'authoring', 'in_review', 'approved', 'placed', 'packaged', 'submitted',
];

/** Which of the five named phases each stage belongs to. */
export const STAGE_PHASE: Record<DocumentStage, 'authoring' | 'approval' | 'placement' | 'packaging' | 'submission' | 'closed'> = {
  authoring: 'authoring',
  in_review: 'approval',
  approved: 'approval',
  placed: 'placement',
  packaged: 'packaging',
  submitted: 'submission',
  superseded: 'closed',
  withdrawn: 'closed',
};

// ─── Dossier placement coordinate ─────────────────────────────────────────────

/**
 * Where a document lives in a submission. Ties an authored document to the
 * global registry entry and its CTD/eCTD position (module + section, resolved
 * from the section blueprints in `project-bootstrap`), and, once packaged, to a
 * concrete eCTD leaf and sequence.
 */
export interface DossierPlacement {
  /** Registry application id, e.g. 'US_IND', 'EU_MAA'. */
  registryId: string;
  /** CTD module, e.g. 'M3' or 3. */
  ctdModule: string;
  /** Section code within the blueprint, e.g. '3.2.S', '2.5', '5.3'. */
  sectionCode: string;
  /** eCTD leaf id once the document is placed on a leaf (packaging stage). */
  leafId?: string;
  /** eCTD sequence number, e.g. '0000', once assigned. */
  sequence?: string;
}

// ─── Approval / signature ─────────────────────────────────────────────────────

/** A 21 CFR Part 11 electronic signature record attached to an approval. */
export interface ApprovalSignature {
  actor: string;
  role: string;
  /** Reference to the persisted signature manifest (never the raw key material). */
  signatureRef: string;
  signedAt: string;
  /** The meaning of the signature (e.g. 'approved', 'reviewed', 'authored'). */
  meaning: 'authored' | 'reviewed' | 'approved';
}

// ─── Document state ───────────────────────────────────────────────────────────

/**
 * The canonical regulated-document state the spine reasons over. The server
 * orchestrator projects the existing tables (coauthor_documents / unified_documents
 * / submission_leaves) onto this shape; it is not a new storage table.
 */
export interface RegulatedDocumentState {
  documentId: string;
  title: string;
  stage: DocumentStage;
  /** Monotonic version; a new approved edition increments and supersedes. */
  version: number;
  /** True once content exists (gate for leaving `authoring`). */
  hasContent: boolean;
  /** Review sign-off recorded (gate for `approved`). */
  reviewSignature?: ApprovalSignature;
  /** Approval sign-off recorded (gate for leaving `approved`). */
  approvalSignature?: ApprovalSignature;
  /** Dossier coordinate (gate for `placed` / `packaged`). */
  placement?: DossierPlacement;
  /** Packaging validation passed (gate for `submitted`). */
  packagingValidated?: boolean;
}

// ─── Transition graph + gates ─────────────────────────────────────────────────

export type GateCode =
  | 'CONTENT_REQUIRED'
  | 'REVIEW_SIGNOFF_REQUIRED'
  | 'APPROVAL_SIGNOFF_REQUIRED'
  | 'PLACEMENT_REQUIRED'
  | 'PACKAGING_VALIDATION_REQUIRED'
  | 'APPROVED_IS_IMMUTABLE'
  | 'ILLEGAL_TRANSITION';

export interface TransitionResult {
  allowed: boolean;
  from: DocumentStage;
  to: DocumentStage;
  /** Populated when not allowed: the gate(s) that blocked the transition. */
  blockedBy: GateCode[];
  /** Human-readable reason. */
  reason: string;
}

/** Legal forward/branch transitions (before gating). Default deny for anything not listed. */
const LEGAL_TRANSITIONS: Record<DocumentStage, DocumentStage[]> = {
  authoring: ['in_review', 'withdrawn'],
  in_review: ['approved', 'authoring', 'withdrawn'], // review can request revision
  approved: ['placed', 'superseded', 'withdrawn'],   // NOT back to authoring — supersede instead
  placed: ['packaged', 'approved', 'superseded', 'withdrawn'], // can unplace back to approved
  packaged: ['submitted', 'placed', 'superseded', 'withdrawn'],
  submitted: ['superseded', 'withdrawn'],
  superseded: [],
  withdrawn: [],
};

/**
 * Pure gate: can `state` move from its current stage to `to`? Fail-closed —
 * anything not explicitly permitted, and any unmet gate, is denied.
 */
export function canAdvanceDocument(state: RegulatedDocumentState, to: DocumentStage): TransitionResult {
  const from = state.stage;
  const base: Omit<TransitionResult, 'allowed' | 'blockedBy' | 'reason'> = { from, to };

  if (!LEGAL_TRANSITIONS[from]?.includes(to)) {
    return { ...base, allowed: false, blockedBy: ['ILLEGAL_TRANSITION'], reason: `No legal transition ${from} → ${to}` };
  }

  const blockedBy: GateCode[] = [];

  if (to === 'in_review' && !state.hasContent) blockedBy.push('CONTENT_REQUIRED');

  if (to === 'approved') {
    // Reaching approved from in_review requires a review sign-off.
    if (from === 'in_review' && !state.reviewSignature) blockedBy.push('REVIEW_SIGNOFF_REQUIRED');
  }

  if (to === 'placed') {
    if (!state.approvalSignature) blockedBy.push('APPROVAL_SIGNOFF_REQUIRED');
    if (!isCompletePlacement(state.placement)) blockedBy.push('PLACEMENT_REQUIRED');
  }

  if (to === 'packaged') {
    if (!isCompletePlacement(state.placement)) blockedBy.push('PLACEMENT_REQUIRED');
  }

  if (to === 'submitted') {
    if (!state.packagingValidated) blockedBy.push('PACKAGING_VALIDATION_REQUIRED');
  }

  if (blockedBy.length > 0) {
    return { ...base, allowed: false, blockedBy, reason: `Blocked by: ${blockedBy.join(', ')}` };
  }
  return { ...base, allowed: true, blockedBy: [], reason: `${from} → ${to} permitted` };
}

/** A placement is complete when it carries a registry id, module, and section. */
export function isCompletePlacement(p: DossierPlacement | undefined): p is DossierPlacement {
  return Boolean(p && p.registryId && p.ctdModule && p.sectionCode);
}

// ─── Audit event ──────────────────────────────────────────────────────────────

/**
 * Emitted on EVERY transition and persisted to the audit trail. The server
 * orchestrator writes this to `regulatory_audit_logs`; the spine guarantees one
 * event per transition so the trail is complete and tamper-evident.
 */
export interface DocumentAuditEvent {
  documentId: string;
  version: number;
  from: DocumentStage;
  to: DocumentStage;
  actor: string;
  reason?: string;
  signatureRef?: string;
  placement?: DossierPlacement;
  /** ISO timestamp — supplied by the caller (pure module reads no clock). */
  at: string;
  /** Content hash at the time of transition, for tamper-evidence. */
  contentHash?: string;
  /** Hash of the previous event in this document's chain ('' for the first). */
  prevEventHash?: string;
  /** Hash of this event (computed by the server over the canonical serialization). */
  eventHash?: string;
}

/**
 * The canonical, deterministic serialization the server hashes to produce
 * `eventHash`. Kept here so the append-only audit trail is ONE format across
 * every writer (the plural audit systems converge on this). The server computes
 * `sha256(canonicalAuditPayload(event))`; this module stays crypto-free.
 */
export function canonicalAuditPayload(e: DocumentAuditEvent): string {
  return JSON.stringify([
    e.documentId, e.version, e.from, e.to, e.actor, e.reason ?? '',
    e.signatureRef ?? '', e.at, e.contentHash ?? '', e.prevEventHash ?? '',
  ]);
}

/**
 * Verify append-only chain linkage for one document's audit events (in order).
 * Pure: checks that each event's `prevEventHash` equals the previous event's
 * `eventHash` — it does not recompute hashes. Returns the index of the first
 * broken link, or -1 when the chain is intact.
 */
export function verifyAuditChain(events: DocumentAuditEvent[]): { valid: boolean; brokenAt: number } {
  for (let i = 0; i < events.length; i++) {
    const expectedPrev = i === 0 ? '' : (events[i - 1].eventHash ?? '');
    if ((events[i].prevEventHash ?? '') !== expectedPrev) return { valid: false, brokenAt: i };
  }
  return { valid: true, brokenAt: -1 };
}

/** Build the audit event for a permitted transition. Callers persist it. */
export function buildAuditEvent(
  state: RegulatedDocumentState,
  to: DocumentStage,
  ctx: { actor: string; at: string; reason?: string; signatureRef?: string; contentHash?: string },
): DocumentAuditEvent {
  return {
    documentId: state.documentId,
    version: state.version,
    from: state.stage,
    to,
    actor: ctx.actor,
    reason: ctx.reason,
    signatureRef: ctx.signatureRef,
    placement: state.placement,
    at: ctx.at,
    contentHash: ctx.contentHash,
  };
}

// ─── Progress ─────────────────────────────────────────────────────────────────

/** 0..1 forward progress along the spine (terminal branches map to their last forward stage). */
export function stageProgress(stage: DocumentStage): number {
  if (stage === 'superseded' || stage === 'withdrawn') return 0;
  const idx = FORWARD_STAGE_ORDER.indexOf(stage);
  return idx < 0 ? 0 : idx / (FORWARD_STAGE_ORDER.length - 1);
}

// ─── Stage → subsystem binding (documentation, not behaviour) ─────────────────

/**
 * The canonical map from each stage to the EXISTING subsystem that implements
 * it. The orchestrator uses this to route; it is exported so the binding is
 * discoverable and reviewable in one place (prevents new parallel stores).
 */
export const STAGE_SUBSYSTEM: Record<DocumentStage, string> = {
  authoring: 'coauthor_documents + AnA drafting / artifact-version store',
  in_review: 'medical-writing QC + ai-actions run-validation',
  approved: 'ai-actions promote-artifact → unified_documents (Part 11 e-signature)',
  placed: 'submission_leaves (CTD/eCTD coordinate)',
  packaged: 'server/services/ectd assemble-from-core / package-from-core',
  submitted: 'ESG / regional submission gateway',
  superseded: 'unified_documents version supersede',
  withdrawn: 'unified_documents withdraw',
};
