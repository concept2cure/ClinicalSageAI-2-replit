/**
 * A review comment, and its retraction, on the record (row D5, 2026-10-01).
 *
 * The one writer of concept2cure_thread_comments. A comment's words, author and
 * place are fixed once it is posted (migrations/20261001_review_comments_record.sql);
 * a retraction hides it from the thread and keeps its words. Each act commits
 * in ONE transaction with a chained audit_logs row carrying what an inspector
 * needs to check the stored comment against the chain: the words and their
 * sha256, who, the kind, the thread and the artifact. Neither commits without
 * the other.
 *
 * Before this, the comment insert and every other write here ran on the global
 * handle with no record, PATCH overwrote a comment's words, and the soft-delete
 * left no trace of who removed what.
 */
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { concept2cureThreadComments } from '../../../shared/schema';
import { writeChainedAuditRow } from '../../services/auditService';
import { queryableFromDrizzle } from '../../db/drizzle-queryable';
import { clientIpKey } from '../../utils/client-ip';
import { statedReasonOrNull } from '../governed-reason';

export const REVIEW_COMMENT_POSTED = 'review.comment.posted';
export const REVIEW_COMMENT_RETRACTED = 'review.comment.retracted';
const RESOURCE = 'review_comment';

type NewComment = typeof concept2cureThreadComments.$inferInsert;
export type RecordedComment = typeof concept2cureThreadComments.$inferSelect;

export const commentSha256 = (body: string) => createHash('sha256').update(body, 'utf8').digest('hex');

const requestFacts = (req: Request) => ({
  ipAddress: clientIpKey(req),
  userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
});

/** What the chained row records of a posted comment. Columns as the table names them. */
export interface PostedCommentFacts {
  orgId: number;
  authorId: number;
  commentId: string;
  threadId: number;
  artifactId: number;
  versionId: number | null;
  parentCommentId: number | null;
  kind: string;
  authorName: string;
  authorRole: string | null;
  body: string;
}

/**
 * Who wrote the words. 'person' for the Review surface; 'ana' when AnA wrote
 * them on the person's behalf (the AnA command and guidance writers), so the
 * record never presents AnA's words as the person's own.
 */
export type CommentOrigin = 'person' | 'ana';

/**
 * The chained row for a posted comment, on the caller's transaction. Every
 * writer of concept2cure_thread_comments calls this inside the transaction
 * that inserts the comment.
 */
export async function recordCommentPosted(
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  c: PostedCommentFacts,
  origin: CommentOrigin,
  facts: { ipAddress?: string; userAgent?: string } = {},
): Promise<void> {
  await writeChainedAuditRow(client, {
    tenantId: c.orgId,
    userId: c.authorId,
    action: REVIEW_COMMENT_POSTED,
    resourceType: RESOURCE,
    resourceId: c.commentId,
    ...facts,
    details: {
      commentId: c.commentId,
      threadId: c.threadId,
      artifactId: c.artifactId,
      versionId: c.versionId,
      parentCommentId: c.parentCommentId,
      kind: c.kind,
      authorName: c.authorName,
      authorRole: c.authorRole,
      origin,
      body: c.body,
      bodySha256: commentSha256(c.body),
    },
  });
}

/** Insert a person's comment and its chained row in one transaction. */
export async function postRecordedComment(req: Request, values: NewComment): Promise<RecordedComment> {
  return db.transaction(async (tx) => {
    const [c] = await tx.insert(concept2cureThreadComments).values(values).returning();
    await recordCommentPosted(queryableFromDrizzle(tx), c, 'person', requestFacts(req));
    return c;
  });
}

/**
 * Retract a comment: set deleted_at once and record who did it, when, and the
 * reason they gave (or none). The words stay in the row and on the chain.
 */
export async function retractRecordedComment(
  req: Request,
  comment: RecordedComment,
  retractedBy: number,
  reason: unknown,
): Promise<Date> {
  return db.transaction(async (tx) => {
    const at = new Date();
    await tx
      .update(concept2cureThreadComments)
      .set({ deletedAt: at, updatedAt: at })
      .where(eq(concept2cureThreadComments.id, comment.id));
    await writeChainedAuditRow(queryableFromDrizzle(tx), {
      tenantId: comment.orgId,
      userId: retractedBy,
      action: REVIEW_COMMENT_RETRACTED,
      resourceType: RESOURCE,
      resourceId: comment.commentId,
      reason: statedReasonOrNull(reason),
      ...requestFacts(req),
      details: {
        commentId: comment.commentId,
        threadId: comment.threadId,
        authorId: comment.authorId,
        bodySha256: commentSha256(comment.body),
        retractedAt: at.toISOString(),
      },
    });
    return at;
  });
}
