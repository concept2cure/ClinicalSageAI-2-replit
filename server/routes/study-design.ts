/**
 * Study-design API — the governed entry point to the design-as-data spine.
 *
 * Mounted at `/api/study-design` behind `authMiddleware`, so every handler runs with an
 * authenticated, tenant-scoped request. Endpoints:
 *
 *   POST /validate   run the deterministic defensibility gates over a design (read-only)
 *   POST /burden     participant burden + protocol complexity over the SoA (read-only)
 *   POST /burden/compare  the burden delta an amendment introduces (read-only)
 *   POST /eligibility  the eligibility criteria read as data: conflict assessment plus the
 *                    registry eligibility block (read-only)
 *   POST /registry-filing  what a registry filing needs and lacks, with its statutory
 *                    clocks; the anchoring dates are caller-supplied (read-only)
 *   POST /simulate   run the seeded synthetic-twin outcome simulation; the prior can be
 *                    grounded in this tenant's prior CSRs (`useCsrEvidence`)
 *   POST /persist    upsert the design onto the CDISC PRM tables; a governed mutation —
 *                    the write and its 21 CFR Part 11 audit row commit in one transaction
 *   GET  /           list this tenant's persisted designs
 *   GET  /:studyId   load one design with its current defensibility report
 *   DELETE /:studyId remove a design (governed mutation)
 *
 * Every projection is served twice, in one shape: `POST /<name>` projects a design carried in
 * the body, and `GET /:studyId/<name>` projects a design this tenant has persisted. Both are
 * built by `projectionPost` / `projectionRoute` below rather than copied per projection, so a
 * new projection cannot ship a second design loader, a different 404, or no 404 at all —
 * `loadStudyDesign(studyId, orgId)` is the one loader and it is tenant-scoped.
 *
 * Reading an assessment is not a governed action, so none of these records one: they compute
 * over the design and change nothing.
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
  projectCrfShell,
  projectSap,
  assessEligibility,
  projectRegistryEligibility,
  buildRegistryFiling,
  buildEffectPrior,
  gatherCsrEffectEvidence,
  persistStudyDesignTx,
  isUuid,
  StudyDesignPersistRefusal,
  STUDY_DESIGN_REFUSAL_STATUS,
  deleteStudyDesignTx,
  loadStudyDesign,
  listStudyDesigns,
  primaryEndpoints,
  type StudyDesign,
  type EffectPrior,
  type EvidenceObservation,
  type PlacedRecord,
  type RegistryFilingContext,
} from '../services/study-design';
import { burdenProfileForDesign } from '../services/study-design/burden-adapters';
import { compareBurden } from '../services/study-design/burden-delta';

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

// ─── Projection responses ─────────────────────────────────────────────────────
//
// One function per projection, returning exactly what the engine returns, under a named key.
// `projectionPost` and `projectionRoute` below turn each into its POST and its GET route.

/** Resolve the requested registry and project the matching record(s). */
function registrationResponse(design: StudyDesign, registry: unknown): Record<string, unknown> {
  const which = String(registry ?? 'both').toLowerCase();
  if (which === 'ctgov') return { registration: projectRegistration(design, 'ctgov') };
  if (which === 'ctis') return { registration: projectRegistration(design, 'ctis') };
  return { registrations: projectAllRegistrations(design) };
}

/**
 * The structured eligibility engine, verbatim: its conflict assessment and its registry
 * eligibility block. `projectRegistryEligibility` is given no recorded facts, because
 * `StudyDesign.population` carries none — so sex and healthy-volunteer eligibility come back
 * absent, each naming the field that would settle it, rather than guessed from criterion text.
 */
function eligibilityResponse(design: StudyDesign): Record<string, unknown> {
  const criteria = design.population?.eligibility ?? [];
  return { assessment: assessEligibility(criteria), registryEligibility: projectRegistryEligibility(criteria) };
}

const filingContextSchema = z.object({
  isApplicableClinicalTrial: z.boolean().nullish(),
  firstEnrollmentDate: z.string().nullish(),
  primaryCompletionDate: z.string().nullish(),
  endOfTrialDate: z.string().nullish(),
  asOfDate: z.string().nullish(),
});

