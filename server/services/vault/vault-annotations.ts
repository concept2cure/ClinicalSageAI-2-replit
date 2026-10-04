/**
 * Review annotations on a Vault version (plan critique 15, rows D2 and D5).
 *
 * A reviewer annotates one version with a comment or a change request,
 * anchored to the whole version, to a page of a version with a recorded page
 * count, or to a passage of its extracted text, counted in characters (code
 * points, as PostgreSQL counts them). Others reply. An open annotation is
 * resolved with a note, optionally naming the version that addressed it, or
 * retracted by its author with a reason; never both.
 *
 * public.vault_version_annotations (migrations/20261001_vault_version_annotations.sql)
 * re-checks every post and refuses every other change; this file is its one
 * writer. Each act is one transaction with exactly one chained audit row on
 * the version, carrying the words, their SHA-256 and the person's name, so the
 * record survives the row. Reading a version's text to select a passage is a
 * chained row too, or nothing is served.
 *
 * Annotations stay on the version they were written on: they describe that
 * version's bytes. readAnnotationsForVersions reads any versions' annotations
 * for the organisation, deleted or moved-from ones included.
 *
 * Approval is not refused for open annotations: no founder decision covers it
 * (FD13 in the plan). The review and approval dialogs show what was open.
 */
import type { PoolClient } from 'pg';
import { pool } from '../../db.js';
import { programInOrganization } from '../c2c/program-access';
import { readVersionFamily } from './vault-version-family.js';
import type { Refusal } from './vault-refusal.js';
import {
  type Annotation, type AnnotationAnchor, type OpenByVersion, type Queryable,
  UUID_RE, iso, NOT_FOUND_PROJECT, NOT_FOUND_VERSION,
} from './vault-annotations-core.js';

export {
  ANNOTATION_KINDS, BODY_MAX, QUOTE_MAX, TEXT_WINDOW_MAX,
  type Annotation, type AnnotationAnchor, type AnnotationKind, type OpenByVersion,
} from './vault-annotations-core.js';
export { postAnnotation, readAnnotatableText } from './vault-annotations-post.js';
export { replyToAnnotation, resolveAnnotation, retractAnnotation } from './vault-annotations-thread.js';

/** Row to annotation; replies are attached by the caller. */
function toAnnotation(r: any): Annotation {
  const anchor: AnnotationAnchor | null =
    r.anchor_kind === 'page' ? { kind: 'page', page: Number(r.page_number), pagesAtPost: Number(r.pages_at_post) }
      : r.anchor_kind === 'text'
        ? { kind: 'text', quote: r.quote, charStart: Number(r.char_start), charEnd: Number(r.char_end), textSha256: r.text_sha256 }
        : r.anchor_kind === 'document' ? { kind: 'document' } : null;
  return {
    id: r.id, parentId: r.parent_id ?? null, versionId: r.document_id, versionLabel: r.version_label ?? null,
    programId: r.program_id, kind: r.kind, anchor,
    anchorCurrent: r.anchor_current === null || r.anchor_current === undefined ? null : Boolean(r.anchor_current),
    status: r.retracted_at ? 'retracted' : r.resolved_at ? 'resolved' : 'open',
    body: r.body, bodySha256: r.body_sha256, authorId: Number(r.author_id), authorName: r.author_name,
    createdAt: iso(r.created_at), lifecycleStage: r.lifecycle_stage ?? null,
    resolution: r.resolved_at
      ? {
          byId: Number(r.resolved_by), byName: r.resolved_by_name, at: iso(r.resolved_at), note: r.resolution_note,
          addressedIn: r.addressed_in_document_id ? { versionId: r.addressed_in_document_id, versionLabel: r.addressed_label ?? null } : null,
        }
      : null,
    retraction: r.retracted_at
      ? { byId: Number(r.retracted_by), byName: r.retracted_by_name, at: iso(r.retracted_at), reason: r.retraction_reason }
      : null,
    replies: [],
  };
}

/** Every annotation on the given versions in this organisation, roots oldest first, replies nested oldest first. */
export async function readAnnotationsForVersions(q: Queryable, organizationId: number, versionIds: string[]): Promise<Annotation[]> {
  if (versionIds.length === 0) return [];
  const { rows } = await q.query(
    `SELECT a.*, d.version AS version_label, ad.version AS addressed_label,
            CASE WHEN a.anchor_kind = 'text'
                   THEN COALESCE(a.text_sha256 = encode(sha256(convert_to(d.extracted_text, 'UTF8')), 'hex'), false)
                 WHEN a.anchor_kind = 'page' THEN COALESCE(d.page_count = a.pages_at_post, false)
                 ELSE NULL END AS anchor_current
       FROM public.vault_version_annotations a
       JOIN vault.documents d ON d.id = a.document_id
       LEFT JOIN vault.documents ad ON ad.id = a.addressed_in_document_id AND ad.program_id = a.program_id
      WHERE a.organization_id = $1 AND a.document_id = ANY($2::uuid[])
      ORDER BY a.created_at, a.id`,
    [organizationId, versionIds],
  );
  const all = rows.map(toAnnotation);
  const byId = new Map(all.map((a) => [a.id, a]));
  const roots: Annotation[] = [];
  for (const a of all) {
    const parent = a.parentId ? byId.get(a.parentId) : undefined;
    if (parent) parent.replies.push(a);
    else if (!a.parentId) roots.push(a);
  }
  return roots;
}

/** A document's annotations across its whole version family, and the open count of each version. */
export async function listAnnotations(
  q: Queryable,
  p: { programId: string; organizationId: number; documentId: string },
): Promise<{ ok: true; annotations: Annotation[]; openByVersion: OpenByVersion[] } | Refusal> {
  if (!UUID_RE.test(p.programId) || !(await programInOrganization(pool, p.programId, p.organizationId))) return NOT_FOUND_PROJECT();
  if (!UUID_RE.test(p.documentId)) return NOT_FOUND_VERSION();
  const family = await readVersionFamily(q as PoolClient, p);
  if (!family) return NOT_FOUND_VERSION();
  const annotations = await readAnnotationsForVersions(q, p.organizationId, family.map((v) => v.id));
  const openByVersion = family.map((v) => {
    const open = annotations.filter((a) => a.versionId === v.id && a.status === 'open');
    return {
      versionId: v.id, versionLabel: v.version, current: v.current,
      open: open.length, openChangeRequests: open.filter((a) => a.kind === 'request_changes').length,
    };
  });
  return { ok: true, annotations, openByVersion };
}
