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
  buildM27ClinicalSummary,
} from '../services/m2-summary-builders.js';
import { buildCSRTables } from '../services/csr-tabulation-builders.js';
import { validateEctdPackageHardened, flattenFindings } from '../services/ectd/ectd-validator-hardening.js';

const router = Router();

// ── Validation schemas ──────────────────────────────────────────────────────

const RegionSchema = z.enum(['US', 'EU', 'JP', 'CA']);
const SubmissionTypeSchema = z.enum(['IND', 'NDA', 'BLA', '510k', 'PMA', 'JNDA', 'MAA']);

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
 */
router.post('/runs', async (req: Request, res: Response) => {
  const parsed = RunSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
  }

  try {
    const result = await runOrchestrator(parsed.data as OrchestratorInputs);
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
 */
router.get('/runs/:runId', async (req: Request, res: Response) => {
  const run = await getRun(String(req.params.runId));
  if (!run) return res.status(404).json({ error: 'run_not_found' });
  return res.json(run);
});

/**
 * Get the append-only step audit for a run.
 */
router.get('/runs/:runId/audit', async (req: Request, res: Response) => {
  const events = await getRunAudit(String(req.params.runId));
  return res.json({ runId: req.params.runId, events });
});

/**
 * Regenerate stale steps for a run.
 */
router.post('/runs/:runId/regenerate', async (req: Request, res: Response) => {
  const previousRun = await getRun(String(req.params.runId));
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
      inputs as OrchestratorInputs,
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
 */
router.post('/m2/qos', (req: Request, res: Response) => {
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
    return res.json(summary);
  } catch (err) {
    return res.status(500).json({ error: 'm23_failed', message: err instanceof Error ? err.message : String(err) });
  }
});

router.post('/m2/nonclinical', (req: Request, res: Response) => {
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
    return res.json(summary);
  } catch (err) {
    return res.status(500).json({ error: 'm24_failed', message: err instanceof Error ? err.message : String(err) });
  }
});

router.post('/m2/clinical', (req: Request, res: Response) => {
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
    return res.json(summary);
  } catch (err) {
    return res.status(500).json({ error: 'm27_failed', message: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * Build CSR §10–§12 tabulations for a single study.
 */
router.post('/csr/tabulate', (req: Request, res: Response) => {
  const Schema = StudyDataSchema;
  const parsed = Schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
  }
  try {
    const tables = buildCSRTables(parsed.data as Parameters<typeof buildCSRTables>[0]);
    return res.json(tables);
  } catch (err) {
    return res.status(500).json({ error: 'csr_tabulate_failed', message: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * Run the hardened eCTD validator (DTD + sequence + MD5 + study-id + regional).
 */
router.post('/validate/hardened', async (req: Request, res: Response) => {
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
  const Schema = z.object({
    leaves: z.array(LeafSchema),
    submissionId: z.string(),
    region: RegionSchema,
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
