/**
 * Submission-Package Orchestrator API Routes
 *
 * Endpoints:
 *   POST   /api/submission-orchestrator/runs                      — start a new orchestration run
 *   GET    /api/submission-orchestrator/runs/:runId               — get run state
 *   GET    /api/submission-orchestrator/runs/:runId/audit         — append-only step audit
 *   POST   /api/submission-orchestrator/runs/:runId/regenerate    — regenerate stale steps
 *
 * The standalone request-body builders (/m2/*, /csr/tabulate, /validate/hardened)
 * are retired; see the note above `export default router`.
 *
 * @module server/routes/submission-orchestrator
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  SUBMISSION_REGIONS,
  normalizeSubmissionRegion,
} from '../services/module3-regional-readiness.js';
import {
  loadSubmissionFkBySubmissionIdText,
  runOrchestrator,
  getRun,
  getRunAudit,
  regenerateAffected,
  type OrchestratorInputs,
  type OrchestratorRun,
  type StepKey,
} from '../services/submission-package-orchestrator.js';
import { loadApprovedCmcSourcesForProject } from '../services/cmc/load-approved-cmc-sources-for-project.js';
import { loadCsrInputsForProject } from '../services/csr/load-csr-inputs-for-project.js';
import { readProgramCsrSourceReadiness, CSR_NARRATIVE_INPUTS_REQUIRED } from '../services/csr/program-source-readiness.js';
import { CsrScopeError, resolveCsrScope } from '../services/csr/project-scope';
import { db } from '../db.js';
import { loadNonclinicalStudiesForProject } from '../services/preclinical/load-nonclinical-studies-for-project.js';
import { pool } from '../db.js';
import auditService from '../services/auditService.js';
import { createScopedLogger } from '../utils/logger.js';
import { config } from '../config/environment.js';
import { serverError } from '../lib/api-response';
import { requireEditorAccess } from '../middleware/orgMembership.js';
import { continueOrchestratorRun, requireOrchestratorProgramAccess, OrchestratorContinuationRefusal } from '../services/submission-orchestrator-continuation.js';
import { readProgramAnchorRow } from '../services/c2c/program-project-anchor.js';
import { resolveSubmissionSpine, resolveSequenceSpine } from '../services/cmc/submission-spine.js';
import { readSubmissionPackageIdentity, packageIdentityRefusal } from '../services/ectd/package-identity.js';
import { CsrSourceInputError } from '../services/csr/vault-source-input.js';
import { createCsrSourceInputRouter } from './csr-source-inputs.js';

const log = createScopedLogger('submission-orchestrator');

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
  const raw = (req as any).tenantContext?.organizationId ?? (req as any).user?.organizationId;
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
 * The canonical `public.submissions(id)` this run belongs to, or undefined.
 *
 * `submission_orchestrator_runs` carries the submission twice: `submission_id`
 * (TEXT, legacy, free-form) and `submission_id_fk` (INTEGER, joinable). The
 * orchestrator writes the FK only when a caller supplies one, leaving the
 * column NULL otherwise — and `submissionFk` is optional on this route, which
 * no client populates, so every run the product created stored NULL.
 *
 * That column is load-bearing. The §11.70 release-signature gate
 * (services/ectd/release-signature-status.ts) locates a submission's signed
 * packages with `WHERE submission_id_fk = <id>`, so an unlinked run is
 * invisible to it: a customer could orchestrate a package AND sign its release
 * and still be told no release signature existed — a state whose implied
 * remedy, signing, only adds one more unlinked run.
 *
 * `loadSubmissionFkBySubmissionIdText` is the resolver OrchestratorInputs'
 * own documentation points callers at for exactly this. It is tenant-scoped
 * against the JWT organization, resolves only an integer-coercible TEXT id,
 * and returns null rather than guessing — so a business-domain id like
 * 'SUB-2026-001' still stores NULL, and the gate reports that submission as
 * undetermined rather than unsigned. Best-effort throughout: the resolver
 * swallows its own errors and the run never blocks on this.
 */
