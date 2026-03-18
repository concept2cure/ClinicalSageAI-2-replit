/**
 * Account Intelligence Routes
 *
 * API endpoints for account-level canon, event ledger, skill bundles,
 * term dictionary, and template registry.
 *
 * @module server/routes/account-intelligence
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../auth';
import { createScopedLogger } from '../utils/logger';
import {
  assertCanonFact,
  validateCanonFact,
  lockCanonFact,
  supersedeCanonFact,
  getCanonItems,
  getEvents,
  resolveAccountContext,
  formatResolvedContextForPrompt,
  rebuildProjection,
  getProjection,
} from '../services/account-canon.js';
import {
  createSkillBundle,
  updateSkillBundle,
  getSkillBundles,
  addTerm,
  getTermDictionary,
  addTemplate,
  getTemplateRegistry,
} from '../services/account-skill-bundles.js';

const logger = createScopedLogger('account-intelligence');
const router = Router();

const getOrgId = (req: Request): number =>
  (req as any).organizationId ||
  parseInt(req.headers['x-organization-id'] as string, 10) ||
  1;

const getUserId = (req: Request): number | null =>
  (req as any).userId || (req as any).user?.id || null;

const getUserName = (req: Request): string | null =>
  (req as any).user?.name || (req as any).userName || null;

// ════════════════════════════════════════════════════════════════════════════
// CANON ITEMS
// ════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/account-intelligence/canon
 * Assert a new canon fact.
 */
router.post('/canon', authMiddleware, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      category: z.string().min(1),
      subcategory: z.string().optional(),
      key: z.string().min(1),
      title: z.string().min(1).max(500),
      content: z.string().min(1),
      submissionTypes: z.array(z.string()).optional(),
      moduleTypes: z.array(z.string()).optional(),
      workTypes: z.array(z.string()).optional(),
      regulatoryRegions: z.array(z.string()).optional(),
      sourceType: z.string().optional(),
      sourceDocumentId: z.string().optional(),
      sourceDescription: z.string().optional(),
      confidenceScore: z.number().min(0).max(1).optional(),
      metadata: z.record(z.unknown()).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { message: 'Validation failed', details: parsed.error.format() } });
    }

    const item = await assertCanonFact({
      ...parsed.data,
      organizationId: getOrgId(req),
      actorId: getUserId(req) || undefined,
      actorName: getUserName(req) || undefined,
    });

    return res.json({ success: true, data: item });
  } catch (error: any) {
    logger.error(`Failed to assert canon fact: ${error.message}`);
    return res.status(500).json({ success: false, error: { message: 'Failed to assert canon fact' } });
  }
});

/**
 * GET /api/account-intelligence/canon
 * List canon items for the organization.
 */
router.get('/canon', authMiddleware, async (req: Request, res: Response) => {
  try {
    const category = req.query.category as string | undefined;
    const status = req.query.status as string | undefined;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await getCanonItems(getOrgId(req), { category, status, limit, offset });
    return res.json({ success: true, data: result.items, meta: { total: result.total } });
  } catch (error: any) {
    logger.error(`Failed to get canon items: ${error.message}`);
    return res.status(500).json({ success: false, error: { message: 'Failed to get canon items' } });
  }
});

/**
 * POST /api/account-intelligence/canon/:id/validate
 * Validate (confirm) a canon fact.
 */
router.post('/canon/:id/validate', authMiddleware, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const actorId = getUserId(req);
    if (!actorId) return res.status(401).json({ success: false, error: { message: 'User required' } });

    await validateCanonFact(id, getOrgId(req), actorId, getUserName(req) || undefined);
    return res.json({ success: true, data: { validated: true } });
  } catch (error: any) {
    logger.error(`Failed to validate canon fact: ${error.message}`);
    return res.status(500).json({ success: false, error: { message: 'Failed to validate canon fact' } });
  }
});

/**
 * POST /api/account-intelligence/canon/:id/lock
 * Lock a canon fact (immutable after lock).
 */
router.post('/canon/:id/lock', authMiddleware, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const actorId = getUserId(req);
    if (!actorId) return res.status(401).json({ success: false, error: { message: 'User required' } });

    await lockCanonFact(id, getOrgId(req), actorId, getUserName(req) || undefined);
    return res.json({ success: true, data: { locked: true } });
  } catch (error: any) {
    logger.error(`Failed to lock canon fact: ${error.message}`);
    return res.status(500).json({ success: false, error: { message: 'Failed to lock canon fact' } });
  }
});

/**
 * POST /api/account-intelligence/canon/:id/supersede
 * Supersede a canon fact with a new version.
 */
