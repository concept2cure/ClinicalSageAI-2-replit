/**
 * Live lifecycle bindings — the injection seam that maps each governed
 * transition to a real effect (LIVE_BINDING_TARGETS in
 * documentLifecycleOrchestrator). The orchestrator stays pure and DB-free; this
 * adapter is where the real db/tenant/user are available.
 *
 * Every default write runs on `deps.client`, the caller's transaction (VR-12):
 * `audit` and `registerGovernedDocument` write one sha256-chained, sealed
 * audit_logs row each (writeChainedAuditRow), and a failure propagates, so the
 * stage change rolls back with it. With no client they refuse rather than
 * write somewhere else.
 *
 * Before 2026-09-29 both went through auditService.logAction, which runs on its
 * own connection and swallows a failure, so a transition could commit with no
 * audit row. (It would now also wait on the tenant's chain position that the
 * signing transaction holds.)
 *
 * `applySignature` has no default. It returned a `csig:<uuid>` JSON object: no
 * signature record, no printed name, bound to nothing. The lifecycle route
 * supplies the real one (a Part 11 electronic_signatures record, written beside
 * the signer's re-verification), and without it approving is refused.
 *
 * @module server/services/regulatory/lifecycleBindings
 */
import { writeChainedAuditRow } from '../auditService';
import type { SignatureDbClient } from '../part11/signature-persistence';
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
  /** Actor id for the audit trail. */
  actor: string;
  /** The transaction every default write runs on. */
  client?: SignatureDbClient;
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
  const { organizationId, actor } = deps;
  const onTransaction = (binding: string): SignatureDbClient => {
    if (!deps.client) {
      throw new Error(
        `LIFECYCLE_TRANSACTION_REQUIRED: the ${binding} binding writes on the transaction that records the transition, and none was given.`,
      );
    }
    return deps.client;
  };

  return {
    audit:
      deps.audit ??
      (async (event: DocumentAuditEvent) => {
        // The org-wide, hash-chained authority (audit_logs). The per-document
        // chain is written by canonicalDocumentStore.persistState.
        await writeChainedAuditRow(onTransaction('audit'), {
          organizationId,
          userId: actor,
          action: `regulated_document.${event.to}`,
          resourceType: 'canonical_document',
          resourceId: event.documentId,
          reason: event.reason ?? null,
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
        await writeChainedAuditRow(onTransaction('registerGovernedDocument'), {
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
      (async (): Promise<ApprovalSignature> => {
        throw new Error(
          'LIFECYCLE_SIGNATURE_NOT_WIRED: approving writes a Part 11 signature record, and no signer was given. Nothing was signed.',
        );
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
