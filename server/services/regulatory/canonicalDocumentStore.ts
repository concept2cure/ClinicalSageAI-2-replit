/**
 * Canonical document store — persistence for the ONE governed pipeline.
 *
 * Reads and writes the `canonical_documents` projection row that carries a
 * single stable UUID identity through the lifecycle. It is the DB half of the
 * pure orchestrator (documentLifecycleOrchestrator): `loadProjectionInput`
 * assembles a `ProjectionInput`, and `persistState` writes the advanced stage
 * back and appends ONE hash-chained event to the per-document audit trail.
 *
 * The audit trail is append-only and tamper-evident: each event's
 * `eventHash = sha256(canonicalAuditPayload(event))` and `prevEventHash` links
 * to the prior event, so `verifyAuditChain` (shared/regulatory), given
 * `hashLifecyclePayload`, recomputes every hash and proves the chain was never
 * rewritten. Since VR-03 (2026-09-25) the database enforces it as well
 * (migrations/20260925_canonical_documents_append_only.sql): the trail only
 * grows, signatures are written once, nothing is deleted.
 *
 * Every write here runs in a transaction that holds the document's row lock
 * (SELECT … FOR UPDATE) from the read to the write. Before VR-03 the read and
 * the write were separate statements, so two concurrent transitions could each
 * append to the same prior trail and one event was lost.
 *
 * @module server/services/regulatory/canonicalDocumentStore
 */
import { randomUUID, createHash } from 'crypto';
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { canonicalDocuments } from '../../../shared/schema/canonical_documents';
import { resolveToRegistryEntry } from '../../../shared/regulatory/submission-type-bridge';
import { getSectionBlueprintForEntry } from '../../../shared/regulatory/project-bootstrap';
import type { SectionDefinition } from '../../../shared/regulatory/document-taxonomy';
import {
  buildSignatureEvent,
  canonicalAuditPayload,
  type ApprovalSignature,
  type DocumentAuditEvent,
  type DocumentStage,
  type RegulatedDocumentState,
} from '../../../shared/regulatory/document-lifecycle';
import type {
  ProjectionInput,
} from './documentLifecycleOrchestrator';
import type {
  DocumentSourceRef,
  DocumentSourceSystem,
} from '../../../shared/regulatory/canonical-document';

/** Any drizzle handle (node-postgres in prod, PGlite in tests). */
export type CanonicalStoreDb = NodePgDatabase<Record<string, never>>;
/**
 * A handle or a transaction on one. Every locked read and every write runs in a
 * transaction; a caller that already holds one passes it, and the store nests
 * (a savepoint) rather than opening a second connection.
 */
export type CanonicalStoreHandle = Pick<CanonicalStoreDb, 'select' | 'update' | 'insert' | 'transaction'>;

/** sha256 over canonicalAuditPayload — the one hasher that seals the trail and verifies it. */
export function hashLifecyclePayload(payload: string): string {
  return createHash('sha256').update(payload).digest('hex');
}

/** A write the lifecycle record refuses, with the reason a route turns into a 409. */
export class LifecycleRecordRefusal extends Error {
  constructor(
    readonly code: 'SIGNATURE_ALREADY_RECORDED' | 'SIGNATURE_STAGE_MISMATCH' | 'STALE_STAGE',
    message: string,
  ) {
    super(message);
    this.name = 'LifecycleRecordRefusal';
  }
}

/**
 * Why a review sign-off cannot be recorded on this document now, or null.
 * One sign-off per review round: the round opens when the document enters
 * in_review and closes on approval or on the revision transition, which clears
 * the column (the sign-off itself stays in the trail).
 */
export function reviewSignatureRefusal(doc: Pick<ProjectionInput, 'stage' | 'reviewSignature'>): LifecycleRecordRefusal | null {
  if (doc.stage !== 'in_review') {
    return new LifecycleRecordRefusal(
      'SIGNATURE_STAGE_MISMATCH',
      `A review sign-off is recorded while the document is in review; it is ${doc.stage}.`,
    );
  }
  if (doc.reviewSignature) {
    return new LifecycleRecordRefusal(
      'SIGNATURE_ALREADY_RECORDED',
      'This review round already has its sign-off. It cannot be replaced; a revision starts a new round.',
    );
  }
  return null;
}

