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
      // Capability flags (not workspaces). Dispatch transmit + Publish bytes are
      // pending the storage resolver (see SUBMISSION_CENTER_API.md).
      features: {
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
// When `sequenceId` is supplied the gate inputs are computed SERVER-SIDE from the
// canonical core (never the client numbers) — the AI advisory then floors on real
// values. Without a sequenceId it falls back to the supplied numbers (advisory
// only); prefer GET /sequences/:seqId/dispatch-readiness for the tamper-proof gate.
const dispatchQcSchema = z.object({
  region: z.enum(['fda', 'eu', 'jp']),
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

// ── Device technical-file ASSEMBLE (materialize the MDR/IVDR ZIP) ─────────────
// Device counterpart of POST /assemble: materializes the sequence's leaves into a
// real technical-file ZIP (Annex II/III tree + manifest.json + checksums) with
// valid PDF leaves. Returns a sanitized descriptor (no server paths). Does NOT
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
      applicationId: parsed.data.applicationId ?? `SEQ-${seqId}`,
      productName: parsed.data.productName,
      manufacturer: parsed.data.manufacturer,
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
    });
  } catch (err) {
    fail(res, err);
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
      applicationId: parsed.data.applicationId ?? `SEQ-${seqId}`,
      sponsorId: parsed.data.sponsorId ?? `ORG-${ctx.organizationId}`,
      sponsorName: parsed.data.sponsorName ?? `Organization ${ctx.organizationId}`,
    });
    // Sanitized — never expose the server temp path.
    res.json({
      ok: true,
      sha256: result.bundle.sha256,
      format: result.bundle.format,
      sizeBytes: result.bundle.sizeBytes,
      materialized: result.materialized,
      skipped: result.skipped,
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
