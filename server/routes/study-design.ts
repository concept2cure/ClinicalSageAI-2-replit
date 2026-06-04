/**
 * Study-design API — the governed entry point to the design-as-data spine.
 *
 * Mounted at `/api/study-design` behind `authMiddleware`, so every handler runs with an
 * authenticated, tenant-scoped request. Endpoints:
 *
 *   POST /validate   run the deterministic defensibility gates over a design (read-only)
 *   POST /simulate   run the seeded synthetic-twin outcome simulation; the prior can be
 *                    grounded in this tenant's prior CSRs (`useCsrEvidence`)
 *   POST /persist    upsert the design onto the CDISC PRM tables; a governed mutation —
 *                    the write and its 21 CFR Part 11 audit row commit in one transaction
 *   GET  /           list this tenant's persisted designs
 *   GET  /:studyId   load one design with its current defensibility report
 *   DELETE /:studyId remove a design (governed mutation)
 *
 * Validation is intentionally light at the edge (the request must look like a design);
 * the real, citeable validation is the gate engine, which runs inside the handlers.
 *
 * @module server/routes/study-design
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { recordGovernedAction } from './c2c/actions';
import {
  validateDesign,
  simulateTrial,
  solveSampleSize,
  projectProtocol,
  projectScheduleOfActivities,
  projectRegistration,
  projectAllRegistrations,
  buildEffectPrior,
  gatherCsrEffectEvidence,
  persistStudyDesignTx,
  deleteStudyDesignTx,
  loadStudyDesign,
  listStudyDesigns,
  primaryEndpoints,
  type StudyDesign,
  type EffectPrior,
  type EvidenceObservation,
} from '../services/study-design';

const router = Router();

// ─── Request context helpers (polymorphic per the auth middleware) ────────────

function resolveUserId(req: Request): number | null {
  const r = req as any;
  const raw = r.userId ?? r.user?.id ?? r.user?.userId;
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

function resolveOrgId(req: Request): number | null {
  const r = req as any;
  const raw = r.tenantId ?? r.organizationId ?? r.user?.organizationId ?? r.user?.tenantId;
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

// ─── Edge validation: the body must look like a design ────────────────────────

const designSchema = z
  .object({
    title: z.string().min(1),
    phase: z.string().min(1),
    indication: z.string().min(1),
    endpoints: z.array(z.object({ name: z.string(), role: z.string(), type: z.string() }).passthrough()).min(1),
    framework: z.object({ inferentialFrame: z.string() }).passthrough(),
    statisticalPlan: z.object({}).passthrough(),
  })
  .passthrough();

const observationSchema = z.object({
  source: z.object({ kind: z.string(), source: z.string(), ref: z.string().optional() }).passthrough(),
  effect: z.number(),
  standardError: z.number().positive(),
  n: z.number().optional(),
  relevance: z.number().optional(),
});

function parseDesign(req: Request, res: Response): StudyDesign | null {
  const parsed = designSchema.safeParse(req.body?.design ?? req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'INVALID_DESIGN', details: parsed.error.issues });
    return null;
  }
  return parsed.data as unknown as StudyDesign;
}

// ─── POST /validate ───────────────────────────────────────────────────────────

router.post('/validate', (req: Request, res: Response) => {
  const design = parseDesign(req, res);
  if (!design) return;
  try {
    return res.json({ validation: validateDesign(design) });
  } catch (err: any) {
    console.error('[study-design/validate]', err?.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ─── POST /simulate ─────────────────────────────────────────────────────────

const simulateSchema = z.object({
  plannedEffect: z.number().optional(),
  assumptionSd: z.number().positive().optional(),
  observations: z.array(observationSchema).optional(),
  useCsrEvidence: z.boolean().optional(),
  nRuns: z.number().int().positive().max(200000).optional(),
  seed: z.number().optional(),
  nPerArm: z.number().int().positive().optional(),
  controlEventRate: z.number().min(0).max(1).optional(),
  eventProbability: z.number().min(0).max(1).optional(),
});

interface PriorInputs {
  plannedEffect?: number;
  assumptionSd?: number;
  // Loosely typed: the request schema validates the shape; we coerce to EvidenceObservation here.
  observations?: unknown[];
  useCsrEvidence?: boolean;
}

interface ResolvedPrior {
  prior: EffectPrior;
  csrNote?: string;
  csrScanned?: number;
  observationsUsed: number;
}

/**
 * Build the effect prior a simulation or sizing call needs, optionally grounding it in
 * this tenant's prior CSRs. Throws (via buildEffectPrior) when no prior can be formed.
 */
