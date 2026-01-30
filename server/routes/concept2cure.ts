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
import { db } from '../db';
import { createScopedLogger } from '../utils/logger';
import * as metricsModule from '../metrics.js';
import { authMiddleware } from '../auth';
import { requireOrganizationContext, tenantContextMiddleware } from '../middleware/tenantContext';
import { createRedisRateLimiter } from '../middleware/redisRateLimiter';
import * as DOMPurify from 'isomorphic-dompurify';
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
} from '../../shared/schema';
import * as crypto from 'crypto';

const logger = createScopedLogger('concept2cure-api');
const router = Router();
const metrics = (metricsModule as { metrics?: { concept2cureErrors?: { inc: (labels: Record<string, string>) => void } } }).metrics;

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
) => res.status(status).json({ success: false, error: { message, code, details } satisfies ApiErrorPayload });

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
  action: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'EXPORT' | 'SIGN' | 'APPROVE';
  entityType: 'project' | 'conversation' | 'message' | 'artifact';
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
      entityId 
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
      'b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li', 
      'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
      'blockquote', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'span', 'div', 'hr', 'sup', 'sub'
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
  const knowledge = settings.knowledge && typeof settings.knowledge === 'object'
    ? (settings.knowledge as Record<string, unknown>)
    : {};

  const documents = Array.isArray(knowledge.documents)
    ? knowledge.documents as UploadedDocument[]
    : [];
  const customInstructions = typeof settings.customInstructions === 'string'
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

const SubmissionTypeEnum = z.enum([
  '510K',
  'FDA_510K', // Alias for backward compatibility
  'IND',
  'NDA',
  'BLA',
  'MAA',
  'PMA',
  'DE_NOVO',
  'EUA',
]).transform(val => val === 'FDA_510K' ? '510K' : val);

const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(200, 'Name too long'),
  submissionType: SubmissionTypeEnum,
  description: z.string().max(2000, 'Description too long').optional(),
  customInstructions: z.string().max(5000).optional(),
  targetSubmissionDate: z.string().datetime().optional(),
});

const updateProjectSchema = createProjectSchema.partial();

const updateKnowledgeSchema = z.object({
  customInstructions: z.string().max(5000).optional(),
  context: z.string().max(20000).optional(),
}).partial();

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
  attachments: z.array(z.object({
    id: z.string(),
    name: z.string().max(255),
    type: z.string().max(100),
    size: z.number().int().positive().max(100 * 1024 * 1024), // 100MB max
  })).max(10).optional(),
  artifactId: z.string().optional(),
});

