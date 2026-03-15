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
import { eq, desc, and, isNull, inArray, or, sql } from 'drizzle-orm';
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
  users,
  organizationUsers,
  concept2cureConversations,
  concept2cureMessages,
  concept2cureArtifacts,
  concept2cureArtifactVersions,
  concept2cureSignatures,
  concept2cureProvenanceEvents,
  concept2cureReviewComments,
  concept2cureReviewAssignments,
  concept2cureReviewDecisions,
  concept2cureSubmissionSnapshots,
  concept2cureReviewThreads,
  concept2cureThreadComments,
  concept2cureReviewTasks,
  projectActivities,
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
    templateId: art.templateId,
    contentHash: art.contentHash,
    approvedVersionId: art.approvedVersionId,
    publishedVersionId: art.publishedVersionId,
    publishedAt: art.publishedAt,
    lockedAt: art.lockedAt,
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
 * GET /api/concept2cure/projects/:projectId/dossier-metrics
 * Returns per-CTD-section aggregation: artifact counts, status breakdown,
 * completion percentage, template coverage, and evidence linkage.
 * Computed from real artifact + provenance data only. No synthetic rollups.
 */
router.get('/projects/:projectId/dossier-metrics', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) {
      return sendError(res, 404, 'Project not found');
    }

    // Get project DB id
    const projectDbIdStr = req.params.projectId;
    const projectDbId = parseInt(projectDbIdStr, 10);
    if (isNaN(projectDbId)) {
      return sendError(res, 400, 'Invalid project ID');
    }

    // Fetch all artifacts for project
    const allArtifacts = await db
      .select({
        id: concept2cureArtifacts.id,
        artifactId: concept2cureArtifacts.artifactId,
        ctdSection: concept2cureArtifacts.ctdSection,
        status: concept2cureArtifacts.status,
        templateId: concept2cureArtifacts.templateId,
        type: concept2cureArtifacts.type,
      })
      .from(concept2cureArtifacts)
      .where(
        and(
          eq(concept2cureArtifacts.projectId, projectDbId),
          eq(concept2cureArtifacts.organizationId, organizationId)
        )
      );

    // Fetch provenance events related to evidence (source_input events)
    const artifactIds = allArtifacts.map(a => a.id);
    let evidenceEvents: { artifactId: number; eventType: string; eventAction: string }[] = [];
    if (artifactIds.length > 0) {
      evidenceEvents = await db
        .select({
          artifactId: concept2cureProvenanceEvents.artifactId,
          eventType: concept2cureProvenanceEvents.eventType,
          eventAction: concept2cureProvenanceEvents.eventAction,
        })
        .from(concept2cureProvenanceEvents)
        .where(
          and(
            inArray(concept2cureProvenanceEvents.artifactId, artifactIds),
            eq(concept2cureProvenanceEvents.organizationId, organizationId)
          )
        );
    }

    // Build per-artifact evidence map
    const artifactEvidenceMap = new Map<number, { sourceInputs: number; generations: number }>();
    for (const ev of evidenceEvents) {
      const entry = artifactEvidenceMap.get(ev.artifactId) || { sourceInputs: 0, generations: 0 };
      if (ev.eventType === 'source_input') entry.sourceInputs++;
      if (ev.eventType === 'generation') entry.generations++;
      artifactEvidenceMap.set(ev.artifactId, entry);
    }

    // Aggregate per CTD section
    const sectionMetrics: Record<
      string,
      {
        artifactCount: number;
        draftCount: number;
        reviewCount: number;
        approvedCount: number;
        lockedCount: number;
        templateCoverageAvailable: boolean;
        evidenceCount: number;
        precedentCount: number;
      }
    > = {};

    for (const art of allArtifacts) {
      const section = art.ctdSection || '_unplaced';
      if (!sectionMetrics[section]) {
        sectionMetrics[section] = {
          artifactCount: 0,
          draftCount: 0,
          reviewCount: 0,
          approvedCount: 0,
          lockedCount: 0,
          templateCoverageAvailable: false,
          evidenceCount: 0,
          precedentCount: 0,
        };
      }
      const m = sectionMetrics[section];
      m.artifactCount++;
      const s = (art.status || 'draft').toLowerCase();
      if (s === 'approved') m.approvedCount++;
      else if (s === 'locked' || s === 'published') m.lockedCount++;
      else if (s === 'review' || s === 'under_review') m.reviewCount++;
      else m.draftCount++;
      if (art.templateId) m.templateCoverageAvailable = true;
      const evidence = artifactEvidenceMap.get(art.id);
      if (evidence) {
        m.evidenceCount += evidence.sourceInputs;
        m.precedentCount += evidence.generations;
      }
    }

    // Compute completion per section
    const result: Record<
      string,
      {
        artifactCount: number;
        draftCount: number;
        reviewCount: number;
        approvedCount: number;
        lockedCount: number;
        completionPercent: number;
        templateCoverageAvailable: boolean;
        evidenceCount: number;
        precedentCount: number;
      }
    > = {};

    for (const [section, m] of Object.entries(sectionMetrics)) {
      let completionPercent = 0;
      if (m.artifactCount > 0) {
        // Weighted: locked=100, approved=85, review=60, draft=30
        const weighted =
          m.lockedCount * 100 + m.approvedCount * 85 + m.reviewCount * 60 + m.draftCount * 30;
        completionPercent = Math.round(weighted / m.artifactCount);
      }
      result[section] = { ...m, completionPercent };
    }

    return sendSuccess(res, result);
  } catch (error: any) {
    logConcept2cureError('dossier-metrics', error, { projectId: req.params.projectId });
    return sendError(res, 500, 'Failed to compute dossier metrics');
  }
});

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

      // ── Signing role check ────────────────────────────────────────
      const signerRole = (req.userRole || 'user').toLowerCase();
      const canSign = ['admin', 'approver', 'reviewer'].includes(signerRole);
      if (!canSign) {
        return sendError(res, 403, 'Your role does not permit electronic signatures');
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

/**
 * GET /api/concept2cure/projects/:projectId/artifacts/:artifactId/snapshots
 * List immutable submission/export snapshots for an artifact.
 */
router.get(
  '/projects/:projectId/artifacts/:artifactId/snapshots',
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

      const snapshots = await db
        .select({
          snapshotId: concept2cureSubmissionSnapshots.snapshotId,
          versionId: concept2cureSubmissionSnapshots.versionId,
          approvedVersionId: concept2cureSubmissionSnapshots.approvedVersionId,
          publishedVersionId: concept2cureSubmissionSnapshots.publishedVersionId,
          contentHash: concept2cureSubmissionSnapshots.contentHash,
          exportHash: concept2cureSubmissionSnapshots.exportHash,
          title: concept2cureSubmissionSnapshots.title,
          ctdSection: concept2cureSubmissionSnapshots.ctdSection,
          filename: concept2cureSubmissionSnapshots.filename,
          fileSize: concept2cureSubmissionSnapshots.fileSize,
          actionType: concept2cureSubmissionSnapshots.actionType,
          actorName: concept2cureSubmissionSnapshots.actorName,
          actorRole: concept2cureSubmissionSnapshots.actorRole,
          attestationText: concept2cureSubmissionSnapshots.attestationText,
          signatureMeaning: concept2cureSubmissionSnapshots.signatureMeaning,
          createdAt: concept2cureSubmissionSnapshots.createdAt,
        })
        .from(concept2cureSubmissionSnapshots)
        .where(
          and(
            eq(concept2cureSubmissionSnapshots.artifactId, artifact.id),
            eq(concept2cureSubmissionSnapshots.organizationId, organizationId)
          )
        )
        .orderBy(concept2cureSubmissionSnapshots.createdAt);

      return sendSuccess(res, snapshots);
    } catch (error: any) {
      logConcept2cureError('list snapshots', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to list snapshots');
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
 * Change artifact status with workflow enforcement.
 *
 * Valid transitions:
 *   draft   → review
 *   review  → approved | draft (regression — requires reason)
 *   approved → locked  | review (regression — requires reason)
 *   locked  → draft    (regression — requires reason)
 *
 * Role-based enforcement:
 *   author / user : draft → review only
 *   reviewer      : review → approved, review → draft
 *   approver / admin : approved → locked, locked → draft, rollback, publish
 *
 * Body: { status: string, reason?: string }
 */

// ── Role-based permission map for status transitions ───────────────────
const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: [
    'draft→review',
    'review→approved',
    'review→draft',
    'approved→locked',
    'approved→review',
    'locked→draft',
  ],
  approver: [
    'draft→review',
    'review→approved',
    'review→draft',
    'approved→locked',
    'approved→review',
    'locked→draft',
  ],
  reviewer: ['draft→review', 'review→approved', 'review→draft', 'approved→review'],
  author: ['draft→review'],
  user: ['draft→review'],
  viewer: [],
};

const ROLLBACK_ROLES = ['admin', 'approver', 'reviewer'];

/**
 * GET /api/concept2cure/user/permissions
 * Returns the current user's governance permissions based on their role.
 */
router.get('/user/permissions', async (req: Request, res: Response) => {
  try {
    const userRole = (req.userRole || 'user').toLowerCase();
    const allowedTransitions = ROLE_PERMISSIONS[userRole] || ROLE_PERMISSIONS['user'];
    const canRollback = ROLLBACK_ROLES.includes(userRole);
    const canSign = ['admin', 'approver', 'reviewer'].includes(userRole);
    const canExport = ['admin', 'approver', 'reviewer', 'author', 'user'].includes(userRole);

    return sendSuccess(res, {
      role: userRole,
      allowedTransitions,
      canRollback,
      canSign,
      canExport,
    });
  } catch (error: any) {
    return sendError(res, 500, 'Failed to fetch permissions');
  }
});

router.put(
  '/projects/:projectId/artifacts/:artifactId/status',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const userId = getUserId(req);
      const userRole = (req.userRole || 'user').toLowerCase();
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      const { status, reason, attestation } = req.body;
      const validStatuses = ['draft', 'review', 'approved', 'locked'];
      if (!status || !validStatuses.includes(status)) {
        return sendError(res, 400, `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
      }

      // ── Attestation required for approve and lock/publish ────────────
      const requiresAttestation = status === 'approved' || status === 'locked';
      if (requiresAttestation) {
        if (
          !attestation ||
          typeof attestation !== 'object' ||
          !attestation.meaning ||
          !attestation.attestationText
        ) {
          return sendError(
            res,
            400,
            `Attestation is required for ${status}. Must include: meaning (e.g. "Approved", "Released"), attestationText (acknowledgement of intent)`
          );
        }
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

      const previousStatus = artifact.status || 'draft';

      // ── Role-based permission check ──────────────────────────────────
      const transitionKey = `${previousStatus}→${status}`;
      const allowedTransitions = ROLE_PERMISSIONS[userRole] || ROLE_PERMISSIONS['user'];
      if (!allowedTransitions.includes(transitionKey)) {
        return sendError(
          res,
          403,
          `Role "${userRole}" is not permitted to perform transition: ${transitionKey}. ` +
            `Allowed transitions for your role: ${allowedTransitions.join(', ') || 'none'}`
        );
      }

      // ── Transition validation ────────────────────────────────────────
      const VALID_TRANSITIONS: Record<string, string[]> = {
        draft: ['review'],
        review: ['approved', 'draft'],
        approved: ['locked', 'review'],
        locked: ['draft'],
      };

      const allowed = VALID_TRANSITIONS[previousStatus] || [];
      if (!allowed.includes(status)) {
        return sendError(
          res,
          400,
          `Invalid transition: ${previousStatus} → ${status}. Allowed: ${allowed.join(', ')}`
        );
      }

      // ── Regression requires reason ───────────────────────────────────
      const REGRESSIONS: Record<string, string[]> = {
        review: ['draft'],
        approved: ['review'],
        locked: ['draft'],
      };
      const regressions = REGRESSIONS[previousStatus] || [];
      if (regressions.includes(status)) {
        if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
          return sendError(
            res,
            400,
            'Reason is required (min 5 characters) when regressing document status'
          );
        }
      }

      // ── P12: Review quorum gate ─────────────────────────────────────
      // Block review → approved if reviewers are assigned but not all approved.
      // Withdrawn assignments are excluded from the quorum check.
      if (previousStatus === 'review' && status === 'approved') {
        const roundAssignments = await db
          .select()
          .from(concept2cureReviewAssignments)
          .where(
            and(
              eq(concept2cureReviewAssignments.artifactId, artifact.id),
              eq(concept2cureReviewAssignments.organizationId, organizationId)
            )
          )
          .orderBy(desc(concept2cureReviewAssignments.reviewRound));

        if (roundAssignments.length > 0) {
          const latestRound = roundAssignments[0].reviewRound;
          // Exclude withdrawn assignments from quorum
          const activeAssignments = roundAssignments.filter(
            a => a.reviewRound === latestRound && a.status !== 'withdrawn'
          );

          if (activeAssignments.length === 0) {
            // All were withdrawn — no quorum to enforce, allow approval
          } else {
            const pendingReviews = activeAssignments.filter(a => a.status !== 'completed');

            if (pendingReviews.length > 0) {
              return sendError(
                res,
                400,
                `Cannot approve: ${pendingReviews.length} of ${activeAssignments.length} reviewers have not yet submitted their decision`
              );
            }

            // All completed — verify all decisions are "approve"
            const roundDecisions = await db
              .select()
              .from(concept2cureReviewDecisions)
              .where(
                and(
                  eq(concept2cureReviewDecisions.artifactId, artifact.id),
                  eq(concept2cureReviewDecisions.reviewRound, latestRound),
                  eq(concept2cureReviewDecisions.organizationId, organizationId)
                )
              );

            const nonApprovals = roundDecisions.filter(d => d.decision !== 'approve');
            if (nonApprovals.length > 0) {
              return sendError(
                res,
                400,
                `Cannot approve: ${nonApprovals.length} reviewer(s) did not approve (decisions: ${nonApprovals.map(d => d.decision).join(', ')})`
              );
            }
          }
        }
      }

      const updateData: Record<string, any> = {
        status,
        updatedAt: new Date(),
      };
      if (status === 'approved') {
        updateData.approvedVersionId = artifact.version;
      }
      if (status === 'locked') {
        updateData.lockedAt = new Date();
        updateData.lockedById = userId;
        updateData.publishedVersionId = artifact.version;
        updateData.publishedAt = new Date();
      }
      if (previousStatus === 'locked' && status === 'draft') {
        updateData.lockedAt = null;
        updateData.lockedById = null;
      }

      const [updated] = await db
        .update(concept2cureArtifacts)
        .set(updateData)
        .where(eq(concept2cureArtifacts.id, artifact.id))
        .returning();

      const signerName = (req as any).userName || req.userEmail || 'unknown';
      const signerEmail = req.userEmail || 'unknown';

      // ── Create attestation signature for approve/lock ────────────────
      let signatureRecord = null;
      if (requiresAttestation && attestation) {
        const signedAt = new Date();
        const signatureId = `sig_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
        const signaturePurpose =
          status === 'approved' ? 'approval_attestation' : 'publish_attestation';

        // Find version record for signature linkage
        const [versionRow] = await db
          .select()
          .from(concept2cureArtifactVersions)
          .where(
            and(
              eq(concept2cureArtifactVersions.artifactId, artifact.id),
              eq(concept2cureArtifactVersions.version, artifact.version)
            )
          )
          .limit(1);

        if (versionRow) {
          const signatureHash = crypto
            .createHash('sha256')
            .update(
              JSON.stringify({
                signatureId,
                artifactId: artifact.artifactId,
                version: artifact.version,
                contentHash: versionRow.contentHash,
                signerId: userId,
                signaturePurpose,
                signatureMeaning: attestation.meaning,
                signedAt: signedAt.toISOString(),
              })
            )
            .digest('hex');

          const [sig] = await db
            .insert(concept2cureSignatures)
            .values({
              organizationId,
              signatureId,
              artifactId: artifact.id,
              artifactVersionId: versionRow.id,
              signatureType: status === 'approved' ? 'approval' : 'publish',
              signaturePurpose,
              signatureMeaning: attestation.meaning,
              signerId: userId,
              signerName,
              signerEmail,
              signerRole: userRole,
              authenticationMethod: 'session_jwt',
              authenticationTimestamp: signedAt,
              secondFactorVerified: false,
              signatureHash,
              signatureManifest: {
                attestationText: attestation.attestationText,
                reason: attestation.reason || reason || null,
                previousStatus,
                newStatus: status,
              },
              ipAddress: getClientIp(req),
              deviceInfo: null,
              status: 'active',
              signedAt,
            })
            .returning();

          signatureRecord = {
            signatureId: sig.signatureId,
            signatureType: sig.signatureType,
            signatureMeaning: sig.signatureMeaning,
            signerName: sig.signerName,
            signerRole: sig.signerRole,
            signedAt: sig.signedAt,
            signatureHash: sig.signatureHash,
          };

          await logAuditEntry(req, 'SIGN', 'signature', signatureId, null, {
            artifactId: req.params.artifactId,
            version: artifact.version,
            signatureType: sig.signatureType,
            signaturePurpose,
            signatureMeaning: attestation.meaning,
            attestationText: attestation.attestationText,
          });
        }
      }

      // ── Create submission snapshot for lock/publish ──────────────────
      let snapshotRecord = null;
      if (status === 'locked') {
        const snapshotId = `snap_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
        const [snapshot] = await db
          .insert(concept2cureSubmissionSnapshots)
          .values({
            snapshotId,
            artifactId: artifact.id,
            organizationId,
            versionId: artifact.version,
            approvedVersionId: artifact.approvedVersionId ?? artifact.version,
            publishedVersionId: artifact.version,
            contentHash: artifact.contentHash || '',
            title: artifact.title,
            ctdSection: artifact.ctdSection,
            templateId: artifact.templateId,
            actionType: 'publish',
            actorId: userId,
            actorName: signerName,
            actorEmail: signerEmail,
            actorRole: userRole,
            attestationText: attestation?.attestationText || null,
            signatureMeaning: attestation?.meaning || null,
            metadata: {
              previousStatus,
              newStatus: status,
              reason: reason || null,
              signatureId: signatureRecord?.signatureId || null,
            },
          })
          .returning();

        snapshotRecord = {
          snapshotId: snapshot.snapshotId,
          versionId: snapshot.versionId,
          contentHash: snapshot.contentHash,
          actionType: snapshot.actionType,
          actorName: snapshot.actorName,
          createdAt: snapshot.createdAt,
        };
      }

      // Log provenance
      await db.insert(concept2cureProvenanceEvents).values({
        organizationId,
        artifactId: artifact.id,
        eventId: `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
        eventType: requiresAttestation ? 'approval' : 'status_change',
        eventAction: `status_${status}`,
        sourceDescription: `Status changed from ${previousStatus} to ${status}${
          attestation?.meaning ? ` (${attestation.meaning})` : ''
        }`,
        actorId: userId,
        actorName: (req as any).userName || req.userEmail || 'unknown',
        actorEmail: req.userEmail || 'unknown',
        backendRoute: `/projects/${req.params.projectId}/artifacts/${req.params.artifactId}/status`,
        backendService: 'concept2cure-api',
        ipAddress: getClientIp(req),
        details: {
          previousStatus,
          newStatus: status,
          reason: reason || null,
          attestation: attestation
            ? {
                meaning: attestation.meaning,
                attestationText: attestation.attestationText,
                signerName: (req as any).userName || req.userEmail || 'unknown',
                signerRole: userRole,
              }
            : null,
          signatureId: signatureRecord?.signatureId || null,
          snapshotId: snapshotRecord?.snapshotId || null,
        },
      });

      await logAuditEntry(
        req,
        requiresAttestation ? 'APPROVE' : 'UPDATE',
        'artifact_status',
        req.params.artifactId,
        null,
        {
          previousStatus,
          newStatus: status,
          reason: reason || null,
          attestation: attestation || null,
          signatureId: signatureRecord?.signatureId || null,
          snapshotId: snapshotRecord?.snapshotId || null,
        }
      );

      return sendSuccess(res, {
        artifactId: updated.artifactId,
        status: updated.status,
        previousStatus,
        lockedAt: updated.lockedAt,
        approvedVersionId: updated.approvedVersionId,
        publishedVersionId: updated.publishedVersionId,
        publishedAt: updated.publishedAt,
        enforcedRole: userRole,
        signature: signatureRecord,
        snapshot: snapshotRecord,
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
      const userRole = (req.userRole || 'user').toLowerCase();
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      // ── Role check: only reviewer, approver, admin can rollback ──────
      if (!ROLLBACK_ROLES.includes(userRole)) {
        return sendError(
          res,
          403,
          `Role "${userRole}" is not permitted to rollback. Requires: ${ROLLBACK_ROLES.join(', ')}`
        );
      }

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
// P12: MULTI-USER REVIEW OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/concept2cure/projects/:projectId/artifacts/:artifactId/reviewers
 * Assign one or more reviewers to an artifact for the current review round.
 * Only admin/approver/reviewer roles can assign reviewers.
 * Body: { reviewerIds: number[], dueDate?: string, notes?: string }
 */
router.post(
  '/projects/:projectId/artifacts/:artifactId/reviewers',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const userId = getUserId(req);
      const userRole = (req.userRole || 'user').toLowerCase();
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      if (!['admin', 'approver', 'reviewer'].includes(userRole)) {
        return sendError(res, 403, 'Only admin, approver, or reviewer can assign reviewers');
      }

      const { reviewerIds, dueDate, notes } = req.body;
      if (!Array.isArray(reviewerIds) || reviewerIds.length === 0) {
        return sendError(res, 400, 'reviewerIds must be a non-empty array of user IDs');
      }

      // Validate all IDs are numeric
      const numericIds = reviewerIds.map(Number);
      if (numericIds.some(isNaN)) {
        return sendError(res, 400, 'All reviewer IDs must be valid numbers');
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

      // Artifact must be in 'review' status to assign reviewers
      if (artifact.status !== 'review') {
        return sendError(
          res,
          400,
          `Cannot assign reviewers: artifact is in '${artifact.status}' status (must be 'review')`
        );
      }

      // Determine the current review round (max existing round, or 1 if none)
      const existingAssignments = await db
        .select({ reviewRound: concept2cureReviewAssignments.reviewRound })
        .from(concept2cureReviewAssignments)
        .where(eq(concept2cureReviewAssignments.artifactId, artifact.id))
        .orderBy(desc(concept2cureReviewAssignments.reviewRound))
        .limit(1);

      const reviewRound = existingAssignments.length > 0 ? existingAssignments[0].reviewRound : 1;

      // Verify all reviewer IDs belong to the same organization
      const validReviewers = await db
        .select({ userId: organizationUsers.userId, role: organizationUsers.role })
        .from(organizationUsers)
        .where(
          and(
            eq(organizationUsers.organizationId, organizationId),
            inArray(organizationUsers.userId, numericIds)
          )
        );

      const validIds = new Set(validReviewers.map(r => r.userId));
      const invalidIds = numericIds.filter((id: number) => !validIds.has(id));
      if (invalidIds.length > 0) {
        return sendError(res, 400, `Users not in organization: ${invalidIds.join(', ')}`);
      }

      // Self-review prevention: artifact author cannot be assigned as reviewer
      if (artifact.createdById) {
        if (numericIds.includes(artifact.createdById)) {
          return sendError(
            res,
            400,
            'The artifact author cannot be assigned as their own reviewer (GxP separation of duties)'
          );
        }
      }

      const parsedDueDate = dueDate ? new Date(dueDate) : null;
      const results = [];

      for (const reviewerId of numericIds) {
        const assignmentId = `asgn_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        try {
          const [inserted] = await db
            .insert(concept2cureReviewAssignments)
            .values({
              assignmentId,
              artifactId: artifact.id,
              organizationId,
              reviewerId,
              assignedById: userId,
              reviewRound,
              status: 'pending',
              dueDate: parsedDueDate,
              notes: notes ? sanitizeContent(notes) : null,
            })
            .returning();
          results.push({
            assignmentId: inserted.assignmentId,
            reviewerId: inserted.reviewerId,
            status: inserted.status,
            reviewRound: inserted.reviewRound,
          });
        } catch (dupErr: any) {
          if (dupErr.code === '23505') {
            // Duplicate — reviewer already assigned for this round
            results.push({
              reviewerId,
              status: 'already_assigned',
              reviewRound,
            });
          } else {
            throw dupErr;
          }
        }
      }

      // Log provenance for assignment
      await db.insert(concept2cureProvenanceEvents).values({
        organizationId,
        artifactId: artifact.id,
        eventId: `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
        eventType: 'review',
        eventAction: 'reviewer_assigned',
        sourceDescription: `Assigned ${numericIds.length} reviewer(s) for round ${reviewRound}`,
        actorId: userId,
        actorName: (req as any).userName || req.userEmail || 'unknown',
        actorEmail: req.userEmail || 'unknown',
        actorType: 'human',
        backendRoute: `/projects/${req.params.projectId}/artifacts/${req.params.artifactId}/reviewers`,
        backendService: 'concept2cure-api',
        ipAddress: getClientIp(req),
        details: {
          reviewerIds: numericIds,
          reviewRound,
          dueDate: parsedDueDate,
          assignmentCount: results.filter(r => r.status !== 'already_assigned').length,
        },
      });

      await logAuditEntry(req, 'CREATE', 'review_assignment', req.params.artifactId, null, {
        reviewerIds: numericIds,
        reviewRound,
        dueDate: parsedDueDate,
      });

      return sendSuccess(res, {
        artifactId: req.params.artifactId,
        reviewRound,
        assignments: results,
      });
    } catch (error: any) {
      logConcept2cureError('assign reviewers', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to assign reviewers');
    }
  }
);

/**
 * GET /api/concept2cure/projects/:projectId/artifacts/:artifactId/reviewers
 * List all review assignments for an artifact (all rounds).
 */
router.get(
  '/projects/:projectId/artifacts/:artifactId/reviewers',
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

      const assignments = await db
        .select({
          id: concept2cureReviewAssignments.id,
          assignmentId: concept2cureReviewAssignments.assignmentId,
          reviewerId: concept2cureReviewAssignments.reviewerId,
          reviewerName: users.name,
          reviewerEmail: users.email,
          reviewRound: concept2cureReviewAssignments.reviewRound,
          status: concept2cureReviewAssignments.status,
          dueDate: concept2cureReviewAssignments.dueDate,
          notes: concept2cureReviewAssignments.notes,
          createdAt: concept2cureReviewAssignments.createdAt,
        })
        .from(concept2cureReviewAssignments)
        .innerJoin(users, eq(users.id, concept2cureReviewAssignments.reviewerId))
        .where(
          and(
            eq(concept2cureReviewAssignments.artifactId, artifact.id),
            eq(concept2cureReviewAssignments.organizationId, organizationId)
          )
        )
        .orderBy(
          desc(concept2cureReviewAssignments.reviewRound),
          concept2cureReviewAssignments.createdAt
        );

      // Load decisions for each assignment
      const assignmentIds = assignments.map(a => a.id);
      const decisions =
        assignmentIds.length > 0
          ? await db
              .select()
              .from(concept2cureReviewDecisions)
              .where(inArray(concept2cureReviewDecisions.assignmentId, assignmentIds))
          : [];

      const decisionsByAssignment = new Map<number, (typeof decisions)[0]>();
      for (const d of decisions) {
        decisionsByAssignment.set(d.assignmentId, d);
      }

      return sendSuccess(res, {
        artifactId: req.params.artifactId,
        totalAssignments: assignments.length,
        assignments: assignments.map(a => ({
          assignmentId: a.assignmentId,
          reviewerId: a.reviewerId,
          reviewerName: a.reviewerName,
          reviewerEmail: a.reviewerEmail,
          reviewRound: a.reviewRound,
          status: a.status,
          dueDate: a.dueDate,
          notes: a.notes,
          createdAt: a.createdAt,
          decision: decisionsByAssignment.get(a.id)
            ? {
                decisionId: decisionsByAssignment.get(a.id)!.decisionId,
                decision: decisionsByAssignment.get(a.id)!.decision,
                comment: decisionsByAssignment.get(a.id)!.comment,
                versionReviewed: decisionsByAssignment.get(a.id)!.versionReviewed,
                createdAt: decisionsByAssignment.get(a.id)!.createdAt,
              }
            : null,
        })),
      });
    } catch (error: any) {
      logConcept2cureError('list reviewers', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to list reviewers');
    }
  }
);

/**
 * DELETE /api/concept2cure/projects/:projectId/artifacts/:artifactId/reviewers/:assignmentId
 * Withdraw a reviewer assignment. Only admin/approver can withdraw, and only if no decision submitted.
 */
router.delete(
  '/projects/:projectId/artifacts/:artifactId/reviewers/:assignmentId',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const userId = getUserId(req);
      const userRole = (req.userRole || 'user').toLowerCase();
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      if (!['admin', 'approver'].includes(userRole)) {
        return sendError(res, 403, 'Only admin or approver can withdraw reviewer assignments');
      }

      const [assignment] = await db
        .select()
        .from(concept2cureReviewAssignments)
        .where(
          and(
            eq(concept2cureReviewAssignments.assignmentId, req.params.assignmentId),
            eq(concept2cureReviewAssignments.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!assignment) return sendError(res, 404, 'Assignment not found');

      // Validate the assignment belongs to the artifact in the URL
      const [withdrawArtifact] = await db
        .select({ id: concept2cureArtifacts.id })
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.artifactId, req.params.artifactId),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!withdrawArtifact || assignment.artifactId !== withdrawArtifact.id) {
        return sendError(res, 404, 'Assignment not found for this artifact');
      }

      if (assignment.status === 'completed') {
        return sendError(
          res,
          400,
          'Cannot withdraw a completed assignment — reviewer has already submitted a decision'
        );
      }

      if (assignment.status === 'withdrawn') {
        return sendError(res, 400, 'Assignment is already withdrawn');
      }

      await db
        .update(concept2cureReviewAssignments)
        .set({ status: 'withdrawn', updatedAt: new Date() })
        .where(eq(concept2cureReviewAssignments.id, assignment.id));

      await db.insert(concept2cureProvenanceEvents).values({
        organizationId,
        artifactId: assignment.artifactId,
        eventId: `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
        eventType: 'review',
        eventAction: 'reviewer_withdrawn',
        sourceDescription: `Reviewer ${assignment.reviewerId} withdrawn from round ${assignment.reviewRound}`,
        actorId: userId,
        actorName: (req as any).userName || req.userEmail || 'unknown',
        actorEmail: req.userEmail || 'unknown',
        actorType: 'human',
        backendRoute: `/projects/${req.params.projectId}/artifacts/${req.params.artifactId}/reviewers/${req.params.assignmentId}`,
        backendService: 'concept2cure-api',
        ipAddress: getClientIp(req),
        details: { assignmentId: req.params.assignmentId, reviewerId: assignment.reviewerId },
      });

      await logAuditEntry(req, 'UPDATE', 'review_assignment', req.params.assignmentId, null, {
        action: 'withdrawn',
        reviewerId: assignment.reviewerId,
        reviewRound: assignment.reviewRound,
      });

      return sendSuccess(res, {
        assignmentId: req.params.assignmentId,
        status: 'withdrawn',
        reviewerId: assignment.reviewerId,
      });
    } catch (error: any) {
      logConcept2cureError('withdraw reviewer', error, { assignmentId: req.params.assignmentId });
      return sendError(res, 500, 'Failed to withdraw reviewer');
    }
  }
);

/**
 * POST /api/concept2cure/projects/:projectId/artifacts/:artifactId/reviews/submit
 * Submit a formal review decision for the current review round.
 * Body: { decision: 'approve'|'request_changes'|'reject', comment?: string }
 */
router.post(
  '/projects/:projectId/artifacts/:artifactId/reviews/submit',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const userId = getUserId(req);
      const userRole = (req.userRole || 'user').toLowerCase();
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      const { decision, comment } = req.body;
      const validDecisions = ['approve', 'request_changes', 'reject'];
      if (!decision || !validDecisions.includes(decision)) {
        return sendError(res, 400, `decision must be one of: ${validDecisions.join(', ')}`);
      }

      // Cap comment length
      if (comment && typeof comment === 'string' && comment.length > 5000) {
        return sendError(res, 400, 'Comment must not exceed 5000 characters');
      }

      // Only reviewer/approver/admin can submit decisions
      if (!['reviewer', 'approver', 'admin'].includes(userRole)) {
        return sendError(res, 403, 'Only reviewer, approver, or admin can submit review decisions');
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
      if (artifact.status !== 'review') {
        return sendError(res, 400, 'Artifact must be in review status to submit a decision');
      }

      // Self-review prevention: author cannot review their own artifact
      if (artifact.createdById && artifact.createdById === userId) {
        return sendError(
          res,
          403,
          'You cannot review an artifact you authored (GxP separation of duties)'
        );
      }

      // Find this user's pending assignment for the current round
      const [assignment] = await db
        .select()
        .from(concept2cureReviewAssignments)
        .where(
          and(
            eq(concept2cureReviewAssignments.artifactId, artifact.id),
            eq(concept2cureReviewAssignments.reviewerId, userId),
            eq(concept2cureReviewAssignments.organizationId, organizationId),
            inArray(concept2cureReviewAssignments.status, ['pending', 'in_progress'])
          )
        )
        .orderBy(desc(concept2cureReviewAssignments.reviewRound))
        .limit(1);

      if (!assignment) {
        return sendError(res, 403, 'You are not assigned as a reviewer for this artifact');
      }

      // Check for duplicate decision
      const [existingDecision] = await db
        .select()
        .from(concept2cureReviewDecisions)
        .where(eq(concept2cureReviewDecisions.assignmentId, assignment.id))
        .limit(1);

      if (existingDecision) {
        return sendError(res, 409, 'You have already submitted a decision for this review round');
      }

      const decisionId = `dec_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const sanitizedComment = comment ? sanitizeContent(comment.trim()) : null;

      const [inserted] = await db
        .insert(concept2cureReviewDecisions)
        .values({
          decisionId,
          assignmentId: assignment.id,
          artifactId: artifact.id,
          organizationId,
          reviewerId: userId,
          reviewRound: assignment.reviewRound,
          decision,
          comment: sanitizedComment,
          versionReviewed: artifact.version,
        })
        .returning();

      // Update assignment status
      await db
        .update(concept2cureReviewAssignments)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(eq(concept2cureReviewAssignments.id, assignment.id));

      // Log provenance
      await db.insert(concept2cureProvenanceEvents).values({
        organizationId,
        artifactId: artifact.id,
        eventId: `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
        eventType: 'review',
        eventAction: `review_decision_${decision}`,
        sourceDescription: `Reviewer submitted decision: ${decision} (round ${assignment.reviewRound})`,
        actorId: userId,
        actorName: (req as any).userName || req.userEmail || 'unknown',
        actorEmail: req.userEmail || 'unknown',
        actorType: 'human',
        backendRoute: `/projects/${req.params.projectId}/artifacts/${req.params.artifactId}/reviews/submit`,
        backendService: 'concept2cure-api',
        ipAddress: getClientIp(req),
        details: {
          decisionId,
          decision,
          reviewRound: assignment.reviewRound,
          versionReviewed: artifact.version,
        },
      });

      await logAuditEntry(req, 'CREATE', 'review_decision', decisionId, null, {
        artifactId: req.params.artifactId,
        decision,
        reviewRound: assignment.reviewRound,
        versionReviewed: artifact.version,
      });

      // Check if all reviewers in this round have completed
      const roundAssignments = await db
        .select()
        .from(concept2cureReviewAssignments)
        .where(
          and(
            eq(concept2cureReviewAssignments.artifactId, artifact.id),
            eq(concept2cureReviewAssignments.reviewRound, assignment.reviewRound),
            eq(concept2cureReviewAssignments.organizationId, organizationId)
          )
        );

      // Exclude withdrawn assignments from round summary (consistent with quorum gate)
      const activeAssignments = roundAssignments.filter(a => a.status !== 'withdrawn');
      const activeReviewerIds = new Set(activeAssignments.map(a => a.reviewerId));
      const totalAssigned = activeAssignments.length;
      const completedCount = activeAssignments.filter(a => a.status === 'completed').length;
      const allApproved =
        totalAssigned > 0 &&
        completedCount === totalAssigned &&
        (
          await db
            .select()
            .from(concept2cureReviewDecisions)
            .where(
              and(
                eq(concept2cureReviewDecisions.artifactId, artifact.id),
                eq(concept2cureReviewDecisions.reviewRound, assignment.reviewRound),
                eq(concept2cureReviewDecisions.organizationId, organizationId)
              )
            )
        )
          .filter(d => activeReviewerIds.has(d.reviewerId))
          .every(d => d.decision === 'approve');

      return sendSuccess(res, {
        decisionId: inserted.decisionId,
        decision: inserted.decision,
        reviewRound: inserted.reviewRound,
        versionReviewed: inserted.versionReviewed,
        roundSummary: {
          totalAssigned,
          completedCount,
          pendingCount: totalAssigned - completedCount,
          allApproved,
          readyForApproval: allApproved && completedCount === totalAssigned,
        },
      });
    } catch (error: any) {
      logConcept2cureError('submit review decision', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to submit review decision');
    }
  }
);

/**
 * GET /api/concept2cure/projects/:projectId/artifacts/:artifactId/reviews/status
 * Get the review status for an artifact: assignments, decisions, quorum progress.
 */
router.get(
  '/projects/:projectId/artifacts/:artifactId/reviews/status',
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

      // Get all assignments for the latest round
      const allAssignments = await db
        .select()
        .from(concept2cureReviewAssignments)
        .where(
          and(
            eq(concept2cureReviewAssignments.artifactId, artifact.id),
            eq(concept2cureReviewAssignments.organizationId, organizationId)
          )
        )
        .orderBy(desc(concept2cureReviewAssignments.reviewRound));

      if (allAssignments.length === 0) {
        return sendSuccess(res, {
          artifactId: req.params.artifactId,
          artifactStatus: artifact.status,
          hasReviewers: false,
          currentRound: 0,
          reviewers: [],
          readyForApproval: false,
        });
      }

      const currentRound = allAssignments[0].reviewRound;
      const roundAssignments = allAssignments.filter(a => a.reviewRound === currentRound);
      const activeAssignments = roundAssignments.filter(a => a.status !== 'withdrawn');

      // Get decisions for the current round
      const decisions = await db
        .select()
        .from(concept2cureReviewDecisions)
        .where(
          and(
            eq(concept2cureReviewDecisions.artifactId, artifact.id),
            eq(concept2cureReviewDecisions.reviewRound, currentRound),
            eq(concept2cureReviewDecisions.organizationId, organizationId)
          )
        );

      const decisionMap = new Map(decisions.map(d => [d.reviewerId, d]));

      // Get reviewer details
      const reviewerIds = roundAssignments.map(a => a.reviewerId);
      const reviewerDetails =
        reviewerIds.length > 0
          ? await db
              .select({ id: users.id, name: users.name, email: users.email })
              .from(users)
              .where(inArray(users.id, reviewerIds))
          : [];
      const reviewerMap = new Map(reviewerDetails.map(u => [u.id, u]));

      const totalAssigned = activeAssignments.length;
      const completedCount = activeAssignments.filter(a => a.status === 'completed').length;
      // Filter decisions to only active (non-withdrawn) reviewers
      const activeReviewerIds = new Set(activeAssignments.map(a => a.reviewerId));
      const activeDecisions = decisions.filter(d => activeReviewerIds.has(d.reviewerId));
      const allApproved =
        totalAssigned > 0 &&
        completedCount === totalAssigned &&
        activeDecisions.length === totalAssigned &&
        activeDecisions.every(d => d.decision === 'approve');

      return sendSuccess(res, {
        artifactId: req.params.artifactId,
        artifactStatus: artifact.status,
        hasReviewers: true,
        currentRound,
        totalAssigned,
        completedCount,
        pendingCount: totalAssigned - completedCount,
        allApproved,
        readyForApproval: allApproved,
        reviewers: roundAssignments.map(a => {
          const reviewer = reviewerMap.get(a.reviewerId);
          const dec = decisionMap.get(a.reviewerId);
          return {
            assignmentId: a.assignmentId,
            reviewerId: a.reviewerId,
            reviewerName: reviewer?.name || 'Unknown',
            reviewerEmail: reviewer?.email || '',
            status: a.status,
            dueDate: a.dueDate,
            decision: dec
              ? {
                  decision: dec.decision,
                  comment: dec.comment,
                  versionReviewed: dec.versionReviewed,
                  createdAt: dec.createdAt,
                }
              : null,
          };
        }),
      });
    } catch (error: any) {
      logConcept2cureError('review status', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to fetch review status');
    }
  }
);

/**
 * GET /api/concept2cure/reviews/pending
 * Reviewer dashboard: list all pending review assignments for the current user.
 */
router.get('/reviews/pending', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);

    const pendingAssignments = await db
      .select({
        assignmentId: concept2cureReviewAssignments.assignmentId,
        artifactId: concept2cureArtifacts.artifactId,
        artifactTitle: concept2cureArtifacts.title,
        artifactStatus: concept2cureArtifacts.status,
        artifactVersion: concept2cureArtifacts.version,
        reviewRound: concept2cureReviewAssignments.reviewRound,
        status: concept2cureReviewAssignments.status,
        dueDate: concept2cureReviewAssignments.dueDate,
        notes: concept2cureReviewAssignments.notes,
        createdAt: concept2cureReviewAssignments.createdAt,
        projectId: concept2cureArtifacts.projectId,
      })
      .from(concept2cureReviewAssignments)
      .innerJoin(
        concept2cureArtifacts,
        eq(concept2cureArtifacts.id, concept2cureReviewAssignments.artifactId)
      )
      .where(
        and(
          eq(concept2cureReviewAssignments.reviewerId, userId),
          eq(concept2cureReviewAssignments.organizationId, organizationId),
          inArray(concept2cureReviewAssignments.status, ['pending', 'in_progress']),
          eq(concept2cureArtifacts.status, 'review')
        )
      )
      .orderBy(concept2cureReviewAssignments.dueDate, concept2cureReviewAssignments.createdAt);

    return sendSuccess(res, {
      totalPending: pendingAssignments.length,
      assignments: pendingAssignments.map(a => ({
        assignmentId: a.assignmentId,
        artifactId: a.artifactId,
        artifactTitle: a.artifactTitle,
        artifactStatus: a.artifactStatus,
        artifactVersion: a.artifactVersion,
        projectId: a.projectId,
        reviewRound: a.reviewRound,
        status: a.status,
        dueDate: a.dueDate,
        notes: a.notes,
        createdAt: a.createdAt,
      })),
    });
  } catch (error: any) {
    logConcept2cureError('pending reviews', error);
    return sendError(res, 500, 'Failed to fetch pending reviews');
  }
});

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
    // ── Export role check ───────────────────────────────────────────
    const exportRole = (req.userRole || 'user').toLowerCase();
    const canExport = ['admin', 'approver', 'reviewer', 'author', 'user'].includes(exportRole);
    if (!canExport) {
      return sendError(res, 403, 'Your role does not permit document exports');
    }

    const { filename } = req.params;
    // Sanitize: only allow alphanumeric, dashes, underscores, dots
    const safe = filename.replace(/[^a-zA-Z0-9_.\-]/g, '');
    if (!safe || safe !== filename || safe.includes('..')) {
      return sendError(res, 400, 'Invalid filename');
    }

    const { resolve, join } = await import('path');
    const { access, stat } = await import('fs/promises');
    const { createReadStream } = await import('fs');

    const docDir = resolve(process.cwd(), 'generated_documents');
    const filePath = join(docDir, safe);

    // Ensure the resolved path is within generated_documents (prevent traversal)
    if (!filePath.startsWith(docDir)) {
      return sendError(res, 400, 'Invalid path');
    }

    await access(filePath);
    const fileStat = await stat(filePath);

    // ── Audit: log every export/download ──────────────────────────────
    const exportHash = crypto
      .createHash('sha256')
      .update(`${safe}:${fileStat.size}:${fileStat.mtimeMs}`)
      .digest('hex');
    await logAuditEntry(req, 'EXPORT', 'artifact', safe, null, {
      filename: safe,
      fileSize: fileStat.size,
      exportHash,
      exportedAt: new Date().toISOString(),
      exportedBy: req.userEmail || 'unknown',
      exportedByRole: req.userRole || 'user',
    });

    // ── Provenance: record export event ───────────────────────────────
    try {
      const organizationId = getOrganizationId(req);
      const userId = getUserId(req);
      const actorName = (req as any).userName || req.userEmail || 'unknown';
      const actorEmail = req.userEmail || 'unknown';
      const actorRole = (req.userRole || 'user').toLowerCase();

      await db.insert(concept2cureProvenanceEvents).values({
        organizationId,
        eventId: `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
        eventType: 'export',
        eventAction: 'document_download',
        sourceDescription: `Document "${safe}" downloaded (${fileStat.size} bytes)`,
        actorId: userId,
        actorName,
        actorEmail,
        backendRoute: `/documents/download/${safe}`,
        backendService: 'concept2cure-api',
        ipAddress: getClientIp(req),
        details: { filename: safe, fileSize: fileStat.size, exportHash },
      });

      // ── Snapshot: create export snapshot record ─────────────────────
      // Try to find matching artifact by filename pattern
      const filenameBase = safe.replace(/\.(docx|pdf|json)$/, '');
      const matchingArtifacts = await db
        .select()
        .from(concept2cureArtifacts)
        .where(eq(concept2cureArtifacts.organizationId, organizationId))
        .limit(50);

      const matchedArtifact = matchingArtifacts.find(
        a =>
          a.title?.toLowerCase().replace(/\s+/g, '_').includes(filenameBase.toLowerCase()) ||
          filenameBase.toLowerCase().includes(a.title?.toLowerCase().replace(/\s+/g, '_') || '---')
      );

      const snapshotId = `snap_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      await db.insert(concept2cureSubmissionSnapshots).values({
        snapshotId,
        artifactId: matchedArtifact?.id || 0,
        organizationId,
        versionId: matchedArtifact?.version || 0,
        approvedVersionId: matchedArtifact?.approvedVersionId ?? null,
        publishedVersionId: matchedArtifact?.publishedVersionId ?? null,
        contentHash: exportHash,
        exportHash,
        title: matchedArtifact?.title || safe,
        ctdSection: matchedArtifact?.ctdSection || null,
        templateId: matchedArtifact?.templateId || null,
        filename: safe,
        fileSize: fileStat.size,
        actionType: 'export-docx',
        actorId: userId,
        actorName,
        actorEmail,
        actorRole,
        metadata: {
          filename: safe,
          fileSize: fileStat.size,
          exportHash,
          exportedAt: new Date().toISOString(),
          artifactId: matchedArtifact?.artifactId || null,
        },
      });
    } catch {
      // Don't fail download if provenance/snapshot logging fails
    }

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

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 4 — PROGRAM TWIN / VERIFICATION / CHANGE IMPACT / TRANSFORM CONTEXT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/concept2cure/projects/:projectId/program-twin
 * Aggregates project state across dossier, evidence, template, governance,
 * and readiness dimensions. Returns a unified program model.
 * All values labeled as deterministic, heuristic, or inferred.
 */
router.get('/projects/:projectId/program-twin', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) return sendError(res, 404, 'Project not found');

    const projectDbId = parseInt(req.params.projectId, 10);
    if (isNaN(projectDbId)) return sendError(res, 400, 'Invalid project ID');

    // Fetch all artifacts
    const allArtifacts = await db
      .select()
      .from(concept2cureArtifacts)
      .where(
        and(
          eq(concept2cureArtifacts.projectId, projectDbId),
          eq(concept2cureArtifacts.organizationId, organizationId)
        )
      );

    const artifactIds = allArtifacts.map(a => a.id);

    // Fetch provenance events
    let provenanceEvents: any[] = [];
    if (artifactIds.length > 0) {
      provenanceEvents = await db
        .select()
        .from(concept2cureProvenanceEvents)
        .where(
          and(
            inArray(concept2cureProvenanceEvents.artifactId, artifactIds),
            eq(concept2cureProvenanceEvents.organizationId, organizationId)
          )
        );
    }

    // Fetch signatures
    let signatures: any[] = [];
    if (artifactIds.length > 0) {
      signatures = await db
        .select()
        .from(concept2cureSignatures)
        .where(inArray(concept2cureSignatures.artifactId, artifactIds));
    }

    // Fetch review comments
    let reviewComments: any[] = [];
    if (artifactIds.length > 0) {
      reviewComments = await db
        .select()
        .from(concept2cureReviewComments)
        .where(inArray(concept2cureReviewComments.artifactId, artifactIds));
    }

    // ── Dossier state ──
    const totalArtifacts = allArtifacts.length;
    const draftCount = allArtifacts.filter(a => (a.status || 'draft') === 'draft').length;
    const reviewCount = allArtifacts.filter(a => (a.status || '') === 'review').length;
    const approvedCount = allArtifacts.filter(a => (a.status || '') === 'approved').length;
    const lockedCount = allArtifacts.filter(a => (a.status || '') === 'locked').length;
    const placedCount = allArtifacts.filter(a => !!a.ctdSection).length;
    const unplacedCount = totalArtifacts - placedCount;

    // Per-module breakdown
    const moduleBreakdown: Record<
      string,
      { total: number; draft: number; review: number; approved: number; locked: number }
    > = {};
    for (const art of allArtifacts) {
      const section = art.ctdSection || '_unplaced';
      const mod = section === '_unplaced' ? '_unplaced' : section.split('.')[0];
      const moduleKey = `Module ${mod}`;
      if (!moduleBreakdown[moduleKey]) {
        moduleBreakdown[moduleKey] = { total: 0, draft: 0, review: 0, approved: 0, locked: 0 };
      }
      const mb = moduleBreakdown[moduleKey];
      mb.total++;
      const s = (art.status || 'draft').toLowerCase();
      if (s === 'approved') mb.approved++;
      else if (s === 'locked') mb.locked++;
      else if (s === 'review') mb.review++;
      else mb.draft++;
    }

    // ── Evidence state ──
    const sourceInputEvents = provenanceEvents.filter(e => e.eventType === 'source_input');
    const generationEvents = provenanceEvents.filter(e => e.eventType === 'generation');
    const evidenceBackedIds = new Set(sourceInputEvents.map(e => e.artifactId));
    const precedentBackedIds = new Set(generationEvents.map(e => e.artifactId));
    const evidenceBackedCount = evidenceBackedIds.size;
    const precedentBackedCount = precedentBackedIds.size;
    const noEvidenceCount = totalArtifacts - evidenceBackedIds.size;
    const noEvidenceArtifacts = allArtifacts
      .filter(a => !evidenceBackedIds.has(a.id))
      .map(a => ({ id: a.artifactId, title: a.title, ctdSection: a.ctdSection }));

    // ── Template state ──
    const withTemplate = allArtifacts.filter(a => !!a.templateId);
    const withoutTemplate = allArtifacts.filter(a => !a.templateId);

    // ── Governance state ──
    const signedArtifactIds = new Set(signatures.map(s => s.artifactId));
    const unresolvedComments = reviewComments.filter(c => !c.resolvedAt);
    const placementEvents = provenanceEvents.filter(e => e.eventType === 'placement');

    // ── Readiness (heuristic) ──
    const authoringReadiness =
      totalArtifacts > 0
        ? Math.round(((approvedCount + lockedCount + reviewCount) / totalArtifacts) * 100)
        : 0;
    const reviewReadiness =
      totalArtifacts > 0 ? Math.round(((approvedCount + lockedCount) / totalArtifacts) * 100) : 0;
    const submissionReadiness =
      totalArtifacts > 0 ? Math.round((lockedCount / totalArtifacts) * 100) : 0;

    // ── Problems list ──
    const problems: {
      severity: 'error' | 'warning' | 'info';
      message: string;
      artifactId?: string;
      ctdSection?: string;
    }[] = [];
    if (unplacedCount > 0) {
      problems.push({
        severity: 'warning',
        message: `${unplacedCount} artifact(s) not placed in dossier`,
      });
    }
    if (noEvidenceCount > 0) {
      problems.push({
        severity: 'warning',
        message: `${noEvidenceCount} artifact(s) have no evidence linkage`,
      });
    }
    if (unresolvedComments.length > 0) {
      problems.push({
        severity: 'error',
        message: `${unresolvedComments.length} unresolved review comment(s)`,
      });
    }
    if (withoutTemplate.length > 0) {
      problems.push({
        severity: 'info',
        message: `${withoutTemplate.length} artifact(s) created without template`,
      });
    }

    return sendSuccess(res, {
      confidence: 'deterministic',
      dossier: {
        confidence: 'deterministic',
        totalArtifacts,
        draftCount,
        reviewCount,
        approvedCount,
        lockedCount,
        placedCount,
        unplacedCount,
        moduleBreakdown,
      },
      evidence: {
        confidence: 'inferred',
        evidenceBackedCount,
        precedentBackedCount,
        noEvidenceCount,
        totalSourceInputEvents: sourceInputEvents.length,
        totalGenerationEvents: generationEvents.length,
        noEvidenceArtifacts: noEvidenceArtifacts.slice(0, 20),
      },
      template: {
        confidence: 'deterministic',
        withTemplateCount: withTemplate.length,
        withoutTemplateCount: withoutTemplate.length,
      },
      governance: {
        confidence: 'deterministic',
        signatureCount: signatures.length,
        signedArtifactCount: signedArtifactIds.size,
        unresolvedCommentCount: unresolvedComments.length,
        placementEventCount: placementEvents.length,
      },
      readiness: {
        confidence: 'heuristic',
        authoringReadiness,
        reviewReadiness,
        submissionReadiness,
      },
      problems,
    });
  } catch (error: any) {
    logConcept2cureError('program-twin', error, { projectId: req.params.projectId });
    return sendError(res, 500, 'Failed to compute program twin');
  }
});

/**
 * GET /api/concept2cure/projects/:projectId/artifacts/:artifactId/verification
 * Runs verification checks on a single artifact against placement, template,
 * evidence, and governance expectations.
 */
router.get(
  '/projects/:projectId/artifacts/:artifactId/verification',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      const projectDbId = parseInt(req.params.projectId, 10);
      if (isNaN(projectDbId)) return sendError(res, 400, 'Invalid project ID');

      // Find the artifact
      const [artifact] = await db
        .select()
        .from(concept2cureArtifacts)
        .where(
          and(
            eq(concept2cureArtifacts.projectId, projectDbId),
            eq(concept2cureArtifacts.organizationId, organizationId),
            eq(concept2cureArtifacts.artifactId, req.params.artifactId)
          )
        );

      if (!artifact) return sendError(res, 404, 'Artifact not found');

      // Fetch related data
      const provenanceEvents = await db
        .select()
        .from(concept2cureProvenanceEvents)
        .where(
          and(
            eq(concept2cureProvenanceEvents.artifactId, artifact.id),
            eq(concept2cureProvenanceEvents.organizationId, organizationId)
          )
        );

      const sigs = await db
        .select()
        .from(concept2cureSignatures)
        .where(eq(concept2cureSignatures.artifactId, artifact.id));

      const comments = await db
        .select()
        .from(concept2cureReviewComments)
        .where(eq(concept2cureReviewComments.artifactId, artifact.id));

      // ── Placement verification ──
      const placementFindings: {
        status: 'pass' | 'caution' | 'fail';
        message: string;
        confidence: string;
      }[] = [];
      if (!artifact.ctdSection) {
        placementFindings.push({
          status: 'fail',
          message: 'Artifact not placed in dossier',
          confidence: 'deterministic',
        });
      } else {
        placementFindings.push({
          status: 'pass',
          message: `Placed in CTD section ${artifact.ctdSection}`,
          confidence: 'deterministic',
        });
      }

      // ── Template verification ──
      const templateFindings: {
        status: 'pass' | 'caution' | 'fail';
        message: string;
        confidence: string;
      }[] = [];
      if (!artifact.templateId) {
        templateFindings.push({
          status: 'caution',
          message: 'No template assigned — structure unverifiable',
          confidence: 'deterministic',
        });
      } else {
        templateFindings.push({
          status: 'pass',
          message: `Template: ${artifact.templateId}`,
          confidence: 'deterministic',
        });
        // Check content against expected subsections (heuristic: h1/h2 heading scan)
        const content = artifact.content || '';
        const headings = (content.match(/<h[12][^>]*>([^<]+)<\/h[12]>/gi) || []).map(h =>
          h
            .replace(/<[^>]+>/g, '')
            .trim()
            .toLowerCase()
        );
        templateFindings.push({
          status: headings.length > 0 ? 'pass' : 'caution',
          message: `${headings.length} section heading(s) found in content`,
          confidence: 'heuristic',
        });
      }

      // ── Evidence verification ──
      const evidenceFindings: {
        status: 'pass' | 'caution' | 'fail';
        message: string;
        confidence: string;
      }[] = [];
      const sourceInputs = provenanceEvents.filter(e => e.eventType === 'source_input');
      const generations = provenanceEvents.filter(e => e.eventType === 'generation');
      if (sourceInputs.length === 0 && generations.length === 0) {
        evidenceFindings.push({
          status: 'caution',
          message: 'No evidence or precedent events linked',
          confidence: 'inferred',
        });
      } else {
        if (sourceInputs.length > 0) {
          evidenceFindings.push({
            status: 'pass',
            message: `${sourceInputs.length} source input event(s)`,
            confidence: 'inferred',
          });
        }
        if (generations.length > 0) {
          evidenceFindings.push({
            status: 'pass',
            message: `${generations.length} generation event(s)`,
            confidence: 'inferred',
          });
        }
      }

      // ── Governance verification ──
      const govFindings: {
        status: 'pass' | 'caution' | 'fail';
        message: string;
        confidence: string;
      }[] = [];
      const status = (artifact.status || 'draft').toLowerCase();
      govFindings.push({
        status: 'pass',
        message: `Status: ${status}`,
        confidence: 'deterministic',
      });
      if (sigs.length > 0) {
        govFindings.push({
          status: 'pass',
          message: `${sigs.length} signature(s)`,
          confidence: 'deterministic',
        });
      } else {
        govFindings.push({
          status: status === 'locked' ? 'caution' : 'pass',
          message: 'No signatures',
          confidence: 'deterministic',
        });
      }
      const unresolvedComments = comments.filter(c => !c.resolvedAt);
      if (unresolvedComments.length > 0) {
        govFindings.push({
          status: 'fail',
          message: `${unresolvedComments.length} unresolved review comment(s)`,
          confidence: 'deterministic',
        });
      }
      if (artifact.contentHash) {
        govFindings.push({
          status: 'pass',
          message: 'Content hash present (integrity chain active)',
          confidence: 'deterministic',
        });
      } else {
        govFindings.push({
          status: 'caution',
          message: 'No content hash — integrity unverifiable',
          confidence: 'deterministic',
        });
      }

      // ── Overall score ──
      const allFindings = [
        ...placementFindings,
        ...templateFindings,
        ...evidenceFindings,
        ...govFindings,
      ];
      const failCount = allFindings.filter(f => f.status === 'fail').length;
      const cautionCount = allFindings.filter(f => f.status === 'caution').length;
      const passCount = allFindings.filter(f => f.status === 'pass').length;
      const total = allFindings.length;
      const overallStatus: 'pass' | 'caution' | 'fail' =
        failCount > 0 ? 'fail' : cautionCount > 0 ? 'caution' : 'pass';
      const score = total > 0 ? Math.round((passCount / total) * 100) : 0;

      // ── Recommended actions ──
      const recommendedActions: string[] = [];
      if (!artifact.ctdSection) recommendedActions.push('Place artifact in a CTD section');
      if (!artifact.templateId) recommendedActions.push('Assign a template for structure guidance');
      if (sourceInputs.length === 0) recommendedActions.push('Link evidence sources');
      if (unresolvedComments.length > 0)
        recommendedActions.push('Resolve outstanding review comments');
      if (!artifact.contentHash) recommendedActions.push('Save to generate integrity hash');
      if (sigs.length === 0 && (status === 'approved' || status === 'locked')) {
        recommendedActions.push('Add electronic signature for compliance');
      }

      return sendSuccess(res, {
        artifactId: artifact.artifactId,
        title: artifact.title,
        overallStatus,
        score,
        placement: { findings: placementFindings },
        templateConformance: { findings: templateFindings },
        evidenceSupport: { findings: evidenceFindings },
        governance: { findings: govFindings },
        findings: allFindings,
        recommendedActions,
      });
    } catch (error: any) {
      logConcept2cureError('artifact-verification', error, {
        projectId: req.params.projectId,
        artifactId: req.params.artifactId,
      });
      return sendError(res, 500, 'Failed to run verification');
    }
  }
);

/**
 * GET /api/concept2cure/projects/:projectId/change-impact
 * Computes downstream impact for a proposed change scenario.
 * Query params: scenarioType, artifactId, targetSection, targetStatus
 */
router.get('/projects/:projectId/change-impact', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) return sendError(res, 404, 'Project not found');

    const projectDbId = parseInt(req.params.projectId, 10);
    if (isNaN(projectDbId)) return sendError(res, 400, 'Invalid project ID');

    const scenarioType = (req.query.scenarioType as string) || 'section_move';
    const artifactId = req.query.artifactId as string;
    const targetSection = req.query.targetSection as string;
    const targetStatus = req.query.targetStatus as string;

    // Fetch all artifacts for context
    const allArtifacts = await db
      .select()
      .from(concept2cureArtifacts)
      .where(
        and(
          eq(concept2cureArtifacts.projectId, projectDbId),
          eq(concept2cureArtifacts.organizationId, organizationId)
        )
      );

    const impacts: {
      type: string;
      severity: 'high' | 'medium' | 'low';
      message: string;
      affectedArtifactId?: string;
      confidence: string;
    }[] = [];

    if (scenarioType === 'section_move' && artifactId && targetSection) {
      const art = allArtifacts.find(a => a.artifactId === artifactId);
      if (art) {
        // Affected: other artifacts in same section
        const sameSectionArts = allArtifacts.filter(
          a => a.ctdSection === art.ctdSection && a.artifactId !== artifactId
        );
        if (sameSectionArts.length > 0) {
          impacts.push({
            type: 'dossier',
            severity: 'medium',
            message: `${sameSectionArts.length} artifact(s) remain in section ${art.ctdSection}`,
            confidence: 'deterministic',
          });
        }
        // Check if target section already has artifacts
        const targetArts = allArtifacts.filter(a => a.ctdSection === targetSection);
        if (targetArts.length > 0) {
          impacts.push({
            type: 'dossier',
            severity: 'low',
            message: `Target section ${targetSection} already has ${targetArts.length} artifact(s)`,
            confidence: 'deterministic',
          });
        }
        // If artifact is approved/locked, warn about governance
        if (art.status === 'approved' || art.status === 'locked') {
          impacts.push({
            type: 'governance',
            severity: 'high',
            message: `Moving ${art.status} artifact requires governance review`,
            confidence: 'deterministic',
          });
        }
      }
    }

    if (scenarioType === 'status_change' && artifactId && targetStatus) {
      const art = allArtifacts.find(a => a.artifactId === artifactId);
      if (art) {
        const currentStatus = (art.status || 'draft').toLowerCase();
        if (targetStatus === 'locked' && currentStatus !== 'approved') {
          impacts.push({
            type: 'governance',
            severity: 'high',
            message: 'Locking requires approved status first',
            confidence: 'deterministic',
          });
        }
        if (
          targetStatus === 'draft' &&
          (currentStatus === 'approved' || currentStatus === 'locked')
        ) {
          impacts.push({
            type: 'governance',
            severity: 'high',
            message: `Reverting from ${currentStatus} to draft invalidates signatures`,
            confidence: 'deterministic',
          });
        }
      }
    }

    if (scenarioType === 'template_switch' && artifactId) {
      impacts.push({
        type: 'template',
        severity: 'medium',
        message: 'Template switch may invalidate existing subsection structure',
        confidence: 'heuristic',
      });
    }

    if (scenarioType === 'evidence_change' && artifactId) {
      impacts.push({
        type: 'evidence',
        severity: 'medium',
        message: 'Evidence source changes may affect provenance chain',
        confidence: 'heuristic',
      });
    }

    return sendSuccess(res, {
      scenarioType,
      artifactId: artifactId || null,
      impacts,
      affectedCount: impacts.length,
    });
  } catch (error: any) {
    logConcept2cureError('change-impact', error, { projectId: req.params.projectId });
    return sendError(res, 500, 'Failed to compute change impact');
  }
});

/**
 * GET /api/concept2cure/projects/:projectId/transform-context
 * Returns the context needed for the Regulatory Transform Canvas:
 * source docs, evidence counts, precedent counts, CTD targets, templates, and project context.
 */
router.get('/projects/:projectId/transform-context', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) return sendError(res, 404, 'Project not found');

    const projectDbId = parseInt(req.params.projectId, 10);
    if (isNaN(projectDbId)) return sendError(res, 400, 'Invalid project ID');

    // Fetch project
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectDbId), eq(projects.organizationId, organizationId)));

    if (!project) return sendError(res, 404, 'Project not found');

    // Fetch artifacts
    const allArtifacts = await db
      .select()
      .from(concept2cureArtifacts)
      .where(
        and(
          eq(concept2cureArtifacts.projectId, projectDbId),
          eq(concept2cureArtifacts.organizationId, organizationId)
        )
      );

    // Fetch provenance
    const artifactIds = allArtifacts.map(a => a.id);
    let provenanceEvents: any[] = [];
    if (artifactIds.length > 0) {
      provenanceEvents = await db
        .select()
        .from(concept2cureProvenanceEvents)
        .where(
          and(
            inArray(concept2cureProvenanceEvents.artifactId, artifactIds),
            eq(concept2cureProvenanceEvents.organizationId, organizationId)
          )
        );
    }

    const sourceInputs = provenanceEvents.filter(e => e.eventType === 'source_input').length;
    const generations = provenanceEvents.filter(e => e.eventType === 'generation').length;

    // Distinct CTD sections with artifacts
    const ctdSections = [
      ...new Set(allArtifacts.filter(a => a.ctdSection).map(a => a.ctdSection!)),
    ].sort();

    // Template usage
    const templateIds = [
      ...new Set(allArtifacts.filter(a => a.templateId).map(a => a.templateId!)),
    ];

    return sendSuccess(res, {
      project: {
        id: project.id,
        name: project.title,
        submissionType: project.submissionType,
        sponsor: project.sponsor,
        indication: project.therapeuticArea,
        region: project.regulatoryRegion,
      },
      artifacts: {
        total: allArtifacts.length,
        byStatus: {
          draft: allArtifacts.filter(a => (a.status || 'draft') === 'draft').length,
          review: allArtifacts.filter(a => a.status === 'review').length,
          approved: allArtifacts.filter(a => a.status === 'approved').length,
          locked: allArtifacts.filter(a => a.status === 'locked').length,
        },
      },
      evidence: {
        sourceInputCount: sourceInputs,
        generationCount: generations,
        confidence: 'inferred',
      },
      ctdSections,
      templateIds,
    });
  } catch (error: any) {
    logConcept2cureError('transform-context', error, { projectId: req.params.projectId });
    return sendError(res, 500, 'Failed to load transform context');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 13 — REVIEW THREADS, COMMENTS & TASKS
// ═══════════════════════════════════════════════════════════════════════════════

// ── Permission helper ────────────────────────────────────────────────────────

type ThreadPermission = 'read' | 'comment' | 'request_changes' | 'resolve' | 'assign';

function getThreadPermissions(role: string): Set<ThreadPermission> {
  const r = role.toLowerCase();
  if (['admin', 'approver'].includes(r)) {
    return new Set(['read', 'comment', 'request_changes', 'resolve', 'assign']);
  }
  if (r === 'reviewer') {
    return new Set(['read', 'comment', 'request_changes', 'resolve']);
  }
  if (r === 'author' || r === 'user') {
    return new Set(['read', 'comment']);
  }
  // viewer
  return new Set(['read']);
}

// ── Auto-propagation: Document events → Project Management signals ───────────

/**
 * Propagates a document-level review event into the project management layer.
 * Creates a projectActivities record so PM dashboards, readiness strips,
 * and milestone views can ingest review activity without polling.
 */
async function propagateReviewSignal(params: {
  organizationId: number;
  projectId: number;
  userId: number;
  activityType: string;
  entityType: string;
  entityId: string;
  description: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  try {
    await db.insert(projectActivities).values({
      organizationId: params.organizationId,
      projectId: params.projectId,
      userId: params.userId,
      activityType: params.activityType,
      entityType: params.entityType,
      entityId: params.entityId,
      description: params.description,
      details: params.details || null,
      ipAddress: params.ipAddress || null,
      userAgent: params.userAgent || null,
    });
  } catch (err) {
    // Non-fatal: log but don't block the primary operation
    logger.warn('Failed to propagate review signal to PM layer', { error: (err as Error).message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REVIEW THREADS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/concept2cure/projects/:projectId/artifacts/:artifactId/review-threads
 * List all review threads for an artifact (all versions), optionally filtered by status.
 */
router.get(
  '/projects/:projectId/artifacts/:artifactId/review-threads',
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

      const statusFilter = req.query.status as string | undefined;
      const conditions = [
        eq(concept2cureReviewThreads.artifactId, artifact.id),
        eq(concept2cureReviewThreads.orgId, organizationId),
      ];
      if (statusFilter && ['open', 'resolved'].includes(statusFilter)) {
        conditions.push(eq(concept2cureReviewThreads.status, statusFilter));
      }

      const threads = await db
        .select()
        .from(concept2cureReviewThreads)
        .where(and(...conditions))
        .orderBy(desc(concept2cureReviewThreads.createdAt));

      // Get comment counts per thread
      const threadIds = threads.map(t => t.id);
      let commentCounts = new Map<number, number>();
      if (threadIds.length > 0) {
        const counts = await db
          .select({
            threadId: concept2cureThreadComments.threadId,
            count: sql<number>`count(*)::int`,
          })
          .from(concept2cureThreadComments)
          .where(
            and(
              inArray(concept2cureThreadComments.threadId, threadIds),
              isNull(concept2cureThreadComments.deletedAt)
            )
          )
          .groupBy(concept2cureThreadComments.threadId);
        for (const c of counts) {
          commentCounts.set(c.threadId, c.count);
        }
      }

      return sendSuccess(res, {
        artifactId: req.params.artifactId,
        totalThreads: threads.length,
        threads: threads.map(t => ({
          threadId: t.threadId,
          title: t.title,
          status: t.status,
          priority: t.priority,
          anchorType: t.anchorType,
          anchorKey: t.anchorKey,
          anchorLabel: t.anchorLabel,
          versionId: t.versionId,
          createdById: t.createdById,
          createdByName: t.createdByName,
          createdByRole: t.createdByRole,
          assigneeId: t.assigneeId,
          assigneeName: t.assigneeName,
          commentCount: commentCounts.get(t.id) || 0,
          resolvedAt: t.resolvedAt,
          resolvedByName: t.resolvedByName,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        })),
      });
    } catch (error: any) {
      logConcept2cureError('list review threads', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to list review threads');
    }
  }
);

/**
 * POST /api/concept2cure/projects/:projectId/artifacts/:artifactId/review-threads
 * Create a new review thread on an artifact.
 * Body: { title, anchorType?, anchorKey?, anchorLabel?, versionId?, priority?, assigneeId?, initialComment? }
 */
router.post(
  '/projects/:projectId/artifacts/:artifactId/review-threads',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const userId = getUserId(req);
      const userRole = (req.userRole || 'user').toLowerCase();
      const perms = getThreadPermissions(userRole);
      if (!perms.has('comment')) {
        return sendError(res, 403, 'Your role does not permit creating threads');
      }

      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      const projectDbId = parseInt(req.params.projectId, 10);
      if (isNaN(projectDbId)) return sendError(res, 400, 'Invalid project ID');

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

      const {
        title,
        anchorType,
        anchorKey,
        anchorLabel,
        versionId,
        priority,
        assigneeId,
        initialComment,
      } = req.body;
      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return sendError(res, 400, 'title is required');
      }
      if (title.length > 500) return sendError(res, 400, 'title must not exceed 500 characters');

      // Validate anchorType
      const validAnchors = ['section', 'heading', 'range', 'general'];
      if (anchorType && !validAnchors.includes(anchorType)) {
        return sendError(res, 400, `anchorType must be one of: ${validAnchors.join(', ')}`);
      }

      // Validate priority
      const validPriorities = ['low', 'medium', 'high'];
      if (priority && !validPriorities.includes(priority)) {
        return sendError(res, 400, `priority must be one of: ${validPriorities.join(', ')}`);
      }

      // Resolve assignee name if assigneeId is provided
      let resolvedAssigneeName: string | null = null;
      if (assigneeId) {
        if (!perms.has('assign')) {
          return sendError(res, 403, 'Your role does not permit assigning threads');
        }
        const [assignee] = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, Number(assigneeId)))
          .limit(1);
        resolvedAssigneeName = assignee?.name || null;
      }

      const threadIdStr = `thr_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      const actorName = (req as any).userName || req.userEmail || 'unknown';

      const [thread] = await db
        .insert(concept2cureReviewThreads)
        .values({
          threadId: threadIdStr,
          orgId: organizationId,
          projectId: projectDbId,
          artifactId: artifact.id,
          versionId: versionId ? Number(versionId) : null,
          createdById: userId,
          createdByName: actorName,
          createdByRole: userRole,
          title: sanitizeContent(title.trim()),
          anchorType: anchorType || null,
          anchorKey: anchorKey ? sanitizeContent(anchorKey) : null,
          anchorLabel: anchorLabel ? sanitizeContent(anchorLabel) : null,
          status: 'open',
          priority: priority || null,
          assigneeId: assigneeId ? Number(assigneeId) : null,
          assigneeName: resolvedAssigneeName,
        })
        .returning();

      // Create initial comment if provided
      let comment = null;
      if (
        initialComment &&
        typeof initialComment === 'string' &&
        initialComment.trim().length > 0
      ) {
        if (initialComment.length > 10000) {
          return sendError(res, 400, 'initialComment must not exceed 10000 characters');
        }
        const commentIdStr = `cmt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
        const [inserted] = await db
          .insert(concept2cureThreadComments)
          .values({
            commentId: commentIdStr,
            orgId: organizationId,
            threadId: thread.id,
            artifactId: artifact.id,
            versionId: versionId ? Number(versionId) : null,
            authorId: userId,
            authorName: actorName,
            authorRole: userRole,
            body: sanitizeContent(initialComment.trim()),
            kind: 'comment',
          })
          .returning();
        comment = {
          commentId: inserted.commentId,
          authorId: inserted.authorId,
          authorName: inserted.authorName,
          body: inserted.body,
          kind: inserted.kind,
          createdAt: inserted.createdAt,
        };
      }

      // Provenance
      await db.insert(concept2cureProvenanceEvents).values({
        organizationId,
        artifactId: artifact.id,
        eventId: `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
        eventType: 'review',
        eventAction: 'thread_created',
        sourceDescription: `Review thread created: "${title.trim()}"`,
        actorId: userId,
        actorName,
        actorEmail: req.userEmail || 'unknown',
        actorType: 'human',
        backendRoute: `/projects/${req.params.projectId}/artifacts/${req.params.artifactId}/review-threads`,
        backendService: 'concept2cure-api',
        ipAddress: getClientIp(req),
        details: { threadId: threadIdStr, title: title.trim(), anchorType, anchorKey },
      });

      // ── PM propagation: surface thread in project activity feed ──
      await propagateReviewSignal({
        organizationId,
        projectId: projectDbId,
        userId,
        activityType: 'review_thread_created',
        entityType: 'review_thread',
        entityId: threadIdStr,
        description: `Review thread opened on "${artifact.title}": ${title.trim()}`,
        details: {
          threadId: threadIdStr,
          artifactId: req.params.artifactId,
          artifactTitle: artifact.title,
          priority: priority || null,
          assigneeId: assigneeId ? Number(assigneeId) : null,
          assigneeName: resolvedAssigneeName,
          anchorLabel: anchorLabel || null,
        },
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || undefined,
      });

      return sendSuccess(res, {
        threadId: thread.threadId,
        title: thread.title,
        status: thread.status,
        priority: thread.priority,
        anchorType: thread.anchorType,
        anchorKey: thread.anchorKey,
        anchorLabel: thread.anchorLabel,
        versionId: thread.versionId,
        createdById: thread.createdById,
        createdByName: thread.createdByName,
        assigneeId: thread.assigneeId,
        assigneeName: thread.assigneeName,
        createdAt: thread.createdAt,
        initialComment: comment,
      });
    } catch (error: any) {
      logConcept2cureError('create review thread', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to create review thread');
    }
  }
);

/**
 * PATCH /api/concept2cure/review-threads/:threadId
 * Update thread metadata (title, priority, assignee).
 */
router.patch('/review-threads/:threadId', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const userRole = (req.userRole || 'user').toLowerCase();
    const perms = getThreadPermissions(userRole);

    const [thread] = await db
      .select()
      .from(concept2cureReviewThreads)
      .where(
        and(
          eq(concept2cureReviewThreads.threadId, req.params.threadId),
          eq(concept2cureReviewThreads.orgId, organizationId)
        )
      )
      .limit(1);

    if (!thread) return sendError(res, 404, 'Thread not found');

    const updates: Record<string, any> = { updatedAt: new Date() };
    const { title, priority, assigneeId } = req.body;

    if (title !== undefined) {
      if (!perms.has('comment')) return sendError(res, 403, 'Cannot edit thread');
      if (typeof title !== 'string' || title.trim().length === 0) {
        return sendError(res, 400, 'title cannot be empty');
      }
      if (title.length > 500) return sendError(res, 400, 'title must not exceed 500 characters');
      updates.title = sanitizeContent(title.trim());
    }

    if (priority !== undefined) {
      const validPriorities = ['low', 'medium', 'high'];
      if (priority !== null && !validPriorities.includes(priority)) {
        return sendError(
          res,
          400,
          `priority must be one of: ${validPriorities.join(', ')} or null`
        );
      }
      updates.priority = priority;
    }

    if (assigneeId !== undefined) {
      if (!perms.has('assign')) return sendError(res, 403, 'Your role cannot reassign threads');
      if (assigneeId === null) {
        updates.assigneeId = null;
        updates.assigneeName = null;
      } else {
        const [assignee] = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, Number(assigneeId)))
          .limit(1);
        updates.assigneeId = Number(assigneeId);
        updates.assigneeName = assignee?.name || null;
      }
    }

    await db
      .update(concept2cureReviewThreads)
      .set(updates)
      .where(eq(concept2cureReviewThreads.id, thread.id));

    return sendSuccess(res, { threadId: thread.threadId, ...updates });
  } catch (error: any) {
    logConcept2cureError('update review thread', error, { threadId: req.params.threadId });
    return sendError(res, 500, 'Failed to update thread');
  }
});