async function resolvePrior(orgId: number, design: StudyDesign, p: PriorInputs): Promise<ResolvedPrior> {
  const direction = primaryEndpoints(design)[0]?.direction;
  const observations: EvidenceObservation[] = [...((p.observations as EvidenceObservation[] | undefined) ?? [])];
  let csrNote: string | undefined;
  let csrScanned: number | undefined;

  if (p.useCsrEvidence) {
    const csr = await gatherCsrEffectEvidence({
      tenantId: orgId,
      indication: design.indication,
      phase: design.phase,
      direction,
    });
    observations.push(...csr.observations);
    csrNote = csr.note;
    csrScanned = csr.scanned;
  }

  const plannedEffect = p.plannedEffect ?? design.statisticalPlan?.powerAssumptions?.effectSize;
  const prior = buildEffectPrior(observations, { plannedEffect, assumptionSd: p.assumptionSd });
  return { prior, csrNote, csrScanned, observationsUsed: observations.length };
}

router.post('/simulate', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: 'AUTH_REQUIRED' });

  const design = parseDesign(req, res);
  if (!design) return;
  const params = simulateSchema.safeParse(req.body ?? {});
  if (!params.success) {
    return res.status(400).json({ error: 'INVALID_PARAMS', details: params.error.issues });
  }
  const p = params.data;

  let resolved: ResolvedPrior;
  try {
    resolved = await resolvePrior(orgId, design, p);
  } catch {
    return res.status(400).json({
      error: 'NO_PRIOR',
      detail: 'Supply plannedEffect, observations, or enable CSR evidence so a prior can be formed.',
    });
  }

  try {
    const report = simulateTrial(design, {
      effectPrior: resolved.prior,
      nRuns: p.nRuns,
      seed: p.seed,
      nPerArm: p.nPerArm,
      controlEventRate: p.controlEventRate,
      eventProbability: p.eventProbability,
    });
    return res.json({
      ...report,
      evidence: { csrNote: resolved.csrNote, csrScanned: resolved.csrScanned, observationsUsed: resolved.observationsUsed },
    });
  } catch (err: any) {
    // simulateTrial throws for designs it will not fake (single-arm, no sample size, …).
    return res.status(422).json({ error: 'CANNOT_SIMULATE', detail: err?.message ?? 'Simulation failed.' });
  }
});

// ─── POST /sample-size ────────────────────────────────────────────────────────

const sampleSizeSchema = z.object({
  plannedEffect: z.number().optional(),
  assumptionSd: z.number().positive().optional(),
  observations: z.array(observationSchema).optional(),
  useCsrEvidence: z.boolean().optional(),
  targetPower: z.number().min(0.5).max(0.999).optional(),
  targetAssurance: z.number().min(0.05).max(0.999).optional(),
});

router.post('/sample-size', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: 'AUTH_REQUIRED' });

  const design = parseDesign(req, res);
  if (!design) return;
  const params = sampleSizeSchema.safeParse(req.body ?? {});
  if (!params.success) {
    return res.status(400).json({ error: 'INVALID_PARAMS', details: params.error.issues });
  }
  const p = params.data;

  let resolved: ResolvedPrior;
  try {
    resolved = await resolvePrior(orgId, design, p);
  } catch {
    return res.status(400).json({
      error: 'NO_PRIOR',
      detail: 'Supply plannedEffect, observations, or enable CSR evidence so a prior can be formed.',
    });
  }

  try {
    const report = solveSampleSize(design, resolved.prior, {
      targetPower: p.targetPower,
      targetAssurance: p.targetAssurance,
    });
    return res.json({
      sampleSize: report,
      evidence: { csrNote: resolved.csrNote, csrScanned: resolved.csrScanned, observationsUsed: resolved.observationsUsed },
    });
  } catch (err: any) {
    return res.status(422).json({ error: 'CANNOT_SIZE', detail: err?.message ?? 'Sample-size calculation failed.' });
  }
});

// ─── POST /protocol (project the design as an ICH M11 protocol) ───────────────

