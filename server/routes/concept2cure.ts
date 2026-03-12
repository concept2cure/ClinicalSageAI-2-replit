/**
 * Concept2Cure Projects API Routes
 *
 * Enterprise-grade regulatory submission project management API.
 * Implements multi-tenant isolation and FDA 21 CFR Part 11 compliance.
 *
 * @module server/routes/concept2cure
 * @version 3.1.0
 *
 * Security Architecture:
 * - Authentication via authMiddleware (JWT/API Key)
 * - Multi-tenant isolation via organizationId enforcement
 * - RBAC permission checks on sensitive operations
 * - Redis-based distributed rate limiting
 *
 * FDA 21 CFR Part 11 Compliance:
 * - All mutations logged to persistent audit trail
 * - Electronic signature support
 * - Tamper-evident integrity hashing (SHA-256)
 * - Input validation (Zod schemas) on all endpoints
 * - Version-controlled artifacts with immutable history
 *
 * Data Architecture:
 * - PostgreSQL persistence via Drizzle ORM
 * - Transaction support for data integrity
 * - Soft deletes for regulatory compliance
 * - Full database persistence for conversations/artifacts
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { eq, desc, and, isNull, inArray } from 'drizzle-orm';
import { db, pool } from '../db';
import { createScopedLogger } from '../utils/logger';
import * as metricsModule from '../metrics.js';
import { authMiddleware } from '../auth';
import { requireOrganizationContext, tenantContextMiddleware } from '../middleware/tenantContext';
import { createRedisRateLimiter } from '../middleware/redisRateLimiter';
import DOMPurifyImport from 'isomorphic-dompurify';
const DOMPurify = (DOMPurifyImport as any).default || DOMPurifyImport;
import multer from 'multer';
import path from 'path';
import {
  regulatoryAuditLogs,
  projects,
  concept2cureConversations,
  concept2cureMessages,
  concept2cureArtifacts,
  concept2cureArtifactVersions,
  concept2cureSignatures,
  concept2cureProvenanceEvents,
  concept2cureReviewComments,
} from '../../shared/schema';
import * as crypto from 'crypto';

const logger = createScopedLogger('concept2cure-api');
const router = Router();
const metrics = (
  metricsModule as {
    metrics?: { concept2cureErrors?: { inc: (labels: Record<string, string>) => void } };
  }
).metrics;

type ApiErrorPayload = {
  message: string;
  code?: string;
  details?: unknown;
};

const sendSuccess = <T>(res: Response, data: T, meta?: Record<string, unknown>) => {
  if (meta) {
    return res.json({ success: true, data, meta });
  }
  return res.json({ success: true, data });
};

const sendError = (
  res: Response,
  status: number,
  message: string,
  details?: unknown,
  code?: string
) =>
  res
    .status(status)
    .json({ success: false, error: { message, code, details } satisfies ApiErrorPayload });

// ─────────────────────────────────────────────────────────────────────────────
// SECURITY MIDDLEWARE CHAIN
// Apply in order: rate limit → auth → tenant context → organization check
// ─────────────────────────────────────────────────────────────────────────────

// Use Redis-based rate limiter for distributed deployments
const concept2cureRateLimiter = createRedisRateLimiter({
  rules: {
    concept2cure: {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 100,
      message: 'Rate limit exceeded for Concept2Cure API. Please wait.',
    },
  },
  perOrganization: true,
  keyPrefix: 'c2c:',
});

// Apply middleware stack to all routes
router.use(concept2cureRateLimiter);
router.use(authMiddleware);
router.use(tenantContextMiddleware);
router.use(requireOrganizationContext);

// ─────────────────────────────────────────────────────────────────────────────
// FDA 21 CFR PART 11 AUDIT LOGGING (DATABASE-BACKED)
// ─────────────────────────────────────────────────────────────────────────────

interface AuditEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'EXPORT' | 'SIGN' | 'APPROVE' | 'AI_EDIT';
  entityType:
    | 'project'
    | 'conversation'
    | 'message'
    | 'artifact'
    | 'artifact_status'
    | 'audit_report_export'
    | 'review_comment'
    | 'document_section'
    | 'system_error';
  entityId: string;
  previousValue?: unknown;
  newValue?: unknown;
  ipAddress?: string;
  sessionId?: string;
  integrityHash?: string;
}

/**
 * Log an audit entry for 21 CFR Part 11 compliance.
 * Entries are persisted to database with tamper-evident hashing.
 *
 * @param req - Express request with authenticated user context
 * @param action - Type of action being audited
 * @param entityType - Category of entity being acted upon
 * @param entityId - Unique identifier of the entity
 * @param previousValue - State before change (for updates/deletes)
 * @param newValue - State after change (for creates/updates)
 */
async function logAuditEntry(
  req: Request,
  action: AuditEntry['action'],
  entityType: AuditEntry['entityType'],
  entityId: string,
  previousValue?: unknown,
  newValue?: unknown
): Promise<void> {
  try {
    const auditId = `audit_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    const timestamp = new Date();
    const orgId = req.tenantContext?.organizationId
      ? parseInt(req.tenantContext.organizationId, 10)
      : req.tenantId || 1;

    // Calculate tamper-evident integrity hash
    const hashData = JSON.stringify({
      auditId,
      timestamp: timestamp.toISOString(),
      userId: req.userId,
      action,
      entityType,
      entityId,
    });
    const integrityHash = crypto.createHash('sha256').update(hashData).digest('hex');

    // Persist to regulatory audit log table
    await db.insert(regulatoryAuditLogs).values({
      auditId,
      organizationId: orgId,
      entityType,
      entityId,
      action,
      actionCategory: getActionCategory(action),
      previousValue: previousValue ?? null,
      newValue: newValue ?? null,
      userId: req.userId || 1,
      userName: req.userEmail || 'unknown',
      userRole: req.userRole || 'user',
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] || null,
      sessionId: (req as any).session?.id || null,
      isGxpRelevant: true, // Concept2Cure creates GxP-relevant documents
      metadata: { integrityHash },
    });

    logger.debug('Audit entry persisted', { auditId, action, entityType, entityId });
  } catch (error) {
    // Never fail the main operation due to audit logging - log and continue
    logger.error('Failed to persist audit entry', {
      error: error instanceof Error ? error.message : 'Unknown error',
      action,
      entityType,
      entityId,
    });
  }
}

/**
 * Map audit actions to categories for reporting.
 */
function getActionCategory(action: AuditEntry['action']): string {
  const categoryMap: Record<string, string> = {
    CREATE: 'data-change',
    UPDATE: 'data-change',
    DELETE: 'data-change',
    READ: 'access',
    EXPORT: 'access',
    SIGN: 'approval',
    APPROVE: 'approval',
  };
  return categoryMap[action] || 'system';
}

/**
 * Extract client IP address from request, handling proxies.
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return ips.trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

// ─────────────────────────────────────────────────────────────────────────────
// INPUT SANITIZATION (PRODUCTION-GRADE)
// Using isomorphic-dompurify for comprehensive XSS prevention
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sanitize user-provided text content to prevent XSS attacks.
 * Uses DOMPurify (isomorphic) for production-grade sanitization.
 *
 * @param content - Raw user input
 * @returns Sanitized string safe for storage and display
 */
function sanitizeContent(content: string): string {
  if (!content || typeof content !== 'string') {
    return '';
  }

  return DOMPurify.sanitize(content, {
    ALLOWED_TAGS: [
      'b',
      'i',
      'em',
      'strong',
      'p',
      'br',
      'ul',
      'ol',
      'li',
      'code',
      'pre',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'blockquote',
      'a',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'span',
      'div',
      'hr',
      'sup',
      'sub',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'id'],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input'],
    FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover', 'onfocus'],
  }).trim();
}

/**
 * Calculate SHA-256 hash for content integrity verification.
 * Used for 21 CFR Part 11 tamper-evident audit trails.
 */
function calculateContentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Calculate SHA-256 hash for electronic signature integrity.
 */
function calculateSignatureHash(payload: Record<string, unknown>): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/**
 * Verify the integrity chain of an artifact's version history.
 * Recomputes SHA-256 for each version's content and verifies it matches the stored hash.
 * Returns detailed verification results.
 */
function verifyIntegrityChain(
  artifact: { content: string | null; contentHash: string | null; version: number },
  versions: Array<{ version: number; content: string; contentHash: string; createdAt: Date | null }>
): {
  chainIntact: boolean;
  currentHashVerified: boolean;
  computedHash: string;
  storedHash: string | null;
  versionDetails: Array<{
    version: number;
    storedHash: string;
    computedHash: string;
    verified: boolean;
    timestamp: Date | null;
  }>;
  failureReason: string | null;
} {
  const computedHash = artifact.content ? calculateContentHash(artifact.content) : '';
  const currentHashVerified = computedHash === artifact.contentHash;

  let chainIntact = currentHashVerified;
  let failureReason: string | null = null;
  const versionDetails = versions.map(v => {
    const vComputedHash = calculateContentHash(v.content);
    const verified = vComputedHash === v.contentHash;
    if (!verified) {
      chainIntact = false;
      failureReason = failureReason || `Version ${v.version} hash mismatch`;
    }
    return {
      version: v.version,
      storedHash: v.contentHash,
      computedHash: vComputedHash,
      verified,
      timestamp: v.createdAt,
    };
  });

  if (!currentHashVerified && !failureReason) {
    failureReason = 'Current artifact hash mismatch';
  }

  return {
    chainIntact,
    currentHashVerified,
    computedHash,
    storedHash: artifact.contentHash,
    versionDetails,
    failureReason,
  };
}

/**
 * Emit a provenance event for an artifact.
 * Append-only — events are never modified or deleted.
 */
async function emitProvenanceEvent(params: {
  artifactDbId: number;
  artifactVersionId?: number;
  organizationId: number;
  eventType: string;
  eventAction: string;
  actorId?: number;
  actorName?: string;
  actorEmail?: string;
  details?: Record<string, unknown>;
  sourceArtifactId?: number;
  sourceDescription?: string;
  backendRoute?: string;
  backendService?: string;
  ipAddress?: string;
}) {
  try {
    const eventId = `prov_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    await db.insert(concept2cureProvenanceEvents).values({
      eventId,
      artifactId: params.artifactDbId,
      artifactVersionId: params.artifactVersionId || null,
      organizationId: params.organizationId,
      eventType: params.eventType,
      eventAction: params.eventAction,
      actorId: params.actorId || null,
      actorName: params.actorName || null,
      actorEmail: params.actorEmail || null,
      details: params.details || {},
      sourceArtifactId: params.sourceArtifactId || null,
      sourceDescription: params.sourceDescription || null,
      backendRoute: params.backendRoute || null,
      backendService: params.backendService || null,
      ipAddress: params.ipAddress || null,
    });
    return eventId;
  } catch (err: any) {
    logger.warn('Failed to emit provenance event', { error: err.message, ...params });
    return null;
  }
}

function logConcept2cureError(operation: string, error: Error, meta: Record<string, unknown> = {}) {
  logger.error(`Concept2Cure ${operation} failed`, {
    error: error.message,
    operation,
    ...meta,
  });
  try {
    metrics?.concept2cureErrors?.inc({
      operation,
      error_type: error.name || 'Error',
    });
  } catch {
    // Ignore metric errors
  }
}

/**
 * Sanitize object properties recursively for storage.
 *
 * @param obj - Object with potentially unsafe string values
 * @returns Object with all string values sanitized
 */
function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeContent(value);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeObject(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized as T;
}

function normalizeProjectSettings(settings: unknown): Record<string, unknown> {
  return settings && typeof settings === 'object' ? (settings as Record<string, unknown>) : {};
}

function normalizeKnowledge(settings: Record<string, unknown>): ProjectKnowledge {
  const knowledge =
    settings.knowledge && typeof settings.knowledge === 'object'
      ? (settings.knowledge as Record<string, unknown>)
      : {};

  const documents = Array.isArray(knowledge.documents)
    ? (knowledge.documents as UploadedDocument[])
    : [];
  const customInstructions =
    typeof settings.customInstructions === 'string'
      ? settings.customInstructions
      : typeof knowledge.customInstructions === 'string'
        ? knowledge.customInstructions
        : '';
  const context = typeof knowledge.context === 'string' ? knowledge.context : '';

  return {
    documents,
    customInstructions,
    context,
  };
}

function estimateTokensFromBytes(bytes: number): number {
  return Math.ceil(bytes * 0.25);
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────

const SubmissionTypeEnum = z
  .enum([
    '510K',
    'FDA_510K', // Alias for backward compatibility
    'IND',
    'NDA',
    'BLA',
    'MAA',
    'PMA',
    'DE_NOVO',
    'EUA',
  ])
  .transform(val => (val === 'FDA_510K' ? '510K' : val));

const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(200, 'Name too long'),
  submissionType: SubmissionTypeEnum,
  description: z.string().max(2000, 'Description too long').optional(),
  customInstructions: z.string().max(5000).optional(),
  targetSubmissionDate: z.string().datetime().optional(),
  sponsor: z.string().max(200).optional(),
  product: z.string().max(200).optional(),
  region: z.string().max(100).optional(),
});

