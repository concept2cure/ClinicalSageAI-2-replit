/**
 * Multi-source leaf materialization for the assemblers.
 *
 * `submission_leaves.document_table` is a POLYMORPHIC reference into one of
 * several document tables (see shared/schema/submissions.ts):
 *   - coauthor_documents       — HTML/text content stored INLINE (renderable)
 *   - unified_documents        — title + content in workflow_document_versions
 *                                (the latest version's JSON; renderable)
 *   - ctd_onboarding_documents — an UPLOADED binary file (storage_path/mime);
 *                                staged directly AS A LEAF when it is already a
 *                                PDF (org-scoped, %PDF-verified), else unresolved
 *   - rendered_leaf_files       — bytes this server RENDERED for a filing (the
 *                                IND safety report, annual report, ICSR
 *                                projection); fetched back through the storage
 *                                provider's tenant boundary and re-verified
 *                                against the digest recorded at render time
 *   - c2c_document_sections    — the GOVERNED authoring store (the rows the MDx
 *                                editor and the eu-mdr / eu-ivdr rule packs
 *                                write); plain text rendered via renderLeafPdf,
 *                                tenant-scoped through the parent
 *                                c2c_documents.org_id (renderable)
 *   - vault_documents          — a binary in the separate `vault` schema
 *                                (UUID-keyed); not addressable from an integer
 *                                leaf id, AND its bytes live outside the storage
 *                                provider this module fetches through → unresolved
 *                                (both reasons in leaf-document-tables.ts)
 *
 * Both assemblers (eCTD `assemble-from-core` and device
 * `assemble-technical-file-from-core`) previously resolved ONLY
 * `coauthor_documents` and `return null` for everything else — which silently
 * DROPPED a unified/ctd/vault-backed leaf from the package (a silent, incomplete
 * submission). This module fixes that: it materializes every LOCALLY-RENDERABLE
 * table to a deterministic PDF (same `renderLeafPdf` path, so the md5/checksum
 * contract is unchanged), and for tables whose content is NOT locally available
 * it returns an EXPLICIT "unresolved" record (table + id + reason) so the caller
 * can surface the gap as a visible warning instead of dropping it.
 *
 * Tenant-scoped: every locally-renderable lookup is filtered by organizationId,
 * exactly as the original coauthor branch was.
 *
 * @module server/services/ectd/leaf-source-resolver
 */

import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../../db';
import { coauthorDocuments } from '../../../shared/schema';
import { unifiedDocuments, workflowDocumentVersions } from '../../../shared/schema/unified_workflow';
import { ctdOnboardingDocuments } from '../../../shared/schema/ctd-projects';
import { renderedLeafFiles } from '../../../shared/schema/submissions';
import { getStorageProvider } from '../storage';
import { readLocalUploadBuffer } from '../anthropic-files';
import { sectionPlainText, C2C_SECTION_COMPLETE_STATUSES } from '../c2c/section-content';
import { renderLeafPdf } from './leaf-pdf-renderer';
import { externalDocumentTableReason } from './leaf-document-tables';
import type { LeafLineage, ResolvedFile } from './core-to-packager';
import { queryableFromDrizzle } from '../../db/drizzle-queryable.js';
import { aliasesFor, canonicalIdFor } from '../c2c/document-alias-map.js';

/**
 * An eCTD leaf must be a PDF. Verify the ACTUAL bytes (magic number), never the
 * DB mime string alone — a mislabeled/corrupt upload must not ship to the agency
 * with a valid-looking checksum. (The md5 is computed from whatever we stage, so
 * there is no downstream content check to catch wrong bytes.)
 */
/** Guards the ::uuid cast in the vault branch; a malformed value would raise
 *  22P02 and fail the whole assembly rather than the one leaf. */
const VAULT_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function looksLikePdf(buf: Buffer): boolean {
  return buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-';
}

/** A leaf whose source document could not be materialized into the package. */
export interface UnresolvedLeaf {
  documentTable: string | null;
  documentId: number | null;
  /**
   * The ref's uuid half, carried on every entry (null when the leaf has none),
   * so `leafSourceKey(table, id, uuid)` of an unresolved entry equals the key
   * of the leaf it came from. 2026-09-23 (W5/D7, round-2 skeptic): it used to
   * be set only by the vault branch.
   */
  documentUuid?: string | null;
  reason: string;
}

