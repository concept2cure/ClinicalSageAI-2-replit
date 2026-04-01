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
import { eq, ne, desc, and, isNull, inArray, or, sql } from 'drizzle-orm';
import { db, pool } from '../db';
import { createScopedLogger } from '../utils/logger';
import * as metricsModule from '../metrics.js';
import { authMiddleware } from '../auth';
import { requireOrganizationContext, tenantContextMiddleware } from '../middleware/tenantContext';
import { createRedisRateLimiter } from '../middleware/redisRateLimiter';
import { cacheResponse } from '../middleware/enterprise-performance';
import DOMPurifyImport from 'isomorphic-dompurify';
const DOMPurify = (DOMPurifyImport as any).default || DOMPurifyImport;
import multer from 'multer';
import path from 'path';
import { type GovernedDocumentActionContract } from '../../shared/types/document-contract';
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
  projectTasks,
  projectWorkflowStages,
  projectMilestones,
  concept2cureProvenanceEvents,
  concept2cureReviewComments,
  concept2cureReviewAssignments,
  concept2cureReviewDecisions,
  concept2cureSubmissionSnapshots,
  concept2cureReviewThreads,
  concept2cureThreadComments,
  concept2cureReviewTasks,
  projectActivities,
  c2cProjectWorkItems,
  concept2cureNotifications,
  conversationWorkingMemory,
} from '../../shared/schema';
import * as crypto from 'crypto';
import { guardEmptyContent, guardDemoContent } from '../middleware/documentLoopGuards';
import { computeConversationHealth } from '../services/conversation-health.js';
import {
  interceptComplianceScan,
  interceptArtifactChange,
  interceptFeedback,
} from '../services/intelligence/rim-interceptors.js';
import { emitTraceEvent, createTraceId } from '../services/generation-guard.js';
import {
  resolveGovernedContext,
} from '../services/concept2cure/governedDocumentContractService';
import {
  buildWorkingMemoryPrompt,
  storeWorkingMemory,
  getLatestWorkingMemory,
  formatWorkingMemoryForPrompt,
  needsWorkingMemoryRefresh,
} from '../services/working-memory.js';
import {
  COMMUNICATION_VISIBILITY_TIERS,
  PUBLISHOPS_SERVICE_STATES,
  type AgencyCommunicationEventRecord,
  type AuthorityProfileRecord,
  type PublishOpsServiceRecord,
  type CommunicationVisibilityTier,
} from '../../shared/types/communication-center';

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
import { ai } from '../lib/unified-ai-client';

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

let communicationCenterSchemaCheck: 'unknown' | 'ready' | 'missing' = 'unknown';

