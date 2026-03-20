/**
 * Comment CRUD Routes
 *
 * Provides full comment lifecycle management for document review workflows.
 * Supports threaded comments, resolution tracking, and reply chains.
 *
 * Routes:
 *   GET    /documents/:documentId/comments     — list comments for a document
 *   POST   /documents/:documentId/comments     — create a new comment
 *   PATCH  /comments/:commentId                — update comment (edit text, resolve, reopen)
 *   DELETE /comments/:commentId                — delete a comment
 *   POST   /comments/:commentId/replies        — add a reply to a comment
 */
import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';
import { documentComments } from '../../shared/schema';
import { authMiddleware } from '../auth';
import { db } from '../db';
import { createScopedLogger } from '../utils/logger';

const router = Router();
const logger = createScopedLogger('comment-routes');

// ── Helpers ──────────────────────────────────────────────────────────────────

const resolveUserId = (req: any): number | null => {
  const raw = req.userId || req.user?.id || req.user?.userId;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveUserName = (req: any): string => {
  return req.user?.name || req.user?.email || req.headers['x-user-name'] as string || 'Unknown';
};

const tableExists = async (tableName: string): Promise<boolean> => {
  try {
    const result = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = ${tableName}
      )
    `);
    const rows = (result as any).rows ?? result;
    return rows?.[0]?.exists === true;
  } catch {
    return false;
  }
};

// ── Validation schemas ───────────────────────────────────────────────────────

const createCommentSchema = z.object({
  content: z.string().min(1, 'Comment content is required'),
  commentType: z
    .enum(['general', 'review', 'approval', 'question', 'suggestion'])
    .default('general'),
  sectionReference: z.string().max(200).optional(),
  highlightedText: z.string().optional(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
  versionId: z.number().optional(),
  parentCommentId: z.number().optional(),
});

const updateCommentSchema = z.object({
  content: z.string().min(1).optional(),
  status: z.enum(['open', 'resolved', 'rejected', 'incorporated']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
  resolutionNote: z.string().optional(),
});

const replySchema = z.object({
  content: z.string().min(1, 'Reply content is required'),
});

// ── GET /documents/:documentId/comments ─────────────────────────────────────

router.get('/documents/:documentId/comments', authMiddleware, async (req, res) => {
  const documentId = Number(req.params.documentId);
  if (!Number.isFinite(documentId)) {
    return res.status(400).json({ error: 'Invalid document id' });
  }

  const hasTable = await tableExists('document_comments');
  if (!hasTable) {
    return res.json({ comments: [] });
  }

  try {
    const allComments = await db
      .select()
      .from(documentComments)
      .where(eq(documentComments.documentId, documentId))
      .orderBy(desc(documentComments.createdAt))
      .limit(500);

    // Organize into threads — top-level comments with nested replies
    const topLevel = allComments.filter(c => !c.parentCommentId);
    const replies = allComments.filter(c => c.parentCommentId);

    const threads = topLevel.map(comment => ({
      ...comment,
      replies: replies
        .filter(r => r.parentCommentId === comment.id)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    }));

    return res.json({ comments: threads });
  } catch (error) {
    logger.error('Failed to list comments', { error, documentId });
    return res.status(500).json({ error: 'Failed to list comments' });
  }
});

// ── POST /documents/:documentId/comments ────────────────────────────────────

router.post('/documents/:documentId/comments', authMiddleware, async (req, res) => {
  const documentId = Number(req.params.documentId);
  if (!Number.isFinite(documentId)) {
    return res.status(400).json({ error: 'Invalid document id' });
  }

  const userId = resolveUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'User authentication required' });
  }

  const parsed = createCommentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid comment data', details: parsed.error.issues });
  }

  const { content, commentType, sectionReference, highlightedText, priority, versionId, parentCommentId } =
    parsed.data;
  const authorName = resolveUserName(req);

  try {
    const [comment] = await db
      .insert(documentComments)
      .values({
        documentId,
        versionId: versionId ?? null,
        parentCommentId: parentCommentId ?? null,
        commentType,
        sectionReference: sectionReference ?? null,
        content,
        status: 'open',
        priority,
        authorId: userId,
        authorName,
        attachments: highlightedText ? { highlightedText } : null,
        mentions: null,
        isEdited: false,
      })
      .returning();

    logger.info('Comment created', { commentId: comment.id, documentId, userId });
    return res.status(201).json({ comment });
  } catch (error) {
    logger.error('Failed to create comment', { error, documentId });
    return res.status(500).json({ error: 'Failed to create comment' });
  }
});

// ── PATCH /comments/:commentId ──────────────────────────────────────────────

router.patch('/comments/:commentId', authMiddleware, async (req, res) => {
  const commentId = Number(req.params.commentId);
  if (!Number.isFinite(commentId)) {
    return res.status(400).json({ error: 'Invalid comment id' });
  }

  const userId = resolveUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'User authentication required' });
  }

  const parsed = updateCommentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid update data', details: parsed.error.issues });
  }

  try {
    // Build update payload
    const updates: Record<string, any> = { updatedAt: new Date() };

    if (parsed.data.content !== undefined) {
      updates.content = parsed.data.content;
      updates.isEdited = true;
      updates.editedAt = new Date();
    }

    if (parsed.data.status !== undefined) {
      updates.status = parsed.data.status;
      if (parsed.data.status === 'resolved') {
        updates.resolvedById = userId;
        updates.resolvedAt = new Date();
      } else if (parsed.data.status === 'open') {
        // Reopening — clear resolution data
        updates.resolvedById = null;
        updates.resolvedAt = null;
        updates.resolutionNote = null;
      }
    }

    if (parsed.data.priority !== undefined) {
      updates.priority = parsed.data.priority;
    }

    if (parsed.data.resolutionNote !== undefined) {
      updates.resolutionNote = parsed.data.resolutionNote;
    }

    const [updated] = await db
      .update(documentComments)
      .set(updates)
      .where(eq(documentComments.id, commentId))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    logger.info('Comment updated', { commentId, status: updated.status });
    return res.json({ comment: updated });
  } catch (error) {
    logger.error('Failed to update comment', { error, commentId });
    return res.status(500).json({ error: 'Failed to update comment' });
  }
});

// ── DELETE /comments/:commentId ─────────────────────────────────────────────

router.delete('/comments/:commentId', authMiddleware, async (req, res) => {
  const commentId = Number(req.params.commentId);
  if (!Number.isFinite(commentId)) {
    return res.status(400).json({ error: 'Invalid comment id' });
  }

  try {
    // Delete replies first, then the comment
    await db
      .delete(documentComments)
      .where(eq(documentComments.parentCommentId, commentId));

    const [deleted] = await db
      .delete(documentComments)
      .where(eq(documentComments.id, commentId))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    logger.info('Comment deleted', { commentId });
    return res.json({ success: true, commentId });
  } catch (error) {
    logger.error('Failed to delete comment', { error, commentId });
    return res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// ── POST /comments/:commentId/replies ───────────────────────────────────────

router.post('/comments/:commentId/replies', authMiddleware, async (req, res) => {
  const parentCommentId = Number(req.params.commentId);
  if (!Number.isFinite(parentCommentId)) {
    return res.status(400).json({ error: 'Invalid comment id' });
  }

  const userId = resolveUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'User authentication required' });
  }

  const parsed = replySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid reply data', details: parsed.error.issues });
  }

  try {
    // Look up parent to get documentId
    const [parent] = await db
      .select()
      .from(documentComments)
      .where(eq(documentComments.id, parentCommentId))
      .limit(1);

    if (!parent) {
      return res.status(404).json({ error: 'Parent comment not found' });
    }

    const authorName = resolveUserName(req);

    const [reply] = await db
      .insert(documentComments)
      .values({
        documentId: parent.documentId,
        versionId: parent.versionId,
        parentCommentId,
        commentType: 'general',
        content: parsed.data.content,
        status: 'open',
        priority: 'normal',
        authorId: userId,
        authorName,
      })
      .returning();

    logger.info('Reply created', { replyId: reply.id, parentCommentId });
    return res.status(201).json({ reply });
  } catch (error) {
    logger.error('Failed to create reply', { error, parentCommentId });
    return res.status(500).json({ error: 'Failed to create reply' });
  }
});

export default router;
