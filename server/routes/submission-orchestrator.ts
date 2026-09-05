/**
 * Submission-Package Orchestrator API Routes
 *
 * Endpoints:
 *   POST   /api/submission-orchestrator/runs                      — start a new orchestration run
 *   GET    /api/submission-orchestrator/runs/:runId               — get run state
 *   GET    /api/submission-orchestrator/runs/:runId/audit         — append-only step audit
 *   POST   /api/submission-orchestrator/runs/:runId/regenerate    — regenerate stale steps
 *   POST   /api/submission-orchestrator/m2/qos                    — build M2.3 QOS standalone
 *   POST   /api/submission-orchestrator/m2/nonclinical            — build M2.4 standalone
 *   POST   /api/submission-orchestrator/m2/clinical               — build M2.7 standalone
 *   POST   /api/submission-orchestrator/csr/tabulate              — build CSR §10–§12 tables
 *   POST   /api/submission-orchestrator/validate/hardened         — run hardened eCTD validator
 *
 * @module server/routes/submission-orchestrator
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  runOrchestrator,
  getRun,
  getRunAudit,
  regenerateAffected,
  type OrchestratorInputs,
  type StepKey,
} from '../services/submission-package-orchestrator.js';
import {
  buildM23QualityOverallSummary,
  buildM24NonclinicalOverview,
  buildM25ClinicalOverview,
  buildM27ClinicalSummary,
} from '../services/m2-summary-builders.js';
import { buildCSRTables } from '../services/csr-tabulation-builders.js';
import { validateEctdPackageHardened, flattenFindings } from '../services/ectd/ectd-validator-hardening.js';
import { loadCmcSourcesForProject } from '../services/cmc/load-cmc-sources-for-project.js';
import { loadCsrInputsForProject } from '../services/csr/load-csr-inputs-for-project.js';
import { loadNonclinicalStudiesForProject } from '../services/preclinical/load-nonclinical-studies-for-project.js';
import { pool } from '../db.js';
import auditService from '../services/auditService.js';
import { createScopedLogger } from '../utils/logger.js';
import { serverError } from '../lib/api-response';

const log = createScopedLogger('submission-orchestrator');

/**
 * Fire-and-forget audit for standalone-builder + validator access. 21 CFR
 * Part 11 §11.10(e) requires every view / build of regulated submission
 * content to be logged with attribution. The standalone routes
 * (/m2/qos, /m2/nonclinical, /m2/clinical, /m2/clinical-overview,
 * /csr/tabulate, /validate/hardened) are pure transforms with no DB
 * writes, but the *act of generating regulated content* still has to be
 * attributable to a tenant + user. Non-fatal on failure — the response
 * stream is the user value, the audit row is the regulator value.
 */
async function auditOrchestratorAccess(
  req: Request,
  organizationId: number,
  action:
    | 'orchestrator_m23_built'
    | 'orchestrator_m24_built'
    | 'orchestrator_m25_built'
    | 'orchestrator_m27_built'
    | 'orchestrator_csr_tabulated'
    | 'orchestrator_validated_hardened',
  details: Record<string, unknown> = {},
): Promise<void> {
  const user = (req as any).user;

  const orchestratorAudit = await auditService.logAction({
    tenantId: organizationId,
    userId: user?.id ?? user?.userId,
    action,
    resourceType: 'submission_orchestrator',
    // Standalone routes are not bound to a numeric orchestrator runId; a
    // 'standalone' sentinel keeps these rows distinct from per-run rows
    // when grouping by (resourceType, resourceId).
    resourceId: 'standalone',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'] as string | undefined,
    details,
  });
  if (!orchestratorAudit.persisted) {
    log.warn('orchestrator audit write failed (non-fatal)', {
      err: orchestratorAudit.error ?? 'no durable store accepted the row',
      action,
      organizationId,
    });
  }
}

// ── Tenant resolution helpers ───────────────────────────────────────────────
//
// Per-handler tenant gate mirroring the pattern in `routes/ectd-export.ts`.
// We intentionally do NOT import the `requireTenant` middleware exported from
// `middleware/tenantIsolation.ts` — that one has the (req, res, next)
// middleware signature and reads `req.tenant`, whereas every regulated route
// in this codebase that needs a numeric orgId resolves it inline from the
// JWT-bound `req.user` / `req.tenantContext` pair and short-circuits the
// response. Keeping the same shape here means a future audit only has to
// reason about one resolution contract for §11.10(e)-attributed routes.

