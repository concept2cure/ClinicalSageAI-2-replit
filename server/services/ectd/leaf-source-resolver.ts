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
 *   - vault_documents          — an S3-backed binary (UUID-keyed, separate
 *                                `vault` schema); not addressable from an integer
 *                                leaf id and has no org scope → unresolved
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
import type { LeafLineage, ResolvedFile } from './core-to-packager';
import { queryableFromDrizzle } from '../../db/drizzle-queryable.js';
import { aliasesFor, canonicalIdFor } from '../c2c/document-alias-map.js';

/**
 * An eCTD leaf must be a PDF. Verify the ACTUAL bytes (magic number), never the
 * DB mime string alone — a mislabeled/corrupt upload must not ship to the agency
 * with a valid-looking checksum. (The md5 is computed from whatever we stage, so
 * there is no downstream content check to catch wrong bytes.)
 */
function looksLikePdf(buf: Buffer): boolean {
  return buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-';
}

/** Tables whose content is stored locally and can be rendered to a PDF leaf. */
export const RENDERABLE_DOCUMENT_TABLES = new Set(['coauthor_documents', 'unified_documents', 'c2c_document_sections']);

/**
 * Tables whose content lives in an EXTERNAL system / as a binary upload and is
 * not locally renderable through this deterministic-PDF path. A leaf backed by
 * one of these is surfaced as unresolved, never silently dropped.
 */
export const EXTERNAL_DOCUMENT_TABLES: Record<string, string> = {
  // vault_documents CANNOT be materialized from a leaf today and is intentionally
  // left unresolved (a guard-stop, not a silent drop): submission_leaves.document_id
  // is INTEGER but vault.documents.id is a UUID (an integer cannot address the row),
  // and vault.documents has no organization_id (it is program-scoped), so there is
  // no tenant-safe lookup. Materializing it would require a reference/schema change;
  // forcing it would risk shipping wrong or cross-tenant bytes to the agency.
  vault_documents:
    'vault_documents is an external S3-backed binary in the separate `vault` schema ' +
    '(UUID-keyed, program-scoped); it cannot be addressed from an integer leaf ' +
    'document_id and has no org scope, so it is not materializable here',
};

/** A leaf whose source document could not be materialized into the package. */
export interface UnresolvedLeaf {
  documentTable: string | null;
  documentId: number | null;
  reason: string;
}

export interface MaterializeLeafSourcesParams {
  leaves: Array<{ documentTable: string | null; documentId: number | null }>;
  organizationId: number;
  /** Directory the rendered PDF leaves are written to. */
  stageDir: string;
}

