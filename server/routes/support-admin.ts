/**
 * Support Administration API Routes
 *
 * Provides endpoints for:
 * - Support ticket CRUD & lifecycle management
 * - Ticket message threads (customer & internal notes)
 * - Knowledge base article management
 * - Per-org support settings & SLA configuration
 * - Support analytics / dashboard metrics
 *
 * All endpoints are tenant-scoped via req.user.organizationId.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';

const router = Router();
const ANALYTICS_CACHE_TTL_MS = 20_000;
const MAX_ANALYTICS_CACHE_ENTRIES = 500;
const supportAnalyticsCache = new Map<string, { expiresAt: number; payload: unknown }>();

// ============================================================
// VALIDATION SCHEMAS
// ============================================================

const createTicketSchema = z.object({
  subject: z.string().min(1).max(500),
  description: z.string().min(1),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  category: z
    .enum(['general', 'billing', 'technical', 'feature_request', 'bug_report', 'account', 'compliance', 'integration'])
    .default('general'),
  assignedToId: z.number().int().positive().optional(),
  tags: z.array(z.string()).optional(),
});

const updateTicketSchema = z.object({
  subject: z.string().min(1).max(500).optional(),
  status: z
    .enum(['open', 'in_progress', 'waiting_on_customer', 'waiting_on_internal', 'escalated', 'resolved', 'closed'])
    .optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  category: z
    .enum(['general', 'billing', 'technical', 'feature_request', 'bug_report', 'account', 'compliance', 'integration'])
    .optional(),
  assignedToId: z.number().int().positive().nullable().optional(),
  tags: z.array(z.string()).optional(),
  internalNotes: z.string().optional(),
  satisfactionRating: z.number().int().min(1).max(5).optional(),
  satisfactionFeedback: z.string().optional(),
});

const createMessageSchema = z.object({
  content: z.string().min(1),
  isInternal: z.boolean().default(false),
  attachments: z
    .array(z.object({ name: z.string(), url: z.string(), size: z.number() }))
    .optional(),
});

const createArticleSchema = z.object({
  title: z.string().min(1).max(500),
  slug: z.string().min(1).max(500),
  content: z.string().min(1),
  excerpt: z.string().optional(),
  category: z.string().default('general'),
  tags: z.array(z.string()).optional(),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  isGlobal: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

const updateArticleSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  slug: z.string().min(1).max(500).optional(),
  content: z.string().min(1).optional(),
  excerpt: z.string().nullable().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  isGlobal: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const updateSettingsSchema = z.object({
  autoAssignEnabled: z.boolean().optional(),
  slaResponseHours: z.number().int().positive().optional(),
  slaResolutionHours: z.number().int().positive().optional(),
  notifyOnNewTicket: z.boolean().optional(),
  notifyOnTicketUpdate: z.boolean().optional(),
  customCategories: z.array(z.string()).optional(),
  businessHours: z
    .object({
      timezone: z.string(),
      schedule: z.record(
        z.union([z.object({ start: z.string(), end: z.string() }), z.null()])
      ),
    })
    .optional(),
  escalationRules: z
    .array(
      z.object({
        conditionField: z.string(),
        conditionValue: z.string(),
        action: z.string(),
        targetUserId: z.number().int().positive().optional(),
      })
    )
    .optional(),
  satisfactionSurveyEnabled: z.boolean().optional(),
});

// ============================================================
// HELPERS
// ============================================================

function getOrgId(req: Request): number | null {
  const orgId = req.user?.organizationId || req.tenantId;
  if (!orgId) return null;
  return typeof orgId === 'string' ? parseInt(orgId, 10) : (orgId as number);
}

function getUserId(req: Request): number | null {
  const uid = req.user?.userId || req.user?.id || req.userId;
  if (!uid) return null;
  return typeof uid === 'string' ? parseInt(uid, 10) : (uid as number);
}

function getCachedSupportAnalytics(cacheKey: string): unknown | null {
  const cached = supportAnalyticsCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    supportAnalyticsCache.delete(cacheKey);
    return null;
  }
  return cached.payload;
}

function setCachedSupportAnalytics(cacheKey: string, payload: unknown): void {
  while (supportAnalyticsCache.size >= MAX_ANALYTICS_CACHE_ENTRIES) {
    const oldestKey = supportAnalyticsCache.keys().next().value;
    if (!oldestKey) break;
    supportAnalyticsCache.delete(oldestKey);
  }
  supportAnalyticsCache.set(cacheKey, {
    expiresAt: Date.now() + ANALYTICS_CACHE_TTL_MS,
    payload,
  });
}

function invalidateSupportAnalyticsCacheForOrg(orgId: number): void {
  const orgScope = `:${orgId}:`;
  for (const cacheKey of supportAnalyticsCache.keys()) {
    if (cacheKey.includes(orgScope)) {
      supportAnalyticsCache.delete(cacheKey);
    }
  }
}

/** Generate a unique ticket number using a PostgreSQL sequence (atomic, race-free) */
async function generateTicketNumber(): Promise<string> {
  if (!pool) throw new Error('Database not available');
  const result = await pool.query(
    `SELECT nextval('support_ticket_number_seq')::int AS num`
  );
  return `TKT-${String(result.rows[0].num).padStart(6, '0')}`;
}