const updateProjectSchema = createProjectSchema.partial();

const updateKnowledgeSchema = z
  .object({
    customInstructions: z.string().max(5000).optional(),
    context: z.string().max(20000).optional(),
  })
  .partial();

const errorLogSchema = z.object({
  id: z.string().min(1),
  timestamp: z.string().datetime(),
  error: z.string().min(1).max(2000),
  stack: z.string().optional(),
  componentStack: z.string().optional(),
  userAgent: z.string().optional(),
  url: z.string().optional(),
});

const knowledgeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const allowedKnowledgeMimeTypes = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
]);

function sanitizeFilename(name: string): string {
  const base = path.basename(name || 'document');
  return base.replace(/[^\w.\-() ]+/g, '_');
}

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

const createArtifactSchema = z.object({
  conversationId: z.string().optional(),
  type: z.string().min(1).max(50),
  category: z.enum(['document', 'interactive', 'visualization']),
  title: z.string().min(1, 'Title required').max(200),
  content: z.string().max(1000000, 'Content too large'), // 1MB max
  ctdSection: z.string().max(50).optional(),
  metadata: z.record(z.any()).optional(),
});

const createSignatureSchema = z.object({
  signatureType: z.string().min(1).max(50).optional(),
  signaturePurpose: z.string().min(1).max(500),
  signatureMeaning: z.string().max(500).optional(),
  authenticationMethod: z.string().min(1).max(50),
  secondFactorVerified: z.boolean().optional(),
  signatureManifest: z.record(z.any()).optional(),
  version: z.number().int().min(1).optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// DATABASE-BACKED DATA TYPES
// These types map to database tables for persistent, multi-tenant storage
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Conversation within a project (stored as JSON in project settings).
 */
interface Conversation {
  id: string;
  projectId: string;
  title: string;
  messages: Message[];
  parentConversationId?: string;
  forkMessageIndex?: number;
  threadId?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  attachments?: Array<{ id: string; name: string; type: string; size: number }>;
  artifactId?: string;
  edited?: boolean;
}

/**
 * Generated artifact stored with version history.
 */
interface Artifact {
  id: string;
  projectId: string;
  conversationId?: string;
  type: string;
  category: 'document' | 'interactive' | 'visualization' | 'compliance';
  title: string;
  content: string;
  version: number;
  versions: Array<{ version: number; content: string; createdAt: Date }>;
  metadata?: Record<string, unknown>;
  status?: string;
  ctdSection?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface UploadedDocument {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: string;
  tokenCount?: number;
  pageCount?: number;
  status?: string;
}

interface ProjectKnowledge {
  documents: UploadedDocument[];
  customInstructions?: string;
  context?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// TENANT-AWARE DATA ACCESS HELPERS
// All database operations must include organizationId for tenant isolation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the organization ID from the request with validation.
 * Works with both auth middleware (number) and tenant context middleware (string).
 * Throws if organization context is missing.
 */
function getOrganizationId(req: Request): number {
  // First try the auth middleware context (organizationId as number)
  if (req.tenantContext?.organizationId) {
    const orgId =
      typeof req.tenantContext.organizationId === 'number'
        ? req.tenantContext.organizationId
        : parseInt(String(req.tenantContext.organizationId), 10);
    if (!isNaN(orgId)) return orgId;
  }

  // Fall back to tenantId
  if (req.tenantId && !isNaN(req.tenantId)) {
    return req.tenantId;
  }

  throw new Error('Organization context required');
}

/**
 * Get the current user ID from the request.
 */
function getUserId(req: Request): number {
  return req.userId || 1; // Default to 1 for development
}

/**
 * Get client workspace ID if available.
 * Returns 1 as default for development.
 */
function getClientWorkspaceId(req: Request): number {
  // Check if tenantContext has clientWorkspaceId (from tenant middleware)
  const ctx = req.tenantContext as Record<string, unknown> | undefined;
  if (ctx?.clientWorkspaceId) {
    const id =
      typeof ctx.clientWorkspaceId === 'number'
        ? ctx.clientWorkspaceId
        : parseInt(String(ctx.clientWorkspaceId), 10);
    if (!isNaN(id)) return id;
  }
  return 1; // Default workspace for development
}

// ─────────────────────────────────────────────────────────────────────────────
// DATABASE-BACKED DATA ACCESS
// All conversations and artifacts are persisted to PostgreSQL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get conversations for a project from database.
 */
async function getConversationsFromDb(
  projectId: number,
  organizationId: number
): Promise<Conversation[]> {
  const dbConversations = await db
    .select()
    .from(concept2cureConversations)
    .where(
      and(
        eq(concept2cureConversations.projectId, projectId),
        eq(concept2cureConversations.organizationId, organizationId),
        eq(concept2cureConversations.status, 'active')
      )
    )
    .orderBy(desc(concept2cureConversations.updatedAt));

  if (dbConversations.length === 0) {
    return [];
  }

  const conversationIds = dbConversations.map(conv => conv.id);
  const dbMessages = await db
    .select()
    .from(concept2cureMessages)
    .where(inArray(concept2cureMessages.conversationId, conversationIds))
    .orderBy(concept2cureMessages.createdAt);

  const messagesByConversationId = new Map<number, Message[]>();
  for (const message of dbMessages) {
    const list = messagesByConversationId.get(message.conversationId) || [];
    list.push({
      id: message.messageId,
      role: message.role as 'user' | 'assistant',
      content: message.content,
      timestamp: message.createdAt,
      attachments: message.attachments as Message['attachments'],
      artifactId: message.artifactId || undefined,
      edited: message.edited || false,
    });
    messagesByConversationId.set(message.conversationId, list);
  }

  return dbConversations.map(conv => ({
    id: conv.conversationId,
    projectId: `proj_${conv.projectId}`,
    title: conv.title,
    messages: messagesByConversationId.get(conv.id) || [],
    parentConversationId: conv.parentConversationId?.toString(),
    forkMessageIndex: conv.forkMessageIndex || undefined,
    threadId: conv.threadId || undefined,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
  }));
}

/**
 * Get artifacts for a project from database.
 */
async function getArtifactsFromDb(projectId: number, organizationId: number): Promise<Artifact[]> {
  const dbArtifacts = await db
    .select()
    .from(concept2cureArtifacts)
    .where(
      and(
        eq(concept2cureArtifacts.projectId, projectId),
        eq(concept2cureArtifacts.organizationId, organizationId)
      )
    )
    .orderBy(desc(concept2cureArtifacts.updatedAt));

  if (dbArtifacts.length === 0) {
    return [];
  }

  const artifactIds = dbArtifacts.map(art => art.id);
  const dbVersions = await db
    .select()
    .from(concept2cureArtifactVersions)
    .where(inArray(concept2cureArtifactVersions.artifactId, artifactIds))
    .orderBy(concept2cureArtifactVersions.version);

  const versionsByArtifactId = new Map<
    number,
    { version: number; content: string; createdAt: Date }[]
  >();
  for (const version of dbVersions) {
    const list = versionsByArtifactId.get(version.artifactId) || [];
    list.push({
      version: version.version,
      content: version.content,
      createdAt: version.createdAt,
    });
    versionsByArtifactId.set(version.artifactId, list);
  }

  return dbArtifacts.map(art => ({
    id: art.artifactId,
    projectId: `proj_${art.projectId}`,
    conversationId: art.conversationId?.toString(),
    type: art.type,
    category: art.category as Artifact['category'],
    title: art.title,
    content: art.content,
    version: art.version,
    versions: versionsByArtifactId.get(art.id) || [],
    metadata: art.metadata as Record<string, unknown>,
    status: art.status || 'draft',
    ctdSection: art.ctdSection,
    createdAt: art.createdAt,
    updatedAt: art.updatedAt,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT ROUTES (DATABASE-BACKED WITH TENANT ISOLATION)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/concept2cure/projects
 * List all projects for the current user within their organization.
 *
 * @security Bearer token required
 * @param req.tenantContext.organizationId - Required organization context
 * @returns {Project[]} Array of projects sorted by updatedAt descending
 */
router.get('/projects', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);

    // Use raw SQL to avoid Drizzle ORM schema mismatch (parent_project_id doesn't exist in DB)
    const result = await pool.query(
      `SELECT id, name, description, status, type, metadata, created_at, updated_at
       FROM projects
       WHERE organization_id = $1
         AND actual_end_date IS NULL
       ORDER BY updated_at DESC
       LIMIT 100`,
      [organizationId]
    );

    const response = await Promise.all(
      result.rows.map(async (p: any) => ({
        id: `proj_${p.id}`,
        name: p.name,
        submissionType: p.metadata?.submissionType || p.type || 'IND',
        description: p.description,
        status: p.status || 'active',
        sponsor: p.metadata?.sponsor,
        product: p.metadata?.product,
        region: p.metadata?.region,
        organizationId,
        conversations: await getConversationsFromDb(p.id, organizationId),
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      }))
    );

    return sendSuccess(res, response);
  } catch (error: any) {
    logger.error('Failed to fetch projects', {
      error: error.message,
      organizationId: req.tenantContext?.organizationId,
    });
    return sendError(res, 500, 'Failed to fetch projects');
  }
});

/**
 * GET /api/concept2cure/projects/:id
 * Get a single project by ID with tenant isolation.
 *
 * @security Bearer token required
 * @param req.params.id - Project ID (with or without 'proj_' prefix)
 */
router.get('/projects/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const projectId = req.params.id.replace('proj_', '');
    const numericId = parseInt(projectId, 10);

    if (isNaN(numericId)) {
      return sendError(res, 400, 'Invalid project ID format', undefined, 'INVALID_ID');
    }

    // Query with tenant isolation
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
      .limit(1);

    if (!project) {
      return sendError(res, 404, 'Project not found');
    }

    // Transform to API response with DB conversations
    const response = {
      id: `proj_${project.id}`,
      name: project.name,
      submissionType: (project.metadata as any)?.submissionType || 'IND',
      description: project.description,
      sponsor: (project.metadata as any)?.sponsor,
      product: (project.metadata as any)?.product,
      region: (project.metadata as any)?.region,
      customInstructions: (project.settings as any)?.customInstructions,
      status: project.status,
      organizationId: project.organizationId,
      conversations: await getConversationsFromDb(project.id, organizationId),
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };

    return sendSuccess(res, response);
  } catch (error: any) {
    logger.error('Failed to fetch project', { error: error.message });
    return sendError(res, 500, 'Failed to fetch project');
  }
});

/**
 * POST /api/concept2cure/projects
 * Create a new project with tenant isolation.
 *
 * @security Bearer token required
 * @body {name, submissionType, description?, customInstructions?}
 */
router.post('/projects', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const clientWorkspaceId = getClientWorkspaceId(req);
    const data = createProjectSchema.parse(req.body);

    // Sanitize user input
    const sanitizedData = {
      name: sanitizeContent(data.name),
      description: data.description ? sanitizeContent(data.description) : null,
      customInstructions: data.customInstructions ? sanitizeContent(data.customInstructions) : null,
    };

    // Insert into database with tenant context
    const [newProject] = await db
      .insert(projects)
      .values({
        organizationId,
        clientWorkspaceId,
        name: sanitizedData.name,
        description: sanitizedData.description,
        type: 'concept2cure',
        status: 'planning',
        createdById: userId,
        ownerId: userId,
        metadata: {
          submissionType: data.submissionType,
          targetSubmissionDate: data.targetSubmissionDate,
          sponsor: data.sponsor,
          product: data.product,
          region: data.region,
        },
        settings: {
          customInstructions: sanitizedData.customInstructions,
        },
      })
      .returning();

    const projectId = `proj_${newProject.id}`;

    // Log audit entry for 21 CFR Part 11 compliance
    await logAuditEntry(req, 'CREATE', 'project', projectId, null, {
      name: sanitizedData.name,
      submissionType: data.submissionType,
      organizationId,
    });

    // Transform response
    const response = {
      id: projectId,
      name: newProject.name,
      submissionType: data.submissionType,
      description: newProject.description,
      sponsor: data.sponsor,
      product: data.product,
      region: data.region,
      conversations: [],
      status: newProject.status,
      organizationId: newProject.organizationId,
      createdAt: newProject.createdAt,
      updatedAt: newProject.updatedAt,
    };

    logger.info('Created new project', {
      projectId,
      name: newProject.name,
      organizationId,
    });
    return sendSuccess(res.status(201), response);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation failed', error.errors, 'VALIDATION_ERROR');
    }
    logConcept2cureError('create project', error, {
      organizationId: req.tenantContext?.organizationId,
    });
    return sendError(res, 500, 'Failed to create project');
  }
});

