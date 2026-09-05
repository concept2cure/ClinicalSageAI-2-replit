/**
 * Canonical submission core API (spec §8.3)
 *
 * The REST surface for the canonical core — the API the Phase-2 Builder and
 * Sequences workspaces render against, and that nothing previously exposed.
 * Mounted at /api/submissions with authenticateToken applied at mount time.
 *
 * Every handler resolves organizationId/userId from the authenticated session
 * only (never from body/params), validates with Zod, and is RBAC-gated.
 */

import { Router, Request, Response } from 'express';
import { promises as fs } from 'fs';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { requireRole } from '../middleware/auth';
import { isUuid } from '../middleware/uuidParam';
import { requestDb } from '../db/requestDb';
import { regulatoryPrograms } from '../../shared/schema/programs';
import { resolveProgramProjectAnchor } from '../services/c2c/program-project-anchor';
import {
  createGovernedExportConsequence,
  createAuditedUnplacedExport,
} from '../services/export/governedExportConsequence';
import { createRateLimiter } from '../middleware/rateLimiter';
import {
  createSubmission,
  listSubmissions,
  getSubmission,
  createSequence,
  listSequences,
  transitionSequence,
  listLeaves,
  upsertLeaf,
  removeLeaf,
} from '../services/submission-service/submission-service';
import { assessPathwayReadiness, PATHWAYS, type Pathway } from '../services/pathway-engines';
import {
  generateSubmissionPlan,
  explainValidation,
  computeCrossRegionGap,
  runDispatchQc,
} from '../services/submission-ai/submission-ai-service';
import {
  traceProvenance,
  runConsistencyCheck,
  listConsistencyFindings,
} from '../services/truth-engine/truth-engine-service';
import {
  runShadowReview,
  listShadowReviewRuns,
  getShadowReviewFindings,
} from '../services/shadow-review/shadow-review-service';
import { generateSection } from '../services/authoring/section-generation-service';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('submissions-routes');
const router = Router();
const limiter = createRateLimiter();

interface Ctx {
  userId: number;
  organizationId: number;
}
function ctxOf(req: Request): Ctx | null {
  const r = req as any;
  const userId = Number(r.user?.id);
  // Resolve the org the same way the rest of the platform does: tenant context
  // first, then the user claim. The org id is an integer FK; a non-numeric claim
  // (e.g. a UUID) is treated as unauthenticated rather than silently mis-scoped.
  const orgRaw = r.tenantContext?.organizationId ?? r.tenantId ?? r.user?.organizationId;
  const organizationId = Number(orgRaw);
  if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(organizationId) || organizationId <= 0) {
    return null;
  }
  return { userId, organizationId };
}

const CODE_STATUS: Record<string, number> = {
  NOT_FOUND: 404,
  INVALID_STATE: 409,
  GOVERNED_REQUIRED: 403,
  DISPATCH_BLOCKED: 422,
  NO_AUTHORED_CONTENT: 422,
  FORBIDDEN: 403,
  VALIDATION: 400,
  RATE_LIMITED: 429,
  OVERLOADED: 503,
  TOKEN_LIMIT_EXCEEDED: 413,
  INVALID_AI_RESPONSE: 502,
  PROVIDER_UNAVAILABLE: 503,
};

function fail(res: Response, err: unknown): void {
  // Any service error that carries a known `code` maps to a stable HTTP status.
  const code = (err as { code?: string } | null)?.code;
  if (code && CODE_STATUS[code]) {
    res.status(CODE_STATUS[code]).json({ error: { code, message: err instanceof Error ? err.message : 'Request failed.' } });
    return;
  }

  /* The support handle: `auditLog` (middleware/enterprise-security.ts) sets it
     before any route runs and echoes it as `X-Request-Id`, which is the
     "Reference <id>" the user reads off the error banner. Logging it is what
     makes a reported failure findable. */
  const header = res.getHeader('X-Request-Id');
  const correlationId = typeof header === 'string' && header ? header : null;

  /* ── 42P01: an unprovisioned store is not an internal error ────────────────
     MDX UAT 2026-08-18, item A2: GET /api/submissions returned 500 while
     GET /api/510k/estar/submissions returned 200. They are two different
     STORES, not two services: the canonical core lives in the `submissions`
     family created by migrations/20260604_submission_core_canonical.sql, which
     reached no durable applier until it was added to
     scripts/db/migration-set.mjs. On a database that never got it,
     `listSubmissions`' first statement raises 42P01.

     Reported as 500 INTERNAL that read as "the product is broken", when the
     true state is "this environment is not fully set up" — a different problem,
     with a different owner and a different fix. Every other router in this
     repository already answers 503 PENDING_STORE for exactly this (see
     `pendingStore` in routes/c2c/projects.ts, whose envelope this mirrors), and
     the client already branches on the code. Nothing here names the relation:
     the store is identified in the LOG, not in the response.

     Wiring the migration is the fix; this is the honest state for any database
     that has not applied it yet, and for the next store that goes missing. */
  if (code === '42P01') {
    const raw = err instanceof Error ? err.message : String(err);
    logger.error('Submission store not provisioned — request failed closed', {
      correlationId,
      code,
      store: /relation "([^"]+)" does not exist/i.exec(raw)?.[1] ?? null,
    });
    res.status(503).json({
      error: {
        code: 'PENDING_STORE',
        message:
          'This environment is not fully set up, so the submissions could not be read. ' +
          'Share the reference below with your system administrator or Concept2Cure support.',
      },
      ...(correlationId ? { correlationId } : {}),
    });
    return;
  }

  logger.error('submissions route error', {
    err: err instanceof Error ? err.message : String(err),
    correlationId,
    code: code ?? null,
  });
  res.status(500).json({
    error: { code: 'INTERNAL', message: 'Request failed.' },
    ...(correlationId ? { correlationId } : {}),
  });
}

const idParam = (v: string | string[] | undefined) => {
  const raw = Array.isArray(v) ? v[0] : v;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// ── Schemas ───────────────────────────────────────────────────────────────
const createSubmissionSchema = z.object({
  title: z.string().min(1).max(500),
  productName: z.string().max(500).optional(),
  applicationType: z.string().min(1).max(64),
  clientType: z.enum(['pharma', 'biotech', 'mdx', 'ivd']),
  primaryRegion: z.enum(['fda', 'ema', 'eu', 'pmda', 'jp', 'ca', 'uk', 'cn', 'au', 'ch', 'br', 'in', 'kr', 'sg']),
  lifecycleStage: z.string().max(64).optional(),
});
const createSequenceSchema = z.object({
  region: z.enum(['fda', 'ema', 'eu', 'pmda', 'jp', 'ca', 'uk', 'cn', 'au', 'ch', 'br', 'in', 'kr', 'sg']),
  sequenceNumber: z.string().regex(/^\d{4}$/, 'sequenceNumber must be 4 digits, e.g. "0000".'),
  type: z.enum(['original', 'amendment', 'response', 'variation', 'annual', 'withdrawal']).optional(),
});
const transitionSchema = z.object({
  status: z.enum(['assembling', 'validated', 'frozen', 'dispatched', 'draft']),
});
const upsertLeafSchema = z.object({
  leafId: z.coerce.number().int().positive().optional(),
  sectionCode: z.string().min(1).max(64),
  title: z.string().min(1).max(500),
  granularity: z.string().max(128).optional(),
  lifecycleOp: z.enum(['new', 'replace', 'append', 'delete']).optional(),
  documentTable: z.string().max(64).optional(),
  documentId: z.coerce.number().int().positive().optional(),
  documentType: z.string().max(64).optional(),
  parentLeafId: z.coerce.number().int().positive().optional(),
});

const AUTHOR = 'regulatory-author';

// ── Submissions ─────────────────────────────────────────────────────────────
router.get('/', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try {
    res.json(await listSubmissions(ctx));
  } catch (err) {
    fail(res, err);
  }
});