// ============================================================
// TICKET ENDPOINTS
// ============================================================

/**
 * GET /api/support/tickets
 * List tickets for the organization.
 * Query params: status, priority, category, assignedToId, page, limit
 */
router.get('/tickets', async (req: Request, res: Response) => {
  try {
    if (!pool) return res.status(500).json({ error: 'Database not available' });
    const orgId = getOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'Organization context required' });

    const { status, priority, category, assignedToId, page = '1', limit = '25' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 25));
    const offset = (pageNum - 1) * limitNum;

    let whereClauses = ['t.organization_id = $1'];
    const params: unknown[] = [orgId];
    let paramIdx = 2;

    if (status) {
      whereClauses.push(`t.status = $${paramIdx}`);
      params.push(status);
      paramIdx++;
    }
    if (priority) {
      whereClauses.push(`t.priority = $${paramIdx}`);
      params.push(priority);
      paramIdx++;
    }
    if (category) {
      whereClauses.push(`t.category = $${paramIdx}`);
      params.push(category);
      paramIdx++;
    }
    if (assignedToId) {
      whereClauses.push(`t.assigned_to_id = $${paramIdx}`);
      params.push(parseInt(assignedToId as string, 10));
      paramIdx++;
    }

    const whereSQL = whereClauses.join(' AND ');
    const dataParams = [...params, limitNum, offset];

    // Run count and data queries in parallel
    const [countResult, dataResult] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total FROM support_tickets t WHERE ${whereSQL}`,
        params
      ),
      pool.query(
        `SELECT
          t.id, t.ticket_number AS "ticketNumber", t.subject, t.status, t.priority, t.category,
          t.tags, t.assigned_to_id AS "assignedToId", t.created_by_id AS "createdById",
          t.sla_response_due AS "slaResponseDue", t.sla_resolution_due AS "slaResolutionDue",
          t.first_response_at AS "firstResponseAt", t.resolved_at AS "resolvedAt",
          t.satisfaction_rating AS "satisfactionRating",
          t.created_at AS "createdAt", t.updated_at AS "updatedAt",
          u.name AS "createdByName", u.email AS "createdByEmail",
          a.name AS "assignedToName"
        FROM support_tickets t
        LEFT JOIN users u ON u.id = t.created_by_id
        LEFT JOIN users a ON a.id = t.assigned_to_id
        WHERE ${whereSQL}
        ORDER BY
          CASE t.priority
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            WHEN 'low' THEN 4
          END,
          t.created_at DESC
        LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        dataParams
      ),
    ]);
    const total = countResult.rows[0]?.total || 0;

    res.json({
      tickets: dataResult.rows,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (error) {
    console.error('Error listing support tickets:', error);
    res.status(500).json({ error: 'Failed to list support tickets' });
  }
});

/**
 * GET /api/support/tickets/:id
 * Get a single ticket with messages.
 */
router.get('/tickets/:id', async (req: Request, res: Response) => {
  try {
    if (!pool) return res.status(500).json({ error: 'Database not available' });
    const orgId = getOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'Organization context required' });

    const ticketId = parseInt(req.params.id, 10);
    if (isNaN(ticketId)) return res.status(400).json({ error: 'Invalid ticket ID' });

    // Fetch ticket and messages in parallel
    const [ticketResult, messagesResult] = await Promise.all([
      pool.query(
        `SELECT
          t.*, t.ticket_number AS "ticketNumber", t.created_by_id AS "createdById",
          t.assigned_to_id AS "assignedToId", t.internal_notes AS "internalNotes",
          t.sla_response_due AS "slaResponseDue", t.sla_resolution_due AS "slaResolutionDue",
          t.first_response_at AS "firstResponseAt", t.resolved_at AS "resolvedAt",
          t.closed_at AS "closedAt", t.satisfaction_rating AS "satisfactionRating",
          t.satisfaction_feedback AS "satisfactionFeedback",
          t.created_at AS "createdAt", t.updated_at AS "updatedAt",
          u.name AS "createdByName", u.email AS "createdByEmail",
          a.name AS "assignedToName"
        FROM support_tickets t
        LEFT JOIN users u ON u.id = t.created_by_id
        LEFT JOIN users a ON a.id = t.assigned_to_id
        WHERE t.id = $1 AND t.organization_id = $2`,
        [ticketId, orgId]
      ),
      pool.query(
        `SELECT
          m.id, m.content, m.is_internal AS "isInternal", m.attachments,
          m.created_at AS "createdAt",
          u.id AS "userId", u.name AS "userName", u.email AS "userEmail", u.avatar AS "userAvatar"
        FROM support_ticket_messages m
        LEFT JOIN users u ON u.id = m.user_id
        WHERE m.ticket_id = $1
        ORDER BY m.created_at ASC`,
        [ticketId]
      ),
    ]);

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    res.json({
      ...ticketResult.rows[0],
      messages: messagesResult.rows,
    });
  } catch (error) {
    console.error('Error fetching support ticket:', error);
    res.status(500).json({ error: 'Failed to fetch support ticket' });
  }
});