/**
 * POST /api/concept2cure/review-threads/:threadId/resolve
 * Resolve a thread.
 */
router.post('/review-threads/:threadId/resolve', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const userRole = (req.userRole || 'user').toLowerCase();
    const perms = getThreadPermissions(userRole);
    if (!perms.has('resolve')) {
      return sendError(res, 403, 'Your role cannot resolve threads');
    }

    const [thread] = await db
      .select()
      .from(concept2cureReviewThreads)
      .where(
        and(
          eq(concept2cureReviewThreads.threadId, req.params.threadId),
          eq(concept2cureReviewThreads.orgId, organizationId)
        )
      )
      .limit(1);

    if (!thread) return sendError(res, 404, 'Thread not found');
    if (thread.status === 'resolved') return sendError(res, 400, 'Thread is already resolved');

    const actorName = (req as any).userName || req.userEmail || 'unknown';
    const now = new Date();

    await db
      .update(concept2cureReviewThreads)
      .set({
        status: 'resolved',
        resolvedAt: now,
        resolvedById: userId,
        resolvedByName: actorName,
        updatedAt: now,
      })
      .where(eq(concept2cureReviewThreads.id, thread.id));

    // System comment
    const commentIdStr = `cmt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    await db.insert(concept2cureThreadComments).values({
      commentId: commentIdStr,
      orgId: organizationId,
      threadId: thread.id,
      artifactId: thread.artifactId,
      authorId: userId,
      authorName: actorName,
      authorRole: userRole,
      body: `Thread resolved by ${actorName}`,
      kind: 'system',
    });

    // Provenance
    await db.insert(concept2cureProvenanceEvents).values({
      organizationId,
      artifactId: thread.artifactId,
      eventId: `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
      eventType: 'review',
      eventAction: 'thread_resolved',
      sourceDescription: `Thread "${thread.title}" resolved`,
      actorId: userId,
      actorName,
      actorEmail: req.userEmail || 'unknown',
      actorType: 'human',
      backendRoute: `/review-threads/${req.params.threadId}/resolve`,
      backendService: 'concept2cure-api',
      ipAddress: getClientIp(req),
      details: { threadId: thread.threadId },
    });

    // ── PM propagation: thread resolved ──
    await propagateReviewSignal({
      organizationId,
      projectId: thread.projectId,
      userId,
      activityType: 'review_thread_resolved',
      entityType: 'review_thread',
      entityId: thread.threadId,
      description: `Review thread resolved: "${thread.title}"`,
      details: { threadId: thread.threadId, artifactId: thread.artifactId },
      ipAddress: getClientIp(req),
    });

    return sendSuccess(res, {
      threadId: thread.threadId,
      status: 'resolved',
      resolvedAt: now,
      resolvedByName: actorName,
    });
  } catch (error: any) {
    logConcept2cureError('resolve thread', error, { threadId: req.params.threadId });
    return sendError(res, 500, 'Failed to resolve thread');
  }
});