async function resolveSubmissionFk(
  inputs: Omit<OrchestratorInputs, 'organizationId'>,
  organizationId: number
): Promise<number | undefined> {
  if (typeof inputs.submissionFk === 'number') return inputs.submissionFk;
  return (
    (await loadSubmissionFkBySubmissionIdText(inputs.submissionId, organizationId)) ?? undefined
  );
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
router.use(createCsrSourceInputRouter(requireTenant));

function requireOrchestratorWrite(req: Request, res: Response, next: () => void) {
  if (requireTenant(req, res) == null) return;
  return requireEditorAccess(req, res, next);
}

/* No clinicalSource (RULE 4, 2026-10-31): a study's clinical source is frozen as its CSR document's study data,
   in the editor (POST /csr/study-data, services/csr/csr-study-data.ts), not chosen for a package run. Strict, so a
   caller still sending one is refused rather than given a run without it. */
const ProgramRunSchema = z.object({ programId: z.string().guid(), sequenceId: z.number().int().positive().optional(), enableCSRNarrative: z.boolean().optional() }).strict();

/** Read retained summaries separately from the unimplemented clinical-data adapter. */
router.get('/csr/readiness', async (req, res) => {
  const organizationId = requireTenant(req, res);
  if (organizationId == null) return;
  const parsed = z.string().guid().safeParse(req.query.programId);
  if (!parsed.success) return res.status(400).json({ error: 'CSR_SCOPE_INVALID', message: 'A project UUID is required.' });
  const userId = orchestratorActorId(req);
  try {
    return res.json(await readProgramCsrSourceReadiness(pool, organizationId, parsed.data, userId));
  } catch (err) {
    if (err instanceof CsrScopeError) return res.status(err.status).json({ error: err.code, message: err.message });
    return serverError(res, log, 'reading CSR source readiness', err);
  }
});

/** Discover retained work for the selected canonical program; never return private inputs. */
router.get('/runs', async (req, res) => {
  const organizationId = requireTenant(req, res);
  if (organizationId == null) return;
  const parsed = z.string().guid().safeParse(req.query.programId);
  if (!parsed.success) return res.status(400).json({ error: 'program_scope_required' });
  try {
    // Read-side program privacy follows the canonical org-scoped program policy.
    const { rows } = await pool.query(`SELECT r.run_id AS "runId", r.submission_id AS "submissionId", r.status, r.started_at AS "startedAt", r.completed_at AS "completedAt"
      FROM submission_orchestrator_runs r LEFT JOIN submission_orchestrator_inputs i ON i.run_id = r.run_id AND i.organization_id = r.organization_id
      LEFT JOIN submissions s ON s.organization_id = r.organization_id AND s.deleted_at IS NULL AND
        ((r.submission_id_fk IS NOT NULL AND s.id = r.submission_id_fk) OR (r.submission_id_fk IS NULL AND s.id::text = r.submission_id))
      JOIN regulatory_programs p ON p.id = COALESCE(i.program_id, s.program_id) AND p.organization_id = r.organization_id AND p.deleted_at IS NULL
      WHERE r.organization_id = $1 AND p.id = $2 ORDER BY r.started_at DESC LIMIT 25`, [organizationId, parsed.data]);
    return res.json({ runs: rows });
  } catch (err) { return serverError(res, log, 'reading program runs', err); }
});

/** Start with recorded identity and governed loaders, never a caller-provided evidence corpus. */
function recordedProgramAnchor(programId: string, program: Record<string, unknown>) {
  return { programId, programType: String(program.program_type ?? ''),
    productName: program.product_name == null ? null : String(program.product_name),
    title: String(program.name ?? ''), programCode: program.code == null ? null : String(program.code) };
}

async function sendStartedProgramRun(res: Response, input: {
  run: OrchestratorRun; organizationId: number; userId: number; m3Refusal: string | null;
}) {
  const { run, organizationId, userId, m3Refusal } = input;
    let currentRun = run;
    let continuationError: string | undefined;
    if (currentRun.status === 'awaiting-async') {
      // Close the fast-job race: completion may have happened before the
      // freshly-created run first became discoverable by the worker hook.
      try { currentRun = (await continueOrchestratorRun(currentRun.runId, organizationId, userId)).run; }
      catch (err) { continuationError = err instanceof OrchestratorContinuationRefusal || err instanceof CsrScopeError ? err.code : 'CONTINUATION_UNAVAILABLE'; }
    }
    return res.json({ ...currentRun, steps: currentRun.steps.map(redactStepOutputRef), m3Refusal, continuationError,
      inputGaps: ['No nonclinical study corpus is linked to this project.',
        'A study’s clinical data is its CSR document’s, frozen in the editor. Only completed, accessible CSR summaries are included in a run.'],
    });
}

function orchestratorActorId(req: Request): number {
  return Number((req as any).user?.id ?? (req as any).user?.userId);
}

function startProgramRunRefusal(res: Response, err: unknown) {
    if (err instanceof CsrSourceInputError) return res.status(err.status).json({ error: err.code, message: err.message, ...(err.issues ? { issues: err.issues } : {}) });
    if (err instanceof OrchestratorContinuationRefusal || err instanceof CsrScopeError) return res.status(err.status).json({ error: err.code, message: err.message });
    return serverError(res, log, 'starting the program run', err);
}

router.post('/runs/for-program', requireOrchestratorWrite, async (req, res) => {
  const organizationId = requireTenant(req, res);
  if (organizationId == null) return;
  const parsed = ProgramRunSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_request' });
  const userId = orchestratorActorId(req);
  try {
    const { programId, sequenceId, enableCSRNarrative } = parsed.data;
    const program = await requireOrchestratorProgramAccess(organizationId, programId, userId);
    // The current project loader supplies completed narrative summaries only.
    // Opting into fresh CSR drafting would recycle those summaries with missing
    // study metadata (including a placeholder sponsor), not load real clinical
    // observations. Refuse before creating any run or downstream job.
    if (enableCSRNarrative === true) return res.status(409).json({ error: CSR_NARRATIVE_INPUTS_REQUIRED.code, message: CSR_NARRATIVE_INPUTS_REQUIRED.message });
    const anchor = recordedProgramAnchor(programId, program);
    const spine = sequenceId ? await resolveSequenceSpine(anchor, organizationId, sequenceId) : await resolveSubmissionSpine(anchor, organizationId);
    if (!spine?.sequence || spine.match !== 'program') return res.status(409).json({ error: 'SUBMISSION_SEQUENCE_REQUIRED', message: 'The selected project needs a recorded submission and sequence before it can be orchestrated.' });
    // The sequence's own market's number (P-44), as the run's identity reader judges it.
    const identity = await readSubmissionPackageIdentity(pool, organizationId, spine.submissionId, { region: spine.sequence.region });
    const identityRefusal = packageIdentityRefusal(identity, 'Nothing was built.');
    if (identityRefusal) return res.status(409).json({ error: identityRefusal.code, message: identityRefusal.message });
    const project = await readProgramAnchorRow(pool as any, { programId, orgId: organizationId, context: 'submission-orchestrator', requireUnique: true });
    const [cmc, csrInputs] = await Promise.all([
      loadApprovedCmcSourcesForProject(organizationId, programId, String(userId)),
      project ? loadCsrInputsForProject(organizationId, project.id, { actorUserId: userId }) : Promise.resolve([]),
    ]);
    const commonInputs: OrchestratorInputs = { organizationId, programId, userId, projectId: project?.id,
      submissionId: String(spine.submissionId), submissionFk: spine.submissionId, applicationNumber: identity.applicationNumber!,
      sequenceNumber: spine.sequence.sequenceNumber, region: normalizeSubmissionRegion(spine.sequence.region) as OrchestratorInputs['region'], submissionType: spine.applicationType.toUpperCase() as OrchestratorInputs['submissionType'],
      cmcSources: cmc.sources, csrInputs, clinicalStudyData: [], nonclinicalStudies: [], module3ExportRefusal: cmc.gate === 'open' ? null : cmc.reason, enableCSRNarrative,
    };
    const result = await runOrchestrator(commonInputs);
    return await sendStartedProgramRun(res, {
      run: result.run, organizationId, userId, m3Refusal: cmc.gate === 'open' ? null : cmc.reason,
    });
  } catch (err) {
    return startProgramRunRefusal(res, err);
  }
});

router.post('/runs/:runId/resume', requireOrchestratorWrite, async (req, res) => {
  const organizationId = requireTenant(req, res);
  if (organizationId == null) return;
  const runId = z.string().guid().safeParse(req.params.runId);
  if (!runId.success) return res.status(400).json({ error: 'invalid_run_id' });
  try {
    const result = await continueOrchestratorRun(runId.data, organizationId, orchestratorActorId(req));
    return res.json({ continuation: result.continuation, run: { ...result.run, steps: result.run.steps.map(redactStepOutputRef) } });
  } catch (err) {
    if (err instanceof OrchestratorContinuationRefusal || err instanceof CsrScopeError) return res.status(err.status).json({ error: err.code, message: err.message });
    return serverError(res, log, 'continuing the run', err);
  }
});

// ── Validation schemas ──────────────────────────────────────────────────────

/* Derived from SUBMISSION_REGIONS (the twelve canonical regions of
   shared/regulatory/region-identity plus GLOBAL), not restated. This was an
   independent z.enum, and being independent is how it drifted nine regions away
   from the Module 3 3.2.R templates without anything noticing — a run for UK
   reported its regional step "skipped (no inputs)" against inputs that were
   plainly there. Adding a region now reaches the classifier and its tests. */
const RegionSchema = z.enum(SUBMISSION_REGIONS);
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
    'pharmacology',
    'pharmacokinetics',
    'toxicology',
    'safety_pharmacology',
    'reproductive_tox',
    'genotoxicity',
    'carcinogenicity',
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
  /** Whether the primary endpoint was met, as recorded; absent or null = not
   *  recorded. The 2.5 / 2.7 builders state "Efficacy was demonstrated" only
   *  from `true` (2026-10-15: they inferred it from a Phase 3 CSR existing). */
  primaryEndpointMet: z.boolean().nullable().optional(),
  /** null = not recorded; never 0, which reads as "no subjects enrolled". */
  sampleSize: z.number().nullable(),
  ittPopulation: z.number().optional(),
  treatmentArms: z.array(z.string()).optional(),
  topAEs: z
    .array(z.object({ pt: z.string(), rate: z.string(), severity: z.string().optional() }))
    .optional(),
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
  // Development fixtures only. Outside development a non-empty array is refused
  // before parsing (refusedInlineRunInputs, Rule 2 audit S1): the run's
  // clinical study data comes from the approved CSR Vault source, frozen as the
  // CSR document's study data (POST /csr/study-data), not supplied to a run.
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
  cmcProjectId: z.string().guid().optional(),
  ctdProgramId: z.number().int().positive().optional(),
  // Mode A explicitly rejects hand-built inputs.
  cmcSources: z.undefined().optional(),
  nonclinicalStudies: z.undefined().optional(),
  csrInputs: z.undefined().optional(),
});