/**
 * PUT /api/concept2cure/projects/:id
 * Update a project with tenant isolation.
 *
 * @security Bearer token required
 * @param req.params.id - Project ID
 */
router.put('/projects/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const projectId = req.params.id.replace('proj_', '');
    const numericId = parseInt(projectId, 10);

    if (isNaN(numericId)) {
      return sendError(res, 400, 'Invalid project ID format', undefined, 'INVALID_ID');
    }

    const data = updateProjectSchema.parse(req.body);

    // First fetch existing project to verify ownership and capture previous state
    const [existing] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
      .limit(1);

    if (!existing) {
      return sendError(res, 404, 'Project not found');
    }

    // Prepare sanitized update data
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (data.name) updateData.name = sanitizeContent(data.name);
    if (data.description !== undefined)
      updateData.description = data.description ? sanitizeContent(data.description) : null;

    if (
      data.submissionType ||
      data.targetSubmissionDate ||
      data.sponsor !== undefined ||
      data.product !== undefined ||
      data.region !== undefined
    ) {
      updateData.metadata = {
        ...((existing.metadata as object) || {}),
        ...(data.submissionType && { submissionType: data.submissionType }),
        ...(data.targetSubmissionDate && { targetSubmissionDate: data.targetSubmissionDate }),
        ...(data.sponsor !== undefined && {
          sponsor: data.sponsor ? sanitizeContent(data.sponsor) : null,
        }),
        ...(data.product !== undefined && {
          product: data.product ? sanitizeContent(data.product) : null,
        }),
        ...(data.region !== undefined && {
          region: data.region ? sanitizeContent(data.region) : null,
        }),
      };
    }

    if (data.customInstructions !== undefined) {
      updateData.settings = {
        ...((existing.settings as object) || {}),
        customInstructions: data.customInstructions
          ? sanitizeContent(data.customInstructions)
          : null,
      };
    }

    // Update with tenant isolation
    const [updated] = await db
      .update(projects)
      .set(updateData)
      .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
      .returning();

    // Log audit entry for 21 CFR Part 11 compliance
    await logAuditEntry(req, 'UPDATE', 'project', req.params.id, existing, updated);

    // Transform response with DB conversations
    const response = {
      id: req.params.id,
      name: updated.name,
      submissionType: (updated.metadata as any)?.submissionType || 'IND',
      description: updated.description,
      sponsor: (updated.metadata as any)?.sponsor,
      product: (updated.metadata as any)?.product,
      region: (updated.metadata as any)?.region,
      conversations: await getConversationsFromDb(numericId, organizationId),
      status: updated.status,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };

    logger.info('Updated project', { projectId: req.params.id, organizationId });
    return sendSuccess(res, response);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation failed', error.errors, 'VALIDATION_ERROR');
    }
    logger.error('Failed to update project', { error: error.message });
    return sendError(res, 500, 'Failed to update project');
  }
});

/**
 * DELETE /api/concept2cure/projects/:id
 * Soft delete a project for 21 CFR Part 11 compliance.
 * Records are never truly deleted - just marked with actualEndDate.
 *
 * @security Bearer token required
 * @param req.params.id - Project ID
 */
router.delete('/projects/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const projectId = req.params.id.replace('proj_', '');
    const numericId = parseInt(projectId, 10);

    if (isNaN(numericId)) {
      return sendError(res, 400, 'Invalid project ID format', undefined, 'INVALID_ID');
    }

    // First verify ownership and capture state for audit
    const [existing] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
      .limit(1);

    if (!existing) {
      return sendError(res, 404, 'Project not found');
    }

    // Soft delete by setting actualEndDate (21 CFR Part 11 compliant)
    await db
      .update(projects)
      .set({
        actualEndDate: new Date(),
        status: 'archived',
        updatedAt: new Date(),
      })
      .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)));

    // Soft delete related conversations in DB (set status to archived)
    await db
      .update(concept2cureConversations)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(
        and(
          eq(concept2cureConversations.projectId, numericId),
          eq(concept2cureConversations.organizationId, organizationId)
        )
      );

    // Log audit entry for 21 CFR Part 11 compliance
    await logAuditEntry(req, 'DELETE', 'project', req.params.id, existing, null);

    logger.info('Soft-deleted project', { projectId: req.params.id, organizationId });
    return sendSuccess(res, { deleted: true, projectId: req.params.id });
  } catch (error: any) {
    logger.error('Failed to delete project', { error: error.message });
    return sendError(res, 500, 'Failed to delete project');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT KNOWLEDGE ROUTES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/concept2cure/projects/:projectId/knowledge
 * Retrieve knowledge base state for a project.
 */
router.get('/projects/:projectId/knowledge', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const projectId = req.params.projectId.replace('proj_', '');
    const numericId = parseInt(projectId, 10);

    if (isNaN(numericId)) {
      return sendError(res, 400, 'Invalid project ID format', undefined, 'INVALID_ID');
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
      .limit(1);

    if (!project) {
      return sendError(res, 404, 'Project not found');
    }

    const settings = normalizeProjectSettings(project.settings);
    const knowledge = normalizeKnowledge(settings);
    return sendSuccess(res, knowledge);
  } catch (error: any) {
    logger.error('Failed to fetch project knowledge', { error: error.message });
    return sendError(res, 500, 'Failed to fetch project knowledge');
  }
});

/**
 * PATCH /api/concept2cure/projects/:projectId/knowledge
 * Update knowledge base metadata (custom instructions, context).
 */
router.patch('/projects/:projectId/knowledge', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const projectId = req.params.projectId.replace('proj_', '');
    const numericId = parseInt(projectId, 10);

    if (isNaN(numericId)) {
      return sendError(res, 400, 'Invalid project ID format', undefined, 'INVALID_ID');
    }

    const data = updateKnowledgeSchema.parse(req.body);

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
      .limit(1);

    if (!project) {
      return sendError(res, 404, 'Project not found');
    }

    const settings = normalizeProjectSettings(project.settings);
    const knowledge = normalizeKnowledge(settings);

    const updatedKnowledge: ProjectKnowledge = {
      ...knowledge,
      customInstructions:
        data.customInstructions !== undefined
          ? data.customInstructions
            ? sanitizeContent(data.customInstructions)
            : ''
          : knowledge.customInstructions,
      context:
        data.context !== undefined
          ? data.context
            ? sanitizeContent(data.context)
            : ''
          : knowledge.context,
    };

    const updatedSettings = {
      ...settings,
      customInstructions: updatedKnowledge.customInstructions,
      knowledge: updatedKnowledge,
    };

    const [updated] = await db
      .update(projects)
      .set({ settings: updatedSettings, updatedAt: new Date() })
      .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
      .returning();

    await logAuditEntry(req, 'UPDATE', 'project', req.params.projectId, project, updated);
    return sendSuccess(res, updatedKnowledge);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation failed', error.errors, 'VALIDATION_ERROR');
    }
    logger.error('Failed to update project knowledge', { error: error.message });
    return sendError(res, 500, 'Failed to update project knowledge');
  }
});

/**
 * POST /api/concept2cure/documents/upload
 * Upload a document and attach to project knowledge.
 */