/**
 * Resolve the tenant org id from the JWT-bound request. Returns null if no
 * organization context is present; callers must fail-closed (401/403) before
 * touching regulated content.
 */
function resolveOrgId(req: Request): number | null {
  const raw =
    (req as any).tenantContext?.organizationId ?? (req as any).user?.organizationId;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Distinguish unauthenticated (no JWT principal at all) from
 * authenticated-but-missing-org. 401 for the former, 403 for the latter — per
 * HTTP semantics. Returns the resolved positive-integer organizationId on
 * success, or null after writing the response (caller must early-return).
 */
function requireTenant(req: Request, res: Response): number | null {
  const user = (req as any).user;
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  const orgId = resolveOrgId(req);
  if (orgId == null) {
    res.status(403).json({ error: 'Organization context required' });
    return null;
  }
  return orgId;
}

/**
 * The package.sign step's outputRef now carries the full signed-package snapshot
 * (leaf manifest + backbone XML). Do NOT ship that to the client verbatim — it
 * is large and exposes internal package structure. Redact it to the fields a
 * caller needs (status/digest/signature id), leaving every other step's
 * outputRef untouched.
 */
function redactStepOutputRef<T extends { key: string; outputRef?: string }>(step: T): T {
  if (step.key !== 'package.sign' || !step.outputRef) return step;
  try {
    const parsed = JSON.parse(step.outputRef) as {
      payloadDigest?: unknown;
      signatureId?: unknown;
      awaitingSince?: unknown;
    };
    if (parsed && typeof parsed === 'object' && typeof parsed.payloadDigest === 'string') {
      const compact: Record<string, unknown> = { payloadDigest: parsed.payloadDigest };
      if (typeof parsed.signatureId === 'number') compact.signatureId = parsed.signatureId;
      if (typeof parsed.awaitingSince === 'string') compact.awaitingSince = parsed.awaitingSince;
      return { ...step, outputRef: JSON.stringify(compact) };
    }
  } catch {
    /* non-JSON outputRef (e.g. a skipped-reason string) — leave as-is */
  }
  return step;
}

const router = Router();

// ── Validation schemas ──────────────────────────────────────────────────────

const RegionSchema = z.enum(['US', 'EU', 'JP', 'CA', 'UK', 'CN', 'AU', 'CH', 'BR', 'IN', 'KR', 'SG', 'GLOBAL']);
const SubmissionTypeSchema = z.string().min(1);

const CanonicalSourceSchema = z.object({
  id: z.string(),
  sourceType: z.string(),
  sourcePayload: z.record(z.string(), z.unknown()),
  sourceHash: z.string().optional(),
});

const NonclinicalStudySchema = z.object({
  studyId: z.string(),
  studyType: z.enum([
    'pharmacology', 'pharmacokinetics', 'toxicology', 'safety_pharmacology',
    'reproductive_tox', 'genotoxicity', 'carcinogenicity',
  ]),
  species: z.string().optional(),
  duration: z.string().optional(),
  doseLevels: z.array(z.string()).optional(),
  primaryFinding: z.string(),
  noael: z.string().optional(),
  noel: z.string().optional(),
  glpStatus: z.enum(['GLP', 'non-GLP']).optional(),
  reportSection: z.string(),
});

const StudyDataSchema = z.object({
  studyId: z.string(),
  protocolNumber: z.string(),
  treatmentArms: z.array(z.unknown()),
  disposition: z.array(z.unknown()),
  demographics: z.array(z.unknown()),
  efficacy: z.array(z.unknown()),
  adverseEvents: z.array(z.unknown()),
  exposure: z.array(z.unknown()).optional(),
  labShifts: z.array(z.unknown()).optional(),
});

const CSRInputSchema = z.object({
  studyId: z.string(),
  protocolNumber: z.string(),
  phase: z.string(),
  studyDesign: z.string(),
  primaryEndpoint: z.string(),
  primaryResult: z.string(),
  sampleSize: z.number(),
  ittPopulation: z.number().optional(),
  treatmentArms: z.array(z.string()).optional(),
  topAEs: z.array(z.object({ pt: z.string(), rate: z.string(), severity: z.string().optional() })).optional(),
  saeCount: z.number().optional(),
  deathCount: z.number().optional(),
});

// ── Common fields shared by Mode A and Mode B ───────────────────────────────
const RunCommonSchema = z.object({
  submissionId: z.string().min(1),
  /**
   * Path-to-GA §C.4 (Path B): optional canonical FK back to
   * public.submissions(id). When supplied, the orchestrator dual-writes
   * both `submission_id` (TEXT, legacy) and `submission_id_fk` (INTEGER,
   * joinable). Legacy callers omit this and the FK column stays NULL
   * until a per-tenant backfill resolves it. The route handler threads
   * this straight into OrchestratorInputs.submissionFk without
   * normalization — the service layer (and
   * loadSubmissionFkBySubmissionIdText) owns the resolution / dual-write
   * logic.
   */
  submissionFk: z.number().int().positive().optional(),
  applicationNumber: z.string().min(1),
  region: RegionSchema,
  submissionType: SubmissionTypeSchema,
  drugSubstanceName: z.string().optional(),
  drugProductName: z.string().optional(),
  indication: z.string().optional(),
  skipValidation: z.boolean().optional(),
  // clinicalStudyData has NO loader yet (per PATH_TO_GA §D.3 — needs a real
  // CDISC ADaM extractor). Accept it in BOTH modes for now; future GA-2 work
  // will populate it from a server-side extractor and remove it from the body.
  clinicalStudyData: z.array(StudyDataSchema).default([]),
});

// Mode A — server-side input assembly via the three loaders shipped in
// 58db31a1. The caller supplies project identifiers and the route loads the
// orchestrator inputs server-side. This is the consumer-facing shape.
//
// CRITICAL: three different project-id types. The CMC reader wants the CMC
// project uuid (cmc_projects.id, string). The CSR reader wants the
// concept2cure projects.id (number). The nonclinical reader wants
// ctd_programs.id (number). The body MUST carry all three explicitly so the
// caller's project model maps to ours unambiguously.
const RunModeASchema = RunCommonSchema.extend({
  projectId: z.number().int().positive(),
  cmcProjectId: z.string().uuid().optional(),
  ctdProgramId: z.number().int().positive().optional(),
  // Mode A explicitly rejects hand-built inputs.
  cmcSources: z.undefined().optional(),
  nonclinicalStudies: z.undefined().optional(),
  csrInputs: z.undefined().optional(),
});

// Mode B — backward-compat. Existing programmatic callers supply
// pre-assembled OrchestratorInputs arrays in the body. No loader is invoked.
const RunModeBSchema = RunCommonSchema.extend({
  cmcSources: z.array(CanonicalSourceSchema).default([]),
  nonclinicalStudies: z.array(NonclinicalStudySchema).default([]),
  csrInputs: z.array(CSRInputSchema).default([]),
  // Mode B explicitly rejects projectId — caller is supplying the assembled
  // inputs so a project-id reference would be ambiguous.
  projectId: z.undefined().optional(),
});

// The two run modes auto-discriminate by the presence of `projectId`
// (Mode A requires it; Mode B forbids it), so a plain union over transformed
// branches is sufficient — and, unlike `discriminatedUnion`, it can legally
// contain `.transform()`ed options. Each branch normalizes `mode` to a literal
// so downstream code can still narrow on `parsed.data.mode`. Any `mode` field a
// legacy caller sends is stripped by the (non-strict) object schema and ignored.
// A factory lets the regenerate route reuse the exact same shape plus its own
// fields without calling `.extend()` on the resulting union.
function buildRunSchema<T extends z.ZodRawShape>(extraShape: T) {
  return z.union([
    RunModeASchema.extend(extraShape).transform(d => ({ ...d, mode: 'project' as const })),
    RunModeBSchema.extend(extraShape).transform(d => ({ ...d, mode: 'inline' as const })),
  ]);
}

const RunSchema = buildRunSchema({});

// ── Routes ──────────────────────────────────────────────────────────────────

/**
 * Start a new orchestrator run.
 *
 * SECURITY: organizationId is resolved from the JWT principal ONLY (never
 * from the request body). Accepting it from the body would let an
 * authenticated caller persist an orchestrator run — and the resulting
 * append-only audit rows — under another tenant's scope, defeating both
 * row-level isolation in the orchestrator service and §11.10(e)
 * attribution. The RunSchema deliberately has no organizationId field for
 * this reason; we splice the JWT-resolved value in below.
 */
router.post('/runs', async (req: Request, res: Response) => {
  const organizationId = requireTenant(req, res);
  if (organizationId == null) return;

  // Defensive: reject ambiguous requests where the caller supplied BOTH
  // projectId AND any hand-built input array. Either mode by itself is
  // valid; both together is a programming error.
  const rawBody = req.body ?? {};
  const hasProjectId = typeof rawBody.projectId === 'number';
  const hasInlineInputs =
    Array.isArray(rawBody.cmcSources) ||
    Array.isArray(rawBody.nonclinicalStudies) ||
    Array.isArray(rawBody.csrInputs);
  if (hasProjectId && hasInlineInputs) {
    // Do NOT echo the parsed body — PHI / sponsor-confidential payloads in
    // the inline-inputs arrays may end up logged client-side. Log server-side
    // with org context for triage; client gets a generic message.
    log.warn('Ambiguous /runs body: both projectId and inline inputs supplied', { organizationId });
    return res.status(400).json({ error: 'ambiguous_request', message: 'Supply either projectId OR inline {cmcSources, nonclinicalStudies, csrInputs} — never both.' });
  }

  const parsed = RunSchema.safeParse(rawBody);
  if (!parsed.success) {
    // Same PHI-protection rationale as charters.ts: don't echo parsed.error
    // (Zod issues include 'received' values). Log full issues server-side.
    log.warn('Invalid /runs body', { issues: parsed.error.issues, organizationId });
    return res.status(400).json({ error: 'invalid_request' });
  }

  let orchestratorInputs: Omit<OrchestratorInputs, 'organizationId'>;
  try {
    if (parsed.data.mode === 'project') {
      // ── Mode A: server-side input assembly ──────────────────────────────
      // Tenant-scoped probe BEFORE any loader call. Cross-org projectId
      // returns 403 (not 404) — same existence-info-leak prevention as
      // charters.ts:238-251. The caller IS authenticated; "you can't see
      // this resource" is the honest answer regardless of which org owns it.
      const { rows } = await pool.query(
        'SELECT id FROM projects WHERE id = $1 AND organization_id = $2 LIMIT 1',
        [parsed.data.projectId, organizationId],
      );
      if (rows.length === 0) {
        return res.status(403).json({ error: 'project_not_accessible' });
      }

      // Load the three input arrays in parallel. Each loader is
      // tenant-scoped internally (asserts orgId positivity + filters by org)
      // so the previous probe is defense-in-depth, not the only check.
      // Individual failures surface clearly via the named promise rejection
      // — a single loader failure does NOT produce a half-assembled
      // OrchestratorInputs (the catch below short-circuits).
      const [cmcSources, nonclinicalStudies, csrInputs] = await Promise.all([
        parsed.data.cmcProjectId
          ? loadCmcSourcesForProject(organizationId, parsed.data.cmcProjectId)
          : Promise.resolve([]),
        parsed.data.ctdProgramId
          ? loadNonclinicalStudiesForProject(organizationId, parsed.data.ctdProgramId)
          : Promise.resolve([]),
        loadCsrInputsForProject(organizationId, parsed.data.projectId),
      ]);

      // 21 CFR Part 11 §11.10(e) audit attribution. Log COUNTS only — never
      // the payload bodies (PHI / sponsor-confidential data lives there).
      auditService.logAction({
        userId: (req as any).user?.id ?? 0,
        tenantId: organizationId,
        action: 'orchestrator_inputs_assembled',
        resourceType: 'submission_orchestrator',
        resourceId: parsed.data.submissionId,
        details: {
          mode: 'project',
          projectId: parsed.data.projectId,
          cmcProjectId: parsed.data.cmcProjectId,
          ctdProgramId: parsed.data.ctdProgramId,
          cmcSourceCount: cmcSources.length,
          nonclinicalStudyCount: nonclinicalStudies.length,
          csrInputCount: csrInputs.length,
        },
      }).catch(err => log.warn('Audit log failed (non-fatal)', { err: err?.message }));

      orchestratorInputs = {
        submissionId: parsed.data.submissionId,
        // Path-to-GA §C.4 (Path B): thread the optional canonical FK
        // through both modes without normalization. Undefined when the
        // caller didn't supply it; the service layer leaves the column
        // NULL in that case.
        submissionFk: parsed.data.submissionFk,
        applicationNumber: parsed.data.applicationNumber,
        // The route validates against the full eCTD region set and a flexible
        // submission-type string (per #928, which removed the hardcoded
        // enums). The orchestrator's OrchestratorInputs still declares the
        // legacy-narrow RegionCode / submission-type union, and treats region
        // as a string at its own boundaries (see `as RegionCode` in
        // submission-package-orchestrator). Cast at this trust boundary so the
        // wider, validated request value flows through unchanged.
        region: parsed.data.region as OrchestratorInputs['region'],
        submissionType: parsed.data.submissionType as OrchestratorInputs['submissionType'],
        cmcSources,
        nonclinicalStudies,
        clinicalStudyData: parsed.data.clinicalStudyData as OrchestratorInputs['clinicalStudyData'],
        csrInputs,
        drugSubstanceName: parsed.data.drugSubstanceName,
        drugProductName: parsed.data.drugProductName,
        indication: parsed.data.indication,
        skipValidation: parsed.data.skipValidation,
      };
    } else {
      // ── Mode B: backward-compat inline inputs ───────────────────────────
      orchestratorInputs = {
        submissionId: parsed.data.submissionId,
        submissionFk: parsed.data.submissionFk,
        applicationNumber: parsed.data.applicationNumber,
        // The route validates against the full eCTD region set and a flexible
        // submission-type string (per #928, which removed the hardcoded
        // enums). The orchestrator's OrchestratorInputs still declares the
        // legacy-narrow RegionCode / submission-type union, and treats region
        // as a string at its own boundaries (see `as RegionCode` in
        // submission-package-orchestrator). Cast at this trust boundary so the
        // wider, validated request value flows through unchanged.
        region: parsed.data.region as OrchestratorInputs['region'],
        submissionType: parsed.data.submissionType as OrchestratorInputs['submissionType'],
        cmcSources: (parsed.data.cmcSources ?? []) as OrchestratorInputs['cmcSources'],
        nonclinicalStudies: parsed.data.nonclinicalStudies ?? [],
        clinicalStudyData: parsed.data.clinicalStudyData as OrchestratorInputs['clinicalStudyData'],
        csrInputs: parsed.data.csrInputs ?? [],
        drugSubstanceName: parsed.data.drugSubstanceName,
        drugProductName: parsed.data.drugProductName,
        indication: parsed.data.indication,
        skipValidation: parsed.data.skipValidation,
      };
    }
  } catch (err) {
    log.error('Input assembly failed', { err: err instanceof Error ? err.message : String(err), organizationId });
    return serverError(res, log, 'saving runs', err);
  }

  try {
    const result = await runOrchestrator({
      ...orchestratorInputs,
      organizationId,
    });
    return res.json({
      runId: result.run.runId,
      status: result.run.status,
      steps: result.run.steps.map(s => {
        const r = redactStepOutputRef(s);
        return {
          key: r.key,
          status: r.status,
          durationMs: r.durationMs,
          outputRef: r.outputRef,
          error: r.error,
        };
      }),
      outputs: {
        m3SectionCount: result.outputs.module3Sections.length,
        csrTableSets: result.outputs.csrTables.length,
        m23: result.outputs.m23 ? {
          completeness: result.outputs.m23.completeness,
          gaps: result.outputs.m23.gaps,
        } : null,
        m24: result.outputs.m24 ? {
          completeness: result.outputs.m24.completeness,
          gaps: result.outputs.m24.gaps,
        } : null,
        m25: result.outputs.m25 ? {
          completeness: result.outputs.m25.completeness,
          gaps: result.outputs.m25.gaps,
        } : null,
        m27: result.outputs.m27 ? {
          completeness: result.outputs.m27.completeness,
          gaps: result.outputs.m27.gaps,
        } : null,
      },
    });
  } catch (err) {
    return serverError(res, log, 'saving runs', err);
  }
});

/**
 * Get the state of an orchestrator run.
 *
 * SECURITY: getRun is tenant-scoped at the SQL layer. A missing run and a
 * cross-org probe both collapse to 404 here so a caller cannot use the
 * status code to infer that a runId exists under a different tenant.
 */
router.get('/runs/:runId', async (req: Request, res: Response) => {
  const organizationId = requireTenant(req, res);
  if (organizationId == null) return;

  const run = await getRun(String(req.params.runId), organizationId);
  if (!run) return res.status(404).json({ error: 'run_not_found' });
  // Redact the sign step's snapshot from the response (see redactStepOutputRef).
  return res.json({ ...run, steps: run.steps.map(redactStepOutputRef) });
});

/**
 * Get the append-only step audit for a run.
 *
 * SECURITY: getRunAudit filters on (run_id, organization_id) at the SQL
 * layer. We additionally probe getRun first so a cross-org caller sees
 * 404 rather than an empty events array (which would still leak the
 * "this runId exists somewhere" signal).
 */
router.get('/runs/:runId/audit', async (req: Request, res: Response) => {
  const organizationId = requireTenant(req, res);
  if (organizationId == null) return;

  const runId = String(req.params.runId);
  const run = await getRun(runId, organizationId);
  if (!run) return res.status(404).json({ error: 'run_not_found' });

  const events = await getRunAudit(runId, organizationId);
  return res.json({ runId, events });
});

/**
 * Regenerate stale steps for a run.
 *
 * SECURITY: organizationId is JWT-bound on BOTH sides — the previousRun is
 * fetched under (runId, organizationId) so a cross-org probe sees 404, and
 * the same organizationId is spliced into the regenerate inputs so the
 * orchestrator service's tenant-mismatch guard
 * (`previousRun.organizationId !== inputs.organizationId`) is satisfied
 * tautologically. The request body is NOT trusted to carry
 * organizationId, matching POST /runs.
 */
router.post('/runs/:runId/regenerate', async (req: Request, res: Response) => {
  const organizationId = requireTenant(req, res);
  if (organizationId == null) return;

  const previousRun = await getRun(String(req.params.runId), organizationId);
  if (!previousRun) return res.status(404).json({ error: 'run_not_found' });

  const RegenSchema = buildRunSchema({
    changedStep: z.string().optional(),
  });
  const parsed = RegenSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
  }
  const { changedStep, ...inputs } = parsed.data;

  try {
    const result = await regenerateAffected(
      previousRun,
      {
        ...(inputs as Omit<OrchestratorInputs, 'organizationId'>),
        organizationId,
      },
      changedStep as StepKey | undefined
    );
    return res.json({
      runId: result.run.runId,
      status: result.run.status,
      regenerated: result.regenerated,
      steps: result.run.steps.map(s => ({ key: s.key, status: s.status })),
    });
  } catch (err) {
    return serverError(res, log, 'regenerating the run', err);
  }
});

