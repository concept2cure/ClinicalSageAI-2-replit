/**
 * Comment CRUD Routes
 *
 * Provides full comment lifecycle management for document review workflows.
 * Supports threaded comments, resolution tracking, and reply chains.
 *
 * Security:
 *   - All queries are tenant-isolated via documents.organizationId JOIN
 *   - Edit/delete restricted to comment author or admin role
 *   - Content sanitized to prevent XSS
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
import { documentComments, documents } from '../../shared/schema';
import { authMiddleware } from '../auth';
import { db } from '../db';
import { createScopedLogger } from '../utils/logger';

const router = Router();
const logger = createScopedLogger('comment-routes');

// ── Helpers ──────────────────────────────────────────────────────────────────

const resolveOrganizationId = (req: any): number | null => {
  const headerOrg = req.header('x-organization-id') || req.header('x-org-id');
  const tenantOrg = req.tenantContext?.organizationId;
  const userOrg = req.user?.organizationId || req.tenantId;
  const raw = headerOrg || tenantOrg || userOrg;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveUserId = (req: any): number | null => {
  const raw = req.userId || req.user?.id || req.user?.userId;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveUserName = (req: any): string => {
  const name = req.user?.name || req.user?.email || (req.headers['x-user-name'] as string);
  return typeof name === 'string' && name.length > 0 ? name : 'Unknown';
};

const resolveUserRole = (req: any): string => {
  return String(req.userRole || req.user?.role || '').toLowerCase();
};

/** Strip HTML tags to prevent stored XSS. Preserves plain text and newlines. */
function sanitizeContent(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

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

/**
 * Verify that a document belongs to the given organization.
 * Returns true if the document exists and belongs to the org.
 */
async function verifyDocumentOwnership(documentId: number, organizationId: number): Promise<boolean> {
  const [doc] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.organizationId, organizationId)))
    .limit(1);
  return !!doc;
}

/**
 * Verify that a comment belongs to a document owned by the given organization.
 * Returns the comment if found, null otherwise.
 */