router.post(
  '/documents/upload',
  knowledgeUpload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const projectIdRaw = req.body.projectId as string | undefined;
      const file = req.file;

      if (!projectIdRaw) {
        return sendError(res, 400, 'Project ID is required');
      }

      const numericId = parseInt(projectIdRaw.replace('proj_', ''), 10);
      if (isNaN(numericId)) {
        return sendError(res, 400, 'Invalid project ID format', undefined, 'INVALID_ID');
      }

      if (!file) {
        return sendError(res, 400, 'File is required');
      }

      if (!allowedKnowledgeMimeTypes.has(file.mimetype)) {
        return sendError(res, 400, `Unsupported file type: ${file.mimetype}`);
      }

      const [project] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
        .limit(1);

      if (!project) {
        return sendError(res, 404, 'Project not found');
      }

      const safeOriginalName = sanitizeFilename(file.originalname);
      const extension = safeOriginalName.split('.').pop()?.toLowerCase() || 'unknown';
      const uploadedAt = new Date();
      const documentId = `doc_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
      const tokenCount = estimateTokensFromBytes(file.size);

      const extractedText = file.mimetype.startsWith('text/')
        ? file.buffer.toString('utf8')
        : `[${file.mimetype} document ${safeOriginalName}]`;

      const document: UploadedDocument = {
        id: documentId,
        name: safeOriginalName,
        type: extension,
        size: file.size,
        uploadedAt: uploadedAt.toISOString(),
        tokenCount,
        status: 'processed',
      };

      const settings = normalizeProjectSettings(project.settings);
      const knowledge = normalizeKnowledge(settings);
      const updatedKnowledge: ProjectKnowledge = {
        ...knowledge,
        documents: [...knowledge.documents, document],
        customInstructions: knowledge.customInstructions,
        context: knowledge.context,
      };

      const updatedSettings = {
        ...settings,
        customInstructions: updatedKnowledge.customInstructions,
        knowledge: updatedKnowledge,
      };

      const [updated] = await db
        .update(projects)
        .set({ settings: updatedSettings, updatedAt: new Date() })
        .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
        .returning();

      await logAuditEntry(req, 'UPDATE', 'project', projectIdRaw, project, updated);

      res.status(201);
      return sendSuccess(res, {
        document,
        extractedText,
        tokenCount,
      });
    } catch (error: any) {
      logger.error('Failed to upload knowledge document', { error: error.message });
      return sendError(res, 500, 'Failed to upload knowledge document');
    }
  }
);

/**
 * DELETE /api/concept2cure/documents/:documentId
 * Remove a document from project knowledge.
 */
router.delete('/documents/:documentId', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const documentId = req.params.documentId;

    const dbProjects = await db
      .select()
      .from(projects)
      .where(and(eq(projects.organizationId, organizationId), isNull(projects.actualEndDate)));

    const target = dbProjects.find(project => {
      const settings = normalizeProjectSettings(project.settings);
      const knowledge = normalizeKnowledge(settings);
      return knowledge.documents.some(doc => doc.id === documentId);
    });

    if (!target) {
      return sendError(res, 404, 'Document not found');
    }

    const settings = normalizeProjectSettings(target.settings);
    const knowledge = normalizeKnowledge(settings);
    const updatedKnowledge: ProjectKnowledge = {
      ...knowledge,
      documents: knowledge.documents.filter(doc => doc.id !== documentId),
    };

    const updatedSettings = {
      ...settings,
      customInstructions: updatedKnowledge.customInstructions,
      knowledge: updatedKnowledge,
    };

    const [updated] = await db
      .update(projects)
      .set({ settings: updatedSettings, updatedAt: new Date() })
      .where(and(eq(projects.id, target.id), eq(projects.organizationId, organizationId)))
      .returning();

    await logAuditEntry(req, 'UPDATE', 'project', `proj_${target.id}`, target, updated);

    return sendSuccess(res, { deleted: true, documentId });
  } catch (error: any) {
    logger.error('Failed to delete knowledge document', { error: error.message });
    return sendError(res, 500, 'Failed to delete knowledge document');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AI EDITING ROUTES
// ─────────────────────────────────────────────────────────────────────────────

const aiEditSchema = z.object({
  action: z.enum(['rewrite', 'expand', 'summarize', 'regulatory-tone', 'add-references']),
  text: z.string().min(1).max(50000),
  sectionTitle: z.string().optional(),
  submissionType: z.string().optional(),
  context: z.string().optional(),
});

/**
 * POST /api/concept2cure/ai/edit-section
 * AI-powered section editing for regulatory documents.
 */
router.post('/ai/edit-section', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const data = aiEditSchema.parse(req.body);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return sendError(res, 503, 'AI service not configured');
    }

    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey });

    const actionPrompts: Record<string, string> = {
      rewrite:
        'Rewrite the following regulatory document section to improve clarity, precision, and readability while preserving all factual claims and regulatory language. Return only the rewritten text.',
      expand:
        'Expand the following regulatory document section with additional detail, supporting evidence references, and regulatory justifications. Maintain the same tone and structure. Return only the expanded text.',
      summarize:
        'Summarize the following regulatory document section into a concise executive summary suitable for a regulatory submission cover letter. Return only the summary.',
      'regulatory-tone':
        'Revise the following text to use formal regulatory submission language appropriate for FDA/EMA filings. Ensure passive voice where appropriate, precise quantitative language, and proper regulatory terminology. Return only the revised text.',
      'add-references':
        'Add inline reference placeholders (e.g., [REF-001], [REF-002]) to claims in the following text that would require supporting evidence in a regulatory submission. After the text, add a "References" section listing what type of evidence each reference should cite. Return the full annotated text.',
    };

    const systemPrompt = [
      'You are a senior regulatory medical writer with expertise in FDA and EMA submissions.',
      data.submissionType ? `This is for a ${data.submissionType} submission.` : '',
      data.sectionTitle ? `Section: "${data.sectionTitle}".` : '',
      data.context || '',
      actionPrompts[data.action],
    ]
      .filter(Boolean)
      .join(' ');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: data.text },
      ],
      temperature: data.action === 'summarize' ? 0.3 : 0.4,
      max_tokens: 4000,
    });

    const result = completion.choices[0]?.message?.content || '';

    // Audit log
    await logAuditEntry(req, 'AI_EDIT', 'document_section', `ai-edit-${Date.now()}`, null, {
      action: data.action,
      sectionTitle: data.sectionTitle || null,
      inputLength: data.text.length,
      outputLength: result.length,
      model: 'gpt-4o-mini',
    });

    logger.info('AI edit completed', { action: data.action, userId });
    return sendSuccess(res, { result, action: data.action });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation failed', error.errors, 'VALIDATION_ERROR');
    }
    logger.error('AI edit failed', { error: error.message });
    return sendError(res, 500, 'AI editing failed');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ERROR LOGGING ROUTES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/concept2cure/errors
 * Capture client-side errors for audit compliance.
 */
router.post('/errors', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const data = errorLogSchema.parse(req.body);

    await db.insert(regulatoryAuditLogs).values({
      auditId: data.id,
      organizationId,
      entityType: 'system_error',
      entityId: data.id,
      action: 'CREATE',
      actionCategory: 'system',
      previousValue: null,
      newValue: {
        timestamp: data.timestamp,
        error: sanitizeContent(data.error),
        stack: data.stack ? sanitizeContent(data.stack) : null,
        componentStack: data.componentStack ? sanitizeContent(data.componentStack) : null,
        userAgent: data.userAgent || null,
        url: data.url || null,
      },
      userId,
      userName: req.userEmail || 'unknown',
      userRole: req.userRole || 'user',
      ipAddress: getClientIp(req),
      userAgent: req.headers['user-agent'] || null,
      sessionId: (req as any).session?.id || null,
      isGxpRelevant: true,
      metadata: { source: 'client-error' },
    });

    return sendSuccess(res, { logged: true });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation failed', error.errors, 'VALIDATION_ERROR');
    }
    logger.error('Failed to log client error', { error: error.message });
    return sendError(res, 500, 'Failed to log client error');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CONVERSATION ROUTES (TENANT-ISOLATED)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify project ownership before conversation operations.
 */
async function verifyProjectAccess(req: Request, projectId: string): Promise<boolean> {
  const organizationId = getOrganizationId(req);
  const numericId = parseInt(projectId.replace('proj_', ''), 10);

  if (isNaN(numericId)) return false;

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
    .limit(1);

  return !!project;
}

/**
 * POST /api/concept2cure/projects/:projectId/conversations
 * Create a new conversation in a project (database-backed).
 */
router.post('/projects/:projectId/conversations', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const numericProjectId = parseInt(req.params.projectId.replace('proj_', ''), 10);

    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess || isNaN(numericProjectId)) {
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

    // Insert forked messages if any
    if (messagesToCopy.length > 0) {
      for (const msg of messagesToCopy) {
        await db.insert(concept2cureMessages).values({
          organizationId,
          conversationId: newDbConversation.id,
          messageId: msg.id,
          role: msg.role,
          content: msg.content,
          contentHash: calculateContentHash(msg.content),
          attachments: msg.attachments || null,
          createdById: userId,
        });
      }
    }

    const newConversation: Conversation = {
      id: conversationId,
      projectId: req.params.projectId,
      title: newDbConversation.title,
      messages: messagesToCopy,
      parentConversationId: data.parentConversationId,
      forkMessageIndex: data.forkMessageIndex,
      createdAt: newDbConversation.createdAt,
      updatedAt: newDbConversation.updatedAt,
    };

    // Log audit entry
    await logAuditEntry(req, 'CREATE', 'conversation', conversationId, null, {
      projectId: req.params.projectId,
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
            eq(concept2cureConversations.conversationId, req.params.conversationId),
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
          createdById: userId,
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
        conversationId: req.params.conversationId,
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

// ─────────────────────────────────────────────────────────────────────────────
// ARTIFACT ROUTES (DATABASE-BACKED WITH VERSION CONTROL)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/concept2cure/projects/:projectId/artifacts
 * List all artifacts for a project (database-backed).
 */
router.get('/projects/:projectId/artifacts', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const numericProjectId = parseInt(req.params.projectId.replace('proj_', ''), 10);

    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess || isNaN(numericProjectId)) {
      return sendError(res, 404, 'Project not found');
    }

    const artifacts = await getArtifactsFromDb(numericProjectId, organizationId);
    return sendSuccess(res, artifacts);
  } catch (error: any) {
    logger.error('Failed to fetch artifacts', { error: error.message });
    return sendError(res, 500, 'Failed to fetch artifacts');
  }
});

/**
 * POST /api/concept2cure/projects/:projectId/artifacts
 * Create a new artifact (database-backed with version control).
 */
router.post('/projects/:projectId/artifacts', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const numericProjectId = parseInt(req.params.projectId.replace('proj_', ''), 10);

    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess || isNaN(numericProjectId)) {
      return sendError(res, 404, 'Project not found');
    }

    const data = createArtifactSchema.parse(req.body);

    // Sanitize content
    const sanitizedContent = sanitizeContent(data.content);
    const sanitizedTitle = sanitizeContent(data.title);
    const contentHash = calculateContentHash(sanitizedContent);
    const artifactId = `artifact_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

    // Find conversation DB ID if provided
    let conversationDbId: number | null = null;
    if (data.conversationId) {
      const [conv] = await db
        .select({ id: concept2cureConversations.id })
        .from(concept2cureConversations)
        .where(
          and(
            eq(concept2cureConversations.conversationId, data.conversationId),
            eq(concept2cureConversations.organizationId, organizationId)
          )
        )
        .limit(1);
      if (conv) conversationDbId = conv.id;
    }

    // Insert artifact into database
    const ctdSection =
      data.ctdSection ||
      ((data.metadata as Record<string, unknown>)?.ctdSection as string | undefined);
    const [newDbArtifact] = await db
      .insert(concept2cureArtifacts)
      .values({
        organizationId,
        projectId: numericProjectId,
        conversationId: conversationDbId,
        artifactId,
        type: data.type,
        category: data.category,
        title: sanitizedTitle,
        content: sanitizedContent,
        contentHash,
        version: 1,
        metadata: data.metadata || {},
        createdById: userId,
        ...(ctdSection ? { ctdSection } : {}),
      })
      .returning();

    // Insert first version
    await db.insert(concept2cureArtifactVersions).values({
      organizationId,
      artifactId: newDbArtifact.id,
      version: 1,
      content: sanitizedContent,
      contentHash,
      createdById: userId,
    });

    const newArtifact: Artifact = {
      id: artifactId,
      projectId: req.params.projectId,
      conversationId: data.conversationId,
      type: data.type,
      category: data.category,
      title: sanitizedTitle,
      content: sanitizedContent,
      version: 1,
      versions: [{ version: 1, content: sanitizedContent, createdAt: newDbArtifact.createdAt }],
      metadata: data.metadata,
      createdAt: newDbArtifact.createdAt,
      updatedAt: newDbArtifact.updatedAt,
    };

    // Log audit entry with content hash
    await logAuditEntry(req, 'CREATE', 'artifact', artifactId, null, {
      projectId: req.params.projectId,
      type: newArtifact.type,
      title: newArtifact.title,
      contentLength: sanitizedContent.length,
      contentHash,
    });

    // Emit provenance: document creation event
    await emitProvenanceEvent({
      artifactDbId: newDbArtifact.id,
      organizationId,
      eventType: 'generation',
      eventAction: data.metadata?.generationMethod === 'ai' ? 'ai_generate' : 'human_create',
      actorId: userId,
      actorName: (req as any).userName || req.userEmail,
      actorEmail: req.userEmail,
      details: {
        title: sanitizedTitle,
        type: data.type,
        category: data.category,
        contentLength: sanitizedContent.length,
        contentHash,
        ctdSection: ctdSection || null,
        conversationId: data.conversationId || null,
      },
      sourceDescription: data.conversationId
        ? `Created from conversation ${data.conversationId}`
        : 'Manual document creation',
      backendRoute: 'POST /api/concept2cure/projects/:projectId/artifacts',
      backendService: 'concept2cure',
      ipAddress: getClientIp(req),
    });

    logger.info('Created artifact', { projectId: req.params.projectId, artifactId });
    return sendSuccess(res.status(201), newArtifact);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation failed', error.errors, 'VALIDATION_ERROR');
    }
    logConcept2cureError('create artifact', error, { projectId: req.params.projectId });
    return sendError(res, 500, 'Failed to create artifact');
  }
});

/**
 * PUT /api/concept2cure/projects/:projectId/artifacts/:artifactId
 * Update an artifact (creates new version for 21 CFR Part 11 compliance - database-backed).
 */
router.put('/projects/:projectId/artifacts/:artifactId', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);

    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) {
      return sendError(res, 404, 'Project not found');
    }

    const { content, title } = req.body;

    // Find artifact in database
    const [dbArtifact] = await db
      .select()
      .from(concept2cureArtifacts)
      .where(
        and(
          eq(concept2cureArtifacts.artifactId, req.params.artifactId),
          eq(concept2cureArtifacts.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!dbArtifact) {
      return sendError(res, 404, 'Artifact not found');
    }

    // P1: Lock Enforcement — locked documents cannot be edited
    if (dbArtifact.status === 'locked') {
      return sendError(
        res,
        423,
        'Document is locked. Change status to draft or review before editing.'
      );
    }

    // P6: Optimistic Concurrency — reject stale writes
    const { expectedVersion } = req.body;
    if (expectedVersion !== undefined && expectedVersion !== null) {
      if (Number(expectedVersion) !== dbArtifact.version) {
        return res.status(409).json({
          success: false,
          error: {
            message: 'Conflict: document was modified by another user',
            code: 'VERSION_CONFLICT',
            details: {
              clientVersion: Number(expectedVersion),
              serverVersion: dbArtifact.version,
            },
          },
        });
      }
    }

    // Capture previous state for audit trail
    const previousState = {
      content: dbArtifact.content,
      title: dbArtifact.title,
      version: dbArtifact.version,
      contentHash: dbArtifact.contentHash,
    };

    // Sanitize inputs
    const sanitizedContent = content ? sanitizeContent(content) : null;
    const sanitizedTitle = title ? sanitizeContent(title) : null;

    let newVersion = dbArtifact.version;
    let newContent = dbArtifact.content;
    let newContentHash = dbArtifact.contentHash;
    let newTitle = dbArtifact.title;

    // Create new version if content changed (21 CFR Part 11 version control)
    if (sanitizedContent && sanitizedContent !== dbArtifact.content) {
      newVersion = dbArtifact.version + 1;
      newContent = sanitizedContent;
      newContentHash = calculateContentHash(sanitizedContent);

      // Insert new version record (immutable history)
      await db.insert(concept2cureArtifactVersions).values({
        organizationId,
        artifactId: dbArtifact.id,
        version: newVersion,
        content: sanitizedContent,
        contentHash: newContentHash,
        createdById: userId,
      });
    }

    if (sanitizedTitle) {
      newTitle = sanitizedTitle;
    }

    // Update artifact record
    const [updatedArtifact] = await db
      .update(concept2cureArtifacts)
      .set({
        title: newTitle,
        content: newContent,
        contentHash: newContentHash,
        version: newVersion,
        updatedAt: new Date(),
      })
      .where(eq(concept2cureArtifacts.id, dbArtifact.id))
      .returning();

    // Get all versions for response
    const versions = await db
      .select()
      .from(concept2cureArtifactVersions)
      .where(eq(concept2cureArtifactVersions.artifactId, dbArtifact.id))
      .orderBy(concept2cureArtifactVersions.version);

    const artifact: Artifact = {
      id: updatedArtifact.artifactId,
      projectId: req.params.projectId,
      conversationId: dbArtifact.conversationId?.toString(),
      type: updatedArtifact.type,
      category: updatedArtifact.category as Artifact['category'],
      title: updatedArtifact.title,
      content: updatedArtifact.content,
      version: updatedArtifact.version,
      versions: versions.map(v => ({
        version: v.version,
        content: v.content,
        createdAt: v.createdAt,
      })),
      metadata: updatedArtifact.metadata as Record<string, unknown>,
      status: updatedArtifact.status || 'draft',
      ctdSection: updatedArtifact.ctdSection,
      createdAt: updatedArtifact.createdAt,
      updatedAt: updatedArtifact.updatedAt,
    };

    // Log audit entry
    await logAuditEntry(req, 'UPDATE', 'artifact', req.params.artifactId, previousState, {
      content: artifact.content,
      title: artifact.title,
      version: artifact.version,
      contentHash: newContentHash,
    });

    // Emit provenance: edit event
    if (newVersion > dbArtifact.version) {
      await emitProvenanceEvent({
        artifactDbId: dbArtifact.id,
        organizationId,
        eventType: 'edit',
        eventAction: 'human_edit',
        actorId: userId,
        actorName: (req as any).userName || req.userEmail,
        actorEmail: req.userEmail,
        details: {
          fromVersion: dbArtifact.version,
          toVersion: newVersion,
          previousHash: dbArtifact.contentHash,
          newHash: newContentHash,
          titleChanged: sanitizedTitle ? sanitizedTitle !== dbArtifact.title : false,
          contentChanged: true,
        },
        sourceDescription: `Updated from v${dbArtifact.version} to v${newVersion}`,
        backendRoute: 'PUT /api/concept2cure/projects/:projectId/artifacts/:artifactId',
        backendService: 'concept2cure',
        ipAddress: getClientIp(req),
      });
    }

    logger.info('Updated artifact', {
      artifactId: req.params.artifactId,
      version: artifact.version,
    });
    return sendSuccess(res, artifact);
  } catch (error: any) {
    logConcept2cureError('update artifact', error, { artifactId: req.params.artifactId });
    return sendError(res, 500, 'Failed to update artifact');
  }
});