export interface MaterializeLeafSourcesParams {
  leaves: Array<{
    documentTable: string | null;
    documentId: number | null;
    /** The uuid half of the polymorphic reference. Set for uuid-keyed stores
     *  (vault.documents); null for integer-keyed ones. See
     *  migrations/20260917b_submission_leaf_document_uuid.sql. */
    documentUuid?: string | null;
    /**
     * The leaf's lifecycle operation. A `delete` ships no content, so a
     * document referenced ONLY by delete leaves is not read at all: it is not
     * staged, not counted toward `unfinalized`, and not reported in
     * `unresolved` (2026-09-23, W5/D7, residual repair). Absent → the leaf is
     * treated as shipping, and every gate applies (fail closed).
     */
    lifecycleOp?: string | null;
  }>;
  organizationId: number;
  /** Directory the rendered PDF leaves are written to. */
  stageDir: string;
}

export interface MaterializeLeafSourcesResult {
  /** Resolved files keyed by leafSourceKey(documentTable, documentId, documentUuid). */
  byKey: Map<string, ResolvedFile>;
  /** Leaves whose source could not be materialized (external/missing). A
   *  document referenced only by deletes is never here: it is not read. */
  unresolved: UnresolvedLeaf[];
  /** Number of documents materialized to disk (deduplicated by table+id). */
  materialized: number;
  /**
   * Number of MATERIALIZED leaves whose source document is NOT finalized (its
   * status is a draft/review artifact, not approved/finalized). These leaves DO
   * render into the package, but a submission-grade package must have zero of
   * them — a draft rendered to PDF is not a submission-ready leaf. A document
   * referenced only by `delete` leaves is not counted: a withdrawal ships none
   * of its content (2026-09-23, W5/D7, round-2 skeptic), and since the
   * residual repair of the same date it is not read at all.
   */
  unfinalized: number;
  /** The unfinalized leaves' section + source status, for the completeness report. */
  unfinalizedSections: Array<{ sectionCode: string; status: string }>;
}

/**
 * A source document is submission-FINALIZED only when its lifecycle status is
 * approved or finalized. Every other status (draft, in-progress, review, or an
 * absent status defaulting to draft) is unfinalized — it must not count toward a
 * "complete" package.
 */
const FINALIZED_SOURCE_STATUSES: ReadonlySet<string> = new Set(['approved', 'finalized']);

/**
 * The stores whose status decides whether a leaf built from them may be
 * transmitted, each with its own vocabulary.
 */
export type FinalizedStatusStore =
  | 'coauthor_documents'
  | 'unified_documents'
  | 'c2c_document_sections'
  | 'concept2cure_artifacts';

/**
 * The ONE definition of "finalized" for the document a leaf is built from:
 * a leaf whose source is not finalized is not transmitted to an agency.
 *
 * (2026-09-23, W5/D7, round-2 review.) Exported, and keyed by store, so the
 * package-model spine (POST /api/submission-ops/packages/:id/assemble, which
 * builds its leaves from concept2cure_artifacts) applies the rule the sequence
 * spine applies through materializeLeafSources below, instead of shipping a
 * draft artifact to the agency. The vocabularies genuinely differ, so one set
 * cannot serve every store:
 *   coauthor_documents / unified_documents — `approved | finalized`
 *     (coauthor: draft | in-progress | review | approved | finalized;
 *     unified: draft | in_review | approved | published | archived | rejected —
 *     `published` is set only by ungoverned setters, so it is not finalized).
 *   c2c_document_sections — `approved | locked`, the statuses the readiness
 *     trigger counts as complete (C2C_SECTION_COMPLETE_STATUSES, mirrored from
 *     the migration). The vocabulary is todo | drafted | review | approved |
 *     locked; `approved | finalized` would have mis-read a locked section as a
 *     draft.
 *   concept2cure_artifacts — `approved | locked`. The vocabulary is draft |
 *     review | approved | locked (PUT /projects/:projectId/artifacts/
 *     :artifactId/status, which requires an attestation for both of the last
 *     two; `locked` is the post-approval publish lock). It has no `finalized`.
 * Anything else, including a missing status (the columns default to a draft
 * state), is unfinalized.
 *
 * `store` defaults to the coauthor / unified document vocabulary this
 * predicate was first written for, which is the one server/routes/coauthor.ts
 * checks. A caller reading another store must name it; the default is the
 * stricter answer for `locked`, so an omission fails closed.
 */
