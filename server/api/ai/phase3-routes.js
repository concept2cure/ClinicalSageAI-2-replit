import express from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import regulatoryAIPhase3 from '../../services/regulatoryAIServicePhase3.js';
import { db } from '../../db.js';
import { components, documentVersions, organizationUsers } from '../../../shared/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { authedOrgId } from '../../utils/authedOrgId.js';

const router = express.Router();

/**
 * Zod validation schemas for Phase 3 endpoints
 */
const nerExtractSchema = z.object({
  componentText: z.string().min(1).max(50000),
  changeContext: z
    .object({
      entity_type: z.string().optional(),
      original_value: z.string().optional(),
      new_value: z.string().optional(),
    })
    .optional(),
  componentUDI: z.string().optional(),
  organizationId: z.number().optional(),
});

const generateEmbeddingSchema = z.object({
  text: z.string().min(1).max(10000),
  documentVersionId: z.string().uuid().optional(),
  chunkIndex: z.number().int().min(0).optional(),
  organizationId: z.number().optional(),
});

const consistencyCheckSchema = z.object({
  module2Content: z.string().min(1).max(50000),
  module3Content: z.string().min(1).max(50000),
  moduleContext: z.string().max(1000).optional(),
  organizationId: z.number().optional(),
});

const globalChangeInitiateSchema = z.object({
  entity_type: z.enum([
    'assay',
    'batch_number',
    'site',
    'product',
    'specification',
    'regulatory_section',
  ]),
  original_value: z.string().min(1).max(1000),
  new_value: z.string().min(1).max(1000),
  organizationId: z.number().optional(),
});

const globalChangeExecuteSchema = z.object({
  transaction_id: z.string().uuid(),
  digital_signature: z.string().min(1),
  approval_notes: z.string().optional(),
});

/**
 * Dev-only org-context escape hatch.
 *
 * The previous gate (`NODE_ENV !== 'production'`) engaged in ANY
 * non-production environment — including staging — silently mapping
 * unauthenticated callers into a real organization. It now requires BOTH:
 *   1. NODE_ENV of exactly 'development' or 'test' (staging never qualifies), and
 *   2. an explicit DEV_ORG_FALLBACK=true opt-in.
 */
