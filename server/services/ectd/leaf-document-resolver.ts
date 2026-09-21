/**
 * Resolve a submission leaf's document pointer to the document behind it — ONE
 * resolver for the dispatch-readiness assessment, the Builder's source-document
 * column and, because the governed freeze / dispatch / transmit steps compose
 * the assessment, the gate itself.
 *
 * ── The defect this closes (2026-09-21, MDX demo pack finding F5) ────────────
 * `submission_leaves` addresses two key spaces: `document_id` (integer) for
 * most stores and `document_uuid` for the uuid-keyed vault. The write path
 * (`upsertLeaf`) accepted a vault leaf by uuid, proved its tenancy through the
 * programme and pinned `content_hash` on the leaf; the readiness validator
 * then tested the INTEGER column alone and reported every such leaf
 * `UNRESOLVED_DOCUMENT`. The Builder made the same mistake on the client
 * (`documentId != null` or "unlinked"). A sequence assembled from uploaded
 * vault documents could therefore never clear the dispatch gate, and its
 * leaves read as unlinked on the very surface that had just linked them.
 *
 * ── What this module does ────────────────────────────────────────────────────
 * For each leaf: classify the pointer (complete for its table's key space, or
 * not), look the document up IN THE CALLER'S ORGANIZATION by whichever key its
 * table uses, and compare the SHA-256 pinned on the leaf at filing with the
 * digest the store reports now. Existence and the pin verdict come back as one
 * `LeafDocumentResolution`; `computeDispatchReadiness` turns them into
 * findings (UNRESOLVED_DOCUMENT / DOCUMENT_CONTENT_MISMATCH), the leaves route
 * attaches them to the Builder read model.
 *
 * ── Digest contract ──────────────────────────────────────────────────────────
 * The digest read here is the SAME reading the write side pinned
 * (submission-service LEAF_SOURCE_VERIFIERS / LEAF_SOURCE_UUID_VERIFIERS), per
 * table, so the comparison is like-for-like:
 *   coauthor_documents        sha256(content)                     (null if empty)
 *   rendered_leaf_files       the sha256 recorded at render time
 *   unified_documents         sha256(JSON.stringify(latest version.content))
 *   ctd_onboarding_documents  sha256(upload bytes)                (null if unreadable)
 *   c2c_document_sections     sha256(sectionPlainText(content).trim()) (null if empty)
 *   vault_documents           vault.documents.content_hash
 * Each predicate mirrors the assembler's branch for that table
 * (leaf-source-resolver.ts), so "resolves here" and "materializes there" are
 * the same question. The write-side verifiers are module-local to
 * submission-service and could not be imported without widening that module's
 * surface; the drift guard in leaf-document-resolver.pglite.test.ts pins the
 * table set here to the write side's so a new source cannot ship covered by
 * one and not the other.
 *
 * Tenant-scoped + DB-bound. Never throws on a leaf: every failure to resolve is
 * a stated status, because the caller is a gate and a gate that throws is a
 * gate that reports nothing.
 *
 * @module server/services/ectd/leaf-document-resolver
 */

import { createHash } from 'crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import { coauthorDocuments } from '../../../shared/schema';
import { unifiedDocuments, workflowDocumentVersions } from '../../../shared/schema/unified_workflow';
import { ctdOnboardingDocuments } from '../../../shared/schema/ctd-projects';
import { renderedLeafFiles } from '../../../shared/schema/submissions';
import { readLocalUploadBuffer } from '../anthropic-files';
import { sectionPlainText } from '../c2c/section-content';
import { queryableFromDrizzle } from '../../db/drizzle-queryable.js';
import { documentTableKeyKind, isPlaceableDocumentTable } from './leaf-document-tables';
import {
  hasCompleteDocumentPointer,
  type LeafDocumentPinVerdict,
  type LeafDocumentResolution,
} from './dispatch-readiness';

/** The pointer half of a stored leaf — what the resolver needs and nothing more. */
export interface LeafDocumentPointer {
  // Optional so a SubmissionLeaf (whose pointer fields are all optional — a
  // leaf may carry no document at all) is assignable without a cast.
  documentTable?: string | null;
  documentId?: number | null;
  documentUuid?: string | null;
  /** The SHA-256 pinned when the leaf was filed; null when no pin was taken. */
  documentContentSha256?: string | null;
}

/** Guards the ::uuid cast; a malformed value would raise 22P02 rather than a verdict. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sha256Hex = (input: string | Buffer): string => createHash('sha256').update(input).digest('hex');

/** What a store lookup answers: found or not, and the digest it holds now. */
interface StoreLookup {
  found: boolean;
  storedSha256: string | null;
  /** Why the document is absent or its digest unavailable. */
  reason: string | null;
}

type IntegerLookup = (documentId: number, organizationId: number) => Promise<StoreLookup>;
type UuidLookup = (documentUuid: string, organizationId: number) => Promise<StoreLookup>;

const NOT_FOUND = (table: string): StoreLookup => ({
  found: false,
  storedSha256: null,
  reason: `${table} row not found in this organization`,
});