const placedSchema = z.array(
  z.object({ slot: z.string().min(1), leafId: z.number().int(), title: z.string(), resolvable: z.boolean() }),
);

const registryFilingBodySchema = z.object({
  registry: z.string().optional(),
  context: filingContextSchema.optional(),
  placed: placedSchema.optional(),
});

/** Only the literal `true` / `false` are read. Anything else, absent included, stays unrecorded. */
function booleanParam(raw: unknown): boolean | undefined {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return undefined;
}

function stringParam(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined;
}

/**
 * The filing context a GET carries in its query string. An absent or unreadable value is left
 * ABSENT: `registry-filing.ts` then reports the obligation `undetermined` and names the field
 * that would settle it. That is the point of the engine — an absence is never read as a "no".
 */
function filingContextFromQuery(q: Request['query']): RegistryFilingContext {
  return {
    isApplicableClinicalTrial: booleanParam(q.isApplicableClinicalTrial),
    firstEnrollmentDate: stringParam(q.firstEnrollmentDate),
    primaryCompletionDate: stringParam(q.primaryCompletionDate),
    endOfTrialDate: stringParam(q.endOfTrialDate),
    asOfDate: stringParam(q.asOfDate),
  };
}

/**
 * What a registry filing needs, and what it lacks, for the requested registry.
 *
 * `placed` is what the CALLER states has been placed against the registry slots; this route
 * looks nothing up, so an empty list means "none was supplied", not "none is placed". That
 * errs toward unsatisfied rows, which is the safe direction: the engine reports what a record
 * contains and what it lacks, and never that one reached a registry.
 */
function registryFilingResponse(
  design: StudyDesign,
  registry: unknown,
  ctx: RegistryFilingContext,
  placed: readonly PlacedRecord[],
): Record<string, unknown> {
  const which = String(registry ?? 'both').toLowerCase();
  if (which === 'ctgov') return { registryFiling: buildRegistryFiling(projectRegistration(design, 'ctgov'), ctx, placed) };
  if (which === 'ctis') return { registryFiling: buildRegistryFiling(projectRegistration(design, 'ctis'), ctx, placed) };
  const both = projectAllRegistrations(design);
  return {
    registryFilings: {
      ctgov: buildRegistryFiling(both.ctgov, ctx, placed),
      ctis: buildRegistryFiling(both.ctis, ctx, placed),
    },
  };
}

// ─── The two read-only route shapes ───────────────────────────────────────────

type ProjectFromDesign = (design: StudyDesign, req: Request) => Record<string, unknown>;

