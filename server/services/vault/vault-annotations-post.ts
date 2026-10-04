/**
 * Posting a review annotation on a Vault version, and reading the version's
 * extracted text to select a passage (vault-annotations.ts describes the
 * record). Each is one transaction with one chained audit row; a text read
 * that cannot be recorded serves nothing.
 */
import type { PoolClient } from 'pg';
import { commentSha256 } from '../../routes/c2c/review-comment-record';
import { readVaultLifecycles } from './vault-lifecycle.js';
import { type Refusal, refuse, inRefusableTransaction } from './vault-refusal.js';
import {
  type Actor, type AnnotationAnchor, type AnnotationKind, ANNOTATION_KINDS, QUOTE_MAX, TEXT_WINDOW_MAX,
  UUID_RE, sha256Hex, NOT_FOUND_VERSION, NO_ACTOR, lockVersion, actorName, writeRefusal, bodyRefusal, describeAnchor, audit,
} from './vault-annotations-core.js';

type AnchorRequest = { kind: 'document' } | { kind: 'page'; page: number } | { kind: 'text'; quote: string; charStart: number; textSha256: string };

const INVALID_ANCHOR = (): Refusal => refuse(400, 'INVALID_ANCHOR', 'Anchor the annotation to the whole document, a page, or a passage.');
const isWholeNumber = (v: unknown, min: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min;

/** The anchor as asked for, or null when it is not one of the three shapes. */
function parseAnchor(raw: unknown): AnchorRequest | null {
  const a = (raw ?? {}) as Record<string, unknown>;
  if (a.kind === 'document') return { kind: 'document' };
  if (a.kind === 'page') return isWholeNumber(a.page, 1) ? { kind: 'page', page: a.page } : null;
  if (a.kind !== 'text') return null;
  const quote = typeof a.quote === 'string' ? a.quote : '';
  const length = Array.from(quote).length;
  if (length < 1 || length > QUOTE_MAX || !isWholeNumber(a.charStart, 0)) return null;
  if (typeof a.textSha256 !== 'string' || !sha256Hex.test(a.textSha256)) return null;
  return { kind: 'text', quote, charStart: a.charStart, textSha256: a.textSha256 };
}

/** The anchor as it will be recorded, or the refusal; the version is already locked. */
async function resolveAnchor(
  client: PoolClient, organizationId: number,
  v: { id: string; page_count: number | null; has_text: boolean; text_sha256: string | null }, req: AnchorRequest,
): Promise<AnnotationAnchor | Refusal> {
  const versionId = v.id;
  if (req.kind === 'document') return req;
  if (req.kind === 'page') {
    if (v.page_count == null) {
      return refuse(422, 'PAGES_UNKNOWN', 'This version has no recorded page count, so a page cannot be named. Anchor to the whole document or a passage.');
    }
    if (req.page > v.page_count) return refuse(422, 'PAGE_OUT_OF_RANGE', `This version has ${v.page_count} pages.`);
    return { kind: 'page', page: req.page, pagesAtPost: v.page_count };
  }
  if (!v.has_text) return refuse(422, 'NO_TEXT', 'No text was extracted from this version, so a passage cannot be quoted.');
  if (req.textSha256 !== v.text_sha256) return refuse(409, 'TEXT_CHANGED', 'The extracted text changed after you selected the passage. Select it again.');
  // Counted in characters (code points) by PostgreSQL itself, as the record's guard counts them.
  const { rows } = await client.query(
    `SELECT substr(d.extracted_text, $2::int + 1, char_length($3::text)) = $3::text AS at
       FROM vault.documents d
      WHERE d.id = $1 AND EXISTS (SELECT 1 FROM regulatory_programs rp WHERE rp.id = d.program_id AND rp.organization_id = $4)`,
    [versionId, req.charStart, req.quote, organizationId],
  );
  if (rows[0]?.at !== true) {
    return refuse(409, 'QUOTE_MISMATCH', "The selected passage is not at that position in this version's text. Select it again.");
  }
  const charEnd = req.charStart + Array.from(req.quote).length;
  return { kind: 'text', quote: req.quote, charStart: req.charStart, charEnd, textSha256: req.textSha256 };
}

const KIND_WORD: Record<AnnotationKind, string> = { comment: 'Comment', request_changes: 'Change request' };

/** Post an annotation on one version of this project. */
export async function postAnnotation(
  a: Actor & { documentId: string; kind: unknown; body: unknown; anchor: unknown },
): Promise<{ ok: true; id: string } | Refusal> {
  const early = await writeRefusal(a);
  if (early) return early;
  if (!UUID_RE.test(a.documentId)) return NOT_FOUND_VERSION();
  if (!ANNOTATION_KINDS.includes(a.kind as AnnotationKind)) return refuse(400, 'INVALID_KIND', 'Choose Comment or Change request.');
  const bad = bodyRefusal(a.body);
  if (bad) return bad;
  const req = parseAnchor(a.anchor);
  if (!req) return INVALID_ANCHOR();
  const kind = a.kind as AnnotationKind;
  const body = (a.body as string).trim();

  return inRefusableTransaction(async (client) => {
    const name = await actorName(client, a.userId as number);
    if (!name) return NO_ACTOR();
    const v = await lockVersion(client, a, a.documentId);
    if (!v) return NOT_FOUND_VERSION();
    const anchor = await resolveAnchor(client, a.organizationId, v, req);
    if ('ok' in anchor) return anchor;
    const stage = (await readVaultLifecycles(client, a.organizationId, [v.id])).get(v.id)?.stage ?? null;
    const bodySha256 = commentSha256(body);
    const ins = await client.query(
      `INSERT INTO public.vault_version_annotations
         (organization_id, program_id, document_id, kind, body, body_sha256, content_hash, lifecycle_stage,
          anchor_kind, page_number, pages_at_post, quote, char_start, char_end, text_sha256, author_id, author_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING id::text AS id`,
      [
        a.organizationId, v.program_id, v.id, kind, body, bodySha256, v.content_hash, stage, anchor.kind,
        anchor.kind === 'page' ? anchor.page : null, anchor.kind === 'page' ? anchor.pagesAtPost : null,
        anchor.kind === 'text' ? anchor.quote : null, anchor.kind === 'text' ? anchor.charStart : null,
        anchor.kind === 'text' ? anchor.charEnd : null, anchor.kind === 'text' ? anchor.textSha256 : null,
        a.userId, name,
      ],
    );
    const id = String(ins.rows[0].id);
    await audit(client, a, {
      action: 'vault.document.annotate', versionId: v.id,
      details: {
        description: `${KIND_WORD[kind]} posted ${describeAnchor(anchor)}`,
        annotationId: id, kind, anchor, body, bodySha256, contentHash: v.content_hash, lifecycleStage: stage, authorName: name,
      },
    });
    return { ok: true as const, id };
  });
}

export type TextWindow = { ok: true; text: string; from: number; length: number; totalLength: number; textSha256: string; pageCount: number | null };

/** Thrown when a text read could not be recorded: nothing is served. */
export class TextReadNotRecorded extends Error {
  readonly code = 'AUDIT_WRITE_FAILED';
}

function windowOf(from: unknown, length: unknown): { from: number; length: number } | null {
  const f = from === undefined || from === '' ? 0 : Number(from);
  const l = length === undefined || length === '' ? TEXT_WINDOW_MAX : Number(length);
  if (!Number.isInteger(f) || f < 0 || !Number.isInteger(l) || l < 1 || l > TEXT_WINDOW_MAX) return null;
  return { from: f, length: l };
}

/** A window of a version's extracted text, in characters, recorded in the audit chain before it is returned. */
export async function readAnnotatableText(
  a: Actor & { documentId: string; from: unknown; length: unknown },
): Promise<TextWindow | Refusal> {
  if (a.userId == null) return NO_ACTOR();
  if (!UUID_RE.test(a.documentId) || !UUID_RE.test(a.programId)) return NOT_FOUND_VERSION();
  const w = windowOf(a.from, a.length);
  if (!w) return refuse(400, 'INVALID_WINDOW', 'from must be 0 or more and length 1 to 200,000.');
  return inRefusableTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT d.id::text AS id, substr(d.extracted_text, $4::int + 1, $5::int) AS text,
              char_length(d.extracted_text) AS total, d.page_count,
              encode(sha256(convert_to(d.extracted_text, 'UTF8')), 'hex') AS text_sha256
         FROM vault.documents d
        WHERE d.id = $1 AND d.program_id = $2 AND d.deleted_at IS NULL
          AND EXISTS (SELECT 1 FROM regulatory_programs rp
                       WHERE rp.id = d.program_id AND rp.organization_id = $3 AND rp.deleted_at IS NULL)`,
      [a.documentId, a.programId, a.organizationId, w.from, w.length],
    );
    const r = rows[0];
    if (!r) return NOT_FOUND_VERSION();
    if (r.total == null) return refuse(422, 'NO_TEXT', 'No text was extracted from this version, so a passage cannot be quoted.');
    const total = Number(r.total);
    const shown = Array.from(String(r.text ?? '')).length;
    try {
      await audit(client, a, {
        action: 'vault.document.text.read', versionId: r.id,
        details: {
          description: shown > 0
          ? `Extracted text read for annotation (characters ${w.from + 1}–${w.from + shown} of ${total})`
          : `Extracted text read for annotation (no characters at ${w.from + 1}; ${total} in all)`,
          from: w.from, length: w.length, totalLength: total, textSha256: r.text_sha256,
        },
      });
    } catch (err) {
      throw new TextReadNotRecorded(err instanceof Error ? err.message : String(err));
    }
    return {
      ok: true as const, text: String(r.text ?? ''), from: w.from, length: shown, totalLength: total,
      textSha256: r.text_sha256, pageCount: r.page_count == null ? null : Number(r.page_count),
    };
  });
}