// Mode B — backward-compat. Existing programmatic callers supply
// pre-assembled OrchestratorInputs arrays in the body. No loader is invoked.
//
// GA plan item 1 (decision 2026-10-05): `cmcSources` here is refused outside
// development. Module 3 reaches a submission through one governed path —
// compile, approve under Part 11, pass evaluateFinalExportGate, place — and a
// hand-built array in a request body is a second one that skips every step of
// it. The composed sections become the run's leaf manifest
// (package.assemble derives one leaf per section) and package.sign signs them,
// so the body could put a release signature over Module 3 content that exists
// in no record and nobody approved. The other two arrays are not CMC and are
// not judged here; they belong to their own lanes.
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

/**
 * Module 3 comes from the record, not from the request.
 *
 * Checked on the RAW body, so the refusal cannot depend on which schema branch
 * matched, and before any read or write. Applied to every route that accepts
 * run inputs — `/runs` and `/runs/:runId/regenerate` — because a regenerate
 * carries the same arrays and would otherwise be the same door one level down.
 *
 * Development keeps the array, for fixtures and the orchestrator's own
 * integration tests; nothing in a deployed environment composes Module 3 from
 * a request body.
 *
 * @returns true when the request was refused and the response already sent.
 */
function refusedInlineCmcSources(rawBody: any, res: Response, organizationId: number): boolean {
  if (config.isDevelopment) return false;
  if (!Array.isArray(rawBody?.cmcSources) || rawBody.cmcSources.length === 0) return false;
  log.warn('Inline cmcSources refused outside development', { organizationId });
  res.status(400).json({
    error: 'INLINE_CMC_SOURCES_REFUSED',
    field: 'cmcSources',
    message:
      'CMC data cannot be supplied in the request. Module 3 reaches a submission through the CMC module: ' +
      'compile the sections (POST /api/cmc/module3-os/compile/:projectId), approve each one, then place them ' +
      '(POST /api/cmc/module3-os/place-into-submission/:projectId). Send cmcProjectId instead and the run ' +
      'reads that project\u2019s approved Module 3.',
  });
  return true;
}