router.post('/canon/:id/supersede', authMiddleware, async (req: Request, res: Response) => {
  try {
    const oldId = parseInt(req.params.id, 10);
    const schema = z.object({
      category: z.string().min(1),
      subcategory: z.string().optional(),
      key: z.string().min(1),
      title: z.string().min(1).max(500),
      content: z.string().min(1),
      submissionTypes: z.array(z.string()).optional(),
      moduleTypes: z.array(z.string()).optional(),
      workTypes: z.array(z.string()).optional(),
      regulatoryRegions: z.array(z.string()).optional(),
      sourceType: z.string().optional(),
      sourceDescription: z.string().optional(),
      confidenceScore: z.number().min(0).max(1).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { message: 'Validation failed', details: parsed.error.format() } });
    }

    const newItem = await supersedeCanonFact(oldId, {
      ...parsed.data,
      organizationId: getOrgId(req),
      actorId: getUserId(req) || undefined,
      actorName: getUserName(req) || undefined,
    });

    return res.json({ success: true, data: newItem });
  } catch (error: any) {
    logger.error(`Failed to supersede canon fact: ${error.message}`);
    return res.status(500).json({ success: false, error: { message: error.message || 'Failed to supersede canon fact' } });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// EVENT LEDGER
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/account-intelligence/events
 * Query the account event ledger.
 */
router.get('/events', authMiddleware, async (req: Request, res: Response) => {
  try {
    const eventType = req.query.eventType as string | undefined;
    const canonItemId = req.query.canonItemId ? parseInt(req.query.canonItemId as string) : undefined;
    const since = req.query.since ? new Date(req.query.since as string) : undefined;
    const limit = parseInt(req.query.limit as string) || 50;

    const events = await getEvents(getOrgId(req), { eventType, canonItemId, since, limit });
    return res.json({ success: true, data: events });
  } catch (error: any) {
    logger.error(`Failed to get events: ${error.message}`);
    return res.status(500).json({ success: false, error: { message: 'Failed to get events' } });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// PROJECTION
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/account-intelligence/projection
 * Get the current account state projection.
 */
router.get('/projection', authMiddleware, async (req: Request, res: Response) => {
  try {
    const projection = await getProjection(getOrgId(req));
    return res.json({ success: true, data: projection });
  } catch (error: any) {
    logger.error(`Failed to get projection: ${error.message}`);
    return res.status(500).json({ success: false, error: { message: 'Failed to get projection' } });
  }
});

/**
 * POST /api/account-intelligence/projection/rebuild
 * Rebuild the projection from the event ledger.
 */
router.post('/projection/rebuild', authMiddleware, async (req: Request, res: Response) => {
  try {
    await rebuildProjection(getOrgId(req));
    const projection = await getProjection(getOrgId(req));
    return res.json({ success: true, data: projection });
  } catch (error: any) {
    logger.error(`Failed to rebuild projection: ${error.message}`);
    return res.status(500).json({ success: false, error: { message: 'Failed to rebuild projection' } });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// CONTEXT RESOLUTION (Preview)
// ════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/account-intelligence/resolve
 * Preview what account context would be resolved for a given work context.
 */
router.post('/resolve', authMiddleware, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      submissionType: z.string().optional(),
      moduleType: z.string().optional(),
      workType: z.string().optional(),
      regulatoryRegion: z.string().optional(),
      projectId: z.number().optional(),
      maxItems: z.number().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { message: 'Validation failed' } });
    }

    const resolved = await resolveAccountContext({
      organizationId: getOrgId(req),
      ...parsed.data,
    });

    return res.json({
      success: true,
      data: {
        canonItems: resolved.canonItems.length,
        terms: resolved.terms.length,
        bundles: resolved.bundles.length,
        templates: resolved.templates.length,
        tokensEstimate: resolved.tokensEstimate,
        requestId: resolved.requestId,
        formatted: formatResolvedContextForPrompt(resolved),
        details: resolved,
      },
    });
  } catch (error: any) {
    logger.error(`Failed to resolve context: ${error.message}`);
    return res.status(500).json({ success: false, error: { message: 'Failed to resolve context' } });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// SKILL BUNDLES
// ════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/account-intelligence/bundles
 * Create a new skill bundle.
 */
router.post('/bundles', authMiddleware, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(200),
      description: z.string().optional(),
      bundleType: z.string().min(1),
      submissionTypes: z.array(z.string()).optional(),
      moduleTypes: z.array(z.string()).optional(),
      workTypes: z.array(z.string()).optional(),
      regulatoryRegions: z.array(z.string()).optional(),
      promptFragments: z.array(z.object({
        role: z.string(),
        content: z.string(),
        priority: z.number(),
      })).optional(),
      outputStructure: z.record(z.unknown()).optional(),
      evidencePreferences: z.record(z.unknown()).optional(),
      authorityResponseStyle: z.record(z.unknown()).optional(),
      policyBindings: z.array(z.object({
        policyType: z.string(),
        description: z.string(),
        enforcement: z.string(),
      })).optional(),
      artifactDefaults: z.record(z.unknown()).optional(),
      reviewerRequirements: z.record(z.unknown()).optional(),
      metadata: z.record(z.unknown()).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { message: 'Validation failed', details: parsed.error.format() } });
    }

    const bundle = await createSkillBundle({
      ...parsed.data,
      organizationId: getOrgId(req),
      actorId: getUserId(req) || undefined,
      actorName: getUserName(req) || undefined,
    });

    return res.json({ success: true, data: bundle });
  } catch (error: any) {
    logger.error(`Failed to create skill bundle: ${error.message}`);
    return res.status(500).json({ success: false, error: { message: 'Failed to create skill bundle' } });
  }
});

/**
 * GET /api/account-intelligence/bundles
 * List skill bundles.
 */
router.get('/bundles', authMiddleware, async (req: Request, res: Response) => {
  try {
    const bundleType = req.query.bundleType as string | undefined;
    const status = req.query.status as string | undefined;

    const bundles = await getSkillBundles(getOrgId(req), { bundleType, status });
    return res.json({ success: true, data: bundles });
  } catch (error: any) {
    logger.error(`Failed to get skill bundles: ${error.message}`);
    return res.status(500).json({ success: false, error: { message: 'Failed to get skill bundles' } });
  }
});

/**
 * PATCH /api/account-intelligence/bundles/:id
 * Update a skill bundle.
 */
router.patch('/bundles/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const bundle = await updateSkillBundle(
      id,
      getOrgId(req),
      req.body,
      getUserId(req) || undefined,
      getUserName(req) || undefined
    );
    return res.json({ success: true, data: bundle });
  } catch (error: any) {
    logger.error(`Failed to update skill bundle: ${error.message}`);
    return res.status(500).json({ success: false, error: { message: error.message || 'Failed to update skill bundle' } });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// TERM DICTIONARY
// ════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/account-intelligence/terms
 * Add a term to the dictionary.
 */
router.post('/terms', authMiddleware, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      term: z.string().min(1),
      definition: z.string().optional(),
      context: z.string().optional(),
      alternatives: z.array(z.string()).optional(),
      doNotUse: z.array(z.string()).optional(),
      category: z.string().optional(),
      bundleId: z.number().optional(),
      submissionTypes: z.array(z.string()).optional(),
      regulatoryRegions: z.array(z.string()).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { message: 'Validation failed' } });
    }

    const term = await addTerm({
      ...parsed.data,
      organizationId: getOrgId(req),
      actorId: getUserId(req) || undefined,
      actorName: getUserName(req) || undefined,
    });

    return res.json({ success: true, data: term });
  } catch (error: any) {
    logger.error(`Failed to add term: ${error.message}`);
    return res.status(500).json({ success: false, error: { message: 'Failed to add term' } });
  }
});