/**
 * Build M2.3 QOS standalone (does not require a full orchestrator run).
 *
 * SECURITY: this route performs no DB writes, but a §11.10(e)-attributed
 * audit row is still required because the response IS regulated
 * submission content. Gated by requireTenant so unauthenticated /
 * unscoped callers cannot generate uncovered content.
 */
router.post('/m2/qos', async (req: Request, res: Response) => {
  const organizationId = requireTenant(req, res);
  if (organizationId == null) return;

  const Schema = z.object({
    module3Sections: z.array(z.unknown()),
    drugSubstanceName: z.string().optional(),
    drugProductName: z.string().optional(),
  });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
  }
  try {
    const summary = buildM23QualityOverallSummary(parsed.data as Parameters<typeof buildM23QualityOverallSummary>[0]);
    await auditOrchestratorAccess(req, organizationId, 'orchestrator_m23_built', {
      sectionCount: parsed.data.module3Sections.length,
      completeness: summary.completeness,
    });
    return res.json(summary);
  } catch (err) {
    return serverError(res, log, 'saving qos', err);
  }
});

router.post('/m2/nonclinical', async (req: Request, res: Response) => {
  const organizationId = requireTenant(req, res);
  if (organizationId == null) return;

  const Schema = z.object({
    nonclinicalStudies: z.array(NonclinicalStudySchema),
    drugSubstanceName: z.string().optional(),
    indication: z.string().optional(),
  });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
  }
  try {
    const summary = buildM24NonclinicalOverview(parsed.data);
    await auditOrchestratorAccess(req, organizationId, 'orchestrator_m24_built', {
      studyCount: parsed.data.nonclinicalStudies.length,
      completeness: summary.completeness,
    });
    return res.json(summary);
  } catch (err) {
    return serverError(res, log, 'saving nonclinical', err);
  }
});