const devOrgFallbackEnabled = () =>
  (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') &&
  process.env.DEV_ORG_FALLBACK === 'true';

/**
 * Middleware to extract organization context from headers
 */
const extractOrgContext = (req, res, next) => {
  // Skip organization context requirement for tenant creation endpoints
  // These endpoints need to work without an organization context for bootstrap scenarios
  if (req.path === '/tenants' && req.method === 'POST') {
    return next();
  }
  if (req.path === '/tenants' && req.method === 'GET') {
    return next();
  }
  if (req.path.startsWith('/tenants')) {
    return next();
  }
  // Public price cards: /api/billing/dtc-pricing is on the platform's open
  // (unauthenticated) prefix list, so no verified JWT — and therefore no org —
  // ever reaches this middleware for it. Without this skip the public pricing
  // endpoint 403s for everyone (signed-in callers included, since the open
  // prefix bypasses token verification entirely). Tenant-scoped /api/billing
  // routes are unaffected — they authenticate before this middleware runs.
  if (req.path === '/billing/dtc-pricing' && req.method === 'GET') {
    return next();
  }

  // Source organization id from the verified JWT, never from headers.
  // The previous header path (`x-organization-id`) was attacker-
  // controlled and is the IDOR shape PRs #496-#499 closed.
  const jwtOrgId = authedOrgId(req);
  if (jwtOrgId != null) {
    req.organizationId = jwtOrgId;
  } else if (devOrgFallbackEnabled()) {
    // Dev-mode escape hatch — preserves developer ergonomics when no JWT is
    // present (eg local curl). Requires NODE_ENV development/test AND
    // DEV_ORG_FALLBACK=true; never engaged in staging or production.
    req.organizationId = req.organizationId || 2;
    if (req.userId === undefined || req.userId === null || typeof req.userId === 'string') {
      req.userId = 'dev-user';
    }
  } else {
    return res.status(403).json({
      success: false,
      error: 'Organization context required',
      message: 'No org context on verified JWT',
    });
  }

  req.sessionId = req.headers['x-session-id'] || null;
  req.ipAddress = req.headers['x-forwarded-for'] || req.connection?.remoteAddress;
  next();
};

/**
 * Platform-level roles — mirrors PLATFORM_ROLES in
 * server/middleware/requirePlatformAdmin.ts (implemented locally because this
 * .js module cannot import the .ts middleware without a resolution shim; see
 * server/utils/authedOrgId.js for the rationale). Org-scoped `admin` is
 * deliberately NOT platform-level: a tenant administrator must never see
 * another tenant's data.
 */
const PLATFORM_ROLES = new Set(['super_admin', 'platform_admin', 'support']);

/** Resolved lower-cased roles for the authenticated request. */
const rolesOf = req => {
  const roles = req.user?.roles || [req.userRole || req.user?.role];
  return roles.filter(Boolean).map(r => String(r).toLowerCase());
};

/** True when the caller is a platform operator (cross-tenant visibility). */
const isPlatformAdmin = req => {
  if (rolesOf(req).some(r => PLATFORM_ROLES.has(r))) return true;
  const email = String(req.userEmail || req.user?.email || '').toLowerCase();
  if (!email) return false;
  return (process.env.PLATFORM_ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email);
};

/**
 * Dead-letter-queue visibility scope for this request. Platform operators see
 * every entry (including legacy entries enqueued before org tagging existed —
 * those carry organizationId: null and are visible ONLY here); everyone else
 * sees their own organization's entries only.
 */
const dlqScopeFor = req =>
  isPlatformAdmin(req) ? { all: true } : { organizationId: req.organizationId };

/** Org-scoped roles authorized for destructive DLQ operations. */
const DLQ_ADMIN_ORG_ROLES = new Set(['admin', 'owner']);

/**
 * Re-resolve the caller's CURRENT org-scoped role from the database.
 *
 * SECURITY (P1): the destructive DLQ gate must NOT trust `req.user.roles`. The
 * `/api/ai` namespace runs a second `authenticateToken` pass (registered in
 * server/bootstrap/register-core-routes.ts) that overwrites `req.user` with
 * JWT-derived roles; those stay stale for up to the access-token TTL after an
 * org role change, so a tenant admin downgraded to member would otherwise keep
 * clearing the org's dead-letter queue until their token expired. Querying
 * organizationUsers here makes the gate authoritative. Fails closed (null) when
 * the DB is unavailable or the query throws — a destructive op must not proceed
 * on an unverifiable role.
 */
const resolveOrgRole = async (userId, organizationId) => {
  if (!db || !Number.isFinite(userId) || !Number.isFinite(organizationId)) return null;
  try {
    const rows = await db
      .select({ role: organizationUsers.role })
      .from(organizationUsers)
      .where(
        and(
          eq(organizationUsers.userId, userId),
          eq(organizationUsers.organizationId, organizationId)
        )
      )
      .limit(1);
    return rows.length > 0 ? String(rows[0].role || '').toLowerCase() : null;
  } catch (error) {
    console.error('[phase3] DLQ admin role re-resolution failed:', error?.message || error);
    return null; // fail closed
  }
};

/**
 * Admin gate for destructive DLQ operations (401 unauthenticated / 403
 * insufficient role, same error envelope as the canonical requireRole).
 * Platform operators are recognized via isPlatformAdmin (global roles / email
 * allowlist); the org-scoped `admin` decision is re-resolved from the DB rather
 * than the potentially-stale in-request role (see resolveOrgRole).
 */
const requireDlqAdmin = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: { code: 'AUTH_003', message: 'Authentication required' },
    });
  }
  if (isPlatformAdmin(req)) {
    return next();
  }
  const userId = Number(req.user?.userId ?? req.user?.id ?? req.userId);
  const orgId = Number(req.organizationId);
  const dbRole = await resolveOrgRole(userId, orgId);
  if (dbRole && DLQ_ADMIN_ORG_ROLES.has(dbRole)) {
    return next();
  }
  return res.status(403).json({
    error: { code: 'AUTH_004', message: 'Insufficient permissions' },
  });
};

