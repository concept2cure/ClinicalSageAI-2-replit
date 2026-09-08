/**
 * Conversation mutations for Concept2Cure projects — create (with fork),
 * append a message, rename, delete. The fourth domain carved out of
 * routes/concept2cure.ts (ledger L53, slice 6), mounted at the same prefix
 * ahead of it with the same middleware chain; the handlers moved verbatim.
 * The conversation LIST is a project read and stays with the project domain.
 *
 * @module server/routes/c2c/conversations
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import * as crypto from 'crypto';
import { db } from '../../db';
import { concept2cureConversations, concept2cureMessages } from '../../../shared/schema';
import { parseIntegerProjectId } from '../../lib/project-id.js';
import { createScopedLogger } from '../../utils/logger';
import { authMiddleware } from '../../auth';
import { requireOrganizationContext, tenantContextMiddleware } from '../../middleware/tenantContext';
import {
  calculateContentHash,
  concept2cureRateLimiter,
  getOrganizationId,
  getUserId,
  logAuditEntry,
  logConcept2cureError,
  paramStr,
  sanitizeContent,
  sendError,
  sendSuccess,
  type Conversation,
  type Message,
} from './shared';
import { verifyProjectAccess } from './project-access';

const logger = createScopedLogger('concept2cure-conversations');
const router = Router();

// The same chain the main router applies, in the same order.
router.use(concept2cureRateLimiter);
router.use(authMiddleware);
router.use(tenantContextMiddleware);
router.use(requireOrganizationContext);

const createConversationSchema = z.object({
  title: z.string().max(200).optional(),
  parentConversationId: z.string().optional(),
  forkMessageIndex: z.number().int().min(0).optional(),
});

const addMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1, 'Message content required').max(100000, 'Message too long'),
  attachments: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().max(255),
        type: z.string().max(100),
        size: z
          .number()
          .int()
          .positive()
          .max(100 * 1024 * 1024), // 100MB max
      })
    )
    .max(10)
    .optional(),
  artifactId: z.string().optional(),
});



/**
 * POST /api/concept2cure/projects/:projectId/conversations
 * Create a new conversation in a project (database-backed).
 */
router.post('/projects/:projectId/conversations', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const numericProjectId = parseIntegerProjectId(req.params.projectId);

    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess || numericProjectId === null) {
      return sendError(res, 404, 'Project not found');
    }

    const data = createConversationSchema.parse(req.body);
    const conversationId = `conv_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

    // If forking, get parent conversation messages first
    let messagesToCopy: Message[] = [];
    let parentDbId: number | null = null;

    if (data.parentConversationId && data.forkMessageIndex !== undefined) {
      const [parentConv] = await db
        .select()
        .from(concept2cureConversations)
        .where(
          and(
            eq(concept2cureConversations.conversationId, data.parentConversationId),
            eq(concept2cureConversations.organizationId, organizationId)
          )
        )
        .limit(1);

      if (parentConv) {
        parentDbId = parentConv.id;
        const parentMessages = await db
          .select()
          .from(concept2cureMessages)
          .where(eq(concept2cureMessages.conversationId, parentConv.id))
          .orderBy(concept2cureMessages.createdAt)
          .limit(data.forkMessageIndex + 1);

        messagesToCopy = parentMessages.map(m => ({
          id: `msg_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: m.createdAt,
          attachments: m.attachments as Message['attachments'],
        }));
      }
    }

    // Create conversation in database
    const [newDbConversation] = await db
      .insert(concept2cureConversations)
      .values({
        organizationId,
        projectId: numericProjectId,
        conversationId,
        title: data.title || `Conversation ${Date.now()}`,
        createdById: userId,
        parentConversationId: parentDbId,
        forkMessageIndex: data.forkMessageIndex,
        status: 'active',
      })
      .returning();

    // Batch insert forked messages (single round-trip instead of N)
    if (messagesToCopy.length > 0) {
      await db.insert(concept2cureMessages).values(
        messagesToCopy.map(msg => ({
          organizationId,
          conversationId: newDbConversation.id,
          messageId: msg.id,
          role: msg.role,
          content: msg.content,
          contentHash: calculateContentHash(msg.content),
          attachments: msg.attachments || null,
          createdById: userId,
        }))
      );
    }

    const newConversation: Conversation = {
      id: conversationId,
      projectId: paramStr(req.params.projectId),
      title: newDbConversation.title,
      messages: messagesToCopy,
      parentConversationId: data.parentConversationId,
      forkMessageIndex: data.forkMessageIndex,
      createdAt: newDbConversation.createdAt,
      updatedAt: newDbConversation.updatedAt,
    };

    // Log audit entry
    await logAuditEntry(req, 'CREATE', 'conversation', conversationId, null, {
      projectId: paramStr(req.params.projectId),
      title: newConversation.title,
      forkedFrom: data.parentConversationId,
    });

    logger.info('Created conversation', { projectId: req.params.projectId, conversationId });
    return sendSuccess(res.status(201), newConversation);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation failed', error.errors, 'VALIDATION_ERROR');
    }
    logConcept2cureError('create conversation', error, { projectId: req.params.projectId });
    return sendError(res, 500, 'Failed to create conversation');
  }
});

/**
 * POST /api/concept2cure/projects/:projectId/conversations/:conversationId/messages
 * Add a message to a conversation (database-backed with content integrity hash).
 */
