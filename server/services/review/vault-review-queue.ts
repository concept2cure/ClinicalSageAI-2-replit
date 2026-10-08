/**
 * Vault versions in review, on the Review & approval board (QA 2026-10-08,
 * walk 2, j3 (b)).
 *
 * "Send for review" on a Vault version starts its record on the one document
 * lifecycle (canonical_documents, stage in_review; server/routes/
 * document-lifecycle.ts) and assigns nobody: the review is signed by any member
 * whose role carries signing authority, other than the version's uploader and
 * the person who sent it (and, for the approval, the reviewer). The board read
 * only the Authoring review store, so a version in review was in nobody's
 * queue — not the reviewer's, not the sender's, not "All open" — and the only
 * place it showed was the version's own row in the Vault.
 *
 * This read lists those records beside the Authoring queue, and says who has
 * each one: the members who may take its next step, by name, or plainly that
 * nobody in the organization can. It assigns nothing and signs nothing; the
 * step is taken on the version in the Vault, through the lifecycle route,
 * which re-checks authority and separation of duties.
 *
 * @module server/services/review/vault-review-queue
 */
import { readOrgSigners, type OrgSigner, type SignerQueryable } from '../vault/vault-signing-posture';
import type { ReviewScope } from './authoring-review-board';

export interface VaultReviewItemView {
  canonicalId: string;
  vaultId: string;
  programId: string | null;
  program: string | null;
  title: string;
  version: string | null;
  /** The step the version waits on: the review sign-off, or the approval after it. */
  step: 'review' | 'approve';
  sentBy: string | null;
  sentAt: string | null;
  /** Who may take the step, by name; null when the member list could not be read. */
  eligibleSigners: string[] | null;
  /** The reader is one of them. */
  mine: boolean;
  /** The reader sent it for review. */
  sentByMe: boolean;
}

export interface VaultReviewQueueInput {
  sql: SignerQueryable;
  orgId: number;
  userId: string;
  scope: ReviewScope;
  programId: string | null;
  limit: number;
}

interface Row {
  canonical_id: string;
  vault_id: string;
  program_id: string | null;
  program_name: string | null;
  title: string | null;
  version: string | null;
  uploader_id: number | string | null;
  sent_by: number | string | null;
  sent_by_name: string | null;
  sent_at: string | Date | null;
  review_signature: { actor?: unknown; signedAt?: unknown } | null;
}

const asId = (v: unknown): number | null => (v !== null && v !== undefined && /^\d+$/.test(String(v)) ? Number(v) : null);

/** The item a record becomes, given the organization's signers (null when unread). */
export function toVaultReviewItem(row: Row, signers: OrgSigner[] | null, userId: string): VaultReviewItemView {
  const reviewed = !!row.review_signature?.signedAt;
  const step: 'review' | 'approve' = reviewed ? 'approve' : 'review';
  const excluded = new Set<number>(
    [asId(row.uploader_id), asId(row.sent_by), reviewed ? asId(row.review_signature?.actor) : null].filter(
      (v): v is number => v !== null,
    ),
  );
  const eligible = signers === null ? null : signers.filter((s) => !excluded.has(s.id));
  const me = asId(userId);
  return {
    canonicalId: row.canonical_id,
    vaultId: row.vault_id,
    programId: row.program_id,
    program: row.program_name,
    title: row.title || 'Untitled document',
    version: row.version,
    step,
    sentBy: row.sent_by_name,
    sentAt: row.sent_at ? new Date(row.sent_at).toISOString() : null,
    eligibleSigners: eligible === null ? null : eligible.map((s) => s.name),
    mine: me !== null && !!eligible?.some((s) => s.id === me),
    sentByMe: me !== null && asId(row.sent_by) === me,
  };
}

/** Whether an item belongs in the board's scope, as the Authoring rows are scoped. */
export function inVaultScope(scope: ReviewScope, item: VaultReviewItemView): boolean {
  if (scope === 'mine') return item.mine;
  if (scope === 'requested') return item.sentByMe;
  return true;
}

export async function readVaultReviewQueue(input: VaultReviewQueueInput): Promise<VaultReviewItemView[]> {
  const { sql, orgId, userId, scope, programId, limit } = input;
  const { rows } = await sql.query(
    `SELECT c.canonical_id, d.id::text AS vault_id, d.program_id::text AS program_id, rp.name AS program_name,
            COALESCE(NULLIF(d.document_title, ''), NULLIF(d.title, ''), d.filename) AS title, d.version,
            d.created_by AS uploader_id, c.created_by AS sent_by,
            COALESCE(NULLIF(TRIM(su.name), ''), su.email) AS sent_by_name,
            c.updated_at AS sent_at, c.review_signature
       FROM canonical_documents c
       JOIN vault.documents d
         ON d.id::text = c.source_refs -> 'vault_documents' ->> 'nativeId' AND d.deleted_at IS NULL
       JOIN regulatory_programs rp
         ON rp.id = d.program_id AND rp.organization_id = c.organization_id AND rp.deleted_at IS NULL
       LEFT JOIN users su ON su.id = c.created_by
      WHERE c.organization_id = $1 AND c.stage = 'in_review' AND c.source_refs ? 'vault_documents'
        AND ($2::uuid IS NULL OR d.program_id = $2::uuid)
      ORDER BY c.updated_at DESC, c.canonical_id
      LIMIT 100`,
    [orgId, programId],
  );
  if (rows.length === 0) return [];
  const signers = await readOrgSigners(sql, orgId).catch(() => null);
  return (rows as Row[])
    .map((r) => toVaultReviewItem(r, signers, userId))
    .filter((i) => inVaultScope(scope, i))
    .slice(0, limit);
}