/** The run inputs that carry clinical or nonclinical figures. */
const INLINE_RUN_INPUT_FIELDS = ['nonclinicalStudies', 'csrInputs', 'clinicalStudyData'] as const;

/**
 * Clinical and nonclinical figures come from the record, not from the request
 * (CLAUDE.md Rule 2; Rule 2 audit S1, 2026-10-26).
 *
 * `nonclinicalStudies`, `csrInputs` and `clinicalStudyData` in a body became
 * Module 2.4/2.5/2.7 and the CSR tables of a run that `package.sign` can sign:
 * figures nobody recorded or approved. A Mode A `ctdProgramId` composed Module
 * 2.4 from `ctd_nonclinical_studies`, the landing table of the model-run
 * preclinical extractor. A Mode A regenerate runs no loader at all, so it
 * re-ran every step over empty inputs.
 *
 * Checked on the raw body, before any read or write, on both routes that take
 * run inputs, after the CMC refusal (which keeps its own code). Empty arrays
 * are not refused; development keeps the fixture door.
 *
 * @returns true when the request was refused and the response already sent.
 */
function refusedInlineRunInputs(rawBody: any, res: Response, organizationId: number, route: 'runs' | 'regenerate'): boolean {
  if (refusedInlineCmcSources(rawBody, res, organizationId)) return true;
  if (config.isDevelopment) return false;
  const field = INLINE_RUN_INPUT_FIELDS.find(k => Array.isArray(rawBody?.[k]) && rawBody[k].length > 0);
  if (field) {
    log.warn('Inline run inputs refused outside development', { organizationId, field });
    res.status(400).json({
      error: 'INLINE_RUN_INPUTS_REFUSED',
      field,
      message:
        'Clinical and nonclinical data cannot be supplied in the request. Start the run from the program ' +
        '(POST /api/submission-orchestrator/runs/for-program); the run reads the project\u2019s completed CSR builds. ' +
        'A study\u2019s clinical data is frozen as its CSR document\u2019s study data in the editor. Module 2.4 has no record source yet, so a run carries none.',
    });
    return true;
  }
  if (rawBody?.ctdProgramId !== undefined && rawBody?.ctdProgramId !== null) {
    log.warn('ctdProgramId run input refused outside development', { organizationId });
    res.status(400).json({
      error: 'CTD_PROGRAM_INPUTS_REFUSED',
      field: 'ctdProgramId',
      message:
        'A run does not read nonclinical studies from a CTD program: those rows are the preclinical extractor\u2019s output, ' +
        'not a governed record. Module 2.4 has no record source yet, so a run carries none. ' +
        'Start the run from the program (POST /api/submission-orchestrator/runs/for-program).',
    });
    return true;
  }
  if (route === 'regenerate' && rawBody?.projectId !== undefined && rawBody?.projectId !== null) {
    log.warn('Mode A regenerate refused outside development', { organizationId });
    res.status(400).json({
      error: 'REGENERATE_MODE_A_UNSUPPORTED',
      field: 'projectId',
      message:
        'A regenerate reads no project inputs, so it would re-run every step over none. ' +
        'Start a new run from the program (POST /api/submission-orchestrator/runs/for-program).',
    });
    return true;
  }
  return false;
}

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
router.post('/runs', requireOrchestratorWrite, async (req: Request, res: Response) => {
  const organizationId = requireTenant(req, res);
  if (organizationId == null) return;

  const rawBody = req.body ?? {};
  // Refused figures get their own code and field whatever else the body
  // carries (S1 review, 2026-10-26: beside a projectId they read as ambiguous).
  if (refusedInlineRunInputs(rawBody, res, organizationId, 'runs')) return;

  // Defensive: reject ambiguous requests where the caller supplied BOTH
  // projectId AND any hand-built input array. Either mode by itself is
  // valid; both together is a programming error.
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
    return res.status(400).json({
      error: 'ambiguous_request',
      message:
        'Supply either projectId OR inline {cmcSources, nonclinicalStudies, csrInputs} — never both.',
    });
  }

  const parsed = RunSchema.safeParse(rawBody);
  if (!parsed.success) {
    // Same PHI-protection rationale as charters.ts: don't echo parsed.error
    // (Zod issues include 'received' values). Log full issues server-side.
    log.warn('Invalid /runs body', { issues: parsed.error.issues, organizationId });
    return res.status(400).json({ error: 'invalid_request' });
  }

  let orchestratorInputs: Omit<OrchestratorInputs, 'organizationId'>;
  /** Why this run carries no Module 3, when a gate refused it. */
  let module3Refusal: string | null = null;
  try {
    if (parsed.data.mode === 'project') {
      // ── Mode A: server-side input assembly ──────────────────────────────
      // Tenant-scoped probe BEFORE any loader call. Cross-org projectId
      // returns 403 (not 404) — same existence-info-leak prevention as
      // charters.ts:238-251. The caller IS authenticated; "you can't see
      // this resource" is the honest answer regardless of which org owns it.
      const { rows } = await pool.query(
        'SELECT id FROM projects WHERE id = $1 AND organization_id = $2 LIMIT 1',
        [parsed.data.projectId, organizationId]
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
      /* Module 3 only from a program whose export gate is OPEN
         (load-approved-cmc-sources-for-project.ts, GA plan item 1). The gate
         is not re-interpreted here: when it refuses, the run carries no
         Module 3 and the reason is recorded and returned. */
      await resolveCsrScope(db, organizationId, { projectId: parsed.data.projectId }, { forWrite: false, actorUserId: orchestratorActorId(req) });
      const [governedCmc, nonclinicalStudies, csrInputs] = await Promise.all([
        parsed.data.cmcProjectId
          ? loadApprovedCmcSourcesForProject(
              organizationId,
              parsed.data.cmcProjectId,
              String((req as any).user?.id ?? 'unknown'),
            )
          : Promise.resolve({ gate: 'open' as const, sources: [], approvedSections: 0 }),
        parsed.data.ctdProgramId
          ? loadNonclinicalStudiesForProject(organizationId, parsed.data.ctdProgramId)
          : Promise.resolve([]),
        loadCsrInputsForProject(organizationId, parsed.data.projectId, { actorUserId: orchestratorActorId(req) }),
      ]);
      const cmcSources = governedCmc.sources;
      module3Refusal = governedCmc.gate === 'open' ? null : governedCmc.reason;

      // 21 CFR Part 11 §11.10(e) audit attribution. Log COUNTS only — never
      // the payload bodies (PHI / sponsor-confidential data lives there).
      auditService
        .logAction({
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
            /* Why a run carries no Module 3 is the governed fact here: a
               closed gate, an unreadable one, and a program with no CMC data
               are three different states and the audit row tells them apart. */
            cmcExportGate: governedCmc.gate,
            cmcExportGateReason: module3Refusal ?? undefined,
            nonclinicalStudyCount: nonclinicalStudies.length,
            csrInputCount: csrInputs.length,
          },
        })
        .catch(err => log.warn('Audit log failed (non-fatal)', { err: err?.message }));

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
        // So m3.compose records WHY it carried none, not just that it did.
        module3ExportRefusal: module3Refusal,
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
    if (err instanceof CsrScopeError) return res.status(err.status).json({ error: err.message, code: err.code });
    // 2026-10-15: a ctdProgramId outside the organization (the nonclinical
    // loader now throws instead of reading it as "no studies") answered 500.
    if (err instanceof Error && err.name === 'CtdProgramNotFoundError') {
      return res.status(422).json({ error: err.message, code: 'CTD_PROGRAM_NOT_FOUND' });
    }
    log.error('Input assembly failed', {
      err: err instanceof Error ? err.message : String(err),
      organizationId,
    });
    return serverError(res, log, 'saving runs', err);
  }

  try {
    const result = await runOrchestrator({
      ...orchestratorInputs,
      submissionFk: await resolveSubmissionFk(orchestratorInputs, organizationId),
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
        /* Null when Module 3 was carried. Otherwise the gate's own words, so a
           run that composed none says why rather than reading as a program
           with no CMC data. */
        m3Refusal: module3Refusal,
        csrTableSets: result.outputs.csrTables.length,
        m23: result.outputs.m23
          ? {
              completeness: result.outputs.m23.completeness,
              gaps: result.outputs.m23.gaps,
            }
          : null,
        m24: result.outputs.m24
          ? {
              completeness: result.outputs.m24.completeness,
              gaps: result.outputs.m24.gaps,
            }
          : null,
        m25: result.outputs.m25
          ? {
              completeness: result.outputs.m25.completeness,
              gaps: result.outputs.m25.gaps,
            }
          : null,
        m27: result.outputs.m27
          ? {
              completeness: result.outputs.m27.completeness,
              gaps: result.outputs.m27.gaps,
            }
          : null,
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

  try {
    const run = await getRun(String(req.params.runId), organizationId);
    if (!run) return res.status(404).json({ error: 'run_not_found' });
    // Redact the sign step's snapshot from the response (see redactStepOutputRef).
    return res.json({ ...run, steps: run.steps.map(redactStepOutputRef) });
  } catch (err) {
    // A read that failed is not a run that does not exist.
    return serverError(res, log, 'reading the run', err);
  }
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
  try {
    const run = await getRun(runId, organizationId);
    if (!run) return res.status(404).json({ error: 'run_not_found' });

    const events = await getRunAudit(runId, organizationId);
    return res.json({ runId, events });
  } catch (err) {
    // The audit trail is the compliance record: a failed read must not render
    // as "no recorded actions".
    return serverError(res, log, 'reading the run audit', err);
  }
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
router.post('/runs/:runId/regenerate', requireOrchestratorWrite, async (req: Request, res: Response) => {
  const organizationId = requireTenant(req, res);
  if (organizationId == null) return;
  // Before the run is read: the refusal depends on the body alone (S1 review).
  if (refusedInlineRunInputs(req.body ?? {}, res, organizationId, 'regenerate')) return;

  let previousRun;
  try {
    previousRun = await getRun(String(req.params.runId), organizationId);
  } catch (err) {
    return serverError(res, log, 'reading the run', err);
  }
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
    // Every step re-ran on a NEW run; `regenerated` is the list of steps that
    // were stale on the superseded run, not a subset that was recomputed.
    return res.json({
      runId: result.run.runId,
      supersededRunId: result.supersededRunId,
      status: result.run.status,
      regenerated: result.regenerated,
      steps: result.run.steps.map(s => ({ key: s.key, status: s.status })),
    });
  } catch (err) {
    return serverError(res, log, 'regenerating the run', err);
  }
});

/* POST /m2/qos is retired (GA plan item 1, decision 2026-10-05).
   ────────────────────────────────────────────────────────────────────────────
   It composed a Module 2.3 Quality Overall Summary from a `module3Sections`
   array in the REQUEST BODY — regulated submission content built from whatever
   the caller sent, backed by no record and approved by nobody. It is the same
   defect `cmc-quality-summary-tool.ts` was rewritten to remove on 2026-10-04,
   surviving on an HTTP route: that tool's own header says the model "required
   … `cmcSources[]` … Every figure in it was model-authored, which CLAUDE.md
   Rule 2 forbids".

   The replacements, by path:
     • the record-composed QOS — AnA's `draft_quality_overall_summary_m2_3`
       (services/ana/cmc-quality-summary-tool.ts), which takes NO CMC data,
       resolves the open program, composes through `composeProjectModule3` and
       refuses a call that carries `cmcSources`;
     • the Module 3 it summarizes —
       `POST /api/cmc/module3-os/compile/:projectId`, then approval, then
       `POST /api/cmc/module3-os/place-into-submission/:projectId`
       (services/cmc/place-module3-into-submission.ts) and the submissions
       spine's export;
     • inside a run — the `m2.3.qos` step, which now reads only the Module 3 of
       a program whose export gate is open
       (services/cmc/load-approved-cmc-sources-for-project.ts).

   No caller existed in client/src, in server code, in scripts or in the staff
   simulation. History search (`git log --all --diff-filter=D --
   'server/routes/submission-orchestrator*'`): no earlier generation of this
   handler was removed and rebuilt. */

/* The five request-body builders are retired (R1 S13, 2026-11-09, founder-approved).
   ────────────────────────────────────────────────────────────────────────────
   POST /m2/nonclinical, /m2/clinical, /m2/clinical-overview, /csr/tabulate and
   /validate/hardened built Module 2 summaries, CSR tables or a go/no-go
   validation from whatever the request body carried: the /m2/qos defect above.
   No screen called any of them in the repository's history, and production
   refused them. The replacements, by path:
     • a run built from the program's records — POST /runs/for-program, sent by
       eCTD Compile's run controls (client/src/concept2cure/v2/surfaces/
       OrchestratorRunControls.tsx). Its m2.4, m2.5, m2.7, CSR and gateway
       steps (services/submission-package-orchestrator.ts) call the same
       builders over stored inputs;
     • AnA's Module 2 tools, over the project's records;
     • the hardened validator at sign and release (routes/submission-sign-release.ts).
   Pinned by routes/__tests__/orchestrator-request-body-builders-retired.test.ts. */

export default router;