router.post(
  '/projects/:projectId/conversations/:conversationId/messages',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const userId = getUserId(req);

      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) {
        return sendError(res, 404, 'Project not found');
      }

      const data = addMessageSchema.parse(req.body);

      // Find conversation in database
      const [dbConversation] = await db
        .select()
        .from(concept2cureConversations)
        .where(
          and(
            eq(concept2cureConversations.conversationId, paramStr(req.params.conversationId)),
            eq(concept2cureConversations.organizationId, organizationId),
            eq(concept2cureConversations.status, 'active')
          )
        )
        .limit(1);

      if (!dbConversation) {
        return sendError(res, 404, 'Conversation not found');
      }

      // Sanitize message content
      const sanitizedContent = sanitizeContent(data.content);
      const contentHash = calculateContentHash(sanitizedContent);

      // Ensure attachments are properly typed
      const attachments = data.attachments?.map(att => ({
        id: att.id,
        name: att.name,
        type: att.type,
        size: att.size,
      }));

      const messageId = `msg_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

      // Insert message into database
      const [newDbMessage] = await db
        .insert(concept2cureMessages)
        .values({
          organizationId,
          conversationId: dbConversation.id,
          messageId,
          role: data.role,
          content: sanitizedContent,
          contentHash,
          attachments: attachments || null,
          artifactId: data.artifactId || null,
        })
        .returning();

      // Update conversation timestamp
      await db
        .update(concept2cureConversations)
        .set({ updatedAt: new Date() })
        .where(eq(concept2cureConversations.id, dbConversation.id));

      const newMessage: Message = {
        id: messageId,
        role: data.role,
        content: sanitizedContent,
        timestamp: newDbMessage.createdAt,
        attachments,
        artifactId: data.artifactId,
      };

      // Log audit entry with content hash for integrity verification
      await logAuditEntry(req, 'CREATE', 'message', messageId, null, {
        conversationId: paramStr(req.params.conversationId),
        role: newMessage.role,
        contentLength: sanitizedContent.length,
        contentHash,
      });

      return sendSuccess(res.status(201), newMessage);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return sendError(res, 400, 'Validation failed', error.errors, 'VALIDATION_ERROR');
      }
      logConcept2cureError('add message', error, { conversationId: req.params.conversationId });
      return sendError(res, 500, 'Failed to add message');
    }
  }
);

/**
 * PATCH /api/concept2cure/projects/:projectId/conversations/:conversationId
 * Update mutable conversation metadata (currently title).
 */
router.patch(
  '/projects/:projectId/conversations/:conversationId',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const numericProjectId = parseIntegerProjectId(req.params.projectId);
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess || numericProjectId === null) {
        return sendError(res, 404, 'Project not found');
      }

      const payload = z
        .object({
          title: z.string().min(1).max(200),
        })
        .parse(req.body);

      const [dbConversation] = await db
        .select()
        .from(concept2cureConversations)
        .where(
          and(
            eq(concept2cureConversations.conversationId, paramStr(req.params.conversationId)),
            eq(concept2cureConversations.projectId, numericProjectId),
            eq(concept2cureConversations.organizationId, organizationId),
            eq(concept2cureConversations.status, 'active')
          )
        )
        .limit(1);

      if (!dbConversation) {
        return sendError(res, 404, 'Conversation not found');
      }

      const [updated] = await db
        .update(concept2cureConversations)
        .set({
          title: sanitizeContent(payload.title.trim()),
          updatedAt: new Date(),
        })
        .where(eq(concept2cureConversations.id, dbConversation.id))
        .returning();

      await logAuditEntry(
        req,
        'UPDATE',
        'conversation',
        req.params.conversationId,
        dbConversation,
        {
          title: updated.title,
        }
      );

      return sendSuccess(res, {
        id: updated.conversationId,
        projectId: paramStr(req.params.projectId),
        title: updated.title,
        updatedAt: updated.updatedAt,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return sendError(res, 400, 'Validation failed', error.errors, 'VALIDATION_ERROR');
      }
      logConcept2cureError('update conversation', error, {
        projectId: paramStr(req.params.projectId),
        conversationId: paramStr(req.params.conversationId),
      });
      return sendError(res, 500, 'Failed to update conversation');
    }
  }
);

/**
 * DELETE /api/concept2cure/projects/:projectId/conversations/:conversationId
 * Soft-delete a conversation (status -> archived).
 */
router.delete(
  '/projects/:projectId/conversations/:conversationId',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const numericProjectId = parseIntegerProjectId(req.params.projectId);
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess || numericProjectId === null) {
        return sendError(res, 404, 'Project not found');
      }

      const [dbConversation] = await db
        .select()
        .from(concept2cureConversations)
        .where(
          and(
            eq(concept2cureConversations.conversationId, paramStr(req.params.conversationId)),
            eq(concept2cureConversations.projectId, numericProjectId),
            eq(concept2cureConversations.organizationId, organizationId),
            eq(concept2cureConversations.status, 'active')
          )
        )
        .limit(1);

      if (!dbConversation) {
        return sendError(res, 404, 'Conversation not found');
      }

      await db
        .update(concept2cureConversations)
        .set({
          status: 'archived',
          updatedAt: new Date(),
        })
        .where(eq(concept2cureConversations.id, dbConversation.id));

      await logAuditEntry(
        req,
        'DELETE',
        'conversation',
        req.params.conversationId,
        dbConversation,
        null
      );
      return sendSuccess(res, {
        conversationId: paramStr(req.params.conversationId),
        archived: true,
      });
    } catch (error: any) {
      logConcept2cureError('delete conversation', error, {
        projectId: paramStr(req.params.projectId),
        conversationId: paramStr(req.params.conversationId),
      });
      return sendError(res, 500, 'Failed to delete conversation');
    }
  }
);

export default router;
