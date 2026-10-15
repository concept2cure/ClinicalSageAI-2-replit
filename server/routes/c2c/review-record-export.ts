/**
 * An artifact's review record, as a copy an inspector can take (21 CFR Part 11
 * §11.10(b); row D5, 2026-10-01).
 *
 * Every thread on the artifact and every comment in them, retracted ones
 * included with who retracted them and why, each checked against the chained
 * rows its writer (review-comment-record.ts) committed with it: the words by
 * their sha256, the author, the thread, the kind, the name and role it was
 * posted under, and the retraction. The tenant's whole chain is walked at
 * export time. The export is recorded on the chain before anything leaves and
 * refused when it cannot be (the canonical sendAuditedExport).
 *
 * The verdicts say what the record shows, no more:
 *   intact       the comment matches its chained posting row (and retraction);
 *   mismatch     it does not; `fields` names what differs. The row was changed
 *                after it was chained, past the triggers that refuse that;
 *   not_chained  no posting row exists: comments posted before 2026-10-01,
 *                when review comments were first chained. Their words are as
 *                stored, with nothing on the chain to check them against.
 *
 * Before this, review comments reached an inspector only as raw rows inside
 * the organisation's whole audit-trail export.
 */
import type { Request, Response } from 'express';
import { requestConnectable, requestPgClient } from '../../db/requestDb';
import { sendAuditedExport, walkTenantChain } from '../../services/audit/audited-export';
import { commentSha256, REVIEW_COMMENT_POSTED, REVIEW_COMMENT_RETRACTED } from './review-comment-record';

export const REVIEW_RECORD_EXPORTED = 'review.record.exported';
export const REVIEW_RECORD_EXPORT_FORMAT = 'review-record-export/1';
/** Comments one export carries at most; a longer record says so (summary.truncated). */
export const REVIEW_RECORD_EXPORT_MAX_COMMENTS = 5000;

type Row = Record<string, unknown>;
type Sql = { query: (text: string, params?: unknown[]) => Promise<{ rows: Row[] }> };

export type CommentVerdict =
  | { status: 'intact' }
  | { status: 'mismatch'; fields: string[] }
  | { status: 'not_chained'; reason: string };

interface ChainLink {
  id: string;
  action: string;
  userId: number | null;
  reason: string | null;
  details: Row;
  sha256Chain: string | null;
  chainSeq: string | null;
  createdAt: unknown;
}

const NOT_CHAINED_REASON =
  'No review.comment.posted row: posted before review comments were chained (2026-10-01). The words are as stored, with nothing on the chain to check them against.';

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
const parsed = (v: unknown): Row => (typeof v === 'string' ? (JSON.parse(v) as Row) : ((v ?? {}) as Row));

function linkOf(r: Row): ChainLink {
  return {
    id: String(r.id),
    action: String(r.action),
    userId: r.user_id == null ? null : Number(r.user_id),
    reason: (r.reason as string | null) ?? null,
    details: parsed(r.new_values),
    sha256Chain: (r.sha256_chain as string | null) ?? null,
    chainSeq: r.chain_seq == null ? null : String(r.chain_seq),
    createdAt: iso(r.created_at),
  };
}

/** What differs between a stored comment and its chained posting row. */
function postingDifferences(c: Row, p: ChainLink): string[] {
  const d = p.details;
  const fields: string[] = [];
  if (d.bodySha256 !== commentSha256(String(c.body))) fields.push('body');
  if (p.userId !== Number(c.author_id)) fields.push('author');
  if (Number(d.threadId) !== Number(c.thread_id)) fields.push('thread');
  if (d.kind !== c.kind) fields.push('kind');
  if ((d.authorName ?? null) !== (c.author_name ?? null)) fields.push('authorName');
  if ((d.authorRole ?? null) !== (c.author_role ?? null)) fields.push('authorRole');
  return fields;
}

/** One comment against its chain: posted once, unchanged, and retracted on the chain exactly when the row says so. */
export function verdictOf(c: Row, posts: ChainLink[], retractions: ChainLink[]): CommentVerdict {
  if (posts.length === 0) return { status: 'not_chained', reason: NOT_CHAINED_REASON };
  const fields = posts.length > 1 ? ['postedMoreThanOnce'] : postingDifferences(c, posts[0]);
  const retractedOnRow = c.deleted_at != null;
  if (retractedOnRow !== retractions.length > 0) fields.push('retraction');
  else if (retractions.some((r) => r.details.bodySha256 !== commentSha256(String(c.body)))) fields.push('retractedBody');
  return fields.length ? { status: 'mismatch', fields } : { status: 'intact' };
}