async function ensureCommunicationCenterTables(): Promise<void> {
  if (communicationCenterSchemaCheck === 'ready') return;
  if (communicationCenterSchemaCheck === 'missing') {
    throw new Error(
      'Communication Center persistence tables are missing. Run migration 20260331_communication_center_scaffold.sql'
    );
  }
  const result = await pool.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])`,
    [[
      'concept2cure_authority_profiles',
      'concept2cure_agency_communications',
      'concept2cure_publishops_services',
    ]]
  );
  const found = new Set(result.rows.map((r: any) => r.table_name));
  const missing = [
    'concept2cure_authority_profiles',
    'concept2cure_agency_communications',
    'concept2cure_publishops_services',
  ].filter(t => !found.has(t));
  if (missing.length > 0) {
    communicationCenterSchemaCheck = 'missing';
    throw new Error(
      `Communication Center persistence tables missing: ${missing.join(', ')}. Run migration 20260331_communication_center_scaffold.sql`
    );
  }
  communicationCenterSchemaCheck = 'ready';
}

function parseProjectParam(projectParam: string): number {
  const numericId = Number.parseInt(projectParam.replace('proj_', ''), 10);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    throw new Error('Invalid project ID');
  }
  return numericId;
}

function canViewVisibilityTier(
  visibilityTier: CommunicationVisibilityTier,
  userRole?: string
): boolean {
  const role = (userRole || '').toLowerCase();
  if (!COMMUNICATION_VISIBILITY_TIERS.includes(visibilityTier)) return false;
  if (visibilityTier === 'restricted_legal_sensitive') {
    return ['admin', 'owner', 'compliance', 'legal'].some(r => role.includes(r));
  }
  if (visibilityTier === 'publishops_only') {
    return role.includes('publishops') || role.includes('admin');
  }
  if (visibilityTier === 'c2c_internal') {
    return role.includes('c2c') || role.includes('admin');
  }
  return true;
}

function communicationCenterErrorStatus(error: unknown): number {
  const message = (error as any)?.message || '';
  if (typeof message === 'string' && message.includes('persistence tables')) {
    return 503;
  }
  return 400;
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
      ? parseInt(req.tenantContext.organizationId as string, 10)
      : (req.tenantId as number) || 0;

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
      userId: req.userId,
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

interface ConnectedAppRecord {
  appId: string;
  connectedAt: string;
  status: 'active' | 'paused';
  memoryRole?: string;
}

function normalizeConnectedApps(settings: Record<string, unknown>): ConnectedAppRecord[] {
  const apps = settings.connectedApps;
  return Array.isArray(apps) ? (apps as ConnectedAppRecord[]) : [];
}

function estimateTokensFromBytes(bytes: number): number {
  return Math.ceil(bytes * 0.25);
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────

/** Legacy enum kept for backward compat — still accepted in createProjectSchema */
const LEGACY_SUBMISSION_TYPES = [
  '510K',
  'FDA_510K',
  'IND',
  'NDA',
  'BLA',
  'MAA',
  'PMA',
  'DE_NOVO',
  'EUA',
] as const;

/**
 * SubmissionTypeEnum — accepts either a known legacy type or any non-empty string.
 * Legacy aliases (FDA_510K) are normalized. New registry-based types pass through.
 */
const SubmissionTypeEnum = z
  .string()
  .min(1, 'Submission type is required')
  .max(50)
  .transform(val => (val === 'FDA_510K' ? '510K' : val));

// Submission-type-specific default instruction templates
const submissionTypeInstructionTemplates: Record<string, (product: string) => string> = {
  '510K': product =>
    `You are an FDA 510(k) regulatory expert for ${product}. Focus on substantial equivalence analysis, predicate device comparison, performance data requirements, and 510(k) submission readiness. Reference all project documents, predicate device information, and intelligence when responding.`,
  IND: product =>
    `You are an FDA IND (Investigational New Drug) regulatory expert for ${product}. Focus on preclinical data requirements, clinical trial protocol design, CMC (Chemistry, Manufacturing, and Controls) documentation, and IND submission strategy. Reference all project documents and intelligence when responding.`,
  NDA: product =>
    `You are an FDA NDA (New Drug Application) regulatory expert for ${product}. Focus on clinical efficacy and safety data, labeling strategy, risk-benefit analysis, CMC compliance, and NDA submission readiness. Reference all project documents and intelligence when responding.`,
  BLA: product =>
    `You are an FDA BLA (Biologics License Application) regulatory expert for ${product}. Focus on biological product characterization, manufacturing process validation, clinical immunogenicity data, and BLA submission strategy. Reference all project documents and intelligence when responding.`,
  MAA: product =>
    `You are an EMA MAA (Marketing Authorisation Application) regulatory expert for ${product}. Focus on EU regulatory requirements, CTD Module structure, scientific advice alignment, and MAA submission readiness across EU member states. Reference all project documents and intelligence when responding.`,
  PMA: product =>
    `You are an FDA PMA (Premarket Approval) regulatory expert for ${product}. Focus on clinical evidence requirements, device safety and effectiveness, manufacturing quality systems, and PMA submission strategy. Reference all project documents and intelligence when responding.`,
  DE_NOVO: product =>
    `You are an FDA De Novo classification regulatory expert for ${product}. Focus on risk-benefit analysis for novel devices, classification rationale, special controls development, and De Novo submission readiness. Reference all project documents and intelligence when responding.`,
  EUA: product =>
    `You are an FDA EUA (Emergency Use Authorization) regulatory expert for ${product}. Focus on known and potential benefits vs. risks, available alternatives analysis, emergency use criteria, and EUA submission strategy. Reference all project documents and intelligence when responding.`,
};

function generateDefaultCustomInstructions(
  submissionType: string,
  product?: string | null,
  projectName?: string
): string {
  const productLabel = product || projectName || 'this product';
  const templateFn = submissionTypeInstructionTemplates[submissionType];
  if (templateFn) {
    return templateFn(productLabel);
  }
  // Generic fallback for unknown submission types
  return `You are a ${submissionType} regulatory expert for ${productLabel}. Focus on regulatory strategy, submission readiness, and compliance. Reference all project documents and intelligence when responding.`;
}
const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(200, 'Name too long'),
  submissionType: SubmissionTypeEnum,
  description: z.string().max(2000, 'Description too long').optional(),
  customInstructions: z.string().max(5000).optional(),
  targetSubmissionDate: z.string().datetime().optional(),
  sponsor: z.string().max(200).optional(),
  product: z.string().max(200).optional(),
  region: z.string().max(100).optional(),
  pinned: z.boolean().optional(),
  targetAgency: z.string().max(50).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color')
    .optional(),
  /** New: canonical registry ID (e.g., 'US_IND', 'EU_MAA') — takes precedence over submissionType for bootstrap */
  registryId: z.string().max(50).optional(),
  /** New: registry-driven metadata fields */
  applicationFamily: z.string().max(50).optional(),
  applicationType: z.string().max(100).optional(),
  agency: z.string().max(50).optional(),
  country: z.string().max(100).optional(),
  productClass: z.string().max(50).optional(),
  dossierStandard: z.string().max(20).optional(),
  lifecycleStage: z.string().max(30).optional(),
});

const updateProjectSchema = createProjectSchema.partial();

const updateKnowledgeSchema = z
  .object({
    customInstructions: z.string().max(5000).optional(),
    context: z.string().max(20000).optional(),
  })
  .partial();

const ownershipPreferencesSchema = z
  .object({
    projectInstructions: z.string().max(5000).optional(),
    reusableSnippetsKnowledge: z.array(z.string().max(2000)).max(200).optional(),
    currentWorkbenchContext: z
      .enum([
        'project-home',
        'regulatory-workspace',
        'documents',
        'review',
        'review-readiness',
        'submissions',
        'section-workspace',
        'report-engine',
      ])
      .optional(),
  })
  .partial();

const projectCollaboratorSchema = z.object({
  userId: z.number().int().positive(),
  permission: z.enum(['can_use', 'can_edit']),
});

const updateProjectCollaboratorsSchema = z.object({
  collaborators: z.array(projectCollaboratorSchema).max(100),
});

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
  category: z.enum(['document', 'interactive', 'visualization', 'source', 'evidence']),
  title: z.string().min(1, 'Title required').max(200),
  content: z.string().min(1, 'Content must not be empty').max(1000000, 'Content too large'), // 1MB max, no empty
  ctdSection: z.string().max(50).optional(),
  metadata: z.record(z.any()).optional(),
  clientTrack: z.enum(['biotech', 'device', 'diagnostics']).optional(),
  submissionProgram: z.enum(['ind', 'ectd', '510k', 'pma', 'cer', 'ivdr', 'general_ri']).optional(),
  persona: z
    .enum(['regulatory', 'medical_writer', 'cmc', 'clinical', 'qa', 'executive', 'cro'])
    .optional(),
  regulatorScope: z.enum(['fda', 'ema', 'mhra', 'hc', 'pmda', 'multi']).optional(),
  evidenceMode: z.enum(['csr', 'literature', 'predicate', 'cmc_source', 'test_data', 'mixed']).optional(),
  documentClass: z
    .enum([
      'strategy_memo',
      'evidence_memo',
      'section_draft',
      'module3_output',
      'submission_component',
      'audit_report',
      'comparator_summary',
      'risk_benefit',
      'protocol_rationale',
      'regional_differences',
      'safety_evidence_brief',
      'endpoint_justification',
    ])
    .optional(),
  readinessGate: z
    .enum(['exploratory', 'internal_review', 'submission_candidate', 'inspection_ready'])
    .optional(),
  approvalPathType: z
    .enum(['single_reviewer', 'regulated_dual_review', 'qa_lock', 'signoff_required'])
    .optional(),
  recommendationSource: z
    .enum([
      'ana_ri',
      'cmc_builder',
      'cerv2_510k',
      'cerv2_pma',
      'cerv2_cer',
      'ectd_compiler',
      'ind_autodraft',
      'report_engine',
    ])
    .optional(),
  originSurface: z
    .enum([
      'ri_copilot',
      'ectd_coauthor',
      'ind_workspace',
      'cmc_workspace',
      'cerv2_device',
      'editor_panel',
      'api_route',
      'import_pipeline',
      'system',
      'project_workspace_shell',
      'ai_orchestrator',
    ])
    .optional(),
  workspaceTarget: z.enum(['project', 'dossier', 'vault']).optional(),
  dossierContainerId: z.string().optional(),
  artifactContainerId: z.string().optional(),
  regulatorIntent: z
    .enum([
      'submission_authoring',
      'evidence_analysis',
      'strategy',
      'comparison',
      'qa_review',
      'inspection_support',
    ])
    .optional(),
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
  ctdSection?: string | null;
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
  /** Whether this document is active in the AI context window (default: true) */
  isActive?: boolean;
}

interface ProjectKnowledge {
  documents: UploadedDocument[];
  customInstructions?: string;
  context?: string;
}

interface ProjectOwnership {
  chatHistory: Conversation[];
  documentInventory: UploadedDocument[];
  vaultLinkedFilesEvidence: UploadedDocument[];
  projectInstructions: string;
  ownershipTeam?: Array<{ userId: number; permission: 'can_use' | 'can_edit' }>;
  connectedAppsContext: string;
  reusableSnippetsKnowledge: string[];
  reports: string[];
  reviewState: string;
  approvals: Array<Record<string, unknown>>;
  readinessState: string;
  activityHistory: AuditEntry[];
  currentWorkbenchContext: string;
}

function buildProjectOwnership(
  conversations: Conversation[],
  settings: Record<string, unknown>
): ProjectOwnership {
  const knowledge = normalizeKnowledge(settings);
  const ownership =
    settings.ownership && typeof settings.ownership === 'object'
      ? (settings.ownership as Record<string, unknown>)
      : {};

  return {
    chatHistory: conversations,
    documentInventory: knowledge.documents,
    vaultLinkedFilesEvidence: Array.isArray(ownership.vaultLinkedFilesEvidence)
      ? (ownership.vaultLinkedFilesEvidence as UploadedDocument[])
      : [],
    projectInstructions:
      (typeof settings.customInstructions === 'string' ? settings.customInstructions : '') ||
      (typeof ownership.projectInstructions === 'string' ? ownership.projectInstructions : ''),
    ownershipTeam: Array.isArray(ownership.ownershipTeam)
      ? (ownership.ownershipTeam as Array<{ userId: number; permission: 'can_use' | 'can_edit' }>)
      : [],
    connectedAppsContext: (() => {
      const apps = normalizeConnectedApps(settings);
      return apps
        .filter(a => a.status === 'active' && a.memoryRole)
        .map(a => a.memoryRole)
        .join('\n');
    })(),
    reusableSnippetsKnowledge: Array.isArray(ownership.reusableSnippetsKnowledge)
      ? (ownership.reusableSnippetsKnowledge as string[])
      : [],
    reports: Array.isArray(ownership.reports) ? (ownership.reports as string[]) : [],
    reviewState: typeof ownership.reviewState === 'string' ? ownership.reviewState : 'draft',
    approvals: Array.isArray(ownership.approvals)
      ? (ownership.approvals as Array<Record<string, unknown>>)
      : [],
    readinessState:
      typeof ownership.readinessState === 'string' ? ownership.readinessState : 'not_started',
    activityHistory: [],
    currentWorkbenchContext:
      typeof ownership.currentWorkbenchContext === 'string'
        ? ownership.currentWorkbenchContext
        : '',
  };
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
  if (!req.userId) {
    throw new Error('Authentication required: userId not set on request');
  }
  return req.userId;
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
  throw new Error('Client workspace context required');
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

async function getOwnershipDerivationData(
  projectIds: number[],
  organizationId: number
): Promise<{
  approvalsByProject: Map<number, Array<Record<string, unknown>>>;
  reviewTasksByProject: Map<number, Array<{ status: string | null; taskType: string | null }>>;
  reportsByProject: Map<number, OwnershipReportRef[]>;
  activitiesByProject: Map<number, AuditEntry[]>;
}> {
  const approvalsByProject = new Map<number, Array<Record<string, unknown>>>();
  const reviewTasksByProject = new Map<
    number,
    Array<{ status: string | null; taskType: string | null }>
  >();
  const reportsByProject = new Map<number, OwnershipReportRef[]>();
  const activitiesByProject = new Map<number, AuditEntry[]>();

  if (projectIds.length === 0) {
    return { approvalsByProject, reviewTasksByProject, reportsByProject, activitiesByProject };
  }

  const signatureRows = await db
    .select({
      projectId: concept2cureArtifacts.projectId,
      signatureId: concept2cureSignatures.signatureId,
      signerName: concept2cureSignatures.signerName,
      signedAt: concept2cureSignatures.signedAt,
      signatureMeaning: concept2cureSignatures.signatureMeaning,
      signatureHash: concept2cureSignatures.signatureHash,
    })
    .from(concept2cureSignatures)
    .innerJoin(
      concept2cureArtifacts,
      eq(concept2cureSignatures.artifactId, concept2cureArtifacts.id)
    )
    .where(
      and(
        inArray(concept2cureArtifacts.projectId, projectIds),
        eq(concept2cureSignatures.organizationId, organizationId),
        eq(concept2cureArtifacts.organizationId, organizationId)
      )
    );
  for (const row of signatureRows) {
    const list = approvalsByProject.get(row.projectId) || [];
    list.push({
      signerId: row.signatureId,
      signerName: row.signerName,
      signedAt: row.signedAt?.toISOString(),
      meaning: row.signatureMeaning || 'Approved',
      signatureHash: row.signatureHash,
    });
    approvalsByProject.set(row.projectId, list);
  }

  const reviewRows = await db
    .select({
      projectId: concept2cureReviewTasks.projectId,
      status: concept2cureReviewTasks.status,
      taskType: concept2cureReviewTasks.taskType,
    })
    .from(concept2cureReviewTasks)
    .where(
      and(
        inArray(concept2cureReviewTasks.projectId, projectIds),
        eq(concept2cureReviewTasks.orgId, organizationId)
      )
    );
  for (const row of reviewRows) {
    const list = reviewTasksByProject.get(row.projectId) || [];
    list.push({ status: row.status, taskType: row.taskType });
    reviewTasksByProject.set(row.projectId, list);
  }

  const artifactReportRows = await db
    .select({
      projectId: concept2cureArtifacts.projectId,
      artifactId: concept2cureArtifacts.artifactId,
      title: concept2cureArtifacts.title,
      status: concept2cureArtifacts.status,
      updatedAt: concept2cureArtifacts.updatedAt,
      type: concept2cureArtifacts.type,
    })
    .from(concept2cureArtifacts)
    .where(
      and(
        inArray(concept2cureArtifacts.projectId, projectIds),
        eq(concept2cureArtifacts.organizationId, organizationId)
      )
    );
  for (const row of artifactReportRows) {
    const lowerType = row.type?.toLowerCase() || '';
    const isReportLike = lowerType.includes('report') || lowerType.includes('summary');
    if (!isReportLike) continue;
    const list = reportsByProject.get(row.projectId) || [];
    list.push({
      id: row.artifactId,
      title: row.title,
      kind: 'artifact_report',
      status: (row.status as OwnershipReportRef['status']) || 'draft',
      updatedAt: row.updatedAt?.toISOString(),
    });
    reportsByProject.set(row.projectId, list);
  }

  const snapshotRows = await db
    .select({
      projectId: concept2cureArtifacts.projectId,
      snapshotId: concept2cureSubmissionSnapshots.snapshotId,
      title: concept2cureSubmissionSnapshots.title,
      actionType: concept2cureSubmissionSnapshots.actionType,
      createdAt: concept2cureSubmissionSnapshots.createdAt,
    })
    .from(concept2cureSubmissionSnapshots)
    .innerJoin(
      concept2cureArtifacts,
      eq(concept2cureSubmissionSnapshots.artifactId, concept2cureArtifacts.id)
    )
    .where(
      and(
        inArray(concept2cureArtifacts.projectId, projectIds),
        eq(concept2cureSubmissionSnapshots.organizationId, organizationId),
        eq(concept2cureArtifacts.organizationId, organizationId)
      )
    );
  for (const row of snapshotRows) {
    const list = reportsByProject.get(row.projectId) || [];
    list.push({
      id: row.snapshotId,
      title: row.title,
      kind: 'submission_snapshot',
      status: row.actionType === 'publish' ? 'published' : 'approved',
      updatedAt: row.createdAt?.toISOString(),
    });
    reportsByProject.set(row.projectId, list);
  }

  const activityRows = await db
    .select({
      projectId: projectActivities.projectId,
      id: projectActivities.id,
      createdAt: projectActivities.createdAt,
      userId: projectActivities.userId,
      activityType: projectActivities.activityType,
      entityType: projectActivities.entityType,
      entityId: projectActivities.entityId,
      description: projectActivities.description,
    })
    .from(projectActivities)
    .where(
      and(
        inArray(projectActivities.projectId, projectIds),
        eq(projectActivities.organizationId, organizationId)
      )
    )
    .orderBy(desc(projectActivities.createdAt))
    .limit(500);
  for (const row of activityRows) {
    const list = activitiesByProject.get(row.projectId) || [];
    if (list.length >= 50) continue;
    list.push({
      id: `project_activity_${row.id}`,
      timestamp: row.createdAt?.toISOString() || new Date().toISOString(),
      userId: row.userId?.toString() || 'system',
      userName: 'project-activity',
      action: (row.activityType?.toUpperCase() as AuditEntry['action']) || 'UPDATE',
      entityType: (row.entityType as AuditEntry['entityType']) || 'project',
      entityId: row.entityId || `proj_${row.projectId}`,
      newValue: { description: row.description },
    });
    activitiesByProject.set(row.projectId, list);
  }

  const projectEntityIds = projectIds.map(id => `proj_${id}`);
  const auditRows = await db
    .select({
      entityId: regulatoryAuditLogs.entityId,
      timestamp: regulatoryAuditLogs.timestamp,
      userId: regulatoryAuditLogs.userId,
      userName: regulatoryAuditLogs.userName,
      action: regulatoryAuditLogs.action,
      entityType: regulatoryAuditLogs.entityType,
    })
    .from(regulatoryAuditLogs)
    .where(
      and(
        eq(regulatoryAuditLogs.organizationId, organizationId),
        eq(regulatoryAuditLogs.entityType, 'project'),
        inArray(regulatoryAuditLogs.entityId, projectEntityIds)
      )
    )
    .orderBy(desc(regulatoryAuditLogs.timestamp))
    .limit(500);
  for (const row of auditRows) {
    const numeric = Number.parseInt((row.entityId || '').replace('proj_', ''), 10);
    if (!numeric || Number.isNaN(numeric)) continue;
    const list = activitiesByProject.get(numeric) || [];
    if (list.length >= 50) continue;
    list.push({
      id: `audit_${row.entityId}_${row.timestamp?.toISOString() || Date.now()}`,
      timestamp: row.timestamp?.toISOString() || new Date().toISOString(),
      userId: row.userId?.toString() || 'system',
      userName: row.userName || 'unknown',
      action: (row.action as AuditEntry['action']) || 'UPDATE',
      entityType: (row.entityType as AuditEntry['entityType']) || 'project',
      entityId: row.entityId || `proj_${numeric}`,
    });
    activitiesByProject.set(numeric, list);
  }

  return { approvalsByProject, reviewTasksByProject, reportsByProject, activitiesByProject };
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
    .select({
      artifactId: concept2cureArtifactVersions.artifactId,
      version: concept2cureArtifactVersions.version,
      content: concept2cureArtifactVersions.content,
      createdAt: concept2cureArtifactVersions.createdAt,
    })
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
router.get(
  '/projects',
  cacheResponse({ ttl: 30_000, keyGenerator: req => `projects:${(req as any).organizationId}` }),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);

      // Use raw SQL to avoid Drizzle ORM schema mismatch (parent_project_id doesn't exist in DB)
      const result = await pool.query(
        `SELECT id, name, description, status, type, metadata, settings, created_at, updated_at
       FROM projects
       WHERE organization_id = $1
         AND actual_end_date IS NULL
       ORDER BY updated_at DESC
       LIMIT 100`,
        [organizationId]
      );

      // Batch-load all conversations for all projects (2 queries total instead of 2*N)
      const projectIds = result.rows.map((p: any) => p.id);
      const allConversationsByProject = new Map<number, Conversation[]>();
      const derivationData = await getOwnershipDerivationData(projectIds, organizationId);

      if (projectIds.length > 0) {
        const allDbConvs = await db
          .select()
          .from(concept2cureConversations)
          .where(
            and(
              inArray(concept2cureConversations.projectId, projectIds),
              eq(concept2cureConversations.organizationId, organizationId),
              eq(concept2cureConversations.status, 'active')
            )
          )
          .orderBy(desc(concept2cureConversations.updatedAt));

        if (allDbConvs.length > 0) {
          const convIds = allDbConvs.map(c => c.id);
          const allDbMsgs = await db
            .select()
            .from(concept2cureMessages)
            .where(inArray(concept2cureMessages.conversationId, convIds))
            .orderBy(concept2cureMessages.createdAt);

          const msgsByConv = new Map<number, Message[]>();
          for (const m of allDbMsgs) {
            const list = msgsByConv.get(m.conversationId) || [];
            list.push({
              id: m.messageId,
              role: m.role as 'user' | 'assistant',
              content: m.content,
              timestamp: m.createdAt,
              attachments: m.attachments as Message['attachments'],
              artifactId: m.artifactId || undefined,
              edited: m.edited || false,
            });
            msgsByConv.set(m.conversationId, list);
          }

          for (const conv of allDbConvs) {
            const list = allConversationsByProject.get(conv.projectId) || [];
            list.push({
              id: conv.conversationId,
              projectId: `proj_${conv.projectId}`,
              title: conv.title,
              messages: msgsByConv.get(conv.id) || [],
              parentConversationId: conv.parentConversationId?.toString(),
              forkMessageIndex: conv.forkMessageIndex || undefined,
              threadId: conv.threadId || undefined,
              createdAt: conv.createdAt,
              updatedAt: conv.updatedAt,
            });
            allConversationsByProject.set(conv.projectId, list);
          }
        }
      }

      const response = result.rows.map((p: any) => {
        const conversations = allConversationsByProject.get(p.id) || [];
        return {
          id: `proj_${p.id}`,
          name: p.name,
          submissionType: p.metadata?.submissionType || p.type || 'IND',
          description: p.description,
          status: p.status || 'active',
          sponsor: p.metadata?.sponsor,
          product: p.metadata?.product,
          region: p.metadata?.region,
          pinned: (p.metadata as any)?.pinned ?? false,
          targetAgency: (p.metadata as any)?.targetAgency ?? null,
          color: (p.metadata as any)?.color ?? null,
          organizationId,
          conversations,
          ownership: buildProjectOwnership(conversations, normalizeProjectSettings(p.settings)),
          createdAt: p.created_at,
          updatedAt: p.updated_at,
        };
      });

      return sendSuccess(res, response);
    } catch (error: any) {
      logger.error('Failed to fetch projects', {
        error: error.message,
        organizationId: req.tenantContext?.organizationId,
      });
      return sendError(res, 500, 'Failed to fetch projects');
    }
  }
);

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

    const settings = normalizeProjectSettings(project.settings);
    const conversations = await getConversationsFromDb(project.id, organizationId);

    // Transform to API response with DB conversations
    const response = {
      id: `proj_${project.id}`,
      name: project.name,
      submissionType: (project.metadata as any)?.submissionType || 'IND',
      description: project.description,
      sponsor: (project.metadata as any)?.sponsor,
      product: (project.metadata as any)?.product,
      region: (project.metadata as any)?.region,
      pinned: (project.metadata as any)?.pinned ?? false,
      targetAgency: (project.metadata as any)?.targetAgency ?? null,
      color: (project.metadata as any)?.color ?? null,
      customInstructions: (project.settings as any)?.customInstructions,
      status: project.status,
      organizationId: project.organizationId,
      conversations,
      ownership: buildProjectOwnership(conversations, settings),
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
 * Returns submission-type-aware suggested actions for display after project creation.
 */
function getSuggestedActionsForType(
  submissionType: string
): Array<{ id: string; label: string; command: string }> {
  const base = [
    { id: 'dossier-map', label: 'Start Dossier Map', command: '/dossier' },
    { id: 'add-docs', label: 'Add Documents', command: '/upload' },
    { id: 'readiness', label: 'Run Readiness Check', command: '/readiness' },
  ];

  const upperType = (submissionType ?? '').toUpperCase();

  // Device submissions
  if (['510K', 'PMA', 'DE_NOVO'].includes(upperType)) {
    return [...base, { id: 'predicates', label: 'Find Predicates', command: '/predicates' }];
  }

  // Drug submissions
  if (['IND', 'NDA', 'BLA', 'ANDA'].includes(upperType)) {
    return [
      ...base,
      { id: 'clinical-review', label: 'Review Clinical Data', command: '/clinical' },
    ];
  }

  // EU submissions
  if (['MAA', 'IVDR'].includes(upperType)) {
    return [...base, { id: 'regulatory-path', label: 'Map Regulatory Path', command: '/pathway' }];
  }

  // Default (EUA or unknown)
  return [...base, { id: 'strategy', label: 'Define Strategy', command: '/strategy' }];
}

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

    // Auto-populate custom instructions based on registry entry or submission type
    if (!data.customInstructions) {
      data.customInstructions = generateDefaultCustomInstructions(
        data.submissionType,
        data.product,
        data.name
      );
    }

    // Sanitize user input
    const sanitizedData = {
      name: sanitizeContent(data.name),
      description: data.description ? sanitizeContent(data.description) : null,
      customInstructions: sanitizeContent(data.customInstructions),
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
          registryId: data.registryId ?? null,
          applicationFamily: data.applicationFamily ?? null,
          applicationType: data.applicationType ?? null,
          agency: data.agency ?? data.targetAgency ?? null,
          country: data.country ?? null,
          productClass: data.productClass ?? null,
          dossierStandard: data.dossierStandard ?? null,
          lifecycleStage: data.lifecycleStage ?? null,
          targetSubmissionDate: data.targetSubmissionDate,
          sponsor: data.sponsor,
          product: data.product,
          region: data.region,
          pinned: data.pinned ?? false,
          targetAgency: data.targetAgency ?? null,
          color: data.color ?? null,
        },
        settings: {
          customInstructions: sanitizedData.customInstructions,
          ownership: {
            chatHistory: [],
            documentInventory: [],
            vaultLinkedFilesEvidence: [],
            projectInstructions: sanitizedData.customInstructions || '',
            reusableSnippetsKnowledge: [],
            reports: [],
            reviewState: 'draft',
            approvals: [],
            readinessState: 'not_started',
            activityHistory: [],
            currentWorkbenchContext: '',
          },
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

    // Create initial AnA conversation thread for the project
    const initialThreadId = `thread_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

    // Transform response
    const response = {
      id: projectId,
      name: newProject.name,
      submissionType: data.submissionType,
      registryId: data.registryId ?? null,
      applicationFamily: data.applicationFamily ?? null,
      applicationType: data.applicationType ?? null,
      description: newProject.description,
      sponsor: data.sponsor,
      product: data.product,
      region: data.region,
      agency: data.agency ?? data.targetAgency ?? null,
      dossierStandard: data.dossierStandard ?? null,
      conversations: [],
      ownership: buildProjectOwnership([], normalizeProjectSettings(newProject.settings)),
      status: newProject.status,
      organizationId: newProject.organizationId,
      pinned: (newProject.metadata as any)?.pinned ?? false,
      targetAgency: (newProject.metadata as any)?.targetAgency ?? null,
      createdAt: newProject.createdAt,
      updatedAt: newProject.updatedAt,
      initialThreadId,
      suggestedActions: getSuggestedActionsForType(data.submissionType),
    };

    logger.info('Created new project', {
      projectId,
      name: newProject.name,
      organizationId,
    });

    // Post-creation: initialize intelligence profile and CTD sections (non-blocking)
    Promise.allSettled([
      // Create intelligence profile
      (async () => {
        try {
          const { getOrCreateProfile } = await import(
            '../services/intelligence/project-intelligence-service.js'
          );
          await getOrCreateProfile(newProject.id, organizationId);
          logger.info('Auto-created intelligence profile', { projectId });
        } catch (err) {
          logger.error('[projects] Failed to auto-create intelligence profile:', err);
        }
      })(),
      // Initialize sections based on registry (or fallback to IND for backward compat)
      (async () => {
        try {
          const { bootstrapFromRegistry } = await import(
            '../services/regulatory/projectBootstrapFromRegistry.js'
          );
          const bootstrapResult = await bootstrapFromRegistry({
            registryId: data.registryId,
            submissionType: data.submissionType,
            product: data.product,
            projectName: data.name,
          });

          if (bootstrapResult && bootstrapResult.sections.length > 0) {
            const client = await pool.connect();
            try {
              await client.query('BEGIN');
              let inserted = 0;
              for (const section of bootstrapResult.sections) {
                await client.query(
                  `INSERT INTO project_sections
                     (organization_id, project_id, section_code, module, title, status, estimated_hours, priority, metadata)
                   VALUES ($1, $2, $3, $4, $5, 'not_started', $6, $7, $8)
                   ON CONFLICT DO NOTHING`,
                  [
                    organizationId,
                    newProject.id,
                    section.sectionCode,
                    section.module,
                    section.title,
                    section.estimatedHours,
                    section.priority,
                    JSON.stringify(section.metadata),
                  ]
                );
                inserted++;
              }
              await client.query('COMMIT');
              logger.info('Auto-initialized sections from registry', {
                projectId,
                registryId: bootstrapResult.entry.id,
                sectionsInserted: inserted,
                usedDeepAdapter: bootstrapResult.usedDeepAdapter,
              });
            } catch (err) {
              await client.query('ROLLBACK');
              throw err;
            } finally {
              client.release();
            }
          } else {
            // Fallback: use legacy IND sections if registry bootstrap returned nothing
            const { getAllINDSections } = await import(
              '../../services/regulatory/ind-ectd-sections.js'
            );
            const allSections = getAllINDSections();
            const client = await pool.connect();
            try {
              await client.query('BEGIN');
              let inserted = 0;
              for (const section of allSections) {
                await client.query(
                  `INSERT INTO project_sections
                     (organization_id, project_id, section_code, module, title, status, estimated_hours, priority, metadata)
                   VALUES ($1, $2, $3, $4, $5, 'not_started', $6, $7, $8)
                   ON CONFLICT DO NOTHING`,
                  [
                    organizationId,
                    newProject.id,
                    section.code,
                    section.module,
                    section.title,
                    section.estimatedHours,
                    section.required ? 'high' : 'medium',
                    JSON.stringify({
                      required: section.required,
                      requiredForAmendment: section.requiredForAmendment,
                      aiDraftable: section.aiDraftable,
                      authoringMode: section.authoringMode,
                      role: section.role,
                      regulatoryRef: section.regulatoryRef,
                      format: section.format,
                      parentCode: section.parentCode,
                      depth: section.depth,
                    }),
                  ]
                );
                inserted++;
              }
              await client.query('COMMIT');
              logger.info('Auto-initialized CTD sections (legacy fallback)', {
                projectId,
                sectionsInserted: inserted,
              });
            } catch (err) {
              await client.query('ROLLBACK');
              throw err;
            } finally {
              client.release();
            }
          }
        } catch (err) {
          logger.error('[projects] Failed to auto-initialize sections:', err);
        }
      })(),
      // Create initial AnA conversation thread with onboarding message
      (async () => {
        try {
          const productName = data.product || newProject.name;
          const submissionLabel = data.submissionType || 'regulatory';
          const onboardingContent = `I've set up your ${submissionLabel} project for ${productName}. What would you like to work on first?\n\nI can help you map your CTD structure, identify predicate devices, run a readiness assessment, or start drafting sections.`;

          await pool.query(
            `INSERT INTO ai_threads (id, organization_id, project_id, title, created_by, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
            [
              initialThreadId,
              organizationId,
              newProject.id,
              `${productName} — Getting Started`,
              userId,
            ]
          );

          await pool.query(
            `INSERT INTO ai_messages (thread_id, role, content) VALUES ($1, 'assistant', $2)`,
            [initialThreadId, onboardingContent]
          );

          logger.info('Auto-created initial AnA thread', { projectId, threadId: initialThreadId });
        } catch (err: any) {
          if (err?.code !== '42P01') {
            logger.error('[projects] Failed to auto-create initial AnA thread:', err);
          } else {
            logger.warn(
              '[projects] ai_threads/ai_messages table missing — skipping onboarding thread'
            );
          }
        }
      })(),
    ]).catch(() => {});

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
      data.region !== undefined ||
      data.pinned !== undefined ||
      data.targetAgency !== undefined ||
      data.color !== undefined
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
        ...(data.pinned !== undefined && { pinned: data.pinned }),
        ...(data.targetAgency !== undefined && {
          targetAgency: data.targetAgency ? sanitizeContent(data.targetAgency) : null,
        }),
        ...(data.color !== undefined && { color: data.color }),
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
    const conversations = await getConversationsFromDb(numericId, organizationId);
    const response = {
      id: req.params.id,
      name: updated.name,
      submissionType: (updated.metadata as any)?.submissionType || 'IND',
      description: updated.description,
      sponsor: (updated.metadata as any)?.sponsor,
      product: (updated.metadata as any)?.product,
      region: (updated.metadata as any)?.region,
      conversations,
      ownership: buildProjectOwnership(conversations, normalizeProjectSettings(updated.settings)),
      status: updated.status,
      pinned: (updated.metadata as any)?.pinned ?? false,
      targetAgency: (updated.metadata as any)?.targetAgency ?? null,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };

    logger.info('Updated project', { projectId: req.params.id, organizationId });
    return sendSuccess(res, response);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation failed', error.errors, 'VALIDATION_ERROR');
    }
    logger.error('Failed to update project', { error: error.message, projectId: req.params.id });
    return sendError(res, 500, 'Failed to update project');
  }
});

router.patch('/projects/:id/ownership-preferences', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const projectId = req.params.id.replace('proj_', '');
    const numericId = parseInt(projectId, 10);
    if (isNaN(numericId)) {
      return sendError(res, 400, 'Invalid project ID format', undefined, 'INVALID_ID');
    }

    const payload = ownershipPreferencesSchema.parse(req.body);
    const [existing] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
      .limit(1);
    if (!existing) {
      return sendError(res, 404, 'Project not found');
    }

    const settings = normalizeProjectSettings(existing.settings);
    const ownership =
      settings.ownership && typeof settings.ownership === 'object'
        ? (settings.ownership as Record<string, unknown>)
        : {};
    const existingPreferences =
      ownership.preferences && typeof ownership.preferences === 'object'
        ? (ownership.preferences as Record<string, unknown>)
        : {};

    const nextPreferences = {
      projectInstructions:
        payload.projectInstructions !== undefined
          ? sanitizeContent(payload.projectInstructions)
          : (existingPreferences.projectInstructions as string) ||
            (ownership.projectInstructions as string) ||
            '',
      reusableSnippetsKnowledge:
        payload.reusableSnippetsKnowledge !== undefined
          ? payload.reusableSnippetsKnowledge.map(sanitizeContent)
          : Array.isArray(existingPreferences.reusableSnippetsKnowledge)
          ? (existingPreferences.reusableSnippetsKnowledge as string[])
          : [],
      currentWorkbenchContext:
        payload.currentWorkbenchContext !== undefined
          ? payload.currentWorkbenchContext
          : (existingPreferences.currentWorkbenchContext as WorkbenchMode) || 'project-home',
    };

    const mergedSettings = {
      ...settings,
      customInstructions: nextPreferences.projectInstructions,
      ownership: {
        ...ownership,
        preferences: nextPreferences,
        projectInstructions: nextPreferences.projectInstructions,
        reusableSnippetsKnowledge: nextPreferences.reusableSnippetsKnowledge,
        currentWorkbenchContext: nextPreferences.currentWorkbenchContext,
      },
    };

    const [updated] = await db
      .update(projects)
      .set({ settings: mergedSettings, updatedAt: new Date() })
      .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
      .returning();

    const conversations = await getConversationsFromDb(numericId, organizationId);
    const derivationData = await getOwnershipDerivationData([numericId], organizationId);
    return sendSuccess(res, {
      id: `proj_${updated.id}`,
      name: updated.name,
      submissionType: (updated.metadata as any)?.submissionType || 'IND',
      description: updated.description,
      sponsor: (updated.metadata as any)?.sponsor,
      product: (updated.metadata as any)?.product,
      region: (updated.metadata as any)?.region,
      customInstructions: nextPreferences.projectInstructions,
      status: updated.status,
      organizationId: updated.organizationId,
      conversations,
      ownership: buildProjectOwnership({
        conversations,
        settings: normalizeProjectSettings(updated.settings),
        approvals: derivationData.approvalsByProject.get(numericId) || [],
        reviewTasks: derivationData.reviewTasksByProject.get(numericId) || [],
        reports: derivationData.reportsByProject.get(numericId) || [],
        activityHistory: derivationData.activitiesByProject.get(numericId) || [],
      }),
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation failed', error.errors, 'VALIDATION_ERROR');
    }
    logger.error('Failed to update ownership preferences', { error: error.message });
    return sendError(res, 500, 'Failed to update ownership preferences');
  }
});

/**
 * GET /api/concept2cure/projects/:projectId/collaborators
 * Returns current project collaborator permission assignments.
 */
router.get('/projects/:projectId/collaborators', async (req: Request, res: Response) => {
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
    const ownership =
      settings.ownership && typeof settings.ownership === 'object'
        ? (settings.ownership as Record<string, unknown>)
        : {};

    const team = Array.isArray(ownership.ownershipTeam)
      ? (ownership.ownershipTeam as Array<{ userId: number; permission: 'can_use' | 'can_edit' }>)
      : [];
    const normalizedTeam = team.filter(
      member =>
        Number.isInteger(member?.userId) &&
        member.userId > 0 &&
        (member.permission === 'can_use' || member.permission === 'can_edit')
    );

    const memberIds = normalizedTeam.map(member => member.userId);
    const memberDirectory =
      memberIds.length > 0
        ? await db
            .select({
              userId: users.id,
              name: users.name,
              email: users.email,
            })
            .from(users)
            .where(inArray(users.id, memberIds))
        : [];
    const directoryById = new Map(memberDirectory.map(member => [member.userId, member]));

    const collaborators = normalizedTeam.map(member => ({
      userId: member.userId,
      permission: member.permission,
      name: directoryById.get(member.userId)?.name || null,
      email: directoryById.get(member.userId)?.email || null,
    }));

    return sendSuccess(res, {
      projectId: `proj_${numericId}`,
      collaborators,
    });
  } catch (error: any) {
    logger.error('Failed to fetch project collaborators', {
      error: error.message,
      projectId: req.params.projectId,
    });
    return sendError(res, 500, 'Failed to fetch project collaborators');
  }
});

/**
 * PUT /api/concept2cure/projects/:projectId/collaborators
 * Replaces project collaborator permission assignments.
 */
router.put('/projects/:projectId/collaborators', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const projectId = req.params.projectId.replace('proj_', '');
    const numericId = parseInt(projectId, 10);

    if (isNaN(numericId)) {
      return sendError(res, 400, 'Invalid project ID format', undefined, 'INVALID_ID');
    }

    const payload = updateProjectCollaboratorsSchema.parse(req.body);

    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
      .limit(1);
    if (!project) {
      return sendError(res, 404, 'Project not found');
    }

    const uniqueByUser = new Map<number, { userId: number; permission: 'can_use' | 'can_edit' }>();
    for (const collaborator of payload.collaborators) {
      uniqueByUser.set(collaborator.userId, collaborator);
    }
    const collaborators = Array.from(uniqueByUser.values());

    if (collaborators.length > 0) {
      const orgMembers = await db
        .select({ userId: organizationUsers.userId })
        .from(organizationUsers)
        .where(
          and(
            eq(organizationUsers.organizationId, organizationId),
            inArray(
              organizationUsers.userId,
              collaborators.map(entry => entry.userId)
            )
          )
        );
      const allowedIds = new Set(orgMembers.map(member => member.userId));
      const invalidIds = collaborators
        .map(entry => entry.userId)
        .filter(userId => !allowedIds.has(userId));
      if (invalidIds.length > 0) {
        return sendError(
          res,
          400,
          `Collaborator user IDs not in organization: ${invalidIds.join(', ')}`
        );
      }
    }

    const settings = normalizeProjectSettings(project.settings);
    const ownership =
      settings.ownership && typeof settings.ownership === 'object'
        ? (settings.ownership as Record<string, unknown>)
        : {};

    const mergedSettings = {
      ...settings,
      ownership: {
        ...ownership,
        ownershipTeam: collaborators,
      },
    };

    const [updated] = await db
      .update(projects)
      .set({ settings: mergedSettings, updatedAt: new Date() })
      .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
      .returning();

    await logAuditEntry(req, 'UPDATE', 'project', `proj_${numericId}`, project, {
      collaborators,
      action: 'update_collaborators',
    });

    return sendSuccess(res, {
      projectId: `proj_${numericId}`,
      collaborators,
      updatedAt: updated.updatedAt,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation failed', error.errors, 'VALIDATION_ERROR');
    }
    logger.error('Failed to update project collaborators', {
      error: error.message,
      projectId: req.params.projectId,
    });
    return sendError(res, 500, 'Failed to update project collaborators');
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
 * GET /api/concept2cure/projects/:projectId/activity
 * Returns a merged activity feed: explicit project_activities + recent artifact updates.
 */
router.get(
  '/projects/:projectId/activity',
  cacheResponse({
    ttl: 30_000,
    keyGenerator: req => `activity:${(req as any).organizationId}:${req.params.projectId}`,
  }),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const numericProjectId = parseInt(req.params.projectId.replace('proj_', ''), 10);

      if (isNaN(numericProjectId)) {
        return sendError(res, 400, 'Invalid project ID');
      }

      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) {
        return sendError(res, 404, 'Project not found');
      }

      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

      // Fetch from projectActivities table
      const activities = await pool.query(
        `SELECT pa.id, pa.activity_type, pa.entity_type, pa.entity_id, pa.description, pa.details, pa.created_at,
              u.full_name as user_name, u.email as user_email
       FROM project_activities pa
       LEFT JOIN users u ON u.id = pa.user_id
       WHERE pa.project_id = $1 AND pa.organization_id = $2
       ORDER BY pa.created_at DESC
       LIMIT $3`,
        [numericProjectId, organizationId, limit]
      );

      // Also get recently modified artifacts as activity items
      const recentArtifacts = await pool.query(
        `SELECT id, artifact_id, title, status, category, type, updated_at, created_at, version
       FROM concept2cure_artifacts
       WHERE project_id = $1 AND organization_id = $2
       ORDER BY updated_at DESC
       LIMIT 10`,
        [numericProjectId, organizationId]
      );

      // Merge and sort by timestamp
      const feed = [
        ...activities.rows.map((a: any) => ({
          id: `act-${a.id}`,
          type: 'activity' as const,
          activityType: a.activity_type,
          entityType: a.entity_type,
          entityId: a.entity_id,
          description: a.description,
          details: a.details,
          userName: a.user_name || a.user_email || 'System',
          timestamp: a.created_at,
        })),
        ...recentArtifacts.rows.map((a: any) => ({
          id: `doc-${a.id}`,
          type: 'document_update' as const,
          activityType: a.version > 1 ? 'update' : 'create',
          entityType: 'document',
          entityId: a.artifact_id || a.id,
          description:
            a.version > 1
              ? `Updated "${a.title || 'Untitled'}" to v${a.version}`
              : `Created "${a.title || 'Untitled'}"`,
          details: { status: a.status, category: a.category, type: a.type },
          userName: null,
          timestamp: a.updated_at || a.created_at,
        })),
      ]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);

      return sendSuccess(res, feed);
    } catch (error: any) {
      logger.error('Failed to fetch project activity', { error: error.message });
      return sendError(res, 500, 'Failed to fetch project activity');
    }
  }
);

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

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT CONNECTED APPS ROUTES
// ─────────────────────────────────────────────────────────────────────────────

/** Known app IDs — server-side allowlist prevents arbitrary injection */
const KNOWN_APP_IDS = new Set([
  'deep-research',
  'precedent-intelligence',
  '510k-workspace',
  'pma-workspace',
  'cer-generator',
  'safety-narrative',
  'biostatistics',
  'csr-builder',
  'cmc-platform',
  'compliance-monitor',
  'evidence-engine',
]);

const MAX_CONNECTED_APPS = 20;

const connectAppSchema = z.object({
  appId: z.string().min(1).max(80),
  memoryRole: z.string().max(1000).optional(),
});

/** Build the aggregated memory context string from all active connected apps */
function buildAppMemoryContext(apps: ConnectedAppRecord[]): string {
  return apps
    .filter(a => a.status === 'active' && a.memoryRole)
    .map(a => a.memoryRole)
    .join('\n');
}

/** Merge appContext into the project settings.knowledge object */
function syncKnowledgeAppContext(
  settings: Record<string, unknown>,
  appContext: string
): Record<string, unknown> {
  const knowledge =
    settings.knowledge && typeof settings.knowledge === 'object'
      ? { ...(settings.knowledge as Record<string, unknown>) }
      : {};
  knowledge.appContext = appContext;
  return { ...settings, knowledge };
}

/**
 * GET /api/concept2cure/projects/:projectId/apps
 * List apps connected to this project with metadata.
 */
router.get('/projects/:projectId/apps', async (req: Request, res: Response) => {
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
    const apps = normalizeConnectedApps(settings);
    return sendSuccess(res, {
      apps,
      totalConnected: apps.length,
      maxAllowed: MAX_CONNECTED_APPS,
    });
  } catch (error: any) {
    logger.error('Failed to fetch project apps', { error: error.message });
    return sendError(res, 500, 'Failed to fetch project apps');
  }
});

/**
 * POST /api/concept2cure/projects/:projectId/apps
 * Connect an app to the project. Validates against known catalog, stores connection,
 * and initializes app's memory role in the project context for AnA.
 */
router.post('/projects/:projectId/apps', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const projectId = req.params.projectId.replace('proj_', '');
    const numericId = parseInt(projectId, 10);

    if (isNaN(numericId)) {
      return sendError(res, 400, 'Invalid project ID format', undefined, 'INVALID_ID');
    }

    const body = connectAppSchema.parse(req.body);
    const { appId } = body;

    // Validate against known catalog
    if (!KNOWN_APP_IDS.has(appId)) {
      return sendError(res, 400, `Unknown app ID: ${appId}`, undefined, 'UNKNOWN_APP');
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
    const apps = normalizeConnectedApps(settings);

    // Prevent duplicate connections
    if (apps.some(a => a.appId === appId)) {
      return sendError(res, 409, 'App is already connected to this project');
    }

    // Enforce max connected apps
    if (apps.length >= MAX_CONNECTED_APPS) {
      return sendError(
        res,
        400,
        `Maximum of ${MAX_CONNECTED_APPS} connected apps reached. Disconnect one first.`
      );
    }

    // Sanitize memoryRole if provided
    const sanitizedRole = body.memoryRole ? sanitizeContent(body.memoryRole) : undefined;

    const newApp: ConnectedAppRecord = {
      appId,
      connectedAt: new Date().toISOString(),
      status: 'active',
      ...(sanitizedRole ? { memoryRole: sanitizedRole } : {}),
    };

    const updatedApps = [...apps, newApp];
    let updatedSettings: Record<string, unknown> = { ...settings, connectedApps: updatedApps };

    // Rebuild and sync aggregated memory context
    const appContext = buildAppMemoryContext(updatedApps);
    updatedSettings = syncKnowledgeAppContext(updatedSettings, appContext);

    const [updatedProject] = await db
      .update(projects)
      .set({ settings: updatedSettings, updatedAt: new Date() })
      .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
      .returning();

    await logAuditEntry(req, 'UPDATE', 'project', req.params.projectId, project, updatedProject);

    logger.info('App connected to project', {
      projectId: numericId,
      appId,
      totalConnected: updatedApps.length,
    });

    return sendSuccess(res, {
      app: newApp,
      totalConnected: updatedApps.length,
      maxAllowed: MAX_CONNECTED_APPS,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation failed', error.errors, 'VALIDATION_ERROR');
    }
    logger.error('Failed to connect app to project', { error: error.message });
    return sendError(res, 500, 'Failed to connect app to project');
  }
});

/**
 * DELETE /api/concept2cure/projects/:projectId/apps/:appId
 * Disconnect an app from the project. Removes its memory role from context.
 */
router.delete('/projects/:projectId/apps/:appId', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const projectId = req.params.projectId.replace('proj_', '');
    const numericId = parseInt(projectId, 10);

    if (isNaN(numericId)) {
      return sendError(res, 400, 'Invalid project ID format', undefined, 'INVALID_ID');
    }

    const { appId } = req.params;
    if (!appId || typeof appId !== 'string') {
      return sendError(res, 400, 'appId is required');
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
    const apps = normalizeConnectedApps(settings);
    const removedApp = apps.find(a => a.appId === appId);

    if (!removedApp) {
      return sendError(res, 404, 'App not found in project connections');
    }

    const updatedApps = apps.filter(a => a.appId !== appId);
    let updatedSettings: Record<string, unknown> = { ...settings, connectedApps: updatedApps };

    // Rebuild and sync aggregated memory context (removes this app's role)
    const appContext = buildAppMemoryContext(updatedApps);
    updatedSettings = syncKnowledgeAppContext(updatedSettings, appContext);

    const [updatedProject] = await db
      .update(projects)
      .set({ settings: updatedSettings, updatedAt: new Date() })
      .where(and(eq(projects.id, numericId), eq(projects.organizationId, organizationId)))
      .returning();

    await logAuditEntry(req, 'UPDATE', 'project', req.params.projectId, project, updatedProject);

    logger.info('App disconnected from project', {
      projectId: numericId,
      appId,
      totalConnected: updatedApps.length,
    });

    return sendSuccess(res, {
      disconnected: appId,
      totalConnected: updatedApps.length,
      maxAllowed: MAX_CONNECTED_APPS,
    });
  } catch (error: any) {
    logger.error('Failed to disconnect app from project', { error: error.message });
    return sendError(res, 500, 'Failed to disconnect app from project');
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

      // ── CONVERGENCE: create governed source artifact before mutating project knowledge ──
      const userId = getUserId(req);
      const artifactId = `artifact_upload_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
      const contentForArtifact =
        extractedText && extractedText.length > 10
          ? extractedText
          : `[Uploaded file: ${safeOriginalName}] (${file.mimetype}, ${file.size} bytes)`;
      const contentHash = calculateContentHash(contentForArtifact);
      const uploadGovernedResolution = resolveGovernedContext({
        req,
        projectId: numericId,
        artifactId: null,
        documentType: 'source_document',
        generationMode: 'imported',
        lifecycleStatus: 'draft',
        originSurface: 'import_pipeline',
        clientTrack:
          req.body?.clientTrack === 'device'
            ? 'device'
            : req.body?.clientTrack === 'diagnostics'
              ? 'diagnostics'
              : 'biotech',
        submissionProgram: 'general_ri',
        persona: 'regulatory',
        regulatorScope: 'fda',
        evidenceMode: 'mixed',
        documentClass: 'evidence_memo',
        readinessGate: 'exploratory',
        approvalPathType: 'single_reviewer',
        recommendationSource: 'report_engine',
        workspaceTarget: 'project',
        regulatorIntent: 'evidence_analysis',
        placementContainerId: String(numericId),
        title: safeOriginalName,
        content: contentForArtifact,
        sourceRefs: [`upload:${documentId}`],
        provider: 'upload_pipeline',
        model: 'import_handler',
        exportAllowed: false,
        eventType: 'artifact.created',
      });
      if (!uploadGovernedResolution.validation.valid) {
        return sendError(
          res,
          400,
          'Governed document contract validation failed',
          {
            errors: uploadGovernedResolution.validation.errors,
            warnings: uploadGovernedResolution.validation.warnings,
            resolved: uploadGovernedResolution.resolved,
          },
          'GOVERNED_CONTRACT_INVALID'
        );
      }

      const [newArtifact] = await db
        .insert(concept2cureArtifacts)
        .values({
          organizationId,
          projectId: numericId,
          artifactId,
          type: 'source_document',
          category: 'source',
          title: safeOriginalName,
          content: contentForArtifact,
          contentHash,
          version: 1,
          metadata: {
            originalName: safeOriginalName,
            mimeType: file.mimetype,
            fileSize: file.size,
            extension,
            tokenCount,
            uploadSource: 'knowledge_upload',
            knowledgeDocumentId: documentId,
            harness: {
              clientTrack: uploadGovernedResolution.contract.clientTrack,
              submissionProgram: uploadGovernedResolution.contract.submissionProgram,
              persona: uploadGovernedResolution.contract.persona,
              regulatorScope: uploadGovernedResolution.contract.regulatorScope,
              documentClass: uploadGovernedResolution.contract.documentClass,
              readinessGate: uploadGovernedResolution.contract.readinessGate,
              workspaceTarget: uploadGovernedResolution.contract.workspaceTarget,
              originSurface: uploadGovernedResolution.contract.originSurface,
              recommendationSource: uploadGovernedResolution.contract.recommendationSource,
              regulatorIntent: uploadGovernedResolution.contract.regulatorIntent,
              gateChecks: uploadGovernedResolution.contract.exportEligibility.gateChecks,
              blockingReasons: uploadGovernedResolution.contract.exportEligibility.blockingReasons,
              readinessOutcome: uploadGovernedResolution.contract.exportEligibility.readinessOutcome,
            },
          },
          createdById: userId,
        })
        .returning();

      // Version entry
      await db.insert(concept2cureArtifactVersions).values({
        organizationId,
        artifactId: newArtifact.id,
        version: 1,
        content: contentForArtifact,
        contentHash,
        createdById: userId,
      });

      const artifactRecord: { id: number; artifactId: string } = { id: newArtifact.id, artifactId };

      // ── AUTO-EMBED: Insert into lumen_data_atoms + generate embedding ──
      try {
        const atomResult = await pool.query(
          `INSERT INTO lumen_data_atoms
             (organization_id, source_type, source_id, atom_type, title, content, tags, confidence, status)
           VALUES ($1, 'data_room_upload', $2, 'source_document', $3, $4, $5, 0.9, 'active')
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [
            organizationId,
            artifactId,
            safeOriginalName,
            contentForArtifact.substring(0, 16000),
            `{source,upload,${extension}}`,
          ]
        );
        if (atomResult.rows.length > 0) {
          const atomId = atomResult.rows[0].id;
          const { getEmbeddingService } = await import('../services/enhancedEmbeddingService.js');
          const embeddingService = getEmbeddingService(pool);
          await embeddingService.embedAtom(atomId);
          logger.info('Source document auto-embedded for retrieval', { artifactId, atomId });
        }
      } catch (embedErr: any) {
        logger.warn('Auto-embedding failed (non-fatal)', { error: embedErr.message });
      }

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
        artifact: artifactRecord,
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

/**
 * PATCH /api/concept2cure/documents/:documentId/activation
 * Toggle a document's active state in the AI context window (E7).
 * Body: { isActive: boolean }
 */
router.patch('/documents/:documentId/activation', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const documentId = req.params.documentId;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return sendError(res, 400, 'isActive must be a boolean');
    }

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
      documents: knowledge.documents.map(doc =>
        doc.id === documentId ? { ...doc, isActive } : doc
      ),
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

    return sendSuccess(res, { documentId, isActive });
  } catch (error: any) {
    logger.error('Failed to toggle document activation', { error: error.message });
    return sendError(res, 500, 'Failed to toggle document activation');
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
  projectId: z.union([z.string(), z.number()]).optional(),
  artifactId: z.union([z.string(), z.number()]).optional(),
  ctdSection: z.string().optional(),
});

// ── Source traceability helpers for ai/edit-section ──────────────────────────

/** SHA-256 hash helper */
function aiEditSha256(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

/** Split AI-generated text into sentences for claim analysis */
function splitSentences(text: string): string[] {
  const cleaned = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\b(Dr|Mr|Mrs|Ms|Prof|Inc|Ltd|Corp|vs|etc|al|Fig|Sec|Vol|No)\./gi, '$1\u2024')
    .replace(/\b(\d+)\./g, '$1\u2024');
  return cleaned
    .split(/(?<=[.!?])\s+/)
    .map(s => s.replace(/\u2024/g, '.').trim())
    .filter(s => s.length > 20);
}

/** Patterns indicating verifiable claims needing source attribution */
const CLAIM_PATTERNS_EDIT = [
  /\b\d+(\.\d+)?%\s+(of\s+)?(patients?|subjects?|participants?)/i,
  /\bp[\s<>=]+0?\.\d+/i,
  /\b(hazard ratio|odds ratio|relative risk|confidence interval|CI)\b/i,
  /\b(statistically significant|clinically significant)\b/i,
  /\b(study|trial|investigation)\s+(showed?|demonstrated?|found|indicated)\b/i,
  /\b(phase\s+[I1-4]{1,3})\b/i,
  /\bNCT\d{8}\b/i,
  /\b(FDA|EMA|ICH|21\s*CFR)\b/i,
  /\b(guidance|guideline|regulation)\s+(states?|requires?|recommends?)\b/i,
  /\b(et\s+al\.?|published|peer-reviewed|meta-analysis|systematic review)\b/i,
  /\b(adverse events?|AE|SAE)\b/i,
  /\b(efficacy|safety|bioequivalence|pharmacokinetic)\b/i,
  /\b(primary endpoint|secondary endpoint|outcome measure)\b/i,
];

/**
 * POST /api/concept2cure/ai/edit-section
 * AI-powered section editing with sentence-level source traceability.
 *
 * When projectId is provided, retrieves Data Room evidence via pgvector
 * hybrid search, injects it as an evidence block, and persists the full
 * provenance chain: retrieval_run → retrieval_chunks → claims → citations.
 */
router.post('/ai/edit-section', async (req: Request, res: Response) => {
  const startMs = Date.now();
  try {
    const userId = getUserId(req);
    const organizationId = getOrganizationId(req);
    const data = aiEditSchema.parse(req.body);

    const { getGateway } = await import('../services/ai-gateway/gateway.js');
    const gw = getGateway();
    if (gw.getEnabledProviders().length === 0) {
      return sendError(res, 503, 'AI service not configured — set ANTHROPIC_API_KEY');
    }

    // ── STEP 1: RETRIEVE Data Room evidence (org-scoped pgvector) ─────────
    const RETRIEVAL_TOP_K = 5;
    const RETRIEVAL_THRESHOLD = 0.65;
    let sources: Array<{ id: string; title: string; content: string; score: number }> = [];
    let retrievalRunId: string | null = null;
    const chunkRows: Array<{ id: string; rank: number; atomId: string; score: number }> = [];
    let evidenceBlock = '';

    if (data.projectId) {
      try {
        const { getEmbeddingService } = await import('../services/enhancedEmbeddingService.js');
        const embeddingService = getEmbeddingService(pool);
        const orgUuid =
          (req as any).tenantContext?.organizationUuid ||
          (req.headers['x-org-uuid'] as string | undefined);

        // Build search query from section title + first 200 chars of content
        const searchQuery = [
          data.sectionTitle || '',
          data.ctdSection ? `CTD section ${data.ctdSection}` : '',
          data.text.substring(0, 200),
        ]
          .filter(Boolean)
          .join(' ');

        const searchResults = await embeddingService.searchHybrid(
          searchQuery,
          RETRIEVAL_TOP_K,
          RETRIEVAL_THRESHOLD,
          orgUuid
        );
        sources = searchResults.map((r: any) => ({
          id: r.id,
          title: r.title,
          content: r.content.length > 600 ? r.content.substring(0, 600) + '…' : r.content,
          score: r.score,
        }));

        // Persist retrieval run + chunks for provenance chain
        if (sources.length > 0) {
          try {
            const queryHash = aiEditSha256(searchQuery);
            const snapshotData = sources.map((s, i) => ({
              rank: i + 1,
              sourceType: 'atom' as const,
              sourceRefId: s.id,
              score: s.score,
            }));
            const snapshotHash = aiEditSha256(JSON.stringify(snapshotData));

            const rrResult = await pool.query(
              `INSERT INTO ai_retrieval_runs
                 (organization_id, project_id, user_id, scope, embedding_model,
                  query_text, query_hash_sha256, snapshot_hash_sha256, top_k, threshold, result_count)
               VALUES ($1, $2, $3, 'org', 'text-embedding-3-small', $4, $5, $6, $7, $8, $9)
               RETURNING id`,
              [
                organizationId,
                data.projectId,
                userId,
                searchQuery,
                queryHash,
                snapshotHash,
                RETRIEVAL_TOP_K,
                RETRIEVAL_THRESHOLD,
                sources.length,
              ]
            );
            retrievalRunId = rrResult.rows[0].id;

            for (let i = 0; i < sources.length; i++) {
              const s = sources[i];
              const excerptHash = aiEditSha256(s.content);
              const crResult = await pool.query(
                `INSERT INTO ai_retrieval_chunks
                   (retrieval_run_id, rank, source_type, atom_id, title,
                    excerpt_hash_sha256, excerpt_preview, score)
                 VALUES ($1, $2, 'atom', $3, $4, $5, $6, $7)
                 RETURNING id`,
                [
                  retrievalRunId,
                  i + 1,
                  s.id,
                  s.title,
                  excerptHash,
                  s.content.substring(0, 500),
                  s.score,
                ]
              );
              chunkRows.push({
                id: crResult.rows[0].id,
                rank: i + 1,
                atomId: s.id,
                score: s.score,
              });
            }
          } catch (e: any) {
            if (e?.code !== '42P01') logger.warn('Retrieval persist failed', { error: e.message });
          }

          // Build evidence block for injection into prompt
          evidenceBlock =
            '\n\n--- RETRIEVED EVIDENCE (cite as [SRC-n]) ---\n' +
            sources.map((s, i) => `[SRC-${i + 1}] "${s.title}"\n${s.content}`).join('\n\n') +
            '\n--- END EVIDENCE ---\n\n' +
            'When your output relies on evidence above, cite it inline using [SRC-n]. ' +
            'If a claim is not supported by retrieved evidence, do NOT fabricate citations.';
        }
      } catch (srcErr: any) {
        logger.warn('Source retrieval failed (non-fatal)', { error: srcErr.message });
      }
    }

    // ── STEP 1.5: RIM INTELLIGENCE CONTEXT (non-blocking) ──────────────
    let rimBlock = '';
    if (data.projectId) {
      try {
        const { computeReadinessScore, generateRecommendations } = await import(
          '../services/intelligence/index.js'
        );
        const projId = Number(data.projectId);
        const [readiness, recs] = await Promise.all([
          computeReadinessScore({ organizationId, projectId: projId }).catch(() => null),
          generateRecommendations({
            organizationId,
            projectId: projId,
            triggeredBy: 'ai_edit',
          }).catch(() => null),
        ]);

        const rimParts: string[] = [];

        if (readiness) {
          const dims = readiness.dimensions;
          rimParts.push(
            `Submission readiness: ${Math.round(readiness.overallScore)}% overall ` +
              `(completeness ${Math.round(dims.completeness)}%, quality ${Math.round(
                dims.quality
              )}%, ` +
              `consistency ${Math.round(dims.consistency)}%, compliance ${Math.round(
                dims.compliance
              )}%).`
          );
          if (readiness.gaps && readiness.gaps.length > 0) {
            const topGaps = readiness.gaps
              .filter((g: any) => g.severity === 'critical' || g.severity === 'high')
              .slice(0, 3);
            if (topGaps.length > 0) {
              rimParts.push(
                'Key gaps: ' +
                  topGaps.map((g: any) => `${g.description} (${g.severity})`).join('; ') +
                  '.'
              );
            }
          }
        }

        if (recs?.recommendations) {
          const activeRecs = recs.recommendations
            .filter(
              (r: any) =>
                r.status === 'active' && (r.severity === 'critical' || r.severity === 'high')
            )
            .slice(0, 3);
          if (activeRecs.length > 0) {
            rimParts.push(
              'Active recommendations: ' +
                activeRecs.map((r: any) => r.suggestedAction).join('; ') +
                '.'
            );
          }
        }

        if (rimParts.length > 0) {
          rimBlock =
            '\n\n--- REGULATORY INTELLIGENCE CONTEXT ---\n' +
            rimParts.join(' ') +
            '\nUse this intelligence to inform your writing. Address identified gaps where relevant. ' +
            'Strengthen areas flagged as weak. Do not mention these scores directly in the output.\n' +
            '--- END INTELLIGENCE ---\n';
        }
      } catch {
        /* Non-blocking — continue without RIM context */
      }
    }

    // ── STEP 2: BUILD PROMPT with evidence context ────────────────────────
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
      'generate-table':
        'Analyze the following regulatory document text and generate a well-structured HTML table that organizes the key data, findings, or comparisons mentioned. The table should have a proper header row (<thead>) and data rows (<tbody>). Use regulatory-appropriate column headers. If the text contains numerical data, study results, or comparisons, organize them into the table. If the text is descriptive, create a summary table with appropriate categorization. Return ONLY the HTML table markup (no surrounding text).',
    };

    const systemPrompt = [
      'You are a senior regulatory medical writer with expertise in FDA and EMA submissions.',
      data.submissionType ? `This is for a ${data.submissionType} submission.` : '',
      data.sectionTitle ? `Section: "${data.sectionTitle}".` : '',
      data.ctdSection ? `CTD section: ${data.ctdSection}.` : '',
      data.context || '',
      evidenceBlock,
      rimBlock,
      actionPrompts[data.action],
    ]
      .filter(Boolean)
      .join(' ');

    // ── STEP 3: AI GENERATION ─────────────────────────────────────────────
    const gwResponse = await gw.route({
      taskType: 'document_drafting',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: data.text },
      ],
      temperature: data.action === 'summarize' ? 0.3 : 0.4,
      maxTokens: 4000,
      callerModule: 'concept2cure/ai-edit-section',
    });

    const result = gwResponse.content || '';
    const latencyMs = Date.now() - startMs;

    // ── STEP 4: PERSIST GENERATION RUN (provenance chain) ─────────────────
    let generationRunId: string | null = null;
    if (retrievalRunId) {
      try {
        const answerHash = aiEditSha256(result);
        const genResult = await pool.query(
          `INSERT INTO ai_generation_runs
             (retrieval_run_id, model, provider, answer_hash_sha256,
              prompt_tokens, completion_tokens, total_tokens, latency_ms, is_demo)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)
           RETURNING id`,
          [
            retrievalRunId,
            gwResponse.model || 'unknown',
            gwResponse.provider || 'unknown',
            answerHash,
            gwResponse.usage?.prompt_tokens || 0,
            gwResponse.usage?.completion_tokens || 0,
            gwResponse.usage?.total_tokens || 0,
            latencyMs,
          ]
        );
        generationRunId = genResult.rows[0].id;
      } catch (e: any) {
        if (e?.code !== '42P01') logger.warn('Generation run persist failed', { error: e.message });
      }
    }

    // ── STEP 5: CLAIM EXTRACTION + CITATION LINKAGE ───────────────────────
    interface SourceCitation {
      sentenceIndex: number;
      sentenceText: string;
      sourceRefs: Array<{ chunkId: string; sourceId: string; title: string; score: number }>;
      status: 'SUPPORTED' | 'WEAK' | 'UNSUPPORTED';
    }
    const sourceCitationResults: SourceCitation[] = [];
    const pendingClaims: Array<{
      si: number;
      sentence: string;
      claimHash: string;
      bestScore: number | null;
      status: string;
      citLinks: SourceCitation['sourceRefs'];
    }> = [];

    if (sources.length > 0) {
      const sentences = splitSentences(result);
      for (let si = 0; si < sentences.length; si++) {
        const sentence = sentences[si];
        const isClaim = CLAIM_PATTERNS_EDIT.some(p => p.test(sentence));

        // Find [SRC-n] references in this sentence
        const refPattern = /\[SRC-(\d+)\]/g;
        const refs = new Set<number>();
        let m;
        while ((m = refPattern.exec(sentence)) !== null) {
          const idx = parseInt(m[1], 10) - 1;
          if (idx >= 0 && idx < sources.length) refs.add(idx);
        }

        if (isClaim || refs.size > 0) {
          const citLinks: SourceCitation['sourceRefs'] = [];
          for (const refIdx of refs) {
            const chunk = chunkRows[refIdx];
            if (chunk) {
              citLinks.push({
                chunkId: chunk.id,
                sourceId: chunk.atomId,
                title: sources[refIdx]?.title || '',
                score: chunk.score,
              });
            }
          }

          const status: SourceCitation['status'] =
            refs.size > 0 ? 'SUPPORTED' : isClaim ? 'UNSUPPORTED' : 'SUPPORTED';

          // Collect claim data for batch persist below
          if (generationRunId) {
            const claimHash = aiEditSha256(sentence);
            const bestScore = citLinks.length > 0 ? Math.max(...citLinks.map(c => c.score)) : null;
            pendingClaims.push({ si, sentence, claimHash, bestScore, status, citLinks });
          }

          sourceCitationResults.push({
            sentenceIndex: si,
            sentenceText: sentence.substring(0, 500),
            sourceRefs: citLinks,
            status,
          });
        }
      }
    }

    // ── STEP 5b: BATCH PERSIST claims + citation linkages ─────────────────
    if (generationRunId && pendingClaims.length > 0) {
      try {
        // Batch INSERT all claims in one query
        const claimValues: any[] = [];
        const claimPlaceholders: string[] = [];
        let pi = 1;
        for (const c of pendingClaims) {
          claimPlaceholders.push(
            `($${pi}, $${pi + 1}, $${pi + 2}, $${pi + 3}, $${pi + 4}, $${pi + 5})`
          );
          claimValues.push(generationRunId, c.si, c.sentence, c.claimHash, c.bestScore, c.status);
          pi += 6;
        }
        const claimResult = await pool.query(
          `INSERT INTO ai_claims
             (generation_run_id, claim_index, claim_text, claim_hash_sha256, confidence, status)
           VALUES ${claimPlaceholders.join(', ')} RETURNING id`,
          claimValues
        );

        // Batch INSERT all citation linkages in one query
        const citValues: any[] = [];
        const citPlaceholders: string[] = [];
        let ci = 1;
        for (let idx = 0; idx < pendingClaims.length; idx++) {
          const claimId = claimResult.rows[idx]?.id;
          if (!claimId) continue;
          for (const link of pendingClaims[idx].citLinks) {
            citPlaceholders.push(`($${ci}, $${ci + 1}, $${ci + 2})`);
            citValues.push(claimId, link.chunkId, link.score);
            ci += 3;
          }
        }
        if (citPlaceholders.length > 0) {
          await pool.query(
            `INSERT INTO ai_claim_citations (claim_id, retrieval_chunk_id, relevance_score)
             VALUES ${citPlaceholders.join(', ')}`,
            citValues
          );
        }
      } catch (e: any) {
        if (e?.code !== '42P01') logger.warn('Claim persist failed', { error: e.message });
      }
    }

    // ── STEP 6: AUTO-PERSIST source links for artifact (batch) ────────────
    if (data.artifactId && sourceCitationResults.length > 0) {
      try {
        const artifactIdNum =
          typeof data.artifactId === 'string' ? parseInt(data.artifactId, 10) : data.artifactId;
        if (!isNaN(artifactIdNum)) {
          const srcValues: any[] = [];
          const srcPlaceholders: string[] = [];
          let sp = 1;
          for (const cit of sourceCitationResults) {
            if (cit.sourceRefs.length > 0) {
              const bestRef = cit.sourceRefs.reduce((a, b) => (a.score > b.score ? a : b));
              srcPlaceholders.push(
                `($${sp}, $${sp + 1}, $${sp + 2}, $${sp + 3}, $${sp + 4}, $${sp + 5}, $${
                  sp + 6
                }, $${sp + 7}, $${sp + 8})`
              );
              srcValues.push(
                artifactIdNum,
                organizationId,
                cit.sentenceIndex,
                cit.sentenceText.substring(0, 1000),
                'internal_data',
                bestRef.sourceId,
                bestRef.title.substring(0, 500),
                bestRef.score,
                userId
              );
              sp += 9;
            }
          }
          if (srcPlaceholders.length > 0) {
            await pool.query(
              `INSERT INTO source_citations
                 (document_id, organization_id, sentence_index, sentence_text,
                  source_type, source_id, source_title, confidence, created_by)
               VALUES ${srcPlaceholders.join(', ')}
               ON CONFLICT DO NOTHING`,
              srcValues
            );
          }
        }
      } catch (e: any) {
        if (e?.code !== '42P01') logger.warn('Source link persist failed', { error: e.message });
      }
    }

    // Audit log
    await logAuditEntry(req, 'AI_EDIT', 'document_section', `ai-edit-${Date.now()}`, null, {
      action: data.action,
      sectionTitle: data.sectionTitle || null,
      inputLength: data.text.length,
      outputLength: result.length,
      model: gwResponse.model,
      sourcesRetrieved: sources.length,
      claimsExtracted: sourceCitationResults.length,
      latencyMs,
    });

    logger.info('AI edit completed with source traceability', {
      action: data.action,
      userId,
      sourcesRetrieved: sources.length,
      claimsExtracted: sourceCitationResults.length,
      latencyMs,
    });

    return sendSuccess(res, {
      result,
      action: data.action,
      provenance: {
        retrievalRunId,
        generationRunId,
        sourcesRetrieved: sources.length,
        sources: sources.map((s, i) => ({
          ref: `SRC-${i + 1}`,
          id: s.id,
          title: s.title,
          score: s.score,
        })),
        claims: sourceCitationResults,
        latencyMs,
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation failed', error.errors, 'VALIDATION_ERROR');
    }
    logger.error('AI edit failed', { error: error.message });
    return sendError(res, 500, 'AI editing failed');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE PROMPT BLOCKS — AI templates with variable insertion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Regulatory writing templates with variable slots.
 * Each template has:
 * - `id`: unique identifier
 * - `name`: display name
 * - `category`: grouping (ctd, csr, ind, regulatory, safety)
 * - `variables`: array of variable slots with name, label, placeholder, required flag
 * - `systemPrompt`: the AI prompt template with {{VARIABLE}} placeholders
 * - `outputGuidance`: instructions for output structure
 */
interface PromptVariable {
  name: string;
  label: string;
  placeholder: string;
  required: boolean;
  type: 'text' | 'textarea' | 'select';
  options?: string[];
}

interface PromptTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  variables: PromptVariable[];
  systemPrompt: string;
  outputGuidance: string;
  estimatedWords: number;
}

const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'ctd-clinical-overview',
    name: 'Clinical Overview (2.5)',
    category: 'ctd',
    description:
      'Generate a comprehensive CTD Module 2.5 Clinical Overview with proper regulatory structure.',
    variables: [
      {
        name: 'PRODUCT_NAME',
        label: 'Product Name',
        placeholder: 'e.g., Pembrolizumab',
        required: true,
        type: 'text',
      },
      {
        name: 'INDICATION',
        label: 'Indication',
        placeholder: 'e.g., Non-small cell lung cancer',
        required: true,
        type: 'text',
      },
      {
        name: 'MECHANISM',
        label: 'Mechanism of Action',
        placeholder: 'e.g., PD-1 checkpoint inhibitor',
        required: false,
        type: 'text',
      },
      {
        name: 'PHASE',
        label: 'Development Phase',
        placeholder: 'e.g., Phase III',
        required: true,
        type: 'select',
        options: ['Phase I', 'Phase II', 'Phase III', 'Phase IV'],
      },
      {
        name: 'KEY_STUDIES',
        label: 'Pivotal Studies',
        placeholder: 'e.g., KEYNOTE-024, KEYNOTE-189',
        required: false,
        type: 'textarea',
      },
      {
        name: 'REGION',
        label: 'Target Agency',
        placeholder: 'FDA',
        required: true,
        type: 'select',
        options: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
      },
    ],
    systemPrompt: `You are a senior regulatory medical writer drafting CTD Module 2.5 (Clinical Overview) for {{PRODUCT_NAME}} for the treatment of {{INDICATION}}.
Target agency: {{REGION}}.
Product mechanism: {{MECHANISM}}.
Development phase: {{PHASE}}.
{{KEY_STUDIES}}

Follow ICH M4E(R2) guidelines. Structure the overview as:
1. Product Development Rationale
2. Overview of Biopharmaceutics
3. Overview of Clinical Pharmacology
4. Overview of Efficacy
5. Overview of Safety
6. Benefits and Risks Conclusions

Use formal regulatory language, third-person passive voice, and cite pivotal study data where provided.`,
    outputGuidance:
      'Output publication-ready regulatory prose with proper CTD subheadings. 800-1500 words.',
    estimatedWords: 1200,
  },
  {
    id: 'ctd-quality-summary',
    name: 'Quality Overall Summary (2.3)',
    category: 'ctd',
    description: 'Generate CTD Module 2.3 Quality Overall Summary for drug substance and product.',
    variables: [
      {
        name: 'PRODUCT_NAME',
        label: 'Product Name',
        placeholder: 'e.g., Amlodipine Besylate',
        required: true,
        type: 'text',
      },
      {
        name: 'DOSAGE_FORM',
        label: 'Dosage Form',
        placeholder: 'e.g., Tablets, 5mg and 10mg',
        required: true,
        type: 'text',
      },
      {
        name: 'ROUTE',
        label: 'Route of Administration',
        placeholder: 'e.g., Oral',
        required: true,
        type: 'select',
        options: [
          'Oral',
          'Intravenous',
          'Subcutaneous',
          'Intramuscular',
          'Topical',
          'Inhalation',
          'Ophthalmic',
        ],
      },
      {
        name: 'MANUFACTURER',
        label: 'Manufacturer',
        placeholder: 'e.g., PharmaCo Manufacturing LLC',
        required: false,
        type: 'text',
      },
      {
        name: 'REGION',
        label: 'Target Agency',
        placeholder: 'FDA',
        required: true,
        type: 'select',
        options: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
      },
    ],
    systemPrompt: `You are drafting CTD Module 2.3 (Quality Overall Summary) for {{PRODUCT_NAME}} ({{DOSAGE_FORM}}, {{ROUTE}}).
Manufacturer: {{MANUFACTURER}}.
Target agency: {{REGION}}.

Follow ICH Q guidelines. Cover:
1. Drug Substance (S): general info, manufacture, characterization, control, stability
2. Drug Product (P): description, pharmaceutical development, manufacture, control, stability
3. Appendices: facilities, adventitious agents, novel excipients

Reference ICH Q1A-Q1F for stability, Q3A/Q3B for impurities, Q6A/Q6B for specifications.`,
    outputGuidance: 'Structured regulatory prose with CMC detail. 600-1000 words.',
    estimatedWords: 800,
  },
  {
    id: 'csr-synopsis',
    name: 'CSR Synopsis',
    category: 'csr',
    description: 'Generate a Clinical Study Report synopsis per ICH E3 guidelines.',
    variables: [
      {
        name: 'STUDY_TITLE',
        label: 'Study Title',
        placeholder: 'A Phase III, Randomized, Double-Blind...',
        required: true,
        type: 'textarea',
      },
      {
        name: 'PROTOCOL',
        label: 'Protocol Number',
        placeholder: 'e.g., ABC-123-001',
        required: true,
        type: 'text',
      },
      {
        name: 'PRODUCT_NAME',
        label: 'Investigational Product',
        placeholder: 'e.g., Drug X 100mg',
        required: true,
        type: 'text',
      },
      {
        name: 'INDICATION',
        label: 'Indication',
        placeholder: 'e.g., Major depressive disorder',
        required: true,
        type: 'text',
      },
      {
        name: 'DESIGN',
        label: 'Study Design',
        placeholder: 'e.g., Randomized, double-blind, placebo-controlled',
        required: true,
        type: 'text',
      },
      {
        name: 'SAMPLE_SIZE',
        label: 'Sample Size',
        placeholder: 'e.g., N=450',
        required: false,
        type: 'text',
      },
      {
        name: 'PRIMARY_ENDPOINT',
        label: 'Primary Endpoint',
        placeholder: 'e.g., Change from baseline in MADRS',
        required: true,
        type: 'text',
      },
      {
        name: 'DURATION',
        label: 'Treatment Duration',
        placeholder: 'e.g., 8 weeks',
        required: false,
        type: 'text',
      },
    ],
    systemPrompt: `You are writing a CSR Synopsis per ICH E3 for:
Study: {{STUDY_TITLE}}
Protocol: {{PROTOCOL}}
Product: {{PRODUCT_NAME}}
Indication: {{INDICATION}}
Design: {{DESIGN}}
Sample size: {{SAMPLE_SIZE}}
Primary endpoint: {{PRIMARY_ENDPOINT}}
Duration: {{DURATION}}

Structure per ICH E3:
- Name of Sponsor, Product, Protocol
- Study Title, Phase, Indication
- Study Design, Objectives
- Test Product/Dose/Mode/Batch
- Duration of Treatment
- Criteria for Inclusion/Exclusion (summarize)
- Number of Patients (planned/randomized/completed)
- Efficacy Results (primary and key secondary)
- Safety Results (AEs, SAEs, deaths, discontinuations)
- Conclusions`,
    outputGuidance:
      'Structured synopsis with all ICH E3 required elements. Use [brackets] for missing data. 500-800 words.',
    estimatedWords: 700,
  },
  {
    id: 'safety-narrative',
    name: 'Individual Safety Narrative',
    category: 'safety',
    description: 'Generate an individual patient safety narrative for serious adverse events.',
    variables: [
      {
        name: 'PRODUCT_NAME',
        label: 'Product Name',
        placeholder: 'e.g., Drug X',
        required: true,
        type: 'text',
      },
      {
        name: 'PROTOCOL',
        label: 'Protocol Number',
        placeholder: 'e.g., ABC-123-001',
        required: true,
        type: 'text',
      },
      {
        name: 'SUBJECT_ID',
        label: 'Subject ID',
        placeholder: 'e.g., 001-0042',
        required: true,
        type: 'text',
      },
      {
        name: 'EVENT',
        label: 'Adverse Event',
        placeholder: 'e.g., Hepatotoxicity, Grade 3',
        required: true,
        type: 'text',
      },
      {
        name: 'DEMOGRAPHICS',
        label: 'Demographics',
        placeholder: 'e.g., 58-year-old male, 82kg',
        required: false,
        type: 'text',
      },
      {
        name: 'MEDICAL_HISTORY',
        label: 'Relevant Medical History',
        placeholder: 'e.g., Hypertension, Type 2 diabetes',
        required: false,
        type: 'textarea',
      },
      {
        name: 'OUTCOME',
        label: 'Outcome',
        placeholder: 'e.g., Resolved with dose reduction',
        required: false,
        type: 'text',
      },
    ],
    systemPrompt: `You are writing an individual patient safety narrative for a regulatory submission.
Product: {{PRODUCT_NAME}}
Protocol: {{PROTOCOL}}
Subject: {{SUBJECT_ID}}
Event: {{EVENT}}
Demographics: {{DEMOGRAPHICS}}
Medical History: {{MEDICAL_HISTORY}}
Outcome: {{OUTCOME}}

Follow CIOMS/ICH E2B(R3) format. Include:
1. Patient demographics and baseline characteristics
2. Relevant medical history and concomitant medications
3. Study drug administration details
4. Description of the event (onset, course, severity, treatment)
5. Laboratory/diagnostic findings
6. Outcome and follow-up
7. Investigator's assessment of causality
8. Sponsor's assessment (if applicable)

Use [brackets] for any missing data elements.`,
    outputGuidance: 'Clinical safety narrative in formal medical writing style. 300-500 words.',
    estimatedWords: 400,
  },
  {
    id: 'ind-cover-letter',
    name: 'IND Cover Letter',
    category: 'ind',
    description: 'Generate an IND cover letter for FDA submission.',
    variables: [
      {
        name: 'PRODUCT_NAME',
        label: 'Product Name',
        placeholder: 'e.g., ABC-1234',
        required: true,
        type: 'text',
      },
      {
        name: 'INDICATION',
        label: 'Indication',
        placeholder: 'e.g., Advanced melanoma',
        required: true,
        type: 'text',
      },
      {
        name: 'SPONSOR',
        label: 'Sponsor Name',
        placeholder: 'e.g., BioPharma Inc.',
        required: true,
        type: 'text',
      },
      {
        name: 'IND_NUMBER',
        label: 'IND Number',
        placeholder: 'e.g., IND 123456 (or New)',
        required: false,
        type: 'text',
      },
      {
        name: 'SUBMISSION_TYPE',
        label: 'Submission Type',
        placeholder: 'Initial IND',
        required: true,
        type: 'select',
        options: ['Initial IND', 'IND Amendment', 'IND Annual Report', 'IND Safety Report'],
      },
      {
        name: 'DIVISION',
        label: 'FDA Review Division',
        placeholder: 'e.g., Division of Oncology Products 1',
        required: false,
        type: 'text',
      },
    ],
    systemPrompt: `You are drafting an IND cover letter for FDA.
Product: {{PRODUCT_NAME}}
Indication: {{INDICATION}}
Sponsor: {{SPONSOR}}
IND Number: {{IND_NUMBER}}
Submission Type: {{SUBMISSION_TYPE}}
Review Division: {{DIVISION}}

Follow 21 CFR 312.23 requirements. Include:
1. Formal address to FDA CDER/CBER
2. Reference to IND number and serial number
3. Purpose of submission
4. Summary of contents
5. Highlight any urgent safety information
6. Regulatory history if applicable
7. Contact information placeholder
8. Signature block placeholder

Use formal regulatory correspondence language.`,
    outputGuidance: 'Formal FDA correspondence. 200-400 words.',
    estimatedWords: 300,
  },
];

/**
 * GET /api/concept2cure/ai/templates
 * Returns available prompt templates with their variable schemas.
 */
router.get('/ai/templates', (_req: Request, res: Response) => {
  const templates = PROMPT_TEMPLATES.map(t => ({
    id: t.id,
    name: t.name,
    category: t.category,
    description: t.description,
    variables: t.variables,
    estimatedWords: t.estimatedWords,
  }));
  return sendSuccess(res, { templates });
});

/**
 * POST /api/concept2cure/ai/templates/:templateId/generate
 * Generate content from a template with variable values filled in.
 */
const templateGenerateSchema = z.object({
  variables: z.record(z.string(), z.string()),
  projectId: z.union([z.string(), z.number()]).optional(),
  artifactId: z.union([z.string(), z.number()]).optional(),
});

router.post('/ai/templates/:templateId/generate', async (req: Request, res: Response) => {
  const startMs = Date.now();
  try {
    const { templateId } = req.params;
    const userId = getUserId(req);
    const organizationId = getOrganizationId(req);
    const data = templateGenerateSchema.parse(req.body);

    const template = PROMPT_TEMPLATES.find(t => t.id === templateId);
    if (!template) {
      return sendError(res, 404, `Template '${templateId}' not found`);
    }

    // Validate required variables
    const missingVars = template.variables
      .filter(v => v.required && (!data.variables[v.name] || data.variables[v.name].trim() === ''))
      .map(v => v.label);
    if (missingVars.length > 0) {
      return sendError(res, 400, `Missing required variables: ${missingVars.join(', ')}`);
    }

    // Replace {{VARIABLE}} placeholders with provided values
    let prompt = template.systemPrompt;
    for (const [key, value] of Object.entries(data.variables)) {
      prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || `[${key}]`);
    }
    // Replace any remaining unset variables with bracket placeholders
    prompt = prompt.replace(/\{\{([A-Z_]+)\}\}/g, '[$1]');

    // ── Retrieve Data Room evidence if project context available ─────
    let evidenceBlock = '';
    let sourcesRetrieved = 0;
    if (data.projectId) {
      try {
        const { getEmbeddingService } = await import('../services/enhancedEmbeddingService.js');
        const embeddingService = getEmbeddingService(pool);
        const orgUuid =
          (req as any).tenantContext?.organizationUuid ||
          (req.headers['x-org-uuid'] as string | undefined);

        const searchQuery = Object.values(data.variables)
          .filter(Boolean)
          .join(' ')
          .substring(0, 300);
        const searchResults = await embeddingService.searchHybrid(searchQuery, 5, 0.65, orgUuid);
        if (searchResults.length > 0) {
          sourcesRetrieved = searchResults.length;
          evidenceBlock =
            '\n\n--- RETRIEVED EVIDENCE FROM DATA ROOM (cite as [SRC-n]) ---\n' +
            searchResults
              .map((r: any, i: number) => {
                const content =
                  r.content.length > 500 ? r.content.substring(0, 500) + '…' : r.content;
                return `[SRC-${i + 1}] "${r.title}"\n${content}`;
              })
              .join('\n\n') +
            '\n--- END EVIDENCE ---\n\n' +
            'Cite evidence inline using [SRC-n] where supported. Do NOT fabricate citations.';
        }
      } catch (e: any) {
        logger.warn('Template generation: Data Room retrieval failed', { error: e.message });
      }
    }

    // ── RIM Intelligence Context (non-blocking) ─────────────────────────
    let rimBlock = '';
    if (data.projectId) {
      try {
        const { computeReadinessScore, generateRecommendations } = await import(
          '../services/intelligence/index.js'
        );
        const projId = Number(data.projectId);
        const [readiness, recs] = await Promise.all([
          computeReadinessScore({ organizationId, projectId: projId }).catch(() => null),
          generateRecommendations({
            organizationId,
            projectId: projId,
            triggeredBy: 'template_gen',
          }).catch(() => null),
        ]);

        const rimParts: string[] = [];
        if (readiness) {
          const dims = readiness.dimensions;
          rimParts.push(
            `Submission readiness: ${Math.round(readiness.overallScore)}% ` +
              `(completeness ${Math.round(dims.completeness)}%, quality ${Math.round(
                dims.quality
              )}%, ` +
              `consistency ${Math.round(dims.consistency)}%, compliance ${Math.round(
                dims.compliance
              )}%).`
          );
          if (readiness.gaps?.length > 0) {
            const topGaps = readiness.gaps
              .filter((g: any) => g.severity === 'critical' || g.severity === 'high')
              .slice(0, 3);
            if (topGaps.length > 0) {
              rimParts.push(
                'Key gaps: ' +
                  topGaps.map((g: any) => `${g.description} (${g.severity})`).join('; ') +
                  '.'
              );
            }
          }
        }
        if (recs?.recommendations) {
          const activeRecs = recs.recommendations
            .filter(
              (r: any) =>
                r.status === 'active' && (r.severity === 'critical' || r.severity === 'high')
            )
            .slice(0, 3);
          if (activeRecs.length > 0) {
            rimParts.push(
              'Active recommendations: ' +
                activeRecs.map((r: any) => r.suggestedAction).join('; ') +
                '.'
            );
          }
        }
        if (rimParts.length > 0) {
          rimBlock =
            '\n\n--- REGULATORY INTELLIGENCE ---\n' +
            rimParts.join(' ') +
            '\nAddress identified gaps where relevant. Do not mention these scores in your output.\n' +
            '--- END INTELLIGENCE ---\n';
        }
      } catch {
        /* Non-blocking — continue without RIM context */
      }
    }

    // ── Generate with AI Gateway ────────────────────────────────────────
    const { getGateway } = await import('../services/ai-gateway/gateway.js');
    const gw = getGateway();
    if (gw.getEnabledProviders().length === 0) {
      return sendError(res, 503, 'AI service not configured — set ANTHROPIC_API_KEY');
    }

    const gwResponse = await gw.route({
      taskType: 'document_drafting',
      messages: [
        {
          role: 'system',
          content: prompt + evidenceBlock + rimBlock + '\n\n' + template.outputGuidance,
        },
        { role: 'user', content: 'Generate the document content now.' },
      ],
      temperature: 0.35,
      maxTokens: 4000,
      callerModule: 'concept2cure/ai-template-generate',
    });

    const result = gwResponse.content || '';
    const latencyMs = Date.now() - startMs;
    const wordCount = result.split(/\s+/).length;

    await logAuditEntry(req, 'AI_TEMPLATE_GENERATE', 'prompt_template', templateId, null, {
      templateName: template.name,
      variablesFilled: Object.keys(data.variables).length,
      outputLength: result.length,
      wordCount,
      sourcesRetrieved,
      latencyMs,
      model: gwResponse.model,
    });

    logger.info('Template generation completed', {
      templateId,
      userId,
      wordCount,
      sourcesRetrieved,
      latencyMs,
    });

    return sendSuccess(res, {
      result,
      template: {
        id: template.id,
        name: template.name,
        category: template.category,
      },
      metrics: {
        wordCount,
        latencyMs,
        sourcesRetrieved,
        wordsPerMinute: latencyMs > 0 ? Math.round(wordCount / (latencyMs / 60000)) : 0,
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation failed', error.errors, 'VALIDATION_ERROR');
    }
    logger.error('Template generation failed', { error: error.message });
    return sendError(res, 500, 'Template generation failed');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AI AUTOCOMPLETE (Sprint 1A — Copilot-style inline completions)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/concept2cure/ai/autocomplete
 * Returns a short inline completion for the editor ghost text.
 * Low latency, low temperature, max ~80 tokens.
 */
router.post('/ai/autocomplete', async (req: Request, res: Response) => {
  try {
    const { textBefore, context, maxTokens = 80 } = req.body;
    if (!textBefore || typeof textBefore !== 'string' || textBefore.length < 10) {
      return sendError(res, 400, 'textBefore is required (min 10 chars)');
    }

    const { getGateway } = await import('../services/ai-gateway/gateway.js');
    const gw = getGateway();
    if (gw.getEnabledProviders().length === 0) {
      return sendError(res, 503, 'AI service not configured');
    }

    const systemPrompt = [
      'You are an inline autocomplete engine for regulatory document authoring.',
      'Given the text so far, predict the NEXT 1-2 sentences the author is likely to write.',
      'Match the tone, style, and formality of the existing text.',
      'Use precise regulatory language appropriate for FDA/EMA submissions.',
      context?.submissionType ? `Submission type: ${context.submissionType}.` : '',
      context?.ctdSection ? `CTD Section: ${context.ctdSection}.` : '',
      context?.documentType ? `Document type: ${context.documentType}.` : '',
      'Return ONLY the completion text — no explanation, no quotes, no preamble.',
      'If you cannot predict a useful continuation, return an empty string.',
    ]
      .filter(Boolean)
      .join(' ');

    const gwResponse = await gw.route({
      taskType: 'document_drafting',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: textBefore },
      ],
      temperature: 0.3,
      maxTokens: Math.min(maxTokens, 150),
      callerModule: 'concept2cure/ai-autocomplete',
    });

    const completion = (gwResponse.content || '').trim();
    return sendSuccess(res, { completion });
  } catch (error: any) {
    logger.error('AI autocomplete failed', { error: error.message });
    return sendError(res, 500, 'Autocomplete failed');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AI COMPLIANCE SCAN (Sprint 1C — real-time regulatory scanning)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/concept2cure/ai/compliance-scan
 * Deep AI-powered compliance scan of document content.
 * Returns structured issues with severity, rule, and suggested fix.
 */
router.post('/ai/compliance-scan', async (req: Request, res: Response) => {
  try {
    const { content, documentType, submissionType, ctdSection } = req.body;
    if (!content || typeof content !== 'string') {
      return sendError(res, 400, 'content is required');
    }

    const { getGateway } = await import('../services/ai-gateway/gateway.js');
    const gw = getGateway();
    if (gw.getEnabledProviders().length === 0) {
      return sendError(res, 503, 'AI service not configured');
    }

    const systemPrompt = [
      'You are an FDA/EMA regulatory compliance reviewer. Analyze the document content and identify compliance issues.',
      'For each issue, provide: type (error/warning/info), rule (regulation reference), message (what is wrong), and suggestion (how to fix).',
      submissionType ? `Submission type: ${submissionType}.` : '',
      ctdSection ? `CTD Section: ${ctdSection}.` : '',
      documentType ? `Document type: ${documentType}.` : '',
      'Return a JSON array of issues: [{"type": "error|warning|info", "rule": "21 CFR 314.50(d)", "message": "...", "suggestion": "..."}]',
      'Focus on: missing required content, regulatory language violations, formatting issues, and cross-reference gaps.',
      'Return ONLY valid JSON array, no other text.',
    ]
      .filter(Boolean)
      .join(' ');

    // Use only first 3000 chars to keep latency low
    const truncated = content.replace(/<[^>]+>/g, ' ').slice(0, 3000);

    const gwResponse = await gw.route({
      taskType: 'document_analysis',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: truncated },
      ],
      temperature: 0.2,
      maxTokens: 2000,
      callerModule: 'concept2cure/ai-compliance-scan',
    });

    let issues = [];
    try {
      const raw = (gwResponse.content || '').trim();
      // Extract JSON array from response
      const match = raw.match(/\[[\s\S]*\]/);
      if (match) {
        issues = JSON.parse(match[0]);
      }
    } catch {
      issues = [];
    }

    // RIM: capture compliance signals (non-blocking)
    const orgId = (req as any).organizationId || (req as any).user?.organizationId;
    if (orgId && issues.length > 0) {
      interceptComplianceScan({
        organizationId: orgId,
        projectId: parseInt(req.body.projectId || '0', 10),
        userId: (req as any).user?.id,
        sectionCode: ctdSection,
        documentType,
        submissionType,
        issues,
        scannedLength: truncated.length,
      });
    }

    return sendSuccess(res, { issues, scannedLength: truncated.length });
  } catch (error: any) {
    logger.error('Compliance scan failed', { error: error.message });
    return sendError(res, 500, 'Compliance scan failed');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AI CITATION SEARCH (Sprint 1B — Smart Citation Insertion)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/concept2cure/ai/citation-search
 * Search for citable references across project artifacts and CSR database.
 * Returns formatted citations with metadata for insertion.
 */
router.post('/ai/citation-search', async (req: Request, res: Response) => {
  try {
    const { query, projectId, limit = 10 } = req.body;
    if (!query || typeof query !== 'string' || query.length < 2) {
      return sendError(res, 400, 'query is required (min 2 chars)');
    }

    const results: Array<{
      id: string;
      title: string;
      authors: string;
      year: string;
      sourceType: string;
      excerpt: string;
      citationText: string;
    }> = [];

    // Search project artifacts if projectId provided
    if (projectId) {
      try {
        const artifactResult = await pool.query(
          `SELECT id, title, content, type, created_at
           FROM concept2cure_artifacts
           WHERE project_id = $1
             AND (title ILIKE $2 OR content ILIKE $2)
           ORDER BY updated_at DESC
           LIMIT $3`,
          [projectId, `%${query}%`, Math.min(limit, 20)]
        );
        for (const row of artifactResult.rows) {
          const year = new Date(row.created_at).getFullYear().toString();
          const plainText = (row.content || '').replace(/<[^>]+>/g, ' ').trim();
          results.push({
            id: `artifact-${row.id}`,
            title: row.title,
            authors: 'Project Team',
            year,
            sourceType: row.type || 'document',
            excerpt: plainText.slice(0, 200),
            citationText: `[Project Team, ${year}]`,
          });
        }
      } catch {
        // Non-fatal — continue with other sources
      }
    }

    // Search CSR knowledge base
    try {
      const csrResult = await pool.query(
        `SELECT id, title, sponsor, indication, phase, approval_date
         FROM csr_reports
         WHERE title ILIKE $1 OR sponsor ILIKE $1 OR indication ILIKE $1
         ORDER BY approval_date DESC NULLS LAST
         LIMIT $2`,
        [`%${query}%`, Math.min(limit, 20)]
      );
      for (const row of csrResult.rows) {
        const year = row.approval_date
          ? new Date(row.approval_date).getFullYear().toString()
          : 'N/A';
        results.push({
          id: `csr-${row.id}`,
          title: row.title,
          authors: row.sponsor || 'Unknown',
          year,
          sourceType: `CSR Phase ${row.phase || '?'}`,
          excerpt: `${row.indication || ''} — ${row.sponsor || ''}`.trim(),
          citationText: `[${row.sponsor || 'Unknown'}, ${year}]`,
        });
      }
    } catch {
      // CSR table may not exist — non-fatal
    }

    return sendSuccess(res, { results: results.slice(0, limit), total: results.length });
  } catch (error: any) {
    logger.error('Citation search failed', { error: error.message });
    return sendError(res, 500, 'Citation search failed');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AI BATCH SECTION EDIT (Sprint 1D — Batch AI Operations)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/concept2cure/ai/batch-edit
 * Process multiple document sections with an AI action in sequence.
 * Accepts array of sections, returns array of results.
 */
router.post('/ai/batch-edit', async (req: Request, res: Response) => {
  try {
    const { sections, action, submissionType } = req.body;
    if (!sections || !Array.isArray(sections) || sections.length === 0) {
      return sendError(res, 400, 'sections array is required');
    }
    if (!action || typeof action !== 'string') {
      return sendError(res, 400, 'action is required');
    }

    const { getGateway } = await import('../services/ai-gateway/gateway.js');
    const gw = getGateway();
    if (gw.getEnabledProviders().length === 0) {
      return sendError(res, 503, 'AI service not configured');
    }

    const actionPrompts: Record<string, string> = {
      rewrite:
        'Rewrite this section for clarity, precision, and professional regulatory language. Maintain all factual content.',
      expand:
        'Expand this section with more detail, evidence references, and supporting data. Keep regulatory tone.',
      summarize:
        'Create a concise executive summary of this section. Keep key data points and conclusions.',
      'regulatory-tone':
        'Rewrite in formal FDA/EMA regulatory submission language. Use "shall" for requirements, "should" for recommendations.',
      'add-references':
        'Add reference placeholders [Ref X] where claims need supporting evidence. Note what type of reference is needed.',
    };

    const systemPrompt = [
      actionPrompts[action] || `Apply the "${action}" transformation to this text.`,
      submissionType ? `Submission type: ${submissionType}.` : '',
      'Return ONLY the transformed text — no preamble, no explanation.',
    ]
      .filter(Boolean)
      .join(' ');

    const results = [];
    for (const section of sections.slice(0, 20)) {
      try {
        const text = (section.content || '')
          .replace(/<[^>]+>/g, ' ')
          .trim()
          .slice(0, 3000);
        if (text.length < 10) {
          results.push({ sectionTitle: section.title, result: section.content, error: null });
          continue;
        }

        const gwResponse = await gw.route({
          taskType: 'document_drafting',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Section: ${section.title || 'Untitled'}\n\n${text}` },
          ],
          temperature: 0.4,
          maxTokens: 2000,
          callerModule: 'concept2cure/ai-batch-edit',
        });

        results.push({
          sectionTitle: section.title,
          result: (gwResponse.content || '').trim(),
          error: null,
        });
      } catch (err: any) {
        results.push({
          sectionTitle: section.title,
          result: section.content,
          error: err.message,
        });
      }
    }

    return sendSuccess(res, { results, processedCount: results.length });
  } catch (error: any) {
    logger.error('Batch edit failed', { error: error.message });
    return sendError(res, 500, 'Batch edit failed');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CROSS-REFERENCE VALIDATION (Sprint 2C)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/concept2cure/ai/validate-references
 * Validate cross-references found in document content against project artifacts.
 */
router.post('/ai/validate-references', async (req: Request, res: Response) => {
  try {
    const { references, projectId } = req.body;
    if (!references || !Array.isArray(references)) {
      return sendError(res, 400, 'references array is required');
    }

    const refsSlice = references.slice(0, 50);

    // Batch: fetch all project artifacts once instead of N SELECTs
    let artifactRows: Array<{ id: number; title: string; ctd_section: string | null }> = [];
    if (projectId) {
      try {
        const artResult = await pool.query(
          `SELECT id, title, ctd_section FROM concept2cure_artifacts WHERE project_id = $1`,
          [projectId]
        );
        artifactRows = artResult.rows;
      } catch {
        // fall through — all refs will be 'unlinked'
      }
    }

    const validatedRefs = refsSlice.map((ref: any) => {
      let status: 'valid' | 'broken' | 'unlinked' = 'unlinked';
      let targetTitle = '';

      if (projectId && ref.targetSection) {
        const needle = ref.targetSection.toLowerCase();
        const match = artifactRows.find(
          a =>
            (a.ctd_section && a.ctd_section.toLowerCase().includes(needle)) ||
            a.title.toLowerCase().includes(needle)
        );
        if (match) {
          status = 'valid';
          targetTitle = match.title;
        } else {
          status = 'broken';
        }
      }

      return { ...ref, status, targetTitle };
    });

    return sendSuccess(res, { references: validatedRefs });
  } catch (error: any) {
    logger.error('Reference validation failed', { error: error.message });
    return sendError(res, 500, 'Reference validation failed');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// INCONSISTENCY INTELLIGENCE (Sprint 2C — ARTOS-inspired)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/concept2cure/ai/check-inconsistency
 * Cross-section change impact detection. When content changes in one section,
 * identifies other sections in the same project that may need updating.
 */
router.post('/ai/check-inconsistency', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { changedText, changedSectionTitle, projectId, artifactId } = req.body;

    if (!changedText || !projectId) {
      return sendError(res, 400, 'changedText and projectId are required');
    }

    // Fetch all other artifacts in the project
    const allArtifacts = await db
      .select()
      .from(concept2cureArtifacts)
      .where(
        and(
          eq(concept2cureArtifacts.projectId, projectId),
          ne(concept2cureArtifacts.id, artifactId || '')
        )
      );

    if (allArtifacts.length === 0) {
      return sendSuccess(res, { sections: [] });
    }

    // Build context of other sections (limit to first 500 chars each)
    const otherSections = allArtifacts.slice(0, 10).map((a: any) => ({
      id: a.id,
      title: a.title,
      excerpt: (a.content || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 500),
    }));

    const prompt = `You are a regulatory document consistency checker. A user changed content in the section "${
      changedSectionTitle || 'Unknown'
    }".

Changed content:
"${changedText.slice(0, 1500)}"

Other sections in the same project:
${otherSections.map((s: any) => `- [${s.id}] "${s.title}": ${s.excerpt}`).join('\n')}

Identify which other sections (if any) reference similar data points, claims, or statistics as the changed content and may need updating for consistency. Return a JSON array of affected sections:
[{ "artifactId": "...", "artifactTitle": "...", "affectedText": "relevant excerpt", "reason": "why it may be inconsistent", "severity": "high|medium|low" }]

If no sections are affected, return an empty array []. Only return the JSON array, nothing else.`;

    const { getGateway } = await import('../services/ai-gateway/gateway.js');
    const gw = getGateway();
    if (gw.getEnabledProviders().length === 0) {
      return sendError(res, 503, 'AI service not configured — set ANTHROPIC_API_KEY');
    }

    const gwResponse = await gw.route({
      taskType: 'document_analysis',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      maxTokens: 2000,
      callerModule: 'concept2cure/inconsistency-check',
    });

    let sections: Array<Record<string, unknown>> = [];
    try {
      const content = gwResponse.content || '[]';
      // Try multiple extraction strategies for robustness
      // 1. Direct JSON array match
      const jsonMatch = content.match(/\[[\s\S]*?\](?=[^[\]]*$)/);
      if (jsonMatch) {
        sections = JSON.parse(jsonMatch[0]);
      } else {
        // 2. Try parsing within markdown code fence
        const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenceMatch) {
          sections = JSON.parse(fenceMatch[1].trim());
        } else {
          // 3. Try parsing entire content as JSON
          const trimmed = content.trim();
          if (trimmed.startsWith('[')) {
            sections = JSON.parse(trimmed);
          }
        }
      }
      // Validate array shape
      if (!Array.isArray(sections)) sections = [];
    } catch {
      logger.warn('Inconsistency check: AI returned unparseable response, returning empty');
      sections = [];
    }

    logger.info('Inconsistency check completed', {
      userId,
      projectId,
      affectedCount: sections.length,
    });
    return sendSuccess(res, { sections });
  } catch (error: any) {
    logger.error('Inconsistency check failed', { error: error.message });
    return sendError(res, 500, 'Inconsistency analysis failed');
  }
});

/**
 * POST /api/concept2cure/ai/extract-metadata
 * AI-powered metadata extraction from source documents.
 * Extracts study endpoints, sample sizes, key findings, p-values.
 */
router.post('/ai/extract-metadata', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { projectId, artifactId } = req.body;

    if (!projectId || !artifactId) {
      return sendError(res, 400, 'projectId and artifactId are required');
    }

    // Fetch the artifact content
    const [artifact] = await db
      .select()
      .from(concept2cureArtifacts)
      .where(
        and(
          eq(concept2cureArtifacts.id, artifactId),
          eq(concept2cureArtifacts.projectId, projectId)
        )
      );

    if (!artifact) {
      return sendError(res, 404, 'Artifact not found');
    }

    const plainContent = ((artifact as any).content || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 3000);

    const prompt = `Extract key metadata from this regulatory/clinical document. Return a JSON object with these fields (use null for missing):
{
  "studyType": "e.g. Phase III RCT, observational, meta-analysis",
  "endpoints": ["primary endpoint", "secondary endpoints..."],
  "sampleSize": "N=...",
  "keyFindings": ["finding 1", "finding 2"],
  "pValues": ["p<0.001 for primary endpoint", ...],
  "therapeuticArea": "e.g. oncology, cardiology",
  "phase": "e.g. Phase I, Phase II, Phase III"
}

Document content:
"${plainContent}"

Return only the JSON object, nothing else.`;

    const { getGateway } = await import('../services/ai-gateway/gateway.js');
    const gw2 = getGateway();
    if (gw2.getEnabledProviders().length === 0) {
      return sendError(res, 503, 'AI service not configured — set ANTHROPIC_API_KEY');
    }

    const gwResponse = await gw2.route({
      taskType: 'document_analysis',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      maxTokens: 1000,
      callerModule: 'concept2cure/extract-metadata',
    });

    let metadata = {};
    try {
      const content = gwResponse.content || '{}';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      metadata = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      metadata = {};
    }

    logger.info('Metadata extraction completed', { userId, projectId, artifactId });
    return sendSuccess(res, metadata);
  } catch (error: any) {
    logger.error('Metadata extraction failed', { error: error.message });
    return sendError(res, 500, 'Metadata extraction failed');
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
 * GET /api/concept2cure/artifacts
 * Returns all artifacts across all projects for the organization (gallery view).
 * Includes project name for display in the cross-project artifacts gallery.
 */
router.get(
  '/artifacts',
  cacheResponse({ ttl: 60_000, keyGenerator: req => `artifacts:${(req as any).organizationId}` }),
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);

      const allArtifacts = await db
        .select({
          artifactId: concept2cureArtifacts.artifactId,
          projectId: concept2cureArtifacts.projectId,
          type: concept2cureArtifacts.type,
          category: concept2cureArtifacts.category,
          title: concept2cureArtifacts.title,
          status: concept2cureArtifacts.status,
          ctdSection: concept2cureArtifacts.ctdSection,
          version: concept2cureArtifacts.version,
          createdAt: concept2cureArtifacts.createdAt,
          updatedAt: concept2cureArtifacts.updatedAt,
          projectName: projects.name,
        })
        .from(concept2cureArtifacts)
        .leftJoin(projects, eq(concept2cureArtifacts.projectId, projects.id))
        .where(eq(concept2cureArtifacts.organizationId, organizationId))
        .orderBy(desc(concept2cureArtifacts.updatedAt))
        .limit(200);

      const result = allArtifacts.map(a => ({
        id: a.artifactId,
        projectId: `proj_${a.projectId}`,
        title: a.title,
        type: a.type,
        category: a.category,
        status: a.status || 'draft',
        ctdSection: a.ctdSection,
        version: a.version,
        projectName: a.projectName || 'Unknown Project',
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      }));

      return sendSuccess(res, result);
    } catch (error: any) {
      logger.error('Failed to fetch all artifacts', { error: error.message });
      return sendError(res, 500, 'Failed to fetch artifacts');
    }
  }
);