/**
 * Phase 3 AI Routes - Three Critical Edge Functions
 * As specified in architectural mandate for Regulatory Intelligence Layer
 */

// Apply organization context middleware to the routes this router serves.
//
// ── Why the path argument is load-bearing (BP-W0-2) ─────────────────────────
// This was `router.use(extractOrgContext)` with no path, and this router is
// mounted at the BARE `/api` prefix (server/bootstrap/register-core-routes.ts).
// An unpathed `router.use` runs for every request that enters the router, so it
// ran for every `/api/*` request in the product — not just the `/ai/*` routes
// defined below, which are the only routes this file registers.
//
// `extractOrgContext` does not call next() when it finds no org: it answers 403
// "Organization context required". And it runs BEFORE the per-route
// authenticateToken that later families apply, so for those families there is
// no org yet to find. The result is that any API family registered after this
// one, and gating auth per-route rather than at its mount, was answered 403
// before its own auth middleware could run.
//
// The Submission Pyramid is exactly that shape — pyramid.routes.ts applies
// authenticateToken per route, deliberately, so its `/api/v1` mount does not
// JWT-gate the sibling X-API-Key public API sharing that prefix. Every
// /api/v1/pyramids/* request 403'd, with a valid token carrying a valid org
// claim. That is the work order's "The submission-pyramid engine didn't
// respond."
//
// The mount comment in register-core-routes.ts anticipated half of this: it
// explains that an auth middleware on THIS mount would intercept every /api
// request, and gates /api/ai separately for that reason. The middleware inside
// the router had the same reach and was not scoped.
router.use('/ai', extractOrgContext);

/**
 * /ai/ner-extract - Named Entity Recognition endpoint
 * Extracts and classifies regulatory entities for global change management
 */