export interface MaterializeLeafSourcesResult {
  /** Resolved files keyed by `${documentTable}:${documentId}`. */
  byKey: Map<string, ResolvedFile>;
  /** Leaves whose source could not be materialized (external/missing). */
  unresolved: UnresolvedLeaf[];
  /** Number of documents materialized to disk (deduplicated by table+id). */
  materialized: number;
  /**
   * Number of MATERIALIZED leaves whose source document is NOT finalized (its
   * status is a draft/review artifact, not approved/finalized). These leaves DO
   * render into the package, but a submission-grade package must have zero of
   * them — a draft rendered to PDF is not a submission-ready leaf.
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
const FINALIZED_SOURCE_STATUSES = new Set(['approved', 'finalized']);
function isFinalizedStatus(status: string | null | undefined): boolean {
  return FINALIZED_SOURCE_STATUSES.has((status ?? '').toLowerCase());
}

/**
 * A GOVERNED section (c2c_document_sections) is finalized when its status is
 * one the readiness trigger counts as complete — `approved` or `locked`
 * (C2C_SECTION_COMPLETE_STATUSES, mirrored from the migration). The governed
 * vocabulary is todo | drafted | review | approved | locked, so the generic
 * `approved | finalized` check above would have mis-read a locked section as
 * a draft; this branch-specific check keeps the two vocabularies honest.
 */
function isFinalizedGovernedSectionStatus(status: string | null | undefined): boolean {
  return C2C_SECTION_COMPLETE_STATUSES.has((status ?? '').toLowerCase());
}

/** Rows of a `db.execute` result across drivers (node-postgres QueryResult / PGlite Results / bare array). */
function rowsOf(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  const rows = (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
}

function safeName(s: string): string {
  return (
    (s || 'leaf').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'leaf'
  );
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

/** Stable key for a leaf's polymorphic document reference. */
export function leafSourceKey(documentTable: string | null | undefined, documentId: number | null | undefined): string {
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
  const seen = new Set<string>();
  const refs: Array<{ documentTable: string | null; documentId: number | null }> = [];
  for (const leaf of params.leaves) {
    if (!leaf.documentTable || !leaf.documentId) continue; // no source → packager reports the gap
    const key = leafSourceKey(leaf.documentTable, leaf.documentId);
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ documentTable: leaf.documentTable, documentId: leaf.documentId });
  }

  const write = async (key: string, baseName: string, content: string, opts: { title?: string; sectionCode?: string }) => {
    const pdfBytes = await renderLeafPdf(content, opts);
    const fileName = `${safeName(baseName)}-${key.replace(/[^a-z0-9]+/gi, '-')}.pdf`;
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
    const key = leafSourceKey(documentTable, documentId);

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
        unresolved.push({ documentTable, documentId, reason: 'coauthor_documents row not found in this organization' });
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
        unresolved.push({
          documentTable,
          documentId,
          reason: `coauthor document "${doc.title ?? documentId}" has no authored content — not materialized`,
        });
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
      if (!isFinalizedStatus(doc.status)) {
        unfinalized++;
        unfinalizedSections.push({ sectionCode: doc.moduleNumber || doc.title || `coauthor_documents:${documentId}`, status: doc.status ?? 'draft' });
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
        unresolved.push({ documentTable, documentId, reason: 'unified_documents row not found in this organization' });
        continue;
      }
      if (!isFinalizedStatus(doc.status)) {
        unfinalized++;
        unfinalizedSections.push({ sectionCode: doc.title || `unified_documents:${documentId}`, status: doc.status ?? 'draft' });
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
        unresolved.push({
          documentTable,
          documentId,
          reason: `document "${doc.title ?? documentId}" has no version content — not materialized`,
        });
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
        unresolved.push({ documentTable, documentId, reason: 'ctd_onboarding_documents row not found in this organization' });
        continue;
      }
      if ((doc.mimeType || '').toLowerCase() !== 'application/pdf') {
        unresolved.push({
          documentTable,
          documentId,
          reason: `uploaded file mime "${doc.mimeType || 'unknown'}" is not application/pdf — an eCTD leaf must be a PDF and no binary→PDF conversion is available`,
        });
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
        unresolved.push({ documentTable, documentId, reason: 'uploaded file bytes not readable at storage_path (missing/rotated) — cannot materialize leaf' });
        continue;
      }
      if (!looksLikePdf(buf)) {
        unresolved.push({ documentTable, documentId, reason: 'uploaded file is not a valid PDF (missing %PDF- header) — refusing to stage a non-conformant leaf' });
        continue;
      }
      // Stage the RAW PDF bytes (not re-rendered). The filename MUST end in .pdf
      // so the downstream PDF/A gate treats it as a PDF; md5 is over the real bytes.
      const fileName = `${safeName(doc.fileName || 'onboarding')}-${key.replace(/[^a-z0-9]+/gi, '-')}.pdf`;
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
        unresolved.push({ documentTable, documentId, reason: 'rendered_leaf_files row not found in this organization' });
        continue;
      }
      if ((row.mime || '').toLowerCase() !== 'application/pdf') {
        // The ICSR projection is stored as XML and transmitted through the
        // gateway, not shipped as an eCTD leaf; say so rather than staging a
        // non-conformant leaf.
        unresolved.push({
          documentTable,
          documentId,
          reason: `rendered file mime "${row.mime || 'unknown'}" is not application/pdf — an eCTD leaf must be a PDF`,
        });
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
        unresolved.push({ documentTable, documentId, reason: 'rendered file bytes are not retrievable from storage — cannot materialize leaf' });
        continue;
      }
      // The digest recorded at render time is the claim; bytes that no longer
      // match it are NOT the filed document, whatever the store returned.
      const actual = createHash('sha256').update(bytes).digest('hex');
      if (actual !== row.sha256) {
        unresolved.push({
          documentTable,
          documentId,
          reason: 'rendered file bytes do not match the sha256 recorded at render time — refusing to stage an altered document',
        });
        continue;
      }
      if (!looksLikePdf(bytes)) {
        unresolved.push({ documentTable, documentId, reason: 'rendered file is not a valid PDF (missing %PDF- header) — refusing to stage a non-conformant leaf' });
        continue;
      }
      const fileName = `${safeName(row.fileName || 'rendered')}-${key.replace(/[^a-z0-9]+/gi, '-')}.pdf`;
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
        unresolved.push({ documentTable, documentId, reason: 'c2c_document_sections row not found in this organization' });
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
        unresolved.push({
          documentTable,
          documentId,
          reason: `section ${row.section_key} has no authored content — not materialized`,
        });
        continue;
      }
      await write(key, row.section_key || row.label, text, {
        title: row.label ?? undefined,
        sectionCode: row.section_key ?? undefined,
      });
      if (!isFinalizedGovernedSectionStatus(row.status)) {
        unfinalized++;
        unfinalizedSections.push({ sectionCode: row.section_key || `c2c_document_sections:${documentId}`, status: row.status ?? 'todo' });
      }
      continue;
    }

    if (documentTable in EXTERNAL_DOCUMENT_TABLES) {
      unresolved.push({ documentTable, documentId, reason: EXTERNAL_DOCUMENT_TABLES[documentTable] });
      continue;
    }

    // An unknown document_table — surface it, never silently drop.
    unresolved.push({
      documentTable,
      documentId,
      reason: `unsupported document_table "${documentTable}" — no resolver registered`,
    });
  }

  return { byKey, unresolved, materialized, unfinalized, unfinalizedSections };
}