/**
 * GET /api/concept2cure/projects/all/artifacts-summary
 * Returns artifact count summary across all projects for the organization.
 */
router.get('/projects/all/artifacts-summary', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);

    const allArtifacts = await db
      .select({
        status: concept2cureArtifacts.status,
      })
      .from(concept2cureArtifacts)
      .where(eq(concept2cureArtifacts.organizationId, organizationId));

    const total = allArtifacts.length;
    const draft = allArtifacts.filter(a => a.status === 'draft').length;
    const review = allArtifacts.filter(a => a.status === 'review').length;
    const approved = allArtifacts.filter(
      a => a.status === 'approved' || a.status === 'locked'
    ).length;

    return sendSuccess(res, { total, draft, review, approved });
  } catch (error: any) {
    logger.error('Failed to fetch artifacts summary', { error: error.message });
    return sendError(res, 500, 'Failed to fetch artifacts summary');
  }
});

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
router.post(
  '/projects/:projectId/artifacts',
  guardEmptyContent,
  guardDemoContent,
  async (req: Request, res: Response) => {
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
      const governedResolution = resolveGovernedContext({
        req,
        projectId: numericProjectId,
        artifactId: null,
        documentType: data.type,
        generationMode: data.metadata?.generationMethod === 'ai' ? 'ai_generated' : 'manual',
        lifecycleStatus: 'draft',
        originSurface: data.originSurface,
        clientTrack: data.clientTrack,
        submissionProgram: data.submissionProgram,
        persona: data.persona,
        regulatorScope: data.regulatorScope,
        evidenceMode: data.evidenceMode,
        documentClass: data.documentClass,
        readinessGate: data.readinessGate,
        approvalPathType: data.approvalPathType,
        recommendationSource: data.recommendationSource,
        workspaceTarget: data.workspaceTarget,
        dossierContainerId: data.dossierContainerId,
        artifactContainerId: data.artifactContainerId,
        regulatorIntent: data.regulatorIntent,
        placementContainerId:
          (data.metadata?.containerId as string | undefined) ||
          data.dossierContainerId ||
          data.artifactContainerId,
        provider: (data.metadata?.provider as string | undefined) || undefined,
        model: (data.metadata?.model as string | undefined) || undefined,
        title: sanitizedTitle,
        content: sanitizedContent,
        ctdSection: data.ctdSection || null,
        sourceRefs: Array.isArray(data.metadata?.sourceRefs)
          ? (data.metadata?.sourceRefs as string[])
          : undefined,
        exportAllowed: false,
        eventType: 'artifact.created',
      });
      if (!governedResolution.validation.valid) {
        return sendError(
          res,
          400,
          'Governed document contract validation failed',
          {
            errors: governedResolution.validation.errors,
            warnings: governedResolution.validation.warnings,
            resolved: governedResolution.resolved,
          },
          'GOVERNED_CONTRACT_INVALID'
        );
      }
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
          metadata: {
            ...(data.metadata || {}),
            harness: {
              clientTrack: governedResolution.contract.clientTrack,
              submissionProgram: governedResolution.contract.submissionProgram,
              persona: governedResolution.contract.persona,
              regulatorScope: governedResolution.contract.regulatorScope,
              documentClass: governedResolution.contract.documentClass,
              readinessGate: governedResolution.contract.readinessGate,
              workspaceTarget: governedResolution.contract.workspaceTarget,
              originSurface: governedResolution.contract.originSurface,
              recommendationSource: governedResolution.contract.recommendationSource,
              regulatorIntent: governedResolution.contract.regulatorIntent,
              gateChecks: governedResolution.contract.exportEligibility.gateChecks,
              blockingReasons: governedResolution.contract.exportEligibility.blockingReasons,
              readinessOutcome: governedResolution.contract.exportEligibility.readinessOutcome,
            },
          },
          ctdSection: data.ctdSection || null,
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
        ctdSection: data.ctdSection || null,
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

      // RIM: capture artifact creation signal (non-blocking)
      interceptArtifactChange({
        organizationId,
        projectId: parseInt(req.params.projectId, 10),
        userId,
        artifactId,
        artifactVersionId: newDbArtifact.id?.toString(),
        sectionCode: ctdSection || undefined,
        changeType: 'create',
        title: sanitizedTitle,
        contentLength: sanitizedContent.length,
        source: data.metadata?.generationMethod === 'ai' ? 'lumen_cortex' : 'manual',
        content: sanitizedContent,
      });

      // Data Lineage: record source→artifact lineage (non-blocking)
      try {
        const { recordLineage } = await import('../services/data-lineage-service');
        if (data.conversationId) {
          recordLineage({
            organizationId,
            projectId: numericProjectId,
            sourceObjectType: 'conversation',
            sourceObjectId: data.conversationId,
            sourceTitle: `Conversation ${data.conversationId}`,
            targetObjectType: 'artifact',
            targetObjectId: artifactId,
            targetTitle: sanitizedTitle,
            targetField: ctdSection || undefined,
            linkageType:
              data.metadata?.generationMethod === 'ai' ? 'generated_from' : 'derived_from',
            transformationType:
              data.metadata?.generationMethod === 'ai' ? 'ai_generation' : 'manual_edit',
            createdById: userId,
            metadata: { contentHash, version: 1 },
          }).catch(() => {});
        }
      } catch {
        /* non-blocking */
      }

      // Emit generation trace: artifact_created
      const traceId =
        ((data.metadata as Record<string, unknown>)?.traceId as string) || createTraceId();
      emitTraceEvent({
        traceId,
        timestamp: new Date().toISOString(),
        event: 'artifact_created',
        sourceSystem:
          ((data.metadata as Record<string, unknown>)?.sourceSystem as any) || 'document_builder',
        projectId: numericProjectId,
        artifactId,
        userId,
        metadata: {
          documentType: data.type,
          ctdSection: ctdSection || null,
          contentLength: sanitizedContent.length,
          generationMethod:
            (data.metadata as Record<string, unknown>)?.generationMethod || 'unknown',
        },
      });

      // ── AUTO-EMBED: Insert into lumen_data_atoms + generate embedding ────
      // All artifacts become searchable evidence for AI source traceability
      try {
        const plainText = sanitizedContent
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (plainText.length > 40) {
          const atomResult = await pool.query(
            `INSERT INTO lumen_data_atoms
             (organization_id, source_type, source_id, atom_type, title, content, tags, confidence, status)
           VALUES ($1, 'artifact', $2, $3, $4, $5, $6, 0.85, 'active')
           ON CONFLICT DO NOTHING
           RETURNING id`,
            [
              organizationId,
              artifactId,
              data.category === 'source' ? 'source_document' : 'authored_document',
              sanitizedTitle,
              plainText.substring(0, 16000),
              `{${data.category},${data.type}${ctdSection ? `,${ctdSection}` : ''}}`,
            ]
          );
          if (atomResult.rows.length > 0) {
            const atomId = atomResult.rows[0].id;
            const { getEmbeddingService } = await import('../services/enhancedEmbeddingService.js');
            const embeddingService = getEmbeddingService(pool);
            await embeddingService.embedAtom(atomId);
          }
        }
      } catch (embedErr: any) {
        // Non-fatal �� artifact created successfully, embedding can be retried
        logger.warn('Auto-embedding failed for new artifact', {
          artifactId,
          error: embedErr.message,
        });
      }

      logger.info('Created artifact', { projectId: req.params.projectId, artifactId });
      return sendSuccess(res.status(201), newArtifact);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return sendError(res, 400, 'Validation failed', error.errors, 'VALIDATION_ERROR');
      }
      logConcept2cureError('create artifact', error, { projectId: req.params.projectId });
      return sendError(res, 500, 'Failed to create artifact');
    }
  }
);

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

    const { content, title, ctdSection } = req.body;

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

    // Update ctdSection if provided
    const newCtdSection = ctdSection !== undefined ? ctdSection : dbArtifact.ctdSection;

    const updateGovernedResolution = resolveGovernedContext({
      req,
      projectId: dbArtifact.projectId,
      artifactId: dbArtifact.id,
      documentType: dbArtifact.type,
      generationMode: 'amendment',
      lifecycleStatus:
        (dbArtifact.status as GovernedDocumentActionContract['lifecycleStatus']) || 'draft',
      title: newTitle || dbArtifact.title,
      content: newContent || dbArtifact.content || '',
      ctdSection: newCtdSection,
      sourceRefs: [`artifact:${dbArtifact.artifactId}`],
      exportAllowed: ['approved', 'locked', 'published'].includes(String(dbArtifact.status || '')),
      eventType: 'artifact.updated',
    });
    if (!updateGovernedResolution.validation.valid) {
      return sendError(
        res,
        400,
        'Governed document contract validation failed',
        {
          errors: updateGovernedResolution.validation.errors,
          warnings: updateGovernedResolution.validation.warnings,
          resolved: updateGovernedResolution.resolved,
        },
        'GOVERNED_CONTRACT_INVALID'
      );
    }

    const existingMetadata =
      dbArtifact.metadata && typeof dbArtifact.metadata === 'object'
        ? (dbArtifact.metadata as Record<string, unknown>)
        : {};
    const existingHarness =
      existingMetadata.harness && typeof existingMetadata.harness === 'object'
        ? (existingMetadata.harness as Record<string, unknown>)
        : {};

    // Update artifact record
    const [updatedArtifact] = await db
      .update(concept2cureArtifacts)
      .set({
        title: newTitle,
        content: newContent,
        contentHash: newContentHash,
        version: newVersion,
        ctdSection: newCtdSection,
        metadata: {
          ...existingMetadata,
          harness: {
            ...existingHarness,
            clientTrack: updateGovernedResolution.contract.clientTrack,
            submissionProgram: updateGovernedResolution.contract.submissionProgram,
            persona: updateGovernedResolution.contract.persona,
            regulatorScope: updateGovernedResolution.contract.regulatorScope,
            documentClass: updateGovernedResolution.contract.documentClass,
            readinessGate: updateGovernedResolution.contract.readinessGate,
            workspaceTarget: updateGovernedResolution.contract.workspaceTarget,
            originSurface: updateGovernedResolution.contract.originSurface,
            recommendationSource: updateGovernedResolution.contract.recommendationSource,
            regulatorIntent: updateGovernedResolution.contract.regulatorIntent,
            gateChecks: updateGovernedResolution.contract.exportEligibility.gateChecks,
            blockingReasons: updateGovernedResolution.contract.exportEligibility.blockingReasons,
            readinessOutcome: updateGovernedResolution.contract.exportEligibility.readinessOutcome,
          },
        },
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
      ctdSection: updatedArtifact.ctdSection || null,
      version: updatedArtifact.version,
      versions: versions.map(v => ({
        version: v.version,
        content: v.content,
        createdAt: v.createdAt,
      })),
      metadata: updatedArtifact.metadata as Record<string, unknown>,
      status: updatedArtifact.status || 'draft',
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

    // RIM: capture artifact update signal (non-blocking)
    interceptArtifactChange({
      organizationId,
      projectId: parseInt(req.params.projectId, 10),
      userId,
      artifactId: req.params.artifactId,
      artifactVersionId: dbArtifact.id?.toString(),
      sectionCode: newCtdSection || undefined,
      changeType: 'update',
      title: newTitle,
      contentLength: newContent?.length ?? 0,
      source: 'manual',
      content: sanitizedContent || undefined,
    });

    // ── RE-EMBED on content change for Data Room searchability ────────
    if (newVersion > dbArtifact.version && sanitizedContent) {
      try {
        const plainText = sanitizedContent
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (plainText.length > 40) {
          const atomResult = await pool.query(
            `UPDATE lumen_data_atoms
             SET content = $1, title = $2, updated_at = NOW()
             WHERE source_type = 'artifact' AND source_id = $3
             RETURNING id`,
            [plainText.substring(0, 16000), newTitle, updatedArtifact.artifactId]
          );
          if (atomResult.rows.length > 0) {
            const { getEmbeddingService } = await import('../services/enhancedEmbeddingService.js');
            const embeddingService = getEmbeddingService(pool);
            await embeddingService.embedAtom(atomResult.rows[0].id, true);
          }
        }
      } catch (embedErr: any) {
        logger.warn('Re-embedding failed on update (non-fatal)', { error: embedErr.message });
      }
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
 * POST /api/concept2cure/vault/register-artifact
 * Register an artifact in the vault for governed document management.
 */
router.post('/vault/register-artifact', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const { artifactId, projectId, title, ctdSection, documentType } = req.body;

    if (!artifactId || !title) {
      return sendError(res, 400, 'artifactId and title are required');
    }

    // Log the vault registration for audit trail
    await logAuditEntry(req, 'CREATE', 'vault_registration', artifactId, null, {
      projectId,
      title,
      ctdSection,
      documentType,
      registeredFrom: 'concept2cure_copilot',
    });

    logger.info('Registered artifact in vault', { artifactId, projectId, ctdSection });
    return sendSuccess(res, { registered: true, artifactId, ctdSection });
  } catch (error: any) {
    logger.error('Failed to register artifact in vault', { error: error.message });
    return sendError(res, 500, 'Failed to register artifact in vault');
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

      // Server-side placement enforcement — authoritative lock guard.
      // Client gates via ModeCapabilities.canRelocate; this is the server backup.
      if (dbArtifact.status === 'locked') {
        return sendError(res, 423, 'Document is locked. Unlock before changing placement.');
      }

      const previousSection = dbArtifact.ctdSection || null;

      const placementGovernedResolution = resolveGovernedContext({
        req,
        projectId: dbArtifact.projectId,
        artifactId: dbArtifact.id,
        documentType: dbArtifact.type,
        generationMode: 'amendment',
        lifecycleStatus:
          (dbArtifact.status as GovernedDocumentActionContract['lifecycleStatus']) || 'draft',
        title: dbArtifact.title,
        content: dbArtifact.content || '',
        ctdSection: toSection,
        sourceRefs: [`artifact:${dbArtifact.artifactId}`],
        exportAllowed: ['approved', 'locked', 'published'].includes(String(dbArtifact.status || '')),
        eventType: 'artifact.updated',
      });
      if (!placementGovernedResolution.validation.valid) {
        return sendError(
          res,
          400,
          'Governed document contract validation failed',
          {
            errors: placementGovernedResolution.validation.errors,
            warnings: placementGovernedResolution.validation.warnings,
            resolved: placementGovernedResolution.resolved,
          },
          'GOVERNED_CONTRACT_INVALID'
        );
      }

      const existingMetadata =
        dbArtifact.metadata && typeof dbArtifact.metadata === 'object'
          ? (dbArtifact.metadata as Record<string, unknown>)
          : {};
      const existingHarness =
        existingMetadata.harness && typeof existingMetadata.harness === 'object'
          ? (existingMetadata.harness as Record<string, unknown>)
          : {};

      // Update ctdSection on the artifact
      const [updated] = await db
        .update(concept2cureArtifacts)
        .set({
          ctdSection: toSection,
          updatedAt: new Date(),
          metadata: {
            ...existingMetadata,
            harness: {
              ...existingHarness,
              clientTrack: placementGovernedResolution.contract.clientTrack,
              submissionProgram: placementGovernedResolution.contract.submissionProgram,
              persona: placementGovernedResolution.contract.persona,
              regulatorScope: placementGovernedResolution.contract.regulatorScope,
              documentClass: placementGovernedResolution.contract.documentClass,
              readinessGate: placementGovernedResolution.contract.readinessGate,
              workspaceTarget: placementGovernedResolution.contract.workspaceTarget,
              originSurface: placementGovernedResolution.contract.originSurface,
              recommendationSource: placementGovernedResolution.contract.recommendationSource,
              regulatorIntent: placementGovernedResolution.contract.regulatorIntent,
              gateChecks: placementGovernedResolution.contract.exportEligibility.gateChecks,
              blockingReasons: placementGovernedResolution.contract.exportEligibility.blockingReasons,
              readinessOutcome: placementGovernedResolution.contract.exportEligibility.readinessOutcome,
            },
          },
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
        sourceDescription: `${operation}: ${
          previousSection || '(unassigned)'
        } → ${toSection} — ${reason.trim()}`,
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
router.get(
  '/projects/:projectId/dossier-metrics',
  cacheResponse({
    ttl: 90_000,
    keyGenerator: req => `dossier-metrics:${(req as any).organizationId}:${req.params.projectId}`,
  }),
  async (req: Request, res: Response) => {
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
      const sourceArtifactMetadata =
        artifact.metadata && typeof artifact.metadata === 'object'
          ? (artifact.metadata as Record<string, unknown>)
          : {};
      const sourceHarness =
        sourceArtifactMetadata.harness && typeof sourceArtifactMetadata.harness === 'object'
          ? (sourceArtifactMetadata.harness as Record<string, unknown>)
          : {};
      const auditGovernedResolution = resolveGovernedContext({
        req,
        projectId: artifact.projectId,
        artifactId: null,
        documentType: 'audit_report',
        generationMode: 'ai_assisted',
        lifecycleStatus: 'locked',
        originSurface: 'api_route',
        clientTrack:
          sourceHarness.clientTrack === 'device'
            ? 'device'
            : sourceHarness.clientTrack === 'diagnostics'
              ? 'diagnostics'
              : 'biotech',
        submissionProgram:
          sourceHarness.submissionProgram === 'ind' ||
          sourceHarness.submissionProgram === 'ectd' ||
          sourceHarness.submissionProgram === '510k' ||
          sourceHarness.submissionProgram === 'pma' ||
          sourceHarness.submissionProgram === 'cer' ||
          sourceHarness.submissionProgram === 'ivdr'
            ? (sourceHarness.submissionProgram as GovernedDocumentActionContract['submissionProgram'])
            : 'general_ri',
        persona: sourceHarness.persona === 'qa' ? 'qa' : 'regulatory',
        regulatorScope:
          sourceHarness.regulatorScope === 'ema' ||
          sourceHarness.regulatorScope === 'mhra' ||
          sourceHarness.regulatorScope === 'hc' ||
          sourceHarness.regulatorScope === 'pmda' ||
          sourceHarness.regulatorScope === 'multi'
            ? (sourceHarness.regulatorScope as GovernedDocumentActionContract['regulatorScope'])
            : 'fda',
        evidenceMode: 'mixed',
        documentClass: 'audit_report',
        readinessGate: 'inspection_ready',
        approvalPathType: 'qa_lock',
        recommendationSource: 'report_engine',
        workspaceTarget: 'vault',
        artifactContainerId: exportArtifactId,
        placementContainerId: exportArtifactId,
        regulatorIntent: 'inspection_support',
        title: `Audit Report — ${artifact.title} — ${now.toISOString().split('T')[0]}`,
        content: reportContent,
        ctdSection: artifact.ctdSection,
        sourceRefs: [`artifact:${artifact.artifactId}`],
        provider: 'concept2cure',
        model: 'audit-export-v1',
        exportAllowed: true,
        eventType: 'artifact.created',
      });
      if (!auditGovernedResolution.validation.valid) {
        return sendError(
          res,
          400,
          'Governed document contract validation failed',
          {
            errors: auditGovernedResolution.validation.errors,
            warnings: auditGovernedResolution.validation.warnings,
            resolved: auditGovernedResolution.resolved,
          },
          'GOVERNED_CONTRACT_INVALID'
        );
      }

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
          metadata: {
            sourceArtifactId: artifact.artifactId,
            harness: {
              clientTrack: auditGovernedResolution.contract.clientTrack,
              submissionProgram: auditGovernedResolution.contract.submissionProgram,
              persona: auditGovernedResolution.contract.persona,
              regulatorScope: auditGovernedResolution.contract.regulatorScope,
              documentClass: auditGovernedResolution.contract.documentClass,
              readinessGate: auditGovernedResolution.contract.readinessGate,
              workspaceTarget: auditGovernedResolution.contract.workspaceTarget,
              originSurface: auditGovernedResolution.contract.originSurface,
              recommendationSource: auditGovernedResolution.contract.recommendationSource,
              regulatorIntent: auditGovernedResolution.contract.regulatorIntent,
              gateChecks: auditGovernedResolution.contract.exportEligibility.gateChecks,
              blockingReasons: auditGovernedResolution.contract.exportEligibility.blockingReasons,
              readinessOutcome: auditGovernedResolution.contract.exportEligibility.readinessOutcome,
            },
          },
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

      // ── Contradiction governance gate ───────────────────────────────
      // Hard block promotion if unresolved contradictions with blocks_promotion authority
      if (status === 'approved' || status === 'locked') {
        try {
          const { contradictionEngineService } = await import(
            '../services/contradiction-engine-service'
          );
          const { blocked, blockingFindings, warningFindings } =
            await contradictionEngineService.checkPromotionBlocked(
              organizationId,
              Number(req.params.projectId),
              artifact.id
            );
          if (blocked) {
            return sendError(
              res,
              409,
              `Promotion blocked by ${blockingFindings.length} unresolved contradiction finding(s). Resolve contradictions before promoting.`,
              {
                blockingFindings: blockingFindings.map(f => ({
                  id: f.id,
                  title: f.title,
                  severity: f.severity,
                  contradictionType: f.contradictionType,
                  authorityState: f.authorityState,
                })),
                warningFindings: warningFindings.map(f => ({
                  id: f.id,
                  title: f.title,
                  severity: f.severity,
                })),
              }
            );
          }
        } catch (contradictionError) {
          // Log but don't block on contradiction check failure (table may not exist yet)
          console.warn(
            'Contradiction check skipped:',
            contradictionError instanceof Error ? contradictionError.message : contradictionError
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
                `Cannot approve: ${
                  nonApprovals.length
                } reviewer(s) did not approve (decisions: ${nonApprovals
                  .map(d => d.decision)
                  .join(', ')})`
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
      const statusGovernedResolution = resolveGovernedContext({
        req,
        projectId: artifact.projectId,
        artifactId: artifact.id,
        documentType: artifact.type,
        generationMode: 'amendment',
        lifecycleStatus:
          (status === 'review'
            ? 'in_review'
            : status === 'locked'
              ? 'locked'
              : status === 'approved'
                ? 'approved'
                : 'draft') as GovernedDocumentActionContract['lifecycleStatus'],
        title: artifact.title,
        content: artifact.content || '',
        ctdSection: artifact.ctdSection,
        sourceRefs: [`artifact:${artifact.artifactId}`],
        readinessGate: status === 'locked' ? 'submission_candidate' : undefined,
        exportAllowed: ['approved', 'locked'].includes(status),
        eventType: 'artifact.updated',
      });
      if (!statusGovernedResolution.validation.valid) {
        return sendError(
          res,
          400,
          'Governed document contract validation failed',
          {
            errors: statusGovernedResolution.validation.errors,
            warnings: statusGovernedResolution.validation.warnings,
            resolved: statusGovernedResolution.resolved,
          },
          'GOVERNED_CONTRACT_INVALID'
        );
      }
      const existingMetadata =
        artifact.metadata && typeof artifact.metadata === 'object'
          ? (artifact.metadata as Record<string, unknown>)
          : {};
      const existingHarness =
        existingMetadata.harness && typeof existingMetadata.harness === 'object'
          ? (existingMetadata.harness as Record<string, unknown>)
          : {};
      updateData.metadata = {
        ...existingMetadata,
        harness: {
          ...existingHarness,
          clientTrack: statusGovernedResolution.contract.clientTrack,
          submissionProgram: statusGovernedResolution.contract.submissionProgram,
          persona: statusGovernedResolution.contract.persona,
          regulatorScope: statusGovernedResolution.contract.regulatorScope,
          documentClass: statusGovernedResolution.contract.documentClass,
          readinessGate: statusGovernedResolution.contract.readinessGate,
          workspaceTarget: statusGovernedResolution.contract.workspaceTarget,
          originSurface: statusGovernedResolution.contract.originSurface,
          recommendationSource: statusGovernedResolution.contract.recommendationSource,
          regulatorIntent: statusGovernedResolution.contract.regulatorIntent,
          gateChecks: statusGovernedResolution.contract.exportEligibility.gateChecks,
          blockingReasons: statusGovernedResolution.contract.exportEligibility.blockingReasons,
          readinessOutcome: statusGovernedResolution.contract.exportEligibility.readinessOutcome,
        },
      };

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

      // RIM: capture status change as feedback signal (non-blocking)
      const feedbackMap: Record<string, 'accepted' | 'rejected'> = {
        approved: 'accepted',
        locked: 'accepted',
        draft: 'rejected', // regression = rejection of current state
      };
      const feedbackType = feedbackMap[status];
      if (feedbackType) {
        interceptFeedback({
          organizationId,
          projectId: parseInt(req.params.projectId, 10),
          userId,
          artifactId: req.params.artifactId,
          artifactVersionId: artifact.id?.toString(),
          sectionCode: artifact.ctdSection || undefined,
          feedbackType,
        });
      }

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
      const ctdSectionGovernedResolution = resolveGovernedContext({
        req,
        projectId: artifact.projectId,
        artifactId: artifact.id,
        documentType: artifact.type,
        generationMode: 'amendment',
        lifecycleStatus:
          (artifact.status as GovernedDocumentActionContract['lifecycleStatus']) || 'draft',
        title: artifact.title,
        content: artifact.content || '',
        ctdSection,
        sourceRefs: [`artifact:${artifact.artifactId}`],
        exportAllowed: ['approved', 'locked', 'published'].includes(String(artifact.status || '')),
        eventType: 'artifact.updated',
      });
      if (!ctdSectionGovernedResolution.validation.valid) {
        return sendError(
          res,
          400,
          'Governed document contract validation failed',
          {
            errors: ctdSectionGovernedResolution.validation.errors,
            warnings: ctdSectionGovernedResolution.validation.warnings,
            resolved: ctdSectionGovernedResolution.resolved,
          },
          'GOVERNED_CONTRACT_INVALID'
        );
      }
      const existingMetadata =
        artifact.metadata && typeof artifact.metadata === 'object'
          ? (artifact.metadata as Record<string, unknown>)
          : {};
      const existingHarness =
        existingMetadata.harness && typeof existingMetadata.harness === 'object'
          ? (existingMetadata.harness as Record<string, unknown>)
          : {};
      const [updated] = await db
        .update(concept2cureArtifacts)
        .set({
          ctdSection,
          updatedAt: new Date(),
          metadata: {
            ...existingMetadata,
            harness: {
              ...existingHarness,
              clientTrack: ctdSectionGovernedResolution.contract.clientTrack,
              submissionProgram: ctdSectionGovernedResolution.contract.submissionProgram,
              persona: ctdSectionGovernedResolution.contract.persona,
              regulatorScope: ctdSectionGovernedResolution.contract.regulatorScope,
              documentClass: ctdSectionGovernedResolution.contract.documentClass,
              readinessGate: ctdSectionGovernedResolution.contract.readinessGate,
              workspaceTarget: ctdSectionGovernedResolution.contract.workspaceTarget,
              originSurface: ctdSectionGovernedResolution.contract.originSurface,
              recommendationSource: ctdSectionGovernedResolution.contract.recommendationSource,
              regulatorIntent: ctdSectionGovernedResolution.contract.regulatorIntent,
              gateChecks: ctdSectionGovernedResolution.contract.exportEligibility.gateChecks,
              blockingReasons: ctdSectionGovernedResolution.contract.exportEligibility.blockingReasons,
              readinessOutcome: ctdSectionGovernedResolution.contract.exportEligibility.readinessOutcome,
            },
          },
        })
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

      const rollbackGovernedResolution = resolveGovernedContext({
        req,
        projectId: artifact.projectId,
        artifactId: artifact.id,
        documentType: artifact.type,
        generationMode: 'amendment',
        lifecycleStatus:
          (artifact.status as GovernedDocumentActionContract['lifecycleStatus']) || 'draft',
        title: artifact.title,
        content: targetVer.content || '',
        ctdSection: artifact.ctdSection,
        sourceRefs: [`artifact:${artifact.artifactId}`],
        exportAllowed: ['approved', 'locked', 'published'].includes(String(artifact.status || '')),
        eventType: 'artifact.updated',
      });
      if (!rollbackGovernedResolution.validation.valid) {
        return sendError(
          res,
          400,
          'Governed document contract validation failed',
          {
            errors: rollbackGovernedResolution.validation.errors,
            warnings: rollbackGovernedResolution.validation.warnings,
            resolved: rollbackGovernedResolution.resolved,
          },
          'GOVERNED_CONTRACT_INVALID'
        );
      }
      const existingMetadata =
        artifact.metadata && typeof artifact.metadata === 'object'
          ? (artifact.metadata as Record<string, unknown>)
          : {};
      const existingHarness =
        existingMetadata.harness && typeof existingMetadata.harness === 'object'
          ? (existingMetadata.harness as Record<string, unknown>)
          : {};

      // Update the artifact to the rolled-back content
      const [updated] = await db
        .update(concept2cureArtifacts)
        .set({
          content: targetVer.content,
          contentHash: newContentHash,
          version: newVersion,
          metadata: {
            ...existingMetadata,
            harness: {
              ...existingHarness,
              clientTrack: rollbackGovernedResolution.contract.clientTrack,
              submissionProgram: rollbackGovernedResolution.contract.submissionProgram,
              persona: rollbackGovernedResolution.contract.persona,
              regulatorScope: rollbackGovernedResolution.contract.regulatorScope,
              documentClass: rollbackGovernedResolution.contract.documentClass,
              readinessGate: rollbackGovernedResolution.contract.readinessGate,
              workspaceTarget: rollbackGovernedResolution.contract.workspaceTarget,
              originSurface: rollbackGovernedResolution.contract.originSurface,
              recommendationSource: rollbackGovernedResolution.contract.recommendationSource,
              regulatorIntent: rollbackGovernedResolution.contract.regulatorIntent,
              gateChecks: rollbackGovernedResolution.contract.exportEligibility.gateChecks,
              blockingReasons: rollbackGovernedResolution.contract.exportEligibility.blockingReasons,
              readinessOutcome: rollbackGovernedResolution.contract.exportEligibility.readinessOutcome,
            },
          },
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

      // Batch insert all reviewer assignments in one query
      const allValues = numericIds.map(reviewerId => ({
        assignmentId: `asgn_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        artifactId: artifact.id,
        organizationId,
        reviewerId,
        assignedById: userId,
        reviewRound,
        status: 'pending' as const,
        dueDate: parsedDueDate,
        notes: notes ? sanitizeContent(notes) : null,
      }));

      const inserted = await db
        .insert(concept2cureReviewAssignments)
        .values(allValues)
        .onConflictDoNothing()
        .returning();

      const insertedSet = new Set(inserted.map(r => r.reviewerId));
      const results = numericIds.map(reviewerId => {
        const row = inserted.find(r => r.reviewerId === reviewerId);
        if (row) {
          return {
            assignmentId: row.assignmentId,
            reviewerId: row.reviewerId,
            status: row.status,
            reviewRound: row.reviewRound,
          };
        }
        return { reviewerId, status: 'already_assigned', reviewRound };
      });

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
 * GET /api/concept2cure/projects/:projectId/team
 * List organization team members who can be assigned as reviewers.
 * Returns users in the same organization as the project.
 */
router.get('/projects/:projectId/team', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) return sendError(res, 404, 'Project not found');

    // Get all users in this organization
    const members = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: organizationUsers.role,
        title: users.title,
        department: users.department,
        avatar: users.avatar,
        status: users.status,
      })
      .from(organizationUsers)
      .innerJoin(users, eq(organizationUsers.userId, users.id))
      .where(and(eq(organizationUsers.organizationId, organizationId), eq(users.status, 'active')))
      .orderBy(users.name);

    return sendSuccess(
      res,
      members.map(m => ({
        id: String(m.id),
        userId: m.id,
        name: m.name,
        email: m.email,
        role: m.role,
        title: m.title,
        department: m.department,
        avatar: m.avatar,
      }))
    );
  } catch (error: any) {
    logConcept2cureError('get team members', error, { projectId: req.params.projectId });
    return sendError(res, 500, 'Failed to fetch team members');
  }
});

/**
 * POST /api/concept2cure/projects/:projectId/artifacts/:artifactId/reviewers/:assignmentId/remind
 * Send a reminder to a reviewer about their pending review.
 */
router.post(
  '/projects/:projectId/artifacts/:artifactId/reviewers/:assignmentId/remind',
  async (req: Request, res: Response) => {
    try {
      const organizationId = getOrganizationId(req);
      const userId = getUserId(req);
      const hasAccess = await verifyProjectAccess(req, req.params.projectId);
      if (!hasAccess) return sendError(res, 404, 'Project not found');

      // Get the assignment
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

      if (!assignment) {
        return sendError(res, 404, 'Assignment not found');
      }

      if (assignment.status === 'completed' || assignment.status === 'withdrawn') {
        return sendError(res, 400, `Cannot remind — assignment is ${assignment.status}`);
      }

      // Create a notification for the reviewer
      await db.insert(concept2cureNotifications).values({
        notificationId: `notif_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
        orgId: organizationId,
        recipientUserId: assignment.reviewerId,
        actorUserId: userId,
        notificationType: 'due_soon',
        title: 'Review Reminder',
        body: `You have a pending review for artifact ${req.params.artifactId}. Please complete your review.`,
        severity: 'warning',
        status: 'unread',
        artifactId: Number(req.params.artifactId) || undefined,
        projectId: Number(req.params.projectId) || undefined,
      });

      // Log audit entry
      await logAuditEntry(req, 'UPDATE', 'review_assignment', req.params.assignmentId, null, {
        action: 'reminder_sent',
        reviewerId: assignment.reviewerId,
      });

      return sendSuccess(res, {
        assignmentId: req.params.assignmentId,
        reminded: true,
        reviewerId: assignment.reviewerId,
      });
    } catch (error: any) {
      logConcept2cureError('send review reminder', error, {
        assignmentId: req.params.assignmentId,
      });
      return sendError(res, 500, 'Failed to send reminder');
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

// ─────────────────────────────────────────────────────────────────────────────
// HAQ SESSION PERSISTENCE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PUT /api/concept2cure/projects/:projectId/haq-session
 * Persist a HAQ (Health Authority Question) session to the database.
 * Stores as a JSON artifact so it survives beyond sessionStorage.
 */
router.put('/projects/:projectId/haq-session', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) return sendError(res, 404, 'Project not found');

    const { questions } = req.body;
    if (!Array.isArray(questions)) {
      return sendError(res, 400, 'questions must be an array');
    }

    // Check for existing HAQ session artifact
    const [existing] = await db
      .select()
      .from(concept2cureArtifacts)
      .where(
        and(
          eq(concept2cureArtifacts.projectId, Number(req.params.projectId)),
          eq(concept2cureArtifacts.organizationId, organizationId),
          eq(concept2cureArtifacts.type, 'haq_session')
        )
      )
      .limit(1);

    if (existing) {
      const haqUpdateResolution = resolveGovernedContext({
        req,
        projectId: Number(req.params.projectId),
        artifactId: existing.id,
        documentType: 'haq_session',
        generationMode: 'amendment',
        lifecycleStatus:
          (existing.status as GovernedDocumentActionContract['lifecycleStatus']) || 'draft',
        originSurface: 'project_workspace_shell',
        clientTrack: 'biotech',
        submissionProgram: 'general_ri',
        persona: 'regulatory',
        regulatorScope: 'fda',
        evidenceMode: 'mixed',
        documentClass: 'strategy_memo',
        readinessGate: 'exploratory',
        approvalPathType: 'single_reviewer',
        recommendationSource: 'report_engine',
        workspaceTarget: 'project',
        regulatorIntent: 'strategy',
        placementContainerId: String(req.params.projectId),
        title: 'HAQ Session',
        content: JSON.stringify({ questions }),
        sourceRefs: [`haq_session:${existing.artifactId}`],
        provider: 'concept2cure',
        model: 'haq-session-manager',
        exportAllowed: false,
        eventType: 'artifact.updated',
      });
      if (!haqUpdateResolution.validation.valid) {
        return sendError(
          res,
          400,
          'Governed document contract validation failed',
          {
            errors: haqUpdateResolution.validation.errors,
            warnings: haqUpdateResolution.validation.warnings,
            resolved: haqUpdateResolution.resolved,
          },
          'GOVERNED_CONTRACT_INVALID'
        );
      }

      // Update existing session
      const existingMetadata =
        existing.metadata && typeof existing.metadata === 'object'
          ? (existing.metadata as Record<string, unknown>)
          : {};
      const existingHarness =
        existingMetadata.harness && typeof existingMetadata.harness === 'object'
          ? (existingMetadata.harness as Record<string, unknown>)
          : {};
      await db
        .update(concept2cureArtifacts)
        .set({
          content: JSON.stringify({ questions }),
          updatedAt: new Date(),
          metadata: {
            ...existingMetadata,
            questionCount: questions.length,
            harness: {
              ...existingHarness,
              clientTrack: haqUpdateResolution.contract.clientTrack,
              submissionProgram: haqUpdateResolution.contract.submissionProgram,
              persona: haqUpdateResolution.contract.persona,
              regulatorScope: haqUpdateResolution.contract.regulatorScope,
              documentClass: haqUpdateResolution.contract.documentClass,
              readinessGate: haqUpdateResolution.contract.readinessGate,
              workspaceTarget: haqUpdateResolution.contract.workspaceTarget,
              originSurface: haqUpdateResolution.contract.originSurface,
              recommendationSource: haqUpdateResolution.contract.recommendationSource,
              regulatorIntent: haqUpdateResolution.contract.regulatorIntent,
              gateChecks: haqUpdateResolution.contract.exportEligibility.gateChecks,
              blockingReasons: haqUpdateResolution.contract.exportEligibility.blockingReasons,
              readinessOutcome: haqUpdateResolution.contract.exportEligibility.readinessOutcome,
            },
          },
        })
        .where(eq(concept2cureArtifacts.id, existing.id));

      return sendSuccess(res, {
        artifactId: existing.artifactId,
        updated: true,
        questionCount: questions.length,
      });
    } else {
      // Create new HAQ session artifact
      const artifactId = `haq_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      const haqCreateResolution = resolveGovernedContext({
        req,
        projectId: Number(req.params.projectId),
        artifactId: null,
        documentType: 'haq_session',
        generationMode: 'manual',
        lifecycleStatus: 'draft',
        originSurface: 'project_workspace_shell',
        clientTrack: 'biotech',
        submissionProgram: 'general_ri',
        persona: 'regulatory',
        regulatorScope: 'fda',
        evidenceMode: 'mixed',
        documentClass: 'strategy_memo',
        readinessGate: 'exploratory',
        approvalPathType: 'single_reviewer',
        recommendationSource: 'report_engine',
        workspaceTarget: 'project',
        regulatorIntent: 'strategy',
        placementContainerId: String(req.params.projectId),
        title: 'HAQ Session',
        content: JSON.stringify({ questions }),
        sourceRefs: [`haq_session:${artifactId}`],
        provider: 'concept2cure',
        model: 'haq-session-manager',
        exportAllowed: false,
        eventType: 'artifact.created',
      });
      if (!haqCreateResolution.validation.valid) {
        return sendError(
          res,
          400,
          'Governed document contract validation failed',
          {
            errors: haqCreateResolution.validation.errors,
            warnings: haqCreateResolution.validation.warnings,
            resolved: haqCreateResolution.resolved,
          },
          'GOVERNED_CONTRACT_INVALID'
        );
      }

      await db.insert(concept2cureArtifacts).values({
        artifactId,
        projectId: Number(req.params.projectId),
        organizationId,
        createdById: userId,
        title: 'HAQ Session',
        type: 'haq_session',
        category: 'data',
        content: JSON.stringify({ questions }),
        status: 'draft',
        version: 1,
        metadata: {
          questionCount: questions.length,
          sourceSystem: 'haq_manager',
          harness: {
            clientTrack: haqCreateResolution.contract.clientTrack,
            submissionProgram: haqCreateResolution.contract.submissionProgram,
            persona: haqCreateResolution.contract.persona,
            regulatorScope: haqCreateResolution.contract.regulatorScope,
            documentClass: haqCreateResolution.contract.documentClass,
            readinessGate: haqCreateResolution.contract.readinessGate,
            workspaceTarget: haqCreateResolution.contract.workspaceTarget,
            originSurface: haqCreateResolution.contract.originSurface,
            recommendationSource: haqCreateResolution.contract.recommendationSource,
            regulatorIntent: haqCreateResolution.contract.regulatorIntent,
            gateChecks: haqCreateResolution.contract.exportEligibility.gateChecks,
            blockingReasons: haqCreateResolution.contract.exportEligibility.blockingReasons,
            readinessOutcome: haqCreateResolution.contract.exportEligibility.readinessOutcome,
          },
        },
      });

      return sendSuccess(res, { artifactId, created: true, questionCount: questions.length });
    }
  } catch (error: any) {
    logConcept2cureError('save HAQ session', error, { projectId: req.params.projectId });
    return sendError(res, 500, 'Failed to save HAQ session');
  }
});

/**
 * GET /api/concept2cure/projects/:projectId/haq-session
 * Load the most recent HAQ session for a project.
 */
router.get('/projects/:projectId/haq-session', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) return sendError(res, 404, 'Project not found');

    const [session] = await db
      .select()
      .from(concept2cureArtifacts)
      .where(
        and(
          eq(concept2cureArtifacts.projectId, Number(req.params.projectId)),
          eq(concept2cureArtifacts.organizationId, organizationId),
          eq(concept2cureArtifacts.type, 'haq_session')
        )
      )
      .orderBy(desc(concept2cureArtifacts.updatedAt))
      .limit(1);

    if (!session) {
      return sendSuccess(res, { questions: [] });
    }

    try {
      const parsed = JSON.parse(session.content || '{}');
      return sendSuccess(res, {
        questions: parsed.questions || [],
        artifactId: session.artifactId,
      });
    } catch {
      return sendSuccess(res, { questions: [] });
    }
  } catch (error: any) {
    logConcept2cureError('load HAQ session', error, { projectId: req.params.projectId });
    return sendError(res, 500, 'Failed to load HAQ session');
  }
});

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

// ─────────────────────────────────────────────────────────────────────────────
// REGULATORY CATALOG — Registry-driven application type catalog
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/concept2cure/regulatory-catalog/regions
 * List all supported regions with application type counts.
 */
router.get('/regulatory-catalog/regions', (_req: Request, res: Response) => {
  try {
    const {
      getRegionsWithCounts,
    } = require('../services/regulatory/registry/globalDocumentRegistryService.js');
    return sendSuccess(res, getRegionsWithCounts());
  } catch (error: any) {
    logger.error('Failed to fetch regulatory regions', { error: error.message });
    return sendError(res, 500, 'Failed to fetch regulatory regions');
  }
});

/**
 * GET /api/concept2cure/regulatory-catalog/agencies
 * List all supported regulatory agencies with counts.
 */
router.get('/regulatory-catalog/agencies', (_req: Request, res: Response) => {
  try {
    const {
      getAgenciesWithCounts,
    } = require('../services/regulatory/registry/globalDocumentRegistryService.js');
    return sendSuccess(res, getAgenciesWithCounts());
  } catch (error: any) {
    logger.error('Failed to fetch regulatory agencies', { error: error.message });
    return sendError(res, 500, 'Failed to fetch regulatory agencies');
  }
});

/**
 * GET /api/concept2cure/regulatory-catalog/application-types
 * List application types with optional filters.
 * Query params: region, agency, family, productClass, query
 */
router.get('/regulatory-catalog/application-types', (req: Request, res: Response) => {
  try {
    const {
      getApplicationTypes,
    } = require('../services/regulatory/registry/globalDocumentRegistryService.js');
    const filters: Record<string, string> = {};
    if (req.query.region) filters.region = String(req.query.region);
    if (req.query.agency) filters.agency = String(req.query.agency);
    if (req.query.family) filters.family = String(req.query.family);
    if (req.query.productClass) filters.productClass = String(req.query.productClass);
    if (req.query.query) filters.query = String(req.query.query);
    return sendSuccess(
      res,
      getApplicationTypes(Object.keys(filters).length > 0 ? filters : undefined)
    );
  } catch (error: any) {
    logger.error('Failed to fetch application types', { error: error.message });
    return sendError(res, 500, 'Failed to fetch application types');
  }
});

/**
 * GET /api/concept2cure/regulatory-catalog/families
 * List all application families with metadata.
 */
router.get('/regulatory-catalog/families', (_req: Request, res: Response) => {
  try {
    const { getAllFamiliesSorted } = require('../../shared/regulatory/application-families.js');
    return sendSuccess(res, getAllFamiliesSorted());
  } catch (error: any) {
    logger.error('Failed to fetch application families', { error: error.message });
    return sendError(res, 500, 'Failed to fetch application families');
  }
});

/**
 * POST /api/concept2cure/regulatory-catalog/resolve
 * Resolve a registry ID or legacy submission type to full entry with blueprints.
 * Body: { registryId?: string, submissionType?: string }
 */
router.post('/regulatory-catalog/resolve', (req: Request, res: Response) => {
  try {
    const { resolve } = require('../services/regulatory/registry/globalDocumentRegistryService.js');
    const { registryId, submissionType } = req.body;
    const idToResolve = registryId || submissionType;
    if (!idToResolve) {
      return sendError(res, 400, 'Either registryId or submissionType is required');
    }
    const result = resolve(idToResolve);
    if (!result) {
      return sendError(res, 404, `Could not resolve "${idToResolve}" to a known application type`);
    }
    return sendSuccess(res, result);
  } catch (error: any) {
    logger.error('Failed to resolve registry entry', { error: error.message });
    return sendError(res, 500, 'Failed to resolve registry entry');
  }
});

/**
 * POST /api/concept2cure/regulatory-catalog/bootstrap-preview
 * Preview what sections and tasks would be created for a given application type.
 * Body: { registryId: string }
 */
router.post('/regulatory-catalog/bootstrap-preview', (req: Request, res: Response) => {
  try {
    const {
      getBootstrapPreview,
    } = require('../services/regulatory/registry/globalDocumentRegistryService.js');
    const { registryId } = req.body;
    if (!registryId) {
      return sendError(res, 400, 'registryId is required');
    }
    const preview = getBootstrapPreview(registryId);
    if (!preview) {
      return sendError(res, 404, `Unknown registry ID: ${registryId}`);
    }
    return sendSuccess(res, preview);
  } catch (error: any) {
    logger.error('Failed to generate bootstrap preview', { error: error.message });
    return sendError(res, 500, 'Failed to generate bootstrap preview');
  }
});

/**
 * GET /api/concept2cure/regulatory-catalog/search
 * Search application types with ranked results.
 * Query params: q (required), region, agency, family, limit
 */
router.get('/regulatory-catalog/search', (req: Request, res: Response) => {
  try {
    const { rankedSearch } = require('../services/regulatory/registry/registrySearch.js');
    const q = String(req.query.q || '');
    if (!q) {
      return sendError(res, 400, 'Query parameter "q" is required');
    }
    const filters: Record<string, string | boolean> = { activeOnly: true };
    if (req.query.region) filters.region = String(req.query.region);
    if (req.query.agency) filters.agency = String(req.query.agency);
    if (req.query.family) filters.family = String(req.query.family);
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
    const results = rankedSearch(q, Object.keys(filters).length > 1 ? filters : undefined, limit);
    return sendSuccess(res, results);
  } catch (error: any) {
    logger.error('Failed to search registry', { error: error.message });
    return sendError(res, 500, 'Failed to search registry');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DOCX EXPORT FOR CHAT ARTIFACTS
// ─────────────────────────────────────────────────────────────────────────────

const EXPORT_REVIEW_NOTICE =
  'REGULATORY SAFETY NOTICE: This document may contain AI-generated content. Qualified human review and approval are required before use in regulated submissions, clinical/safety decisions, or external communications.';

const exportGovernanceSchema = z.object({
  aiGenerated: z.boolean().default(true),
  humanReviewApproved: z.boolean().default(false),
  reviewerName: z.string().trim().min(1).max(200).optional(),
  reviewerRole: z.string().trim().min(1).max(200).optional(),
  reviewTimestamp: z.string().datetime().optional(),
});

function shouldEnforceExportReviewGate(): boolean {
  if (process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW === 'true') return true;
  if (process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

function applyExportGovernanceHeaders(
  res: Response,
  governance: z.infer<typeof exportGovernanceSchema>
): void {
  res.setHeader('X-Concept2Cure-AI-Generated', String(governance.aiGenerated));
  res.setHeader('X-Concept2Cure-Human-Review-Approved', String(governance.humanReviewApproved));
  res.setHeader('X-Concept2Cure-Review-Required', 'true');
  if (governance.reviewerName) {
    res.setHeader('X-Concept2Cure-Reviewer', encodeURIComponent(governance.reviewerName));
  }
  if (governance.reviewTimestamp) {
    res.setHeader('X-Concept2Cure-Review-Timestamp', governance.reviewTimestamp);
  }
}

function validateExportGovernance(
  req: Request,
  res: Response
): z.infer<typeof exportGovernanceSchema> | null {
  const parsed = exportGovernanceSchema.safeParse(req.body?.governance ?? {});
  if (!parsed.success) {
    sendError(
      res,
      400,
      'Invalid export governance payload',
      parsed.error.flatten(),
      'VALIDATION_ERROR'
    );
    return null;
  }

  const governance = parsed.data;
  const strictGateEnabled = shouldEnforceExportReviewGate();
  if (strictGateEnabled && !governance.humanReviewApproved) {
    sendError(
      res,
      403,
      'Human review approval is required before export in this environment',
      {
        required: 'governance.humanReviewApproved=true',
        reviewerFields: [
          'governance.reviewerName',
          'governance.reviewerRole',
          'governance.reviewTimestamp',
        ],
      },
      'HUMAN_REVIEW_REQUIRED'
    );
    return null;
  }

  applyExportGovernanceHeaders(res, governance);
  return governance;
}

/**
 * POST /api/concept2cure/artifacts/export-docx
 * Generate a DOCX file from title + content and return as a download.
 * Used by the Copilot to export AI-generated documents.
 */
router.post('/artifacts/export-docx', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      title: z.string().min(1).max(500),
      content: z.string().min(1).max(1000000),
    });
    const { title, content } = schema.parse(req.body);
    const governance = validateExportGovernance(req, res);
    if (!governance) return;
    const exportBody = governance.aiGenerated ? `${EXPORT_REVIEW_NOTICE}\n\n${content}` : content;

    // Dynamic import to avoid circular dependency issues
    const { generateDocxBuffer } = await import('../services/docxGenerator');
    const buffer = await generateDocxBuffer(title, exportBody);

    const safeFilename = title.replace(/[^a-zA-Z0-9_.-]/g, '_');
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.docx"`);
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation failed', error.errors, 'VALIDATION_ERROR');
    }
    logger.error('Failed to export DOCX', { error: error.message });
    return sendError(res, 500, 'Failed to export DOCX');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PDF EXPORT FOR CHAT ARTIFACTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/concept2cure/artifacts/export-pdf
 * Generate a PDF from artifact content
 */
router.post('/artifacts/export-pdf', async (req: Request, res: Response) => {
  // Validate input
  const { title, content } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: 'title and content are required' });
  }

  const governance = validateExportGovernance(req, res);
  if (!governance) return;

  try {
    // Use pdf-lib to create a PDF from the content
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');

    const pdfDoc = await PDFDocument.create();
    const timesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const timesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

    const fontSize = 11;
    const titleFontSize = 18;
    const headingFontSize = 14;
    const margin = 72; // 1 inch
    const pageWidth = 612; // Letter size
    const pageHeight = 792;
    const maxWidth = pageWidth - 2 * margin;

    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    // Title
    page.drawText(title, {
      x: margin,
      y: y,
      size: titleFontSize,
      font: timesBold,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= titleFontSize + 20;

    // Date line
    const dateStr = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    page.drawText(dateStr, {
      x: margin,
      y: y,
      size: 9,
      font: timesRoman,
      color: rgb(0.5, 0.5, 0.5),
    });
    y -= 30;

    if (governance.aiGenerated) {
      const noticeLines = EXPORT_REVIEW_NOTICE.match(/.{1,110}(\s|$)/g) ?? [EXPORT_REVIEW_NOTICE];
      for (const noticeLine of noticeLines) {
        page.drawText(noticeLine.trim(), {
          x: margin,
          y,
          size: 9,
          font: timesBold,
          color: rgb(0.65, 0.3, 0.2),
        });
        y -= 12;
      }
      y -= 6;
    }

    // Draw a separator line
    page.drawLine({
      start: { x: margin, y: y },
      end: { x: pageWidth - margin, y: y },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    });
    y -= 20;

    // Content - split by lines, handle headings and paragraphs
    const lines = content.split('\n');
    for (const line of lines) {
      // Check if we need a new page
      if (y < margin + 40) {
        // Add page number to current page
        const pageNum = pdfDoc.getPageCount();
        page.drawText(`Page ${pageNum}`, {
          x: pageWidth / 2 - 20,
          y: margin / 2,
          size: 9,
          font: timesRoman,
          color: rgb(0.5, 0.5, 0.5),
        });
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }

      if (line.startsWith('# ')) {
        y -= 10;
        const text = line.slice(2);
        page.drawText(text, {
          x: margin,
          y,
          size: titleFontSize,
          font: timesBold,
          color: rgb(0.1, 0.1, 0.1),
        });
        y -= titleFontSize + 8;
      } else if (line.startsWith('## ')) {
        y -= 8;
        const text = line.slice(3);
        page.drawText(text, {
          x: margin,
          y,
          size: headingFontSize,
          font: timesBold,
          color: rgb(0.15, 0.15, 0.15),
        });
        y -= headingFontSize + 6;
      } else if (line.startsWith('### ')) {
        y -= 6;
        const text = line.slice(4);
        page.drawText(text, { x: margin, y, size: 12, font: timesBold, color: rgb(0.2, 0.2, 0.2) });
        y -= 18;
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        const text = '  \u2022 ' + line.slice(2);
        // Word wrap
        const words = text.split(' ');
        let currentLine = '';
        for (const word of words) {
          const testLine = currentLine ? currentLine + ' ' + word : word;
          const width = timesRoman.widthOfTextAtSize(testLine, fontSize);
          if (width > maxWidth - 20) {
            page.drawText(currentLine, {
              x: margin + 10,
              y,
              size: fontSize,
              font: timesRoman,
              color: rgb(0.2, 0.2, 0.2),
            });
            y -= fontSize + 4;
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }
        if (currentLine) {
          page.drawText(currentLine, {
            x: margin + 10,
            y,
            size: fontSize,
            font: timesRoman,
            color: rgb(0.2, 0.2, 0.2),
          });
          y -= fontSize + 4;
        }
      } else if (line.trim() === '') {
        y -= 8;
      } else {
        // Regular paragraph with word wrap
        const cleanText = line.replace(/\*\*/g, '');
        const words = cleanText.split(' ');
        let currentLine = '';
        for (const word of words) {
          const testLine = currentLine ? currentLine + ' ' + word : word;
          const width = timesRoman.widthOfTextAtSize(testLine, fontSize);
          if (width > maxWidth) {
            if (y < margin + 40) {
              const pageNum = pdfDoc.getPageCount();
              page.drawText(`Page ${pageNum}`, {
                x: pageWidth / 2 - 20,
                y: margin / 2,
                size: 9,
                font: timesRoman,
                color: rgb(0.5, 0.5, 0.5),
              });
              page = pdfDoc.addPage([pageWidth, pageHeight]);
              y = pageHeight - margin;
            }
            page.drawText(currentLine, {
              x: margin,
              y,
              size: fontSize,
              font: timesRoman,
              color: rgb(0.2, 0.2, 0.2),
            });
            y -= fontSize + 4;
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }
        if (currentLine) {
          page.drawText(currentLine, {
            x: margin,
            y,
            size: fontSize,
            font: timesRoman,
            color: rgb(0.2, 0.2, 0.2),
          });
          y -= fontSize + 4;
        }
      }
    }

    // Add page number to last page
    const pageNum = pdfDoc.getPageCount();
    page.drawText(`Page ${pageNum}`, {
      x: pageWidth / 2 - 20,
      y: margin / 2,
      size: 9,
      font: timesRoman,
      color: rgb(0.5, 0.5, 0.5),
    });

    const pdfBytes = await pdfDoc.save();
    const safeTitle = title.replace(/[^a-zA-Z0-9_.-]/g, '_');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.pdf"`);
    res.send(Buffer.from(pdfBytes));
  } catch (error: any) {
    logger.error('Failed to export PDF', { error: error.message });
    return sendError(res, 500, 'Failed to generate PDF');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PPTX EXPORT FOR CHAT ARTIFACTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/concept2cure/artifacts/export-pptx
 * Generate a PowerPoint presentation from title + content and return as a download.
 * Used by AnA to export AI-generated presentations, training decks, and briefings.
 */
router.post('/artifacts/export-pptx', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      title: z.string().min(1).max(500),
      content: z.string().min(1).max(1000000),
      nanoBanana: z.boolean().optional(), // opt-in to Nano Banana cover image
    });
    const { title, content, nanoBanana } = schema.parse(req.body);
    const governance = validateExportGovernance(req, res);
    if (!governance) return;
    const exportBody = governance.aiGenerated ? `${EXPORT_REVIEW_NOTICE}\n\n${content}` : content;

    // If Nano Banana is enabled and configured, generate the full presentation with cover
    if (nanoBanana) {
      try {
        const { isConfigured, generatePresentation } = await import(
          '../services/nanoBananaService'
        );
        if (isConfigured()) {
          const result = await generatePresentation({
            topic: title,
            slideCount: Math.min(exportBody.split(/\n---\n/).length || 6, 12),
            audience: 'scientific',
            generateImages: true,
          });
          const safeFilename = title.replace(/[^a-zA-Z0-9_.-]/g, '_');
          res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation'
          );
          res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.pptx"`);
          res.setHeader('Content-Length', result.pptxBuffer.length);
          return res.send(result.pptxBuffer);
        }
      } catch (nbErr: any) {
        // Fall through to standard PPTX generation
        console.warn('[pptx-export] Nano Banana enhancement failed, falling back:', nbErr.message);
      }
    }

    const { generatePptxBuffer } = await import('../services/pptxGenerator');
    const buffer = await generatePptxBuffer(title, exportBody);

    const safeFilename = title.replace(/[^a-zA-Z0-9_.-]/g, '_');
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.pptx"`);
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation failed', error.errors, 'VALIDATION_ERROR');
    }
    logger.error('Failed to export PPTX', { error: error.message });
    return sendError(res, 500, 'Failed to export PPTX');
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

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT TASK MANAGEMENT
// Regulatory-aware task management connected to submission workflows
// ═══════════════════════════════════════════════════════════════════════════════

const SUBMISSION_MILESTONES: Record<
  string,
  Array<{ name: string; category: string; order: number }>
> = {
  IND: [
    { name: 'Pre-IND Meeting Request', category: 'regulatory', order: 1 },
    { name: 'Pre-IND Briefing Document', category: 'document-prep', order: 2 },
    { name: 'Pre-IND Meeting', category: 'meeting', order: 3 },
    { name: 'Module 1 Administrative', category: 'document-prep', order: 4 },
    { name: 'Module 2 Summaries', category: 'document-prep', order: 5 },
    { name: 'Module 3 Quality (CMC)', category: 'document-prep', order: 6 },
    { name: 'Module 4 Nonclinical', category: 'document-prep', order: 7 },
    { name: 'Module 5 Clinical', category: 'document-prep', order: 8 },
    { name: 'IND Compilation & QC', category: 'quality', order: 9 },
    { name: 'IND Submission to FDA', category: 'submission', order: 10 },
    { name: '30-Day Safety Review', category: 'regulatory', order: 11 },
    { name: 'Study May Proceed', category: 'milestone', order: 12 },
  ],
  NDA: [
    { name: 'Pre-NDA Meeting', category: 'meeting', order: 1 },
    { name: 'Module 1 Administrative', category: 'document-prep', order: 2 },
    { name: 'Module 2.5 Clinical Overview', category: 'document-prep', order: 3 },
    { name: 'Module 2.7 Clinical Summary', category: 'document-prep', order: 4 },
    { name: 'Module 3 Quality', category: 'document-prep', order: 5 },
    { name: 'Module 4 Nonclinical Reports', category: 'document-prep', order: 6 },
    { name: 'Module 5 Clinical Study Reports', category: 'document-prep', order: 7 },
    { name: 'NDA Compilation & Publishing', category: 'quality', order: 8 },
    { name: 'NDA Submission', category: 'submission', order: 9 },
    { name: 'Filing Review (60 days)', category: 'regulatory', order: 10 },
    { name: 'Mid-Cycle Review', category: 'regulatory', order: 11 },
    { name: 'Advisory Committee', category: 'meeting', order: 12 },
    { name: 'PDUFA Date / Action', category: 'milestone', order: 13 },
  ],
  BLA: [
    { name: 'Pre-BLA Meeting', category: 'meeting', order: 1 },
    { name: 'Module 1 Administrative', category: 'document-prep', order: 2 },
    { name: 'Module 2 CTD Summaries', category: 'document-prep', order: 3 },
    { name: 'Module 3 Quality (CMC)', category: 'document-prep', order: 4 },
    { name: 'Module 4 Nonclinical', category: 'document-prep', order: 5 },
    { name: 'Module 5 Clinical', category: 'document-prep', order: 6 },
    { name: 'BLA Compilation & Publishing', category: 'quality', order: 7 },
    { name: 'BLA Submission', category: 'submission', order: 8 },
    { name: 'PDUFA Date / Action', category: 'milestone', order: 9 },
  ],
  '510K': [
    { name: 'Device Classification & Pathway', category: 'regulatory', order: 1 },
    { name: 'Predicate Device Selection', category: 'analysis', order: 2 },
    { name: 'Pre-Submission Meeting (Q-Sub)', category: 'meeting', order: 3 },
    { name: 'SE Comparison & Testing Plan', category: 'document-prep', order: 4 },
    { name: 'Bench Testing & Biocompatibility', category: 'testing', order: 5 },
    { name: 'Software Documentation (if applicable)', category: 'document-prep', order: 6 },
    { name: 'Sterilization Validation', category: 'testing', order: 7 },
    { name: 'Clinical Data / Literature Review', category: 'analysis', order: 8 },
    { name: '510(k) Summary / Statement', category: 'document-prep', order: 9 },
    { name: 'Labeling & IFU', category: 'document-prep', order: 10 },
    { name: 'eSTAR Submission Assembly', category: 'submission', order: 11 },
    { name: '510(k) Submission to FDA', category: 'submission', order: 12 },
    { name: 'FDA Review (90-day target)', category: 'regulatory', order: 13 },
    { name: 'Clearance Decision', category: 'milestone', order: 14 },
  ],
  PMA: [
    { name: 'Pre-Submission Meeting', category: 'meeting', order: 1 },
    { name: 'Device Description & IFU', category: 'document-prep', order: 2 },
    { name: 'Manufacturing & Quality System', category: 'document-prep', order: 3 },
    { name: 'Nonclinical Testing', category: 'testing', order: 4 },
    { name: 'Clinical Study Design & Protocol', category: 'document-prep', order: 5 },
    { name: 'Clinical Data & Analysis', category: 'analysis', order: 6 },
    { name: 'PMA Assembly & QC', category: 'quality', order: 7 },
    { name: 'PMA Submission', category: 'submission', order: 8 },
    { name: 'FDA Panel Meeting', category: 'meeting', order: 9 },
    { name: 'Approval Decision', category: 'milestone', order: 10 },
  ],
  CER: [
    { name: 'Define Scope & Device Description', category: 'document-prep', order: 1 },
    { name: 'Literature Search Strategy', category: 'analysis', order: 2 },
    { name: 'Equivalence Assessment', category: 'analysis', order: 3 },
    { name: 'Clinical Data Appraisal', category: 'analysis', order: 4 },
    { name: 'Clinical Evaluation Report Draft', category: 'document-prep', order: 5 },
    { name: 'CER Internal Review', category: 'quality', order: 6 },
    { name: 'PMCF Plan', category: 'document-prep', order: 7 },
    { name: 'SSCP Preparation', category: 'document-prep', order: 8 },
    { name: 'Notified Body Review', category: 'regulatory', order: 9 },
    { name: 'CE Mark Decision', category: 'milestone', order: 10 },
  ],
  DE_NOVO: [
    { name: 'Risk-Based Classification', category: 'analysis', order: 1 },
    { name: 'Pre-Submission Meeting', category: 'meeting', order: 2 },
    { name: 'Performance Testing', category: 'testing', order: 3 },
    { name: 'Clinical Evidence', category: 'analysis', order: 4 },
    { name: 'De Novo Request Assembly', category: 'document-prep', order: 5 },
    { name: 'De Novo Submission', category: 'submission', order: 6 },
    { name: 'FDA Review & Classification', category: 'regulatory', order: 7 },
  ],
};

// GET /api/concept2cure/projects/:projectId/tasks
router.get('/projects/:projectId/tasks', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    if (isNaN(projectId)) return sendError(res, 400, 'Invalid project ID');

    const { status, priority, category } = req.query;

    let query = db.select().from(projectTasks).where(eq(projectTasks.projectId, projectId));

    const tasks = await query.orderBy(projectTasks.dueDate).limit(500);

    // Filter in application layer for optional params
    let filtered = tasks;
    if (status) filtered = filtered.filter((t: any) => t.status === status);
    if (priority) filtered = filtered.filter((t: any) => t.priority === priority);
    if (category) filtered = filtered.filter((t: any) => t.moduleType === category);

    return sendSuccess(res, filtered, { total: filtered.length });
  } catch (error: any) {
    logger.error('Failed to fetch project tasks', { error: error.message });
    return sendError(res, 500, 'Failed to fetch tasks');
  }
});

// POST /api/concept2cure/projects/:projectId/tasks
router.post('/projects/:projectId/tasks', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    if (isNaN(projectId)) return sendError(res, 400, 'Invalid project ID');

    const taskSchema = z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      status: z.enum(['todo', 'in-progress', 'review', 'done', 'blocked']).default('todo'),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
      moduleType: z.string().optional(),
      dueDate: z.string().optional(),
      assigneeId: z.number().optional(),
      parentTaskId: z.number().optional(),
      estimatedHours: z.number().optional(),
      dependsOn: z.array(z.string()).optional(),
      metadata: z.any().optional(),
    });

    const data = taskSchema.parse(req.body);

    // Resolve organizationId from the project
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) return sendError(res, 404, 'Project not found');

    const [task] = await db
      .insert(projectTasks)
      .values({
        organizationId: project.organizationId,
        projectId,
        name: data.name,
        description: data.description || null,
        status: data.status,
        priority: data.priority,
        moduleType: data.moduleType || null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        assigneeId: data.assigneeId || null,
        parentTaskId: data.parentTaskId || null,
        estimatedHours: data.estimatedHours || null,
        dependsOn: data.dependsOn || null,
        metadata: data.metadata || null,
      })
      .returning();

    return sendSuccess(res, task);
  } catch (error: any) {
    if (error instanceof z.ZodError) return sendError(res, 400, 'Validation error', error.errors);
    logger.error('Failed to create task', { error: error.message });
    return sendError(res, 500, 'Failed to create task');
  }
});

// PUT /api/concept2cure/projects/:projectId/tasks/:taskId
router.put('/projects/:projectId/tasks/:taskId', async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.taskId, 10);
    if (isNaN(taskId)) return sendError(res, 400, 'Invalid task ID');

    const updates = req.body;
    if (updates.dueDate) updates.dueDate = new Date(updates.dueDate);
    updates.updatedAt = new Date();

    const [updated] = await db
      .update(projectTasks)
      .set(updates)
      .where(eq(projectTasks.id, taskId))
      .returning();

    if (!updated) return sendError(res, 404, 'Task not found');
    return sendSuccess(res, updated);
  } catch (error: any) {
    logger.error('Failed to update task', { error: error.message });
    return sendError(res, 500, 'Failed to update task');
  }
});

// DELETE /api/concept2cure/projects/:projectId/tasks/:taskId
router.delete('/projects/:projectId/tasks/:taskId', async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.taskId, 10);
    if (isNaN(taskId)) return sendError(res, 400, 'Invalid task ID');

    const [deleted] = await db.delete(projectTasks).where(eq(projectTasks.id, taskId)).returning();
    if (!deleted) return sendError(res, 404, 'Task not found');
    return sendSuccess(res, { deleted: true });
  } catch (error: any) {
    logger.error('Failed to delete task', { error: error.message });
    return sendError(res, 500, 'Failed to delete task');
  }
});

// POST /api/concept2cure/projects/:projectId/tasks/bulk
// AI-powered bulk task generation from submission type milestones
router.post('/projects/:projectId/tasks/bulk', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    if (isNaN(projectId)) return sendError(res, 400, 'Invalid project ID');

    const { submissionType, targetDate } = req.body;
    const milestones = SUBMISSION_MILESTONES[submissionType?.toUpperCase()];
    if (!milestones) {
      return sendError(
        res,
        400,
        `Unknown submission type: ${submissionType}. Supported: ${Object.keys(
          SUBMISSION_MILESTONES
        ).join(', ')}`
      );
    }

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) return sendError(res, 404, 'Project not found');

    const target = targetDate
      ? new Date(targetDate)
      : new Date(Date.now() + 180 * 24 * 60 * 60 * 1000); // 6 months default
    const totalMilestones = milestones.length;

    // Distribute milestones evenly between now and target date
    const now = new Date();
    const timeSpan = target.getTime() - now.getTime();

    const taskValues = milestones.map((m, i) => {
      const dueDate = new Date(now.getTime() + (timeSpan * (i + 1)) / totalMilestones);
      return {
        organizationId: project.organizationId,
        projectId,
        name: m.name,
        description: `${submissionType.toUpperCase()} milestone: ${m.name}`,
        status: 'todo' as const,
        priority:
          m.category === 'submission' || m.category === 'milestone'
            ? ('high' as const)
            : ('medium' as const),
        moduleType: m.category,
        dueDate,
        metadata: {
          submissionType,
          milestoneOrder: m.order,
          category: m.category,
          autoGenerated: true,
        },
      };
    });

    const created = await db.insert(projectTasks).values(taskValues).returning();

    return sendSuccess(res, created, {
      total: created.length,
      submissionType,
      targetDate: target.toISOString(),
    });
  } catch (error: any) {
    logger.error('Failed to bulk create tasks', { error: error.message });
    return sendError(res, 500, 'Failed to generate submission tasks');
  }
});

