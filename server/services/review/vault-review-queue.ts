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
 * Since RR1b (docs/design/REVIEW_ROUTING_2026-10-23.md §2.11–§2.12) a version
 * sent with a named route is read from its route instead: "mine" is a named
 * member whose step is open and who has not signed, with their own due date;
 * "Requested by me" is the routes the reader sent, each with every member's
 * outcome (the round, as the Vault reads it). A withdrawn route is in nobody's
 * queue: nothing is signed until a new one is sent. A route that could not be
 * read is said as unread (`routeUnread`), never as nobody named. The legacy
 * reading above stays for a version in review with no route.
 *
 * @module server/services/review/vault-review-queue
 */
import { readOrgSigners, type OrgSigner, type SignerQueryable } from '../vault/vault-signing-posture';
import type { ReviewScope } from './authoring-review-board';
import { readRouteRounds, type RouteRound } from './review-route-standing';

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
  /** 'live' or 'withdrawn' for a version sent on a named route; 'legacy' for one in review without (§2.13). */
  routeState: 'live' | 'withdrawn' | 'legacy';
  /** The route's round (every member and outcome), when it has one. */
  round: RouteRound | null;
  /** The route could not be read: who holds it is unknown, never "nobody". */
  routeUnread: boolean;
  /** The reader's own due date, when their step on the route is open. */
  myDueAt: string | null;
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
    routeState: 'legacy',
    round: null,
    routeUnread: false,
    myDueAt: null,
  };
}

/**
 * The item a version on a named route becomes (RR1b): who holds it is the
 * route's named members whose step is open and who have not signed. A
 * withdrawn route holds nobody.
 */
export function toRoutedVaultReviewItem(row: Row, round: RouteRound, userId: string): VaultReviewItemView {
  const me = asId(userId);
  const live = round.route.status === 'open';
  const holders = live ? round.members.filter((m) => m.stepOpen && m.outcome === 'pending') : [];
  const mineMember = holders.find((m) => m.userId === me) ?? null;
  return {
    canonicalId: row.canonical_id,
    vaultId: row.vault_id,
    programId: row.program_id,
    program: row.program_name,
    title: row.title || 'Untitled document',
    version: row.version,
    step: round.reviewComplete ? 'approve' : 'review',
    sentBy: round.route.senderName,
    sentAt: round.route.createdAt,
    // The others whose turn it is: the reader's own turn is `mine`.
    eligibleSigners: holders.filter((m) => m.userId !== me).map((m) => m.printedName ?? `Account #${m.userId}`),
    mine: mineMember !== null,
    sentByMe: me !== null && round.route.senderId === me,
    routeState: live ? 'live' : 'withdrawn',
    round,
    routeUnread: false,
    myDueAt: mineMember?.dueDate ?? null,
  };
}

/** A version whose route could not be read: nobody is claimed to hold it, and it is in no one's "mine". */
function unreadItem(row: Row, userId: string): VaultReviewItemView {
  return { ...toVaultReviewItem(row, null, userId), mine: false, routeUnread: true };
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
  const records = rows as Row[];
  const rounds = await readRouteRounds(sql as never, {
    organizationId: orgId, subjectType: 'canonical_document', subjectIds: records.map((r) => r.canonical_id),
  }).catch(() => null);
  const signers = await readOrgSigners(sql, orgId).catch(() => null);
  return records
    .map((r) => {
      if (rounds === null) return unreadItem(r, userId);
      const round = rounds.get(r.canonical_id);
      // A route closed by return or completion, on a version back in review
      // with none: that round entered review without one (legacy, §2.13).
      if (round && (round.route.status === 'open' || round.route.status === 'withdrawn')) return toRoutedVaultReviewItem(r, round, userId);
      return toVaultReviewItem(r, signers, userId);
    })
    .filter((i) => inVaultScope(scope, i))
    .slice(0, limit);
}
