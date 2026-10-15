/**
 * Replying to, resolving and retracting a review annotation on a Vault
 * version (vault-annotations.ts describes the record). Each act is one
 * transaction with one chained audit row on the annotation's version.
 * A resolution needs a note and a retraction a reason; only the author
 * retracts; neither can be undone, and an annotation has only one of them.
 */
import type { PoolClient } from 'pg';
import { commentSha256 } from '../../routes/c2c/review-comment-record';
import { requireGovernedReason } from '../../routes/governed-reason';
import { readVaultLifecycles } from './vault-lifecycle.js';
import { readVersionFamily } from './vault-version-family.js';
import { type Refusal, refuse, inRefusableTransaction } from './vault-refusal.js';
import {
  type Actor, UUID_RE, short, NOT_FOUND_ANNOTATION, NOT_FOUND_VERSION, NO_ACTOR,
  lockVersion, actorName, writeRefusal, bodyRefusal, audit,
} from './vault-annotations-core.js';

interface AnnotationRow {
  id: string; parent_id: string | null; document_id: string; body: string; body_sha256: string; author_id: number;
  resolved_at: Date | null; retracted_at: Date | null; root_resolved_at: Date | null; root_retracted_at: Date | null;
}

/** The annotation in this project and organisation, locked for the transaction, with its root's outcome. */
async function lockAnnotation(client: PoolClient, a: Actor, annotationId: string): Promise<AnnotationRow | null> {
  const { rows } = await client.query(
    `SELECT x.id::text AS id, x.parent_id::text AS parent_id, x.document_id::text AS document_id, x.body, x.body_sha256,
            x.author_id, x.resolved_at, x.retracted_at, r.resolved_at AS root_resolved_at, r.retracted_at AS root_retracted_at
       FROM public.vault_version_annotations x
       LEFT JOIN public.vault_version_annotations r ON r.id = x.parent_id AND r.organization_id = x.organization_id
      WHERE x.id = $1 AND x.organization_id = $2 AND x.program_id = $3
      FOR UPDATE OF x`,
    [annotationId, a.organizationId, a.programId],
  );
  return (rows[0] as AnnotationRow | undefined) ?? null;
}

const NOT_A_THREAD = (): Refusal => refuse(400, 'NOT_A_THREAD', 'Reply to the annotation, not to a reply.');
const RETRACTED = (): Refusal => refuse(409, 'ANNOTATION_RETRACTED', 'This annotation was retracted by its author.');

/** The person and the annotation every act starts from, or the refusal. */
async function begin(client: PoolClient, a: Actor, annotationId: string): Promise<{ name: string; row: AnnotationRow } | Refusal> {
  const name = await actorName(client, a.userId as number);
  if (!name) return NO_ACTOR();
  const row = await lockAnnotation(client, a, annotationId);
  if (!row) return NOT_FOUND_ANNOTATION();
  return { name, row };
}

/** Reply to an open annotation. */
export async function replyToAnnotation(a: Actor & { annotationId: string; body: unknown }): Promise<{ ok: true; id: string } | Refusal> {
  const early = await writeRefusal(a);
  if (early) return early;
  if (!UUID_RE.test(a.annotationId)) return NOT_FOUND_ANNOTATION();
  const bad = bodyRefusal(a.body);
  if (bad) return bad;
  const body = (a.body as string).trim();
  return inRefusableTransaction(async (client) => {
    const start = await begin(client, a, a.annotationId);
    if ('ok' in start) return start;
    const { name, row } = start;
    if (row.parent_id) return NOT_A_THREAD();
    if (row.resolved_at) return refuse(409, 'ANNOTATION_RESOLVED', 'This annotation is resolved. Post a new annotation instead.');
    if (row.retracted_at) return RETRACTED();
    const v = await lockVersion(client, a, row.document_id);
    if (!v) return NOT_FOUND_VERSION();
    const stage = (await readVaultLifecycles(client, a.organizationId, [v.id])).get(v.id)?.stage ?? null;
    const bodySha256 = commentSha256(body);
    const ins = await client.query(
      `INSERT INTO public.vault_version_annotations
         (organization_id, program_id, document_id, parent_id, kind, body, body_sha256, content_hash, lifecycle_stage, author_id, author_name)
       VALUES ($1, $2, $3, $4, 'comment', $5, $6, $7, $8, $9, $10)
       RETURNING id::text AS id`,
      [a.organizationId, v.program_id, v.id, row.id, body, bodySha256, v.content_hash, stage, a.userId, name],
    );
    const id = String(ins.rows[0].id);
    await audit(client, a, {
      action: 'vault.document.annotation.reply', versionId: v.id,
      details: {
        description: `Reply to “${short(row.body, 60)}”`, annotationId: id, parentId: row.id, body, bodySha256, authorName: name,
      },
    });
    return { ok: true as const, id };
  });
}