/**
 * GET /api/account-intelligence/terms
 * Get the term dictionary.
 */
router.get('/terms', authMiddleware, async (req: Request, res: Response) => {
  try {
    const category = req.query.category as string | undefined;
    const bundleId = req.query.bundleId ? parseInt(req.query.bundleId as string) : undefined;

    const terms = await getTermDictionary(getOrgId(req), { category, bundleId });
    return res.json({ success: true, data: terms });
  } catch (error: any) {
    logger.error(`Failed to get terms: ${error.message}`);
    return res.status(500).json({ success: false, error: { message: 'Failed to get terms' } });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// TEMPLATE REGISTRY
// ════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/account-intelligence/templates
 * Register an account-specific template.
 */
router.post('/templates', authMiddleware, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      templateKey: z.string().min(1),
      name: z.string().min(1).max(200),
      description: z.string().optional(),
      submissionType: z.string().optional(),
      regulatoryRegion: z.string().optional(),
      bundleId: z.number().optional(),
      sectionOverrides: z.array(z.object({
        sectionCode: z.string(),
        title: z.string().optional(),
        instruction: z.string().optional(),
        required: z.boolean().optional(),
        defaultContent: z.string().optional(),
        order: z.number().optional(),
      })).optional(),
      defaultMetadata: z.record(z.unknown()).optional(),
      headerFooter: z.record(z.unknown()).optional(),
      namingConvention: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: { message: 'Validation failed' } });
    }

    const template = await addTemplate({
      ...parsed.data,
      organizationId: getOrgId(req),
      actorId: getUserId(req) || undefined,
      actorName: getUserName(req) || undefined,
    });

    return res.json({ success: true, data: template });
  } catch (error: any) {
    logger.error(`Failed to add template: ${error.message}`);
    return res.status(500).json({ success: false, error: { message: 'Failed to add template' } });
  }
});

/**
 * GET /api/account-intelligence/templates
 * Get the template registry.
 */
router.get('/templates', authMiddleware, async (req: Request, res: Response) => {
  try {
    const submissionType = req.query.submissionType as string | undefined;
    const regulatoryRegion = req.query.regulatoryRegion as string | undefined;

    const templates = await getTemplateRegistry(getOrgId(req), { submissionType, regulatoryRegion });
    return res.json({ success: true, data: templates });
  } catch (error: any) {
    logger.error(`Failed to get templates: ${error.message}`);
    return res.status(500).json({ success: false, error: { message: 'Failed to get templates' } });
  }
});

export default router;