/** The artifact's threads, its comments (oldest first) and their chained rows. */
async function loadReviewRecord(sql: Sql, orgId: number, artifactPk: number) {
  const threads = await sql.query(
    `SELECT thread_id, version_id, title, anchor_label, status, priority, created_by_id, created_by_name, created_by_role,
            assignee_name, created_at, resolved_at, resolved_by_id, resolved_by_name
       FROM concept2cure_review_threads WHERE org_id = $1 AND artifact_id = $2 ORDER BY created_at, id`,
    [orgId, artifactPk],
  );
  const comments = await sql.query(
    `SELECT c.comment_id, t.thread_id AS thread_key, c.thread_id, c.version_id, p.comment_id AS parent_comment_key,
            c.author_id, c.author_name, c.author_role, c.body, c.kind, c.created_at, c.edited_at, c.deleted_at
       FROM concept2cure_thread_comments c
       JOIN concept2cure_review_threads t ON t.id = c.thread_id
       LEFT JOIN concept2cure_thread_comments p ON p.id = c.parent_comment_id
      WHERE c.org_id = $1 AND c.artifact_id = $2
      ORDER BY c.created_at, c.id LIMIT $3`,
    [orgId, artifactPk, REVIEW_RECORD_EXPORT_MAX_COMMENTS],
  );
  const total = Number(
    (await sql.query('SELECT count(*)::int AS n FROM concept2cure_thread_comments WHERE org_id = $1 AND artifact_id = $2', [orgId, artifactPk]))
      .rows[0]?.n ?? comments.rows.length,
  );
  const ids = comments.rows.map((c) => String(c.comment_id));
  const chain = ids.length
    ? await sql.query(
        `SELECT id::text AS id, action, record_id, user_id, reason, new_values, sha256_chain, chain_seq::text AS chain_seq, created_at
           FROM audit_logs
          WHERE tenant_id = $1 AND action = ANY($2::text[]) AND record_id = ANY($3::text[])
          ORDER BY created_at, id`,
        [orgId, [REVIEW_COMMENT_POSTED, REVIEW_COMMENT_RETRACTED], ids],
      )
    : { rows: [] as Row[] };
  return { threads: threads.rows, comments: comments.rows, total, chain: chain.rows };
}

/** The package: the record, its chain, a verdict per comment, and how to check it offline. */
function buildPackage(loaded: Awaited<ReturnType<typeof loadReviewRecord>>) {
  const byComment = new Map<string, { posted: ChainLink[]; retracted: ChainLink[] }>();
  for (const r of loaded.chain) {
    const at = byComment.get(String(r.record_id)) ?? { posted: [], retracted: [] };
    (r.action === REVIEW_COMMENT_POSTED ? at.posted : at.retracted).push(linkOf(r));
    byComment.set(String(r.record_id), at);
  }
  const verdicts: Record<string, CommentVerdict> = {};
  const chain: Record<string, { posted: ChainLink | null; retracted: ChainLink | null; postedRows: number; retractedRows: number }> = {};
  const comments = loaded.comments.map((c) => {
    const id = String(c.comment_id);
    const links = byComment.get(id) ?? { posted: [], retracted: [] };
    verdicts[id] = verdictOf(c, links.posted, links.retracted);
    chain[id] = { posted: links.posted[0] ?? null, retracted: links.retracted[0] ?? null, postedRows: links.posted.length, retractedRows: links.retracted.length };
    const retraction = links.retracted[0];
    return {
      commentId: id,
      threadId: String(c.thread_key),
      parentCommentId: (c.parent_comment_key as string | null) ?? null,
      versionId: (c.version_id as number | null) ?? null,
      kind: c.kind,
      authorId: Number(c.author_id),
      authorName: c.author_name,
      authorRole: (c.author_role as string | null) ?? null,
      origin: c.author_role === 'ana' ? 'ana' : 'person',
      body: c.body,
      createdAt: iso(c.created_at),
      editedAt: iso(c.edited_at),
      retracted:
        c.deleted_at == null
          ? null
          : { at: iso(c.deleted_at), by: retraction?.userId ?? null, reason: retraction?.reason ?? null },
    };
  });
  const values = Object.values(verdicts);
  const summary = {
    threads: loaded.threads.length,
    comments: comments.length,
    intact: values.filter((v) => v.status === 'intact').length,
    mismatched: values.filter((v) => v.status === 'mismatch').length,
    notChained: values.filter((v) => v.status === 'not_chained').length,
    retracted: comments.filter((c) => c.retracted).length,
    truncated: loaded.total > comments.length,
    ...(loaded.total > comments.length ? { totalComments: loaded.total } : {}),
  };
  const threads = loaded.threads.map((t) => ({
    threadId: t.thread_id,
    versionId: t.version_id ?? null,
    title: t.title,
    anchor: t.anchor_label ?? null,
    status: t.status,
    priority: t.priority ?? null,
    createdBy: { id: t.created_by_id, name: t.created_by_name, role: t.created_by_role ?? null },
    assignee: t.assignee_name ?? null,
    createdAt: iso(t.created_at),
    resolvedAt: iso(t.resolved_at),
    resolvedBy: t.resolved_by_id == null ? null : { id: t.resolved_by_id, name: t.resolved_by_name },
  }));
  return { threads, comments, chain, verdicts, summary };
}