router.post('/m2/clinical', async (req: Request, res: Response) => {
  const organizationId = requireTenant(req, res);
  if (organizationId == null) return;

  const Schema = z.object({
    csrs: z.array(CSRInputSchema),
    indication: z.string(),
    investigationalProduct: z.string(),
  });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
  }
  try {
    const summary = buildM27ClinicalSummary(parsed.data);
    await auditOrchestratorAccess(req, organizationId, 'orchestrator_m27_built', {
      csrCount: parsed.data.csrs.length,
      completeness: summary.completeness,
    });
    return res.json(summary);
  } catch (err) {
    return serverError(res, log, 'saving clinical', err);
  }
});

/**
 * Build M2.5 Clinical Overview standalone (does not require a full orchestrator run).
 */
router.post('/m2/clinical-overview', async (req: Request, res: Response) => {
  const organizationId = requireTenant(req, res);
  if (organizationId == null) return;

  const Schema = z.object({
    csrs: z.array(CSRInputSchema),
    indication: z.string(),
    investigationalProduct: z.string(),
    developmentRationale: z.string().optional(),
    nonclinicalConclusion: z.string().optional(),
  });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
  }
  try {
    const summary = buildM25ClinicalOverview(parsed.data);
    await auditOrchestratorAccess(req, organizationId, 'orchestrator_m25_built', {
      csrCount: parsed.data.csrs.length,
      completeness: summary.completeness,
    });
    return res.json(summary);
  } catch (err) {
    return serverError(res, log, 'saving clinical overview', err);
  }
});