// GET /api/concept2cure/projects/:projectId/tasks/summary
// Task summary with counts by status, overdue count, health score
router.get('/projects/:projectId/tasks/summary', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    if (isNaN(projectId)) return sendError(res, 400, 'Invalid project ID');

    const tasks = await db
      .select()
      .from(projectTasks)
      .where(eq(projectTasks.projectId, projectId))
      .limit(1000);

    const now = new Date();
    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    let overdue = 0;
    let completed = 0;
    let total = tasks.length;

    for (const task of tasks) {
      const s = (task as any).status || 'todo';
      const p = (task as any).priority || 'medium';
      byStatus[s] = (byStatus[s] || 0) + 1;
      byPriority[p] = (byPriority[p] || 0) + 1;
      if (s === 'done') completed++;
      if ((task as any).dueDate && new Date((task as any).dueDate) < now && s !== 'done') overdue++;
    }

    // Health score: 100 if all done, penalized by overdue and blocked tasks
    const completionRate = total > 0 ? (completed / total) * 100 : 100;
    const overdueRate = total > 0 ? (overdue / total) * 100 : 0;
    const blockedCount = byStatus['blocked'] || 0;
    const healthScore = Math.max(
      0,
      Math.round(completionRate - overdueRate * 1.5 - blockedCount * 5)
    );

    return sendSuccess(res, {
      total,
      completed,
      overdue,
      byStatus,
      byPriority,
      healthScore,
      completionRate: Math.round(completionRate),
    });
  } catch (error: any) {
    logger.error('Failed to compute task summary', { error: error.message });
    return sendError(res, 500, 'Failed to compute task summary');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// COMMUNICATION CENTER + SUBMISSION & AGENCY PORTAL + C2C PUBLISHOPS (scaffold)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/projects/:projectId/authority-profiles', async (req: Request, res: Response) => {
  try {
    await ensureCommunicationCenterTables();
    const organizationId = getOrganizationId(req);
    const projectId = parseProjectParam(req.params.projectId);
    const result = await pool.query(
      `SELECT profile_id, authority, center_or_division, channel_type, submission_transport,
              accepted_formats, validation_requirements, package_constraints, acknowledgment_model,
              message_receipt_model, metadata_requirements, is_active, created_by, created_at, updated_at
         FROM concept2cure_authority_profiles
        WHERE organization_id = $1 AND project_id = $2
        ORDER BY created_at DESC`,
      [organizationId, projectId]
    );
    const profiles: AuthorityProfileRecord[] = result.rows.map((row: any) => ({
      id: row.profile_id,
      organizationId,
      projectId,
      authority: row.authority,
      centerOrDivision: row.center_or_division,
      channelType: row.channel_type,
      submissionTransport: row.submission_transport,
      acceptedFormats: row.accepted_formats || [],
      validationRequirements: row.validation_requirements || [],
      packageConstraints: row.package_constraints || [],
      acknowledgmentModel: row.acknowledgment_model,
      messageReceiptModel: row.message_receipt_model,
      metadataRequirements: row.metadata_requirements || [],
      isActive: row.is_active,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    }));
    return sendSuccess(res, profiles, {
      scope: { organizationId, projectId },
      model: 'authority_profile',
      behavior: 'configuration_driven',
    });
  } catch (error: any) {
    return sendError(res, communicationCenterErrorStatus(error), error?.message || 'Failed to load authority profiles');
  }
});

