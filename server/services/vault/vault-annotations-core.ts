/**
 * Shared by the review-annotation modules (vault-annotations.ts and its two
 * act modules): types, limits, and the checks and audit write every act uses.
 * Not imported by anything else.
 */
import type { PoolClient } from 'pg';
import { pool } from '../../db.js';
import { writeChainedAuditRow } from '../auditService.js';
import { programInOrganization } from '../c2c/program-access';
import { vaultWriteRefusal } from './vault-write-authority.js';
import { type Refusal, refuse } from './vault-refusal.js';

export const ANNOTATION_KINDS = ['comment', 'request_changes'] as const;
export type AnnotationKind = (typeof ANNOTATION_KINDS)[number];

export const BODY_MAX = 4000;
export const QUOTE_MAX = 2000;
export const TEXT_WINDOW_MAX = 200_000;

export type AnnotationAnchor =
  | { kind: 'document' }
  | { kind: 'page'; page: number; pagesAtPost: number }
  | { kind: 'text'; quote: string; charStart: number; charEnd: number; textSha256: string };

export interface Annotation {
  id: string;
  parentId: string | null;
  versionId: string;
  versionLabel: string | null;
  programId: string;
  kind: AnnotationKind;
  anchor: AnnotationAnchor | null;
  /** Whether the text or page count it was anchored to is still the version's; null for a whole-document anchor or a reply. */
  anchorCurrent: boolean | null;
  status: 'open' | 'resolved' | 'retracted';
  body: string;
  bodySha256: string;
  authorId: number;
  authorName: string;
  createdAt: string;
  lifecycleStage: string | null;
  resolution: { byId: number; byName: string; at: string; note: string; addressedIn: { versionId: string; versionLabel: string | null } | null } | null;
  retraction: { byId: number; byName: string; at: string; reason: string } | null;
  replies: Annotation[];
}

export interface OpenByVersion { versionId: string; versionLabel: string | null; current: boolean; open: number; openChangeRequests: number }

export interface Actor { programId: string; organizationId: number; userId: number | null; ipAddress?: string; userAgent?: string }

export type Queryable = { query: PoolClient['query'] } | typeof pool;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const sha256Hex = /^[0-9a-f]{64}$/;
export const iso = (v: unknown) => new Date(v as string).toISOString();
export const short = (s: string, n: number) => (Array.from(s).length > n ? `${Array.from(s).slice(0, n).join('')}…` : s);

export const NOT_FOUND_PROJECT = (): Refusal => refuse(404, 'NOT_FOUND', 'This project is not in your organisation.');
export const NOT_FOUND_VERSION = (): Refusal => refuse(404, 'DOCUMENT_NOT_FOUND', 'This version is not in this project.');
export const NOT_FOUND_ANNOTATION = (): Refusal => refuse(404, 'ANNOTATION_NOT_FOUND', 'This annotation is not in this project.');
export const NO_ACTOR = (): Refusal => refuse(403, 'ACTOR_REQUIRED', 'Your account could not be identified on this request, so nothing was recorded.');

export interface VersionRow {
  id: string; program_id: string; version: string | null; content_hash: string | null; page_count: number | null;
  has_text: boolean; text_sha256: string | null; document_code: string | null;
}

/** A live version of this program in this organisation, locked for the transaction. */
export async function lockVersion(client: PoolClient, a: Actor, documentId: string): Promise<VersionRow | null> {
  const { rows } = await client.query(
    `SELECT d.id::text AS id, d.program_id::text AS program_id, d.version, btrim(d.content_hash) AS content_hash,
            d.page_count, d.extracted_text IS NOT NULL AS has_text, d.document_code,
            encode(sha256(convert_to(d.extracted_text, 'UTF8')), 'hex') AS text_sha256
       FROM vault.documents d
      WHERE d.id = $1 AND d.program_id = $2 AND d.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM regulatory_programs rp
                     WHERE rp.id = d.program_id AND rp.organization_id = $3 AND rp.deleted_at IS NULL)
      FOR SHARE OF d`,
    [documentId, a.programId, a.organizationId],
  );
  return (rows[0] as VersionRow | undefined) ?? null;
}

export async function actorName(client: PoolClient, userId: number): Promise<string | null> {
  const { rows } = await client.query('SELECT COALESCE(n.name, n.email) AS name FROM public.actor_name($1) n', [userId]);
  const name = rows[0]?.name;
  return typeof name === 'string' && name.trim() ? name.trim() : null;
}

/** The checks every write shares, before the database is asked. */
export async function writeRefusal(a: Actor): Promise<Refusal | null> {
  const role = vaultWriteRefusal();
  if (role) return role;
  if (a.userId == null) return NO_ACTOR();
  if (!UUID_RE.test(a.programId) || !(await programInOrganization(pool, a.programId, a.organizationId))) return NOT_FOUND_PROJECT();
  return null;
}

export function bodyRefusal(body: unknown): Refusal | null {
  if (typeof body !== 'string' || !body.trim()) return refuse(400, 'BODY_REQUIRED', 'Write the annotation before posting it.');
  if (Array.from(body.trim()).length > BODY_MAX) return refuse(400, 'BODY_TOO_LONG', 'An annotation is at most 4,000 characters.');
  return null;
}

export const describeAnchor = (anchor: AnnotationAnchor) =>
  anchor.kind === 'page' ? `on page ${anchor.page}`
    : anchor.kind === 'text' ? `on a passage: “${short(anchor.quote, 80)}”` : 'on the whole document';

export async function audit(
  client: PoolClient, a: Actor, row: { action: string; versionId: string; details: Record<string, unknown>; reason?: string },
): Promise<void> {
  await writeChainedAuditRow(client, {
    tenantId: a.organizationId, userId: a.userId ?? undefined, action: row.action, resourceType: 'vault_document',
    resourceId: row.versionId, ipAddress: a.ipAddress, userAgent: a.userAgent, ...(row.reason ? { reason: row.reason } : {}),
    details: row.details,
  });
}