/**
 * PUT /api/concept2cure/projects/:projectId/artifacts/:artifactId/placement
 * Governed placement / relocation of an artifact within the CTD hierarchy.
 * Records a provenance event for the audit trail.
 */
router.put(
  '/projects/:projectId/artifacts/:artifactId/placement',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const userId = getUserId(req);
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);

      if (!hasAccess) {
        return sendError(res, 404, 'Project not found');
      }

      const { operation, fromSection, toSection, reason } = req.body;

      // Validate required fields
      if (!operation || !toSection || !reason) {
        return sendError(res, 400, 'Missing required fields: operation, toSection, reason');
      }
      if (!['reclassify', 'place', 'relocate'].includes(operation)) {
        return sendError(res, 400, 'Invalid operation. Must be: reclassify, place, or relocate');
      }
      if (typeof reason !== 'string' || reason.trim().length < 5) {
        return sendError(res, 400, 'Reason must be at least 5 characters');
      }
      if (typeof toSection !== 'string' || !/^[\dA-Z]+(\.[\dA-Z]+)*$/i.test(toSection)) {
        return sendError(res, 400, 'Invalid CTD section format (expected e.g. 3.2.S.1)');
      }

      // Find the artifact
      const [dbArtifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.artifactId, req.params.artifactId),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!dbArtifact) {
        return sendError(res, 404, 'Artifact not found');
      }

      // Locked artifacts cannot be moved
      if (dbArtifact.status === 'locked') {
        return sendError(res, 423, 'Document is locked. Unlock before changing placement.');
      }

      const previousSection = dbArtifact.ctdSection || null;

      // Update ctdSection on the artifact
      const [updated] = await db
        .update(concept2cureArtifacts)
        .set({
          ctdSection: toSection,
          updatedAt: new Date(),
        })
        .where(eq(concept2cureArtifacts.id, dbArtifact.id))
        .returning();

      // Log audit entry
      await logAuditEntry(
        req,
        'UPDATE',
        'artifact',
        req.params.artifactId,
        { ctdSection: previousSection },
        { ctdSection: toSection, operation, reason }
      );

      // Emit provenance event for the placement operation
      await emitProvenanceEvent({
        artifactDbId: dbArtifact.id,
        organizationId,
        eventType: 'placement',
        eventAction: operation,
        actorId: userId,
        actorName: (req as any).userName || req.userEmail,
        actorEmail: req.userEmail,
        details: {
          operation,
          fromSection: previousSection,
          toSection,
          reason: reason.trim(),
          title: dbArtifact.title,
        },
        sourceDescription: `${operation}: ${previousSection || '(unassigned)'} → ${toSection} — ${reason.trim()}`,
        backendRoute: 'PUT /api/concept2cure/projects/:projectId/artifacts/:artifactId/placement',
        backendService: 'concept2cure',
        ipAddress: getClientIp(req),
      });

      logger.info('Artifact placement updated', {
        artifactId: req.params.artifactId,
        operation,
        from: previousSection,
        to: toSection,
      });

      return sendSuccess(res, {
        id: updated.artifactId,
        ctdSection: updated.ctdSection,
        operation,
        previousSection,
      });
    } catch (error: any) {
      logConcept2cureError('artifact placement', error, {
        artifactId: req.params.artifactId,
      });
      return sendError(res, 500, 'Failed to update placement');
    }
  }
);

/**
 * POST /api/concept2cure/projects/:projectId/artifacts/:artifactId/signatures
 * Create an electronic signature for an artifact version (21 CFR Part 11).
 */
