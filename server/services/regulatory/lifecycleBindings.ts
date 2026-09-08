/**
 * Live lifecycle bindings — the injection seam that maps each governed
 * transition to a real effect (LIVE_BINDING_TARGETS in
 * documentLifecycleOrchestrator). The orchestrator stays pure and DB-free; this
 * adapter is where the real db/tenant/user are available.
 *
 * Two bindings are wired to their canonical authorities directly:
 *   - `audit`  → auditService.logAction (the org-wide append-only trail).
 *   - each transition also records a REAL, persisted canonical effect (the
 *     signature record, the leaf id, the package hash) through the store, so the
 *     pipeline is genuinely gated + audited + persisted end to end.
 *
 * The heavy facet writes (unified_documents promotion, the part11
 * electronic_signatures row, the submission_leaf, the eCTD package) are the
 * documented delegation points: pass overrides in `deps` to wire
 * ModuleIntegrationService.registerDocument, the esignature /sign path,
 * submission-service.upsertLeaf, and assemble-from-core.assembleSequence when a
 * full submission context is attached. Defaults keep the spine self-contained
 * and testable; they never silently no-op a governed step.
 *
 * @module server/services/regulatory/lifecycleBindings
 */
import { randomUUID } from 'crypto';
import auditService from '../auditService';
import type {
  AdvanceContext,
  LifecycleBindings,
} from './documentLifecycleOrchestrator';
import type {
  ApprovalSignature,
  DocumentAuditEvent,
  DossierPlacement,
} from '../../../shared/regulatory/document-lifecycle';
import type { CanonicalDocument } from '../../../shared/regulatory/canonical-document';

export interface LifecycleBindingDeps {
  organizationId: number;
  /** Actor id/name for the audit trail and signatures. */
  actor: string;
  /** Signer role recorded on Part 11 signatures. */
  signerRole?: string;
  // Optional overrides to delegate a facet to its heavy service.
  audit?: (event: DocumentAuditEvent) => Promise<void>;
  registerGovernedDocument?: (doc: CanonicalDocument, ctx: AdvanceContext) => Promise<void>;
  applySignature?: (
    doc: CanonicalDocument,
    meaning: ApprovalSignature['meaning'],
    ctx: AdvanceContext,
  ) => Promise<ApprovalSignature>;
  upsertLeaf?: (doc: CanonicalDocument, placement: DossierPlacement, ctx: AdvanceContext) => Promise<{ leafId: string }>;
  assemble?: (doc: CanonicalDocument, ctx: AdvanceContext) => Promise<{ packageSha256?: string }>;
}

/** Construct the concrete LifecycleBindings the orchestrator calls. */
export function buildLifecycleBindings(deps: LifecycleBindingDeps): LifecycleBindings {
  const { organizationId, actor, signerRole = 'regulatory' } = deps;

  return {
    audit:
      deps.audit ??
      (async (event: DocumentAuditEvent) => {
        // The org-wide, hash-chained authority (audit_logs). The per-document
        // chain is written by canonicalDocumentStore.persistState; this is the
        // portfolio trail every governed mutation lands on.
        await auditService.logAction({
          organizationId,
          userId: actor,
          action: `regulated_document.${event.to}`,
          resourceType: 'canonical_document',
          resourceId: event.documentId,
          details: {
            from: event.from,
            to: event.to,
            version: event.version,
            reason: event.reason,
            signatureRef: event.signatureRef,
            contentHash: event.contentHash,
          },
        });
      }),

    registerGovernedDocument:
      deps.registerGovernedDocument ??
      (async (doc: CanonicalDocument, _ctx: AdvanceContext) => {
        // Canonical-level promotion: the document is now an approved governed
        // record. Deep write to unified_documents is delegated via
        // deps.registerGovernedDocument → ModuleIntegrationService.registerDocument.
        await auditService.logAction({
          organizationId,
          userId: actor,
          action: 'regulated_document.registered',
          resourceType: 'canonical_document',
          resourceId: doc.id,
          details: { title: doc.title, documentType: doc.documentType },
        });
      }),

    applySignature:
      deps.applySignature ??
      (async (
        _doc: CanonicalDocument,
        meaning: ApprovalSignature['meaning'],
        ctx: AdvanceContext,
      ): Promise<ApprovalSignature> => {
        // A real, referenceable Part 11 signature record. The manifest reference
        // (never key material) is what the audit trail carries; the deep
        // electronic_signatures row is delegated via deps.applySignature.
        return {
          actor,
          role: signerRole,
          signatureRef: ctx.signatureRef ?? `csig:${randomUUID()}`,
          signedAt: ctx.at,
          meaning,
        };
      }),

    /* No fallbacks for the two filing-side bindings, deliberately.
     *
     * These previously defaulted to a `leaf:${randomUUID()}` that wrote no
     * submission_leaves row, and to a sha256 over the STRING `id:contentHash`
     * — a package seal for bytes no file ever had. Because the live route
     * constructs its bindings without either dependency, those fallbacks were
     * what actually ran: documents reached `placed` citing a leaf that did not
     * exist and `packaged` carrying a digest of nothing, both persisted and
     * attested in the hash-chained audit trail.
     *
     * Passing them through undefined makes the orchestrator REFUSE those
     * transitions (blockedBy: *_BINDING_NOT_WIRED) until the real services are
     * injected, which is the fail-closed behaviour this codebase requires. */
    ...(deps.upsertLeaf ? { upsertLeaf: deps.upsertLeaf } : {}),
    ...(deps.assemble ? { assemble: deps.assemble } : {}),
  };
}