/**
 * POST /api/concept2cure/review-threads/:threadId/reopen
 * Reopen a resolved thread.
 */
router.post('/review-threads/:threadId/reopen', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const userRole = (req.userRole || 'user').toLowerCase();
    const perms = getThreadPermissions(userRole);
    if (!perms.has('resolve')) {
      return sendError(res, 403, 'Your role cannot reopen threads');
    }

    const [thread] = await db
      .select()
      .from(concept2cureReviewThreads)
      .where(
        and(
          eq(concept2cureReviewThreads.threadId, req.params.threadId),
          eq(concept2cureReviewThreads.orgId, organizationId)
        )
      )
      .limit(1);

    if (!thread) return sendError(res, 404, 'Thread not found');
    if (thread.status === 'open') return sendError(res, 400, 'Thread is already open');

    const actorName = (req as any).userName || req.userEmail || 'unknown';
    const now = new Date();

    await db
      .update(concept2cureReviewThreads)
      .set({
        status: 'open',
        resolvedAt: null,
        resolvedById: null,
        resolvedByName: null,
        updatedAt: now,
      })
      .where(eq(concept2cureReviewThreads.id, thread.id));

    // System comment
    const commentIdStr = `cmt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    await db.insert(concept2cureThreadComments).values({
      commentId: commentIdStr,
      orgId: organizationId,
      threadId: thread.id,
      artifactId: thread.artifactId,
      authorId: userId,
      authorName: actorName,
      authorRole: userRole,
      body: `Thread reopened by ${actorName}`,
      kind: 'system',
    });

    // Provenance
    await db.insert(concept2cureProvenanceEvents).values({
      organizationId,
      artifactId: thread.artifactId,
      eventId: `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
      eventType: 'review',
      eventAction: 'thread_reopened',
      sourceDescription: `Thread "${thread.title}" reopened`,
      actorId: userId,
      actorName,
      actorEmail: req.userEmail || 'unknown',
      actorType: 'human',
      backendRoute: `/review-threads/${req.params.threadId}/reopen`,
      backendService: 'concept2cure-api',
      ipAddress: getClientIp(req),
      details: { threadId: thread.threadId },
    });

    // ── PM propagation: thread reopened ──
    await propagateReviewSignal({
      organizationId,
      projectId: thread.projectId,
      userId,
      activityType: 'review_thread_reopened',
      entityType: 'review_thread',
      entityId: thread.threadId,
      description: `Review thread reopened: "${thread.title}"`,
      details: { threadId: thread.threadId, artifactId: thread.artifactId },
      ipAddress: getClientIp(req),
    });

    return sendSuccess(res, {
      threadId: thread.threadId,
      status: 'open',
      reopenedAt: now,
    });
  } catch (error: any) {
    logConcept2cureError('reopen thread', error, { threadId: req.params.threadId });
    return sendError(res, 500, 'Failed to reopen thread');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// THREAD COMMENTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/concept2cure/review-threads/:threadId/comments
 * List all comments in a thread, newest first.
 */
router.get('/review-threads/:threadId/comments', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);

    const [thread] = await db
      .select()
      .from(concept2cureReviewThreads)
      .where(
        and(
          eq(concept2cureReviewThreads.threadId, req.params.threadId),
          eq(concept2cureReviewThreads.orgId, organizationId)
        )
      )
      .limit(1);

    if (!thread) return sendError(res, 404, 'Thread not found');

    const comments = await db
      .select()
      .from(concept2cureThreadComments)
      .where(
        and(
          eq(concept2cureThreadComments.threadId, thread.id),
          isNull(concept2cureThreadComments.deletedAt)
        )
      )
      .orderBy(concept2cureThreadComments.createdAt);

    return sendSuccess(res, {
      threadId: thread.threadId,
      totalComments: comments.length,
      comments: comments.map(c => ({
        commentId: c.commentId,
        authorId: c.authorId,
        authorName: c.authorName,
        authorRole: c.authorRole,
        body: c.body,
        kind: c.kind,
        parentCommentId: c.parentCommentId,
        versionId: c.versionId,
        createdAt: c.createdAt,
        editedAt: c.editedAt,
      })),
    });
  } catch (error: any) {
    logConcept2cureError('list thread comments', error, { threadId: req.params.threadId });
    return sendError(res, 500, 'Failed to list comments');
  }
});