const HOW_TO_VERIFY = [
  'For each comment, chain[commentId].posted is its review.comment.posted row; details.commentId equals commentId.',
  'SHA-256 of comment.body (UTF-8, hex) equals chain[commentId].posted.details.bodySha256, and, when the comment is retracted, chain[commentId].retracted.details.bodySha256.',
  'chain[commentId].posted.userId equals comment.authorId; details.threadId, kind, authorName and authorRole are what the comment was posted with.',
  "postedRows is 1 for every chained comment; a comment is retracted exactly when retractedRows is 1, and retracted.by and retracted.reason are that row's user and reason.",
  'origin "ana" marks words AnA wrote on the person\'s behalf (authorRole "ana"); the person is the author of record.',
  'Each chained row\'s sha256Chain is a link of the organisation\'s audit chain. tenantChain is the walk of the whole chain at export time; the signed audit-trail export (GET /api/audit/export/signed) carries every link to re-walk it offline.',
  'A not_chained comment was posted before review comments were chained (2026-10-01): its words are as stored, with nothing on the chain to check them against.',
];

/**
 * Hand the artifact's review record to an audit reader. The caller has
 * checked the reader gate, the project and the artifact.
 */
export async function exportReviewRecord(
  req: Request,
  res: Response,
  a: { orgId: number; userId: number; artifact: { id: number; artifactId: string; title: string; type: string; projectId: number } },
): Promise<void> {
  const loaded = await loadReviewRecord(requestPgClient(req), a.orgId, a.artifact.id);
  const record = buildPackage(loaded);
  const tenantChain = await walkTenantChain(a.orgId);
  const exportedAt = new Date().toISOString();
  return sendAuditedExport(requestConnectable(req), res, {
    tenantId: a.orgId,
    userId: a.userId,
    action: REVIEW_RECORD_EXPORTED,
    resourceType: 'review_record',
    resourceId: a.artifact.artifactId,
    details: {
      format: REVIEW_RECORD_EXPORT_FORMAT,
      threads: record.summary.threads,
      comments: record.summary.comments,
      intact: record.summary.intact,
      mismatched: record.summary.mismatched,
      notChained: record.summary.notChained,
      truncated: record.summary.truncated,
      tenantChainOk: tenantChain.ok,
      exportedAt,
    },
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
    filename: `review-record-${a.artifact.artifactId}.json`,
    refusalCode: 'REVIEW_RECORD_EXPORT_NOT_RECORDED',
    body: {
      format: REVIEW_RECORD_EXPORT_FORMAT,
      exportedAt,
      exportedBy: { userId: a.userId },
      artifact: { artifactId: a.artifact.artifactId, title: a.artifact.title, type: a.artifact.type, projectId: a.artifact.projectId },
      ...record,
      tenantChain,
      howToVerify: HOW_TO_VERIFY,
    },
  });
}