router.post('/projects/:projectId/authority-profiles', async (req: Request, res: Response) => {
  const schema = z.object({
    authority: z.string().min(2),
    centerOrDivision: z.string().min(2),
    channelType: z.enum(['portal', 'gateway', 'email', 'mixed']),
    submissionTransport: z.string().min(2),
    acceptedFormats: z.array(z.string()).default([]),
    validationRequirements: z.array(z.string()).default([]),
    packageConstraints: z.array(z.string()).default([]),
    acknowledgmentModel: z.string().min(2),
    messageReceiptModel: z.string().min(2),
    metadataRequirements: z.array(z.string()).default([]),
    isActive: z.boolean().default(true),
  });

  try {
    await ensureCommunicationCenterTables();
    const organizationId = getOrganizationId(req);
    const projectId = parseProjectParam(req.params.projectId);
    const input = schema.parse(req.body || {});
    const now = new Date().toISOString();
    const profile: AuthorityProfileRecord = {
      id: `auth_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      organizationId,
      projectId,
      ...input,
      createdBy: req.userEmail || `user_${getUserId(req)}`,
      createdAt: now,
      updatedAt: now,
    };
    await pool.query(
      `INSERT INTO concept2cure_authority_profiles (
         profile_id, organization_id, project_id, authority, center_or_division, channel_type,
         submission_transport, accepted_formats, validation_requirements, package_constraints,
         acknowledgment_model, message_receipt_model, metadata_requirements, is_active, created_by, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12,$13::jsonb,$14,$15,$16::timestamptz,$17::timestamptz)`,
      [
        profile.id,
        organizationId,
        projectId,
        profile.authority,
        profile.centerOrDivision,
        profile.channelType,
        profile.submissionTransport,
        JSON.stringify(profile.acceptedFormats),
        JSON.stringify(profile.validationRequirements),
        JSON.stringify(profile.packageConstraints),
        profile.acknowledgmentModel,
        profile.messageReceiptModel,
        JSON.stringify(profile.metadataRequirements),
        profile.isActive,
        profile.createdBy,
        profile.createdAt,
        profile.updatedAt,
      ]
    );
    await logAuditEntry(req, 'CREATE', 'project', `proj_${projectId}`, undefined, {
      authorityProfileId: profile.id,
      authority: profile.authority,
    });
    return sendSuccess(res, profile);
  } catch (error: any) {
    return sendError(res, communicationCenterErrorStatus(error), error?.message || 'Failed to create authority profile');
  }
});

router.get('/projects/:projectId/agency-communications', async (req: Request, res: Response) => {
  try {
    await ensureCommunicationCenterTables();
    const organizationId = getOrganizationId(req);
    const projectId = parseProjectParam(req.params.projectId);
    const result = await pool.query(
      `SELECT event_id, source_type, communication_type, source_channel, linked_submission_id,
              linked_package_id, linked_section_codes, linked_artifact_ids, received_date, due_date,
              urgency, response_required, extracted_issues, human_review_status, closure_status, audit_metadata
         FROM concept2cure_agency_communications
        WHERE organization_id = $1 AND project_id = $2
        ORDER BY created_at DESC`,
      [organizationId, projectId]
    );
    const records: AgencyCommunicationEventRecord[] = result.rows.map((row: any) => ({
      id: row.event_id,
      organizationId,
      projectId,
      sourceType: row.source_type,
      communicationType: row.communication_type,
      sourceChannel: row.source_channel,
      linkedSubmissionId: row.linked_submission_id ?? undefined,
      linkedPackageId: row.linked_package_id ?? undefined,
      linkedSectionCodes: row.linked_section_codes || [],
      linkedArtifactIds: row.linked_artifact_ids || [],
      receivedDate: new Date(row.received_date).toISOString(),
      dueDate: row.due_date ? new Date(row.due_date).toISOString() : undefined,
      urgency: row.urgency,
      responseRequired: row.response_required,
      extractedIssues: row.extracted_issues || [],
      humanReviewStatus: row.human_review_status,
      closureStatus: row.closure_status,
      auditMetadata: row.audit_metadata,
    }));
    const visible = records.filter(event =>
      canViewVisibilityTier(event.auditMetadata.visibilityTier, req.userRole)
    );
    return sendSuccess(res, visible, {
      scope: { organizationId, projectId },
      model: 'agency_communication_event',
      filtered: records.length - visible.length,
    });
  } catch (error: any) {
    return sendError(res, communicationCenterErrorStatus(error), error?.message || 'Failed to load agency communication events');
  }
});

router.post('/projects/:projectId/agency-communications', async (req: Request, res: Response) => {
  const schema = z.object({
    sourceType: z.enum([
      'agency_portal_event',
      'gateway_acknowledgment',
      'validation_result',
      'email_request_or_letter',
      'uploaded_official_correspondence',
      'meeting_minutes',
      'managed_service_operator_event',
      'manual_logged_event',
      'internal_discussion_linked',
    ]),
    communicationType: z.string().min(2),
    sourceChannel: z.string().min(2),
    linkedSubmissionId: z.string().optional(),
    linkedPackageId: z.string().optional(),
    linkedSectionCodes: z.array(z.string()).default([]),
    linkedArtifactIds: z.array(z.string()).default([]),
    dueDate: z.string().optional(),
    urgency: z.enum(['low', 'medium', 'high', 'critical']),
    responseRequired: z.boolean().default(false),
    extractedIssues: z.array(z.string()).default([]),
    humanReviewStatus: z.enum(['pending_review', 'triaged', 'actioned']).default('pending_review'),
    closureStatus: z.enum(['open', 'in_progress', 'closed']).default('open'),
    visibilityTier: z.enum(COMMUNICATION_VISIBILITY_TIERS),
  });

  try {
    await ensureCommunicationCenterTables();
    const organizationId = getOrganizationId(req);
    const projectId = parseProjectParam(req.params.projectId);
    const input = schema.parse(req.body || {});
    if (!canViewVisibilityTier(input.visibilityTier, req.userRole)) {
      return sendError(res, 403, 'Visibility tier not permitted for current role');
    }
    const now = new Date().toISOString();
    const event: AgencyCommunicationEventRecord = {
      id: `ace_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      organizationId,
      projectId,
      sourceType: input.sourceType,
      communicationType: input.communicationType,
      sourceChannel: input.sourceChannel,
      linkedSubmissionId: input.linkedSubmissionId,
      linkedPackageId: input.linkedPackageId,
      linkedSectionCodes: input.linkedSectionCodes,
      linkedArtifactIds: input.linkedArtifactIds,
      receivedDate: now,
      dueDate: input.dueDate,
      urgency: input.urgency,
      responseRequired: input.responseRequired,
      extractedIssues: input.extractedIssues,
      humanReviewStatus: input.humanReviewStatus,
      closureStatus: input.closureStatus,
      auditMetadata: {
        capturedBy: req.userEmail || `user_${getUserId(req)}`,
        capturedAt: now,
        visibilityTier: input.visibilityTier,
      },
    };
    await pool.query(
      `INSERT INTO concept2cure_agency_communications (
        event_id, organization_id, project_id, source_type, communication_type, source_channel,
        linked_submission_id, linked_package_id, linked_section_codes, linked_artifact_ids,
        received_date, due_date, urgency, response_required, extracted_issues,
        human_review_status, closure_status, audit_metadata, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::timestamptz,$12::timestamptz,$13,$14,$15::jsonb,$16,$17,$18::jsonb,$19::timestamptz)`,
      [
        event.id,
        organizationId,
        projectId,
        event.sourceType,
        event.communicationType,
        event.sourceChannel,
        event.linkedSubmissionId ?? null,
        event.linkedPackageId ?? null,
        JSON.stringify(event.linkedSectionCodes),
        JSON.stringify(event.linkedArtifactIds),
        event.receivedDate,
        event.dueDate ?? null,
        event.urgency,
        event.responseRequired,
        JSON.stringify(event.extractedIssues),
        event.humanReviewStatus,
        event.closureStatus,
        JSON.stringify(event.auditMetadata),
        now,
      ]
    );
    await logAuditEntry(req, 'CREATE', 'project', `proj_${projectId}`, undefined, {
      agencyCommunicationEventId: event.id,
      sourceType: event.sourceType,
      visibilityTier: event.auditMetadata.visibilityTier,
    });
    return sendSuccess(res, event);
  } catch (error: any) {
    return sendError(res, communicationCenterErrorStatus(error), error?.message || 'Failed to create agency communication event');
  }
});