/**
 * POST /api/concept2cure/review-threads/:threadId/comments
 * Add a comment to a thread.
 * Body: { body, kind?, parentCommentId?, versionId? }
 */
router.post('/review-threads/:threadId/comments', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const userRole = (req.userRole || 'user').toLowerCase();
    const perms = getThreadPermissions(userRole);

    const { body, kind, parentCommentId, versionId } = req.body;

    // Permission check based on kind
    const commentKind = kind || 'comment';
    if (commentKind === 'request_changes' && !perms.has('request_changes')) {
      return sendError(res, 403, 'Your role cannot request changes');
    }
    if (commentKind === 'comment' && !perms.has('comment')) {
      return sendError(res, 403, 'Your role does not permit commenting');
    }

    const validKinds = ['comment', 'request_changes'];
    if (!validKinds.includes(commentKind)) {
      return sendError(res, 400, `kind must be one of: ${validKinds.join(', ')}`);
    }

    if (!body || typeof body !== 'string' || body.trim().length === 0) {
      return sendError(res, 400, 'body is required');
    }
    if (body.length > 10000) return sendError(res, 400, 'body must not exceed 10000 characters');

    const [thread] = await db
      .select()
      .from(concept2cureReviewThreads)
      .where(
        and(
          eq(concept2cureReviewThreads.threadId, req.params.threadId),
          eq(concept2cureReviewThreads.orgId, organizationId)
        )
      )
      .limit(1);

    if (!thread) return sendError(res, 404, 'Thread not found');

    const actorName = (req as any).userName || req.userEmail || 'unknown';
    const commentIdStr = `cmt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

    const [inserted] = await db
      .insert(concept2cureThreadComments)
      .values({
        commentId: commentIdStr,
        orgId: organizationId,
        threadId: thread.id,
        artifactId: thread.artifactId,
        versionId: versionId ? Number(versionId) : null,
        parentCommentId: parentCommentId ? Number(parentCommentId) : null,
        authorId: userId,
        authorName: actorName,
        authorRole: userRole,
        body: sanitizeContent(body.trim()),
        kind: commentKind,
      })
      .returning();

    // Update thread's updatedAt
    await db
      .update(concept2cureReviewThreads)
      .set({ updatedAt: new Date() })
      .where(eq(concept2cureReviewThreads.id, thread.id));

    // Provenance
    await db.insert(concept2cureProvenanceEvents).values({
      organizationId,
      artifactId: thread.artifactId,
      eventId: `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
      eventType: 'review',
      eventAction: commentKind === 'request_changes' ? 'change_requested' : 'comment_added',
      sourceDescription: `Comment added to thread "${thread.title}"`,
      actorId: userId,
      actorName,
      actorEmail: req.userEmail || 'unknown',
      actorType: 'human',
      backendRoute: `/review-threads/${req.params.threadId}/comments`,
      backendService: 'concept2cure-api',
      ipAddress: getClientIp(req),
      details: { threadId: thread.threadId, commentId: commentIdStr, kind: commentKind },
    });

    return sendSuccess(res, {
      commentId: inserted.commentId,
      threadId: thread.threadId,
      authorId: inserted.authorId,
      authorName: inserted.authorName,
      authorRole: inserted.authorRole,
      body: inserted.body,
      kind: inserted.kind,
      parentCommentId: inserted.parentCommentId,
      versionId: inserted.versionId,
      createdAt: inserted.createdAt,
    });
  } catch (error: any) {
    logConcept2cureError('add thread comment', error, { threadId: req.params.threadId });
    return sendError(res, 500, 'Failed to add comment');
  }
});