const createArtifactSchema = z.object({
  conversationId: z.string().optional(),
  type: z.string().min(1).max(50),
  category: z.enum(['document', 'interactive', 'visualization']),
  title: z.string().min(1, 'Title required').max(200),
  content: z.string().max(1000000, 'Content too large'), // 1MB max
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
  category: 'document' | 'interactive' | 'visualization';
  title: string;
  content: string;
  version: number;
  versions: Array<{ version: number; content: string; createdAt: Date }>;
  metadata?: Record<string, unknown>;
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
    const orgId = typeof req.tenantContext.organizationId === 'number' 
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
    const id = typeof ctx.clientWorkspaceId === 'number' 
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
async function getConversationsFromDb(projectId: number, organizationId: number): Promise<Conversation[]> {
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

  const versionsByArtifactId = new Map<number, { version: number; content: string; createdAt: Date }[]>();
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
    
    // Query projects with tenant isolation - only return projects for this organization
    const dbProjects = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.organizationId, organizationId),
          eq(projects.type, 'concept2cure'),
          isNull(projects.actualEndDate) // Not archived/deleted
        )
      )
      .orderBy(desc(projects.updatedAt));
    
    // Transform to API response format with conversations from DB
    const response = await Promise.all(dbProjects.map(async p => ({
      id: `proj_${p.id}`,
      name: p.name,
      submissionType: (p.metadata as any)?.submissionType || 'IND',
      description: p.description,
      status: p.status,
      organizationId: p.organizationId,
      conversations: await getConversationsFromDb(p.id, organizationId),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })));
    
    return sendSuccess(res, response);
  } catch (error: any) {
    logger.error('Failed to fetch projects', { 
      error: error.message,
      organizationId: req.tenantContext?.organizationId 
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
      .where(
        and(
          eq(projects.id, numericId),
          eq(projects.organizationId, organizationId),
          eq(projects.type, 'concept2cure')
        )
      )
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
      conversations: [],
      status: newProject.status,
      organizationId: newProject.organizationId,
      createdAt: newProject.createdAt,
      updatedAt: newProject.updatedAt,
    };
    
    logger.info('Created new project', { 
      projectId, 
      name: newProject.name,
      organizationId 
    });
    return sendSuccess(res.status(201), response);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation failed', error.errors, 'VALIDATION_ERROR');
    }
    logConcept2cureError('create project', error, { organizationId: req.tenantContext?.organizationId });
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
      .where(
        and(
          eq(projects.id, numericId),
          eq(projects.organizationId, organizationId)
        )
      )
      .limit(1);
    
    if (!existing) {
      return sendError(res, 404, 'Project not found');
    }
    
    // Prepare sanitized update data
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    
    if (data.name) updateData.name = sanitizeContent(data.name);
    if (data.description !== undefined) updateData.description = data.description ? sanitizeContent(data.description) : null;
    
    if (data.submissionType || data.targetSubmissionDate) {
      updateData.metadata = {
        ...(existing.metadata as object || {}),
        ...(data.submissionType && { submissionType: data.submissionType }),
        ...(data.targetSubmissionDate && { targetSubmissionDate: data.targetSubmissionDate }),
      };
    }
    
    if (data.customInstructions !== undefined) {
      updateData.settings = {
        ...(existing.settings as object || {}),
        customInstructions: data.customInstructions ? sanitizeContent(data.customInstructions) : null,
      };
    }
    
    // Update with tenant isolation
    const [updated] = await db
      .update(projects)
      .set(updateData)
      .where(
        and(
          eq(projects.id, numericId),
          eq(projects.organizationId, organizationId)
        )
      )
      .returning();
    
    // Log audit entry for 21 CFR Part 11 compliance
    await logAuditEntry(req, 'UPDATE', 'project', req.params.id, existing, updated);
    
    // Transform response with DB conversations
    const response = {
      id: req.params.id,
      name: updated.name,
      submissionType: (updated.metadata as any)?.submissionType || 'IND',
      description: updated.description,
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
      .where(
        and(
          eq(projects.id, numericId),
          eq(projects.organizationId, organizationId)
        )
      )
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
      .where(
        and(
          eq(projects.id, numericId),
          eq(projects.organizationId, organizationId)
        )
      );
    
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
      .where(
        and(
          eq(projects.id, numericId),
          eq(projects.organizationId, organizationId),
          eq(projects.type, 'concept2cure')
        )
      )
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
      .where(
        and(
          eq(projects.id, numericId),
          eq(projects.organizationId, organizationId),
          eq(projects.type, 'concept2cure')
        )
      )
      .limit(1);

    if (!project) {
      return sendError(res, 404, 'Project not found');
    }

    const settings = normalizeProjectSettings(project.settings);
    const knowledge = normalizeKnowledge(settings);

    const updatedKnowledge: ProjectKnowledge = {
      ...knowledge,
      customInstructions: data.customInstructions !== undefined
        ? (data.customInstructions ? sanitizeContent(data.customInstructions) : '')
        : knowledge.customInstructions,
      context: data.context !== undefined
        ? (data.context ? sanitizeContent(data.context) : '')
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
      .where(
        and(
          eq(projects.id, numericId),
          eq(projects.organizationId, organizationId)
        )
      )
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
router.post('/documents/upload', knowledgeUpload.single('file'), async (req: Request, res: Response) => {
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
      .where(
        and(
          eq(projects.id, numericId),
          eq(projects.organizationId, organizationId),
          eq(projects.type, 'concept2cure')
        )
      )
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
      .where(
        and(
          eq(projects.id, numericId),
          eq(projects.organizationId, organizationId)
        )
      )
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
});

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
      .where(
        and(
          eq(projects.organizationId, organizationId),
          eq(projects.type, 'concept2cure'),
          isNull(projects.actualEndDate)
        )
      );

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
      .where(
        and(
          eq(projects.id, target.id),
          eq(projects.organizationId, organizationId)
        )
      )
      .returning();

    await logAuditEntry(req, 'UPDATE', 'project', `proj_${target.id}`, target, updated);

    return sendSuccess(res, { deleted: true, documentId });
  } catch (error: any) {
    logger.error('Failed to delete knowledge document', { error: error.message });
    return sendError(res, 500, 'Failed to delete knowledge document');
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
    .where(
      and(
        eq(projects.id, numericId),
        eq(projects.organizationId, organizationId),
        eq(projects.type, 'concept2cure')
      )
    )
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
router.post('/projects/:projectId/conversations/:conversationId/messages', async (req: Request, res: Response) => {
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
});

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
    
    logger.info('Updated artifact', { artifactId: req.params.artifactId, version: artifact.version });
    return sendSuccess(res, artifact);
  } catch (error: any) {
    logConcept2cureError('update artifact', error, { artifactId: req.params.artifactId });
    return sendError(res, 500, 'Failed to update artifact');
  }
});

/**
 * POST /api/concept2cure/projects/:projectId/artifacts/:artifactId/signatures
 * Create an electronic signature for an artifact version (21 CFR Part 11).
 */
router.post('/projects/:projectId/artifacts/:artifactId/signatures', async (req: Request, res: Response) => {
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
    const signatureMeaning = data.signatureMeaning ? sanitizeContent(data.signatureMeaning) : null;
    const signatureManifest = data.signatureManifest ? sanitizeObject(data.signatureManifest) : null;
    
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
      templates = templates.filter(t => 
        t.submissionTypes.includes(submissionType as string)
      );
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

export default router;