router.post('/', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = createSubmissionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    res.status(201).json(await createSubmission(parsed.data, ctx));
  } catch (err) {
    fail(res, err);
  }
});

// ── Capabilities (feature-gating for the UI) ─────────────────────────────────
// Registered before '/:id' so it is not shadowed by the id param route.
router.get('/capabilities', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const environment = req.query.environment === 'staging' ? 'staging' : 'production';
  try {
    const { gatewayConfigurationStatus } = await import('../services/submission-gateways/index.js');
    let gateways: Array<{ configured: boolean }> = [];
    try {
      gateways = (await gatewayConfigurationStatus(ctx.organizationId, environment)) as Array<{ configured: boolean }>;
    } catch {
      gateways = [];
    }
    res.json({
      environment,
      gateways,
      gatewaysConfigured: gateways.filter((g) => g.configured).length,
      // Which workspaces are server-ready today, keyed by the canonical workspace
      // ids in shared/types/submission-ui.ts (SUBMISSION_WORKSPACES) — no key drift.
      workspaces: {
        portfolio: true,
        planner: true,
        builder: true,
        sequences: true,
        validation: true,
        'shadow-review': true,
        'cross-region': true,
        dispatch: true,
      },
      // Capability flags (not workspaces). The assemble/publish BYTES are now
      // server-ready (eCTD packager + device technical-file ZIP both materialize
      // from the canonical core via the storage resolver). The wire TRANSMIT to the
      // agency stays gated behind the governed transmit path + Part 11 e-signature.
      features: {
        assemble: true,
        deviceTechnicalFile: true,
        pathwayManifest: true,
        publishTransmit: false,
      },
    });
  } catch (err) {
    fail(res, err);
  }
});

// ── Validation rule corpus (Validation workspace reference data) ──────────────
// The named, sourced eCTD validation criteria the gate checks against. Static
// reference data (not tenant-specific). Registered before '/:id' so the literal
// path is not shadowed by the id param route. `?region=` scopes to a framework.
router.get('/validation-rules', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const region = String(Array.isArray(req.query.region) ? req.query.region[0] : req.query.region ?? '');
  const REGIONS = ['fda', 'eu', 'jp', 'ca', 'au', 'ch'] as const;
  if (region && !(REGIONS as readonly string[]).includes(region)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: `region must be one of: ${REGIONS.join(', ')}.` } });
  }
  try {
    const { RULE_CORPUS, rulesForRegion, corpusSummary } = await import('../services/ectd/validation-rule-corpus.js');
    const rules = region ? rulesForRegion(region as (typeof REGIONS)[number]) : RULE_CORPUS;
    res.json({ region: region || 'all', summary: corpusSummary(), rules });
  } catch (err) {
    fail(res, err);
  }
});

// ── Market submission specifications (per-market governance + formatting) ─────
// The consolidated, per-market-per-format datasheet: formatting requirements, the
// governance (e-signature basis, sequencing, lifecycle), language/translation,
// gateway, forms, templates, and rule-corpus linkage. Static reference data.
// `?market=` (us|eu|jp|ca|…) and `?family=` (ectd|estar|eu_mdr|eu_ivdr|ctis) filter.
// Registered before '/:id' so the literal path is not shadowed.
router.get('/market-specs', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const market = String(Array.isArray(req.query.market) ? req.query.market[0] : req.query.market ?? '').toLowerCase();
  const family = String(Array.isArray(req.query.family) ? req.query.family[0] : req.query.family ?? '');
  const FAMILIES = ['ectd', 'estar', 'eu_mdr', 'eu_ivdr', 'ctis'];
  if (family && !FAMILIES.includes(family)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: `family must be one of: ${FAMILIES.join(', ')}.` } });
  }
  try {
    const m = await import('../services/market-specs/market-submission-specs.js');
    let specs = m.MARKET_SUBMISSION_SPECS;
    if (market) specs = specs.filter((s) => s.market === market);
    if (family) specs = specs.filter((s) => s.family === family);
    res.json({ market: market || 'all', family: family || 'all', summary: m.marketSpecSummary(), specs });
  } catch (err) {
    fail(res, err);
  }
});
router.get('/market-specs/:specId', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try {
    const { getMarketSpec } = await import('../services/market-specs/market-submission-specs.js');
    const spec = getMarketSpec(String(req.params.specId));
    if (!spec) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No market spec "${req.params.specId}".` } });
    res.json(spec);
  } catch (err) {
    fail(res, err);
  }
});

// ── Market formatting validation (enforce the datasheet against files) ────────
// Deterministically checks supplied file descriptors against a market spec's
// formatting rules (naming pattern, name/path length, accepted formats, size,
// encryption). Read-only computation; does NOT transmit.
const formattingValidateSchema = z.object({
  leaves: z.array(z.object({
    fileName: z.string().min(1).max(512),
    filePath: z.string().max(2048).optional(),
    fileSizeBytes: z.number().int().nonnegative().optional(),
    fileFormat: z.string().max(64).optional(),
    encrypted: z.boolean().optional(),
  })).max(10000),
});
router.post('/market-specs/:specId/validate', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = formattingValidateSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { getMarketSpec } = await import('../services/market-specs/market-submission-specs.js');
    const spec = getMarketSpec(String(req.params.specId));
    if (!spec) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No market spec "${req.params.specId}".` } });
    const { validateLeavesAgainstMarketSpec } = await import('../services/market-specs/market-formatting-validator.js');
    res.json(validateLeavesAgainstMarketSpec(spec, parsed.data.leaves));
  } catch (err) {
    fail(res, err);
  }
});

// ── Document template structures (canonical section skeletons) ───────────────
// The heading skeleton of the key submission documents (CTD M2 summaries, 510(k)
// summary, SmPC, GSPR, PER, IMPD) with each section's purpose + regulatory basis.
// Static reference data; `?family=` filters. Before '/:id' so it is not shadowed.
router.get('/document-templates', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const family = String(Array.isArray(req.query.family) ? req.query.family[0] : req.query.family ?? '');
  const FAMILIES = ['ectd', 'estar', 'eu_mdr', 'eu_ivdr', 'ctis'];
  if (family && !FAMILIES.includes(family)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: `family must be one of: ${FAMILIES.join(', ')}.` } });
  }
  try {
    const m = await import('../services/market-specs/document-template-library.js');
    const templates = family ? m.templatesForFamily(family as 'ectd' | 'estar' | 'eu_mdr' | 'eu_ivdr' | 'ctis') : m.DOCUMENT_TEMPLATES;
    res.json({ family: family || 'all', templates });
  } catch (err) {
    fail(res, err);
  }
});
router.get('/document-templates/:templateId', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try {
    const { getDocumentTemplate } = await import('../services/market-specs/document-template-library.js');
    const t = getDocumentTemplate(String(req.params.templateId));
    if (!t) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No document template "${req.params.templateId}".` } });
    res.json(t);
  } catch (err) {
    fail(res, err);
  }
});

// ── Submission requirements matrix (Planner) ─────────────────────────────────
// Per submission TYPE, the required CTD modules / document templates / forms, and
// a deterministic gap assessment. Static reference data + pure assessment.
router.get('/requirements', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const market = String(Array.isArray(req.query.market) ? req.query.market[0] : req.query.market ?? '').toLowerCase();
  try {
    const { SUBMISSION_REQUIREMENTS } = await import('../services/market-specs/submission-requirements.js');
    const requirements = market ? SUBMISSION_REQUIREMENTS.filter((r) => r.market === market) : SUBMISSION_REQUIREMENTS;
    res.json({ market: market || 'all', requirements });
  } catch (err) {
    fail(res, err);
  }
});
router.get('/requirements/:type', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try {
    const { getRequirements } = await import('../services/market-specs/submission-requirements.js');
    const r = getRequirements(String(req.params.type));
    if (!r) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No requirements for "${req.params.type}".` } });
    res.json(r);
  } catch (err) {
    fail(res, err);
  }
});
const requirementsAssessSchema = z.object({
  templateIds: z.array(z.string().max(128)).max(2000).optional(),
  documentNames: z.array(z.string().max(512)).max(2000).optional(),
  forms: z.array(z.string().max(256)).max(2000).optional(),
});
router.post('/requirements/:type/assess', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = requirementsAssessSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { assessRequirements } = await import('../services/market-specs/submission-requirements.js');
    const a = assessRequirements(String(req.params.type), parsed.data);
    if (!a) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No requirements for "${req.params.type}".` } });
    res.json(a);
  } catch (err) {
    fail(res, err);
  }
});

// ── Expedited-pathway eligibility (Planner) ──────────────────────────────────
// The criteria for the major accelerated/special designations + a deterministic
// eligibility assessment from yes/no answers.
router.get('/designations', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const market = String(Array.isArray(req.query.market) ? req.query.market[0] : req.query.market ?? '').toLowerCase();
  try {
    const { DESIGNATIONS, designationsForMarket } = await import('../services/market-specs/pathway-eligibility.js');
    res.json({ market: market || 'all', designations: market ? designationsForMarket(market) : DESIGNATIONS });
  } catch (err) {
    fail(res, err);
  }
});
const eligibilityAssessSchema = z.object({
  answers: z.record(z.string(), z.boolean()).default({}),
});
router.post('/designations/:id/assess', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = eligibilityAssessSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { assessEligibility } = await import('../services/market-specs/pathway-eligibility.js');
    const a = assessEligibility(String(req.params.id), parsed.data.answers);
    if (!a) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No designation "${req.params.id}".` } });
    res.json(a);
  } catch (err) {
    fail(res, err);
  }
});