/**
 * PATCH /api/concept2cure/review-comments/:commentId
 * Edit a comment's body. Only the author can edit, and only non-system comments.
 */
router.patch('/review-comments/:commentId', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);

    const [comment] = await db
      .select()
      .from(concept2cureThreadComments)
      .where(
        and(
          eq(concept2cureThreadComments.commentId, req.params.commentId),
          eq(concept2cureThreadComments.orgId, organizationId),
          isNull(concept2cureThreadComments.deletedAt)
        )
      )
      .limit(1);

    if (!comment) return sendError(res, 404, 'Comment not found');
    if (comment.authorId !== userId) {
      return sendError(res, 403, 'Only the comment author can edit');
    }
    if (comment.kind === 'system') {
      return sendError(res, 400, 'System comments cannot be edited');
    }

    const { body } = req.body;
    if (!body || typeof body !== 'string' || body.trim().length === 0) {
      return sendError(res, 400, 'body is required');
    }
    if (body.length > 10000) return sendError(res, 400, 'body must not exceed 10000 characters');

    const now = new Date();
    await db
      .update(concept2cureThreadComments)
      .set({
        body: sanitizeContent(body.trim()),
        editedAt: now,
        updatedAt: now,
      })
      .where(eq(concept2cureThreadComments.id, comment.id));

    return sendSuccess(res, {
      commentId: comment.commentId,
      body: sanitizeContent(body.trim()),
      editedAt: now,
    });
  } catch (error: any) {
    logConcept2cureError('edit comment', error, { commentId: req.params.commentId });
    return sendError(res, 500, 'Failed to edit comment');
  }
});