router.post(
  '/projects/:projectId/artifacts/:artifactId/signatures',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const userId = getUserId(req);
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);

      if (!hasAccess) {
        return sendError(res, 404, 'Project not found');
      }

      const data = createSignatureSchema.parse(req.body);

      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.artifactId, req.params.artifactId),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!artifact) {
        return sendError(res, 404, 'Artifact not found');
      }

      const targetVersion = data.version ?? artifact.version;
      const [versionRow] = await db
        .select()
        .from(concept2cureArtifactVersions)
        .where(
          and(
            eq(concept2cureArtifactVersions.artifactId, artifact.id),
            eq(concept2cureArtifactVersions.version, targetVersion)
          )
        )
        .limit(1);

      if (!versionRow) {
        return sendError(res, 404, 'Artifact version not found');
      }

      const signedAt = new Date();
      const signatureId = `sig_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      const signatureType = data.signatureType ?? 'approval';
      const signaturePurpose = sanitizeContent(data.signaturePurpose);
      const signatureMeaning = data.signatureMeaning
        ? sanitizeContent(data.signatureMeaning)
        : null;
      const signatureManifest = data.signatureManifest
        ? sanitizeObject(data.signatureManifest)
        : null;

      const signatureHash = calculateSignatureHash({
        signatureId,
        artifactId: artifact.artifactId,
        version: targetVersion,
        contentHash: versionRow.contentHash,
        signerId: userId,
        signatureType,
        signaturePurpose,
        signatureMeaning,
        signedAt: signedAt.toISOString(),
      });

      const signerName = (req as any).userName || req.userEmail || 'unknown';
      const signerEmail = req.userEmail || 'unknown';

      const [signature] = await db
        .insert(concept2cureSignatures)
        .values({
          organizationId,
          signatureId,
          artifactId: artifact.id,
          artifactVersionId: versionRow.id,
          signatureType,
          signaturePurpose,
          signatureMeaning,
          signerId: userId,
          signerName,
          signerEmail,
          signerRole: req.userRole || 'user',
          authenticationMethod: data.authenticationMethod,
          authenticationTimestamp: signedAt,
          secondFactorVerified: data.secondFactorVerified ?? false,
          signatureHash,
          signatureManifest,
          ipAddress: getClientIp(req),
          deviceInfo: null,
          status: 'active',
          signedAt,
        })
        .returning();

      await logAuditEntry(req, 'CREATE', 'signature', signatureId, null, {
        artifactId: req.params.artifactId,
        version: targetVersion,
        signatureType,
        signaturePurpose,
        signatureHash,
      });

      res.status(201);
      return sendSuccess(res, {
        id: signature.signatureId,
        artifactId: req.params.artifactId,
        version: targetVersion,
        signatureType,
        signaturePurpose,
        signatureMeaning,
        signerId: userId,
        signerName,
        signerEmail,
        signedAt: signature.signedAt,
        signatureHash,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return sendError(res, 400, 'Validation failed', error.errors);
      }
      logConcept2cureError('create signature', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to create signature');
    }
  }
);

/**
 * GET /api/concept2cure/projects/:projectId/artifacts/:artifactId/signatures
 * List electronic signatures for an artifact (21 CFR Part 11).
 */
router.get(
  '/projects/:projectId/artifacts/:artifactId/signatures',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.artifactId, req.params.artifactId),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!artifact) return sendError(res, 404, 'Artifact not found');

      const signatures = await db
        .select({
          signatureId: concept2cureSignatures.signatureId,
          signatureType: concept2cureSignatures.signatureType,
          signaturePurpose: concept2cureSignatures.signaturePurpose,
          signatureMeaning: concept2cureSignatures.signatureMeaning,
          signerName: concept2cureSignatures.signerName,
          signerEmail: concept2cureSignatures.signerEmail,
          signerRole: concept2cureSignatures.signerRole,
          signedAt: concept2cureSignatures.signedAt,
          signatureHash: concept2cureSignatures.signatureHash,
          status: concept2cureSignatures.status,
        })
        .from(concept2cureSignatures)
        .where(
          and(
            eq(concept2cureSignatures.artifactId, artifact.id),
            eq(concept2cureSignatures.organizationId, organizationId)
          )
        )
        .orderBy(concept2cureSignatures.signedAt);

      return sendSuccess(res, signatures);
    } catch (error: any) {
      logConcept2cureError('list signatures', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to list signatures');
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT PROVENANCE API
// Full provenance, auditability, and compliance traceability for any artifact
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/concept2cure/projects/:projectId/artifacts/:artifactId/provenance
 *
 * Returns comprehensive provenance data for an artifact, aggregated across:
 *   1. Document Identity (from artifacts table)
 *   2. Source Inputs (from provenance_events where eventType = 'source_input')
 *   3. Generation Lineage (from provenance_events where eventType = 'generation')
 *   4. Review / Edit History (from artifact_versions + provenance_events)
 *   5. Compliance / Security Metadata (from artifacts + signatures + provenance_events)
 *   6. Submission / Placement Context (from provenance_events where eventType = 'placement')
 */
router.get(
  '/projects/:projectId/artifacts/:artifactId/provenance',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);

      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) {
        return sendError(res, 404, 'Project not found');
      }

      // 1. Get artifact
      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.artifactId, req.params.artifactId),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!artifact) {
        return sendError(res, 404, 'Artifact not found');
      }

      // 2-5: Parallel sub-queries with graceful fallback per table
      const safeQuery = async <T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
        try {
          return await fn();
        } catch (e: any) {
          logger.warn(`provenance sub-query "${label}" failed: ${e.message}`);
          return fallback;
        }
      };

      const [versions, signatures, provenanceEvents, projectRow] = await Promise.all([
        safeQuery(
          'versions',
          () =>
            db
              .select()
              .from(concept2cureArtifactVersions)
              .where(eq(concept2cureArtifactVersions.artifactId, artifact.id))
              .orderBy(desc(concept2cureArtifactVersions.version)),
          []
        ),
        safeQuery(
          'signatures',
          () =>
            db
              .select()
              .from(concept2cureSignatures)
              .where(
                and(
                  eq(concept2cureSignatures.artifactId, artifact.id),
                  eq(concept2cureSignatures.organizationId, organizationId)
                )
              )
              .orderBy(desc(concept2cureSignatures.signedAt)),
          []
        ),
        safeQuery(
          'provenance_events',
          () =>
            db
              .select()
              .from(concept2cureProvenanceEvents)
              .where(
                and(
                  eq(concept2cureProvenanceEvents.artifactId, artifact.id),
                  eq(concept2cureProvenanceEvents.organizationId, organizationId)
                )
              )
              .orderBy(desc(concept2cureProvenanceEvents.createdAt)),
          []
        ),
        safeQuery(
          'project',
          () =>
            db
              .select({ id: projects.id, name: projects.name })
              .from(projects)
              .where(eq(projects.id, artifact.projectId))
              .limit(1)
              .then(rows => rows[0] || null),
          null
        ),
      ]);

      const project = projectRow;

      // Categorize provenance events
      const sourceInputs = provenanceEvents.filter(e => e.eventType === 'source_input');
      const generationEvents = provenanceEvents.filter(e => e.eventType === 'generation');
      const transformationEvents = provenanceEvents.filter(e => e.eventType === 'transformation');
      const exportEvents = provenanceEvents.filter(e => e.eventType === 'export');
      const placementEvents = provenanceEvents.filter(e => e.eventType === 'placement');

      // Build the 6-section provenance response
      const provenance = {
        // Section 1: Document Identity
        identity: {
          artifactId: artifact.artifactId,
          title: artifact.title,
          type: artifact.type,
          category: artifact.category,
          ctdSection: artifact.ctdSection,
          templateId: artifact.templateId,
          version: artifact.version,
          status: artifact.status,
          projectId: artifact.projectId,
          projectName: project?.name || null,
          createdAt: artifact.createdAt,
          updatedAt: artifact.updatedAt,
          createdById: artifact.createdById,
        },

        // Section 2: Source Inputs
        sourceInputs: sourceInputs.map(e => ({
          eventId: e.eventId,
          action: e.eventAction,
          description: e.sourceDescription,
          details: e.details,
          sourceArtifactId: e.sourceArtifactId,
          timestamp: e.createdAt,
        })),

        // Section 3: Generation Lineage
        generationLineage: {
          events: generationEvents.map(e => ({
            eventId: e.eventId,
            action: e.eventAction,
            description: e.sourceDescription,
            details: e.details,
            backendRoute: e.backendRoute,
            backendService: e.backendService,
            actorId: e.actorId,
            actorName: e.actorName,
            timestamp: e.createdAt,
          })),
          transformations: transformationEvents.map(e => ({
            eventId: e.eventId,
            action: e.eventAction,
            description: e.sourceDescription,
            details: e.details,
            timestamp: e.createdAt,
          })),
        },

        // Section 4: Review / Edit History
        editHistory: {
          versions: versions.map(v => ({
            version: v.version,
            contentHash: v.contentHash,
            changeDescription: v.changeDescription,
            createdById: v.createdById,
            createdAt: v.createdAt,
          })),
          totalVersions: versions.length,
          currentVersion: artifact.version,
        },

        // Section 5: Compliance / Security Metadata
        compliance: {
          contentHash: artifact.contentHash,
          versionChain: versions.map(v => ({
            version: v.version,
            hash: v.contentHash,
            timestamp: v.createdAt,
          })),
          lockStatus: {
            isLocked: artifact.status === 'locked',
            lockedAt: artifact.lockedAt,
            lockedById: artifact.lockedById,
          },
          signatures: signatures.map(s => ({
            signatureId: s.signatureId,
            type: s.signatureType,
            purpose: s.signaturePurpose,
            meaning: s.signatureMeaning,
            signerName: s.signerName,
            signerEmail: s.signerEmail,
            signerRole: s.signerRole,
            signedAt: s.signedAt,
            authenticationMethod: s.authenticationMethod,
            secondFactorVerified: s.secondFactorVerified,
          })),
          exportEvents: exportEvents.map(e => ({
            eventId: e.eventId,
            action: e.eventAction,
            details: e.details,
            actorName: e.actorName,
            timestamp: e.createdAt,
          })),
        },

        // Section 6: Submission / Placement Context
        placement: {
          projectId: artifact.projectId,
          projectName: project?.name || null,
          ctdSection: artifact.ctdSection,
          artifactId: artifact.artifactId,
          events: placementEvents.map(e => ({
            eventId: e.eventId,
            action: e.eventAction,
            description: e.sourceDescription,
            details: e.details,
            timestamp: e.createdAt,
          })),
        },
      };

      return sendSuccess(res, provenance);
    } catch (error: any) {
      logConcept2cureError('get provenance', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to fetch provenance data');
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// VERSION COMPARE API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/concept2cure/projects/:projectId/artifacts/:artifactId/versions
 * Returns all versions with full content for compare operations.
 */
router.get(
  '/projects/:projectId/artifacts/:artifactId/versions',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.artifactId, req.params.artifactId),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!artifact) return sendError(res, 404, 'Artifact not found');

      const versions = await db
        .select()
        .from(concept2cureArtifactVersions)
        .where(eq(concept2cureArtifactVersions.artifactId, artifact.id))
        .orderBy(desc(concept2cureArtifactVersions.version));

      return sendSuccess(res, {
        artifactId: artifact.artifactId,
        title: artifact.title,
        currentVersion: artifact.version,
        versions: versions.map(v => ({
          id: v.id,
          version: v.version,
          content: v.content,
          contentHash: v.contentHash,
          changeDescription: v.changeDescription,
          createdById: v.createdById,
          createdAt: v.createdAt,
        })),
      });
    } catch (error: any) {
      logConcept2cureError('get versions', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to fetch versions');
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT / COMPLIANCE REPORT API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/concept2cure/projects/:projectId/artifacts/:artifactId/audit-report
 * Generates an inspection-ready audit/compliance report for a document.
 * Query params: ?mode=summary|detailed (default: summary)
 */
router.get(
  '/projects/:projectId/artifacts/:artifactId/audit-report',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      const mode = (req.query.mode as string) === 'detailed' ? 'detailed' : 'summary';

      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.artifactId, req.params.artifactId),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!artifact) return sendError(res, 404, 'Artifact not found');

      // Gather all data
      const versions = await db
        .select()
        .from(concept2cureArtifactVersions)
        .where(eq(concept2cureArtifactVersions.artifactId, artifact.id))
        .orderBy(desc(concept2cureArtifactVersions.version));

      const signatures = await db
        .select()
        .from(concept2cureSignatures)
        .where(
          and(
            eq(concept2cureSignatures.artifactId, artifact.id),
            eq(concept2cureSignatures.organizationId, organizationId)
          )
        )
        .orderBy(desc(concept2cureSignatures.signedAt));

      const provenanceEvents = await db
        .select()
        .from(concept2cureProvenanceEvents)
        .where(
          and(
            eq(concept2cureProvenanceEvents.artifactId, artifact.id),
            eq(concept2cureProvenanceEvents.organizationId, organizationId)
          )
        )
        .orderBy(concept2cureProvenanceEvents.createdAt);

      const [project] = await db
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(eq(projects.id, artifact.projectId))
        .limit(1);

      // Emit export provenance event
      await emitProvenanceEvent({
        artifactId: artifact.id,
        organizationId,
        eventType: 'export',
        eventAction: 'audit_report_export',
        actorId: getUserId(req),
        actorName: (req as any).user?.email || 'system',
        details: { mode, format: 'json' },
        backendRoute: req.originalUrl,
        backendService: 'concept2cure',
        ipAddress: req.ip || null,
      });

      // Build report
      const generatedAt = new Date().toISOString();
      const report: Record<string, unknown> = {
        reportType:
          mode === 'detailed' ? 'Inspection-Ready Audit Report' : 'Document Intelligence Report',
        generatedAt,
        standard: '21 CFR Part 11 · ICH M8 eCTD v4.0',

        documentIdentity: {
          title: artifact.title,
          artifactId: artifact.artifactId,
          type: artifact.type,
          category: artifact.category,
          ctdSection: artifact.ctdSection || 'Not assigned',
          currentVersion: artifact.version,
          status: artifact.status,
          project: project?.name || `Project #${artifact.projectId}`,
          createdAt: artifact.createdAt,
          updatedAt: artifact.updatedAt,
        },

        integrityVerification: {
          currentHash: artifact.contentHash,
          algorithm: 'SHA-256',
          hashChain: versions.map(v => ({
            version: v.version,
            hash: v.contentHash,
            timestamp: v.createdAt,
          })),
          ...(() => {
            const verification = verifyIntegrityChain(artifact, versions);
            return {
              chainIntact: verification.chainIntact,
              currentHashVerified: verification.currentHashVerified,
              failureReason: verification.failureReason,
            };
          })(),
        },

        versionTimeline: versions.map(v => ({
          version: v.version,
          hash: v.contentHash,
          changeDescription: v.changeDescription || 'Initial version',
          createdAt: v.createdAt,
          createdById: v.createdById,
        })),

        sourceLineage: provenanceEvents
          .filter(e => e.eventType === 'source_input')
          .map(e => ({
            action: e.eventAction,
            description: e.sourceDescription,
            timestamp: e.createdAt,
            actor: e.actorName,
          })),

        generationLineage: provenanceEvents
          .filter(e => e.eventType === 'generation')
          .map(e => ({
            action: e.eventAction,
            description: e.sourceDescription,
            backendRoute: e.backendRoute,
            backendService: e.backendService,
            actor: e.actorName,
            actorType: e.actorName?.includes('system') ? 'system' : 'user',
            timestamp: e.createdAt,
          })),

        reviewSignatureSummary: {
          totalSignatures: signatures.length,
          signatures: signatures.map(s => ({
            signer: s.signerName,
            email: s.signerEmail,
            role: s.signerRole,
            purpose: s.signaturePurpose,
            meaning: s.signatureMeaning,
            method: s.authenticationMethod,
            twoFactorVerified: s.secondFactorVerified,
            signedAt: s.signedAt,
          })),
        },

        exportHistory: provenanceEvents
          .filter(e => e.eventType === 'export')
          .map(e => ({
            action: e.eventAction,
            actor: e.actorName,
            timestamp: e.createdAt,
            details: e.details,
          })),

        placementContext: {
          project: project?.name || `Project #${artifact.projectId}`,
          ctdSection: artifact.ctdSection,
          artifactId: artifact.artifactId,
          lockStatus: artifact.status === 'locked' ? 'Locked' : 'Unlocked',
          lockedAt: artifact.lockedAt,
        },
      };

      // In detailed mode, add full event timeline
      if (mode === 'detailed') {
        report.fullEventTimeline = provenanceEvents.map(e => ({
          eventId: e.eventId,
          eventType: e.eventType,
          action: e.eventAction,
          actor: e.actorName,
          actorEmail: e.actorEmail,
          description: e.sourceDescription,
          backendRoute: e.backendRoute,
          backendService: e.backendService,
          ipAddress: e.ipAddress,
          details: e.details,
          timestamp: e.createdAt,
        }));
      }

      return sendSuccess(res, report);
    } catch (error: any) {
      logConcept2cureError('audit report', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to generate audit report');
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT REPORT EXPORT AS ARTIFACT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/concept2cure/projects/:projectId/artifacts/:artifactId/audit-report/export
 * Generates the audit report and saves it as a new artifact (inspection-ready).
 */
router.post(
  '/projects/:projectId/artifacts/:artifactId/audit-report/export',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const userId = getUserId(req);
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.artifactId, req.params.artifactId),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!artifact) return sendError(res, 404, 'Artifact not found');

      // Build the audit report data directly (same as GET audit-report endpoint)
      const versions = await db
        .select()
        .from(concept2cureArtifactVersions)
        .where(eq(concept2cureArtifactVersions.artifactId, artifact.id))
        .orderBy(desc(concept2cureArtifactVersions.version));

      const signatures = await db
        .select()
        .from(concept2cureSignatures)
        .where(
          and(
            eq(concept2cureSignatures.artifactId, artifact.id),
            eq(concept2cureSignatures.organizationId, organizationId)
          )
        )
        .orderBy(desc(concept2cureSignatures.signedAt));

      const provenanceEvents = await db
        .select()
        .from(concept2cureProvenanceEvents)
        .where(
          and(
            eq(concept2cureProvenanceEvents.artifactId, artifact.id),
            eq(concept2cureProvenanceEvents.organizationId, organizationId)
          )
        )
        .orderBy(concept2cureProvenanceEvents.createdAt);

      const [project] = await db
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(eq(projects.id, artifact.projectId))
        .limit(1);

      const reportData = {
        reportType: 'Inspection-Ready Audit Report (Exported)',
        generatedAt: new Date().toISOString(),
        standard: '21 CFR Part 11 · ICH M8 eCTD v4.0',
        documentIdentity: {
          title: artifact.title,
          artifactId: artifact.artifactId,
          type: artifact.type,
          category: artifact.category,
          ctdSection: artifact.ctdSection || 'Not assigned',
          currentVersion: artifact.version,
          status: artifact.status,
          project: project?.name || `Project #${artifact.projectId}`,
          createdAt: artifact.createdAt,
          updatedAt: artifact.updatedAt,
        },
        integrityVerification: {
          currentHash: artifact.contentHash,
          algorithm: 'SHA-256',
          hashChain: versions.map((v: any) => ({
            version: v.version,
            hash: v.contentHash,
            timestamp: v.createdAt,
          })),
          ...(() => {
            const verification = verifyIntegrityChain(artifact, versions);
            return {
              chainIntact: verification.chainIntact,
              currentHashVerified: verification.currentHashVerified,
              failureReason: verification.failureReason,
            };
          })(),
        },
        versionTimeline: versions.map((v: any) => ({
          version: v.version,
          hash: v.contentHash,
          changeDescription: v.changeDescription || 'Initial version',
          createdAt: v.createdAt,
        })),
        signatureSummary: {
          totalSignatures: signatures.length,
          signatures: signatures.map((s: any) => ({
            signer: s.signerName,
            purpose: s.signaturePurpose,
            method: s.authenticationMethod,
            signedAt: s.signedAt,
          })),
        },
        totalProvenanceEvents: provenanceEvents.length,
      };

      // Create a new artifact containing the audit report
      const exportArtifactId = `audit_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      const reportContent = JSON.stringify(reportData, null, 2);
      const contentHash = crypto.createHash('sha256').update(reportContent).digest('hex');
      const now = new Date();

      const [exportedArtifact] = await db
        .insert(concept2cureArtifacts)
        .values({
          organizationId,
          projectId: artifact.projectId,
          artifactId: exportArtifactId,
          title: `Audit Report — ${artifact.title} — ${now.toISOString().split('T')[0]}`,
          content: reportContent,
          type: 'audit_report',
          category: 'compliance',
          version: 1,
          status: 'locked',
          contentHash,
          createdById: userId,
          ctdSection: artifact.ctdSection,
          lockedAt: now,
          lockedById: userId,
        })
        .returning();

      // Insert v1 into versions table
      await db.insert(concept2cureArtifactVersions).values({
        organizationId,
        artifactId: exportedArtifact.id,
        version: 1,
        content: reportContent,
        contentHash,
        changeDescription: `Audit report exported from ${artifact.title}`,
        createdById: userId,
      });

      // Log provenance on the ORIGINAL artifact
      await db.insert(concept2cureProvenanceEvents).values({
        organizationId,
        artifactId: artifact.id,
        eventId: `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
        eventType: 'export',
        eventAction: 'audit_report_export',
        sourceDescription: `Audit report exported as artifact ${exportArtifactId}`,
        actorId: userId,
        actorName: (req as any).userName || req.userEmail || 'unknown',
        actorEmail: req.userEmail || 'unknown',
        actorType: 'human',
        backendRoute: `/projects/${req.params.projectId}/artifacts/${req.params.artifactId}/audit-report/export`,
        backendService: 'concept2cure-api',
        ipAddress: getClientIp(req),
        details: {
          exportedArtifactId: exportArtifactId,
          reportMode: 'detailed',
          sourceArtifactVersion: artifact.version,
        },
      });

      await logAuditEntry(req, 'CREATE', 'audit_report_export', exportArtifactId, null, {
        sourceArtifactId: req.params.artifactId,
        exportedArtifactId: exportArtifactId,
      });

      res.status(201);
      return sendSuccess(res, {
        exportedArtifactId: exportArtifactId,
        title: exportedArtifact.title,
        id: exportedArtifact.id,
        status: 'locked',
        message: 'Audit report exported as inspection-ready artifact',
      });
    } catch (error: any) {
      logConcept2cureError('audit report export', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to export audit report');
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// ARTIFACT STATUS / LOCK MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PUT /api/concept2cure/projects/:projectId/artifacts/:artifactId/status
 * Change artifact status (draft → review → approved → locked).
 */
router.put(
  '/projects/:projectId/artifacts/:artifactId/status',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const userId = getUserId(req);
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      const { status } = req.body;
      const validStatuses = ['draft', 'review', 'approved', 'locked'];
      if (!status || !validStatuses.includes(status)) {
        return sendError(res, 400, `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
      }

      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.artifactId, req.params.artifactId),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!artifact) return sendError(res, 404, 'Artifact not found');

      const previousStatus = artifact.status;
      const updateData: Record<string, any> = {
        status,
        updatedAt: new Date(),
      };
      if (status === 'locked') {
        updateData.lockedAt = new Date();
        updateData.lockedById = userId;
      }
      if (status === 'draft' && previousStatus === 'locked') {
        updateData.lockedAt = null;
        updateData.lockedById = null;
      }

      const [updated] = await db
        .update(concept2cureArtifacts)
        .set(updateData)
        .where(eq(concept2cureArtifacts.id, artifact.id))
        .returning();

      // Log provenance
      await db.insert(concept2cureProvenanceEvents).values({
        organizationId,
        artifactId: artifact.id,
        eventId: `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
        eventType: 'status_change',
        eventAction: `status_${status}`,
        sourceDescription: `Status changed from ${previousStatus} to ${status}`,
        actorId: userId,
        actorName: (req as any).userName || req.userEmail || 'unknown',
        actorEmail: req.userEmail || 'unknown',
        actorType: 'human',
        backendRoute: `/projects/${req.params.projectId}/artifacts/${req.params.artifactId}/status`,
        backendService: 'concept2cure-api',
        ipAddress: getClientIp(req),
        details: { previousStatus, newStatus: status },
      });

      await logAuditEntry(req, 'UPDATE', 'artifact_status', req.params.artifactId, null, {
        previousStatus,
        newStatus: status,
      });

      return sendSuccess(res, {
        artifactId: updated.artifactId,
        status: updated.status,
        previousStatus,
        lockedAt: updated.lockedAt,
      });
    } catch (error: any) {
      logConcept2cureError('update artifact status', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to update artifact status');
    }
  }
);

/**
 * PUT /api/concept2cure/projects/:projectId/artifacts/:artifactId/ctd-section
 * Assign or update the CTD section placement for an artifact.
 */
router.put(
  '/projects/:projectId/artifacts/:artifactId/ctd-section',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const userId = getUserId(req);
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      const { ctdSection } = req.body;
      if (!ctdSection || typeof ctdSection !== 'string') {
        return sendError(res, 400, 'ctdSection is required');
      }

      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.artifactId, req.params.artifactId),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!artifact) return sendError(res, 404, 'Artifact not found');

      // Lock enforcement — cannot modify locked documents
      if (artifact.status === 'locked') {
        return sendError(
          res,
          423,
          'Document is locked. Change status to draft or review before modifying CTD section.'
        );
      }

      const previousSection = artifact.ctdSection;
      const [updated] = await db
        .update(concept2cureArtifacts)
        .set({ ctdSection, updatedAt: new Date() })
        .where(eq(concept2cureArtifacts.id, artifact.id))
        .returning();

      // Log provenance
      await db.insert(concept2cureProvenanceEvents).values({
        organizationId,
        artifactId: artifact.id,
        eventId: `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
        eventType: 'placement',
        eventAction: 'ctd_section_assign',
        sourceDescription: previousSection
          ? `CTD section changed from ${previousSection} to ${ctdSection}`
          : `Placed in CTD section ${ctdSection}`,
        actorId: userId,
        actorName: (req as any).userName || req.userEmail || 'unknown',
        actorEmail: req.userEmail || 'unknown',
        actorType: 'human',
        backendRoute: `/projects/${req.params.projectId}/artifacts/${req.params.artifactId}/ctd-section`,
        backendService: 'concept2cure-api',
        ipAddress: getClientIp(req),
        details: { previousSection, newSection: ctdSection },
      });

      return sendSuccess(res, {
        artifactId: updated.artifactId,
        ctdSection: updated.ctdSection,
        previousSection,
      });
    } catch (error: any) {
      logConcept2cureError('update ctd section', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to update CTD section');
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// P3: INTEGRITY VERIFICATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/concept2cure/projects/:projectId/artifacts/:artifactId/verify-integrity
 * Recompute SHA-256 hashes for every version and the current artifact content.
 * Returns real verification results — no hardcoded trust.
 */
router.get(
  '/projects/:projectId/artifacts/:artifactId/verify-integrity',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.artifactId, req.params.artifactId),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!artifact) return sendError(res, 404, 'Artifact not found');

      const versions = await db
        .select()
        .from(concept2cureArtifactVersions)
        .where(eq(concept2cureArtifactVersions.artifactId, artifact.id))
        .orderBy(concept2cureArtifactVersions.version);

      const verification = verifyIntegrityChain(artifact, versions);

      await logAuditEntry(req, 'READ', 'artifact', req.params.artifactId, null, {
        action: 'integrity_verification',
        chainIntact: verification.chainIntact,
      });

      return sendSuccess(res, {
        artifactId: artifact.artifactId,
        title: artifact.title,
        currentVersion: artifact.version,
        algorithm: 'SHA-256',
        verified: verification.chainIntact,
        currentHashVerified: verification.currentHashVerified,
        computedHash: verification.computedHash,
        storedHash: verification.storedHash,
        chainIntact: verification.chainIntact,
        failureReason: verification.failureReason,
        versionDetails: verification.versionDetails,
        verifiedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      logConcept2cureError('verify integrity', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to verify integrity');
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// P4: VERSION ROLLBACK
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/concept2cure/projects/:projectId/artifacts/:artifactId/rollback
 * Roll back to a previous version by creating a NEW version (v N+1) with old content.
 * Never mutates history — fully auditable.
 */
router.post(
  '/projects/:projectId/artifacts/:artifactId/rollback',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const userId = getUserId(req);
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      const { targetVersion } = req.body;
      if (!targetVersion || typeof targetVersion !== 'number' || targetVersion < 1) {
        return sendError(res, 400, 'targetVersion is required and must be a positive integer');
      }

      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.artifactId, req.params.artifactId),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!artifact) return sendError(res, 404, 'Artifact not found');

      // Lock enforcement
      if (artifact.status === 'locked') {
        return sendError(
          res,
          423,
          'Document is locked. Change status to draft or review before rolling back.'
        );
      }

      if (targetVersion >= artifact.version) {
        return sendError(
          res,
          400,
          `Cannot roll back to version ${targetVersion} — current version is ${artifact.version}`
        );
      }

      // Fetch the target version content
      const [targetVer] = await db
        .select()
        .from(concept2cureArtifactVersions)
        .where(
          and(
            eq(concept2cureArtifactVersions.artifactId, artifact.id),
            eq(concept2cureArtifactVersions.version, targetVersion)
          )
        )
        .limit(1);

      if (!targetVer) {
        return sendError(res, 404, `Version ${targetVersion} not found`);
      }

      // Create new version N+1 with the old content (immutable history)
      const newVersion = artifact.version + 1;
      const newContentHash = calculateContentHash(targetVer.content);

      await db.insert(concept2cureArtifactVersions).values({
        organizationId,
        artifactId: artifact.id,
        version: newVersion,
        content: targetVer.content,
        contentHash: newContentHash,
        changeDescription: `Rolled back to version ${targetVersion}`,
        createdById: userId,
      });

      // Update the artifact to the rolled-back content
      const [updated] = await db
        .update(concept2cureArtifacts)
        .set({
          content: targetVer.content,
          contentHash: newContentHash,
          version: newVersion,
          updatedAt: new Date(),
        })
        .where(eq(concept2cureArtifacts.id, artifact.id))
        .returning();

      // Log provenance
      await db.insert(concept2cureProvenanceEvents).values({
        organizationId,
        artifactId: artifact.id,
        eventId: `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
        eventType: 'rollback',
        eventAction: 'version_rollback',
        sourceDescription: `Rolled back from v${artifact.version} to v${targetVersion} content (created as v${newVersion})`,
        actorId: userId,
        actorName: (req as any).userName || req.userEmail || 'unknown',
        actorEmail: req.userEmail || 'unknown',
        actorType: 'human',
        backendRoute: `/projects/${req.params.projectId}/artifacts/${req.params.artifactId}/rollback`,
        backendService: 'concept2cure-api',
        ipAddress: getClientIp(req),
        details: {
          rolledBackFromVersion: artifact.version,
          targetVersion,
          newVersion,
          previousHash: artifact.contentHash,
          newHash: newContentHash,
        },
      });

      await logAuditEntry(
        req,
        'UPDATE',
        'artifact',
        req.params.artifactId,
        {
          version: artifact.version,
          contentHash: artifact.contentHash,
        },
        {
          version: newVersion,
          contentHash: newContentHash,
          rollbackTargetVersion: targetVersion,
        }
      );

      return sendSuccess(res, {
        artifactId: updated.artifactId,
        previousVersion: artifact.version,
        targetVersion,
        newVersion,
        contentHash: newContentHash,
        message: `Rolled back to version ${targetVersion} content (now version ${newVersion})`,
      });
    } catch (error: any) {
      logConcept2cureError('rollback artifact', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to rollback artifact');
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// P5: REVIEW COMMENTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/concept2cure/projects/:projectId/artifacts/:artifactId/comments
 * Add a review comment on an artifact at a specific version.
 */
router.post(
  '/projects/:projectId/artifacts/:artifactId/comments',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const userId = getUserId(req);
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      const { comment } = req.body;
      if (!comment || typeof comment !== 'string' || comment.trim().length === 0) {
        return sendError(res, 400, 'comment is required');
      }

      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.artifactId, req.params.artifactId),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!artifact) return sendError(res, 404, 'Artifact not found');

      const commentId = `cmt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      const sanitizedComment = sanitizeContent(comment.trim());

      const [inserted] = await db
        .insert(concept2cureReviewComments)
        .values({
          commentId,
          artifactId: artifact.id,
          organizationId,
          version: artifact.version,
          status: 'open',
          comment: sanitizedComment,
          userId,
          userName: (req as any).userName || req.userEmail || 'unknown',
        })
        .returning();

      // Log provenance
      await db.insert(concept2cureProvenanceEvents).values({
        organizationId,
        artifactId: artifact.id,
        eventId: `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
        eventType: 'review',
        eventAction: 'review_comment_added',
        sourceDescription: `Review comment added at version ${artifact.version}`,
        actorId: userId,
        actorName: (req as any).userName || req.userEmail || 'unknown',
        actorEmail: req.userEmail || 'unknown',
        actorType: 'human',
        backendRoute: `/projects/${req.params.projectId}/artifacts/${req.params.artifactId}/comments`,
        backendService: 'concept2cure-api',
        ipAddress: getClientIp(req),
        details: { commentId, version: artifact.version },
      });

      await logAuditEntry(req, 'CREATE', 'review_comment', commentId, null, {
        artifactId: req.params.artifactId,
        version: artifact.version,
        comment: sanitizedComment,
      });

      return sendSuccess(res, {
        commentId: inserted.commentId,
        artifactId: req.params.artifactId,
        version: inserted.version,
        status: inserted.status,
        comment: inserted.comment,
        userName: inserted.userName,
        createdAt: inserted.createdAt,
      });
    } catch (error: any) {
      logConcept2cureError('add review comment', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to add review comment');
    }
  }
);