/** Rows of a `db.execute` result across drivers (node-postgres / PGlite / bare array). */
function rowsOf(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  const rows = (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
}

const INTEGER_LOOKUPS: Record<string, IntegerLookup> = {
  coauthor_documents: async (documentId, organizationId) => {
    const [doc] = await db
      .select({ id: coauthorDocuments.id, content: coauthorDocuments.content })
      .from(coauthorDocuments)
      .where(and(eq(coauthorDocuments.id, documentId), eq(coauthorDocuments.organizationId, organizationId)))
      .limit(1);
    if (!doc) return NOT_FOUND('coauthor_documents');
    const hasBody = typeof doc.content === 'string' && doc.content.length > 0;
    return {
      found: true,
      storedSha256: hasBody ? sha256Hex(doc.content as string) : null,
      reason: hasBody ? null : 'the document has no authored content',
    };
  },

  rendered_leaf_files: async (documentId, organizationId) => {
    const [row] = await db
      .select({ sha256: renderedLeafFiles.sha256 })
      .from(renderedLeafFiles)
      .where(and(eq(renderedLeafFiles.id, documentId), eq(renderedLeafFiles.organizationId, organizationId)))
      .limit(1);
    if (!row) return NOT_FOUND('rendered_leaf_files');
    return { found: true, storedSha256: row.sha256 ?? null, reason: row.sha256 ? null : 'no digest was recorded at render time' };
  },

  unified_documents: async (documentId, organizationId) => {
    const [doc] = await db
      .select({ id: unifiedDocuments.id })
      .from(unifiedDocuments)
      .where(and(eq(unifiedDocuments.id, documentId), eq(unifiedDocuments.organizationId, organizationId)))
      .limit(1);
    if (!doc) return NOT_FOUND('unified_documents');
    const [version] = await db
      .select({ content: workflowDocumentVersions.content })
      .from(workflowDocumentVersions)
      .where(
        and(
          eq(workflowDocumentVersions.documentId, documentId),
          eq(workflowDocumentVersions.organizationId, organizationId),
        ),
      )
      .orderBy(desc(workflowDocumentVersions.version))
      .limit(1);
    const hasBody = !!version && version.content != null;
    return {
      found: true,
      storedSha256: hasBody ? sha256Hex(JSON.stringify(version!.content)) : null,
      reason: hasBody ? null : 'the document has no version content',
    };
  },

  ctd_onboarding_documents: async (documentId, organizationId) => {
    const [doc] = await db
      .select({ storagePath: ctdOnboardingDocuments.storagePath })
      .from(ctdOnboardingDocuments)
      .where(and(eq(ctdOnboardingDocuments.id, documentId), eq(ctdOnboardingDocuments.organizationId, organizationId)))
      .limit(1);
    if (!doc) return NOT_FOUND('ctd_onboarding_documents');
    let buf: Buffer | null;
    try {
      buf = await readLocalUploadBuffer(doc.storagePath);
    } catch {
      buf = null;
    }
    const readable = !!buf && buf.length > 0;
    return {
      found: true,
      storedSha256: readable ? sha256Hex(buf as Buffer) : null,
      reason: readable ? null : 'the uploaded bytes are not readable at their storage path',
    };
  },

  c2c_document_sections: async (documentId, organizationId) => {
    // c2c_document_sections carries NO organization column: the parent
    // c2c_documents.org_id is the tenant gate, exactly as the assembler and the
    // write-side verifier read it.
    const res = await db.execute(sql`
      SELECT s.content
        FROM c2c_document_sections s
        JOIN c2c_documents d ON d.id = s.document_id
       WHERE s.id = ${documentId} AND d.org_id = ${organizationId}
       LIMIT 1`);
    const row = rowsOf(res)[0] as { content: unknown } | undefined;
    if (!row) return NOT_FOUND('c2c_document_sections');
    let content: unknown = row.content;
    if (typeof content === 'string') {
      try { content = JSON.parse(content); } catch { /* keep as text */ }
    }
    const text = sectionPlainText(content).trim();
    return {
      found: true,
      storedSha256: text ? sha256Hex(text) : null,
      reason: text ? null : 'the section has no authored content',
    };
  },
};

const UUID_LOOKUPS: Record<string, UuidLookup> = {
  vault_documents: async (documentUuid, organizationId) => {
    if (!UUID_RE.test(documentUuid)) {
      return { found: false, storedSha256: null, reason: 'document_uuid is not a uuid' };
    }
    // Scoped THROUGH THE PROGRAMME, the authoritative owner of a vault document
    // (vault.documents.organization_id is nullable attribution, not a scope) —
    // the same predicate the write-side verifier and the assembler use.
    const res = await queryableFromDrizzle(db).query(
      `SELECT d.content_hash
         FROM vault.documents d
        WHERE d.id = $1::uuid
          AND d.deleted_at IS NULL
          AND EXISTS (
            SELECT 1 FROM regulatory_programs rp
             WHERE rp.id = d.program_id
               AND rp.organization_id = $2
               AND rp.deleted_at IS NULL
          )
        LIMIT 1`,
      [documentUuid, organizationId],
    );
    const row = res.rows[0] as { content_hash: string | null } | undefined;
    if (!row) return { found: false, storedSha256: null, reason: 'vault document not found in this organization' };
    return {
      found: true,
      storedSha256: row.content_hash ?? null,
      reason: row.content_hash ? null : 'the vault record carries no content hash',
    };
  },
};

/** The tables this resolver can look up — asserted against the write side's tenancy set by test. */
export const RESOLVER_DOCUMENT_TABLES: ReadonlySet<string> = new Set([
  ...Object.keys(INTEGER_LOOKUPS),
  ...Object.keys(UUID_LOOKUPS),
]);

/**
 * Compare the pin taken at filing with what the store reports now. Pure.
 * No pin → `unpinned` (unknown, never "unchanged"); a pin the store can no
 * longer answer → `unverifiable` (the content is not what was filed, whatever
 * happened to it); otherwise equality.
 */
export function compareDocumentPin(
  pinnedSha256: string | null | undefined,
  storedSha256: string | null | undefined,
): LeafDocumentPinVerdict {
  const pinned = (pinnedSha256 ?? '').trim().toLowerCase();
  if (!pinned) return 'unpinned';
  const stored = (storedSha256 ?? '').trim().toLowerCase();
  if (!stored) return 'unverifiable';
  return pinned === stored ? 'match' : 'mismatch';
}

/** The lookup key for one pointer, so the same document is read once per call. */
function lookupKey(p: LeafDocumentPointer): string {
  return `${p.documentTable ?? ''}:${p.documentUuid ?? ''}:${p.documentId ?? ''}`;
}

/**
 * Resolve one pointer. Exported for the Builder route and tests; the batch
 * form below is what the assessor uses.
 */
export async function resolveLeafDocument(
  pointer: LeafDocumentPointer,
  organizationId: number,
): Promise<LeafDocumentResolution> {
  const documentTable = pointer.documentTable ?? null;
  const documentId = pointer.documentId ?? null;
  const documentUuid = pointer.documentUuid ?? null;
  const pinnedSha256 = pointer.documentContentSha256 ?? null;
  const keyKind = documentTableKeyKind(documentTable);
  const base = { keyKind, documentTable, documentId, documentUuid, pinnedSha256, storedSha256: null as string | null };

  if (documentTable && !isPlaceableDocumentTable(documentTable)) {
    return {
      ...base,
      status: 'unplaceable_table',
      pin: compareDocumentPin(pinnedSha256, null),
      reason: `document_table "${documentTable}" is not a placeable leaf source`,
    };
  }
  if (!hasCompleteDocumentPointer({ documentTable, documentId, documentUuid })) {
    return {
      ...base,
      status: 'no_pointer',
      pin: compareDocumentPin(pinnedSha256, null),
      reason: !documentTable
        ? 'the leaf names no document table'
        : keyKind === 'uuid'
          ? `${documentTable} is addressed by document_uuid and the leaf carries none`
          : `${documentTable} is addressed by document_id and the leaf carries none`,
    };
  }

  let lookup: StoreLookup;
  try {
    lookup =
      keyKind === 'uuid'
        ? await UUID_LOOKUPS[documentTable as string](documentUuid as string, organizationId)
        : await INTEGER_LOOKUPS[documentTable as string](documentId as number, organizationId);
  } catch (err) {
    // A store that cannot be read is not a document that exists. Say so.
    lookup = {
      found: false,
      storedSha256: null,
      reason: `lookup failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!lookup.found) {
    return { ...base, status: 'missing', pin: compareDocumentPin(pinnedSha256, null), reason: lookup.reason };
  }
  const pin = compareDocumentPin(pinnedSha256, lookup.storedSha256);
  if (pin === 'mismatch' || pin === 'unverifiable') {
    return {
      ...base,
      storedSha256: lookup.storedSha256,
      status: 'content_changed',
      pin,
      reason:
        pin === 'mismatch'
          ? 'the content hash pinned at filing no longer matches the stored document'
          : `the pinned content cannot be verified: ${lookup.reason ?? 'the store yields no digest'}`,
    };
  }
  return {
    ...base,
    storedSha256: lookup.storedSha256,
    status: 'resolved',
    pin,
    reason: pin === 'unpinned' ? 'no content pin was taken when the leaf was filed' : lookup.reason,
  };
}

/**
 * Resolve every leaf's pointer, in input order. Identical pointers are read
 * once. Never throws for a leaf.
 */
export async function resolveLeafDocuments(
  leaves: readonly LeafDocumentPointer[],
  organizationId: number,
): Promise<LeafDocumentResolution[]> {
  const cache = new Map<string, Promise<LeafDocumentResolution>>();
  return Promise.all(
    leaves.map((leaf) => {
      const key = lookupKey(leaf);
      let pending = cache.get(key);
      if (!pending) {
        pending = resolveLeafDocument(leaf, organizationId);
        cache.set(key, pending);
      }
      return pending;
    }),
  );
}

export default { resolveLeafDocument, resolveLeafDocuments, compareDocumentPin };
