/**
 * Document lifecycle orchestrator — the ONE governed pipeline.
 *
 * The forensic finding is that the platform has several interconnected document
 * components but no single orchestrator that carries one identity from authoring
 * through approval, placement, packaging, and audit. Existing orchestrators each
 * start mid-pipeline (ApprovalOrchestrator: unified_documents only;
 * submission-service: starts at placement; assemble-from-core: starts at
 * packaging). This module is the missing spine: it enforces the canonical
 * lifecycle gates (shared/regulatory/document-lifecycle) and routes each
 * transition to the EXISTING blessed service — it reimplements none of them.
 *
 * The blessed services are injected as `LifecycleBindings` (the same dependency-
 * injection pattern core-to-packager uses for `resolveFile`), so the pure
 * coordination — gate enforcement, transition→service routing, single audit
 * emission, identity reconciliation — is unit-testable without a database. The
 * live adapter (`liveBindingsDoc` at the bottom) maps each binding to the real
 * function per RECONCILE.md §6.
 *
 * @module server/services/regulatory/documentLifecycleOrchestrator
 */

import {
  canAdvanceDocument,
  buildAuditEvent,
  type DocumentStage,
  type RegulatedDocumentState,
  type DocumentAuditEvent,
  type DossierPlacement,
  type ApprovalSignature,
} from '../../../shared/regulatory/document-lifecycle';
import {
  makeSourceRef,
  isCanonicalId,
  validateCanonicalVersion,
  type CanonicalDocument,
  type CanonicalVersion,
  type CanonicalDocumentId,
  type CanonicalVersionId,
  type DocumentSourceRef,
  type DocumentSourceSystem,
  type ExportFacet,
} from '../../../shared/regulatory/canonical-document';

// ─── Projection: collapse the three identity systems into one ─────────────────

/** Rows from the existing tables that back one logical document. */
export interface ProjectionInput {
  canonicalId: string;            // stable UUID (assigned once, persisted alongside the doc)
  title: string;
  documentType: string;
  organizationId: number;
  projectId?: string;
  version: number;
  stage: DocumentStage;
  createdAt: string;
  updatedAt: string;
  /** Present rows keyed by the source system that owns each facet. */
  sources: Partial<Record<DocumentSourceSystem, { nativeId: string | number; role: DocumentSourceRef['role'] }>>;
  hasContent: boolean;
  contentHash: string;
  reviewSignature?: ApprovalSignature;
  approvalSignature?: ApprovalSignature;
  placement?: DossierPlacement;
  packagingValidated?: boolean;
  /** Export representation (format + md5 + sha256), required once packaged. */
  exportFacet?: ExportFacet;
  audit: DocumentAuditEvent[];
}

export interface ProjectedDocument {
  document: CanonicalDocument;
  version: CanonicalVersion;
  state: RegulatedDocumentState;
  violations: string[];
}

/**
 * Project the existing rows onto the canonical model. This is the concrete
 * convergence step: whatever the source writer's native id kind (integer for
 * unified/coauthor, UUID for artifacts), the canonical identity is the single
 * UUID and every source is reached through a typed ref.
 */
export function projectCanonicalDocument(input: ProjectionInput): ProjectedDocument {
  const docId = input.canonicalId as CanonicalDocumentId;
  const versionId = `${input.canonicalId}:v${input.version}` as CanonicalVersionId;

  const sourceRefs: DocumentSourceRef[] = Object.entries(input.sources)
    .filter(([, v]) => v != null)
    .map(([system, v]) => makeSourceRef(system as DocumentSourceSystem, v!.nativeId, v!.role));

  const immutable = ['approved', 'placed', 'packaged', 'submitted'].includes(input.stage);

  const version: CanonicalVersion = {
    id: versionId,
    documentId: docId,
    version: input.version,
    stage: input.stage,
    contentHash: input.contentHash,
    immutable,
    createdAt: input.createdAt,
    approval: input.approvalSignature,
    placement: input.placement,
    export: input.exportFacet,
    audit: input.audit,
  };

  const document: CanonicalDocument = {
    id: docId,
    title: input.title,
    documentType: input.documentType,
    organizationId: input.organizationId,
    projectId: input.projectId,
    currentVersionId: versionId,
    sourceRefs,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };

  const state: RegulatedDocumentState = {
    documentId: docId,
    title: input.title,
    stage: input.stage,
    version: input.version,
    hasContent: input.hasContent,
    reviewSignature: input.reviewSignature,
    approvalSignature: input.approvalSignature,
    placement: input.placement,
    packagingValidated: input.packagingValidated,
  };

  return { document, version, state, violations: validateCanonicalVersion(document, version) };
}

// ─── Bindings: the existing blessed services (injected) ───────────────────────

export interface AdvanceContext {
  actor: string;
  at: string;
  reason?: string;
  signatureRef?: string;
  contentHash?: string;
  /** Placement to assign when transitioning to `placed`. */
  placement?: DossierPlacement;
}

/**
 * Each binding maps to ONE existing service. The orchestrator calls these; it
 * never writes tables directly. Return values feed the next state.
 */