/** Link an event to the tail of `prior` and seal it with its own hash. */
function sealEvent(prior: DocumentAuditEvent[], event: DocumentAuditEvent): DocumentAuditEvent {
  const prevEventHash = prior.length ? (prior[prior.length - 1].eventHash ?? '') : '';
  const linked: DocumentAuditEvent = { ...event, prevEventHash };
  return { ...linked, eventHash: hashLifecyclePayload(canonicalAuditPayload(linked)) };
}

export interface CreateCanonicalDocumentInput {
  organizationId: number;
  title: string;
  documentType: string;
  projectId?: string;
  hasContent?: boolean;
  contentHash?: string;
  sources?: ProjectionInput['sources'];
}

/**
 * Resolve the authoring outline for a document type from the registry section
 * blueprint. "Create a document of type US_IND" then carries the CTD sections;
 * a device 510(k) carries its device sections. Empty array when the type does
 * not resolve to a registry entry.
 */
export function resolveOutlineForType(documentType: string): SectionDefinition[] {
  try {
    const entry = resolveToRegistryEntry(documentType);
    if (!entry) return [];
    return getSectionBlueprintForEntry(entry).sections ?? [];
  } catch {
    // The outline is an enhancement, never a precondition for creating a
    // governed document. If registry resolution is unavailable, create the
    // document with an empty outline rather than failing the write.
    return [];
  }
}

/** Insert a new canonical document at the `authoring` stage; returns its UUID. */
export async function createCanonicalDocument(
  db: CanonicalStoreDb,
  input: CreateCanonicalDocumentInput,
): Promise<string> {
  const canonicalId = randomUUID();
  const now = new Date();
  await db.insert(canonicalDocuments).values({
    canonicalId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    title: input.title,
    documentType: input.documentType,
    version: 1,
    stage: 'authoring',
    hasContent: input.hasContent ?? false,
    contentHash: input.contentHash ?? '',
    sourceRefs: input.sources ?? {},
    // Instantiate the type's blueprint outline at creation.
    outline: resolveOutlineForType(input.documentType),
    audit: [],
    createdAt: now,
    updatedAt: now,
  });
  return canonicalId;
}

/** Read a canonical document's authoring outline (org-scoped). */
export async function readOutline(
  db: CanonicalStoreDb,
  canonicalId: string,
  organizationId: number,
): Promise<SectionDefinition[]> {
  const [row] = await db
    .select({ outline: canonicalDocuments.outline })
    .from(canonicalDocuments)
    .where(
      and(
        eq(canonicalDocuments.canonicalId, canonicalId),
        eq(canonicalDocuments.organizationId, organizationId),
      ),
    )
    .limit(1);
  return (row?.outline ?? []) as SectionDefinition[];
}

/**
 * Load one canonical document as a ProjectionInput (org-scoped), or null.
 * `forUpdate` takes the row lock; it holds only inside a transaction, until it
 * ends.
 */
export async function loadProjectionInput(
  db: CanonicalStoreHandle,
  canonicalId: string,
  organizationId: number,
  opts: { forUpdate?: boolean } = {},
): Promise<ProjectionInput | null> {
  const query = db
    .select()
    .from(canonicalDocuments)
    .where(
      and(
        eq(canonicalDocuments.canonicalId, canonicalId),
        eq(canonicalDocuments.organizationId, organizationId),
      ),
    )
    .limit(1);
  const [row] = opts.forUpdate ? await query.for('update') : await query;
  if (!row) return null;

  return {
    canonicalId: row.canonicalId,
    title: row.title,
    documentType: row.documentType,
    organizationId: row.organizationId,
    projectId: row.projectId ?? undefined,
    version: row.version,
    stage: row.stage as DocumentStage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    sources: (row.sourceRefs ?? {}) as Partial<
      Record<DocumentSourceSystem, { nativeId: string | number; role: DocumentSourceRef['role'] }>
    >,
    hasContent: row.hasContent,
    contentHash: row.contentHash,
    reviewSignature: (row.reviewSignature ?? undefined) as ProjectionInput['reviewSignature'],
    approvalSignature: (row.approvalSignature ?? undefined) as ProjectionInput['approvalSignature'],
    placement: (row.placement ?? undefined) as ProjectionInput['placement'],
    packagingValidated: row.packagingValidated,
    exportFacet: (row.exportFacet ?? undefined) as ProjectionInput['exportFacet'],
    audit: (row.audit ?? []) as DocumentAuditEvent[],
  };
}