const FINALIZED_STATUSES_BY_STORE: Readonly<Record<FinalizedStatusStore, ReadonlySet<string>>> = {
  coauthor_documents: FINALIZED_SOURCE_STATUSES,
  unified_documents: FINALIZED_SOURCE_STATUSES,
  c2c_document_sections: C2C_SECTION_COMPLETE_STATUSES,
  concept2cure_artifacts: new Set(['approved', 'locked']),
};
export function isFinalizedStatus(
  status: string | null | undefined,
  store: FinalizedStatusStore = 'coauthor_documents',
): boolean {
  return FINALIZED_STATUSES_BY_STORE[store].has((status ?? '').toLowerCase());
}

/** Rows of a `db.execute` result across drivers (node-postgres QueryResult / PGlite Results / bare array). */
function rowsOf(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  const rows = (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
}

function safeName(s: string, max = 40): string {
  return (
    (s || 'leaf').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/g, '') || 'leaf'
  );
}

/**
 * The shipped leaf file name: `<label>-<source key>.pdf`, within the eCTD
 * 64-character rule (FILENAME_PATTERN). The key is the unique part and is
 * kept whole; the label gives way. The label alone was capped at 40 and the
 * key never was, so `coauthor_documents:123` shipped a 68-character name that
 * the agency validator refuses and nothing on this path checked.
 */
export function leafFileName(label: string, key: string): string {
  const ext = '.pdf';
  const keyPart = leafFileKeyPart(key);
  const budget = 64 - ext.length - 1 - keyPart.length;
  const labelPart = budget >= 1 ? safeName(label, Math.min(40, budget)) : '';
  const name = labelPart ? `${labelPart}-${keyPart}${ext}` : `${keyPart}${ext}`;
  return name.slice(0, 64);
}

/** The unique, source-key part of a leaf file name (see leafFileName). */
function leafFileKeyPart(key: string): string {
  return key.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'leaf';
}

/**
 * Whether a file name was derived by leafFileName from this source key, under
 * ANY label — the label (module_number or title) can change after filing, the
 * key cannot. It is the document's identity in a filed leaf name.
 *
 * 2026-09-23 (W5/D7, round-2 skeptic, second pass): package-from-core binds a
 * named withdrawal through this. It used to fall back to the section's only
 * filed leaf when the current derived name matched nothing, which withdrew a
 * different, still-current document whenever the named one was never filed in
 * that section or had already been withdrawn.
 */
export function leafFileCarriesKey(fileName: string, key: string): boolean {
  const keyPart = leafFileKeyPart(key);
  return fileName === `${keyPart}.pdf`.slice(0, 64) || fileName.endsWith(`-${keyPart}.pdf`);
}

/**
 * The identity behind a coauthor leaf, from the alias map. A row that was never
 * aliased reports `canonicalId: null`; a database without the alias migration
 * reports `available: false`. Both are stated, neither is "no source".
 */
async function coauthorLineage(organizationId: number, documentId: number): Promise<LeafLineage> {
  const exec = queryableFromDrizzle(db);
  const nativeId = String(documentId);
  const canonical = await canonicalIdFor(exec, { organizationId, store: 'coauthor_documents', nativeId });
  if (!canonical.available) return { available: false, reason: canonical.reason };
  if (!canonical.canonicalId) {
    return { available: true, store: 'coauthor_documents', nativeId, canonicalId: null, source: null };
  }
  const aliases = await aliasesFor(exec, { organizationId, canonicalId: canonical.canonicalId });
  const authoring = aliases.available
    ? aliases.aliases.find((a) => a.store === 'authoring_documents') ?? null
    : null;
  return {
    available: true,
    store: 'coauthor_documents',
    nativeId,
    canonicalId: canonical.canonicalId,
    source: authoring ? { store: authoring.store, nativeId: authoring.nativeId } : null,
  };
}