/** `POST /<path>` — project a design carried in the request body. Read-only, so ungoverned. */
function projectionPost(path: string, tag: string, project: ProjectFromDesign): void {
  router.post(`/${path}`, (req: Request, res: Response) => {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
    const design = parseDesign(req, res);
    if (!design) return;
    try {
      return res.json(project(design, req));
    } catch (err: any) {
      console.error(`[study-design/${tag}]`, err?.message);
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });
}

/**
 * `GET /:studyId/<path>` — project a design this tenant has persisted, with its current
 * defensibility report. `loadStudyDesign` is the ONE loader and it is tenant-scoped, so a
 * design another tenant owns is indistinguishable from one that does not exist: both 404.
 * A missing design is never answered with an empty projection.
 */
function projectionRoute(path: string, tag: string, project: ProjectFromDesign): void {
  router.get(`/:studyId/${path}`, async (req: Request, res: Response) => {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
    try {
      const loaded = await loadStudyDesign(String(req.params.studyId), orgId);
      if (!loaded) return res.status(404).json({ error: 'NOT_FOUND' });
      return res.json({ ...project(loaded.design, req), validation: loaded.validation });
    } catch (err: any) {
      console.error(`[study-design/${tag}]`, err?.message);
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });
}

// ─── POST /<projection> (project a design carried in the body) ────────────────

projectionPost('protocol', 'protocol', d => ({ protocol: projectProtocol(d) }));
projectionPost('sap', 'sap', d => ({ sap: projectSap(d) }));
projectionPost('schedule-of-activities', 'soa', d => ({ scheduleOfActivities: projectScheduleOfActivities(d) }));
projectionPost('burden', 'burden', d => ({ burden: burdenProfileForDesign(d) }));
projectionPost('crf-shell', 'crf-shell', d => ({ crfShell: projectCrfShell(d) }));
projectionPost('eligibility', 'eligibility', d => eligibilityResponse(d));
projectionPost('registration', 'registration', (d, req) =>
  registrationResponse(d, req.body?.registry ?? req.query.registry));

// ─── POST /registry-filing ────────────────────────────────────────────────────
//
// Its own handler rather than a `projectionPost`, because the context and the placements are
// caller-recorded facts: a malformed one is rejected, never quietly dropped into an absence
// the engine would then report as `undetermined`.

router.post('/registry-filing', (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  const design = parseDesign(req, res);
  if (!design) return;
  const params = registryFilingBodySchema.safeParse(req.body ?? {});
  if (!params.success) {
    return res.status(400).json({ error: 'INVALID_PARAMS', details: params.error.issues });
  }
  try {
    const { registry, context, placed } = params.data;
    return res.json(registryFilingResponse(design, registry ?? req.query.registry, context ?? {}, placed ?? []));
  } catch (err: any) {
    console.error('[study-design/registry-filing]', err?.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ─── POST /burden/compare (the burden delta between two designs) ─────────────
//
// Read-only. The amendment question: what did this change do to the participant.
// Body: { before: <design>, after: <design> }.

router.post('/burden/compare', (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  const before = designSchema.safeParse(req.body?.before);
  const after = designSchema.safeParse(req.body?.after);
  const issues = [
    ...(before.success ? [] : before.error.issues),
    ...(after.success ? [] : after.error.issues),
  ];
  if (!before.success || !after.success) {
    return res.status(400).json({ error: 'INVALID_DESIGN', details: issues });
  }
  try {
    const beforeProfile = burdenProfileForDesign(before.data as unknown as StudyDesign);
    const afterProfile = burdenProfileForDesign(after.data as unknown as StudyDesign);
    return res.json({
      before: beforeProfile,
      after: afterProfile,
      delta: compareBurden(beforeProfile, afterProfile),
    });
  } catch (err: any) {
    console.error('[study-design/burden-compare]', err?.message);
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
  // A design starts at a project (PF-14): it names the project it belongs to.
  // Whether that project is this organization's is checked by the one writer.
  if (!isUuid(design.programId)) {
    return res.status(400).json({ error: 'PROJECT_REQUIRED', detail: 'Name the project this study design belongs to.' });
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
      payload: { studyId, programId: design.programId, title: design.title, phase: design.phase, riskLevel: validation.riskLevel },
      domain: 'mdx',
      surface: 'api',
      idempotencyKey: typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey : null,
    });
    await client.query('COMMIT');
    return res.json({ studyId, ...gov, validation });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (err instanceof StudyDesignPersistRefusal) {
      return res.status(STUDY_DESIGN_REFUSAL_STATUS[err.code]).json({ error: err.code, detail: err.message });
    }
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
    const programId = typeof req.query.program_id === 'string' ? req.query.program_id : undefined;
    return res.json({ designs: await listStudyDesigns(orgId, { limit, offset, programId }) });
  } catch (err: any) {
    console.error('[study-design/list]', err?.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// ─── GET /:studyId/<projection> (load + project) ──────────────────────────────
//
// Read-only, one per projection, all through `projectionRoute`: one loader, one 404.

projectionRoute('protocol', 'protocol-load', d => ({ protocol: projectProtocol(d) }));
projectionRoute('sap', 'sap-load', d => ({ sap: projectSap(d) }));
projectionRoute('schedule-of-activities', 'soa-load', d => ({ scheduleOfActivities: projectScheduleOfActivities(d) }));
projectionRoute('burden', 'burden-load', d => ({ burden: burdenProfileForDesign(d) }));
projectionRoute('crf-shell', 'crf-shell-load', d => ({ crfShell: projectCrfShell(d) }));
projectionRoute('eligibility', 'eligibility-load', d => eligibilityResponse(d));
projectionRoute('registration', 'registration-load', (d, req) => registrationResponse(d, req.query.registry));
projectionRoute('registry-filing', 'registry-filing-load', (d, req) =>
  registryFilingResponse(d, req.query.registry, filingContextFromQuery(req.query), []));

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