/**
 * POST /api/support/tickets
 * Create a new support ticket.
 */
router.post('/tickets', async (req: Request, res: Response) => {
  try {
    if (!pool) return res.status(500).json({ error: 'Database not available' });
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    if (!orgId || !userId) return res.status(400).json({ error: 'Organization and user context required' });

    const data = createTicketSchema.parse(req.body);

    // Fetch ticket number and SLA settings in parallel
    const [ticketNumber, settingsResult] = await Promise.all([
      generateTicketNumber(),
      pool.query(
        `SELECT sla_response_hours, sla_resolution_hours FROM support_settings WHERE organization_id = $1`,
        [orgId]
      ),
    ]);
    const slaResponseHours = settingsResult.rows[0]?.sla_response_hours ?? 24;
    const slaResolutionHours = settingsResult.rows[0]?.sla_resolution_hours ?? 72;

    const result = await pool.query(
      `INSERT INTO support_tickets
        (organization_id, created_by_id, assigned_to_id, ticket_number, subject, description,
         status, priority, category, tags, sla_response_due, sla_resolution_due, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'open', $7, $8, $9,
              NOW() + ($10 || ' hours')::interval,
              NOW() + ($11 || ' hours')::interval,
              NOW(), NOW())
      RETURNING *,
        ticket_number AS "ticketNumber",
        created_by_id AS "createdById",
        assigned_to_id AS "assignedToId",
        sla_response_due AS "slaResponseDue",
        sla_resolution_due AS "slaResolutionDue",
        created_at AS "createdAt",
        updated_at AS "updatedAt"`,
      [
        orgId, userId, data.assignedToId || null, ticketNumber, data.subject, data.description,
        data.priority, data.category, JSON.stringify(data.tags || []),
        String(slaResponseHours), String(slaResolutionHours),
      ]
    );

    console.log(`Support ticket ${ticketNumber} created by user ${userId} in org ${orgId}`);
    invalidateSupportAnalyticsCacheForOrg(orgId);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating support ticket:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid ticket data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create support ticket' });
  }
});

/**
 * PATCH /api/support/tickets/:id
 * Update a support ticket (status, priority, assignment, etc).
 */
router.patch('/tickets/:id', async (req: Request, res: Response) => {
  try {
    if (!pool) return res.status(500).json({ error: 'Database not available' });
    const orgId = getOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'Organization context required' });

    const ticketId = parseInt(req.params.id, 10);
    if (isNaN(ticketId)) return res.status(400).json({ error: 'Invalid ticket ID' });

    const data = updateTicketSchema.parse(req.body);

    // Build dynamic SET clause
    const setClauses: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let idx = 1;

    const fieldMap: Record<string, string> = {
      subject: 'subject',
      status: 'status',
      priority: 'priority',
      category: 'category',
      assignedToId: 'assigned_to_id',
      tags: 'tags',
      internalNotes: 'internal_notes',
      satisfactionRating: 'satisfaction_rating',
      satisfactionFeedback: 'satisfaction_feedback',
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if ((data as Record<string, unknown>)[key] !== undefined) {
        let value = (data as Record<string, unknown>)[key];
        if (key === 'tags') value = JSON.stringify(value);
        setClauses.push(`${column} = $${idx}`);
        params.push(value);
        idx++;
      }
    }

    // Handle status-specific timestamps
    if (data.status === 'resolved') {
      setClauses.push(`resolved_at = NOW()`);
    }
    if (data.status === 'closed') {
      setClauses.push(`closed_at = NOW()`);
    }

    params.push(ticketId, orgId);

    const result = await pool.query(
      `UPDATE support_tickets SET ${setClauses.join(', ')}
       WHERE id = $${idx} AND organization_id = $${idx + 1}
       RETURNING *,
        ticket_number AS "ticketNumber",
        created_by_id AS "createdById",
        assigned_to_id AS "assignedToId",
        sla_response_due AS "slaResponseDue",
        sla_resolution_due AS "slaResolutionDue",
        first_response_at AS "firstResponseAt",
        resolved_at AS "resolvedAt",
        closed_at AS "closedAt",
        satisfaction_rating AS "satisfactionRating",
        satisfaction_feedback AS "satisfactionFeedback",
        created_at AS "createdAt",
        updated_at AS "updatedAt"`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    invalidateSupportAnalyticsCacheForOrg(orgId);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating support ticket:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid ticket data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update support ticket' });
  }
});