/**
 * Stable key for a leaf's polymorphic document reference.
 *
 * The reference spans TWO key spaces: integer-keyed stores use `documentId`,
 * and uuid-keyed ones (vault.documents) use `documentUuid`. The uuid is the
 * unique part when present — without it every vault leaf collapses onto the key
 * `vault_documents:` and the first document resolved would be staged for all of
 * them, which is a wrong file in a submission rather than a missing one.
 */
export function leafSourceKey(
  documentTable: string | null | undefined,
  documentId: number | null | undefined,
  documentUuid?: string | null,
): string {
  if (documentUuid) return `${documentTable ?? ''}:${documentUuid}`;
  return `${documentTable ?? ''}:${documentId ?? ''}`;
}

/**
 * Reduce an arbitrary unified-document version `content` JSON to renderable text.
 * The content is editor JSON (e.g. TipTap-style); we extract any `text` nodes,
 * falling back to a deterministic JSON stringification so nothing is lost.
 */
function unifiedContentToText(content: unknown): string {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  const texts: string[] = [];
  const walk = (node: unknown): void => {
    if (node == null) return;
    if (typeof node === 'string') {
      texts.push(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      if (typeof obj.text === 'string') texts.push(obj.text);
      if (Array.isArray(obj.content)) obj.content.forEach(walk);
    }
  };
  walk(content);
  const joined = texts.join('\n').trim();
  // Fall back to a deterministic stringification when no text nodes were found,
  // so a structured-but-textless body still renders (rather than vanishing).
  return joined || JSON.stringify(content);
}

/**
 * Materialize every leaf's source document into the stage dir, returning a map
 * of resolved files plus an explicit list of leaves that could not be resolved.
 * Renders are deterministic (`renderLeafPdf`) so md5s are stable.
 *
 * Tenant-scoped: every document lookup is filtered by `organizationId`.
 */
export async function materializeLeafSources(
  params: MaterializeLeafSourcesParams
): Promise<MaterializeLeafSourcesResult> {
  const { organizationId, stageDir } = params;
  const byKey = new Map<string, ResolvedFile>();
  const unresolved: UnresolvedLeaf[] = [];
  const unfinalizedSections: Array<{ sectionCode: string; status: string }> = [];
  let materialized = 0;
  let unfinalized = 0;

  // Deduplicate leaves by their polymorphic document reference.
  //
  // 2026-09-23 (W5/D7, round-2 skeptic): a ref also records whether any leaf
  // naming it SHIPS content. A withdrawn document's status is not an approval
  // question: the withdrawal files none of its content. It used to be counted
  // in `unfinalized`, so withdrawing a filed document that had been reopened
  // for revision was refused at transmit as "not approved".
  //
  // 2026-09-23 (W5/D7, residual repair): the round-2 fix still MATERIALIZED a
  // delete-only ref, saying package-from-core needed its staged file name. It
  // does not — a named withdrawal binds by its source key against the filed
  // manifest (leafFileCarriesKey). And when the source could no longer be read
  // (row deleted, content emptied, upload bytes rotated, vault bytes missing)
  // the ref landed in `unresolved`, so assembledTransmitBlockers refused a
  // withdrawal whose backbone was correct while dispatch-readiness, which
  // exempts a delete from UNRESOLVED_DOCUMENT, read it clear. A ref no leaf
  // ships is now skipped before any read: nothing staged, nothing reported.
  // Whether the withdrawal binds is package-from-core's to report, in
  // `skipped` (which blocks transmit), never silently. A document another
  // leaf in the sequence ships is still read and gated, and a leaf with no
  // stated operation is treated as shipping.
  const refByKey = new Map<string, { documentTable: string | null; documentId: number | null; documentUuid: string | null; shipsContent: boolean }>();
  for (const leaf of params.leaves) {
    const leafUuid = leaf.documentUuid ?? null;
    // A leaf needs a table AND one of the two key spaces. Integer-keyed stores
    // supply documentId; vault.documents is uuid-keyed and supplies
    // documentUuid. Neither → no source, and the packager reports the gap.
    if (!leaf.documentTable || (!leaf.documentId && !leafUuid)) continue;
    const key = leafSourceKey(leaf.documentTable, leaf.documentId, leafUuid);
    const shipsContent = (leaf.lifecycleOp ?? '').trim().toLowerCase() !== 'delete';
    const existing = refByKey.get(key);
    if (existing) {
      existing.shipsContent ||= shipsContent;
      continue;
    }
    refByKey.set(key, { documentTable: leaf.documentTable, documentId: leaf.documentId, documentUuid: leafUuid, shipsContent });
  }
  const refs = [...refByKey.values()].filter((ref) => ref.shipsContent);

  const write = async (key: string, baseName: string, content: string, opts: { title?: string; sectionCode?: string }) => {
    const pdfBytes = await renderLeafPdf(content, opts);
    const fileName = leafFileName(baseName, key);
    const sourcePath = path.join(stageDir, fileName);
    await fs.writeFile(sourcePath, pdfBytes);
    byKey.set(key, {
      fileName,
      sourcePath,
      md5: createHash('md5').update(pdfBytes).digest('hex'),
      sha256: createHash('sha256').update(pdfBytes).digest('hex'),
    });
    materialized++;
  };

  for (const ref of refs) {
    const documentTable = ref.documentTable as string;
    const documentId = ref.documentId as number;
    const documentUuid = ref.documentUuid;
    const key = leafSourceKey(documentTable, documentId, documentUuid);
    // Every unresolved entry carries the ref's uuid as well as its id, so it is
    // keyed exactly as the ref (leafSourceKey prefers the uuid). 2026-09-23
    // (W5/D7, round-2 skeptic): the non-vault branches pushed { table, id } only,
    // so a leaf that also carried a document_uuid was unresolved under
    // 'table:id' while the compile looked it up under 'table:uuid', and read it
    // as materialized.
    const miss = (reason: string): void => {
      unresolved.push({ documentTable, documentId, documentUuid, reason });
    };
    // Every ref reaching here ships content (a delete-only ref was filtered
    // out above, see the dedupe note), so its status is an approval question.
    const noteUnfinalized = (sectionCode: string, status: string): void => {
      unfinalized++;
      unfinalizedSections.push({ sectionCode, status });
    };

    if (documentTable === 'coauthor_documents') {
      const [doc] = await db
        .select({
          title: coauthorDocuments.title,
          content: coauthorDocuments.content,
          moduleNumber: coauthorDocuments.moduleNumber,
          status: coauthorDocuments.status,
        })
        .from(coauthorDocuments)
        .where(and(eq(coauthorDocuments.id, documentId), eq(coauthorDocuments.organizationId, organizationId)))
        .limit(1);
      if (!doc) {
        miss('coauthor_documents row not found in this organization');
        continue;
      }
      // The body used to fall back to `doc.title`, so a row with no content
      // rendered a PDF whose entire text was its own heading — counted in
      // `materialized`, absent from `unresolved` and `skipped`, and with an
      // approved status it was not `unfinalized` either. computeEctdCompleteness
      // then returned complete: true / 100%, and a "submission-complete"
      // package shipped a module leaf containing one line of title text. An
      // empty document is a GAP in the package, never a blank leaf — the same
      // rule the governed-section branch below already applies.
      const coauthorBody = (doc.content ?? '').trim();
      if (!coauthorBody) {
        miss(`coauthor document "${doc.title ?? documentId}" has no authored content — not materialized`);
        continue;
      }
      await write(key, doc.moduleNumber || doc.title, coauthorBody, {
        title: doc.title ?? undefined,
        sectionCode: doc.moduleNumber ?? undefined,
      });
      // Lineage by identity: which authoring document this snapshot represents,
      // read from the alias map rather than matched by title. Recorded on the
      // staged file so the governance manifest can state it; never in the
      // backbone. The first product reader of the map (ledger L10).
      const staged = byKey.get(key);
      if (staged) staged.lineage = await coauthorLineage(organizationId, documentId);
      if (!isFinalizedStatus(doc.status, 'coauthor_documents')) {
        noteUnfinalized(doc.moduleNumber || doc.title || `coauthor_documents:${documentId}`, doc.status ?? 'draft');
      }
      continue;
    }

    if (documentTable === 'unified_documents') {
      const [doc] = await db
        .select({ title: unifiedDocuments.title, status: unifiedDocuments.status })
        .from(unifiedDocuments)
        .where(and(eq(unifiedDocuments.id, documentId), eq(unifiedDocuments.organizationId, organizationId)))
        .limit(1);
      if (!doc) {
        miss('unified_documents row not found in this organization');
        continue;
      }
      if (!isFinalizedStatus(doc.status, 'unified_documents')) {
        noteUnfinalized(doc.title || `unified_documents:${documentId}`, doc.status ?? 'draft');
      }
      // Body lives in workflow_document_versions; render the latest version's
      // content, falling back to the title when no version content exists.
      const [version] = await db
        .select({ content: workflowDocumentVersions.content })
        .from(workflowDocumentVersions)
        // Scope the version read directly by organization_id (defense-in-depth),
        // not only transitively through the parent unified_documents org gate.
        .where(
          and(
            eq(workflowDocumentVersions.documentId, documentId),
            eq(workflowDocumentVersions.organizationId, organizationId),
          ),
        )
        .orderBy(desc(workflowDocumentVersions.version))
        .limit(1);
      // Same rule: `body || doc.title` rendered the heading as the whole leaf
      // when the latest version had no content, or when there was no version
      // row at all, and that leaf then counted toward a complete package.
      const body = (version ? unifiedContentToText(version.content) : '').trim();
      if (!body) {
        miss(`document "${doc.title ?? documentId}" has no version content — not materialized`);
        continue;
      }
      await write(key, doc.title, body, { title: doc.title ?? undefined });
      continue;
    }

    if (documentTable === 'ctd_onboarding_documents') {
      // An uploaded binary (storage_path on local disk, org-scoped). It can be
      // staged as a leaf ONLY when it is already a PDF — there is no binary→PDF
      // conversion in the repo, so a non-PDF upload stays unresolved (fail
      // closed) rather than shipping a non-conformant leaf.
      const [doc] = await db
        .select({
          mimeType: ctdOnboardingDocuments.mimeType,
          storagePath: ctdOnboardingDocuments.storagePath,
          fileName: ctdOnboardingDocuments.fileName,
        })
        .from(ctdOnboardingDocuments)
        .where(and(eq(ctdOnboardingDocuments.id, documentId), eq(ctdOnboardingDocuments.organizationId, organizationId)))
        .limit(1);
      if (!doc) {
        miss('ctd_onboarding_documents row not found in this organization');
        continue;
      }
      if ((doc.mimeType || '').toLowerCase() !== 'application/pdf') {
        miss(`uploaded file mime "${doc.mimeType || 'unknown'}" is not application/pdf — an eCTD leaf must be a PDF and no binary→PDF conversion is available`);
        continue;
      }
      // storage_path is a server-generated multer disk path; read it via the
      // shared safe reader (returns null when unreadable/missing). Any read
      // failure → unresolved (fail closed).
      let buf: Buffer | null = null;
      try {
        buf = await readLocalUploadBuffer(doc.storagePath);
      } catch {
        buf = null;
      }
      if (!buf || buf.length === 0) {
        miss('uploaded file bytes not readable at storage_path (missing/rotated) — cannot materialize leaf');
        continue;
      }
      if (!looksLikePdf(buf)) {
        miss('uploaded file is not a valid PDF (missing %PDF- header) — refusing to stage a non-conformant leaf');
        continue;
      }
      // Stage the RAW PDF bytes (not re-rendered). The filename MUST end in .pdf
      // so the downstream PDF/A gate treats it as a PDF; md5 is over the real bytes.
      const fileName = leafFileName(doc.fileName || 'onboarding', key);
      const sourcePath = path.join(stageDir, fileName);
      await fs.writeFile(sourcePath, buf);
      byKey.set(key, {
        fileName,
        sourcePath,
        md5: createHash('md5').update(buf).digest('hex'),
        sha256: createHash('sha256').update(buf).digest('hex'),
      });
      materialized++;
      continue;
    }

    if (documentTable === 'vault_documents') {
      // A vault document is UUID-keyed and its bytes live in the storage
      // provider. Until 2026-09-17 this table was refused outright, for two
      // reasons that both fell: the leaf can now name a uuid
      // (submission_leaves.document_uuid), and vault ingest now writes through
      // getStorageProvider() and records the version id it returns.
      //
      // FOUR gates, every one fail-closed, because the thing that leaves here
      // goes to a regulator:
      //   1. the row read is scoped to the caller's org THROUGH THE PROGRAMME —
      //      the authoritative owner of a vault document. (vault.documents also
      //      carries organization_id now, but it is nullable by design, so it
      //      is attribution and not a scope to filter on.)
      //   2. the byte fetch goes through the provider's own orgId boundary.
      //      Object storage sits outside Postgres RLS, so that argument is the
      //      only tenant gate the bytes themselves get.
      //   3. the bytes are hash-verified against the content_hash the record
      //      already claims. The md5 in the eCTD index is computed from
      //      whatever we stage, so there is NO downstream check that would
      //      catch wrong bytes — they would ship with a valid-looking checksum.
      //   4. a real %PDF- header, verified on the bytes rather than trusted
      //      from the mime string, exactly as the upload branch does.
      if (!documentUuid) {
        miss('vault leaf carries no document_uuid — a vault document is uuid-keyed and cannot be addressed by an integer document_id');
        continue;
      }
      if (!VAULT_UUID_RE.test(documentUuid)) {
        // Guard the ::uuid cast; a malformed value would otherwise raise 22P02
        // and fail the whole assembly rather than this one leaf.
        miss('vault leaf document_uuid is not a uuid');
        continue;
      }

      const vaultRes = await queryableFromDrizzle(db).query(
        `SELECT d.storage_version_id, d.content_hash, d.file_name
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
      const vaultRow = vaultRes.rows[0] as
        | { storage_version_id: string | null; content_hash: string | null; file_name: string | null }
        | undefined;
      if (!vaultRow) {
        miss('vault document not found in this organization');
        continue;
      }
      if (!vaultRow.storage_version_id) {
        // A row written before the vault moved onto the storage provider. It is
        // readable by its legacy path, but the packager fetches only through the
        // provider — and reading the path here would be a second byte-reading
        // implementation of exactly the kind that was just consolidated away.
        // Say what makes it filable instead of guessing.
        miss('vault document bytes are not on the storage provider yet (storage_version_id is null) — run scripts/backfill-vault-storage.mjs for this organization, then re-assemble');
        continue;
      }

      const got = await getStorageProvider().get(vaultRow.storage_version_id, organizationId);
      if (!got) {
        miss('vault document bytes not retrievable from the storage provider for this organization');
        continue;
      }
      const vaultSha = createHash('sha256').update(got.bytes).digest('hex');
      if (vaultRow.content_hash && vaultSha !== vaultRow.content_hash) {
        miss('vault document bytes do not match the content hash recorded for them — refusing to stage a leaf whose source may have been altered');
        continue;
      }
      if (!looksLikePdf(got.bytes)) {
        miss('vault document is not a valid PDF (missing %PDF- header) — refusing to stage a non-conformant leaf');
        continue;
      }

      // Stage the RAW bytes, never re-rendered: the vault copy IS the governed
      // record, and re-rendering would file something the vault has never seen.
      const vaultFileName = leafFileName(vaultRow.file_name || 'vault', key);
      const vaultPath = path.join(stageDir, vaultFileName);
      await fs.writeFile(vaultPath, got.bytes);
      byKey.set(key, {
        fileName: vaultFileName,
        sourcePath: vaultPath,
        md5: createHash('md5').update(got.bytes).digest('hex'),
        sha256: vaultSha,
      });
      materialized++;
      continue;
    }

    if (documentTable === 'rendered_leaf_files') {
      // Bytes this server rendered for a filing, retained at render time. Two
      // gates, both fail-closed: the row read is org-scoped, and the byte fetch
      // goes through the storage provider's own orgId boundary (object storage
      // sits outside RLS, so that call is the only tenant gate for the bytes).
      const [row] = await db
        .select({
          vaultVersionId: renderedLeafFiles.vaultVersionId,
          sha256: renderedLeafFiles.sha256,
          md5: renderedLeafFiles.md5,
          mime: renderedLeafFiles.mime,
          fileName: renderedLeafFiles.fileName,
        })
        .from(renderedLeafFiles)
        .where(and(eq(renderedLeafFiles.id, documentId), eq(renderedLeafFiles.organizationId, organizationId)))
        .limit(1);
      if (!row) {
        miss('rendered_leaf_files row not found in this organization');
        continue;
      }
      if ((row.mime || '').toLowerCase() !== 'application/pdf') {
        // The ICSR projection is stored as XML and transmitted through the
        // gateway, not shipped as an eCTD leaf; say so rather than staging a
        // non-conformant leaf.
        miss(`rendered file mime "${row.mime || 'unknown'}" is not application/pdf — an eCTD leaf must be a PDF`);
        continue;
      }
      let bytes: Buffer | null = null;
      try {
        const got = await getStorageProvider().get(row.vaultVersionId, organizationId);
        bytes = got?.bytes ?? null;
      } catch {
        bytes = null;
      }
      if (!bytes || bytes.length === 0) {
        miss('rendered file bytes are not retrievable from storage — cannot materialize leaf');
        continue;
      }
      // The digest recorded at render time is the claim; bytes that no longer
      // match it are NOT the filed document, whatever the store returned.
      const actual = createHash('sha256').update(bytes).digest('hex');
      if (actual !== row.sha256) {
        miss('rendered file bytes do not match the sha256 recorded at render time — refusing to stage an altered document');
        continue;
      }
      if (!looksLikePdf(bytes)) {
        miss('rendered file is not a valid PDF (missing %PDF- header) — refusing to stage a non-conformant leaf');
        continue;
      }
      const fileName = leafFileName(row.fileName || 'rendered', key);
      const sourcePath = path.join(stageDir, fileName);
      await fs.writeFile(sourcePath, bytes);
      byKey.set(key, { fileName, sourcePath, md5: row.md5, sha256: row.sha256 });
      materialized++;
      continue;
    }

    if (documentTable === 'c2c_document_sections') {
      // The GOVERNED authoring store. c2c_document_sections carries NO
      // organization column: its tenant scope is the parent c2c_documents.org_id,
      // so the JOIN below IS the tenant gate — a section is never rendered for a
      // caller from another organization (it reads as "not found"). Issued via
      // the drizzle `db.execute` path (not the raw pool) so the same `db` mock /
      // PGlite harness the sibling branches use covers it.
      const res = await db.execute(sql`
        SELECT s.id, s.section_key, s.label, s.status, s.content
          FROM c2c_document_sections s
          JOIN c2c_documents d ON d.id = s.document_id
         WHERE s.id = ${documentId} AND d.org_id = ${organizationId}
         LIMIT 1`);
      const row = rowsOf(res)[0] as
        | { section_key: string; label: string; status: string | null; content: unknown }
        | undefined;
      if (!row) {
        miss('c2c_document_sections row not found in this organization');
        continue;
      }
      // jsonb arrives parsed from node-postgres and PGlite; tolerate a driver
      // that hands back the serialized string.
      let content: unknown = row.content;
      if (typeof content === 'string') {
        try { content = JSON.parse(content); } catch { /* keep as text */ }
      }
      const text = sectionPlainText(content).trim();
      if (!text) {
        // An empty section is a GAP in the package, never a blank leaf.
        miss(`section ${row.section_key} has no authored content — not materialized`);
        continue;
      }
      await write(key, row.section_key || row.label, text, {
        title: row.label ?? undefined,
        sectionCode: row.section_key ?? undefined,
      });
      if (!isFinalizedStatus(row.status, 'c2c_document_sections')) {
        noteUnfinalized(row.section_key || `c2c_document_sections:${documentId}`, row.status ?? 'todo');
      }
      continue;
    }

    const externalReason = externalDocumentTableReason(documentTable);
    if (externalReason) {
      miss(externalReason);
      continue;
    }

    // An unknown document_table — surface it, never silently drop.
    miss(`unsupported document_table "${documentTable}" — no resolver registered`);
  }

  return { byKey, unresolved, materialized, unfinalized, unfinalizedSections };
}
