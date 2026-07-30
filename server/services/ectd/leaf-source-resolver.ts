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
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../db';
import { coauthorDocuments } from '../../../shared/schema';
import { unifiedDocuments, workflowDocumentVersions } from '../../../shared/schema/unified_workflow';
import { ctdOnboardingDocuments } from '../../../shared/schema/ctd-projects';
import { readLocalUploadBuffer } from '../anthropic-files';
import { renderLeafPdf } from './leaf-pdf-renderer';
import type { ResolvedFile } from './core-to-packager';

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
export const RENDERABLE_DOCUMENT_TABLES = new Set(['coauthor_documents', 'unified_documents']);

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
}

function safeName(s: string): string {
  return (
    (s || 'leaf').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'leaf'
  );
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
  let materialized = 0;

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
        })
        .from(coauthorDocuments)
        .where(and(eq(coauthorDocuments.id, documentId), eq(coauthorDocuments.organizationId, organizationId)))
        .limit(1);
      if (!doc) {
        unresolved.push({ documentTable, documentId, reason: 'coauthor_documents row not found in this organization' });
        continue;
      }
      await write(key, doc.moduleNumber || doc.title, doc.content ?? doc.title ?? '', {
        title: doc.title ?? undefined,
        sectionCode: doc.moduleNumber ?? undefined,
      });
      continue;
    }

    if (documentTable === 'unified_documents') {
      const [doc] = await db
        .select({ title: unifiedDocuments.title })
        .from(unifiedDocuments)
        .where(and(eq(unifiedDocuments.id, documentId), eq(unifiedDocuments.organizationId, organizationId)))
        .limit(1);
      if (!doc) {
        unresolved.push({ documentTable, documentId, reason: 'unified_documents row not found in this organization' });
        continue;
      }
      // Body lives in workflow_document_versions; render the latest version's
      // content, falling back to the title when no version content exists.
      const [version] = await db
        .select({ content: workflowDocumentVersions.content })
        .from(workflowDocumentVersions)
        .where(eq(workflowDocumentVersions.documentId, documentId))
        .orderBy(desc(workflowDocumentVersions.version))
        .limit(1);
      const body = version ? unifiedContentToText(version.content) : '';
      await write(key, doc.title, body || doc.title, { title: doc.title ?? undefined });
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

  return { byKey, unresolved, materialized };
}
