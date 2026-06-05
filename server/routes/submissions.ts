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
import { z } from 'zod';
import { requireRole } from '../middleware/auth';
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
  SubmissionError,
} from '../services/submission-service/submission-service';
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
  FORBIDDEN: 403,
  VALIDATION: 400,
  RATE_LIMITED: 429,
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
  logger.error('submissions route error', { err: err instanceof Error ? err.message : String(err) });
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Request failed.' } });
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
  primaryRegion: z.enum(['fda', 'eu', 'jp']),
  lifecycleStage: z.string().max(64).optional(),
});
const createSequenceSchema = z.object({
  region: z.enum(['fda', 'eu', 'jp']),
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
      // Which workspaces are server-ready today. Dispatch transmit + Publish
      // bytes are pending the storage resolver (see SUBMISSION_CENTER_API.md).
      workspaces: {
        portfolio: true,
        planner: true,
        builder: true,
        sequences: true,
        validation: true,
        shadowReview: true,
        crossRegion: true,
        dispatchQc: true,
        publishTransmit: false,
      },
    });
  } catch (err) {
    fail(res, err);
  }
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

// ── Planner (AI) ────────────────────────────────────────────────────────────
const planSchema = z.object({
  applicationType: z.string().min(1).max(64),
  clientType: z.enum(['pharma', 'biotech', 'mdx', 'ivd']),
  regions: z.array(z.enum(['fda', 'eu', 'jp'])).min(1),
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
  region: z.enum(['fda', 'eu', 'jp']),
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
  sourceRegion: z.enum(['fda', 'eu', 'jp']),
  targetRegions: z.array(z.enum(['fda', 'eu', 'jp'])).min(1),
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
const dispatchQcSchema = z.object({
  region: z.enum(['fda', 'eu', 'jp']),
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
    res.json(await runDispatchQc(parsed.data, { ...ctx, submissionId: id }));
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

export default router;