/**
 * DELETE /api/support/tickets/:id
 * Delete a support ticket (admin only).
 */
router.delete('/tickets/:id', async (req: Request, res: Response) => {
  try {
    if (!pool) return res.status(500).json({ error: 'Database not available' });
    const orgId = getOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'Organization context required' });

    // Only admins can delete tickets
    const role = req.user?.role || req.userRole;
    if (role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can delete tickets' });
    }

    const ticketId = parseInt(req.params.id, 10);
    if (isNaN(ticketId)) return res.status(400).json({ error: 'Invalid ticket ID' });

    // Use a transaction to ensure atomicity and verify ownership before deleting messages
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ticketResult = await client.query(
        `DELETE FROM support_tickets WHERE id = $1 AND organization_id = $2 RETURNING id`,
        [ticketId, orgId]
      );
      if (ticketResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Ticket not found' });
      }
      await client.query(`DELETE FROM support_ticket_messages WHERE ticket_id = $1`, [ticketId]);
      await client.query('COMMIT');
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }

    invalidateSupportAnalyticsCacheForOrg(orgId);
    res.json({ message: 'Ticket deleted successfully' });
  } catch (error) {
    console.error('Error deleting support ticket:', error);
    res.status(500).json({ error: 'Failed to delete support ticket' });
  }
});

// ============================================================
// TICKET MESSAGES
// ============================================================

/**
 * POST /api/support/tickets/:id/messages
 * Add a message/reply to a ticket thread.
 */
router.post('/tickets/:id/messages', async (req: Request, res: Response) => {
  try {
    if (!pool) return res.status(500).json({ error: 'Database not available' });
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    if (!orgId || !userId) return res.status(400).json({ error: 'Organization and user context required' });

    const ticketId = parseInt(req.params.id, 10);
    if (isNaN(ticketId)) return res.status(400).json({ error: 'Invalid ticket ID' });

    // Verify ticket belongs to this org
    const ticketCheck = await pool.query(
      `SELECT id, first_response_at FROM support_tickets WHERE id = $1 AND organization_id = $2`,
      [ticketId, orgId]
    );
    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const data = createMessageSchema.parse(req.body);

    const result = await pool.query(
      `INSERT INTO support_ticket_messages (ticket_id, user_id, is_internal, content, attachments, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *, is_internal AS "isInternal", created_at AS "createdAt"`,
      [ticketId, userId, data.isInternal, data.content, JSON.stringify(data.attachments || [])]
    );

    // Update ticket: always refresh updated_at, conditionally set first_response_at
    await pool.query(
      `UPDATE support_tickets SET
        updated_at = NOW(),
        first_response_at = CASE
          WHEN first_response_at IS NULL AND $2 = false THEN NOW()
          ELSE first_response_at
        END
      WHERE id = $1`,
      [ticketId, data.isInternal]
    );

    invalidateSupportAnalyticsCacheForOrg(orgId);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding ticket message:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid message data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to add ticket message' });
  }
});

// ============================================================
// KNOWLEDGE BASE ARTICLES
// ============================================================

/**
 * GET /api/support/articles
 * List knowledge base articles. Supports filtering by status, category, and search.
 */
router.get('/articles', async (req: Request, res: Response) => {
  try {
    if (!pool) return res.status(500).json({ error: 'Database not available' });
    const orgId = getOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'Organization context required' });

    const { status, category, search, page = '1', limit = '25' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 25));
    const offset = (pageNum - 1) * limitNum;

    let whereClauses = ['(a.organization_id = $1 OR a.is_global = true)'];
    const params: unknown[] = [orgId];
    let paramIdx = 2;

    if (status) {
      whereClauses.push(`a.status = $${paramIdx}`);
      params.push(status);
      paramIdx++;
    }
    if (category) {
      whereClauses.push(`a.category = $${paramIdx}`);
      params.push(category);
      paramIdx++;
    }
    if (search) {
      whereClauses.push(`(a.title ILIKE $${paramIdx} OR a.content ILIKE $${paramIdx} OR a.excerpt ILIKE $${paramIdx})`);
      params.push(`%${search}%`);
      paramIdx++;
    }

    const whereSQL = whereClauses.join(' AND ');
    const dataParams = [...params, limitNum, offset];

    // Run count and data queries in parallel
    const [countResult, dataResult] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total FROM support_articles a WHERE ${whereSQL}`,
        params
      ),
      pool.query(
        `SELECT
          a.id, a.title, a.slug, a.excerpt, a.category, a.tags, a.status,
          a.is_global AS "isGlobal", a.sort_order AS "sortOrder",
          a.view_count AS "viewCount", a.helpful_count AS "helpfulCount",
          a.not_helpful_count AS "notHelpfulCount",
          a.published_at AS "publishedAt", a.created_at AS "createdAt", a.updated_at AS "updatedAt",
          u.name AS "authorName"
        FROM support_articles a
        LEFT JOIN users u ON u.id = a.author_id
        WHERE ${whereSQL}
        ORDER BY a.sort_order ASC, a.created_at DESC
        LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        dataParams
      ),
    ]);
    const total = countResult.rows[0]?.total || 0;

    res.json({
      articles: dataResult.rows,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (error) {
    console.error('Error listing support articles:', error);
    res.status(500).json({ error: 'Failed to list support articles' });
  }
});