export interface LifecycleBindings {
  /** Promote/register into the governed unified_documents record (ModuleIntegrationService.registerDocument). */
  registerGovernedDocument(doc: CanonicalDocument, ctx: AdvanceContext): Promise<void>;
  /** Apply a 21 CFR Part 11 e-signature (server/services/part11 + esignature route). */
  applySignature(doc: CanonicalDocument, meaning: ApprovalSignature['meaning'], ctx: AdvanceContext): Promise<ApprovalSignature>;
  /**
   * Write/point a submission_leaf so the approved doc becomes placed
   * (submission-service.upsertLeaf).
   *
   * OPTIONAL, and deliberately so: there is no default. A fallback here would
   * have to invent a leaf id, and a placement citing a leaf that was never
   * written is a falsified record. When this is absent the `placed` transition
   * is REFUSED (see advanceDocument), not simulated.
   */
  upsertLeaf?(doc: CanonicalDocument, placement: DossierPlacement, ctx: AdvanceContext): Promise<{ leafId: string }>;
  /**
   * Assemble the sequence into an eCTD package (ectd/assemble-from-core).
   *
   * OPTIONAL for the same reason: the only thing a fallback could return is a
   * digest computed over something other than package bytes, which is a package
   * seal for a package that does not exist. Absent → `packaged` is REFUSED.
   */
  assemble?(doc: CanonicalDocument, ctx: AdvanceContext): Promise<{ packageSha256?: string; packageMd5?: string }>;
  /** Append ONE event to the single audit authority (auditService.logAction). */
  audit(event: DocumentAuditEvent): Promise<void>;
}

export interface AdvanceResult {
  ok: boolean;
  from: DocumentStage;
  to: DocumentStage;
  /** Populated when the gate blocked the transition. */
  blockedBy?: string[];
  state: RegulatedDocumentState;
  auditEvent?: DocumentAuditEvent;
  /**
   * The digest of the package the `assemble` binding actually produced, passed
   * back so the caller seals the export record from a real assembly instead of
   * recomputing a hash over an identifier string.
   */
  packageSha256?: string;
  /** The md5 of the same package — the digest the eCTD index itself carries. */
  packageMd5?: string;
}

/**
 * Advance a document one stage. Fail-closed: the canonical gate is checked FIRST;
 * only on pass are the bound services invoked, and EXACTLY ONE audit event is
 * appended (the single trail). The service calls for each transition are the
 * four load-bearing join points the map identified.
 */
export async function advanceDocument(
  state: RegulatedDocumentState,
  to: DocumentStage,
  ctx: AdvanceContext,
  bindings: LifecycleBindings,
  document: CanonicalDocument,
): Promise<AdvanceResult> {
  // 1. Gate (fail-closed) — evaluated against the placement the caller intends.
  const effectiveState: RegulatedDocumentState = to === 'placed' && ctx.placement
    ? { ...state, placement: ctx.placement }
    : state;
  const gate = canAdvanceDocument(effectiveState, to);
  if (!gate.allowed) {
    return { ok: false, from: state.stage, to, blockedBy: gate.blockedBy, state };
  }

  // 2. Route to the existing blessed service for this transition.
  const next: RegulatedDocumentState = { ...state };
  let signatureRef = ctx.signatureRef;
  let packageSha256: string | undefined;
  let packageMd5: string | undefined;

  if (to === 'approved') {
    const sig = await bindings.applySignature(document, 'approved', ctx);
    next.approvalSignature = sig;
    signatureRef = sig.signatureRef;
    await bindings.registerGovernedDocument(document, ctx);
  } else if (to === 'placed') {
    // No leaf writer wired → refuse. Inventing an id here would record a
    // placement against a submission_leaves row that does not exist.
    if (!bindings.upsertLeaf) {
      return {
        ok: false,
        from: state.stage,
        to,
        blockedBy: ['PLACEMENT_BINDING_NOT_WIRED: no upsertLeaf binding is configured, so no submission leaf can be written for this placement'],
        state,
      };
    }
    const placement = ctx.placement ?? state.placement!;
    const { leafId } = await bindings.upsertLeaf(document, placement, ctx);
    next.placement = { ...placement, leafId };
  } else if (to === 'packaged') {
    // No assembler wired → refuse. The alternative is to mark packaging
    // validated over a package nothing built.
    if (!bindings.assemble) {
      return {
        ok: false,
        from: state.stage,
        to,
        blockedBy: ['PACKAGING_BINDING_NOT_WIRED: no assemble binding is configured, so no eCTD package can be built or sealed for this document'],
        state,
      };
    }
    const assembled = await bindings.assemble(document, ctx);
    packageSha256 = assembled?.packageSha256;
    packageMd5 = assembled?.packageMd5;
    next.packagingValidated = true;
  }

  next.stage = to;

  // 3. Exactly one audit event to the single authority.
  const auditEvent = buildAuditEvent({ ...state }, to, { ...ctx, signatureRef });
  await bindings.audit(auditEvent);

  return { ok: true, from: state.stage, to, state: next, auditEvent, packageSha256, packageMd5 };
}

// ─── Live binding adapter (documentation of the real wiring) ──────────────────

/**
 * The mapping from each binding to its real function. Kept as documentation +
 * a single wiring point; the concrete adapter is constructed in the route layer
 * where the db handle, tenant, and user are available (so this module stays
 * DB-free and testable). Do not add a second implementation of any of these.
 */
export const LIVE_BINDING_TARGETS = {
  registerGovernedDocument: 'server/services/ModuleIntegrationService.ts → registerDocument()',
  applySignature: 'server/services/part11/* + server/routes/esignature.ts → /sign (electronic_signatures)',
  upsertLeaf: 'server/services/submission-service/submission-service.ts → upsertLeaf()',
  assemble: 'server/services/ectd/assemble-from-core.ts → assembleSequence()',
  audit: 'server/services/auditService.ts → logAction() (audit_logs; sha256-chained + HMAC)',
} as const;

/** Guard: a document must carry a UUID canonical id before it can enter the pipeline. */
export function assertCanonicalIdentity(document: CanonicalDocument): void {
  if (!isCanonicalId(document.id)) {
    throw new Error(`Document ${document.id} lacks a canonical UUID identity — refusing to orchestrate an unidentified document`);
  }
}