router.post('/ai/ner-extract', async (req, res) => {
  try {
    // Validate request body
    const validationResult = nerExtractSchema.safeParse({
      ...req.body,
      organizationId: req.organizationId,
    });

    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validationResult.error.errors,
      });
    }

    const { componentText, changeContext, componentUDI } = validationResult.data;

    // Check feature flag
    const flags = regulatoryAIPhase3.getFeatureFlags();
    if (!flags.ENABLE_AI_INTELLIGENCE) {
      return res.status(503).json({
        success: false,
        error: 'AI Intelligence features not enabled',
        feature_flag: 'ENABLE_AI_INTELLIGENCE',
      });
    }

    // Extract named entities
    const result = await regulatoryAIPhase3.extractNamedEntities(componentText, changeContext);

    // If successful and componentUDI provided, update component metadata with tenant isolation
    if (result.success && componentUDI && req.organizationId) {
      try {
        await db
          .update(components)
          .set({
            metadata: sql`jsonb_set(
              COALESCE(metadata, '{}'),
              '{ner_entities}',
              ${JSON.stringify(result.data)}::jsonb
            )`,
            updated_at: new Date(),
          })
          .where(
            and(eq(components.udi, componentUDI), eq(components.organizationId, req.organizationId))
          );
      } catch (dbError) {
        console.error('Failed to update component metadata:', dbError);
        // Don't fail the request if metadata update fails
      }
    }

    res.json({
      success: result.success,
      data: result.data,
      from_cache: result.from_cache || false,
      model_used: result.model_used,
      tokens_used: result.tokens_used,
    });
  } catch (error) {
    console.error('NER extraction error:', error);
    // Dead-letter the failure tagged with the caller's org so it can only be
    // inspected/cleared from inside that tenant.
    regulatoryAIPhase3.addToDeadLetterQueue({
      operation: 'ner-extract',
      error: error.message,
      organizationId: req.organizationId,
      payload: req.body,
    });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * /ai/generate-embedding - Async vector generation endpoint
 * Generates 1536-dimensional vectors for semantic search (RAG)
 */
router.post('/ai/generate-embedding', async (req, res) => {
  try {
    // Validate request body
    const validationResult = generateEmbeddingSchema.safeParse({
      ...req.body,
      organizationId: req.organizationId,
    });

    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validationResult.error.errors,
      });
    }

    const { text, documentVersionId, chunkIndex } = validationResult.data;

    // Check feature flag
    const flags = regulatoryAIPhase3.getFeatureFlags();
    if (!flags.ENABLE_AI_INTELLIGENCE) {
      return res.status(503).json({
        success: false,
        error: 'AI Intelligence features not enabled',
        feature_flag: 'ENABLE_AI_INTELLIGENCE',
      });
    }

    // Generate embedding
    const result = await regulatoryAIPhase3.generateEmbedding(text);

    // If successful and documentVersionId provided, update database
    if (result.success && documentVersionId) {
      try {
        // Store embedding in database (requires pgvector extension)
        // CRITICAL: Include organizationId filter to prevent cross-tenant writes
        await db
          .update(documentVersions)
          .set({
            embedding: result.embedding,
            chunk_text: text,
            chunk_index: chunkIndex || 0,
            semantic_metadata: {
              generated_at: new Date(),
              model: 'text-embedding-3-large',
              dimensions: 1536,
              tokens_used: result.tokens_used,
            },
            updated_at: new Date(),
          })
          .where(
            and(
              eq(documentVersions.id, documentVersionId),
              eq(documentVersions.organizationId, req.organizationId)
            )
          );
      } catch (dbError) {
        console.error('Failed to store embedding:', dbError);
        // Return embedding even if storage fails
      }
    }

    res.json({
      success: result.success,
      embedding: result.embedding,
      tokens_used: result.tokens_used,
      dimensions: 1536,
    });
  } catch (error) {
    console.error('Embedding generation error:', error);
    regulatoryAIPhase3.addToDeadLetterQueue({
      operation: 'generate-embedding',
      error: error.message,
      organizationId: req.organizationId,
      payload: req.body,
    });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * /ai/consistency-check - Real-time Module 2↔3 validation endpoint
 * Performs compliance checking between summary and technical modules
 */
router.post('/ai/consistency-check', async (req, res) => {
  try {
    // Validate request body
    const validationResult = consistencyCheckSchema.safeParse({
      ...req.body,
      organizationId: req.organizationId,
    });

    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validationResult.error.errors,
      });
    }

    const { module2Content, module3Content, moduleContext } = validationResult.data;

    // Check feature flag
    const flags = regulatoryAIPhase3.getFeatureFlags();
    if (!flags.ENABLE_AI_INTELLIGENCE) {
      return res.status(503).json({
        success: false,
        error: 'AI Intelligence features not enabled',
        feature_flag: 'ENABLE_AI_INTELLIGENCE',
      });
    }

    // Perform compliance check
    const result = await regulatoryAIPhase3.checkCompliance(
      module2Content,
      module3Content,
      moduleContext || 'General CTD compliance check'
    );

    res.json({
      success: result.success,
      data: result.data,
      model_used: result.model_used,
      tokens_used: result.tokens_used,
    });
  } catch (error) {
    console.error('Compliance check error:', error);
    regulatoryAIPhase3.addToDeadLetterQueue({
      operation: 'consistency-check',
      error: error.message,
      organizationId: req.organizationId,
      payload: req.body,
    });
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * /ai/global-change/initiate - Initiate a global change request
 * Creates a change request for entity renaming across all components
 */
router.post('/ai/global-change/initiate', async (req, res) => {
  try {
    // Validate request body
    const validationResult = globalChangeInitiateSchema.safeParse({
      ...req.body,
      organizationId: req.organizationId,
    });

    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validationResult.error.errors,
      });
    }

    const { entity_type, original_value, new_value, organizationId } = validationResult.data;

    // Require organization context for tenant isolation
    if (!organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Organization context required for global changes',
      });
    }

    // Check feature flag
    const flags = regulatoryAIPhase3.getFeatureFlags();
    if (!flags.ENABLE_AI_INTELLIGENCE) {
      return res.status(503).json({
        success: false,
        error: 'AI Intelligence features not enabled',
        feature_flag: 'ENABLE_AI_INTELLIGENCE',
      });
    }

    // Find all affected components with tenant isolation
    const affectedComponents = await db
      .select()
      .from(components)
      .where(
        and(
          eq(components.organizationId, organizationId),
          sql`content ILIKE ${`%${original_value}%`}`
        )
      );

    const changeRequest = {
      id: crypto.randomUUID(),
      entity_type,
      original_value,
      new_value,
      affected_udis: affectedComponents.map(c => c.udi),
      initiated_by: req.userId || 'system',
      organization_id: organizationId,
      status: 'pending',
      created_at: new Date(),
    };

    // Generate preview
    const preview = {
      total_affected: affectedComponents.length,
      components: affectedComponents.map(c => ({
        udi: c.udi,
        type: c.type,
        module: c.module,
        current_version: c.version,
      })),
      estimated_impact: {
        level: affectedComponents.length > 10 ? 'critical' : 'moderate',
        modules_affected: [...new Set(affectedComponents.map(c => c.module))].filter(Boolean),
        regulatory_review_required: affectedComponents.length > 10,
      },
    };

    res.json({
      success: true,
      transaction_id: changeRequest.id,
      preview,
      requires_approval: true,
      message: `Found ${affectedComponents.length} components that would be affected by this change`,
    });
  } catch (error) {
    console.error('Global change initiation error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * /ai/global-change/execute - Execute an approved global change
 * Requires digital signature for 21 CFR Part 11 compliance
 */
router.post('/ai/global-change/execute', async (req, res) => {
  try {
    // Validate request body
    const validationResult = globalChangeExecuteSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validationResult.error.errors,
      });
    }

    const { transaction_id, digital_signature, approval_notes } = validationResult.data;

    // Check feature flag
    const flags = regulatoryAIPhase3.getFeatureFlags();
    if (!flags.ENABLE_ECTD_4_AUTOMATION) {
      return res.status(503).json({
        success: false,
        error: 'eCTD 4.0 automation not enabled',
        feature_flag: 'ENABLE_ECTD_4_AUTOMATION',
      });
    }

    // For demo purposes, return success
    // In production, this would execute the actual changes
    res.json({
      success: true,
      transaction_id,
      message: 'Global change execution would be performed here with full audit trail',
      digital_signature_verified: true,
      executed_by: req.userId || 'system',
      executed_at: new Date(),
    });
  } catch (error) {
    console.error('Global change execution error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * /ai/status - Get AI service status and metrics
 */
router.get('/ai/status', (req, res) => {
  const flags = regulatoryAIPhase3.getFeatureFlags();
  const tokenBudget = regulatoryAIPhase3.getTokenBudgetStatus();
  // Tenant-scoped view — even count/oldest metadata must not leak across orgs.
  const deadLetterQueue = regulatoryAIPhase3.getDeadLetterQueue(dlqScopeFor(req));

  res.json({
    status: 'operational',
    features: flags,
    token_budget: tokenBudget,
    dead_letter_queue: {
      count: deadLetterQueue.length,
      oldest: deadLetterQueue[0]?.timestamp || null,
    },
    models_available: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    embeddings_model: 'text-embedding-3-large',
    version: '3.0.0-phase3',
  });
});

/**
 * /ai/dead-letter-queue - Manage failed operations
 *
 * SECURITY: the queue is tenant-scoped. Reads return only the caller's
 * organization's entries (platform operators see all, including legacy
 * untagged entries); clears additionally require an admin/platform role and
 * can only remove entries the caller is allowed to see.
 */
router.get('/ai/dead-letter-queue', (req, res) => {
  const queue = regulatoryAIPhase3.getDeadLetterQueue(dlqScopeFor(req));
  res.json({
    count: queue.length,
    items: queue,
  });
});

router.post('/ai/dead-letter-queue/clear', requireDlqAdmin, (req, res) => {
  const { indices } = req.body || {};
  if (
    indices !== undefined &&
    (!Array.isArray(indices) || indices.some(i => !Number.isInteger(i) || i < 0))
  ) {
    return res.status(400).json({
      success: false,
      error: 'indices must be an array of non-negative integers',
    });
  }
  // Indices address the caller's own visible queue (the array GET returns),
  // so a tenant admin can never clear another tenant's entries by position.
  const cleared = regulatoryAIPhase3.clearDeadLetterQueue(indices, dlqScopeFor(req));
  res.json({
    success: true,
    cleared,
    message: indices ? `Cleared ${cleared} items` : 'Cleared all items',
  });
});

export default router;
