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
import auditService from '../services/auditService.js';
import { createScopedLogger } from '../utils/logger.js';

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
  try {
    const user = (req as any).user;
    await auditService.logAction({
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
  } catch (err) {
    log.warn('orchestrator audit write failed (non-fatal)', {
      err: err instanceof Error ? err.message : String(err),
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

const RunSchema = z.object({
  submissionId: z.string().min(1),
  applicationNumber: z.string().min(1),
  region: RegionSchema,
  submissionType: SubmissionTypeSchema,
  cmcSources: z.array(CanonicalSourceSchema).default([]),
  nonclinicalStudies: z.array(NonclinicalStudySchema).default([]),
  clinicalStudyData: z.array(StudyDataSchema).default([]),
  csrInputs: z.array(CSRInputSchema).default([]),
  drugSubstanceName: z.string().optional(),
  drugProductName: z.string().optional(),
  indication: z.string().optional(),
  skipValidation: z.boolean().optional(),
});

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

  const parsed = RunSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
  }

  try {
    const result = await runOrchestrator({
      ...(parsed.data as Omit<OrchestratorInputs, 'organizationId'>),
      organizationId,
    });
    return res.json({
      runId: result.run.runId,
      status: result.run.status,
      steps: result.run.steps.map(s => ({
        key: s.key,
        status: s.status,
        durationMs: s.durationMs,
        outputRef: s.outputRef,
        error: s.error,
      })),
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
    return res.status(500).json({
      error: 'orchestrator_failed',
      message: err instanceof Error ? err.message : String(err),
    });
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
  return res.json(run);
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

  const RegenSchema = RunSchema.extend({
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
    return res.status(500).json({
      error: 'regenerate_failed',
      message: err instanceof Error ? err.message : String(err),
    });
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
    return res.status(500).json({ error: 'm23_failed', message: err instanceof Error ? err.message : String(err) });
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
    return res.status(500).json({ error: 'm24_failed', message: err instanceof Error ? err.message : String(err) });
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
    return res.status(500).json({ error: 'm27_failed', message: err instanceof Error ? err.message : String(err) });
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
    return res.status(500).json({ error: 'm25_failed', message: err instanceof Error ? err.message : String(err) });
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
    return res.status(500).json({ error: 'csr_tabulate_failed', message: err instanceof Error ? err.message : String(err) });
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
    return res.status(500).json({ error: 'validation_failed', message: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