async function verifyCommentOwnership(
  commentId: number,
  organizationId: number
): Promise<{ id: number; authorId: number; documentId: number } | null> {
  const rows = await db
    .select({
      id: documentComments.id,
      authorId: documentComments.authorId,
      documentId: documentComments.documentId,
    })
    .from(documentComments)
    .innerJoin(documents, eq(documents.id, documentComments.documentId))
    .where(
      and(
        eq(documentComments.id, commentId),
        eq(documents.organizationId, organizationId)
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

// ── Validation schemas ───────────────────────────────────────────────────────

const createCommentSchema = z.object({
  content: z.string().min(1, 'Comment content is required').max(10000),
  commentType: z
    .enum(['general', 'review', 'approval', 'question', 'suggestion'])
    .default('general'),
  sectionReference: z.string().max(200).optional(),
  highlightedText: z.string().max(2000).optional(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
  versionId: z.number().int().positive().optional(),
  parentCommentId: z.number().int().positive().optional(),
});

const updateCommentSchema = z.object({
  content: z.string().min(1).max(10000).optional(),
  status: z.enum(['open', 'resolved', 'rejected', 'incorporated']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
  resolutionNote: z.string().max(2000).optional(),
});

const replySchema = z.object({
  content: z.string().min(1, 'Reply content is required').max(10000),
});

// ── GET /documents/:documentId/comments ─────────────────────────────────────

router.get('/documents/:documentId/comments', authMiddleware, async (req, res) => {
  const documentId = Number(req.params.documentId);
  if (!Number.isFinite(documentId)) {
    return res.status(400).json({ error: 'Invalid document id' });
  }

  const organizationId = resolveOrganizationId(req);
  if (!organizationId) {
    return res.status(400).json({ error: 'Organization context required' });
  }

  const hasTable = await tableExists('document_comments');
  if (!hasTable) {
    return res.json({ comments: [] });
  }

  try {
    // Tenant-isolated query via JOIN to documents
    const allComments = await db
      .select({
        id: documentComments.id,
        documentId: documentComments.documentId,
        versionId: documentComments.versionId,
        parentCommentId: documentComments.parentCommentId,
        commentType: documentComments.commentType,
        sectionReference: documentComments.sectionReference,
        content: documentComments.content,
        status: documentComments.status,
        priority: documentComments.priority,
        resolvedById: documentComments.resolvedById,
        resolvedAt: documentComments.resolvedAt,
        resolutionNote: documentComments.resolutionNote,
        authorId: documentComments.authorId,
        authorName: documentComments.authorName,
        attachments: documentComments.attachments,
        mentions: documentComments.mentions,
        isEdited: documentComments.isEdited,
        editedAt: documentComments.editedAt,
        createdAt: documentComments.createdAt,
        updatedAt: documentComments.updatedAt,
      })
      .from(documentComments)
      .innerJoin(documents, eq(documents.id, documentComments.documentId))
      .where(
        and(
          eq(documentComments.documentId, documentId),
          eq(documents.organizationId, organizationId)
        )
      )
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

  const organizationId = resolveOrganizationId(req);
  if (!organizationId) {
    return res.status(400).json({ error: 'Organization context required' });
  }

  const userId = resolveUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'User authentication required' });
  }

  // Verify document belongs to this organization
  const docOwned = await verifyDocumentOwnership(documentId, organizationId);
  if (!docOwned) {
    return res.status(404).json({ error: 'Document not found' });
  }

  const parsed = createCommentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid comment data', details: parsed.error.issues });
  }

  const { commentType, sectionReference, highlightedText, priority, versionId, parentCommentId } =
    parsed.data;
  const content = sanitizeContent(parsed.data.content);
  if (!content) {
    return res.status(400).json({ error: 'Comment content cannot be empty after sanitization' });
  }
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

  const organizationId = resolveOrganizationId(req);
  if (!organizationId) {
    return res.status(400).json({ error: 'Organization context required' });
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
    // Verify comment exists and belongs to this org
    const comment = await verifyCommentOwnership(commentId, organizationId);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Authorization: only the author can edit content; anyone in the org can resolve/reopen
    const role = resolveUserRole(req);
    const isAdmin = role === 'admin' || role === 'super_admin' || role === 'owner';
    const isAuthor = comment.authorId === userId;

    if (parsed.data.content !== undefined && !isAuthor && !isAdmin) {
      return res.status(403).json({ error: 'Only the comment author or admin can edit content' });
    }

    // Build update payload
    const updates: Record<string, any> = { updatedAt: new Date() };

    if (parsed.data.content !== undefined) {
      const sanitized = sanitizeContent(parsed.data.content);
      if (!sanitized) {
        return res.status(400).json({ error: 'Content cannot be empty after sanitization' });
      }
      updates.content = sanitized;
      updates.isEdited = true;
      updates.editedAt = new Date();
    }

    if (parsed.data.status !== undefined) {
      updates.status = parsed.data.status;
      if (parsed.data.status === 'resolved') {
        updates.resolvedById = userId;
        updates.resolvedAt = new Date();
      } else if (parsed.data.status === 'open') {
        updates.resolvedById = null;
        updates.resolvedAt = null;
        updates.resolutionNote = null;
      }
    }

    if (parsed.data.priority !== undefined) {
      updates.priority = parsed.data.priority;
    }

    if (parsed.data.resolutionNote !== undefined) {
      updates.resolutionNote = sanitizeContent(parsed.data.resolutionNote);
    }

    const [updated] = await db
      .update(documentComments)
      .set(updates)
      .where(eq(documentComments.id, commentId))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    logger.info('Comment updated', { commentId, status: updated.status, userId });
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

  const organizationId = resolveOrganizationId(req);
  if (!organizationId) {
    return res.status(400).json({ error: 'Organization context required' });
  }

  const userId = resolveUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'User authentication required' });
  }

  try {
    // Verify comment exists and belongs to this org
    const comment = await verifyCommentOwnership(commentId, organizationId);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Authorization: only author or admin can delete
    const role = resolveUserRole(req);
    const isAdmin = role === 'admin' || role === 'super_admin' || role === 'owner';
    const isAuthor = comment.authorId === userId;

    if (!isAuthor && !isAdmin) {
      return res.status(403).json({ error: 'Only the comment author or admin can delete comments' });
    }

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

    logger.info('Comment deleted', { commentId, userId });
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

  const organizationId = resolveOrganizationId(req);
  if (!organizationId) {
    return res.status(400).json({ error: 'Organization context required' });
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
    // Look up parent — tenant-isolated
    const parent = await verifyCommentOwnership(parentCommentId, organizationId);
    if (!parent) {
      return res.status(404).json({ error: 'Parent comment not found' });
    }

    const content = sanitizeContent(parsed.data.content);
    if (!content) {
      return res.status(400).json({ error: 'Reply content cannot be empty after sanitization' });
    }
    const authorName = resolveUserName(req);

    const [reply] = await db
      .insert(documentComments)
      .values({
        documentId: parent.documentId,
        parentCommentId,
        commentType: 'general',
        content,
        status: 'open',
        priority: 'normal',
        authorId: userId,
        authorName,
      })
      .returning();

    logger.info('Reply created', { replyId: reply.id, parentCommentId, userId });
    return res.status(201).json({ reply });
  } catch (error) {
    logger.error('Failed to create reply', { error, parentCommentId });
    return res.status(500).json({ error: 'Failed to create reply' });
  }
});

// ── POST /comments/:commentId/address-with-ai ────────────────────────────────
/**
 * AI-powered comment resolution: takes a reviewer comment + its highlighted text
 * and the full artifact content, calls the AI gateway to rewrite the section
 * addressing the feedback, and returns the rewritten text + explanation.
 */
router.post('/comments/:commentId/address-with-ai', authMiddleware, async (req, res) => {
  const commentId = Number(req.params.commentId);
  if (!Number.isFinite(commentId)) {
    return res.status(400).json({ error: 'Invalid comment id' });
  }

  const organizationId = resolveOrganizationId(req);
  if (!organizationId) {
    return res.status(400).json({ error: 'Organization context required' });
  }

  const userId = resolveUserId(req);
  if (!userId) {
    return res.status(401).json({ error: 'User authentication required' });
  }

  try {
    // 1. Load the comment (tenant-isolated via JOIN)
    const commentRows = await db
      .select({
        id: documentComments.id,
        documentId: documentComments.documentId,
        content: documentComments.content,
        sectionReference: documentComments.sectionReference,
        attachments: documentComments.attachments,
        status: documentComments.status,
      })
      .from(documentComments)
      .innerJoin(documents, eq(documents.id, documentComments.documentId))
      .where(
        and(
          eq(documentComments.id, commentId),
          eq(documents.organizationId, organizationId)
        )
      )
      .limit(1);

    const comment = commentRows[0];
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const highlightedText = (comment.attachments as Record<string, string> | null)?.highlightedText || '';
    const sectionReference = comment.sectionReference || '';

    // 2. Load the full document/artifact content for context
    const [doc] = await db
      .select({ id: documents.id, title: documents.title, description: documents.description })
      .from(documents)
      .where(and(eq(documents.id, comment.documentId), eq(documents.organizationId, organizationId)))
      .limit(1);

    // Try to get actual content from concept2cure artifacts (the editor stores content there)
    let documentContent = '';
    let documentTitle = doc?.title || '';
    try {
      const artifactResult = await db.execute(sql`
        SELECT title, content FROM concept2cure_artifacts
        WHERE id = ${comment.documentId}
        LIMIT 1
      `);
      const rows = (artifactResult as any).rows ?? artifactResult;
      if (rows?.[0]?.content) {
        documentContent = rows[0].content;
        documentTitle = rows[0].title || documentTitle;
      }
    } catch {
      // Fall back to document description
      documentContent = doc?.description || '';
    }

    // 3. Call the AI gateway
    const { getGateway } = await import('../services/ai-gateway/gateway.js');
    const gw = getGateway();
    if (gw.getEnabledProviders().length === 0) {
      return res.status(503).json({ error: 'AI service not configured' });
    }

    const systemPrompt = [
      'You are a senior regulatory medical writer with expertise in FDA and EMA submissions.',
      'A reviewer has left a comment on a document section. Your task is to rewrite the section',
      'to address the reviewer\'s feedback while preserving regulatory accuracy and tone.',
      '',
      'Return your response in this exact JSON format:',
      '{"rewrittenText": "...", "explanation": "..."}',
      '',
      'The rewrittenText should be the improved section content.',
      'The explanation should be 1-2 sentences describing what you changed and why.',
      'Do NOT include any markdown formatting or code fences — return only valid JSON.',
    ].join('\n');

    const userMessage = [
      `Document: "${documentTitle}"`,
      sectionReference ? `Section: ${sectionReference}` : '',
      '',
      highlightedText ? `Highlighted text (the part the reviewer commented on):\n"${highlightedText}"` : '',
      '',
      `Reviewer comment:\n"${comment.content}"`,
      '',
      `Full section content:\n${documentContent.substring(0, 6000)}`,
      '',
      'Please rewrite the section (or the highlighted portion if specified) to address this feedback.',
    ].filter(Boolean).join('\n');

    const gwResponse = await gw.route({
      taskType: 'document_drafting',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.4,
      maxTokens: 4000,
      callerModule: 'comment-routes/address-with-ai',
    });

    const raw = gwResponse.content || '';

    // 4. Parse the AI response
    let rewrittenText = raw;
    let explanation = 'AI rewrote the section to address the reviewer feedback.';

    try {
      // Try to parse as JSON (the AI was instructed to return JSON)
      const cleaned = raw.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(cleaned);
      if (parsed.rewrittenText) rewrittenText = parsed.rewrittenText;
      if (parsed.explanation) explanation = parsed.explanation;
    } catch {
      // If JSON parse fails, use the raw text as the rewrite
      rewrittenText = raw;
    }

    logger.info('Comment addressed with AI', { commentId, userId, documentId: comment.documentId });
    return res.json({
      rewrittenText,
      explanation,
      commentId,
      model: gwResponse.model || 'unknown',
    });
  } catch (error) {
    logger.error('Failed to address comment with AI', { error, commentId });
    return res.status(500).json({ error: 'Failed to generate AI response' });
  }
});

export default router;