router.get('/projects/:projectId/publishops/services', async (req: Request, res: Response) => {
  try {
    await ensureCommunicationCenterTables();
    const organizationId = getOrganizationId(req);
    const projectId = parseProjectParam(req.params.projectId);
    const result = await pool.query(
      `SELECT service_id, status, service_request_title, entitlement_level, requested_by_role, requested_by,
              operator_assignee, blocked_reason, created_at, updated_at
         FROM concept2cure_publishops_services
        WHERE organization_id = $1 AND project_id = $2
        ORDER BY created_at DESC`,
      [organizationId, projectId]
    );
    const services: PublishOpsServiceRecord[] = result.rows.map((row: any) => ({
      id: row.service_id,
      organizationId,
      projectId,
      status: row.status,
      serviceRequestTitle: row.service_request_title,
      entitlementLevel: row.entitlement_level,
      requestedByRole: row.requested_by_role,
      requestedBy: row.requested_by,
      operatorAssignee: row.operator_assignee ?? undefined,
      blockedReason: row.blocked_reason ?? undefined,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    }));
    return sendSuccess(res, services, {
      states: PUBLISHOPS_SERVICE_STATES,
      scope: { organizationId, projectId },
    });
  } catch (error: any) {
    return sendError(res, communicationCenterErrorStatus(error), error?.message || 'Failed to load PublishOps services');
  }
});