// ── Post-submission change classification (lifecycle) ────────────────────────
// The FDA supplement / EU variation category catalog + a flag-driven classifier
// that maps a proposed change to its category and the canonical sequence type.
router.get('/change-categories', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const market = String(Array.isArray(req.query.market) ? req.query.market[0] : req.query.market ?? '').toLowerCase();
  if (market && market !== 'us' && market !== 'eu') {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'market must be one of: us, eu.' } });
  }
  try {
    const { CHANGE_CATEGORIES, categoriesForMarket } = await import('../services/market-specs/post-submission-changes.js');
    res.json({ market: market || 'all', categories: market ? categoriesForMarket(market as 'us' | 'eu') : CHANGE_CATEGORIES });
  } catch (err) {
    fail(res, err);
  }
});
const changeClassifySchema = z.object({
  market: z.enum(['us', 'eu']),
  flags: z.object({
    scopeExtension: z.boolean().optional(),
    majorImpact: z.boolean().optional(),
    moderateImpact: z.boolean().optional(),
    immediateSafetyChange: z.boolean().optional(),
    minimalImpact: z.boolean().optional(),
    euImmediateNotification: z.boolean().optional(),
  }).default({}),
});
router.post('/change-categories/classify', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = changeClassifySchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { recommendChangeCategory } = await import('../services/market-specs/post-submission-changes.js');
    res.json(recommendChangeCategory(parsed.data.market, parsed.data.flags));
  } catch (err) {
    fail(res, err);
  }
});

// ── Device evidence structures + classification + shadow reviewer (mdx/ivd) ──
// CER (MEDDEV 2.7/1 / MDR Annex XIV) and PER (IVDR Annex XIII) structure + gap
// assessment, the MDR/IVDR/FDA classification engine, and the reverse-workflow
// reviewer checklist. All deterministic, read-only/compute; never transmit.
router.get('/device/cer/structure', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try {
    const { CER_STAGES, CER_SECTIONS } = await import('../services/market-specs/cer-structure.js');
    res.json({ stages: CER_STAGES, sections: CER_SECTIONS });
  } catch (err) { fail(res, err); }
});
const cerAssessSchema = z.object({
  presentSectionIds: z.array(z.string().max(64)).max(200).default([]),
  equivalenceClaimed: z.boolean().optional(),
});
router.post('/device/cer/assess', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = cerAssessSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { assessCerStructure } = await import('../services/market-specs/cer-structure.js');
    res.json(assessCerStructure(parsed.data.presentSectionIds, { equivalenceClaimed: parsed.data.equivalenceClaimed }));
  } catch (err) { fail(res, err); }
});
router.get('/device/per/structure', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try {
    const { PER_PILLARS, ANALYTICAL_METRICS, CLINICAL_METRICS, PER_SECTIONS } = await import('../services/market-specs/per-structure.js');
    res.json({ pillars: PER_PILLARS, analyticalMetrics: ANALYTICAL_METRICS, clinicalMetrics: CLINICAL_METRICS, sections: PER_SECTIONS });
  } catch (err) { fail(res, err); }
});
const perAssessSchema = z.object({ presentSectionIds: z.array(z.string().max(64)).max(200).default([]) });
router.post('/device/per/assess', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = perAssessSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { assessPerStructure } = await import('../services/market-specs/per-structure.js');
    res.json(assessPerStructure(parsed.data.presentSectionIds));
  } catch (err) { fail(res, err); }
});
const classifySchema = z.object({ framework: z.enum(['mdr', 'ivdr', 'fda']), facts: z.record(z.string(), z.unknown()).default({}) });
router.post('/device/classify', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = classifySchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const m = await import('../services/market-specs/device-classification.js');
    const facts = parsed.data.facts as Record<string, never>;
    const result =
      parsed.data.framework === 'mdr' ? m.classifyMdr(facts)
        : parsed.data.framework === 'ivdr' ? m.classifyIvdr(facts)
          : m.recommendFdaPathway(facts);
    res.json({ framework: parsed.data.framework, ...result });
  } catch (err) { fail(res, err); }
});
router.get('/device/reviewer-checklist', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const type = String(Array.isArray(req.query.type) ? req.query.type[0] : req.query.type ?? '');
  const TYPES = ['510k', 'de_novo', 'pma', 'cer', 'per'];
  if (!TYPES.includes(type)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: `type must be one of: ${TYPES.join(', ')}.` } });
  }
  try {
    const { buildShadowReviewerChecklist } = await import('../services/market-specs/device-shadow-reviewer.js');
    res.json(buildShadowReviewerChecklist(type as '510k' | 'de_novo' | 'pma' | 'cer' | 'per'));
  } catch (err) { fail(res, err); }
});

// Risk management file (ISO 14971), biocompatibility (ISO 10993), software (IEC 62304).
router.get('/device/risk-management/structure', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try {
    const { RMF_SECTIONS } = await import('../services/market-specs/risk-management-structure.js');
    res.json({ sections: RMF_SECTIONS });
  } catch (err) { fail(res, err); }
});
const rmfAssessSchema = z.object({ presentSectionIds: z.array(z.string().max(64)).max(200).default([]) });
router.post('/device/risk-management/assess', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = rmfAssessSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { assessRmfStructure } = await import('../services/market-specs/risk-management-structure.js');
    res.json(assessRmfStructure(parsed.data.presentSectionIds));
  } catch (err) { fail(res, err); }
});
const biocompSchema = z.object({
  nature: z.enum(['skin', 'mucosal_membrane', 'breached_surface', 'blood_path_indirect', 'tissue_bone_dentin', 'circulating_blood', 'implant_tissue_bone', 'implant_blood']),
  duration: z.enum(['limited', 'prolonged', 'long_term']),
});
router.post('/device/biocompatibility', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = biocompSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { requiredBiocompEndpoints } = await import('../services/market-specs/biocompatibility-matrix.js');
    res.json(requiredBiocompEndpoints(parsed.data.nature, parsed.data.duration));
  } catch (err) { fail(res, err); }
});
const softwareSchema = z.object({
  canContributeToDeathOrSeriousInjury: z.boolean().optional(),
  canContributeToNonSeriousInjury: z.boolean().optional(),
});
router.post('/device/software/classify', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = softwareSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const m = await import('../services/market-specs/software-lifecycle.js');
    const cls = m.classifySoftware(parsed.data);
    res.json({ ...cls, deliverables: m.deliverablesForClass(cls.class), reviewerQuestions: m.SOFTWARE_REVIEWER_QUESTIONS });
  } catch (err) { fail(res, err); }
});