/**
 * GET /api/support/articles/:id
 * Get a single article by ID. Increments view count.
 */
router.get('/articles/:id', async (req: Request, res: Response) => {
  try {
    if (!pool) return res.status(500).json({ error: 'Database not available' });
    const orgId = getOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'Organization context required' });

    const articleId = parseInt(req.params.id, 10);
    if (isNaN(articleId)) return res.status(400).json({ error: 'Invalid article ID' });

    // Increment view count and fetch in a single query (avoids blind UPDATE on missing articles)
    const result = await pool.query(
      `WITH updated AS (
        UPDATE support_articles SET view_count = view_count + 1
        WHERE id = $1 AND (organization_id = $2 OR is_global = true)
        RETURNING *
      )
      SELECT
        updated.*, updated.is_global AS "isGlobal", updated.sort_order AS "sortOrder",
        updated.view_count AS "viewCount", updated.helpful_count AS "helpfulCount",
        updated.not_helpful_count AS "notHelpfulCount",
        updated.published_at AS "publishedAt", updated.created_at AS "createdAt", updated.updated_at AS "updatedAt",
        updated.author_id AS "authorId",
        u.name AS "authorName"
      FROM updated
      LEFT JOIN users u ON u.id = updated.author_id`,
      [articleId, orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Article not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching support article:', error);
    res.status(500).json({ error: 'Failed to fetch support article' });
  }
});

/**
 * POST /api/support/articles
 * Create a new knowledge base article.
 */
router.post('/articles', async (req: Request, res: Response) => {
  try {
    if (!pool) return res.status(500).json({ error: 'Database not available' });
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    if (!orgId || !userId) return res.status(400).json({ error: 'Organization and user context required' });

    const data = createArticleSchema.parse(req.body);

    const result = await pool.query(
      `INSERT INTO support_articles
        (organization_id, author_id, title, slug, content, excerpt, category, tags,
         status, is_global, sort_order, published_at, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
      RETURNING *,
        is_global AS "isGlobal", sort_order AS "sortOrder",
        view_count AS "viewCount", helpful_count AS "helpfulCount",
        not_helpful_count AS "notHelpfulCount",
        published_at AS "publishedAt", created_at AS "createdAt", updated_at AS "updatedAt",
        author_id AS "authorId"`,
      [
        orgId, userId, data.title, data.slug, data.content, data.excerpt || null,
        data.category, JSON.stringify(data.tags || []), data.status, data.isGlobal, data.sortOrder,
        data.status === 'published' ? new Date() : null,
      ]
    );

    console.log(`Support article "${data.title}" created by user ${userId} in org ${orgId}`);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating support article:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid article data', details: error.errors });
    }
    // Unique constraint violation (slug)
    if ((error as any)?.code === '23505') {
      return res.status(409).json({ error: 'An article with this slug already exists in this organization' });
    }
    res.status(500).json({ error: 'Failed to create support article' });
  }
});

/**
 * PATCH /api/support/articles/:id
 * Update a knowledge base article.
 */