/**
 * DELETE /api/concept2cure/review-comments/:commentId
 * Soft-delete a comment. Only author or admin can delete.
 */
router.delete('/review-comments/:commentId', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const userRole = (req.userRole || 'user').toLowerCase();

    const [comment] = await db
      .select()
      .from(concept2cureThreadComments)
      .where(
        and(
          eq(concept2cureThreadComments.commentId, req.params.commentId),
          eq(concept2cureThreadComments.orgId, organizationId),
          isNull(concept2cureThreadComments.deletedAt)
        )
      )
      .limit(1);

    if (!comment) return sendError(res, 404, 'Comment not found');
    if (comment.kind === 'system') {
      return sendError(res, 400, 'System comments cannot be deleted');
    }
    if (comment.authorId !== userId && userRole !== 'admin') {
      return sendError(res, 403, 'Only the comment author or admin can delete');
    }

    await db
      .update(concept2cureThreadComments)
      .set({ deletedAt: new Date() })
      .where(eq(concept2cureThreadComments.id, comment.id));

    return sendSuccess(res, { commentId: comment.commentId, deleted: true });
  } catch (error: any) {
    logConcept2cureError('delete comment', error, { commentId: req.params.commentId });
    return sendError(res, 500, 'Failed to delete comment');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// REVIEW TASKS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/concept2cure/projects/:projectId/artifacts/:artifactId/review-tasks
 * List review tasks for an artifact.
 */
router.get(
  '/projects/:projectId/artifacts/:artifactId/review-tasks',
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

      const statusFilter = req.query.status as string | undefined;
      const conditions = [
        eq(concept2cureReviewTasks.artifactId, artifact.id),
        eq(concept2cureReviewTasks.orgId, organizationId),
      ];
      if (statusFilter && ['open', 'in_progress', 'resolved', 'closed'].includes(statusFilter)) {
        conditions.push(eq(concept2cureReviewTasks.status, statusFilter));
      }

      const tasks = await db
        .select()
        .from(concept2cureReviewTasks)
        .where(and(...conditions))
        .orderBy(desc(concept2cureReviewTasks.createdAt));

      return sendSuccess(res, {
        artifactId: req.params.artifactId,
        totalTasks: tasks.length,
        tasks: tasks.map(t => ({
          taskId: t.taskId,
          title: t.title,
          description: t.description,
          taskType: t.taskType,
          status: t.status,
          createdById: t.createdById,
          createdByName: t.createdByName,
          assignedToId: t.assignedToId,
          assignedToName: t.assignedToName,
          threadId: t.threadId,
          versionId: t.versionId,
          dueAt: t.dueAt,
          resolvedAt: t.resolvedAt,
          resolvedByName: t.resolvedByName,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        })),
      });
    } catch (error: any) {
      logConcept2cureError('list review tasks', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to list review tasks');
    }
  }
);