/**
 * GET /api/concept2cure/projects/:projectId/artifacts/:artifactId/comments
 * List all review comments for an artifact.
 */
router.get(
  '/projects/:projectId/artifacts/:artifactId/comments',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.artifactId, req.params.artifactId),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!artifact) return sendError(res, 404, 'Artifact not found');

      const comments = await db
        .select()
        .from(concept2cureReviewComments)
        .where(
          and(
            eq(concept2cureReviewComments.artifactId, artifact.id),
            eq(concept2cureReviewComments.organizationId, organizationId)
          )
        )
        .orderBy(desc(concept2cureReviewComments.createdAt));

      return sendSuccess(res, {
        artifactId: req.params.artifactId,
        totalComments: comments.length,
        openComments: comments.filter(c => c.status === 'open').length,
        comments: comments.map(c => ({
          commentId: c.commentId,
          version: c.version,
          status: c.status,
          comment: c.comment,
          userName: c.userName,
          createdAt: c.createdAt,
          resolvedAt: c.resolvedAt,
        })),
      });
    } catch (error: any) {
      logConcept2cureError('list review comments', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to list review comments');
    }
  }
);

/**
 * PUT /api/concept2cure/projects/:projectId/artifacts/:artifactId/comments/:commentId/resolve
 * Resolve a review comment.
 */