/**
 * Persist an advanced state and append ONE hash-chained audit event, under the
 * document's row lock. Refuses (STALE_STAGE) when the document is no longer at
 * the stage the transition was computed from — the concurrent-transition case
 * the lock exists for — so a transition can never be written over a state it
 * did not see.
 */
export async function persistState(
  db: CanonicalStoreHandle,
  canonicalId: string,
  organizationId: number,
  next: RegulatedDocumentState,
  auditEvent: DocumentAuditEvent,
  exportFacet?: ProjectionInput['exportFacet'],
): Promise<DocumentAuditEvent> {
  return db.transaction(async (tx) => {
    const existing = await loadProjectionInput(tx, canonicalId, organizationId, { forUpdate: true });
    if (!existing) {
      throw new Error(`Canonical document ${canonicalId} not found in organization ${organizationId}`);
    }
    if (existing.stage !== auditEvent.from) {
      throw new LifecycleRecordRefusal(
        'STALE_STAGE',
        `The document moved to ${existing.stage} while this ${auditEvent.from} → ${auditEvent.to} transition was being made.`,
      );
    }

    const sealed = sealEvent(existing.audit, auditEvent);
    await tx
      .update(canonicalDocuments)
      .set({
        stage: next.stage,
        version: next.version,
        hasContent: next.hasContent,
        reviewSignature: next.reviewSignature ?? null,
        approvalSignature: next.approvalSignature ?? null,
        placement: next.placement ?? null,
        packagingValidated: next.packagingValidated ?? false,
        // Preserve a previously-sealed export facet; only overwrite when a new one
        // is produced (on the packaging transition).
        exportFacet: exportFacet ?? existing.exportFacet ?? null,
        audit: [...existing.audit, sealed],
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(canonicalDocuments.canonicalId, canonicalId),
          eq(canonicalDocuments.organizationId, organizationId),
        ),
      );
    return sealed;
  });
}

/**
 * Record the review sign-off for the current review round, write-once, with its
 * own sealed trail event (buildSignatureEvent), under the row lock. Returns the
 * sealed event; throws LifecycleRecordRefusal when reviewSignatureRefusal says
 * no, and null when the document does not exist in this organization.
 *
 * There is no approval counterpart. An approval is recorded by the in_review →
 * approved transition, which signs (documentLifecycleOrchestrator); a second
 * path that wrote the same column was how an approval came to be overwritten.
 */
export async function recordReviewSignature(
  db: CanonicalStoreHandle,
  canonicalId: string,
  organizationId: number,
  signature: ApprovalSignature,
): Promise<DocumentAuditEvent | null> {
  return db.transaction(async (tx) => {
    const existing = await loadProjectionInput(tx, canonicalId, organizationId, { forUpdate: true });
    if (!existing) return null;
    const refusal = reviewSignatureRefusal(existing);
    if (refusal) throw refusal;

    const event = buildSignatureEvent(
      {
        documentId: existing.canonicalId,
        title: existing.title,
        stage: existing.stage,
        version: existing.version,
        hasContent: existing.hasContent,
      },
      signature,
      { contentHash: existing.contentHash },
    );
    const sealed = sealEvent(existing.audit, event);
    await tx
      .update(canonicalDocuments)
      .set({ reviewSignature: signature, audit: [...existing.audit, sealed], updatedAt: new Date() })
      .where(
        and(
          eq(canonicalDocuments.canonicalId, canonicalId),
          eq(canonicalDocuments.organizationId, organizationId),
        ),
      );
    return sealed;
  });
}