// The unified reverse-workflow blueprint — classification + requirements +
// applicable evidence modules + reviewer checklist in one object.
const blueprintSchema = z.object({
  submissionType: z.enum(['510k', 'de_novo', 'pma', 'mdr_td', 'ivdr_td']),
  classification: z.object({ framework: z.enum(['mdr', 'ivdr', 'fda']), facts: z.record(z.string(), z.unknown()) }).optional(),
  contact: z.object({
    nature: z.enum(['skin', 'mucosal_membrane', 'breached_surface', 'blood_path_indirect', 'tissue_bone_dentin', 'circulating_blood', 'implant_tissue_bone', 'implant_blood']),
    duration: z.enum(['limited', 'prolonged', 'long_term']),
  }).optional(),
  software: z.object({
    applicable: z.boolean(),
    canContributeToDeathOrSeriousInjury: z.boolean().optional(),
    canContributeToNonSeriousInjury: z.boolean().optional(),
    presentDeliverableIds: z.array(z.string().max(64)).max(100).optional(),
  }).optional(),
  electrical: z.object({
    electricallyPowered: z.boolean().optional(),
    hasAlarms: z.boolean().optional(),
    closedLoopControl: z.boolean().optional(),
    homeUse: z.boolean().optional(),
    emsUse: z.boolean().optional(),
    hasParticularStandard: z.boolean().optional(),
  }).optional(),
  sterilization: z.object({
    sterile: z.boolean().optional(),
    method: z.enum(['eo', 'radiation', 'steam', 'dry_heat', 'vh2o2', 'aseptic', 'unknown']).optional(),
  }).optional(),
  present: z.object({
    cerSectionIds: z.array(z.string().max(64)).max(200).optional(),
    perSectionIds: z.array(z.string().max(64)).max(200).optional(),
    rmfSectionIds: z.array(z.string().max(64)).max(200).optional(),
  }).optional(),
  equivalenceClaimed: z.boolean().optional(),
});
router.post('/device/blueprint', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = blueprintSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { buildDeviceBlueprint } = await import('../services/market-specs/device-blueprint.js');
    const { scorecardFromBlueprint } = await import('../services/market-specs/device-readiness-scorecard.js');
    const blueprint = buildDeviceBlueprint(parsed.data as Parameters<typeof buildDeviceBlueprint>[0]);
    res.json({ ...blueprint, scorecard: scorecardFromBlueprint(blueprint) });
  } catch (err) { fail(res, err); }
});

// Global multi-region device strategy (build once, file many).
router.get('/device/global-strategy', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const kind = String(Array.isArray(req.query.kind) ? req.query.kind[0] : req.query.kind ?? '');
  if (kind !== 'device' && kind !== 'ivd') {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'kind must be one of: device, ivd.' } });
  }
  const regRaw = Array.isArray(req.query.regions) ? req.query.regions[0] : req.query.regions;
  const regions = typeof regRaw === 'string' && regRaw ? regRaw.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
  try {
    const { buildGlobalDeviceStrategy } = await import('../services/market-specs/device-global-strategy.js');
    res.json(buildGlobalDeviceStrategy(kind as 'device' | 'ivd', regions as never));
  } catch (err) { fail(res, err); }
});