router.patch('/articles/:id', async (req: Request, res: Response) => {
  try {
    if (!pool) return res.status(500).json({ error: 'Database not available' });
    const orgId = getOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'Organization context required' });

    const articleId = parseInt(req.params.id, 10);
    if (isNaN(articleId)) return res.status(400).json({ error: 'Invalid article ID' });

    const data = updateArticleSchema.parse(req.body);

    const setClauses: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let idx = 1;

    const fieldMap: Record<string, string> = {
      title: 'title',
      slug: 'slug',
      content: 'content',
      excerpt: 'excerpt',
      category: 'category',
      tags: 'tags',
      status: 'status',
      isGlobal: 'is_global',
      sortOrder: 'sort_order',
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if ((data as Record<string, unknown>)[key] !== undefined) {
        let value = (data as Record<string, unknown>)[key];
        if (key === 'tags') value = JSON.stringify(value);
        setClauses.push(`${column} = $${idx}`);
        params.push(value);
        idx++;
      }
    }

    // Set published_at when transitioning to published
    if (data.status === 'published') {
      setClauses.push(`published_at = COALESCE(published_at, NOW())`);
    }

    params.push(articleId, orgId);

    const result = await pool.query(
      `UPDATE support_articles SET ${setClauses.join(', ')}
       WHERE id = $${idx} AND organization_id = $${idx + 1}
       RETURNING *,
        is_global AS "isGlobal", sort_order AS "sortOrder",
        view_count AS "viewCount", helpful_count AS "helpfulCount",
        not_helpful_count AS "notHelpfulCount",
        published_at AS "publishedAt", created_at AS "createdAt", updated_at AS "updatedAt",
        author_id AS "authorId"`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Article not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating support article:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid article data', details: error.errors });
    }
    if ((error as any)?.code === '23505') {
      return res.status(409).json({ error: 'An article with this slug already exists in this organization' });
    }
    res.status(500).json({ error: 'Failed to update support article' });
  }
});

/**
 * DELETE /api/support/articles/:id
 * Delete a knowledge base article.
 */
router.delete('/articles/:id', async (req: Request, res: Response) => {
  try {
    if (!pool) return res.status(500).json({ error: 'Database not available' });
    const orgId = getOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'Organization context required' });

    const articleId = parseInt(req.params.id, 10);
    if (isNaN(articleId)) return res.status(400).json({ error: 'Invalid article ID' });

    const result = await pool.query(
      `DELETE FROM support_articles WHERE id = $1 AND organization_id = $2 RETURNING id`,
      [articleId, orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Article not found' });
    }

    res.json({ message: 'Article deleted successfully' });
  } catch (error) {
    console.error('Error deleting support article:', error);
    res.status(500).json({ error: 'Failed to delete support article' });
  }
});

/**
 * POST /api/support/articles/:id/feedback
 * Submit helpfulness feedback for an article.
 */