router.put(
  '/projects/:projectId/artifacts/:artifactId/comments/:commentId/resolve',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const userId = getUserId(req);
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      const [comment] = await db
        .select()
        .from(concept2cureReviewComments)
        .where(
          and(
            eq(concept2cureReviewComments.commentId, req.params.commentId),
            eq(concept2cureReviewComments.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!comment) return sendError(res, 404, 'Comment not found');
      if (comment.status === 'resolved') {
        return sendError(res, 400, 'Comment is already resolved');
      }

      const [updated] = await db
        .update(concept2cureReviewComments)
        .set({
          status: 'resolved',
          resolvedById: userId,
          resolvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(concept2cureReviewComments.id, comment.id))
        .returning();

      await logAuditEntry(
        req,
        'UPDATE',
        'review_comment',
        req.params.commentId,
        {
          status: 'open',
        },
        {
          status: 'resolved',
          resolvedById: userId,
        }
      );

      return sendSuccess(res, {
        commentId: updated.commentId,
        status: updated.status,
        resolvedAt: updated.resolvedAt,
      });
    } catch (error: any) {
      logConcept2cureError('resolve review comment', error, { commentId: req.params.commentId });
      return sendError(res, 500, 'Failed to resolve comment');
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT LOG QUERY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/concept2cure/audit-logs
 * Query persisted audit log entries for the organization.
 */
router.get('/audit-logs', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { entityType, entityId, limit: limitParam } = req.query;
    const queryLimit = Math.min(Number(limitParam) || 50, 200);

    let query = db
      .select()
      .from(regulatoryAuditLogs)
      .where(eq(regulatoryAuditLogs.organizationId, organizationId))
      .orderBy(desc(regulatoryAuditLogs.timestamp))
      .limit(queryLimit);

    const logs = await query;

    // Filter in-memory for optional entityType/entityId (Drizzle doesn't support dynamic AND easily)
    let filtered = logs;
    if (entityType) {
      filtered = filtered.filter(l => l.entityType === entityType);
    }
    if (entityId) {
      filtered = filtered.filter(l => l.entityId === entityId);
    }

    return sendSuccess(res, {
      total: filtered.length,
      logs: filtered.map(l => ({
        auditId: l.auditId,
        entityType: l.entityType,
        entityId: l.entityId,
        action: l.action,
        actionCategory: l.actionCategory,
        userName: l.userName,
        userRole: l.userRole,
        ipAddress: l.ipAddress,
        isGxpRelevant: l.isGxpRelevant,
        timestamp: l.timestamp,
        previousValue: l.previousValue,
        newValue: l.newValue,
        metadata: l.metadata,
      })),
    });
  } catch (error: any) {
    logger.error('Failed to query audit logs', { error: error.message });
    return sendError(res, 500, 'Failed to query audit logs');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// Built-in templates for regulatory documents
const TEMPLATES = [
  {
    id: 'tpl_510k_cover',
    name: '510(k) Cover Letter',
    description: 'FDA-compliant cover letter for 510(k) submissions',
    submissionTypes: ['FDA_510K'],
    category: 'document',
    ctdSection: '1.1',
    content: `[DATE]

Food and Drug Administration
Center for Devices and Radiological Health
Document Mail Center - WO66-G609
10903 New Hampshire Avenue
Silver Spring, MD 20993-0002

Re: 510(k) Premarket Notification
Device Name: [DEVICE NAME]
Classification: [PRODUCT CODE]

Dear Sir or Madam:

[COMPANY NAME] is submitting this 510(k) premarket notification for our [DEVICE NAME]. We believe this device is substantially equivalent to [PREDICATE DEVICE] (K[NUMBER]).

Intended Use: [INTENDED USE]

This submission contains all required information per 21 CFR 807.87.

Sincerely,

[SIGNATURE]
[NAME], [TITLE]
[COMPANY]
[CONTACT]`,
  },
  {
    id: 'tpl_510k_summary',
    name: '510(k) Summary',
    description: 'Executive summary for 510(k) device submissions',
    submissionTypes: ['FDA_510K'],
    category: 'document',
    ctdSection: '1.2',
    content: `# 510(k) Summary

## 1. Submitter Information
- **Company**: [COMPANY NAME]
- **Address**: [ADDRESS]
- **Contact**: [CONTACT NAME], [TITLE]
- **Phone**: [PHONE]
- **Email**: [EMAIL]

## 2. Device Information
- **Device Name**: [DEVICE NAME]
- **Common Name**: [COMMON NAME]
- **Classification Name**: [CLASSIFICATION]
- **Product Code**: [CODE]
- **Regulation Number**: [REG NUMBER]

## 3. Predicate Device
- **Device Name**: [PREDICATE NAME]
- **510(k) Number**: K[NUMBER]
- **Manufacturer**: [MANUFACTURER]

## 4. Intended Use
[INTENDED USE STATEMENT]

## 5. Device Description
[DEVICE DESCRIPTION]

## 6. Substantial Equivalence
[SE DISCUSSION]

## 7. Performance Data Summary
[PERFORMANCE SUMMARY]`,
  },
  {
    id: 'tpl_ind_protocol',
    name: 'IND Clinical Protocol',
    description: 'Clinical trial protocol template for IND applications',
    submissionTypes: ['IND'],
    category: 'document',
    ctdSection: '5.3.5',
    content: `# Clinical Protocol

## Protocol Number: [PROTOCOL NUMBER]
## Version: [VERSION]
## Date: [DATE]

---

## 1. Protocol Synopsis
| Element | Description |
|---------|-------------|
| Title | [STUDY TITLE] |
| Phase | [PHASE] |
| Sponsor | [SPONSOR] |
| Indication | [INDICATION] |
| Primary Objective | [PRIMARY OBJECTIVE] |

## 2. Background and Rationale
[BACKGROUND]

## 3. Study Objectives
### 3.1 Primary Objective
[PRIMARY]

### 3.2 Secondary Objectives
[SECONDARY]

## 4. Study Design
[DESIGN DESCRIPTION]

## 5. Study Population
### 5.1 Inclusion Criteria
[INCLUSION]

### 5.2 Exclusion Criteria
[EXCLUSION]

## 6. Investigational Product
[IP DETAILS]

## 7. Efficacy Assessments
[EFFICACY]

## 8. Safety Assessments
[SAFETY]

## 9. Statistical Analysis
[STATISTICS]

## 10. Ethics
[ETHICS STATEMENT]`,
  },
  {
    id: 'tpl_cer_summary',
    name: 'Clinical Evaluation Report',
    description: 'EU MDR-compliant CER template',
    submissionTypes: ['MAA'],
    category: 'document',
    ctdSection: '2.7',
    content: `# Clinical Evaluation Report

## Document Information
| Field | Value |
|-------|-------|
| Device | [DEVICE NAME] |
| Manufacturer | [MANUFACTURER] |
| Version | [VERSION] |
| Date | [DATE] |
| Author | [AUTHOR] |

---

## 1. Executive Summary
[EXECUTIVE SUMMARY]

## 2. Scope of the Clinical Evaluation
### 2.1 Device Description
[DEVICE DESCRIPTION]

### 2.2 Intended Purpose
[INTENDED PURPOSE]

### 2.3 Target Population
[TARGET POPULATION]

## 3. Clinical Background
### 3.1 Current Knowledge
[CURRENT KNOWLEDGE]

### 3.2 State of the Art
[STATE OF ART]

## 4. Clinical Data Sources
### 4.1 Literature Search
[SEARCH METHODOLOGY]

### 4.2 Clinical Investigations
[CLINICAL INVESTIGATIONS]

### 4.3 Post-Market Data
[PMS DATA]

## 5. Data Analysis
[DATA ANALYSIS]

## 6. Benefit-Risk Analysis
[BENEFIT RISK]

## 7. Conclusions
[CONCLUSIONS]

## 8. Post-Market Clinical Follow-up
[PMCF PLAN]`,
  },
  {
    id: 'tpl_risk_analysis',
    name: 'Risk Analysis Template',
    description: 'ISO 14971 compliant risk analysis',
    submissionTypes: ['FDA_510K', 'PMA', 'DE_NOVO'],
    category: 'interactive',
    ctdSection: '4.2',
    content: JSON.stringify({
      type: 'risk_matrix',
      severityLevels: ['Negligible', 'Minor', 'Moderate', 'Major', 'Catastrophic'],
      probabilityLevels: ['Remote', 'Unlikely', 'Possible', 'Likely', 'Frequent'],
      risks: [],
    }),
  },
];

/**
 * GET /api/concept2cure/templates
 * List available templates, optionally filtered by submission type
 */
router.get('/templates', (req: Request, res: Response) => {
  try {
    const { submissionType } = req.query;

    let templates = TEMPLATES;
    if (submissionType) {
      templates = templates.filter(t => t.submissionTypes.includes(submissionType as string));
    }

    return sendSuccess(res, templates);
  } catch (error: any) {
    logger.error('Failed to fetch templates', { error: error.message });
    return sendError(res, 500, 'Failed to fetch templates');
  }
});

/**
 * GET /api/concept2cure/templates/:id
 * Get a specific template
 */
router.get('/templates/:id', (req: Request, res: Response) => {
  try {
    const template = TEMPLATES.find(t => t.id === req.params.id);

    if (!template) {
      return sendError(res, 404, 'Template not found');
    }

    return sendSuccess(res, template);
  } catch (error: any) {
    logger.error('Failed to fetch template', { error: error.message });
    return sendError(res, 500, 'Failed to fetch template');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DOCX DOWNLOAD
// GET /api/concept2cure/documents/download/:filename
// Serves generated DOCX files from the agent's document factory
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/documents/download/:filename', async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    // Sanitize: only allow alphanumeric, dashes, underscores, dots
    const safe = filename.replace(/[^a-zA-Z0-9_.\-]/g, '');
    if (!safe || safe !== filename || safe.includes('..')) {
      return sendError(res, 400, 'Invalid filename');
    }

    const { resolve, join } = await import('path');
    const { access } = await import('fs/promises');
    const { createReadStream } = await import('fs');

    const docDir = resolve(process.cwd(), 'generated_documents');
    const filePath = join(docDir, safe);

    // Ensure the resolved path is within generated_documents (prevent traversal)
    if (!filePath.startsWith(docDir)) {
      return sendError(res, 400, 'Invalid path');
    }

    await access(filePath);

    const isDocx = safe.endsWith('.docx');
    const isJson = safe.endsWith('.json');

    res.setHeader(
      'Content-Type',
      isDocx
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : isJson
          ? 'application/json'
          : 'application/octet-stream'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);

    createReadStream(filePath).pipe(res);
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return sendError(res, 404, 'Document not found');
    }
    logger.error('Download failed', { error: error.message });
    return sendError(res, 500, 'Download failed');
  }
});

export default router;