// Regulatory timeline for a pathway.
router.get('/device/timeline', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const pathway = String(Array.isArray(req.query.pathway) ? req.query.pathway[0] : req.query.pathway ?? '');
  try {
    const { getTimeline } = await import('../services/market-specs/regulatory-timelines.js');
    const t = getTimeline(pathway);
    if (!t) return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No timeline for pathway "${pathway}".` } });
    res.json(t);
  } catch (err) { fail(res, err); }
});

// UDI validation (GS1 check digit + AI parsing → GUDID/EUDAMED components).
const udiSchema = z.object({ udi: z.string().min(1).max(512) });
router.post('/device/udi/validate', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = udiSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { validateUdi } = await import('../services/market-specs/udi-validator.js');
    res.json(validateUdi(parsed.data.udi));
  } catch (err) { fail(res, err); }
});

// Electrical safety (IEC 60601) applicable standards from device facts.
const electricalSchema = z.object({
  electricallyPowered: z.boolean().optional(),
  hasAlarms: z.boolean().optional(),
  closedLoopControl: z.boolean().optional(),
  homeUse: z.boolean().optional(),
  emsUse: z.boolean().optional(),
  hasParticularStandard: z.boolean().optional(),
});
router.post('/device/electrical-safety', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = electricalSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { applicableElectricalStandards } = await import('../services/market-specs/electrical-safety.js');
    res.json(applicableElectricalStandards(parsed.data));
  } catch (err) { fail(res, err); }
});

// Sterilization requirements (ISO 11135/11137/17665) from device facts.
const sterilizationSchema = z.object({
  sterile: z.boolean().optional(),
  method: z.enum(['eo', 'radiation', 'steam', 'dry_heat', 'vh2o2', 'aseptic', 'unknown']).optional(),
});
router.post('/device/sterilization', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = sterilizationSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { sterilizationRequirements } = await import('../services/market-specs/sterilization.js');
    res.json(sterilizationRequirements(parsed.data));
  } catch (err) { fail(res, err); }
});

// Regulatory capabilities index — one call for the UI to discover the whole layer.
router.get('/regulatory-capabilities', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try {
    const { regulatoryCapabilitiesIndex } = await import('../services/market-specs/regulatory-capabilities-index.js');
    res.json(regulatoryCapabilitiesIndex());
  } catch (err) { fail(res, err); }
});

// Combination product assessment (21 CFR Part 3 PMOA → lead center).
const combinationSchema = z.object({
  components: z.array(z.enum(['drug', 'biologic', 'device'])).min(1).max(5),
  primaryModeOfAction: z.enum(['drug', 'biologic', 'device']).optional(),
  combinationType: z.enum(['single_entity', 'co_packaged', 'cross_labeled']).optional(),
});
router.post('/combination-product/assess', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = combinationSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { assessCombinationProduct } = await import('../services/market-specs/combination-products.js');
    res.json(assessCombinationProduct(parsed.data));
  } catch (err) { fail(res, err); }
});

// Quality management system (ISO 13485 ↔ FDA QMSR) structure + readiness.
router.get('/device/qms/structure', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try {
    const { QMS_CLAUSES, FDA_QMSR_NOTE } = await import('../services/market-specs/quality-system.js');
    res.json({ clauses: QMS_CLAUSES, fdaNote: FDA_QMSR_NOTE });
  } catch (err) { fail(res, err); }
});
const qmsAssessSchema = z.object({ presentClauseIds: z.array(z.string().max(64)).max(100).default([]) });
router.post('/device/qms/assess', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = qmsAssessSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { assessQmsReadiness } = await import('../services/market-specs/quality-system.js');
    res.json(assessQmsReadiness(parsed.data.presentClauseIds));
  } catch (err) { fail(res, err); }
});

// Device labeling requirements (21 CFR 801 / MDR Annex I §23 / ISO 15223-1) from facts.
const labelingSchema = z.object({
  sterile: z.boolean().optional(),
  singleUse: z.boolean().optional(),
  reusable: z.boolean().optional(),
  implantable: z.boolean().optional(),
  prescriptionOnly: z.boolean().optional(),
  forClinicalInvestigation: z.boolean().optional(),
  hasExpiry: z.boolean().optional(),
  containsMedicinalSubstance: z.boolean().optional(),
});
router.post('/device/labeling', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = labelingSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { deviceLabelingRequirements } = await import('../services/market-specs/device-labeling.js');
    res.json(deviceLabelingRequirements(parsed.data));
  } catch (err) { fail(res, err); }
});

// Gap-check a STORED CER (cer_reports/cer_sections) against the canonical structure.
// Tenant-scoped; needs a database. 404 when the report is not in the organization.
router.get('/device/cer/:reportId/assess-stored', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const equivalenceClaimed = req.query.equivalenceClaimed === 'true' || req.query.equivalenceClaimed === '1';
  try {
    const { assessStoredCer } = await import('../services/market-specs/stored-cer-assessment.js');
    res.json(await assessStoredCer({ reportId: String(req.params.reportId), organizationId: ctx.organizationId, equivalenceClaimed }));
  } catch (err) { fail(res, err); }
});

router.get('/:id', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = idParam(req.params.id);
  if (id === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid submission id.' } });
  try {
    res.json(await getSubmission(id, ctx));
  } catch (err) {
    fail(res, err);
  }
});

// ── Sequences ─────────────────────────────────────────────────────────────
router.get('/:id/sequences', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = idParam(req.params.id);
  if (id === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid submission id.' } });
  try {
    res.json(await listSequences(id, ctx));
  } catch (err) {
    fail(res, err);
  }
});

router.post('/:id/sequences', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = idParam(req.params.id);
  if (id === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid submission id.' } });
  const parsed = createSequenceSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    res.status(201).json(await createSequence({ submissionId: id, ...parsed.data }, ctx));
  } catch (err) {
    fail(res, err);
  }
});

router.post('/sequences/:seqId/transition', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const seqId = idParam(req.params.seqId);
  if (seqId === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid sequence id.' } });
  const parsed = transitionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    res.json(await transitionSequence(seqId, parsed.data.status, ctx));
  } catch (err) {
    fail(res, err);
  }
});

// ── Builder leaves ──────────────────────────────────────────────────────────
router.get('/sequences/:seqId/leaves', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const seqId = idParam(req.params.seqId);
  if (seqId === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid sequence id.' } });
  try {
    res.json(await listLeaves(seqId, ctx));
  } catch (err) {
    fail(res, err);
  }
});

router.put('/sequences/:seqId/leaves', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const seqId = idParam(req.params.seqId);
  if (seqId === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid sequence id.' } });
  const parsed = upsertLeafSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    res.json(await upsertLeaf({ sequenceId: seqId, ...parsed.data }, ctx));
  } catch (err) {
    fail(res, err);
  }
});

// Remove a misplaced leaf (draft-stage sequences only; soft delete, audited).
// Before this, a wrong placement could only be corrected in place — never
// removed (BP-W1-6 find F05).
router.delete('/sequences/:seqId/leaves/:leafId', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const seqId = idParam(req.params.seqId);
  const leafId = idParam(req.params.leafId);
  if (seqId === null || leafId === null) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid sequence or leaf id.' } });
  }
  try {
    await removeLeaf(leafId, seqId, ctx);
    res.status(204).end();
  } catch (err) {
    fail(res, err);
  }
});

// ── Planner (AI) ────────────────────────────────────────────────────────────
const planSchema = z.object({
  applicationType: z.string().min(1).max(64),
  clientType: z.enum(['pharma', 'biotech', 'mdx', 'ivd']),
  regions: z.array(z.enum(['fda', 'ema', 'eu', 'pmda', 'jp', 'ca', 'uk', 'cn', 'au', 'ch', 'br', 'in', 'kr', 'sg'])).min(1),
  productProfile: z.string().max(4000).optional(),
});
router.post('/:id/plan', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = idParam(req.params.id);
  if (id === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid submission id.' } });
  const parsed = planSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    await getSubmission(id, ctx); // tenant ownership
    res.json(await generateSubmissionPlan(parsed.data, { ...ctx, submissionId: id }));
  } catch (err) {
    fail(res, err);
  }
});

// ── Validation co-pilot (AI explain) ─────────────────────────────────────────
const explainSchema = z.object({
  region: z.enum(['fda', 'ema', 'eu', 'pmda', 'jp', 'ca', 'uk', 'cn', 'au', 'ch', 'br', 'in', 'kr', 'sg']),
  findings: z
    .array(z.object({ ruleId: z.string().optional(), severity: z.enum(['error', 'warning', 'info']), message: z.string(), leaf: z.string().optional() }))
    .min(1),
});
router.post('/:id/validation/explain', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = idParam(req.params.id);
  if (id === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid submission id.' } });
  const parsed = explainSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    await getSubmission(id, ctx);
    res.json(await explainValidation(parsed.data, { ...ctx, submissionId: id }));
  } catch (err) {
    fail(res, err);
  }
});

// ── Cross-region gap (AI) ────────────────────────────────────────────────────
const crossRegionSchema = z.object({
  sourceRegion: z.enum(['fda', 'ema', 'eu', 'pmda', 'jp', 'ca', 'uk', 'cn', 'au', 'ch', 'br', 'in', 'kr', 'sg']),
  targetRegions: z.array(z.enum(['fda', 'ema', 'eu', 'pmda', 'jp', 'ca', 'uk', 'cn', 'au', 'ch', 'br', 'in', 'kr', 'sg'])).min(1),
  applicationType: z.string().min(1).max(64),
  sectionsPresent: z.array(z.string()).optional(),
});
router.post('/:id/cross-region', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = idParam(req.params.id);
  if (id === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid submission id.' } });
  const parsed = crossRegionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    await getSubmission(id, ctx);
    res.json(await computeCrossRegionGap(parsed.data, { ...ctx, submissionId: id }));
  } catch (err) {
    fail(res, err);
  }
});

// ── Dispatch QC gate (AI; does NOT transmit) ─────────────────────────────────
// When `sequenceId` is supplied the gate inputs are computed SERVER-SIDE from the
// canonical core (never the client numbers) — the AI advisory then floors on real
// values. Without a sequenceId it falls back to the supplied numbers (advisory
// only); prefer GET /sequences/:seqId/dispatch-readiness for the tamper-proof gate.
const dispatchQcSchema = z.object({
  region: z.enum(['fda', 'ema', 'eu', 'pmda', 'jp', 'ca', 'uk', 'cn', 'au', 'ch', 'br', 'in', 'kr', 'sg']),
  sequenceId: z.number().int().positive().optional(),
  validationErrors: z.number().int().min(0),
  unresolvedShadowCriticals: z.number().int().min(0),
  leaves: z.array(z.object({ sectionCode: z.string(), operation: z.string() })),
});
router.post('/:id/dispatch-qc', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = idParam(req.params.id);
  if (id === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid submission id.' } });
  const parsed = dispatchQcSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    await getSubmission(id, ctx);
    let input = parsed.data;
    if (parsed.data.sequenceId) {
      // Authoritative, tamper-proof gate inputs from server state.
      const { assessSequenceDispatchReadiness } = await import('../services/ectd/assess-dispatch-readiness');
      const a = await assessSequenceDispatchReadiness({ sequenceId: parsed.data.sequenceId, organizationId: ctx.organizationId });
      input = { ...parsed.data, validationErrors: a.validationErrors, unresolvedShadowCriticals: a.unacknowledgedShadowCriticals };
    }
    res.json(await runDispatchQc(input, { ...ctx, submissionId: id }));
  } catch (err) {
    fail(res, err);
  }
});

// ── Truth Engine: provenance + consistency ───────────────────────────────────
router.get('/:id/provenance', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = idParam(req.params.id);
  if (id === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid submission id.' } });
  const section = Array.isArray(req.query.section) ? String(req.query.section[0]) : typeof req.query.section === 'string' ? req.query.section : '';
  if (!section) return res.status(400).json({ error: { code: 'VALIDATION', message: 'query param "section" is required.' } });
  try {
    res.json(await traceProvenance({ submissionId: id, targetSectionCode: section }, ctx));
  } catch (err) {
    fail(res, err);
  }
});

const consistencySchema = z.object({
  dimension: z.string().min(1).max(64),
  left: z.object({ ref: z.string(), text: z.string() }),
  right: z.array(z.object({ ref: z.string(), text: z.string() })).min(1),
});
router.post('/:id/consistency', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = idParam(req.params.id);
  if (id === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid submission id.' } });
  const parsed = consistencySchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    res.json(await runConsistencyCheck({ submissionId: id, ...parsed.data }, ctx));
  } catch (err) {
    fail(res, err);
  }
});
router.get('/:id/consistency', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = idParam(req.params.id);
  if (id === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid submission id.' } });
  try {
    res.json(await listConsistencyFindings(id, ctx));
  } catch (err) {
    fail(res, err);
  }
});

// ── Shadow Review (the moat) ────────────────────────────────────────────────
const shadowSchema = z.object({
  lens: z.enum(['fda_filing', 'ema_d120', 'pmda', 'nb_mdr', 'nb_ivdr']).optional(),
});
router.post('/sequences/:seqId/shadow-review', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const seqId = idParam(req.params.seqId);
  if (seqId === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid sequence id.' } });
  const parsed = shadowSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    res.json(await runShadowReview({ sequenceId: seqId, lens: parsed.data.lens, organizationId: ctx.organizationId, userId: ctx.userId }));
  } catch (err) {
    fail(res, err);
  }
});
router.get('/sequences/:seqId/shadow-review', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const seqId = idParam(req.params.seqId);
  if (seqId === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid sequence id.' } });
  try {
    res.json(await listShadowReviewRuns(seqId, ctx));
  } catch (err) {
    fail(res, err);
  }
});
router.get('/shadow-review/:runId/findings', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const runId = idParam(req.params.runId);
  if (runId === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid run id.' } });
  try {
    res.json(await getShadowReviewFindings(runId, ctx));
  } catch (err) {
    fail(res, err);
  }
});

// ── Authoring (section-generation, streamed via SSE) ─────────────────────────
const generateSectionSchema = z.object({
  sectionCode: z.string().min(1).max(64),
  evidence: z.array(z.object({ id: z.string(), source: z.string(), text: z.string() })).default([]),
  productContext: z.string().max(8000).optional(),
});
router.post('/:id/sections/generate', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = idParam(req.params.id);
  if (id === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid submission id.' } });
  const parsed = generateSectionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });

  // Server-Sent Events: stream tokens as `chunk`, then a final `done` (or `error`).
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  (res as unknown as { flushHeaders?: () => void }).flushHeaders?.();
  // Stop writing once the client disconnects (avoids EPIPE / write-after-end).
  let closed = false;
  req.on('close', () => {
    closed = true;
  });
  const send = (event: string, data: unknown) => {
    if (closed) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  try {
    const result = await generateSection({ submissionId: id, ...parsed.data }, ctx, (text) => send('chunk', { text }));
    send('done', result);
  } catch (err) {
    const code = (err as { code?: string } | null)?.code ?? 'INTERNAL';
    logger.error('section generation failed', { err: err instanceof Error ? err.message : String(err) });
    send('error', { code, message: err instanceof Error ? err.message : 'Generation failed.' });
  } finally {
    res.end();
  }
});

// ── Pathway readiness (CTIS / MDR / IVDR / eSTAR — non-eCTD projections) ──────
// Projects the sequence's canonical leaves onto a target pathway's required
// structure and returns a gap/readiness report. Map + gap-check only; never
// submits. Deterministic — no AI.
router.get('/sequences/:seqId/pathway-readiness', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const seqId = idParam(req.params.seqId);
  if (seqId === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid sequence id.' } });
  const pathway = String(Array.isArray(req.query.pathway) ? req.query.pathway[0] : req.query.pathway ?? '');
  if (!(PATHWAYS as string[]).includes(pathway)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: `pathway must be one of: ${PATHWAYS.join(', ')}.` } });
  }
  const msRaw = Array.isArray(req.query.memberStates) ? req.query.memberStates[0] : req.query.memberStates;
  const memberStates = typeof msRaw === 'string' && msRaw ? msRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];
  try {
    const leaves = await listLeaves(seqId, ctx); // tenant-scoped
    const result = assessPathwayReadiness({
      pathway: pathway as Pathway,
      leaves: leaves.map((l) => ({ sectionCode: l.sectionCode, title: l.title, documentType: l.documentType ?? undefined })),
      memberStates,
    });
    res.json(result);
  } catch (err) {
    fail(res, err);
  }
});

// ── Universal pathway manifest (assembled ToC for ANY non-eCTD pathway) ───────
// One uniform table-of-contents across eSTAR / CTIS / MDR / IVDR / PMDA: runs the
// pathway engine, then projects its result into ordered entries (group + path +
// present/missing + sources). Deterministic, read-only — maps + reports gaps.
router.get('/sequences/:seqId/pathway-manifest', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const seqId = idParam(req.params.seqId);
  if (seqId === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid sequence id.' } });
  const pathway = String(Array.isArray(req.query.pathway) ? req.query.pathway[0] : req.query.pathway ?? '');
  if (!(PATHWAYS as string[]).includes(pathway)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: `pathway must be one of: ${PATHWAYS.join(', ')}.` } });
  }
  const msRaw = Array.isArray(req.query.memberStates) ? req.query.memberStates[0] : req.query.memberStates;
  const memberStates = typeof msRaw === 'string' && msRaw ? msRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];
  try {
    const leaves = await listLeaves(seqId, ctx); // tenant-scoped
    const { buildPathwayManifest } = await import('../services/pathway-engines/pathway-manifest');
    const result = assessPathwayReadiness({
      pathway: pathway as Pathway,
      leaves: leaves.map((l) => ({ sectionCode: l.sectionCode, title: l.title, documentType: l.documentType ?? undefined })),
      memberStates,
    });
    res.json(buildPathwayManifest(pathway as Pathway, result.detail));
  } catch (err) {
    fail(res, err);
  }
});

// ── Device technical-file manifest (EU MDR/IVDR assemble structure) ───────────
// The device equivalent of the eCTD index: projects the sequence's canonical
// leaves onto the MDR/IVDR Annex II/III structure and returns the assembled
// table-of-contents (ordered sections, paths, present/missing, sources).
// Deterministic, read-only — maps + reports gaps, never invents content.
router.get('/sequences/:seqId/technical-file', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const seqId = idParam(req.params.seqId);
  if (seqId === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid sequence id.' } });
  const regulation = String(Array.isArray(req.query.regulation) ? req.query.regulation[0] : req.query.regulation ?? '');
  if (regulation !== 'mdr' && regulation !== 'ivdr') {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'regulation must be one of: mdr, ivdr.' } });
  }
  try {
    const leaves = await listLeaves(seqId, ctx); // tenant-scoped
    const { assembleTechDoc } = await import('../services/pathway-engines');
    const { buildTechnicalFileManifest } = await import('../services/pathway-engines/technical-file-manifest');
    const result = assembleTechDoc({
      regulation,
      leaves: leaves.map((l) => ({ sectionCode: l.sectionCode, title: l.title, documentType: l.documentType ?? undefined })),
    });
    res.json(buildTechnicalFileManifest(result));
  } catch (err) {
    fail(res, err);
  }
});

// ── Device technical-file DELIVERY (shared by both technical-file routes) ─────
// The assembled ZIP bytes go through the SAME governed-export consequence the
// eSTAR /build route uses: `createGovernedExportConsequence` (artifact registry
// + provenance + EXPORT_GENERATED audit) when a PM-spine project anchors the
// program, `createAuditedUnplacedExport` (delivered + audit-logged with the
// SHA-256, registry placement pending) otherwise. Either way the caller gets
// the bytes — an assemble must never delete the package before anyone can
// download it, and must never answer with a checksum of a file that no longer
// exists.
const GOVERNED_EXPORT_SIZE_CAP_RE = /INVALID_GOVERNED_EXPORT_INPUT: binaryOutput exceeds max size/;

interface TechnicalFileDelivery {
  bytes: Buffer;
  filename: string;
  regulation: 'mdr' | 'ivdr';
  /** The manifest.json content — the artifact's source content for provenance. */
  manifest: unknown;
  title: string;
  backendRoute: string;
  /** Program-scoped delivery: the program and its PM-spine anchor (null when unanchored). */
  program: { id: string; anchorProjectId: number | null } | null;
  /** Audit anchor for the unplaced path. */
  resourceType: string;
  resourceId: string;
  /** Assembly facts carried into the export metadata. */
  report: Record<string, unknown>;
}

async function deliverTechnicalFile(ctx: Ctx, d: TechnicalFileDelivery) {
  const metadata: Record<string, unknown> = {
    format: 'zip',
    package: `EU ${d.regulation.toUpperCase()} technical file (Annex II/III tree + manifest + checksums)`,
    regulation: d.regulation,
    programId: d.program?.id,
    ...d.report,
  };
  if (d.program && d.program.anchorProjectId !== null) {
    return createGovernedExportConsequence({
      organizationId: ctx.organizationId,
      projectId: d.program.anchorProjectId,
      userId: ctx.userId,
      title: d.title,
      contentForArtifact: JSON.stringify(d.manifest),
      sourceType: 'export_zip',
      ctdSection: d.regulation === 'mdr' ? 'eu-mdr-annex-ii' : 'eu-ivdr-annex-ii',
      suggestedPlacement: `EU ${d.regulation.toUpperCase()} technical documentation (Annex II/III)`,
      backendRoute: d.backendRoute,
      binaryOutput: d.bytes,
      mimeType: 'application/zip',
      filename: d.filename,
      metadata,
    });
  }
  return createAuditedUnplacedExport({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    sourceType: 'export_zip',
    backendRoute: d.backendRoute,
    resourceType: d.resourceType,
    resourceId: d.resourceId,
    programUuid: d.program?.id ?? null,
    filename: d.filename,
    mimeType: 'application/zip',
    buffer: d.bytes,
    metadata,
  });
}

/** Technical-file error mapping: the governed size cap is an honest 413, everything else goes through `fail`. */
function technicalFileFail(res: Response, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  if (GOVERNED_EXPORT_SIZE_CAP_RE.test(message)) {
    res.status(413).json({
      error: {
        code: 'EXPORT_TOO_LARGE',
        message:
          'The assembled technical file exceeds the governed-export size cap and was not delivered. ' +
          'Reduce the package (split large section bodies) or raise GOVERNED_EXPORT_MAX_BYTES.',
      },
    });
    return;
  }
  fail(res, err);
}

// ── Device technical-file ASSEMBLE (materialize the MDR/IVDR ZIP) ─────────────
// Device counterpart of POST /assemble: materializes the sequence's leaves into a
// real technical-file ZIP (Annex II/III tree + manifest.json + checksums) with
// valid PDF leaves, reads the bytes BEFORE the staging directory is removed, and
// delivers them through the governed-export consequence (a sequence carries no
// PM-spine program anchor, so this is the audited-unplaced delivery). Does NOT
// transmit — submit/transmit stays behind the governed transmit path + e-sign.
const techFileAssembleSchema = z.object({
  regulation: z.enum(['mdr', 'ivdr']),
  applicationId: z.string().min(1).max(128).optional(),
  productName: z.string().min(1).max(256).optional(),
  manufacturer: z.string().min(1).max(256).optional(),
});
router.post('/sequences/:seqId/technical-file/assemble', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const seqId = idParam(req.params.seqId);
  if (seqId === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid sequence id.' } });
  const parsed = techFileAssembleSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { assembleTechnicalFileFromCore } = await import('../services/pathway-engines/mdr-ivdr/assemble-technical-file-from-core');
    const result = await assembleTechnicalFileFromCore({
      sequenceId: seqId,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      regulation: parsed.data.regulation,
      applicationId: parsed.data.applicationId ?? `UNASSIGNED-SEQ-${seqId}`,
      productName: parsed.data.productName,
      manufacturer: parsed.data.manufacturer,
    });
    let bytes: Buffer;
    let manifest: unknown = null;
    try {
      // Read the bytes while the staged package still exists; cleanup runs in
      // `finally` so the temp dir is removed on every path, including a throw.
      bytes = await fs.readFile(result.bundle.path);
      try {
        const { default: JSZip } = await import('jszip');
        const zip = await JSZip.loadAsync(bytes);
        const manifestJson = await zip.file('manifest.json')?.async('string');
        manifest = manifestJson ? JSON.parse(manifestJson) : null;
      } catch {
        manifest = null;
      }
    } finally {
      await result.cleanup();
    }
    const report = {
      ready: result.ready,
      fileCount: result.bundle.fileCount,
      materialized: result.materialized,
      skipped: result.skipped.length,
      unresolved: result.unresolvedLeaves.length,
      unfinalized: result.unfinalized,
    };
    const consequence = await deliverTechnicalFile(ctx, {
      bytes,
      filename: result.bundle.path.split('/').pop() ?? `SEQ-${seqId}-technical-file-${parsed.data.regulation}.zip`,
      regulation: parsed.data.regulation,
      manifest: manifest ?? { regulation: parsed.data.regulation, sequenceId: seqId, ...report },
      title: result.bundle.displayName,
      backendRoute: 'POST /api/submissions/sequences/:seqId/technical-file/assemble',
      program: null,
      resourceType: 'ectd_sequence',
      resourceId: String(seqId),
      report,
    });
    // Sanitized — never expose the server temp path.
    res.json({
      ok: true,
      regulation: parsed.data.regulation,
      ready: result.ready,
      sha256: result.bundle.sha256,
      sizeBytes: result.bundle.sizeBytes,
      fileCount: result.bundle.fileCount,
      materialized: result.materialized,
      skipped: result.skipped,
      unresolvedLeaves: result.unresolvedLeaves,
      unfinalized: result.unfinalized,
      unfinalizedSections: result.unfinalizedSections,
      ...consequence,
    });
  } catch (err) {
    technicalFileFail(res, err);
  }
});

// ── Device technical-file EXPORT from the GOVERNED document ───────────────────
// Packages the program's authored mdr/ivdr document (c2c_documents +
// c2c_document_sections — the rows the MDx editor and the eu-mdr / eu-ivdr rule
// packs write) into the technical-file ZIP and delivers it through the governed
// export consequence. The program is proved to belong to the caller's org via
// the request-scoped client BEFORE the assembler runs (404 otherwise — a foreign
// program is indistinguishable from a missing one). 422 NO_AUTHORED_CONTENT when
// nothing of that regulation has been authored; never an empty package.
const techFileExportSchema = z.object({
  regulation: z.enum(['mdr', 'ivdr']),
  productName: z.string().min(1).max(256).optional(),
  manufacturer: z.string().min(1).max(256).optional(),
});
router.post('/programs/:programId/technical-file/export', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const programId = String(Array.isArray(req.params.programId) ? req.params.programId[0] : req.params.programId ?? '');
  if (!isUuid(programId)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid program id.' } });
  const parsed = techFileExportSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const rdb = requestDb(req);
    const [program] = await rdb
      .select({ id: regulatoryPrograms.id, name: regulatoryPrograms.name, productName: regulatoryPrograms.productName })
      .from(regulatoryPrograms)
      .where(and(eq(regulatoryPrograms.id, programId), eq(regulatoryPrograms.organizationId, ctx.organizationId)))
      .limit(1);
    if (!program) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Program not found.' } });
    }

    const { assembleTechnicalFileFromProgram } = await import('../services/pathway-engines/mdr-ivdr/assemble-technical-file-from-core');
    const result = await assembleTechnicalFileFromProgram({
      programId,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      regulation: parsed.data.regulation,
      productName: parsed.data.productName ?? program.productName ?? undefined,
      manufacturer: parsed.data.manufacturer,
    });

    const anchorProjectId = await resolveProgramProjectAnchor(rdb, {
      programId,
      orgId: ctx.organizationId,
      context: 'submissions.technical-file.export',
    });
    const report = {
      ready: result.ready,
      fileCount: result.fileCount,
      materialized: result.materialized,
      leafCount: result.leafCount,
      skipped: result.skipped.length,
      unresolved: result.unresolvedLeaves.length,
      unfinalized: result.unfinalized,
    };
    const consequence = await deliverTechnicalFile(ctx, {
      bytes: result.buffer,
      filename: result.filename,
      regulation: parsed.data.regulation,
      manifest: result.manifest,
      title: `${program.name ?? programId} — EU ${parsed.data.regulation.toUpperCase()} technical file`,
      backendRoute: 'POST /api/submissions/programs/:programId/technical-file/export',
      program: { id: programId, anchorProjectId },
      resourceType: 'device_technical_file',
      resourceId: programId,
      report,
    });
    res.json({
      ok: true,
      regulation: parsed.data.regulation,
      programId,
      ready: result.ready,
      sha256: result.sha256,
      sizeBytes: result.sizeBytes,
      fileCount: result.fileCount,
      materialized: result.materialized,
      leafCount: result.leafCount,
      skipped: result.skipped,
      unresolvedLeaves: result.unresolvedLeaves,
      unfinalized: result.unfinalized,
      unfinalizedSections: result.unfinalizedSections,
      ...consequence,
    });
  } catch (err) {
    technicalFileFail(res, err);
  }
});

// ── Assemble (assemble step of assemble→submit→transmit) ──────────────────────
// Drives the real eCTD publisher off the sequence's canonical leaves. Returns a
// sanitized package descriptor (no server paths). Does NOT transmit — submit/
// transmit stays behind the governed transmit_submission tool + Part 11 e-sign.
const assembleSchema = z.object({
  applicationId: z.string().min(1).max(128).optional(),
  sponsorId: z.string().min(1).max(128).optional(),
  sponsorName: z.string().min(1).max(256).optional(),
});
router.post('/sequences/:seqId/assemble', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const seqId = idParam(req.params.seqId);
  if (seqId === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid sequence id.' } });
  const parsed = assembleSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { assembleSequence } = await import('../services/ectd/assemble-from-core');
    const result = await assembleSequence({
      sequenceId: seqId,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      // Never fabricate an agency identifier — these reach the regional
      // backbone and the package filename. Unassigned values say so.
      applicationId: parsed.data.applicationId ?? `UNASSIGNED-SEQ-${seqId}`,
      sponsorId: parsed.data.sponsorId ?? `UNASSIGNED-ORG-${ctx.organizationId}`,
      sponsorName: parsed.data.sponsorName ?? `UNASSIGNED (organization ${ctx.organizationId})`,
    });
    // Assemble-only: the response carries metadata, not bytes — the staged
    // temp package is not needed once we've read the descriptor.
    await result.cleanup();
    // Sanitized — never expose the server temp path.
    res.json({
      ok: true,
      sha256: result.bundle.sha256,
      format: result.bundle.format,
      sizeBytes: result.bundle.sizeBytes,
      materialized: result.materialized,
      skipped: result.skipped,
      unresolvedLeaves: result.unresolvedLeaves,
    });
  } catch (err) {
    fail(res, err);
  }
});

// ── Dispatch readiness (deterministic, server-computed gate inputs) ───────────
// The tamper-proof counterpart to dispatch-qc: it computes validationErrors (from
// the canonical leaves) and unacknowledgedShadowCriticals (from shadow_findings)
// SERVER-SIDE and runs the hard gate, so the verdict can't be talked out of a
// blocker by a client-supplied number. Read-only; does NOT transmit.
router.get('/sequences/:seqId/dispatch-readiness', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const seqId = idParam(req.params.seqId);
  if (seqId === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid sequence id.' } });
  try {
    const { assessSequenceDispatchReadiness } = await import('../services/ectd/assess-dispatch-readiness');
    const assessment = await assessSequenceDispatchReadiness({ sequenceId: seqId, organizationId: ctx.organizationId });
    res.json(assessment);
  } catch (err) {
    fail(res, err);
  }
});

// ── Governed freeze / dispatch (the SUBMIT step) ──────────────────────────────
// Each requires a Part 11 e-signature: first POST /api/c2c/actions/sign with
// target "ectd-sequence:<seqId>" (re-auth + separation-of-duties + ledger), then
// pass the returned actionId here. The service applies BOTH gates atomically —
// the e-signature AND the deterministic dispatch gate — so a sequence cannot be
// frozen or dispatched while the gate blocks. Neither transmits.
const governedTransitionSchema = z.object({ signatureActionId: z.string().min(1).max(128) });

router.post('/sequences/:seqId/freeze', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const seqId = idParam(req.params.seqId);
  if (seqId === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid sequence id.' } });
  const parsed = governedTransitionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { freezeSequence } = await import('../services/submission-service/submission-service');
    const seq = await freezeSequence(seqId, ctx, parsed.data.signatureActionId);
    res.json(seq);
  } catch (err) {
    fail(res, err);
  }
});

router.post('/sequences/:seqId/dispatch', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const seqId = idParam(req.params.seqId);
  if (seqId === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid sequence id.' } });
  const parsed = governedTransitionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { dispatchSequence } = await import('../services/submission-service/submission-service');
    const seq = await dispatchSequence(seqId, ctx, parsed.data.signatureActionId);
    res.json(seq);
  } catch (err) {
    fail(res, err);
  }
});

// ── Transmit (the final step — assemble → send to the agency gateway) ─────────
// Requires the sequence to be dispatched, a Part 11 e-signature on the sequence
// target, and a clear dispatch gate. Real transmission only happens when the org
// has gateway credentials for the chosen environment; otherwise the response
// reports `transmitted: false, reason: "gateway_not_configured"` honestly.
const transmitSchema = z.object({
  signatureActionId: z.string().min(1).max(128),
  environment: z.enum(['staging', 'production']).optional(),
  applicationId: z.string().min(1).max(128).optional(),
  sponsorId: z.string().min(1).max(128).optional(),
  sponsorName: z.string().min(1).max(256).optional(),
});
router.post('/sequences/:seqId/transmit', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const seqId = idParam(req.params.seqId);
  if (seqId === null) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid sequence id.' } });
  const parsed = transmitSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  try {
    const { transmitSequence } = await import('../services/submission-service/submission-service');
    const result = await transmitSequence({
      sequenceId: seqId,
      ctx,
      signatureActionId: parsed.data.signatureActionId,
      environment: parsed.data.environment,
      applicationId: parsed.data.applicationId,
      sponsorId: parsed.data.sponsorId,
      sponsorName: parsed.data.sponsorName,
    });
    res.json(result);
  } catch (err) {
    fail(res, err);
  }
});

export default router;
