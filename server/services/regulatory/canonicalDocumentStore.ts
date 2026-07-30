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
 * to the prior event, so `verifyAuditChain` (shared/regulatory) can prove the
 * chain was never rewritten.
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
  canonicalAuditPayload,
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

/** Load one canonical document as a ProjectionInput (org-scoped), or null. */
export async function loadProjectionInput(
  db: CanonicalStoreDb,
  canonicalId: string,
  organizationId: number,
): Promise<ProjectionInput | null> {
  const [row] = await db
    .select()
    .from(canonicalDocuments)
    .where(
      and(
        eq(canonicalDocuments.canonicalId, canonicalId),
        eq(canonicalDocuments.organizationId, organizationId),
      ),
    )
    .limit(1);
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
 * Persist an advanced state and append ONE hash-chained audit event. The event
 * is linked to the current tail of the trail (prevEventHash) and sealed with its
 * own eventHash, so the trail stays append-only and tamper-evident.
 */
export async function persistState(
  db: CanonicalStoreDb,
  canonicalId: string,
  organizationId: number,
  next: RegulatedDocumentState,
  auditEvent: DocumentAuditEvent,
  exportFacet?: ProjectionInput['exportFacet'],
): Promise<void> {
  const existing = await loadProjectionInput(db, canonicalId, organizationId);
  if (!existing) {
    throw new Error(`Canonical document ${canonicalId} not found in organization ${organizationId}`);
  }

  const prior = existing.audit;
  const prevEventHash = prior.length ? (prior[prior.length - 1].eventHash ?? '') : '';
  const linked: DocumentAuditEvent = { ...auditEvent, prevEventHash };
  const eventHash = createHash('sha256').update(canonicalAuditPayload(linked)).digest('hex');
  const sealed: DocumentAuditEvent = { ...linked, eventHash };

  await db
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
      audit: [...prior, sealed],
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(canonicalDocuments.canonicalId, canonicalId),
        eq(canonicalDocuments.organizationId, organizationId),
      ),
    );
}

/** Record a signature (review or approval sign-off) on a canonical document. */
export async function recordSignature(
  db: CanonicalStoreDb,
  canonicalId: string,
  organizationId: number,
  meaning: 'reviewed' | 'approved',
  signature: RegulatedDocumentState['reviewSignature'],
): Promise<void> {
  const column = meaning === 'reviewed' ? 'reviewSignature' : 'approvalSignature';
  await db
    .update(canonicalDocuments)
    .set({ [column]: signature ?? null, updatedAt: new Date() })
    .where(
      and(
        eq(canonicalDocuments.canonicalId, canonicalId),
        eq(canonicalDocuments.organizationId, organizationId),
      ),
    );
}