/**
 * POST /api/concept2cure/projects/:projectId/artifacts/:artifactId/review-tasks
 * Create a review task on an artifact.
 * Body: { title, description?, taskType?, assignedToId?, threadId?, versionId?, dueAt? }
 */
router.post(
  '/projects/:projectId/artifacts/:artifactId/review-tasks',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const userId = getUserId(req);
      const userRole = (req.userRole || 'user').toLowerCase();
      const perms = getThreadPermissions(userRole);
      if (!perms.has('request_changes')) {
        return sendError(res, 403, 'Your role does not permit creating tasks');
      }

      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      const projectDbId = parseInt(req.params.projectId, 10);
      if (isNaN(projectDbId)) return sendError(res, 400, 'Invalid project ID');

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

      const { title, description, taskType, assignedToId, threadId, versionId, dueAt } = req.body;
      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return sendError(res, 400, 'title is required');
      }
      if (title.length > 500) return sendError(res, 400, 'title must not exceed 500 characters');

      const validTypes = ['change_request', 'follow_up', 'review_task'];
      const resolvedType = taskType || 'review_task';
      if (!validTypes.includes(resolvedType)) {
        return sendError(res, 400, `taskType must be one of: ${validTypes.join(', ')}`);
      }

      // Resolve assignee name
      let resolvedAssigneeName: string | null = null;
      if (assignedToId) {
        const [assignee] = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, Number(assignedToId)))
          .limit(1);
        resolvedAssigneeName = assignee?.name || null;
      }

      // Validate threadId if provided
      let resolvedThreadDbId: number | null = null;
      if (threadId) {
        const [thr] = await db
          .select({ id: concept2cureReviewThreads.id })
          .from(concept2cureReviewThreads)
          .where(
            and(
              eq(concept2cureReviewThreads.threadId, threadId),
              eq(concept2cureReviewThreads.orgId, organizationId)
            )
          )
          .limit(1);
        if (!thr) return sendError(res, 400, 'Thread not found');
        resolvedThreadDbId = thr.id;
      }

      const taskIdStr = `task_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      const actorName = (req as any).userName || req.userEmail || 'unknown';

      const [inserted] = await db
        .insert(concept2cureReviewTasks)
        .values({
          taskId: taskIdStr,
          orgId: organizationId,
          projectId: projectDbId,
          artifactId: artifact.id,
          versionId: versionId ? Number(versionId) : null,
          threadId: resolvedThreadDbId,
          createdById: userId,
          createdByName: actorName,
          assignedToId: assignedToId ? Number(assignedToId) : null,
          assignedToName: resolvedAssigneeName,
          title: sanitizeContent(title.trim()),
          description: description ? sanitizeContent(description.trim()) : null,
          taskType: resolvedType,
          status: 'open',
          dueAt: dueAt ? new Date(dueAt) : null,
        })
        .returning();

      // Provenance
      await db.insert(concept2cureProvenanceEvents).values({
        organizationId,
        artifactId: artifact.id,
        eventId: `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
        eventType: 'review',
        eventAction: 'task_created',
        sourceDescription: `Task created: "${title.trim()}"`,
        actorId: userId,
        actorName,
        actorEmail: req.userEmail || 'unknown',
        actorType: 'human',
        backendRoute: `/projects/${req.params.projectId}/artifacts/${req.params.artifactId}/review-tasks`,
        backendService: 'concept2cure-api',
        ipAddress: getClientIp(req),
        details: { taskId: taskIdStr, title: title.trim(), taskType: resolvedType },
      });

      // ── PM propagation: task created ──
      await propagateReviewSignal({
        organizationId,
        projectId: projectDbId,
        userId,
        activityType: 'review_task_created',
        entityType: 'review_task',
        entityId: taskIdStr,
        description: `Review task created on "${artifact.title}": ${title.trim()}`,
        details: {
          taskId: taskIdStr,
          artifactId: req.params.artifactId,
          artifactTitle: artifact.title,
          taskType: resolvedType,
          dueAt: dueAt || null,
          assignedToId: assignedToId ? Number(assignedToId) : null,
          assignedToName: resolvedAssigneeName,
        },
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'] || undefined,
      });

      return sendSuccess(res, {
        taskId: inserted.taskId,
        title: inserted.title,
        description: inserted.description,
        taskType: inserted.taskType,
        status: inserted.status,
        assignedToId: inserted.assignedToId,
        assignedToName: inserted.assignedToName,
        createdById: inserted.createdById,
        createdByName: inserted.createdByName,
        threadId: threadId || null,
        versionId: inserted.versionId,
        dueAt: inserted.dueAt,
        createdAt: inserted.createdAt,
      });
    } catch (error: any) {
      logConcept2cureError('create review task', error, { artifactId: req.params.artifactId });
      return sendError(res, 500, 'Failed to create review task');
    }
  }
);

/**
 * PATCH /api/concept2cure/review-tasks/:taskId
 * Update task metadata (title, description, assignee, status, dueAt).
 */
router.patch('/review-tasks/:taskId', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const userRole = (req.userRole || 'user').toLowerCase();
    const perms = getThreadPermissions(userRole);

    const [task] = await db
      .select()
      .from(concept2cureReviewTasks)
      .where(
        and(
          eq(concept2cureReviewTasks.taskId, req.params.taskId),
          eq(concept2cureReviewTasks.orgId, organizationId)
        )
      )
      .limit(1);

    if (!task) return sendError(res, 404, 'Task not found');

    if (!perms.has('request_changes') && task.assignedToId !== userId) {
      return sendError(
        res,
        403,
        'You can only update tasks assigned to you or with reviewer+ role'
      );
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    const { title, description, assignedToId, status, dueAt } = req.body;

    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length === 0) {
        return sendError(res, 400, 'title cannot be empty');
      }
      updates.title = sanitizeContent(title.trim());
    }

    if (description !== undefined) {
      updates.description = description ? sanitizeContent(description.trim()) : null;
    }

    if (assignedToId !== undefined) {
      if (assignedToId === null) {
        updates.assignedToId = null;
        updates.assignedToName = null;
      } else {
        const [assignee] = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, Number(assignedToId)))
          .limit(1);
        updates.assignedToId = Number(assignedToId);
        updates.assignedToName = assignee?.name || null;
      }
    }

    if (status !== undefined) {
      const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
      if (!validStatuses.includes(status)) {
        return sendError(res, 400, `status must be one of: ${validStatuses.join(', ')}`);
      }
      updates.status = status;
    }

    if (dueAt !== undefined) {
      updates.dueAt = dueAt ? new Date(dueAt) : null;
    }

    await db
      .update(concept2cureReviewTasks)
      .set(updates)
      .where(eq(concept2cureReviewTasks.id, task.id));

    return sendSuccess(res, { taskId: task.taskId, ...updates });
  } catch (error: any) {
    logConcept2cureError('update review task', error, { taskId: req.params.taskId });
    return sendError(res, 500, 'Failed to update task');
  }
});

/**
 * POST /api/concept2cure/review-tasks/:taskId/resolve
 * Resolve a task.
 */
router.post('/review-tasks/:taskId/resolve', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const userRole = (req.userRole || 'user').toLowerCase();
    const perms = getThreadPermissions(userRole);

    const [task] = await db
      .select()
      .from(concept2cureReviewTasks)
      .where(
        and(
          eq(concept2cureReviewTasks.taskId, req.params.taskId),
          eq(concept2cureReviewTasks.orgId, organizationId)
        )
      )
      .limit(1);

    if (!task) return sendError(res, 404, 'Task not found');
    if (task.status === 'resolved' || task.status === 'closed') {
      return sendError(res, 400, `Task is already ${task.status}`);
    }

    if (!perms.has('resolve') && task.assignedToId !== userId) {
      return sendError(res, 403, 'Only the assignee or reviewer+ can resolve tasks');
    }

    const actorName = (req as any).userName || req.userEmail || 'unknown';
    const now = new Date();

    await db
      .update(concept2cureReviewTasks)
      .set({
        status: 'resolved',
        resolvedAt: now,
        resolvedById: userId,
        resolvedByName: actorName,
        updatedAt: now,
      })
      .where(eq(concept2cureReviewTasks.id, task.id));

    // Provenance
    await db.insert(concept2cureProvenanceEvents).values({
      organizationId,
      artifactId: task.artifactId,
      eventId: `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
      eventType: 'review',
      eventAction: 'task_resolved',
      sourceDescription: `Task "${task.title}" resolved`,
      actorId: userId,
      actorName,
      actorEmail: req.userEmail || 'unknown',
      actorType: 'human',
      backendRoute: `/review-tasks/${req.params.taskId}/resolve`,
      backendService: 'concept2cure-api',
      ipAddress: getClientIp(req),
      details: { taskId: task.taskId },
    });

    // ── PM propagation: task resolved ──
    await propagateReviewSignal({
      organizationId,
      projectId: task.projectId,
      userId,
      activityType: 'review_task_resolved',
      entityType: 'review_task',
      entityId: task.taskId,
      description: `Review task resolved: "${task.title}"`,
      details: { taskId: task.taskId, artifactId: task.artifactId },
      ipAddress: getClientIp(req),
    });

    return sendSuccess(res, {
      taskId: task.taskId,
      status: 'resolved',
      resolvedAt: now,
      resolvedByName: actorName,
    });
  } catch (error: any) {
    logConcept2cureError('resolve task', error, { taskId: req.params.taskId });
    return sendError(res, 500, 'Failed to resolve task');
  }
});

/**
 * POST /api/concept2cure/review-tasks/:taskId/reopen
 * Reopen a resolved/closed task.
 */
router.post('/review-tasks/:taskId/reopen', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const userRole = (req.userRole || 'user').toLowerCase();
    const perms = getThreadPermissions(userRole);
    if (!perms.has('resolve')) {
      return sendError(res, 403, 'Your role cannot reopen tasks');
    }

    const [task] = await db
      .select()
      .from(concept2cureReviewTasks)
      .where(
        and(
          eq(concept2cureReviewTasks.taskId, req.params.taskId),
          eq(concept2cureReviewTasks.orgId, organizationId)
        )
      )
      .limit(1);

    if (!task) return sendError(res, 404, 'Task not found');
    if (task.status === 'open' || task.status === 'in_progress') {
      return sendError(res, 400, `Task is already ${task.status}`);
    }

    const now = new Date();
    await db
      .update(concept2cureReviewTasks)
      .set({
        status: 'open',
        resolvedAt: null,
        resolvedById: null,
        resolvedByName: null,
        updatedAt: now,
      })
      .where(eq(concept2cureReviewTasks.id, task.id));

    // Provenance
    await db.insert(concept2cureProvenanceEvents).values({
      organizationId,
      artifactId: task.artifactId,
      eventId: `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
      eventType: 'review',
      eventAction: 'task_reopened',
      sourceDescription: `Task "${task.title}" reopened`,
      actorId: userId,
      actorName: (req as any).userName || req.userEmail || 'unknown',
      actorEmail: req.userEmail || 'unknown',
      actorType: 'human',
      backendRoute: `/review-tasks/${req.params.taskId}/reopen`,
      backendService: 'concept2cure-api',
      ipAddress: getClientIp(req),
      details: { taskId: task.taskId },
    });

    return sendSuccess(res, {
      taskId: task.taskId,
      status: 'open',
      reopenedAt: now,
    });
  } catch (error: any) {
    logConcept2cureError('reopen task', error, { taskId: req.params.taskId });
    return sendError(res, 500, 'Failed to reopen task');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// REVIEW QUEUES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/concept2cure/reviews/my-queue
 * Returns all open threads, tasks assigned to the current user across all artifacts.
 */
router.get('/reviews/my-queue', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);

    // Threads assigned to me that are open
    const myThreads = await db
      .select({
        threadId: concept2cureReviewThreads.threadId,
        title: concept2cureReviewThreads.title,
        status: concept2cureReviewThreads.status,
        priority: concept2cureReviewThreads.priority,
        artifactId: concept2cureArtifacts.artifactId,
        artifactTitle: concept2cureArtifacts.title,
        projectId: concept2cureReviewThreads.projectId,
        anchorLabel: concept2cureReviewThreads.anchorLabel,
        createdByName: concept2cureReviewThreads.createdByName,
        createdAt: concept2cureReviewThreads.createdAt,
        updatedAt: concept2cureReviewThreads.updatedAt,
      })
      .from(concept2cureReviewThreads)
      .innerJoin(
        concept2cureArtifacts,
        eq(concept2cureArtifacts.id, concept2cureReviewThreads.artifactId)
      )
      .where(
        and(
          eq(concept2cureReviewThreads.assigneeId, userId),
          eq(concept2cureReviewThreads.orgId, organizationId),
          eq(concept2cureReviewThreads.status, 'open')
        )
      )
      .orderBy(desc(concept2cureReviewThreads.updatedAt));

    // Tasks assigned to me that are open/in_progress
    const myTasks = await db
      .select({
        taskId: concept2cureReviewTasks.taskId,
        title: concept2cureReviewTasks.title,
        description: concept2cureReviewTasks.description,
        taskType: concept2cureReviewTasks.taskType,
        status: concept2cureReviewTasks.status,
        dueAt: concept2cureReviewTasks.dueAt,
        artifactId: concept2cureArtifacts.artifactId,
        artifactTitle: concept2cureArtifacts.title,
        projectId: concept2cureReviewTasks.projectId,
        createdByName: concept2cureReviewTasks.createdByName,
        createdAt: concept2cureReviewTasks.createdAt,
        updatedAt: concept2cureReviewTasks.updatedAt,
      })
      .from(concept2cureReviewTasks)
      .innerJoin(
        concept2cureArtifacts,
        eq(concept2cureArtifacts.id, concept2cureReviewTasks.artifactId)
      )
      .where(
        and(
          eq(concept2cureReviewTasks.assignedToId, userId),
          eq(concept2cureReviewTasks.orgId, organizationId),
          inArray(concept2cureReviewTasks.status, ['open', 'in_progress'])
        )
      )
      .orderBy(concept2cureReviewTasks.dueAt, desc(concept2cureReviewTasks.updatedAt));

    return sendSuccess(res, {
      threads: myThreads,
      tasks: myTasks,
      totalThreads: myThreads.length,
      totalTasks: myTasks.length,
    });
  } catch (error: any) {
    logConcept2cureError('my review queue', error);
    return sendError(res, 500, 'Failed to fetch review queue');
  }
});