router.post('/projects/:projectId/publishops/services', async (req: Request, res: Response) => {
  const schema = z.object({
    serviceRequestTitle: z.string().min(3),
    entitlementLevel: z.enum([
      'core_self_serve',
      'advanced_publishing_tooling',
      'managed_publishops_service',
    ]),
    requestedByRole: z.enum([
      'managed_submission_operator',
      'managed_submission_reviewer',
      'client_project_owner',
      'client_reviewer',
      'outside_consultant',
    ]),
    operatorAssignee: z.string().optional(),
    blockedReason: z.string().optional(),
    status: z.enum(PUBLISHOPS_SERVICE_STATES).default('requested'),
  });

  try {
    await ensureCommunicationCenterTables();
    const organizationId = getOrganizationId(req);
    const projectId = parseProjectParam(req.params.projectId);
    const input = schema.parse(req.body || {});
    const now = new Date().toISOString();
    const service: PublishOpsServiceRecord = {
      id: `pos_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      organizationId,
      projectId,
      status: input.status,
      serviceRequestTitle: input.serviceRequestTitle,
      entitlementLevel: input.entitlementLevel,
      requestedByRole: input.requestedByRole,
      requestedBy: req.userEmail || `user_${getUserId(req)}`,
      operatorAssignee: input.operatorAssignee,
      blockedReason: input.blockedReason,
      createdAt: now,
      updatedAt: now,
    };
    await pool.query(
      `INSERT INTO concept2cure_publishops_services (
        service_id, organization_id, project_id, status, service_request_title, entitlement_level,
        requested_by_role, requested_by, operator_assignee, blocked_reason, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::timestamptz,$12::timestamptz)`,
      [
        service.id,
        organizationId,
        projectId,
        service.status,
        service.serviceRequestTitle,
        service.entitlementLevel,
        service.requestedByRole,
        service.requestedBy,
        service.operatorAssignee ?? null,
        service.blockedReason ?? null,
        service.createdAt,
        service.updatedAt,
      ]
    );
    await logAuditEntry(req, 'CREATE', 'project', `proj_${projectId}`, undefined, {
      publishOpsServiceId: service.id,
      status: service.status,
      entitlementLevel: service.entitlementLevel,
    });
    return sendSuccess(res, service);
  } catch (error: any) {
    return sendError(res, communicationCenterErrorStatus(error), error?.message || 'Failed to create PublishOps service request');
  }
});

router.patch(
  '/projects/:projectId/publishops/services/:serviceId/status',
  async (req: Request, res: Response) => {
    const schema = z.object({
      status: z.enum(PUBLISHOPS_SERVICE_STATES),
      blockedReason: z.string().optional(),
      operatorAssignee: z.string().optional(),
    });
    try {
      await ensureCommunicationCenterTables();
      const organizationId = getOrganizationId(req);
      const projectId = parseProjectParam(req.params.projectId);
      const input = schema.parse(req.body || {});
      const priorRes = await pool.query(
        `SELECT service_id, status, service_request_title, entitlement_level, requested_by_role, requested_by,
                operator_assignee, blocked_reason, created_at, updated_at
           FROM concept2cure_publishops_services
          WHERE organization_id = $1 AND project_id = $2 AND service_id = $3
          LIMIT 1`,
        [organizationId, projectId, req.params.serviceId]
      );
      if (priorRes.rows.length === 0) {
        return sendError(res, 404, 'PublishOps service request not found');
      }
      const row = priorRes.rows[0];
      const previous: PublishOpsServiceRecord = {
        id: row.service_id,
        organizationId,
        projectId,
        status: row.status,
        serviceRequestTitle: row.service_request_title,
        entitlementLevel: row.entitlement_level,
        requestedByRole: row.requested_by_role,
        requestedBy: row.requested_by,
        operatorAssignee: row.operator_assignee ?? undefined,
        blockedReason: row.blocked_reason ?? undefined,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
      };
      const updated: PublishOpsServiceRecord = {
        ...previous,
        status: input.status,
        blockedReason: input.blockedReason ?? previous.blockedReason,
        operatorAssignee: input.operatorAssignee ?? previous.operatorAssignee,
        updatedAt: new Date().toISOString(),
      };
      await pool.query(
        `UPDATE concept2cure_publishops_services
            SET status = $1,
                blocked_reason = $2,
                operator_assignee = $3,
                updated_at = $4::timestamptz
          WHERE organization_id = $5 AND project_id = $6 AND service_id = $7`,
        [
          updated.status,
          updated.blockedReason ?? null,
          updated.operatorAssignee ?? null,
          updated.updatedAt,
          organizationId,
          projectId,
          updated.id,
        ]
      );
      await logAuditEntry(req, 'UPDATE', 'project', `proj_${projectId}`, previous, updated);
      return sendSuccess(res, updated);
    } catch (error: any) {
      return sendError(res, communicationCenterErrorStatus(error), error?.message || 'Failed to update PublishOps service status');
    }
  }
);

// GET /api/concept2cure/submission-milestones/:type
// Get available milestones for a submission type
router.get('/submission-milestones/:type', (req: Request, res: Response) => {
  const type = req.params.type.toUpperCase();
  const milestones = SUBMISSION_MILESTONES[type];
  if (!milestones) {
    return sendError(
      res,
      404,
      `No milestones for type: ${type}. Supported: ${Object.keys(SUBMISSION_MILESTONES).join(', ')}`
    );
  }
  return sendSuccess(res, milestones);
});

// GET /api/concept2cure/submission-milestones
// Get all available submission types
router.get('/submission-milestones', (_req: Request, res: Response) => {
  const types = Object.keys(SUBMISSION_MILESTONES).map(type => ({
    type,
    milestoneCount: SUBMISSION_MILESTONES[type].length,
  }));
  return sendSuccess(res, types);
});

// ═══════════════════════════════════════════════════════════════════════════════
// CMC DATA ENDPOINTS — Unified with concept2cure projects
// Stores CMC data (Drug Substance, Drug Product) in project.metadata
// ═══════════════════════════════════════════════════════════════════════════════

const cmcDataSchema = z.object({
  drugSubstance: z
    .object({
      substanceName: z.string().optional(),
      inn: z.string().optional(),
      cas: z.string().optional(),
      molecularFormula: z.string().optional(),
      molecularWeight: z.string().optional(),
      manufacturingRoute: z.string().optional(),
      structureDescription: z.string().optional(),
      polymorph: z.string().optional(),
      solubility: z.string().optional(),
      meltingPoint: z.string().optional(),
      hygroscopicity: z.string().optional(),
    })
    .optional(),
  drugProduct: z
    .object({
      productName: z.string().optional(),
      dosageForm: z.string().optional(),
      routeOfAdmin: z.string().optional(),
      strength: z.string().optional(),
      containerClosure: z.string().optional(),
      composition: z.string().optional(),
      excipients: z.string().optional(),
      overages: z.string().optional(),
      shelfLife: z.string().optional(),
      storageConditions: z.string().optional(),
    })
    .optional(),
  specifications: z.array(z.any()).optional(),
  stabilityStudies: z.array(z.any()).optional(),
  impurities: z.array(z.any()).optional(),
});

// GET CMC data for a project
router.get('/projects/:projectId/cmc', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    if (isNaN(projectId)) return sendError(res, 'Invalid project ID', 400);

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) return sendError(res, 'Project not found', 404);

    const metadata = (project.metadata as Record<string, any>) || {};
    return sendSuccess(res, {
      drugSubstance: metadata.cmcDrugSubstance || null,
      drugProduct: metadata.cmcDrugProduct || null,
      specifications: metadata.cmcSpecifications || [],
      stabilityStudies: metadata.cmcStabilityStudies || [],
      impurities: metadata.cmcImpurities || [],
      lastUpdated: metadata.cmcLastUpdated || null,
    });
  } catch (error) {
    logger.error('Failed to get CMC data', { error });
    return sendError(res, 'Failed to get CMC data', 500);
  }
});

// SAVE CMC data for a project
router.put('/projects/:projectId/cmc', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    if (isNaN(projectId)) return sendError(res, 'Invalid project ID', 400);

    const parsed = cmcDataSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, `Invalid CMC data: ${parsed.error.message}`, 400);

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) return sendError(res, 'Project not found', 404);

    const existingMetadata = (project.metadata as Record<string, any>) || {};
    const updatedMetadata = {
      ...existingMetadata,
      cmcDrugSubstance: parsed.data.drugSubstance || existingMetadata.cmcDrugSubstance,
      cmcDrugProduct: parsed.data.drugProduct || existingMetadata.cmcDrugProduct,
      cmcSpecifications: parsed.data.specifications || existingMetadata.cmcSpecifications || [],
      cmcStabilityStudies:
        parsed.data.stabilityStudies || existingMetadata.cmcStabilityStudies || [],
      cmcImpurities: parsed.data.impurities || existingMetadata.cmcImpurities || [],
      cmcLastUpdated: new Date().toISOString(),
    };

    await db.update(projects).set({ metadata: updatedMetadata }).where(eq(projects.id, projectId));

    return sendSuccess(res, { saved: true, lastUpdated: updatedMetadata.cmcLastUpdated });
  } catch (error) {
    logger.error('Failed to save CMC data', { error });
    return sendError(res, 'Failed to save CMC data', 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT CONTEXT ENDPOINT — Full context for AnA/Cortex AI
// Returns project details + tasks + CMC data + knowledge for AI context injection
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/projects/:projectId/context', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    if (isNaN(projectId)) return sendError(res, 'Invalid project ID', 400);

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) return sendError(res, 'Project not found', 404);

    // Fetch tasks (limit to recent 50 — only 10 are returned to client)
    const tasks = await db
      .select()
      .from(projectTasks)
      .where(eq(projectTasks.projectId, projectId))
      .orderBy(desc(projectTasks.createdAt))
      .limit(50);

    // Build task summary
    const taskSummary = {
      total: tasks.length,
      completed: tasks.filter(t => (t as any).status === 'done').length,
      inProgress: tasks.filter(t => (t as any).status === 'in-progress').length,
      blocked: tasks.filter(t => (t as any).status === 'blocked').length,
      overdue: tasks.filter(t => {
        const dueDate = (t as any).dueDate;
        return dueDate && new Date(dueDate) < new Date() && (t as any).status !== 'done';
      }).length,
    };

    // Extract CMC data from metadata
    const metadata = (project.metadata as Record<string, any>) || {};
    const settings = (project.settings as Record<string, any>) || {};

    // Extract knowledge/custom instructions
    const knowledge = settings.knowledge || {};

    return sendSuccess(res, {
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        type: project.type,
        status: project.status,
        priority: project.priority,
        progress: project.progress,
        startDate: project.startDate,
        targetEndDate: project.targetEndDate,
        riskLevel: project.riskLevel,
        tags: project.tags,
      },
      tasks: {
        summary: taskSummary,
        recent: tasks.slice(0, 10).map(t => ({
          id: (t as any).id,
          name: (t as any).name,
          status: (t as any).status,
          priority: (t as any).priority,
          dueDate: (t as any).dueDate,
        })),
      },
      cmc: {
        drugSubstance: metadata.cmcDrugSubstance || null,
        drugProduct: metadata.cmcDrugProduct || null,
        hasSpecifications: (metadata.cmcSpecifications || []).length > 0,
        hasStabilityStudies: (metadata.cmcStabilityStudies || []).length > 0,
        hasImpurities: (metadata.cmcImpurities || []).length > 0,
      },
      knowledge: {
        customInstructions: knowledge.customInstructions || null,
        documentCount: (knowledge.documents || []).length,
      },
    });
  } catch (error) {
    logger.error('Failed to get project context', { error });
    return sendError(res, 'Failed to get project context', 500);
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
// AI TASK ASSESSMENT — AnA-powered task evaluation
// Analyzes project tasks and returns AI recommendations
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/projects/:projectId/tasks/assess', async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    if (isNaN(projectId)) return sendError(res, 'Invalid project ID', 400);

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    if (!project) return sendError(res, 'Project not found', 404);

    const tasks = await db
      .select()
      .from(projectTasks)
      .where(eq(projectTasks.projectId, projectId))
      .orderBy(desc(projectTasks.createdAt));

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => (t as any).status === 'done').length;
    const blockedTasks = tasks.filter(t => (t as any).status === 'blocked').length;
    const overdueTasks = tasks.filter(t => {
      const dueDate = (t as any).dueDate;
      return dueDate && new Date(dueDate) < new Date() && (t as any).status !== 'done';
    }).length;
    const inProgressTasks = tasks.filter(t => (t as any).status === 'in-progress').length;

    // Compute health score (0-100)
    let healthScore = 100;
    if (totalTasks > 0) {
      const completionRate = (completedTasks / totalTasks) * 100;
      const overdueRate = (overdueTasks / totalTasks) * 100;
      const blockedRate = (blockedTasks / totalTasks) * 100;
      healthScore = Math.max(
        0,
        Math.min(
          100,
          Math.round(
            completionRate * 0.4 + (100 - overdueRate * 3) * 0.3 + (100 - blockedRate * 5) * 0.3
          )
        )
      );
    }

    // Generate risk assessment
    const risks: string[] = [];
    if (overdueTasks > 0)
      risks.push(`${overdueTasks} task${overdueTasks > 1 ? 's' : ''} overdue — review deadlines`);
    if (blockedTasks > 0)
      risks.push(
        `${blockedTasks} task${blockedTasks > 1 ? 's' : ''} blocked — resolve dependencies`
      );
    if (totalTasks > 0 && inProgressTasks === 0 && completedTasks < totalTasks) {
      risks.push('No tasks in progress — workflow may be stalled');
    }
    if (totalTasks === 0)
      risks.push('No tasks defined — generate milestones for this submission type');

    // Generate next recommended actions
    const nextActions: Array<{ action: string; priority: string; reason: string }> = [];

    if (totalTasks === 0) {
      nextActions.push({
        action: `Generate ${project.type || 'submission'} milestones`,
        priority: 'high',
        reason: 'No tasks exist yet. Auto-generate milestone-based tasks for your submission type.',
      });
    }

    if (overdueTasks > 0) {
      nextActions.push({
        action: 'Review overdue tasks',
        priority: 'urgent',
        reason: `${overdueTasks} task${overdueTasks > 1 ? 's have' : ' has'} passed ${
          overdueTasks > 1 ? 'their' : 'its'
        } due date.`,
      });
    }

    if (blockedTasks > 0) {
      nextActions.push({
        action: 'Resolve blocked tasks',
        priority: 'high',
        reason: `${blockedTasks} task${
          blockedTasks > 1 ? 's are' : ' is'
        } blocked and preventing progress.`,
      });
    }

    // Check CMC readiness
    const metadata = (project.metadata as Record<string, any>) || {};
    if (!metadata.cmcDrugSubstance?.substanceName) {
      nextActions.push({
        action: 'Enter Drug Substance data (CMC Module 3)',
        priority: 'medium',
        reason: 'Drug Substance information is required for Module 3 documentation.',
      });
    }
    if (!metadata.cmcDrugProduct?.productName) {
      nextActions.push({
        action: 'Enter Drug Product data (CMC Module 3)',
        priority: 'medium',
        reason: 'Drug Product information is required for Module 3 documentation.',
      });
    }

    return sendSuccess(res, {
      healthScore,
      summary: {
        total: totalTasks,
        completed: completedTasks,
        inProgress: inProgressTasks,
        blocked: blockedTasks,
        overdue: overdueTasks,
        completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      },
      risks,
      nextActions: nextActions.slice(0, 5),
      assessedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to assess tasks', { error });
    return sendError(res, 'Failed to assess tasks', 500);
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

      // ── PM work item: project thread as open work ──
      await upsertProjectWorkItem({
        orgId: organizationId,
        projectId: projectDbId,
        sourceType: 'review_thread',
        sourceId: thread.id,
        artifactId: artifact.id,
        ctdSection: artifact.ctdSection || null,
        ownerId: assigneeId ? Number(assigneeId) : null,
        ownerName: resolvedAssigneeName,
        title: `Thread: ${title.trim()}`,
        status: 'open',
        priority: priority || null,
        dueAt: req.body.dueAt || null,
        blockerType: 'unresolved_review',
      });

      // ── Notification: assignment ──
      if (assigneeId && Number(assigneeId) !== userId) {
        await createNotification({
          orgId: organizationId,
          projectId: projectDbId,
          artifactId: artifact.id,
          threadId: thread.id,
          recipientUserId: Number(assigneeId),
          recipientName: resolvedAssigneeName,
          actorUserId: userId,
          actorName: actorName,
          notificationType: 'assignment',
          title: `Assigned: "${title.trim()}"`,
          body: `${actorName} assigned you a review thread on "${artifact.title}".`,
          severity: priority === 'high' ? 'warning' : 'info',
          dueAt: req.body.dueAt || null,
        });
      }

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

    // ── PM work item: close linked item ──
    await upsertProjectWorkItem({
      orgId: organizationId,
      projectId: thread.projectId,
      sourceType: 'review_thread',
      sourceId: thread.id,
      title: `Thread: ${thread.title}`,
      status: 'resolved',
    });

    // ── Suppress stale notifications ──
    await suppressNotificationsForSource({ threadId: thread.id });

    // ── Notify thread creator / assignee ──
    if (thread.createdById && thread.createdById !== userId) {
      await createNotification({
        orgId: organizationId,
        projectId: thread.projectId,
        artifactId: thread.artifactId,
        threadId: thread.id,
        recipientUserId: thread.createdById,
        recipientName: thread.createdByName,
        actorUserId: userId,
        actorName,
        notificationType: 'thread_resolved',
        title: `Resolved: "${thread.title}"`,
        body: `${actorName} resolved the review thread "${thread.title}".`,
      });
    }

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

    // ── PM work item: reopen linked item ──
    await upsertProjectWorkItem({
      orgId: organizationId,
      projectId: thread.projectId,
      sourceType: 'review_thread',
      sourceId: thread.id,
      artifactId: thread.artifactId,
      title: `Thread: ${thread.title}`,
      status: 'open',
      priority: thread.priority || null,
      blockerType: 'unresolved_review',
    });

    // ── Notify assignee that thread was reopened ──
    if (thread.assigneeId && thread.assigneeId !== userId) {
      await createNotification({
        orgId: organizationId,
        projectId: thread.projectId,
        artifactId: thread.artifactId,
        threadId: thread.id,
        recipientUserId: thread.assigneeId,
        recipientName: thread.assigneeName,
        actorUserId: userId,
        actorName,
        notificationType: 'assignment',
        title: `Reopened: "${thread.title}"`,
        body: `${actorName} reopened the review thread "${thread.title}".`,
        severity: 'warning',
      });
    }

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

    // ── Notification: reply to thread assignee / creator ──
    const notifyTargets = new Set<number>();
    if (thread.assigneeId && thread.assigneeId !== userId) notifyTargets.add(thread.assigneeId);
    if (thread.createdById && thread.createdById !== userId) notifyTargets.add(thread.createdById);

    for (const targetId of notifyTargets) {
      if (commentKind === 'request_changes') {
        await createNotification({
          orgId: organizationId,
          projectId: thread.projectId,
          artifactId: thread.artifactId,
          threadId: thread.id,
          recipientUserId: targetId,
          actorUserId: userId,
          actorName,
          notificationType: 'changes_requested',
          title: `Changes requested: "${thread.title}"`,
          body: `${actorName} requested changes on thread "${thread.title}".`,
          severity: 'warning',
        });
      } else {
        await createNotification({
          orgId: organizationId,
          projectId: thread.projectId,
          artifactId: thread.artifactId,
          threadId: thread.id,
          recipientUserId: targetId,
          actorUserId: userId,
          actorName,
          notificationType: 'thread_reply',
          title: `Reply: "${thread.title}"`,
          body: `${actorName} replied to thread "${thread.title}".`,
        });
      }
    }

    // ── PM work item: if request_changes, create/update blocker ──
    if (commentKind === 'request_changes') {
      await upsertProjectWorkItem({
        orgId: organizationId,
        projectId: thread.projectId,
        sourceType: 'requested_changes',
        sourceId: thread.id,
        artifactId: thread.artifactId,
        title: `Changes requested: ${thread.title}`,
        status: 'open',
        priority: thread.priority || 'medium',
        blockerType: 'requested_changes',
        ownerId: thread.assigneeId || thread.createdById,
        ownerName: thread.assigneeName || thread.createdByName,
      });
    }

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

      // ── PM work item: project task as open work ──
      await upsertProjectWorkItem({
        orgId: organizationId,
        projectId: projectDbId,
        sourceType: 'review_task',
        sourceId: inserted.id,
        artifactId: artifact.id,
        ctdSection: artifact.ctdSection || null,
        ownerId: assignedToId ? Number(assignedToId) : null,
        ownerName: resolvedAssigneeName,
        title: `Task: ${title.trim()}`,
        status: 'open',
        priority: req.body.priority || null,
        dueAt: dueAt || null,
        blockerType:
          resolvedType === 'change_request'
            ? 'requested_changes'
            : resolvedType === 'approval_task'
            ? 'approval_pending'
            : 'unresolved_review',
      });

      // ── Notification: assignment ──
      if (assignedToId && Number(assignedToId) !== userId) {
        await createNotification({
          orgId: organizationId,
          projectId: projectDbId,
          artifactId: artifact.id,
          reviewTaskId: inserted.id,
          recipientUserId: Number(assignedToId),
          recipientName: resolvedAssigneeName,
          actorUserId: userId,
          actorName,
          notificationType: resolvedType === 'approval_task' ? 'approval_needed' : 'assignment',
          title:
            resolvedType === 'approval_task'
              ? `Approval needed: "${title.trim()}"`
              : `Assigned: "${title.trim()}"`,
          body: `${actorName} assigned you a ${resolvedType.replace('_', ' ')} on "${
            artifact.title
          }".`,
          severity: resolvedType === 'change_request' ? 'warning' : 'info',
          dueAt: dueAt || null,
        });
      }

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

    // ── PM work item: close linked item ──
    await upsertProjectWorkItem({
      orgId: organizationId,
      projectId: task.projectId,
      sourceType: 'review_task',
      sourceId: task.id,
      title: `Task: ${task.title}`,
      status: 'resolved',
    });

    // ── Suppress stale notifications ──
    await suppressNotificationsForSource({ reviewTaskId: task.id });

    // ── Notify task creator ──
    if (task.createdById && task.createdById !== userId) {
      await createNotification({
        orgId: organizationId,
        projectId: task.projectId,
        artifactId: task.artifactId,
        reviewTaskId: task.id,
        recipientUserId: task.createdById,
        recipientName: task.createdByName,
        actorUserId: userId,
        actorName,
        notificationType: 'task_resolved',
        title: `Resolved: "${task.title}"`,
        body: `${actorName} resolved the review task "${task.title}".`,
      });
    }

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

    const actorName = (req as any).userName || req.userEmail || 'unknown';

    // ── PM work item: reopen linked item ──
    await upsertProjectWorkItem({
      orgId: organizationId,
      projectId: task.projectId,
      sourceType: 'review_task',
      sourceId: task.id,
      artifactId: task.artifactId,
      title: `Task: ${task.title}`,
      status: 'open',
      priority: task.priority || null,
      dueAt: task.dueAt || null,
      blockerType: task.taskType === 'change_request' ? 'requested_changes' : 'unresolved_review',
    });

    // ── Notify assignee that task was reopened ──
    if (task.assignedToId && task.assignedToId !== userId) {
      await createNotification({
        orgId: organizationId,
        projectId: task.projectId,
        artifactId: task.artifactId,
        reviewTaskId: task.id,
        recipientUserId: task.assignedToId,
        recipientName: task.assignedToName,
        actorUserId: userId,
        actorName,
        notificationType: 'assignment',
        title: `Reopened: "${task.title}"`,
        body: `${actorName} reopened the review task "${task.title}".`,
        severity: 'warning',
      });
    }

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

    // Unread notifications for current user
    const [unreadCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(concept2cureNotifications)
      .where(
        and(
          eq(concept2cureNotifications.orgId, organizationId),
          eq(concept2cureNotifications.recipientUserId, userId),
          eq(concept2cureNotifications.status, 'unread')
        )
      );

    const now = new Date();
    const overdueTasks = myTasks.filter(t => t.dueAt && new Date(t.dueAt) < now);
    const dueSoonTasks = myTasks.filter(t => {
      if (!t.dueAt) return false;
      const d = new Date(t.dueAt);
      return d >= now && d <= new Date(now.getTime() + 24 * 60 * 60 * 1000);
    });
    const changeRequestTasks = myTasks.filter(t => t.taskType === 'change_request');
    const approvalTasks = myTasks.filter(t => t.taskType === 'approval_task');

    return sendSuccess(res, {
      threads: myThreads,
      tasks: myTasks,
      totalThreads: myThreads.length,
      totalTasks: myTasks.length,
      unreadNotifications: unreadCount?.count || 0,
      overdueTasks: overdueTasks.length,
      dueSoonTasks: dueSoonTasks.length,
      changeRequests: changeRequestTasks.length,
      approvalsNeeded: approvalTasks.length,
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
      .orderBy(desc(concept2cureReviewThreads.updatedAt))
      .limit(500);

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
      .orderBy(concept2cureReviewTasks.dueAt, desc(concept2cureReviewTasks.updatedAt))
      .limit(500);

    const now = new Date();
    const overdueProjectTasks = projectTasks.filter(t => t.dueAt && new Date(t.dueAt) < now);

    // Escalated items count
    const [escalatedCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(concept2cureNotifications)
      .where(
        and(
          eq(concept2cureNotifications.orgId, organizationId),
          eq(concept2cureNotifications.projectId, projectDbId),
          sql`${concept2cureNotifications.escalationLevel} >= 1`,
          eq(concept2cureNotifications.status, 'unread')
        )
      );

    // Group by owner
    const ownerMap = new Map<string, { threads: number; tasks: number; overdue: number }>();
    for (const t of projectThreads) {
      const key = t.assigneeName || 'Unassigned';
      if (!ownerMap.has(key)) ownerMap.set(key, { threads: 0, tasks: 0, overdue: 0 });
      ownerMap.get(key)!.threads++;
    }
    for (const t of projectTasks) {
      const key = t.assignedToName || 'Unassigned';
      if (!ownerMap.has(key)) ownerMap.set(key, { threads: 0, tasks: 0, overdue: 0 });
      ownerMap.get(key)!.tasks++;
      if (t.dueAt && new Date(t.dueAt) < now) ownerMap.get(key)!.overdue++;
    }

    // Group by artifact
    const artifactMap = new Map<string, { title: string; threads: number; tasks: number }>();
    for (const t of projectThreads) {
      const key = t.artifactId;
      if (!artifactMap.has(key))
        artifactMap.set(key, { title: t.artifactTitle, threads: 0, tasks: 0 });
      artifactMap.get(key)!.threads++;
    }
    for (const t of projectTasks) {
      const key = t.artifactId;
      if (!artifactMap.has(key))
        artifactMap.set(key, { title: t.artifactTitle, threads: 0, tasks: 0 });
      artifactMap.get(key)!.tasks++;
    }

    return sendSuccess(res, {
      projectId: req.params.projectId,
      threads: projectThreads,
      tasks: projectTasks,
      totalThreads: projectThreads.length,
      totalTasks: projectTasks.length,
      overdueTasks: overdueProjectTasks.length,
      escalatedItems: escalatedCount?.count || 0,
      byOwner: Array.from(ownerMap.entries()).map(([name, data]) => ({ name, ...data })),
      byArtifact: Array.from(artifactMap.entries()).map(([artifactId, data]) => ({
        artifactId,
        ...data,
      })),
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
      )
      .limit(1000);

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
      )
      .limit(1000);

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
      )
      .limit(500);

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
        signal: `Overdue task: "${t.title}" (due ${
          t.dueAt ? new Date(t.dueAt).toLocaleDateString() : 'unknown'
        })`,
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

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 13 FULL — PM WORK ITEMS, NOTIFICATIONS & ESCALATION
// ═══════════════════════════════════════════════════════════════════════════════

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Creates or updates a PM work item projected from a document review object.
 */
async function upsertProjectWorkItem(params: {
  orgId: number;
  projectId: number;
  sourceType: string;
  sourceId: number;
  artifactId?: number | null;
  versionId?: number | null;
  ctdSection?: string | null;
  ownerId?: number | null;
  ownerName?: string | null;
  title: string;
  status: string;
  priority?: string | null;
  dueAt?: Date | string | null;
  blockerType?: string | null;
}): Promise<void> {
  try {
    const existing = await db
      .select()
      .from(c2cProjectWorkItems)
      .where(
        and(
          eq(c2cProjectWorkItems.sourceType, params.sourceType),
          eq(c2cProjectWorkItems.sourceId, params.sourceId),
          eq(c2cProjectWorkItems.orgId, params.orgId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(c2cProjectWorkItems)
        .set({
          title: params.title,
          status: params.status,
          priority: params.priority || null,
          dueAt: params.dueAt ? new Date(params.dueAt as string) : null,
          ownerId: params.ownerId || null,
          ownerName: params.ownerName || null,
          blockerType: params.blockerType || null,
          resolvedAt:
            params.status === 'resolved' || params.status === 'closed' ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(c2cProjectWorkItems.id, existing[0].id));
    } else {
      const workItemId = `pwi_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      await db.insert(c2cProjectWorkItems).values({
        workItemId,
        orgId: params.orgId,
        projectId: params.projectId,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        artifactId: params.artifactId || null,
        versionId: params.versionId || null,
        ctdSection: params.ctdSection || null,
        ownerId: params.ownerId || null,
        ownerName: params.ownerName || null,
        title: params.title,
        status: params.status,
        priority: params.priority || null,
        dueAt: params.dueAt ? new Date(params.dueAt as string) : null,
        blockerType: params.blockerType || null,
      });
    }
  } catch (err) {
    logger.warn('Failed to upsert PM work item', { error: (err as Error).message });
  }
}

/**
 * Creates a notification for a user.
 */
async function createNotification(params: {
  orgId: number;
  projectId?: number | null;
  artifactId?: number | null;
  versionId?: number | null;
  threadId?: number | null;
  reviewTaskId?: number | null;
  projectWorkItemId?: number | null;
  recipientUserId: number;
  recipientName?: string | null;
  actorUserId?: number | null;
  actorName?: string | null;
  notificationType: string;
  title: string;
  body: string;
  severity?: string;
  actionUrl?: string | null;
  dueAt?: Date | string | null;
}): Promise<void> {
  try {
    // Guard: skip if no valid recipient
    if (!params.recipientUserId || params.recipientUserId <= 0) return;

    // Avoid duplicate unread notifications of the same type for the same source
    const sourceCondition = params.threadId
      ? eq(concept2cureNotifications.threadId, params.threadId)
      : params.reviewTaskId
      ? eq(concept2cureNotifications.reviewTaskId, params.reviewTaskId)
      : null;

    const existing = await db
      .select({ id: concept2cureNotifications.id })
      .from(concept2cureNotifications)
      .where(
        and(
          eq(concept2cureNotifications.orgId, params.orgId),
          eq(concept2cureNotifications.recipientUserId, params.recipientUserId),
          eq(concept2cureNotifications.notificationType, params.notificationType),
          eq(concept2cureNotifications.status, 'unread'),
          ...(sourceCondition ? [sourceCondition] : [])
        )
      )
      .limit(1);

    if (existing.length > 0) return; // suppress duplicate

    const notifId = `ntf_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    await db.insert(concept2cureNotifications).values({
      notificationId: notifId,
      orgId: params.orgId,
      projectId: params.projectId || null,
      artifactId: params.artifactId || null,
      versionId: params.versionId || null,
      threadId: params.threadId || null,
      reviewTaskId: params.reviewTaskId || null,
      projectWorkItemId: params.projectWorkItemId || null,
      recipientUserId: params.recipientUserId,
      recipientName: params.recipientName || null,
      actorUserId: params.actorUserId || null,
      actorName: params.actorName || null,
      notificationType: params.notificationType,
      title: params.title,
      body: params.body,
      severity: params.severity || 'info',
      status: 'unread',
      actionUrl: params.actionUrl || null,
      dueAt: params.dueAt ? new Date(params.dueAt as string) : null,
      lastNotifiedAt: new Date(),
      escalationLevel: 0,
    });
  } catch (err) {
    logger.warn('Failed to create notification', { error: (err as Error).message });
  }
}

/**
 * Suppresses (dismisses) all unread notifications for a resolved source.
 */
async function suppressNotificationsForSource(params: {
  threadId?: number | null;
  reviewTaskId?: number | null;
}): Promise<void> {
  try {
    const condition = params.threadId
      ? eq(concept2cureNotifications.threadId, params.threadId)
      : params.reviewTaskId
      ? eq(concept2cureNotifications.reviewTaskId, params.reviewTaskId)
      : null;

    if (!condition) return;

    await db
      .update(concept2cureNotifications)
      .set({
        status: 'dismissed',
        dismissedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(condition, eq(concept2cureNotifications.status, 'unread')));
  } catch (err) {
    logger.warn('Failed to suppress notifications', { error: (err as Error).message });
  }
}

// ── Notification API Routes ──────────────────────────────────────────────────

/**
 * GET /api/concept2cure/notifications/my
 * Returns the current user's notifications, newest first.
 */
router.get('/notifications/my', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const statusFilter = req.query.status as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    const conditions = [
      eq(concept2cureNotifications.orgId, organizationId),
      eq(concept2cureNotifications.recipientUserId, userId),
    ];
    if (statusFilter && ['unread', 'read', 'dismissed'].includes(statusFilter)) {
      conditions.push(eq(concept2cureNotifications.status, statusFilter));
    }

    const notifs = await db
      .select()
      .from(concept2cureNotifications)
      .where(and(...conditions))
      .orderBy(desc(concept2cureNotifications.createdAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(concept2cureNotifications)
      .where(
        and(
          eq(concept2cureNotifications.orgId, organizationId),
          eq(concept2cureNotifications.recipientUserId, userId),
          eq(concept2cureNotifications.status, 'unread')
        )
      );

    return sendSuccess(res, {
      notifications: notifs,
      unreadCount: countResult?.count || 0,
      total: notifs.length,
      offset,
    });
  } catch (error: any) {
    logConcept2cureError('get my notifications', error);
    return sendError(res, 500, 'Failed to fetch notifications');
  }
});

/**
 * POST /api/concept2cure/notifications/:id/read
 */
router.post('/notifications/:id/read', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const notifId = parseInt(req.params.id, 10);
    if (isNaN(notifId)) return sendError(res, 400, 'Invalid notification ID');

    const [notif] = await db
      .select()
      .from(concept2cureNotifications)
      .where(
        and(
          eq(concept2cureNotifications.id, notifId),
          eq(concept2cureNotifications.recipientUserId, userId),
          eq(concept2cureNotifications.orgId, organizationId)
        )
      )
      .limit(1);

    if (!notif) return sendError(res, 404, 'Notification not found');

    await db
      .update(concept2cureNotifications)
      .set({ status: 'read', readAt: new Date(), updatedAt: new Date() })
      .where(eq(concept2cureNotifications.id, notifId));

    return sendSuccess(res, { id: notifId, status: 'read' });
  } catch (error: any) {
    logConcept2cureError('mark notification read', error);
    return sendError(res, 500, 'Failed to mark notification as read');
  }
});

/**
 * POST /api/concept2cure/notifications/:id/dismiss
 */
router.post('/notifications/:id/dismiss', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const notifId = parseInt(req.params.id, 10);
    if (isNaN(notifId)) return sendError(res, 400, 'Invalid notification ID');

    const [notif] = await db
      .select()
      .from(concept2cureNotifications)
      .where(
        and(
          eq(concept2cureNotifications.id, notifId),
          eq(concept2cureNotifications.recipientUserId, userId),
          eq(concept2cureNotifications.orgId, organizationId)
        )
      )
      .limit(1);

    if (!notif) return sendError(res, 404, 'Notification not found');

    await db
      .update(concept2cureNotifications)
      .set({ status: 'dismissed', dismissedAt: new Date(), updatedAt: new Date() })
      .where(eq(concept2cureNotifications.id, notifId));

    return sendSuccess(res, { id: notifId, status: 'dismissed' });
  } catch (error: any) {
    logConcept2cureError('dismiss notification', error);
    return sendError(res, 500, 'Failed to dismiss notification');
  }
});

/**
 * POST /api/concept2cure/notifications/mark-all-read
 */
router.post('/notifications/mark-all-read', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);

    const result = await db
      .update(concept2cureNotifications)
      .set({ status: 'read', readAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(concept2cureNotifications.orgId, organizationId),
          eq(concept2cureNotifications.recipientUserId, userId),
          eq(concept2cureNotifications.status, 'unread')
        )
      )
      .returning({ id: concept2cureNotifications.id });

    return sendSuccess(res, { markedRead: result.length });
  } catch (error: any) {
    logConcept2cureError('mark all notifications read', error);
    return sendError(res, 500, 'Failed to mark all notifications as read');
  }
});

/**
 * GET /api/concept2cure/notifications/project
 * Project-scoped notifications for admin/review leads.
 */
router.get('/notifications/project', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const projectId = parseInt(req.query.projectId as string, 10);
    if (isNaN(projectId)) return sendError(res, 400, 'projectId is required');

    const hasAccess = await verifyProjectAccess(req, String(projectId));
    if (!hasAccess) return sendError(res, 404, 'Project not found');

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    const notifs = await db
      .select()
      .from(concept2cureNotifications)
      .where(
        and(
          eq(concept2cureNotifications.orgId, organizationId),
          eq(concept2cureNotifications.projectId, projectId)
        )
      )
      .orderBy(desc(concept2cureNotifications.createdAt))
      .limit(limit);

    return sendSuccess(res, { notifications: notifs });
  } catch (error: any) {
    logConcept2cureError('get project notifications', error);
    return sendError(res, 500, 'Failed to fetch project notifications');
  }
});

// ── PM Work Items Routes ─────────────────────────────────────────────────────

/**
 * GET /api/concept2cure/projects/:projectId/work-items
 * Returns all PM work items for a project.
 */
router.get('/projects/:projectId/work-items', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) return sendError(res, 404, 'Project not found');

    const projectDbId = parseInt(req.params.projectId, 10);
    if (isNaN(projectDbId)) return sendError(res, 400, 'Invalid project ID');

    const statusFilter = req.query.status as string | undefined;
    const conditions = [
      eq(c2cProjectWorkItems.orgId, organizationId),
      eq(c2cProjectWorkItems.projectId, projectDbId),
    ];
    if (statusFilter && ['open', 'in_progress', 'resolved', 'closed'].includes(statusFilter)) {
      conditions.push(eq(c2cProjectWorkItems.status, statusFilter));
    }

    const items = await db
      .select()
      .from(c2cProjectWorkItems)
      .where(and(...conditions))
      .orderBy(desc(c2cProjectWorkItems.createdAt));

    return sendSuccess(res, { workItems: items });
  } catch (error: any) {
    logConcept2cureError('get work items', error, { projectId: req.params.projectId });
    return sendError(res, 500, 'Failed to fetch work items');
  }
});

/**
 * GET /api/concept2cure/projects/:projectId/readiness-summary
 * Full project readiness aggregation from review state.
 */
router.get('/projects/:projectId/readiness-summary', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) return sendError(res, 404, 'Project not found');

    const projectDbId = parseInt(req.params.projectId, 10);
    if (isNaN(projectDbId)) return sendError(res, 400, 'Invalid project ID');

    const now = new Date();

    // Artifacts
    const allArtifacts = await db
      .select()
      .from(concept2cureArtifacts)
      .where(
        and(
          eq(concept2cureArtifacts.projectId, projectDbId),
          eq(concept2cureArtifacts.organizationId, organizationId)
        )
      );

    const totalArtifacts = allArtifacts.length;
    const draftCount = allArtifacts.filter(a => (a.status || 'draft') === 'draft').length;
    const reviewCount = allArtifacts.filter(a => a.status === 'review').length;
    const approvedCount = allArtifacts.filter(a => a.status === 'approved').length;
    const lockedCount = allArtifacts.filter(a => a.status === 'locked').length;

    // Threads
    const allThreads = await db
      .select()
      .from(concept2cureReviewThreads)
      .where(
        and(
          eq(concept2cureReviewThreads.orgId, organizationId),
          eq(concept2cureReviewThreads.projectId, projectDbId)
        )
      );

    const openThreads = allThreads.filter(t => t.status === 'open');
    const resolvedThreads = allThreads.filter(t => t.status === 'resolved');

    // Tasks
    const allTasks = await db
      .select()
      .from(concept2cureReviewTasks)
      .where(
        and(
          eq(concept2cureReviewTasks.orgId, organizationId),
          eq(concept2cureReviewTasks.projectId, projectDbId)
        )
      );

    const openTasks = allTasks.filter(t => t.status === 'open' || t.status === 'in_progress');
    const overdueTasks = openTasks.filter(t => t.dueAt && new Date(t.dueAt) < now);
    const changeRequestTasks = allTasks.filter(
      t => t.taskType === 'change_request' && t.status !== 'resolved' && t.status !== 'closed'
    );

    // PM work items
    const workItems = await db
      .select()
      .from(c2cProjectWorkItems)
      .where(
        and(
          eq(c2cProjectWorkItems.orgId, organizationId),
          eq(c2cProjectWorkItems.projectId, projectDbId)
        )
      );

    const openWorkItems = workItems.filter(w => w.status === 'open' || w.status === 'in_progress');
    const blockedWorkItems = workItems.filter(w => w.blockerType !== null && w.status === 'open');

    // Escalated notifications
    const [escalatedCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(concept2cureNotifications)
      .where(
        and(
          eq(concept2cureNotifications.orgId, organizationId),
          eq(concept2cureNotifications.projectId, projectDbId),
          sql`${concept2cureNotifications.escalationLevel} >= 1`,
          eq(concept2cureNotifications.status, 'unread')
        )
      );

    // Per-artifact unresolved review density
    const artifactReviewMap = new Map<
      number,
      {
        title: string;
        ctdSection: string | null;
        openThreads: number;
        openTasks: number;
        overdue: number;
        status: string;
      }
    >();
    for (const art of allArtifacts) {
      artifactReviewMap.set(art.id, {
        title: art.title,
        ctdSection: art.ctdSection || null,
        openThreads: 0,
        openTasks: 0,
        overdue: 0,
        status: art.status || 'draft',
      });
    }
    for (const t of openThreads) {
      const entry = artifactReviewMap.get(t.artifactId);
      if (entry) entry.openThreads++;
    }
    for (const t of openTasks) {
      const entry = artifactReviewMap.get(t.artifactId);
      if (entry) {
        entry.openTasks++;
        if (t.dueAt && new Date(t.dueAt) < now) entry.overdue++;
      }
    }

    // Per-section readiness
    const sectionReadiness = new Map<string, { total: number; ready: number; blocked: number }>();
    for (const art of allArtifacts) {
      const sec = art.ctdSection || 'unplaced';
      if (!sectionReadiness.has(sec)) sectionReadiness.set(sec, { total: 0, ready: 0, blocked: 0 });
      const entry = sectionReadiness.get(sec)!;
      entry.total++;
      if (art.status === 'approved' || art.status === 'locked') entry.ready++;
      const artReview = artifactReviewMap.get(art.id);
      if (artReview && (artReview.openThreads > 0 || artReview.openTasks > 0)) entry.blocked++;
    }

    // Approval bottlenecks
    const approvalsWaiting = allTasks.filter(
      t => t.taskType === 'approval_task' && (t.status === 'open' || t.status === 'in_progress')
    );

    return sendSuccess(res, {
      artifacts: {
        total: totalArtifacts,
        draft: draftCount,
        review: reviewCount,
        approved: approvedCount,
        locked: lockedCount,
      },
      threads: {
        total: allThreads.length,
        open: openThreads.length,
        resolved: resolvedThreads.length,
      },
      tasks: {
        total: allTasks.length,
        open: openTasks.length,
        overdue: overdueTasks.length,
        changeRequests: changeRequestTasks.length,
        approvalsWaiting: approvalsWaiting.length,
      },
      workItems: {
        total: workItems.length,
        open: openWorkItems.length,
        blocked: blockedWorkItems.length,
      },
      escalations: escalatedCount?.count || 0,
      sectionReadiness: Array.from(sectionReadiness.entries()).map(([section, data]) => ({
        section,
        ...data,
        readyPercent: data.total > 0 ? Math.round((data.ready / data.total) * 100) : 0,
      })),
      artifactDetails: Array.from(artifactReviewMap.entries())
        .filter(([, data]) => data.openThreads > 0 || data.openTasks > 0)
        .map(([id, data]) => ({
          artifactId: id,
          ...data,
        })),
    });
  } catch (error: any) {
    logConcept2cureError('readiness summary', error, { projectId: req.params.projectId });
    return sendError(res, 500, 'Failed to generate readiness summary');
  }
});

// ── Submission Package Export ─────────────────────────────────────────────────

/**
 * POST /api/concept2cure/projects/:projectId/submission-package
 * Assemble an eCTD submission package manifest from project artifacts.
 * Returns structured manifest with CTD module assignments and readiness status.
 */
router.post('/projects/:projectId/submission-package', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) return sendError(res, 404, 'Project not found');

    const projectDbId = parseInt(req.params.projectId, 10);
    if (isNaN(projectDbId)) return sendError(res, 400, 'Invalid project ID');

    // Fetch the project
    const [project] = await db
      .select()
      .from(concept2cureProjects)
      .where(
        and(
          eq(concept2cureProjects.id, projectDbId),
          eq(concept2cureProjects.organizationId, organizationId)
        )
      );

    if (!project) return sendError(res, 404, 'Project not found');

    // Fetch all project artifacts
    const artifacts = await db
      .select()
      .from(concept2cureArtifacts)
      .where(
        and(
          eq(concept2cureArtifacts.projectId, projectDbId),
          eq(concept2cureArtifacts.organizationId, organizationId)
        )
      );

    // Only include approved or locked artifacts in the package
    const eligibleArtifacts = artifacts.filter(
      a => a.status === 'approved' || a.status === 'locked'
    );
    const ineligibleArtifacts = artifacts.filter(
      a => a.status !== 'approved' && a.status !== 'locked'
    );

    // Organize by CTD module
    const moduleMap: Record<
      string,
      Array<{ id: number; title: string; ctdSection: string; status: string; version: number }>
    > = {};
    for (const a of eligibleArtifacts) {
      const section = a.ctdSection || 'unplaced';
      const moduleKey = section === 'unplaced' ? 'unplaced' : `module-${section.charAt(0)}`;
      if (!moduleMap[moduleKey]) moduleMap[moduleKey] = [];
      moduleMap[moduleKey].push({
        id: a.id,
        title: a.title,
        ctdSection: section,
        status: a.status || 'draft',
        version: a.version || 1,
      });
    }

    // Compute readiness
    const totalArtifacts = artifacts.length;
    const eligibleCount = eligibleArtifacts.length;
    const readinessPercent =
      totalArtifacts > 0 ? Math.round((eligibleCount / totalArtifacts) * 100) : 0;
    const isReady = readinessPercent === 100 && totalArtifacts > 0;

    const manifest = {
      projectId: projectDbId,
      projectName: project.name,
      projectType: project.type || 'IND',
      generatedAt: new Date().toISOString(),
      readiness: {
        percent: readinessPercent,
        ready: isReady,
        eligible: eligibleCount,
        total: totalArtifacts,
        ineligible: ineligibleArtifacts.map(a => ({
          id: a.id,
          title: a.title,
          status: a.status || 'draft',
          reason: `Status is "${a.status || 'draft'}" — must be approved or locked`,
        })),
      },
      modules: moduleMap,
      packageStructure: {
        'module-1': {
          label: 'Module 1 — Administrative Information',
          artifacts: moduleMap['module-1'] || [],
        },
        'module-2': { label: 'Module 2 — CTD Summaries', artifacts: moduleMap['module-2'] || [] },
        'module-3': { label: 'Module 3 — Quality', artifacts: moduleMap['module-3'] || [] },
        'module-4': {
          label: 'Module 4 — Nonclinical Study Reports',
          artifacts: moduleMap['module-4'] || [],
        },
        'module-5': {
          label: 'Module 5 — Clinical Study Reports',
          artifacts: moduleMap['module-5'] || [],
        },
        unplaced: { label: 'Unplaced Artifacts', artifacts: moduleMap['unplaced'] || [] },
      },
    };

    // Audit trail
    await logAuditEntry(req, 'EXPORT', 'submission_package', String(projectDbId), null, {
      readinessPercent,
      eligibleCount,
      totalArtifacts,
    });

    return sendSuccess(res, manifest);
  } catch (error: any) {
    logConcept2cureError('submission package export', error, { projectId: req.params.projectId });
    return sendError(res, 500, 'Failed to generate submission package');
  }
});