router.post('/protocol', (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  const design = parseDesign(req, res);
  if (!design) return;
  try {
    return res.json({ protocol: projectProtocol(design) });
  } catch (err: any) {
    console.error('[study-design/protocol]', err?.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ─── POST /schedule-of-activities (project the design's SoA grid) ─────────────

router.post('/schedule-of-activities', (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  const design = parseDesign(req, res);
  if (!design) return;
  try {
    return res.json({ scheduleOfActivities: projectScheduleOfActivities(design) });
  } catch (err: any) {
    console.error('[study-design/soa]', err?.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ─── POST /registration (project the design as a registry record) ────────────

/** Resolve the requested registry and project the matching record(s). */
function registrationResponse(design: StudyDesign, registry: unknown): Record<string, unknown> {
  const which = String(registry ?? 'both').toLowerCase();
  if (which === 'ctgov') return { registration: projectRegistration(design, 'ctgov') };
  if (which === 'ctis') return { registration: projectRegistration(design, 'ctis') };
  return { registrations: projectAllRegistrations(design) };
}

router.post('/registration', (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  const design = parseDesign(req, res);
  if (!design) return;
  try {
    return res.json(registrationResponse(design, req.body?.registry ?? req.query.registry));
  } catch (err: any) {
    console.error('[study-design/registration]', err?.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ─── POST /persist (governed mutation) ────────────────────────────────────────

router.post('/persist', async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  const orgId = resolveOrgId(req);
  if (!userId || !orgId) return res.status(401).json({ error: 'AUTH_REQUIRED' });

  const design = parseDesign(req, res);
  if (!design) return;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (reason.length < 8) {
    return res.status(400).json({ error: 'REASON_REQUIRED', detail: 'Provide a reason of at least 8 characters.' });
  }

  const validation = validateDesign(design);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const studyId = await persistStudyDesignTx(client, design, { tenantId: orgId, userId });
    const gov = await recordGovernedAction(client, {
      orgId,
      userId,
      command: 'persist',
      target: `study-design:${studyId}`,
      reason,
      payload: { studyId, title: design.title, phase: design.phase, riskLevel: validation.riskLevel },
      domain: 'mdx',
      surface: 'api',
      idempotencyKey: typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey : null,
    });
    await client.query('COMMIT');
    return res.json({ studyId, ...gov, validation });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[study-design/persist]', err?.message);
    return res.status(500).json({ error: 'PERSIST_FAILED', detail: err?.message });
  } finally {
    client.release();
  }
});

// ─── GET / (list) ─────────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  try {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : undefined;
    return res.json({ designs: await listStudyDesigns(orgId, { limit, offset }) });
  } catch (err: any) {
    console.error('[study-design/list]', err?.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ─── GET /:studyId/protocol (load + project) ──────────────────────────────────

router.get('/:studyId/protocol', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  const studyId = String(req.params.studyId);
  try {
    const loaded = await loadStudyDesign(studyId, orgId);
    if (!loaded) return res.status(404).json({ error: 'NOT_FOUND' });
    return res.json({ protocol: projectProtocol(loaded.design), validation: loaded.validation });
  } catch (err: any) {
    console.error('[study-design/protocol-load]', err?.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ─── GET /:studyId/schedule-of-activities (load + project) ────────────────────

router.get('/:studyId/schedule-of-activities', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  const studyId = String(req.params.studyId);
  try {
    const loaded = await loadStudyDesign(studyId, orgId);
    if (!loaded) return res.status(404).json({ error: 'NOT_FOUND' });
    return res.json({
      scheduleOfActivities: projectScheduleOfActivities(loaded.design),
      validation: loaded.validation,
    });
  } catch (err: any) {
    console.error('[study-design/soa-load]', err?.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ─── GET /:studyId/registration (load + project) ──────────────────────────────

router.get('/:studyId/registration', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  const studyId = String(req.params.studyId);
  try {
    const loaded = await loadStudyDesign(studyId, orgId);
    if (!loaded) return res.status(404).json({ error: 'NOT_FOUND' });
    return res.json({ ...registrationResponse(loaded.design, req.query.registry), validation: loaded.validation });
  } catch (err: any) {
    console.error('[study-design/registration-load]', err?.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ─── GET /:studyId (load) ─────────────────────────────────────────────────────

router.get('/:studyId', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  const studyId = String(req.params.studyId);
  try {
    const loaded = await loadStudyDesign(studyId, orgId);
    if (!loaded) return res.status(404).json({ error: 'NOT_FOUND' });
    return res.json(loaded);
  } catch (err: any) {
    console.error('[study-design/load]', err?.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ─── DELETE /:studyId (governed mutation) ─────────────────────────────────────

router.delete('/:studyId', async (req: Request, res: Response) => {
  const userId = resolveUserId(req);
  const orgId = resolveOrgId(req);
  if (!userId || !orgId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  const studyId = String(req.params.studyId);
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : 'Deleted study design';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await deleteStudyDesignTx(client, studyId, orgId);
    const gov = await recordGovernedAction(client, {
      orgId,
      userId,
      command: 'delete',
      target: `study-design:${studyId}`,
      reason,
      domain: 'mdx',
      surface: 'api',
    });
    await client.query('COMMIT');
    return res.json({ deleted: studyId, ...gov });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[study-design/delete]', err?.message);
    return res.status(500).json({ error: 'DELETE_FAILED', detail: err?.message });
  } finally {
    client.release();
  }
});

export default router;