/**
 * GET /api/concept2cure/projects/:projectId/reviews/project-queue
 * Returns all open threads and tasks for a project, for admin/project-level overview.
 */
router.get('/projects/:projectId/reviews/project-queue', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) return sendError(res, 404, 'Project not found');

    const projectDbId = parseInt(req.params.projectId, 10);
    if (isNaN(projectDbId)) return sendError(res, 400, 'Invalid project ID');

    // All open threads in project
    const projectThreads = await db
      .select({
        threadId: concept2cureReviewThreads.threadId,
        title: concept2cureReviewThreads.title,
        status: concept2cureReviewThreads.status,
        priority: concept2cureReviewThreads.priority,
        artifactId: concept2cureArtifacts.artifactId,
        artifactTitle: concept2cureArtifacts.title,
        anchorLabel: concept2cureReviewThreads.anchorLabel,
        assigneeId: concept2cureReviewThreads.assigneeId,
        assigneeName: concept2cureReviewThreads.assigneeName,
        createdByName: concept2cureReviewThreads.createdByName,
        createdAt: concept2cureReviewThreads.createdAt,
        updatedAt: concept2cureReviewThreads.updatedAt,
      })
      .from(concept2cureReviewThreads)
      .innerJoin(
        concept2cureArtifacts,
        eq(concept2cureArtifacts.id, concept2cureReviewThreads.artifactId)
      )
      .where(
        and(
          eq(concept2cureReviewThreads.projectId, projectDbId),
          eq(concept2cureReviewThreads.orgId, organizationId),
          eq(concept2cureReviewThreads.status, 'open')
        )
      )
      .orderBy(desc(concept2cureReviewThreads.updatedAt));

    // All open/in_progress tasks in project
    const projectTasks = await db
      .select({
        taskId: concept2cureReviewTasks.taskId,
        title: concept2cureReviewTasks.title,
        description: concept2cureReviewTasks.description,
        taskType: concept2cureReviewTasks.taskType,
        status: concept2cureReviewTasks.status,
        dueAt: concept2cureReviewTasks.dueAt,
        artifactId: concept2cureArtifacts.artifactId,
        artifactTitle: concept2cureArtifacts.title,
        assignedToId: concept2cureReviewTasks.assignedToId,
        assignedToName: concept2cureReviewTasks.assignedToName,
        createdByName: concept2cureReviewTasks.createdByName,
        createdAt: concept2cureReviewTasks.createdAt,
        updatedAt: concept2cureReviewTasks.updatedAt,
      })
      .from(concept2cureReviewTasks)
      .innerJoin(
        concept2cureArtifacts,
        eq(concept2cureArtifacts.id, concept2cureReviewTasks.artifactId)
      )
      .where(
        and(
          eq(concept2cureReviewTasks.projectId, projectDbId),
          eq(concept2cureReviewTasks.orgId, organizationId),
          inArray(concept2cureReviewTasks.status, ['open', 'in_progress'])
        )
      )
      .orderBy(concept2cureReviewTasks.dueAt, desc(concept2cureReviewTasks.updatedAt));

    return sendSuccess(res, {
      projectId: req.params.projectId,
      threads: projectThreads,
      tasks: projectTasks,
      totalThreads: projectThreads.length,
      totalTasks: projectTasks.length,
    });
  } catch (error: any) {
    logConcept2cureError('project review queue', error, { projectId: req.params.projectId });
    return sendError(res, 500, 'Failed to fetch project review queue');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 13B — PM REVIEW PULSE (Orchestration & Visibility Layer)
// Documents first, projects second. The PM system reflects document
// review activity without replacing the governed document workflow.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/concept2cure/projects/:projectId/review-pulse
 *
 * Aggregated project-management signals derived from document-level review activity.
 * Returns:
 *   - summary counts (open threads, overdue tasks, unassigned, by priority)
 *   - per-artifact review readiness (which docs are clear vs. blocked)
 *   - recent activity feed (last N review events)
 *   - risk signals (overdue tasks, high-priority open threads, stale threads)
 *
 * This is the orchestration view — it tells PM dashboards what is happening
 * inside the document workspace without users ever leaving that workspace.
 */
router.get('/projects/:projectId/review-pulse', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) return sendError(res, 404, 'Project not found');

    const projectDbId = parseInt(req.params.projectId, 10);
    if (isNaN(projectDbId)) return sendError(res, 400, 'Invalid project ID');

    const now = new Date();
    const staleDays = 7;
    const staleThreshold = new Date(now.getTime() - staleDays * 24 * 60 * 60 * 1000);

    // ── 1. Thread summary ────────────────────────────────────────────────
    const allThreads = await db
      .select({
        id: concept2cureReviewThreads.id,
        threadId: concept2cureReviewThreads.threadId,
        title: concept2cureReviewThreads.title,
        status: concept2cureReviewThreads.status,
        priority: concept2cureReviewThreads.priority,
        assigneeId: concept2cureReviewThreads.assigneeId,
        assigneeName: concept2cureReviewThreads.assigneeName,
        artifactId: concept2cureReviewThreads.artifactId,
        updatedAt: concept2cureReviewThreads.updatedAt,
        createdAt: concept2cureReviewThreads.createdAt,
      })
      .from(concept2cureReviewThreads)
      .where(
        and(
          eq(concept2cureReviewThreads.projectId, projectDbId),
          eq(concept2cureReviewThreads.orgId, organizationId)
        )
      );

    const openThreads = allThreads.filter(t => t.status === 'open');
    const resolvedThreads = allThreads.filter(t => t.status === 'resolved');
    const highPriorityOpen = openThreads.filter(t => t.priority === 'high');
    const unassignedThreads = openThreads.filter(t => !t.assigneeId);
    const staleThreads = openThreads.filter(
      t => t.updatedAt && new Date(t.updatedAt) < staleThreshold
    );

    // ── 2. Task summary ─────────────────────────────────────────────────
    const allTasks = await db
      .select({
        id: concept2cureReviewTasks.id,
        taskId: concept2cureReviewTasks.taskId,
        title: concept2cureReviewTasks.title,
        status: concept2cureReviewTasks.status,
        taskType: concept2cureReviewTasks.taskType,
        dueAt: concept2cureReviewTasks.dueAt,
        assignedToId: concept2cureReviewTasks.assignedToId,
        assignedToName: concept2cureReviewTasks.assignedToName,
        artifactId: concept2cureReviewTasks.artifactId,
        createdAt: concept2cureReviewTasks.createdAt,
        updatedAt: concept2cureReviewTasks.updatedAt,
      })
      .from(concept2cureReviewTasks)
      .where(
        and(
          eq(concept2cureReviewTasks.projectId, projectDbId),
          eq(concept2cureReviewTasks.orgId, organizationId)
        )
      );

    const activeTasks = allTasks.filter(t => ['open', 'in_progress'].includes(t.status));
    const overdueTasks = activeTasks.filter(t => t.dueAt && new Date(t.dueAt) < now);
    const changeRequests = activeTasks.filter(t => t.taskType === 'change_request');
    const unassignedTasks = activeTasks.filter(t => !t.assignedToId);

    // ── 3. Per-artifact readiness ────────────────────────────────────────
    const artifacts = await db
      .select({
        id: concept2cureArtifacts.id,
        artifactId: concept2cureArtifacts.artifactId,
        title: concept2cureArtifacts.title,
        ctdSection: concept2cureArtifacts.ctdSection,
        status: concept2cureArtifacts.status,
      })
      .from(concept2cureArtifacts)
      .where(
        and(
          eq(concept2cureArtifacts.projectId, projectDbId),
          eq(concept2cureArtifacts.organizationId, organizationId)
        )
      );

    const artifactReadiness = artifacts.map(a => {
      const artThreads = openThreads.filter(t => t.artifactId === a.id);
      const artTasks = activeTasks.filter(t => t.artifactId === a.id);
      const artOverdue = overdueTasks.filter(t => t.artifactId === a.id);
      const artHighPriority = artThreads.filter(t => t.priority === 'high');
      const blocked = artHighPriority.length > 0 || artOverdue.length > 0;

      return {
        artifactId: a.artifactId,
        title: a.title,
        ctdSection: a.ctdSection,
        documentStatus: a.status,
        openThreads: artThreads.length,
        activeTasks: artTasks.length,
        overdueTasks: artOverdue.length,
        highPriorityThreads: artHighPriority.length,
        reviewStatus: blocked ? 'blocked' : artThreads.length > 0 ? 'in_review' : 'clear',
      };
    });

    // ── 4. Recent review activity (from projectActivities) ───────────────
    const recentActivity = await db
      .select()
      .from(projectActivities)
      .where(
        and(
          eq(projectActivities.projectId, projectDbId),
          eq(projectActivities.organizationId, organizationId),
          sql`${projectActivities.activityType} LIKE 'review_%'`
        )
      )
      .orderBy(desc(projectActivities.createdAt))
      .limit(20);

    // ── 5. Assignee workload ─────────────────────────────────────────────
    const assigneeMap = new Map<
      number,
      { name: string; threads: number; tasks: number; overdue: number }
    >();
    for (const t of openThreads) {
      if (t.assigneeId) {
        const entry = assigneeMap.get(t.assigneeId) || {
          name: t.assigneeName || 'Unknown',
          threads: 0,
          tasks: 0,
          overdue: 0,
        };
        entry.threads++;
        assigneeMap.set(t.assigneeId, entry);
      }
    }
    for (const t of activeTasks) {
      if (t.assignedToId) {
        const entry = assigneeMap.get(t.assignedToId) || {
          name: t.assignedToName || 'Unknown',
          threads: 0,
          tasks: 0,
          overdue: 0,
        };
        entry.tasks++;
        if (t.dueAt && new Date(t.dueAt) < now) entry.overdue++;
        assigneeMap.set(t.assignedToId, entry);
      }
    }

    // ── Risk signals ─────────────────────────────────────────────────────
    const riskSignals: Array<{
      severity: string;
      signal: string;
      entityId: string;
      entityType: string;
    }> = [];
    for (const t of overdueTasks) {
      riskSignals.push({
        severity: 'high',
        signal: `Overdue task: "${t.title}" (due ${t.dueAt ? new Date(t.dueAt).toLocaleDateString() : 'unknown'})`,
        entityId: t.taskId,
        entityType: 'review_task',
      });
    }
    for (const t of staleThreads) {
      riskSignals.push({
        severity: 'medium',
        signal: `Stale thread (${staleDays}+ days): "${t.title}"`,
        entityId: t.threadId,
        entityType: 'review_thread',
      });
    }
    for (const t of unassignedThreads.filter(t => t.priority === 'high')) {
      riskSignals.push({
        severity: 'high',
        signal: `High-priority unassigned thread: "${t.title}"`,
        entityId: t.threadId,
        entityType: 'review_thread',
      });
    }

    return sendSuccess(res, {
      projectId: req.params.projectId,
      generatedAt: now.toISOString(),

      summary: {
        totalThreads: allThreads.length,
        openThreads: openThreads.length,
        resolvedThreads: resolvedThreads.length,
        highPriorityOpen: highPriorityOpen.length,
        unassignedThreads: unassignedThreads.length,
        staleThreads: staleThreads.length,
        totalTasks: allTasks.length,
        activeTasks: activeTasks.length,
        overdueTasks: overdueTasks.length,
        changeRequests: changeRequests.length,
        unassignedTasks: unassignedTasks.length,
        reviewCompletionRate:
          allThreads.length > 0
            ? Math.round((resolvedThreads.length / allThreads.length) * 100)
            : 100,
      },

      artifactReadiness,

      riskSignals,

      assigneeWorkload: Array.from(assigneeMap.entries()).map(([userId, data]) => ({
        userId,
        ...data,
      })),

      recentActivity: recentActivity.map(a => ({
        activityType: a.activityType,
        entityType: a.entityType,
        entityId: a.entityId,
        description: a.description,
        createdAt: a.createdAt,
      })),
    });
  } catch (error: any) {
    logConcept2cureError('review pulse', error, { projectId: req.params.projectId });
    return sendError(res, 500, 'Failed to generate review pulse');
  }
});

export default router;
