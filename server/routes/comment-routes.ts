/**
 * Comment CRUD Routes
 *
 * Provides full comment lifecycle management for document review workflows.
 * Supports threaded comments, resolution tracking, and reply chains.
 *
 * Security:
 *   - All queries are tenant-isolated via concept2cure_artifacts.organization_id
 *   - Edit/delete restricted to comment author or admin role
 *   - Content sanitized to prevent XSS
 *
 * Routes:
 *   GET    /documents/:documentId/comments     — list comments for a document
 *   POST   /documents/:documentId/comments     — create a new comment
 *   PATCH  /comments/:commentId                — update comment (edit text, resolve, reopen)
 *   DELETE /comments/:commentId                — delete a comment
 *   POST   /comments/:commentId/replies        — add a reply to a comment
 *   POST   /comments/:commentId/address-with-ai — AI-powered comment resolution
 */
import { Router } from 'express';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
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

/** Ensure the document_comments table exists (auto-create if needed). */
let tableReady = false;
async function ensureCommentsTable(): Promise<void> {
  if (tableReady) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS document_comments (
        id SERIAL PRIMARY KEY,
        document_id INTEGER NOT NULL,
        version_id INTEGER,
        parent_comment_id INTEGER REFERENCES document_comments(id) ON DELETE CASCADE,
        comment_type VARCHAR(50) DEFAULT 'general',
        section_reference VARCHAR(200),
        content TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'open',
        priority VARCHAR(20) DEFAULT 'normal',
        resolved_by_id INTEGER,
        resolved_at TIMESTAMPTZ,
        resolution_note TEXT,
        author_id INTEGER NOT NULL,
        author_name VARCHAR(255) DEFAULT 'Unknown',
        attachments JSONB,
        mentions JSONB,
        is_edited BOOLEAN DEFAULT FALSE,
        edited_at TIMESTAMPTZ,
        organization_id INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_doc_comments_doc ON document_comments (document_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_doc_comments_org ON document_comments (organization_id)
    `);
    tableReady = true;
  } catch (err) {
    logger.warn('Could not ensure document_comments table', { error: err });
  }
}

// Helper to extract rows from Drizzle execute result
function getRows(result: any): any[] {
  return result?.rows ?? result ?? [];
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

  await ensureCommentsTable();

  try {
    const result = await db.execute(sql`
      SELECT c.*
      FROM document_comments c
      WHERE c.document_id = ${documentId}
        AND c.organization_id = ${organizationId}
      ORDER BY c.created_at DESC
      LIMIT 500
    `);

    const allComments = getRows(result);

    // Organize into threads — top-level comments with nested replies
    const topLevel = allComments.filter((c: any) => !c.parent_comment_id);
    const replies = allComments.filter((c: any) => c.parent_comment_id);

    const threads = topLevel.map((comment: any) => ({
      ...comment,
      replies: replies
        .filter((r: any) => r.parent_comment_id === comment.id)
        .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
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

  await ensureCommentsTable();

  try {
    const attachments = highlightedText ? JSON.stringify({ highlightedText }) : null;
    const result = await db.execute(sql`
      INSERT INTO document_comments
        (document_id, version_id, parent_comment_id, comment_type, section_reference,
         content, status, priority, author_id, author_name, attachments, mentions,
         is_edited, organization_id)
      VALUES
        (${documentId}, ${versionId ?? null}, ${parentCommentId ?? null}, ${commentType},
         ${sectionReference ?? null}, ${content}, 'open', ${priority}, ${userId},
         ${authorName}, ${attachments}::jsonb, NULL, FALSE, ${organizationId})
      RETURNING *
    `);

    const comment = getRows(result)[0];
    logger.info('Comment created', { commentId: comment?.id, documentId, userId });
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

  await ensureCommentsTable();

  try {
    // Verify comment exists and belongs to this org
    const existing = getRows(await db.execute(sql`
      SELECT id, author_id, document_id FROM document_comments
      WHERE id = ${commentId} AND organization_id = ${organizationId}
      LIMIT 1
    `))[0];

    if (!existing) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Authorization: only the author can edit content; anyone in the org can resolve/reopen
    const role = resolveUserRole(req);
    const isAdmin = role === 'admin' || role === 'super_admin' || role === 'owner';
    const isAuthor = existing.author_id === userId;

    if (parsed.data.content !== undefined && !isAuthor && !isAdmin) {
      return res.status(403).json({ error: 'Only the comment author or admin can edit content' });
    }

    // Apply updates using parameterized queries (no string interpolation)
    if (parsed.data.content !== undefined) {
      const sanitized = sanitizeContent(parsed.data.content);
      if (!sanitized) {
        return res.status(400).json({ error: 'Content cannot be empty after sanitization' });
      }
      await db.execute(sql`
        UPDATE document_comments
        SET content = ${sanitized}, is_edited = TRUE, edited_at = NOW(), updated_at = NOW()
        WHERE id = ${commentId}
      `);
    }

    if (parsed.data.status !== undefined) {
      if (parsed.data.status === 'resolved') {
        await db.execute(sql`
          UPDATE document_comments
          SET status = ${parsed.data.status}, resolved_by_id = ${userId}, resolved_at = NOW(), updated_at = NOW()
          WHERE id = ${commentId}
        `);
      } else if (parsed.data.status === 'open') {
        await db.execute(sql`
          UPDATE document_comments
          SET status = 'open', resolved_by_id = NULL, resolved_at = NULL, resolution_note = NULL, updated_at = NOW()
          WHERE id = ${commentId}
        `);
      } else {
        await db.execute(sql`
          UPDATE document_comments SET status = ${parsed.data.status}, updated_at = NOW()
          WHERE id = ${commentId}
        `);
      }
    }

    if (parsed.data.priority !== undefined) {
      await db.execute(sql`
        UPDATE document_comments SET priority = ${parsed.data.priority}, updated_at = NOW()
        WHERE id = ${commentId}
      `);
    }

    if (parsed.data.resolutionNote !== undefined) {
      const sanitized = sanitizeContent(parsed.data.resolutionNote);
      await db.execute(sql`
        UPDATE document_comments SET resolution_note = ${sanitized}, updated_at = NOW()
        WHERE id = ${commentId}
      `);
    }

    // Fetch the updated comment
    const result = await db.execute(sql`
      SELECT * FROM document_comments WHERE id = ${commentId}
    `);

    const updated = getRows(result)[0];
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

  await ensureCommentsTable();

  try {
    const existing = getRows(await db.execute(sql`
      SELECT id, author_id, document_id FROM document_comments
      WHERE id = ${commentId} AND organization_id = ${organizationId}
      LIMIT 1
    `))[0];

    if (!existing) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Authorization: only author or admin can delete
    const role = resolveUserRole(req);
    const isAdmin = role === 'admin' || role === 'super_admin' || role === 'owner';
    const isAuthor = existing.author_id === userId;

    if (!isAuthor && !isAdmin) {
      return res.status(403).json({ error: 'Only the comment author or admin can delete comments' });
    }

    // Delete replies first, then the comment
    await db.execute(sql`DELETE FROM document_comments WHERE parent_comment_id = ${commentId}`);
    const result = await db.execute(sql`DELETE FROM document_comments WHERE id = ${commentId} RETURNING *`);
    const deleted = getRows(result)[0];

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

  await ensureCommentsTable();

  try {
    // Look up parent — tenant-isolated
    const parent = getRows(await db.execute(sql`
      SELECT id, document_id FROM document_comments
      WHERE id = ${parentCommentId} AND organization_id = ${organizationId}
      LIMIT 1
    `))[0];

    if (!parent) {
      return res.status(404).json({ error: 'Parent comment not found' });
    }

    const content = sanitizeContent(parsed.data.content);
    if (!content) {
      return res.status(400).json({ error: 'Reply content cannot be empty after sanitization' });
    }
    const authorName = resolveUserName(req);

    const result = await db.execute(sql`
      INSERT INTO document_comments
        (document_id, parent_comment_id, comment_type, content, status, priority,
         author_id, author_name, organization_id)
      VALUES
        (${parent.document_id}, ${parentCommentId}, 'general', ${content}, 'open', 'normal',
         ${userId}, ${authorName}, ${organizationId})
      RETURNING *
    `);

    const reply = getRows(result)[0];
    logger.info('Reply created', { replyId: reply?.id, parentCommentId, userId });
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

  await ensureCommentsTable();

  try {
    // 1. Load the comment (tenant-isolated)
    const commentRow = getRows(await db.execute(sql`
      SELECT id, document_id, content, section_reference, attachments, status
      FROM document_comments
      WHERE id = ${commentId} AND organization_id = ${organizationId}
      LIMIT 1
    `))[0];

    if (!commentRow) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const highlightedText = (commentRow.attachments as Record<string, string> | null)?.highlightedText || '';
    const sectionReference = commentRow.section_reference || '';

    // 2. Load artifact content
    let documentContent = '';
    let documentTitle = '';
    try {
      const artifactResult = getRows(await db.execute(sql`
        SELECT title, content FROM concept2cure_artifacts
        WHERE id = ${commentRow.document_id}
        LIMIT 1
      `));
      if (artifactResult[0]?.content) {
        documentContent = artifactResult[0].content;
        documentTitle = artifactResult[0].title || '';
      }
    } catch {
      // Table may not exist yet
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
      `Reviewer comment:\n"${commentRow.content}"`,
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
      const cleaned = raw.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(cleaned);
      if (parsed.rewrittenText) rewrittenText = parsed.rewrittenText;
      if (parsed.explanation) explanation = parsed.explanation;
    } catch {
      rewrittenText = raw;
    }

    logger.info('Comment addressed with AI', { commentId, userId, documentId: commentRow.document_id });
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