/**
 * Build CSR §10–§12 tabulations for a single study.
 */
router.post('/csr/tabulate', async (req: Request, res: Response) => {
  const organizationId = requireTenant(req, res);
  if (organizationId == null) return;

  const Schema = StudyDataSchema;
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
  }
  try {
    const tables = buildCSRTables(parsed.data as Parameters<typeof buildCSRTables>[0]);
    await auditOrchestratorAccess(req, organizationId, 'orchestrator_csr_tabulated', {
      studyId: parsed.data.studyId,
      protocolNumber: parsed.data.protocolNumber,
    });
    return res.json(tables);
  } catch (err) {
    return serverError(res, log, 'tabulating the CSR', err);
  }
});

/**
 * Run the hardened eCTD validator (DTD + sequence + MD5 + study-id + regional).
 *
 * SECURITY: gated by requireTenant for the same §11.10(e) reason as the
 * standalone builders — the validator output (findings, gatewayReady,
 * hardenedScore) drives go/no-go submission decisions and so the access
 * must be attributable to a tenant + user even though no DB write
 * occurs in the validator itself.
 */
router.post('/validate/hardened', async (req: Request, res: Response) => {
  const organizationId = requireTenant(req, res);
  if (organizationId == null) return;

  const LeafSchema = z.object({
    sectionCode: z.string(),
    title: z.string(),
    checksum: z.string(),
    checksumType: z.literal('md5'),
    operation: z.enum(['new', 'append', 'replace', 'delete']),
    lifecycleOperator: z.string().optional(),
    filePath: z.string(),
    mimeType: z.string(),
    fileSize: z.number(),
    studyId: z.string().optional(),
  });
  const ValidatorRegionSchema = z.enum(['US', 'EU', 'JP', 'CA', 'UK', 'CN', 'AU', 'CH', 'BR', 'IN', 'KR', 'SG']);
  const Schema = z.object({
    leaves: z.array(LeafSchema),
    submissionId: z.string(),
    region: ValidatorRegionSchema,
    applicationNumber: z.string(),
    sequenceNumber: z.string().regex(/^\d{4}$/),
    submissionType: z.string(),
    totalSizeBytes: z.number().optional(),
    backboneXml: z.string().optional(),
  });
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
  }
  const { leaves, backboneXml, ...context } = parsed.data;
  try {
    const result = await validateEctdPackageHardened(leaves, context, backboneXml);
    await auditOrchestratorAccess(req, organizationId, 'orchestrator_validated_hardened', {
      submissionId: context.submissionId,
      region: context.region,
      sequenceNumber: context.sequenceNumber,
      leafCount: leaves.length,
      gatewayReady: result.gatewayReady,
      hardenedScore: result.hardenedScore,
    });
    return res.json({
      gatewayReady: result.gatewayReady,
      hardenedScore: result.hardenedScore,
      summary: result.summary,
      findings: flattenFindings(result),
    });
  } catch (err) {
    return serverError(res, log, 'saving hardened', err);
  }
});

export default router;