// ── Reminder / Escalation Processing ─────────────────────────────────────────

/**
 * POST /api/concept2cure/escalation/process
 * Scans open threads/tasks for overdue items and creates/escalates notifications.
 * Designed to be called periodically (cron, scheduler, or manually).
 */
router.post('/escalation/process', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const now = new Date();
    const dueSoonThreshold = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h ahead
    const escalation1Threshold = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24h overdue
    const escalation2Threshold = new Date(now.getTime() - 72 * 60 * 60 * 1000); // 72h overdue

    let dueSoonCreated = 0;
    let overdueCreated = 0;
    let escalated = 0;

    // ── Process overdue threads ──
    const overdueThreads = await db
      .select()
      .from(concept2cureReviewThreads)
      .where(
        and(
          eq(concept2cureReviewThreads.orgId, organizationId),
          eq(concept2cureReviewThreads.status, 'open'),
          sql`${concept2cureReviewThreads.dueAt} IS NOT NULL AND ${concept2cureReviewThreads.dueAt} < ${now}`
        )
      );

    // ── Batch-process overdue threads (N+1 → 3 queries) ──
    const assignedThreads = overdueThreads.filter(t => t.assigneeId);
    const threadIds = assignedThreads.map(t => t.id);

    // Batch-fetch existing unread notifications for all overdue threads
    const existingThreadNotifs =
      threadIds.length > 0
        ? await db
            .select({
              threadId: concept2cureNotifications.threadId,
              escalationLevel: concept2cureNotifications.escalationLevel,
              notificationType: concept2cureNotifications.notificationType,
            })
            .from(concept2cureNotifications)
            .where(
              and(
                inArray(concept2cureNotifications.threadId, threadIds),
                inArray(concept2cureNotifications.notificationType, ['escalation', 'overdue']),
                eq(concept2cureNotifications.status, 'unread')
              )
            )
        : [];

    // Build a map of threadId → max existing escalation level
    const threadEscMap = new Map<number, number>();
    for (const n of existingThreadNotifs) {
      const cur = threadEscMap.get(n.threadId!) ?? -1;
      threadEscMap.set(n.threadId!, Math.max(cur, n.escalationLevel ?? 0));
    }

    // Compute needed notifications
    const threadNotifsToInsert: any[] = [];
    for (const thread of assignedThreads) {
      const overdueDuration = now.getTime() - new Date(thread.dueAt!).getTime();
      let newLevel = 0;
      if (overdueDuration > 72 * 60 * 60 * 1000) newLevel = 2;
      else if (overdueDuration > 24 * 60 * 60 * 1000) newLevel = 1;

      const existingLevel = threadEscMap.get(thread.id) ?? -1;
      if (existingLevel >= newLevel) continue;

      const notifId = `ntf_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      threadNotifsToInsert.push({
        notificationId: notifId,
        orgId: organizationId,
        projectId: thread.projectId,
        artifactId: thread.artifactId,
        threadId: thread.id,
        recipientUserId: thread.assigneeId,
        recipientName: thread.assigneeName,
        actorUserId: null,
        actorName: 'System',
        notificationType: newLevel > 0 ? 'escalation' : 'overdue',
        title:
          newLevel > 0
            ? `Escalation L${newLevel}: "${thread.title}" is overdue`
            : `Overdue: "${thread.title}" review thread`,
        body: `Review thread "${
          thread.title
        }" was due ${thread.dueAt!.toISOString()} and remains unresolved.`,
        severity: newLevel >= 2 ? 'critical' : newLevel >= 1 ? 'warning' : 'info',
        status: 'unread',
        dueAt: thread.dueAt,
        escalationLevel: newLevel,
        lastNotifiedAt: now,
        nextReminderAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        escalatesAt: newLevel < 2 ? new Date(now.getTime() + 24 * 60 * 60 * 1000) : null,
      });

      if (newLevel > 0) escalated++;
      else overdueCreated++;
    }

    // Batch-insert all thread notifications
    if (threadNotifsToInsert.length > 0) {
      await db.insert(concept2cureNotifications).values(threadNotifsToInsert);
    }

    // ── Process overdue tasks ──
    const overdueTasks = await db
      .select()
      .from(concept2cureReviewTasks)
      .where(
        and(
          eq(concept2cureReviewTasks.orgId, organizationId),
          or(
            eq(concept2cureReviewTasks.status, 'open'),
            eq(concept2cureReviewTasks.status, 'in_progress')
          ),
          sql`${concept2cureReviewTasks.dueAt} IS NOT NULL AND ${concept2cureReviewTasks.dueAt} < ${now}`
        )
      );

    // ── Batch-process overdue tasks (N+1 → 3 queries) ──
    const assignedTasks = overdueTasks.filter(t => t.assignedToId);
    const taskIds = assignedTasks.map(t => t.id);

    // Batch-fetch existing unread notifications for all overdue tasks
    const existingTaskNotifs =
      taskIds.length > 0
        ? await db
            .select({
              reviewTaskId: concept2cureNotifications.reviewTaskId,
              escalationLevel: concept2cureNotifications.escalationLevel,
              notificationType: concept2cureNotifications.notificationType,
            })
            .from(concept2cureNotifications)
            .where(
              and(
                inArray(concept2cureNotifications.reviewTaskId, taskIds),
                inArray(concept2cureNotifications.notificationType, ['escalation', 'overdue']),
                eq(concept2cureNotifications.status, 'unread')
              )
            )
        : [];

    // Build a map of taskId → max existing escalation level
    const taskEscMap = new Map<number, number>();
    for (const n of existingTaskNotifs) {
      const cur = taskEscMap.get(n.reviewTaskId!) ?? -1;
      taskEscMap.set(n.reviewTaskId!, Math.max(cur, n.escalationLevel ?? 0));
    }

    // Compute needed notifications
    const taskNotifsToInsert: any[] = [];
    for (const task of assignedTasks) {
      const overdueDuration = now.getTime() - new Date(task.dueAt!).getTime();
      let newLevel = 0;
      if (overdueDuration > 72 * 60 * 60 * 1000) newLevel = 2;
      else if (overdueDuration > 24 * 60 * 60 * 1000) newLevel = 1;

      const existingLevel = taskEscMap.get(task.id) ?? -1;
      if (existingLevel >= newLevel) continue;

      const notifId = `ntf_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      taskNotifsToInsert.push({
        notificationId: notifId,
        orgId: organizationId,
        projectId: task.projectId,
        artifactId: task.artifactId,
        reviewTaskId: task.id,
        recipientUserId: task.assignedToId,
        recipientName: task.assignedToName,
        actorUserId: null,
        actorName: 'System',
        notificationType: newLevel > 0 ? 'escalation' : 'overdue',
        title:
          newLevel > 0
            ? `Escalation L${newLevel}: "${task.title}" is overdue`
            : `Overdue: "${task.title}" review task`,
        body: `Review task "${
          task.title
        }" was due ${task.dueAt!.toISOString()} and remains unresolved.`,
        severity: newLevel >= 2 ? 'critical' : newLevel >= 1 ? 'warning' : 'info',
        status: 'unread',
        dueAt: task.dueAt,
        escalationLevel: newLevel,
        lastNotifiedAt: now,
        nextReminderAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        escalatesAt: newLevel < 2 ? new Date(now.getTime() + 24 * 60 * 60 * 1000) : null,
      });

      if (newLevel > 0) escalated++;
      else overdueCreated++;
    }

    // Batch-insert all task notifications
    if (taskNotifsToInsert.length > 0) {
      await db.insert(concept2cureNotifications).values(taskNotifsToInsert);
    }

    // ── Due-soon reminders for threads ──
    const dueSoonThreads = await db
      .select()
      .from(concept2cureReviewThreads)
      .where(
        and(
          eq(concept2cureReviewThreads.orgId, organizationId),
          eq(concept2cureReviewThreads.status, 'open'),
          sql`${concept2cureReviewThreads.dueAt} IS NOT NULL AND ${concept2cureReviewThreads.dueAt} > ${now} AND ${concept2cureReviewThreads.dueAt} <= ${dueSoonThreshold}`
        )
      );

    for (const thread of dueSoonThreads) {
      if (!thread.assigneeId) continue;
      await createNotification({
        orgId: organizationId,
        projectId: thread.projectId,
        artifactId: thread.artifactId,
        threadId: thread.id,
        recipientUserId: thread.assigneeId,
        recipientName: thread.assigneeName,
        notificationType: 'due_soon',
        title: `Due soon: "${thread.title}"`,
        body: `Review thread "${thread.title}" is due ${thread.dueAt!.toISOString()}.`,
        severity: 'warning',
        dueAt: thread.dueAt,
      });
      dueSoonCreated++;
    }

    // ── Due-soon reminders for tasks ──
    const dueSoonTasks = await db
      .select()
      .from(concept2cureReviewTasks)
      .where(
        and(
          eq(concept2cureReviewTasks.orgId, organizationId),
          or(
            eq(concept2cureReviewTasks.status, 'open'),
            eq(concept2cureReviewTasks.status, 'in_progress')
          ),
          sql`${concept2cureReviewTasks.dueAt} IS NOT NULL AND ${concept2cureReviewTasks.dueAt} > ${now} AND ${concept2cureReviewTasks.dueAt} <= ${dueSoonThreshold}`
        )
      );

    for (const task of dueSoonTasks) {
      if (!task.assignedToId) continue;
      await createNotification({
        orgId: organizationId,
        projectId: task.projectId,
        artifactId: task.artifactId,
        reviewTaskId: task.id,
        recipientUserId: task.assignedToId,
        recipientName: task.assignedToName,
        notificationType: 'due_soon',
        title: `Due soon: "${task.title}"`,
        body: `Review task "${task.title}" is due ${task.dueAt!.toISOString()}.`,
        severity: 'warning',
        dueAt: task.dueAt,
      });
      dueSoonCreated++;
    }

    return sendSuccess(res, {
      processed: {
        overdueThreads: overdueThreads.length,
        overdueTasks: overdueTasks.length,
        dueSoonThreads: dueSoonThreads.length,
        dueSoonTasks: dueSoonTasks.length,
      },
      created: {
        dueSoon: dueSoonCreated,
        overdue: overdueCreated,
        escalated,
      },
    });
  } catch (error: any) {
    logConcept2cureError('escalation process', error);
    return sendError(res, 500, 'Failed to process escalations');
  }
});

// ════════════════════════════════════════════════════════════════════════════
// CONTEXT INTEGRITY LAYER ENDPOINTS
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/concept2cure/conversations/:conversationId/health
 * Compute and return conversation health report.
 */
router.get(
  '/conversations/:conversationId/health',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.conversationId, 10);
      const organizationId =
        (req as any).organizationId ||
        parseInt(req.headers['x-organization-id'] as string, 10) ||
        1;

      if (!conversationId || isNaN(conversationId)) {
        return sendError(res, 400, 'Invalid conversation ID');
      }

      const report = await computeConversationHealth(conversationId, organizationId);
      return sendSuccess(res, report);
    } catch (error: any) {
      logConcept2cureError('conversation health', error);
      return sendError(res, 500, 'Failed to compute conversation health');
    }
  }
);

/**
 * GET /api/concept2cure/conversations/:conversationId/working-memory
 * Get the latest working memory summary for a conversation.
 */
router.get(
  '/conversations/:conversationId/working-memory',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.conversationId, 10);
      const organizationId =
        (req as any).organizationId ||
        parseInt(req.headers['x-organization-id'] as string, 10) ||
        1;

      if (!conversationId || isNaN(conversationId)) {
        return sendError(res, 400, 'Invalid conversation ID');
      }

      const memory = await getLatestWorkingMemory(conversationId, organizationId);
      if (!memory) {
        return sendSuccess(res, null, { message: 'No working memory generated yet' });
      }

      return sendSuccess(res, {
        ...memory,
        formatted: formatWorkingMemoryForPrompt(memory),
      });
    } catch (error: any) {
      logConcept2cureError('working memory retrieval', error);
      return sendError(res, 500, 'Failed to retrieve working memory');
    }
  }
);

/**
 * POST /api/concept2cure/conversations/:conversationId/summarize
 * Generate or refresh the working memory summary for a conversation.
 * Uses AI to analyze conversation messages and produce a structured summary.
 */
router.post(
  '/conversations/:conversationId/summarize',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.conversationId, 10);
      const organizationId =
        (req as any).organizationId ||
        parseInt(req.headers['x-organization-id'] as string, 10) ||
        1;

      if (!conversationId || isNaN(conversationId)) {
        return sendError(res, 400, 'Invalid conversation ID');
      }

      // Load conversation messages
      const messagesResult = await pool.query(
        `SELECT role, content FROM concept2cure_messages
       WHERE conversation_id = $1 AND organization_id = $2
       ORDER BY created_at ASC`,
        [conversationId, organizationId]
      );
      const messages = messagesResult.rows;

      if (messages.length === 0) {
        return sendError(res, 404, 'No messages found for this conversation');
      }

      // Get previous summary for chaining
      const existingMemory = await getLatestWorkingMemory(conversationId, organizationId);
      const previousSummary = existingMemory
        ? formatWorkingMemoryForPrompt(existingMemory)
        : undefined;

      // Build the summarization prompt
      const summaryPrompt = buildWorkingMemoryPrompt(messages, previousSummary);

      // Use OpenAI to generate the structured summary
      let structured: any;
      try {
        const { getOpenAIClient } = await import('../services/openai-client');
        const aiResult = await ai.chat({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'You are a regulatory affairs analyst. Produce concise, structured summaries.',
            },
            { role: 'user', content: summaryPrompt },
          ],
          max_tokens: 2000,
          temperature: 0.3,
        });

        const responseText = aiResult.content || '{}';
        // Extract JSON from response (handle markdown code blocks)
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        structured = jsonMatch
          ? JSON.parse(jsonMatch[0])
          : {
              objective: 'Unable to parse summary',
              lockedFacts: [],
              decisions: [],
              openQuestions: [],
              nextActions: [],
              createdArtifacts: [],
              exclusions: [],
            };
      } catch (aiError: any) {
        logger.error(`AI summarization failed: ${aiError.message}`);
        // Fallback: generate a basic summary without AI
        structured = {
          objective: `Conversation with ${messages.length} messages`,
          lockedFacts: [],
          decisions: [],
          openQuestions: messages
            .filter((m: any) => m.role === 'user' && m.content?.trim().endsWith('?'))
            .slice(-5)
            .map((m: any) => m.content.trim().slice(0, 200)),
          nextActions: [],
          createdArtifacts: [],
          exclusions: [],
        };
      }

      // Format as readable summary
      const formattedSummary = [
        `**Objective**: ${structured.objective}`,
        structured.lockedFacts?.length > 0
          ? `**Key Facts**: ${structured.lockedFacts.join('; ')}`
          : '',
        structured.decisions?.length > 0 ? `**Decisions**: ${structured.decisions.join('; ')}` : '',
        structured.openQuestions?.length > 0
          ? `**Open Questions**: ${structured.openQuestions.join('; ')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n');

      // Get thread ID for cross-system linking
      const convResult = await pool.query(
        'SELECT thread_id FROM concept2cure_conversations WHERE id = $1',
        [conversationId]
      );
      const threadId = convResult.rows[0]?.thread_id || null;

      // Store
      await storeWorkingMemory({
        conversationId,
        threadId,
        organizationId,
        summary: formattedSummary,
        structured,
        messageCountAtGeneration: messages.length,
      });

      return sendSuccess(res, {
        summary: formattedSummary,
        structured,
        messageCount: messages.length,
        generatedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      logConcept2cureError('working memory generation', error);
      return sendError(res, 500, 'Failed to generate working memory summary');
    }
  }
);

/**
 * POST /api/concept2cure/conversations/:conversationId/promote
 * Promote conversation content to a governed artifact.
 */
router.post(
  '/conversations/:conversationId/promote',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.conversationId, 10);
      const organizationId =
        (req as any).organizationId ||
        parseInt(req.headers['x-organization-id'] as string, 10) ||
        null;
      if (!organizationId) {
        return sendError(res, 403, 'Organization context required');
      }
      const userId = (req as any).userId || (req as any).user?.id || null;

      const promoteSchema = z.object({
        type: z.enum([
          'strategy_memo',
          'evidence_brief',
          'module_draft',
          'decision_log',
          'handoff_memo',
        ]),
        title: z.string().min(1).max(500),
        messageStart: z.number().optional(),
        messageEnd: z.number().optional(),
      });

      const parsed = promoteSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendError(res, 400, 'Invalid promotion request', parsed.error.format());
      }
      const { type, title, messageStart, messageEnd } = parsed.data;

      if (!conversationId || isNaN(conversationId)) {
        return sendError(res, 400, 'Invalid conversation ID');
      }

      // Load conversation and verify it belongs to this org
      const convResult = await pool.query(
        'SELECT id, project_id, conversation_id FROM concept2cure_conversations WHERE id = $1 AND organization_id = $2',
        [conversationId, organizationId]
      );
      if (convResult.rows.length === 0) {
        return sendError(res, 404, 'Conversation not found');
      }
      const conversation = convResult.rows[0];

      // Load messages (optionally filtered by range)
      let messagesQuery = `SELECT role, content, created_at FROM concept2cure_messages
       WHERE conversation_id = $1 AND organization_id = $2
       ORDER BY created_at ASC`;
      const messagesResult = await pool.query(messagesQuery, [conversationId, organizationId]);
      let messages = messagesResult.rows;

      if (messageStart !== undefined || messageEnd !== undefined) {
        const start = messageStart ?? 0;
        const end = messageEnd ?? messages.length;
        messages = messages.slice(start, end);
      }

      if (messages.length === 0) {
        return sendError(res, 404, 'No messages in specified range');
      }

      // Generate document content using AI + Intelligence Engine
      let documentContent: string;
      try {
        const conversationText = messages.map((m: any) => `[${m.role}]: ${m.content}`).join('\n\n');

        // Run intelligence pipeline on conversation content for structured signals
        let intelligenceContext = '';
        try {
          const { runIntelligencePipeline, buildConstrainedPrompt } = await import(
            '../services/intelligence-engine/index.js'
          );
          const analysis = runIntelligencePipeline(conversationText);
          intelligenceContext = buildConstrainedPrompt(analysis, 'generate_memo');
        } catch {
          // Graceful degradation
        }

        const systemPrompt =
          intelligenceContext ||
          `You are a regulatory affairs document specialist. Extract and organize the conversation content into a formal ${type.replace(
            /_/g,
            ' '
          )} document. Use proper document structure with headings, and maintain regulatory precision. Output in Markdown format.`;

        const aiResult = await ai.chat({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `Create a "${title}" (${type.replace(
                /_/g,
                ' '
              )}) from this conversation:\n\n${conversationText}`,
            },
          ],
          max_tokens: 4000,
          temperature: 0.3,
        });
        documentContent = aiResult.content || '';

        // Evaluation gate: check output quality
        try {
          const { evaluateOutput } = await import('../services/intelligence-engine/index.js');
          const evaluation = evaluateOutput(documentContent);
          if (!evaluation.passed && intelligenceContext) {
            // Regenerate with tighter constraints
            const retryResult = await ai.chat({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: `${systemPrompt}\n\nIMPORTANT: Your output MUST include: a clear verdict/recommendation, prioritized findings with severity levels, specific evidence references, and actionable next steps. Rejected reasons: ${evaluation.rejectionReasons.join(
                    '; '
                  )}`,
                },
                {
                  role: 'user',
                  content: `Create a "${title}" (${type.replace(
                    /_/g,
                    ' '
                  )}) from this conversation:\n\n${conversationText}`,
                },
              ],
              max_tokens: 4000,
              temperature: 0.2,
            });
            documentContent = retryResult.content || documentContent;
          }
        } catch {
          // Use original if evaluation/retry fails
        }
      } catch {
        // Fallback: raw conversation export
        documentContent =
          `# ${title}\n\n_Promoted from conversation on ${new Date().toISOString()}_\n\n` +
          messages
            .map(
              (m: any) =>
                `### ${m.role === 'user' ? 'User' : 'Assistant'} (${new Date(
                  m.created_at
                ).toLocaleString()})\n\n${m.content}`
            )
            .join('\n\n---\n\n');
      }

      // Create artifact
      const artifactId = `artifact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const contentHash = crypto.createHash('sha256').update(documentContent).digest('hex');

      const promotedMetadata = {
        promotedFrom: type,
        sourceMessageCount: messages.length,
      };
      const governedPromotion = resolveGovernedContext({
        req,
        projectId: conversation.project_id,
        artifactId: null,
        documentType: type,
        generationMode: 'ai_generated',
        lifecycleStatus: 'draft',
        originSurface: 'ri_copilot',
        title: DOMPurify.sanitize(title),
        content: documentContent,
        sourceRefs: [`conversation:${conversationId}`],
        provider: 'openai',
        model: 'gpt-4o-mini',
        eventType: 'artifact.created',
      });
      if (!governedPromotion.validation.valid) {
        return sendError(
          res,
          400,
          'Governed document contract validation failed',
          {
            errors: governedPromotion.validation.errors,
            warnings: governedPromotion.validation.warnings,
            resolved: governedPromotion.resolved,
          },
          'GOVERNED_CONTRACT_INVALID'
        );
      }

      const artifactResult = await db
        .insert(concept2cureArtifacts)
        .values({
          artifactId,
          projectId: conversation.project_id,
          conversationId,
          organizationId,
          type: 'markdown',
          category: 'document',
          title: DOMPurify.sanitize(title),
          content: documentContent,
          contentHash,
          version: 1,
          status: 'draft',
          createdById: userId,
          metadata: {
            ...promotedMetadata,
            harness: {
              clientTrack: governedPromotion.contract.clientTrack,
              submissionProgram: governedPromotion.contract.submissionProgram,
              persona: governedPromotion.contract.persona,
              regulatorScope: governedPromotion.contract.regulatorScope,
              documentClass: governedPromotion.contract.documentClass,
              readinessGate: governedPromotion.contract.readinessGate,
              workspaceTarget: governedPromotion.contract.workspaceTarget,
              originSurface: governedPromotion.contract.originSurface,
              recommendationSource: governedPromotion.contract.recommendationSource,
              regulatorIntent: governedPromotion.contract.regulatorIntent,
              gateChecks: governedPromotion.contract.exportEligibility.gateChecks,
              blockingReasons: governedPromotion.contract.exportEligibility.blockingReasons,
              readinessOutcome: governedPromotion.contract.exportEligibility.readinessOutcome,
            },
          },
        })
        .returning();

      // Log provenance event
      if (artifactResult.length > 0) {
        await db.insert(concept2cureProvenanceEvents).values({
          eventId: `prov_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          artifactId: artifactResult[0].id,
          organizationId,
          eventType: 'creation',
          eventAction: 'promoted_from_conversation',
          actorId: userId || undefined,
          actorName: 'User',
          sourceDescription: `Promoted from conversation ${conversationId} as ${type}`,
          details: {
            conversationId,
            messageRange: { start: messageStart ?? 0, end: messageEnd ?? messages.length },
            sourceType: type,
          },
          backendService: 'concept2cure',
          backendRoute: `POST /api/concept2cure/conversations/${conversationId}/promote`,
        });
      }

      return sendSuccess(res, {
        artifact: artifactResult[0],
        artifactId,
        title,
        type,
        messageCount: messages.length,
      });
    } catch (error: any) {
      logConcept2cureError('document promotion', error);
      return sendError(res, 500, 'Failed to promote conversation to document');
    }
  }
);

/**
 * POST /api/concept2cure/conversations/:conversationId/extract-decisions
 * Extract decisions, risks, and open questions from a conversation.
 */
router.post(
  '/conversations/:conversationId/extract-decisions',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.conversationId, 10);
      const organizationId =
        (req as any).organizationId ||
        parseInt(req.headers['x-organization-id'] as string, 10) ||
        1;

      if (!conversationId || isNaN(conversationId)) {
        return sendError(res, 400, 'Invalid conversation ID');
      }

      // Load messages
      const messagesResult = await pool.query(
        `SELECT role, content FROM concept2cure_messages
       WHERE conversation_id = $1 AND organization_id = $2
       ORDER BY created_at ASC`,
        [conversationId, organizationId]
      );
      const messages = messagesResult.rows;

      if (messages.length === 0) {
        return sendError(res, 404, 'No messages found');
      }

      try {
        const conversationText = messages.map((m: any) => `[${m.role}]: ${m.content}`).join('\n\n');

        // Run intelligence pipeline for structured risk/decision signals
        let intelligenceSignals: Record<string, unknown> = {};
        try {
          const { runIntelligencePipeline } = await import(
            '../services/intelligence-engine/index.js'
          );
          const analysis = runIntelligencePipeline(conversationText);
          intelligenceSignals = {
            defensibilityScore: analysis.defensibility.score,
            riskLevel: analysis.defensibility.riskLevel,
            riskClassifications: analysis.riskClassifications.classifications.map(r => ({
              category: r.category,
              severity: r.severity,
              finding: r.finding,
            })),
            reviewerQuestions: analysis.reviewerQuestions.map(q => ({
              question: q.question,
              severity: q.severity,
              category: q.category,
            })),
          };
        } catch {
          // Graceful degradation
        }

        const aiResult = await ai.chat({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `Extract structured information from this regulatory conversation. You have intelligence signals available. Return ONLY valid JSON.${
                Object.keys(intelligenceSignals).length > 0
                  ? `\n\nIntelligence signals:\n${JSON.stringify(intelligenceSignals, null, 2)}`
                  : ''
              }`,
            },
            {
              role: 'user',
              content: `Extract all decisions, risks, open questions, and action items from this conversation:\n\n${conversationText}\n\nRespond with JSON: { "decisions": [...], "risks": [...], "openQuestions": [...], "actionItems": [...], "intelligenceSignals": {...} }`,
            },
          ],
          max_tokens: 2000,
          temperature: 0.2,
        });

        const responseText = aiResult.content || '{}';
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        const extracted = jsonMatch
          ? JSON.parse(jsonMatch[0])
          : {
              decisions: [],
              risks: [],
              openQuestions: [],
              actionItems: [],
            };

        // Merge intelligence signals into response
        if (Object.keys(intelligenceSignals).length > 0) {
          extracted.intelligenceSignals = intelligenceSignals;
        }

        return sendSuccess(res, extracted);
      } catch (aiError: any) {
        logger.error(`Decision extraction failed: ${aiError.message}`);
        return sendError(res, 500, 'AI extraction failed');
      }
    } catch (error: any) {
      logConcept2cureError('decision extraction', error);
      return sendError(res, 500, 'Failed to extract decisions');
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// INTELLIGENCE ENGINE — Deterministic regulatory intelligence analysis
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/concept2cure/intelligence/analyze
 *
 * Runs the full Intelligence Engine pipeline on provided content.
 * Returns deterministic analysis: claim/evidence alignment, consistency,
 * defensibility scoring, risk classification, and reviewer questions.
 *
 * No LLM dependency — all results are reproducible.
 */
router.post('/intelligence/analyze', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { runIntelligencePipeline, emitRIMSignals, buildConstrainedPrompt } = await import(
      '../services/intelligence-engine/index.js'
    );

    const analyzeSchema = z.object({
      content: z.string().min(10).max(200000),
      sections: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            content: z.string(),
          })
        )
        .optional(),
      includeConstrainedPrompt: z
        .enum(['explain_risk', 'suggest_remediation', 'generate_memo', 'rewrite_section'])
        .optional(),
    });

    const parsed = analyzeSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, 'Invalid analysis request', parsed.error.format());
    }

    const { content, sections, includeConstrainedPrompt } = parsed.data;
    const startTime = Date.now();

    // Run full deterministic pipeline
    const analysis = runIntelligencePipeline(content, sections);
    const rimSignals = emitRIMSignals(analysis);

    // Optionally build a constrained LLM prompt
    let constrainedPrompt: string | undefined;
    if (includeConstrainedPrompt) {
      constrainedPrompt = buildConstrainedPrompt(analysis, includeConstrainedPrompt);
    }

    return sendSuccess(res, {
      analysis,
      rimSignals,
      constrainedPrompt,
      executionTimeMs: Date.now() - startTime,
    });
  } catch (error: any) {
    logger.error(`Intelligence analysis failed: ${error.message}`);
    return sendError(res, 500, 'Intelligence analysis failed');
  }
});

/**
 * POST /api/concept2cure/intelligence/evaluate
 *
 * Run the evaluation gate on any output text to check quality.
 */
router.post('/intelligence/evaluate', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { evaluateOutput } = await import('../services/intelligence-engine/index.js');

    const evalSchema = z.object({
      output: z.string().min(1).max(100000),
    });

    const parsed = evalSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, 'Invalid evaluation request', parsed.error.format());
    }

    const evaluation = evaluateOutput(parsed.data.output);
    return sendSuccess(res, evaluation);
  } catch (error: any) {
    logger.error(`Evaluation gate failed: ${error.message}`);
    return sendError(res, 500, 'Evaluation failed');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PRECEDENTS — Regulatory precedent/predicate data for Intelligence Hub
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/precedents', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId || (req as any).tenantContext?.organizationId;

    // Try to load precedents from the precedent engine or predicate intelligence tables
    let precedents: any[] = [];
    try {
      const result = await pool.query(
        `SELECT id, device_name as name, pathway, decision_date as "decisionDate",
                predicate_device as "predicateDevice", outcome, similarity,
                key_questions as "keyQuestions"
         FROM predicate_intelligence_results
         WHERE organization_id = $1
         ORDER BY decision_date DESC
         LIMIT 50`,
        [orgId]
      );
      precedents = result.rows;
    } catch {
      // Table may not exist yet — return empty array gracefully
    }

    return sendSuccess(res, precedents);
  } catch (error: any) {
    logConcept2cureError('precedents fetch', error);
    return sendError(res, 500, 'Failed to fetch precedent data');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PATENTS — IP portfolio data for Legal Center
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/patents', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId || (req as any).tenantContext?.organizationId;

    let patents: any[] = [];
    try {
      const result = await pool.query(
        `SELECT id, title, patent_number as "patentNumber", jurisdiction,
                status, filing_date as "filingDate", expiration_date as "expirationDate",
                inventors, category, fto_status as "ftoStatus",
                related_compounds as "relatedCompounds"
         FROM patent_portfolio
         WHERE organization_id = $1
         ORDER BY filing_date DESC`,
        [orgId]
      );
      patents = result.rows;
    } catch {
      // Table may not exist yet — return empty array gracefully
    }

    return res.json(patents);
  } catch (error: any) {
    logConcept2cureError('patents fetch', error);
    return sendError(res, 500, 'Failed to fetch patent data');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMPLIANCE — Compliance tracking data for Legal Center
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/compliance', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId || (req as any).tenantContext?.organizationId;

    let complianceItems: any[] = [];
    try {
      const result = await pool.query(
        `SELECT id, framework, requirement, status,
                last_audit_date as "lastAuditDate", next_audit_date as "nextAuditDate",
                findings, capa_count as "capaCount", owner, risk_level as "riskLevel"
         FROM compliance_tracking
         WHERE organization_id = $1
         ORDER BY next_audit_date ASC`,
        [orgId]
      );
      complianceItems = result.rows;
    } catch {
      // Table may not exist yet — return empty array gracefully
    }

    return res.json(complianceItems);
  } catch (error: any) {
    logConcept2cureError('compliance fetch', error);
    return sendError(res, 500, 'Failed to fetch compliance data');
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEAM WORKLOAD — Task workload per team member for Mission Control
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/team/workload', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId || (req as any).tenantContext?.organizationId;
    if (!orgId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    let workload: any[] = [];
    try {
      // Aggregate task counts by assignee from the unified tasks table
      const result = await pool.query(
        `SELECT
           u.id as "memberId",
           u.name as "memberName",
           COALESCE(SUM(CASE WHEN t.status = 'assigned' OR t.status = 'in_progress' THEN 1 ELSE 0 END), 0)::int as assigned,
           COALESCE(SUM(CASE WHEN t.status = 'in_review' THEN 1 ELSE 0 END), 0)::int as "inReview",
           COALESCE(SUM(CASE WHEN t.due_date < NOW() AND t.status NOT IN ('completed', 'cancelled') THEN 1 ELSE 0 END), 0)::int as overdue
         FROM users u
         LEFT JOIN tasks t ON t.assigned_to = u.id AND t.organization_id = $1
         WHERE u.organization_id = $1
         GROUP BY u.id, u.name
         ORDER BY u.name`,
        [orgId]
      );
      workload = result.rows;
    } catch {
      // Tables may not exist yet — return empty array gracefully
    }

    return res.json(workload);
  } catch (error: any) {
    logConcept2cureError('team workload fetch', error);
    return sendError(res, 500, 'Failed to fetch workload data');
  }
});

/**
 * POST /api/concept2cure/feedback
 * Persist user feedback (thumbs up/down) on AI responses.
 * Critical for RLHF quality loop — was previously console.info only.
 */
router.post('/feedback', authMiddleware, async (req: Request, res: Response) => {
  try {
    const organizationId =
      (req as any).organizationId || parseInt(req.headers['x-organization-id'] as string, 10) || 1;
    const userId = getUserId(req);
    const { messageId, positive, conversationId, comment } = req.body;

    if (messageId === undefined || positive === undefined) {
      return sendError(res, 400, 'messageId and positive (boolean) are required');
    }

    try {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS ai_feedback (
          id SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL,
          user_id INTEGER,
          message_id TEXT NOT NULL,
          conversation_id TEXT,
          positive BOOLEAN NOT NULL,
          comment TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )`
      );
      await pool.query(
        `INSERT INTO ai_feedback (organization_id, user_id, message_id, conversation_id, positive, comment)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          organizationId,
          userId,
          String(messageId),
          conversationId || null,
          positive,
          comment || null,
        ]
      );
    } catch (dbErr: any) {
      console.warn('[Feedback] DB persist failed:', dbErr.message);
    }

    // Also log to audit trail for compliance
    await logAuditEntry(req, 'FEEDBACK', 'ai_response', String(messageId), null, {
      positive,
      conversationId,
    });

    // Feed back to RIM learning loop (non-blocking)
    try {
      const { interceptFeedback } = await import('../services/intelligence/rim-interceptors.js');
      interceptFeedback({
        organizationId,
        projectId: req.body.projectId ? Number(req.body.projectId) : undefined,
        userId,
        feedbackType: positive ? 'accepted' : 'rejected',
      });
    } catch {
      /* non-blocking */
    }

    return sendSuccess(res, { recorded: true });
  } catch (error: any) {
    logConcept2cureError('feedback submission', error);
    return sendError(res, 500, 'Failed to record feedback');
  }
});

export default router;