router.post('/articles/:id/feedback', async (req: Request, res: Response) => {
  try {
    if (!pool) return res.status(500).json({ error: 'Database not available' });
    const orgId = getOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'Organization context required' });

    const articleId = parseInt(req.params.id, 10);
    if (isNaN(articleId)) return res.status(400).json({ error: 'Invalid article ID' });

    const { helpful } = z.object({ helpful: z.boolean() }).parse(req.body);

    const column = helpful ? 'helpful_count' : 'not_helpful_count';
    const result = await pool.query(
      `UPDATE support_articles SET ${column} = ${column} + 1
       WHERE id = $1 AND (organization_id = $2 OR is_global = true)
       RETURNING helpful_count AS "helpfulCount", not_helpful_count AS "notHelpfulCount"`,
      [articleId, orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Article not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error submitting article feedback:', error);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

// ============================================================
// SUPPORT SETTINGS
// ============================================================

/**
 * GET /api/support/settings
 * Get support settings for the organization.
 */
router.get('/settings', async (req: Request, res: Response) => {
  try {
    if (!pool) return res.status(500).json({ error: 'Database not available' });
    const orgId = getOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'Organization context required' });

    const result = await pool.query(
      `SELECT *,
        auto_assign_enabled AS "autoAssignEnabled",
        sla_response_hours AS "slaResponseHours",
        sla_resolution_hours AS "slaResolutionHours",
        notify_on_new_ticket AS "notifyOnNewTicket",
        notify_on_ticket_update AS "notifyOnTicketUpdate",
        custom_categories AS "customCategories",
        business_hours AS "businessHours",
        escalation_rules AS "escalationRules",
        satisfaction_survey_enabled AS "satisfactionSurveyEnabled",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM support_settings WHERE organization_id = $1`,
      [orgId]
    );

    if (result.rows.length === 0) {
      // Return defaults if no settings exist yet
      return res.json({
        organizationId: orgId,
        autoAssignEnabled: false,
        slaResponseHours: 24,
        slaResolutionHours: 72,
        notifyOnNewTicket: true,
        notifyOnTicketUpdate: true,
        customCategories: [],
        businessHours: null,
        escalationRules: [],
        satisfactionSurveyEnabled: true,
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching support settings:', error);
    res.status(500).json({ error: 'Failed to fetch support settings' });
  }
});

/**
 * PUT /api/support/settings
 * Create or update support settings for the organization (upsert).
 */
router.put('/settings', async (req: Request, res: Response) => {
  try {
    if (!pool) return res.status(500).json({ error: 'Database not available' });
    const orgId = getOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'Organization context required' });

    const data = updateSettingsSchema.parse(req.body);

    const result = await pool.query(
      `INSERT INTO support_settings
        (organization_id, auto_assign_enabled, sla_response_hours, sla_resolution_hours,
         notify_on_new_ticket, notify_on_ticket_update, custom_categories, business_hours,
         escalation_rules, satisfaction_survey_enabled, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      ON CONFLICT (organization_id) DO UPDATE SET
        auto_assign_enabled = COALESCE($2, support_settings.auto_assign_enabled),
        sla_response_hours = COALESCE($3, support_settings.sla_response_hours),
        sla_resolution_hours = COALESCE($4, support_settings.sla_resolution_hours),
        notify_on_new_ticket = COALESCE($5, support_settings.notify_on_new_ticket),
        notify_on_ticket_update = COALESCE($6, support_settings.notify_on_ticket_update),
        custom_categories = COALESCE($7, support_settings.custom_categories),
        business_hours = COALESCE($8, support_settings.business_hours),
        escalation_rules = COALESCE($9, support_settings.escalation_rules),
        satisfaction_survey_enabled = COALESCE($10, support_settings.satisfaction_survey_enabled),
        updated_at = NOW()
      RETURNING *,
        auto_assign_enabled AS "autoAssignEnabled",
        sla_response_hours AS "slaResponseHours",
        sla_resolution_hours AS "slaResolutionHours",
        notify_on_new_ticket AS "notifyOnNewTicket",
        notify_on_ticket_update AS "notifyOnTicketUpdate",
        custom_categories AS "customCategories",
        business_hours AS "businessHours",
        escalation_rules AS "escalationRules",
        satisfaction_survey_enabled AS "satisfactionSurveyEnabled",
        created_at AS "createdAt",
        updated_at AS "updatedAt"`,
      [
        orgId,
        data.autoAssignEnabled ?? false,
        data.slaResponseHours ?? 24,
        data.slaResolutionHours ?? 72,
        data.notifyOnNewTicket ?? true,
        data.notifyOnTicketUpdate ?? true,
        JSON.stringify(data.customCategories ?? []),
        data.businessHours ? JSON.stringify(data.businessHours) : null,
        JSON.stringify(data.escalationRules ?? []),
        data.satisfactionSurveyEnabled ?? true,
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating support settings:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid settings data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update support settings' });
  }
});

// ============================================================
// ANALYTICS / DASHBOARD
// ============================================================

/**
 * GET /api/support/analytics
 * Get support analytics summary for the organization.
 */
router.get('/analytics', async (req: Request, res: Response) => {
  try {
    if (!pool) return res.status(500).json({ error: 'Database not available' });
    const orgId = getOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'Organization context required' });

    const { days = '30', refresh = 'false' } = req.query;
    const daysNum = Math.min(365, Math.max(1, parseInt(days as string, 10) || 30));
    const bypassCache = String(refresh).toLowerCase() === 'true';
    const cacheKey = `analytics:${orgId}:${daysNum}`;

    if (!bypassCache) {
      const cached = getCachedSupportAnalytics(cacheKey);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        return res.json(cached);
      }
    }

    // Run analytics queries in parallel (SLA + satisfaction merged into one scan)
    const [statusCounts, priorityCounts, categoryCounts, slaAndSatisfaction, volumeByDay] =
      await Promise.all([
        // Tickets by status
        pool.query(
          `SELECT status, COUNT(*)::int AS count
           FROM support_tickets
           WHERE organization_id = $1 AND created_at >= NOW() - make_interval(days => $2::int)
           GROUP BY status ORDER BY count DESC`,
          [orgId, daysNum]
        ),
        // Tickets by priority
        pool.query(
          `SELECT priority, COUNT(*)::int AS count
           FROM support_tickets
           WHERE organization_id = $1 AND created_at >= NOW() - make_interval(days => $2::int)
           GROUP BY priority ORDER BY count DESC`,
          [orgId, daysNum]
        ),
        // Tickets by category
        pool.query(
          `SELECT category, COUNT(*)::int AS count
           FROM support_tickets
           WHERE organization_id = $1 AND created_at >= NOW() - make_interval(days => $2::int)
           GROUP BY category ORDER BY count DESC`,
          [orgId, daysNum]
        ),
        // SLA + satisfaction metrics (merged into single scan)
        pool.query(
          `SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE first_response_at IS NOT NULL AND first_response_at <= sla_response_due)::int AS "slaResponseMet",
            COUNT(*) FILTER (WHERE first_response_at IS NOT NULL AND first_response_at > sla_response_due)::int AS "slaResponseBreached",
            COUNT(*) FILTER (WHERE resolved_at IS NOT NULL AND resolved_at <= sla_resolution_due)::int AS "slaResolutionMet",
            COUNT(*) FILTER (WHERE resolved_at IS NOT NULL AND resolved_at > sla_resolution_due)::int AS "slaResolutionBreached",
            ROUND(AVG(EXTRACT(EPOCH FROM (first_response_at - created_at)) / 3600)::numeric, 1) AS "avgResponseTimeHours",
            ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600)::numeric, 1) AS "avgResolutionTimeHours",
            COUNT(satisfaction_rating)::int AS "totalRatings",
            ROUND(AVG(satisfaction_rating)::numeric, 2) AS "avgRating",
            COUNT(*) FILTER (WHERE satisfaction_rating >= 4)::int AS "satisfied",
            COUNT(*) FILTER (WHERE satisfaction_rating <= 2)::int AS "unsatisfied"
          FROM support_tickets
          WHERE organization_id = $1 AND created_at >= NOW() - make_interval(days => $2::int)`,
          [orgId, daysNum]
        ),
        // Volume over time (daily)
        pool.query(
          `SELECT
            DATE(created_at) AS date,
            COUNT(*)::int AS created,
            COUNT(*) FILTER (WHERE resolved_at IS NOT NULL)::int AS resolved
          FROM support_tickets
          WHERE organization_id = $1 AND created_at >= NOW() - make_interval(days => $2::int)
          GROUP BY DATE(created_at)
          ORDER BY date ASC`,
          [orgId, daysNum]
        ),
      ]);

    // Split merged SLA+satisfaction result for clean API response
    const combined = slaAndSatisfaction.rows[0] || {};
    const sla = {
      total: combined.total,
      slaResponseMet: combined.slaResponseMet,
      slaResponseBreached: combined.slaResponseBreached,
      slaResolutionMet: combined.slaResolutionMet,
      slaResolutionBreached: combined.slaResolutionBreached,
      avgResponseTimeHours: combined.avgResponseTimeHours,
      avgResolutionTimeHours: combined.avgResolutionTimeHours,
    };
    const satisfaction = {
      totalRatings: combined.totalRatings,
      avgRating: combined.avgRating,
      satisfied: combined.satisfied,
      unsatisfied: combined.unsatisfied,
    };

    const payload = {
      period: { days: daysNum },
      byStatus: statusCounts.rows,
      byPriority: priorityCounts.rows,
      byCategory: categoryCounts.rows,
      sla,
      satisfaction,
      volumeByDay: volumeByDay.rows,
    };

    setCachedSupportAnalytics(cacheKey, payload);
    res.setHeader('X-Cache', 'MISS');
    res.json(payload);
  } catch (error) {
    console.error('Error fetching support analytics:', error);
    res.status(500).json({ error: 'Failed to fetch support analytics' });
  }
});

/**
 * GET /api/support/analytics/agents
 * Get per-agent performance metrics.
 */
router.get('/analytics/agents', async (req: Request, res: Response) => {
  try {
    if (!pool) return res.status(500).json({ error: 'Database not available' });
    const orgId = getOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'Organization context required' });

    const { days = '30', refresh = 'false' } = req.query;
    const daysNum = Math.min(365, Math.max(1, parseInt(days as string, 10) || 30));
    const bypassCache = String(refresh).toLowerCase() === 'true';
    const cacheKey = `analytics:agents:${orgId}:${daysNum}`;

    if (!bypassCache) {
      const cached = getCachedSupportAnalytics(cacheKey);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        return res.json(cached);
      }
    }

    const result = await pool.query(
      `SELECT
        u.id AS "agentId", u.name AS "agentName", u.email AS "agentEmail",
        COUNT(t.id)::int AS "totalAssigned",
        COUNT(*) FILTER (WHERE t.status = 'resolved' OR t.status = 'closed')::int AS "resolved",
        COUNT(*) FILTER (WHERE t.status = 'open' OR t.status = 'in_progress')::int AS "open",
        ROUND(AVG(EXTRACT(EPOCH FROM (t.first_response_at - t.created_at)) / 3600)::numeric, 1) AS "avgResponseTimeHours",
        ROUND(AVG(EXTRACT(EPOCH FROM (t.resolved_at - t.created_at)) / 3600)::numeric, 1) AS "avgResolutionTimeHours",
        ROUND(AVG(t.satisfaction_rating)::numeric, 2) AS "avgSatisfaction"
      FROM support_tickets t
      INNER JOIN users u ON u.id = t.assigned_to_id
      WHERE t.organization_id = $1 AND t.created_at >= NOW() - make_interval(days => $2::int)
      GROUP BY u.id, u.name, u.email
      ORDER BY "totalAssigned" DESC`,
      [orgId, daysNum]
    );

    const payload = { agents: result.rows };
    setCachedSupportAnalytics(cacheKey, payload);
    res.setHeader('X-Cache', 'MISS');
    res.json(payload);
  } catch (error) {
    console.error('Error fetching agent analytics:', error);
    res.status(500).json({ error: 'Failed to fetch agent analytics' });
  }
});

export default router;