/** Resolve an open annotation with a note, optionally naming the version of its document that addressed it. */
export async function resolveAnnotation(
  a: Actor & { annotationId: string; note: unknown; addressedInVersionId?: unknown },
): Promise<{ ok: true } | Refusal> {
  const early = await writeRefusal(a);
  if (early) return early;
  const note = requireGovernedReason(a.note);
  if (!note.ok) return refuse(422, 'RESOLUTION_NOTE_REQUIRED', note.error);
  if (!UUID_RE.test(a.annotationId)) return NOT_FOUND_ANNOTATION();
  const addressed = a.addressedInVersionId == null || a.addressedInVersionId === '' ? null : String(a.addressedInVersionId);
  const NOT_IN_FAMILY = () => refuse(422, 'NOT_IN_FAMILY', 'The version named as addressing this is not a version of this document.');
  if (addressed && !UUID_RE.test(addressed)) return NOT_IN_FAMILY();
  return inRefusableTransaction(async (client) => {
    const start = await begin(client, a, a.annotationId);
    if ('ok' in start) return start;
    const { name, row } = start;
    if (row.parent_id) return NOT_A_THREAD();
    if (row.retracted_at) return RETRACTED();
    if (row.resolved_at) return refuse(409, 'ALREADY_RESOLVED', 'This annotation is already resolved.');
    if (addressed) {
      const family = await readVersionFamily(client, { programId: a.programId, organizationId: a.organizationId, documentId: row.document_id });
      if (!family?.some((v) => v.id === addressed)) return NOT_IN_FAMILY();
    }
    await client.query(
      `UPDATE public.vault_version_annotations
          SET resolved_at = now(), resolved_by = $2, resolved_by_name = $3, resolution_note = $4, addressed_in_document_id = $5
        WHERE id = $1 AND organization_id = $6`,
      [row.id, a.userId, name, note.reason, addressed, a.organizationId],
    );
    await audit(client, a, {
      action: 'vault.document.annotation.resolve', versionId: row.document_id,
      details: {
        description: `Annotation resolved: “${short(row.body, 60)}” — ${short(note.reason, 120)}`,
        annotationId: row.id, note: note.reason, addressedInVersionId: addressed, resolvedByName: name,
      },
      reason: note.reason,
    });
    return { ok: true as const };
  });
}

/** Retract one's own open annotation or reply, with a reason. The words stay on the record. */
export async function retractAnnotation(a: Actor & { annotationId: string; reason: unknown }): Promise<{ ok: true } | Refusal> {
  const early = await writeRefusal(a);
  if (early) return early;
  const reason = requireGovernedReason(a.reason);
  if (!reason.ok) return refuse(422, 'REASON_REQUIRED', reason.error);
  if (!UUID_RE.test(a.annotationId)) return NOT_FOUND_ANNOTATION();
  return inRefusableTransaction(async (client) => {
    const start = await begin(client, a, a.annotationId);
    if ('ok' in start) return start;
    const { name, row } = start;
    if (Number(row.author_id) !== a.userId) return refuse(403, 'NOT_AUTHOR', 'Only the person who wrote an annotation can retract it.');
    if (row.retracted_at) return refuse(409, 'ALREADY_RETRACTED', 'This annotation was already retracted.');
    if (row.resolved_at || row.root_resolved_at || row.root_retracted_at) {
      return refuse(409, 'ANNOTATION_RESOLVED', 'A resolved annotation stays on the record as resolved.');
    }
    await client.query(
      `UPDATE public.vault_version_annotations
          SET retracted_at = now(), retracted_by = $2, retracted_by_name = $3, retraction_reason = $4
        WHERE id = $1 AND organization_id = $5`,
      [row.id, a.userId, name, reason.reason, a.organizationId],
    );
    await audit(client, a, {
      action: 'vault.document.annotation.retract', versionId: row.document_id,
      details: {
        description: `Annotation retracted: “${short(row.body, 60)}”`,
        annotationId: row.id, parentId: row.parent_id, bodySha256: row.body_sha256, reason: reason.reason, retractedByName: name,
      },
      reason: reason.reason,
    });
    return { ok: true as const };
  });
}
