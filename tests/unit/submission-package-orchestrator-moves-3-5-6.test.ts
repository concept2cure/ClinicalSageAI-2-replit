/**
 * Submission-Package Orchestrator — coverage for Moves 3 + 5 + 6.
 *
 *   Move 3: package.validate now calls validateEctdPackageHardened. The step
 *           fails (and the run rolls up to `partial`) when the validator
 *           reports gatewayReady=false.
 *   Move 5: m3.refine wraps buildModule3WithNarrative. Skipped when
 *           inputs.useAI=false; called with the orchestrator's
 *           organizationId / projectId / userId when useAI=true.
 *   Move 6: csr.draft-narrative enqueues async jobs via launchCSRBuildAsync,
 *           transitions to `awaiting-async`, and is driven forward by a
 *           subsequent runOrchestrator(_, { resumeRunId }) call once the
 *           jobs complete. getRunResumeReadiness probes readiness without
 *           advancing the pipeline and refuses cross-tenant probes.
 *
 * Mocking strategy:
 *   - db pool: in-memory vi.fn — captures persistRun/persistStepEvent/getRun
 *     SQL so we can drive the resume path's `getRun` load.
 *   - validateEctdPackageHardened: vi.fn returning a stable
 *     HardenedValidationResult; flipped per-test to gatewayReady=false to
 *     pin the Move 3 failure path.
 *   - buildModule3WithNarrative: vi.fn capturing arguments — the
 *     organizationId / projectId / userId / sources / options threading.
 *   - launchCSRBuildAsync: vi.fn returning a jobId.
 *   - getCSRBuildJobStatus: vi.fn returning queued/complete/failed states
 *     so the resume path can be exercised across all three branches.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks (must be declared before the vi.mock factories run) ───────

const hoisted = vi.hoisted(() => ({
  poolQuery: vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>>(),
  validateEctdPackageHardened: vi.fn(),
  buildModule3WithNarrative: vi.fn(),
  launchCSRBuildAsync: vi.fn(),
  getCSRBuildJobStatus: vi.fn(),
}));

// ── DB pool mock ────────────────────────────────────────────────────────────

vi.mock('../../server/db.js', () => {
  const pool = {
    query: (...args: unknown[]) =>
      hoisted.poolQuery(...(args as [string, unknown[]?])),
  };
  return { pool, getPool: () => pool, getDb: () => null, db: null };
});
vi.mock('../../server/db', () => {
  const pool = {
    query: (...args: unknown[]) =>
      hoisted.poolQuery(...(args as [string, unknown[]?])),
  };
  return { pool, getPool: () => pool, getDb: () => null, db: null };
});

// ── validateEctdPackageHardened mock (Move 3) ───────────────────────────────

vi.mock('../../server/services/ectd/ectd-validator-hardening.js', () => ({
  validateEctdPackageHardened: (...args: unknown[]) =>
    hoisted.validateEctdPackageHardened(...args),
}));
vi.mock('../../server/services/ectd/ectd-validator-hardening', () => ({
  validateEctdPackageHardened: (...args: unknown[]) =>
    hoisted.validateEctdPackageHardened(...args),
}));

// ── buildModule3WithNarrative mock (Move 5) ─────────────────────────────────

vi.mock('../../server/services/cmc/module3-narrative-builder.js', () => ({
  buildModule3WithNarrative: (...args: unknown[]) =>
    hoisted.buildModule3WithNarrative(...args),
}));
vi.mock('../../server/services/cmc/module3-narrative-builder', () => ({
  buildModule3WithNarrative: (...args: unknown[]) =>
    hoisted.buildModule3WithNarrative(...args),
}));

// ── csr-builder.launchCSRBuildAsync mock (Move 6) ───────────────────────────

vi.mock('../../server/services/csr-builder.js', () => ({
  launchCSRBuildAsync: (...args: unknown[]) =>
    hoisted.launchCSRBuildAsync(...args),
}));
vi.mock('../../server/services/csr-builder', () => ({
  launchCSRBuildAsync: (...args: unknown[]) =>
    hoisted.launchCSRBuildAsync(...args),
}));

// ── csr-job-runner.getCSRBuildJobStatus mock (Move 6 resume) ────────────────

vi.mock('../../server/services/csr/csr-job-runner.js', () => ({
  getCSRBuildJobStatus: (...args: unknown[]) =>
    hoisted.getCSRBuildJobStatus(...args),
}));
vi.mock('../../server/services/csr/csr-job-runner', () => ({
  getCSRBuildJobStatus: (...args: unknown[]) =>
    hoisted.getCSRBuildJobStatus(...args),
}));

// ── Imports (after mocks) ───────────────────────────────────────────────────

import {
  runOrchestrator,
  getRunResumeReadiness,
  type OrchestratorInputs,
  type OrchestratorRun,
} from '../../server/services/submission-package-orchestrator';
import type { HardenedValidationResult } from '../../server/services/ectd/ectd-validator-hardening';

// ── Fixtures ────────────────────────────────────────────────────────────────

function validStudyData() {
  return {
    studyId: 'CL-1',
    protocolNumber: 'PROTO-1',
    treatmentArms: [
      { armName: 'Active', randomized: 50, populations: { safety: 50, itt: 50 } },
      { armName: 'Placebo', randomized: 50, populations: { safety: 50, itt: 50 } },
    ],
    disposition: [] as unknown[],
    demographics: [] as unknown[],
    efficacy: [] as unknown[],
    adverseEvents: [] as unknown[],
  };
}

function baseInputs(over: Partial<OrchestratorInputs> = {}): OrchestratorInputs {
  return {
    organizationId: 1,
    submissionId: 'sub-1',
    applicationNumber: 'IND123456',
    region: 'US',
    submissionType: 'IND',
    cmcSources: [
      {
        id: 'src-1',
        sourceType: 'manufacturing',
        sourcePayload: { drugSubstance: 'X', api: 'Y', spec: 'Z' },
        organizationId: 1,
        projectId: 42,
      } as unknown as OrchestratorInputs['cmcSources'][number],
    ],
    nonclinicalStudies: [
      {
        studyId: 'NC-1',
        studyType: 'toxicology',
        species: 'rat',
        primaryFinding: 'no findings',
        reportSection: 'm4.2.3',
      },
    ],
    clinicalStudyData: [
      validStudyData() as unknown as OrchestratorInputs['clinicalStudyData'][number],
    ],
    csrInputs: [
      {
        studyId: 'CL-1',
        protocolNumber: 'PROTO-1',
        phase: 'Phase 2',
        studyDesign: 'RCT',
        primaryEndpoint: 'OS',
        primaryResult: 'Met',
        sampleSize: 100,
      },
    ],
    indication: 'oncology',
    drugProductName: 'Compound-X',
    drugSubstanceName: 'X-API',
    projectId: 42,
    userId: 7,
    ...over,
  };
}

function gatewayReadyResult(): HardenedValidationResult {
  return {
    valid: true,
    score: 100,
    findings: [],
    summary: {
      errors: 0,
      warnings: 0,
      infos: 0,
      sectionsPresent: 1,
      sectionsRequired: 1,
      sectionsMissing: [],
    },
    timestamp: new Date().toISOString(),
    regional: [],
    sequence: [],
    dtd: [],
    hardenedScore: 100,
    gatewayReady: true,
  };
}

function notGatewayReadyResult(): HardenedValidationResult {
  return {
    valid: false,
    score: 50,
    findings: [
      {
        severity: 'error',
        code: 'STRUCT_BAD',
        message: 'structural error',
        fix: 'fix it',
      } as HardenedValidationResult['findings'][number],
    ],
    summary: {
      errors: 1,
      warnings: 0,
      infos: 0,
      sectionsPresent: 1,
      sectionsRequired: 2,
      sectionsMissing: ['m3.2.S.2'],
    },
    timestamp: new Date().toISOString(),
    regional: [
      {
        severity: 'error',
        code: 'REG_FDA_ESG_PATH',
        message: 'bad path',
        fix: 'rename',
      } as HardenedValidationResult['regional'][number],
    ],
    sequence: [],
    dtd: [],
    hardenedScore: 40,
    gatewayReady: false,
  };
}

beforeEach(() => {
  hoisted.poolQuery.mockReset();
  hoisted.validateEctdPackageHardened.mockReset();
  hoisted.buildModule3WithNarrative.mockReset();
  hoisted.launchCSRBuildAsync.mockReset();
  hoisted.getCSRBuildJobStatus.mockReset();

  // Default DB behavior: every query succeeds with an empty rowset.
  hoisted.poolQuery.mockResolvedValue({ rows: [], rowCount: 1 });
  // Default validator: gateway-ready (so non-Move-3 tests reach a clean
  // `complete` run).
  hoisted.validateEctdPackageHardened.mockResolvedValue(gatewayReadyResult());
});

// ═══════════════════════════════════════════════════════════════════════════
// Move 3 — package.validate calls validateEctdPackageHardened
// ═══════════════════════════════════════════════════════════════════════════

describe('Move 3 — package.validate wires validateEctdPackageHardened', () => {
  it('step is `failed` and the run rolls up to `failed` when gatewayReady=false', async () => {
    hoisted.validateEctdPackageHardened.mockResolvedValue(notGatewayReadyResult());

    const { run } = await runOrchestrator(baseInputs());

    expect(hoisted.validateEctdPackageHardened).toHaveBeenCalledTimes(1);
    const validateStep = run.steps.find(s => s.key === 'package.validate')!;
    expect(validateStep.status).toBe('failed');
    expect(validateStep.error).toMatch(/not gateway-ready/);
    // OBSERVED BEHAVIOR PIN: runStep re-throws on step failure; the outer
    // try/catch in runOrchestrator catches that and assigns
    // `run.status = 'failed'` directly (the per-step roll-up logic at the
    // bottom of the try-block — which would have produced `partial` —
    // never runs because the throw skipped past it). If the orchestrator
    // is later refactored so package.validate's failure produces `partial`
    // instead, update this assertion intentionally.
    expect(run.status).toBe('failed');
  });

  it('step is `complete` and run suspends at awaiting-signature when gatewayReady=true (happy path)', async () => {
    // Default beforeEach sets gatewayReady=true. This pins the symmetric
    // success contract so the failure assertion above can't be a false
    // positive against an always-failing wiring.
    //
    // Path-to-GA §C.11 update: the baseInputs submissionType is 'IND', which
    // is in the SIGNATURE_REQUIRED_SUBMISSION_TYPES allowlist. With
    // gatewayReady=true, the run advances through package.validate → complete
    // and then HALTS at package.sign in `awaiting-signature` (no signature
    // row exists in the mock DB). Run-level status mirrors the step.
    const { run } = await runOrchestrator(baseInputs());

    expect(hoisted.validateEctdPackageHardened).toHaveBeenCalledTimes(1);
    const validateStep = run.steps.find(s => s.key === 'package.validate')!;
    expect(validateStep.status).toBe('complete');
    // Validate completes; sign step suspends.
    const signStep = run.steps.find(s => s.key === 'package.sign')!;
    expect(signStep.status).toBe('awaiting-signature');
    expect(run.status).toBe('awaiting-signature');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Move 5 — m3.refine wraps buildModule3WithNarrative
// ═══════════════════════════════════════════════════════════════════════════

describe('Move 5 — m3.refine wires buildModule3WithNarrative', () => {
  it('skips m3.refine when inputs.useAI=false; m3.regional sees deterministic m3.compose output', async () => {
    const { run } = await runOrchestrator(baseInputs({ useAI: false }));

    // buildModule3WithNarrative is NOT called when useAI is false.
    expect(hoisted.buildModule3WithNarrative).not.toHaveBeenCalled();

    // m3.refine is `skipped` (the orchestrator returns null from the step
    // body when useAI=false; runStep marks that as skipped).
    const refineStep = run.steps.find(s => s.key === 'm3.refine')!;
    expect(refineStep.status).toBe('skipped');

    // m3.regional still proceeds — depends-on includes m3.refine but
    // `skipped` is dependency-equivalent to `complete`. The downstream
    // step's status is independent of m3.refine's status here; what we
    // pin is that the pipeline did NOT abort and the validator ran.
    expect(hoisted.validateEctdPackageHardened).toHaveBeenCalledTimes(1);
  });

  it('calls buildModule3WithNarrative with inputs.organizationId/projectId/userId when useAI=true', async () => {
    // Return a refined-narrative payload with one section so the step
    // resolves to `complete` (not the "no sections" → null → skipped path).
    hoisted.buildModule3WithNarrative.mockResolvedValue({
      sections: [
        {
          sectionKey: '3.2.S.1',
          sectionPath: 'm3/3-2-s-1',
          structuredPayload: {},
          narrativeDraft: 'refined narrative',
          tables: [],
          completeness: 1,
          missingInputs: [],
          lineage: [],
        },
      ],
      refinementMeta: [
        {
          sectionKey: '3.2.S.1',
          model: 'claude-test',
          tokenCost: 0.001,
          fallback: false,
          groundingTokenCount: 100,
        },
      ],
      totalTokenCost: 0.001,
      gatewayErrorFallbackCount: 0,
    });

    const inputs = baseInputs({
      useAI: true,
      organizationId: 42,
      projectId: 99,
      userId: 7,
    });

    const { run } = await runOrchestrator(inputs);

    expect(hoisted.buildModule3WithNarrative).toHaveBeenCalledTimes(1);
    const [orgArg, projectArg, userArg, sourcesArg, optionsArg] =
      hoisted.buildModule3WithNarrative.mock.calls[0];

    expect(orgArg).toBe(42);
    expect(projectArg).toBe(99);
    expect(userArg).toBe(7);
    expect(Array.isArray(sourcesArg)).toBe(true);
    // Sources are threaded through unchanged — the orchestrator does NOT
    // re-tag them.
    expect((sourcesArg as Array<{ id: string }>)[0].id).toBe('src-1');
    expect(optionsArg).toEqual({ useAI: true });

    const refineStep = run.steps.find(s => s.key === 'm3.refine')!;
    expect(refineStep.status).toBe('complete');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Move 6 — csr.draft-narrative async enqueue + resume path
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Helper to intercept persistRun calls and grab the most recent run snapshot
 * the orchestrator wrote. This is how the resume tests reconstruct the
 * "what would getRun(runId, orgId) return?" payload — the orchestrator
 * persists every state transition through the mocked pool.query, so we
 * harvest the latest INSERT...ON CONFLICT to drive resume.
 */
function setupGetRunMock(persistedRunRowProvider: () => Record<string, unknown> | null): void {
  hoisted.poolQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    // getRun's SELECT query — return the persisted row.
    if (typeof sql === 'string' && sql.includes('FROM submission_orchestrator_runs')) {
      const row = persistedRunRowProvider();
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    // Everything else (INSERTs) — succeed with empty rowset.
    return { rows: [], rowCount: 1 };
  });
}

describe('Move 6 — csr.draft-narrative async enqueue + resume', () => {
  it('enqueues via launchCSRBuildAsync, transitions to awaiting-async, returns run.status=awaiting-async', async () => {
    hoisted.launchCSRBuildAsync.mockResolvedValue({ jobId: 555, status: 'queued' });

    const inputs = baseInputs({ enableCSRNarrative: true });
    const { run, outputs } = await runOrchestrator(inputs);

    // launchCSRBuildAsync was called once per csrInput study.
    expect(hoisted.launchCSRBuildAsync).toHaveBeenCalledTimes(1);

    const [requestArg, ctxArg] = hoisted.launchCSRBuildAsync.mock.calls[0];
    expect((requestArg as { organizationId: number }).organizationId).toBe(1);
    expect((requestArg as { userId: number }).userId).toBe(7);
    expect((ctxArg as { organizationId: number; requestedBy: number }).organizationId).toBe(1);
    expect((ctxArg as { requestedBy: number }).requestedBy).toBe(7);

    // Step transitioned to awaiting-async.
    const narrStep = run.steps.find(s => s.key === 'csr.draft-narrative')!;
    expect(narrStep.status).toBe('awaiting-async');
    // The persisted payload carries the jobId so the resume path can poll it.
    expect(narrStep.outputRef).toBeDefined();
    const payload = JSON.parse(narrStep.outputRef!) as { jobs: Array<{ jobId: number }> };
    expect(payload.jobs[0].jobId).toBe(555);

    // Run-level status mirrors the step.
    expect(run.status).toBe('awaiting-async');

    // Downstream steps are still pending — the run did NOT advance.
    const m27 = run.steps.find(s => s.key === 'm2.7.clinical')!;
    expect(m27.status).toBe('pending');
    const pkgAssemble = run.steps.find(s => s.key === 'package.assemble')!;
    expect(pkgAssemble.status).toBe('pending');

    // outputs.csrNarrativeJobs is populated so the route can surface jobIds.
    expect(outputs.csrNarrativeJobs).toBeDefined();
    expect(outputs.csrNarrativeJobs!.pendingJobIds).toEqual([555]);
  });

  it('runOrchestrator({resumeRunId}) returns the run unchanged when the job is still running', async () => {
    // First: do the enqueue so we have a real run.
    hoisted.launchCSRBuildAsync.mockResolvedValue({ jobId: 555, status: 'queued' });
    const inputs = baseInputs({ enableCSRNarrative: true });
    const initial = await runOrchestrator(inputs);
    expect(initial.run.status).toBe('awaiting-async');

    // Now wire getRun to return the persisted row and the job-status
    // probe to report still drafting.
    const runRow = {
      run_id: initial.run.runId,
      organization_id: 1,
      submission_id: 'sub-1',
      application_number: 'IND123456',
      region: 'US',
      submission_type: 'IND',
      started_at: initial.run.startedAt,
      completed_at: null,
      status: 'awaiting-async',
      steps: JSON.stringify(initial.run.steps),
    };
    setupGetRunMock(() => runRow);
    hoisted.getCSRBuildJobStatus.mockResolvedValue({
      status: 'drafting',
      progress: 50,
      sectionsComplete: 5,
      error: null,
    });

    const resumed = await runOrchestrator(inputs, { resumeRunId: initial.run.runId });

    // Step + run status are still awaiting-async (unchanged).
    expect(resumed.run.status).toBe('awaiting-async');
    const narrStep = resumed.run.steps.find(s => s.key === 'csr.draft-narrative')!;
    expect(narrStep.status).toBe('awaiting-async');

    // Downstream did NOT advance.
    const m27 = resumed.run.steps.find(s => s.key === 'm2.7.clinical')!;
    expect(m27.status).toBe('pending');

    // validate was NOT re-called on this poll.
    expect(hoisted.validateEctdPackageHardened).not.toHaveBeenCalled();
  });

  it('runOrchestrator({resumeRunId}) drives the step to complete and runs downstream when the job is complete', async () => {
    // Enqueue first to get a real run.
    hoisted.launchCSRBuildAsync.mockResolvedValue({ jobId: 555, status: 'queued' });
    const inputs = baseInputs({ enableCSRNarrative: true });
    const initial = await runOrchestrator(inputs);
    expect(initial.run.status).toBe('awaiting-async');

    const runRow = {
      run_id: initial.run.runId,
      organization_id: 1,
      submission_id: 'sub-1',
      application_number: 'IND123456',
      region: 'US',
      submission_type: 'IND',
      started_at: initial.run.startedAt,
      completed_at: null,
      status: 'awaiting-async',
      steps: JSON.stringify(initial.run.steps),
    };
    setupGetRunMock(() => runRow);
    hoisted.getCSRBuildJobStatus.mockResolvedValue({
      status: 'complete',
      progress: 100,
      sectionsComplete: 13,
      error: null,
    });

    const resumed = await runOrchestrator(inputs, { resumeRunId: initial.run.runId });

    // csr.draft-narrative transitioned to complete.
    const narrStep = resumed.run.steps.find(s => s.key === 'csr.draft-narrative')!;
    expect(narrStep.status).toBe('complete');

    // Downstream pipeline ran: m2.7.clinical, m1.admin, package.assemble,
    // package.validate are now complete (the validator is gatewayReady=true
    // per the default mock).
    const m27 = resumed.run.steps.find(s => s.key === 'm2.7.clinical')!;
    expect(m27.status).toBe('complete');
    const pkgAssemble = resumed.run.steps.find(s => s.key === 'package.assemble')!;
    expect(pkgAssemble.status).toBe('complete');
    const pkgValidate = resumed.run.steps.find(s => s.key === 'package.validate')!;
    expect(pkgValidate.status).toBe('complete');

    expect(resumed.run.status).toBe('complete');
    // validateEctdPackageHardened ran once during resume (not during the
    // original enqueue, which short-circuited at awaiting-async).
    expect(hoisted.validateEctdPackageHardened).toHaveBeenCalledTimes(1);
  });

  it('runOrchestrator({resumeRunId}) throws on tenant mismatch (previousRun.organizationId !== inputs.organizationId)', async () => {
    // Build a persisted run for org=1, then attempt to resume as org=999.
    // getRun's WHERE clause does the actual org-scope filter, so we model
    // that here: when inputs.organizationId=999, the SELECT returns no
    // rows. The thrown error message therefore includes "not found or org
    // mismatch" (the collapsed semantics) rather than the explicit-mismatch
    // path — both are the same defense, just at different layers.
    setupGetRunMock(() => null);

    const inputs = baseInputs({ organizationId: 999 });
    await expect(
      runOrchestrator(inputs, { resumeRunId: 'some-run-id' }),
    ).rejects.toThrow(/not found or org mismatch/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Move 6 — getRunResumeReadiness org-scoped probe
// ═══════════════════════════════════════════════════════════════════════════

describe('Move 6 — getRunResumeReadiness', () => {
  it('returns ready:false on org mismatch (the SELECT filters by organization_id)', async () => {
    // getRun returns null when (run_id, organization_id) doesn't match.
    // getRunResumeReadiness should collapse that to {ready: false}.
    setupGetRunMock(() => null);

    const result = await getRunResumeReadiness('some-run-id', 999);
    expect(result).toEqual({ ready: false });
    // Crucially: the job-status probe should NOT have been called — the
    // tenant filter shorts the function before any per-job query.
    expect(hoisted.getCSRBuildJobStatus).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Path-to-GA §C.4 — submissionFk threads through persistRun / persistStepEvent
// ═══════════════════════════════════════════════════════════════════════════
//
// These cases overlap the Move 3/5/6 surface to prove the new column
// behaves correctly across (a) the fresh-run synchronous pipeline (Move 3),
// (b) the m3.refine AI step (Move 5), and (c) the awaiting-async enqueue
// path (Move 6). They harvest the persistRun INSERT params straight from
// the mocked pool.query — the FK column position is what we're locking in.
//
// Param order (per persistRun in submission-package-orchestrator.ts):
//   $1 run_id, $2 organization_id, $3 submission_id, $4 submission_id_fk,
//   $5 application_number, $6 region, $7 submission_type, $8 started_at,
//   $9 completed_at, $10 status, $11 steps
const RUN_INSERT_FK_PARAM_INDEX = 3;

// Param order for persistStepEvent INSERT:
//   $1 run_id, $2 organization_id, $3 submission_id_fk, $4 step_key,
//   $5 event_type, $6 status, $7 input_hash, $8 output_hash, $9 output_ref,
//   $10 error
const STEP_INSERT_FK_PARAM_INDEX = 2;

function isRunInsertCall(call: [string, unknown[]?]): boolean {
  return typeof call[0] === 'string' && /INSERT\s+INTO\s+submission_orchestrator_runs/i.test(call[0]);
}

function isStepInsertCall(call: [string, unknown[]?]): boolean {
  return typeof call[0] === 'string' && /INSERT\s+INTO\s+submission_orchestrator_steps/i.test(call[0]);
}

describe('Path-to-GA §C.4 — submissionFk dual-write across Moves 3/5/6', () => {
  it('threads submissionFk into every persistRun + persistStepEvent INSERT when supplied (Move 3 happy path)', async () => {
    // gatewayReady=true by default; this is the all-sync, single-pass case.
    const { run } = await runOrchestrator(baseInputs({ submissionFk: 42 }));
    expect(run.submissionFk).toBe(42);

    // Every captured persistRun INSERT carries fk=42 at the expected position.
    const runInserts = hoisted.poolQuery.mock.calls.filter(c =>
      isRunInsertCall(c as [string, unknown[]?]),
    );
    expect(runInserts.length).toBeGreaterThan(0);
    for (const call of runInserts) {
      const params = call[1] as unknown[];
      expect(params[RUN_INSERT_FK_PARAM_INDEX]).toBe(42);
    }

    // Every captured persistStepEvent INSERT carries fk=42 at the expected position.
    const stepInserts = hoisted.poolQuery.mock.calls.filter(c =>
      isStepInsertCall(c as [string, unknown[]?]),
    );
    expect(stepInserts.length).toBeGreaterThan(0);
    for (const call of stepInserts) {
      const params = call[1] as unknown[];
      expect(params[STEP_INSERT_FK_PARAM_INDEX]).toBe(42);
    }
  });

  it('leaves submissionFk NULL on every INSERT when caller omits it (back-compat)', async () => {
    const inputs = baseInputs();
    // Defensive: baseInputs does not set submissionFk, but make it explicit.
    delete (inputs as { submissionFk?: number }).submissionFk;

    const { run } = await runOrchestrator(inputs);
    expect(run.submissionFk).toBeUndefined();

    const runInserts = hoisted.poolQuery.mock.calls.filter(c =>
      isRunInsertCall(c as [string, unknown[]?]),
    );
    for (const call of runInserts) {
      const params = call[1] as unknown[];
      expect(params[RUN_INSERT_FK_PARAM_INDEX]).toBeNull();
    }
    const stepInserts = hoisted.poolQuery.mock.calls.filter(c =>
      isStepInsertCall(c as [string, unknown[]?]),
    );
    for (const call of stepInserts) {
      const params = call[1] as unknown[];
      expect(params[STEP_INSERT_FK_PARAM_INDEX]).toBeNull();
    }
  });

  it('refuses to persist a non-positive submissionFk — coerces to NULL rather than corrupting the column', async () => {
    // The interface types submissionFk as `number`, but a buggy caller
    // could pass 0 / negative / NaN. The service-layer guard coerces
    // those to NULL on the wire so the FK column never carries a value
    // that could never resolve to a real submissions.id.
    const inputs = baseInputs() as OrchestratorInputs & { submissionFk?: number };
    inputs.submissionFk = 0;
    await runOrchestrator(inputs);

    const runInserts = hoisted.poolQuery.mock.calls.filter(c =>
      isRunInsertCall(c as [string, unknown[]?]),
    );
    expect(runInserts.length).toBeGreaterThan(0);
    for (const call of runInserts) {
      const params = call[1] as unknown[];
      expect(params[RUN_INSERT_FK_PARAM_INDEX]).toBeNull();
    }
  });

  it('Move 6: awaiting-async enqueue carries submissionFk on the suspended-run persistRun INSERT', async () => {
    hoisted.launchCSRBuildAsync.mockResolvedValue({ jobId: 555, status: 'queued' });
    const { run } = await runOrchestrator(baseInputs({ enableCSRNarrative: true, submissionFk: 99 }));
    expect(run.status).toBe('awaiting-async');
    expect(run.submissionFk).toBe(99);

    // The final persistRun INSERT before the awaiting-async return must
    // still carry the FK (we don't lose it on the suspend boundary).
    const runInserts = hoisted.poolQuery.mock.calls.filter(c =>
      isRunInsertCall(c as [string, unknown[]?]),
    );
    expect(runInserts.length).toBeGreaterThan(0);
    const lastRunInsert = runInserts[runInserts.length - 1];
    const params = lastRunInsert[1] as unknown[];
    expect(params[RUN_INSERT_FK_PARAM_INDEX]).toBe(99);

    // And every step audit row written while building the suspend point
    // mirrors it too — the csr.draft-narrative `start` / `complete` rows
    // both carry the FK.
    const stepInserts = hoisted.poolQuery.mock.calls.filter(c =>
      isStepInsertCall(c as [string, unknown[]?]),
    );
    expect(stepInserts.length).toBeGreaterThan(0);
    for (const call of stepInserts) {
      const params = call[1] as unknown[];
      expect(params[STEP_INSERT_FK_PARAM_INDEX]).toBe(99);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Path-to-GA §C.11 — package.sign e-sig gate
// ═══════════════════════════════════════════════════════════════════════════
//
// These cases pin the orchestrator side of the gate:
//   - skipped on non-REQUIRED submission types (OQ-1 allowlist)
//   - awaiting-signature when no signature row exists for the bound digest
//   - complete-on-resume when a signature row exists for the bound digest
//
// The findActiveReleaseSignature lookup hits pool.query directly (raw SQL,
// not Drizzle), so we drive it through the same hoisted mock that captures
// every other pool.query invocation.

describe('Path-to-GA §C.11 — package.sign e-sig gate', () => {
  it('a 510(k) never reaches package.sign — it cannot be filed on the eCTD backbone at all', async () => {
    /* This case used to assert that a 510(k) run completes with package.sign
       `skipped`, 510k being outside the REQUIRED allowlist (IND/NDA/BLA/MAA).
       It completed because the regional packager defaulted an unmappable
       application type to `fdaat1` — NDA. The run "succeeded" by producing a
       device dossier that declared itself a New Drug Application in the
       backbone field the ESG routes on.

       There is no eCTD Module 1 application-type code for 510(k), De Novo or
       PMA, because those pathways are filed via eSTAR/eCopy and not on this
       backbone. So the packager now refuses, and the run fails there rather
       than at the signature gate. Note what the two lists imply together: every
       submission type OUTSIDE the REQUIRED allowlist is exactly a pathway that
       cannot be packaged here, which is why this test can no longer reach
       package.sign at all. The allowlist's other half — that an IND DOES gate
       on a signature — is covered by the two cases below. */
    const { run } = await runOrchestrator(
      baseInputs({ submissionType: '510k' as OrchestratorInputs['submissionType'] }),
    );

    expect(run.status).not.toBe('complete');
    const signStep = run.steps.find(s => s.key === 'package.sign')!;
    expect(signStep.status).not.toBe('complete');
  });

  it('package.sign transitions to `awaiting-signature` when no matching signature exists (IND submission, no sig in DB)', async () => {
    // Default pool.query mock returns empty rowset → findActiveReleaseSignature
    // returns null → step transitions to awaiting-signature.
    const { run } = await runOrchestrator(baseInputs({ submissionType: 'IND' }));

    const signStep = run.steps.find(s => s.key === 'package.sign')!;
    expect(signStep.status).toBe('awaiting-signature');
    // Run-level status mirrors the step.
    expect(run.status).toBe('awaiting-signature');
    // outputRef carries the persisted payload digest.
    expect(signStep.outputRef).toBeDefined();
    const payload = JSON.parse(signStep.outputRef!) as { payloadDigest: string };
    expect(payload.payloadDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('resume path drives package.sign to `complete` when a matching signature row exists', async () => {
    // First: run to awaiting-signature.
    const inputs = baseInputs({ submissionType: 'IND' });
    const initial = await runOrchestrator(inputs);
    expect(initial.run.status).toBe('awaiting-signature');
    const signStep = initial.run.steps.find(s => s.key === 'package.sign')!;
    const persistedPayload = JSON.parse(signStep.outputRef!) as { payloadDigest: string };

    // Build the persisted-run row that getRun will return on resume.
    const runRow = {
      run_id: initial.run.runId,
      organization_id: 1,
      submission_id: 'sub-1',
      application_number: 'IND123456',
      region: 'US',
      submission_type: 'IND',
      started_at: initial.run.startedAt,
      completed_at: null,
      status: 'awaiting-signature',
      steps: JSON.stringify(initial.run.steps),
    };

    // Drive pool.query: getRun returns the row; the signature lookup returns
    // a hit for the exact digest the orchestrator computed.
    hoisted.poolQuery.mockImplementation(async (sql: string, _params?: unknown[]) => {
      if (typeof sql === 'string' && sql.includes('FROM submission_orchestrator_runs')) {
        return { rows: [runRow], rowCount: 1 };
      }
      if (typeof sql === 'string' && sql.includes('FROM electronic_signatures')) {
        // Match the persisted digest — caller's tenant + digest filter hits.
        return { rows: [{ id: 7777 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });

    const resumed = await runOrchestrator(inputs, { resumeRunId: initial.run.runId });

    const resumedSignStep = resumed.run.steps.find(s => s.key === 'package.sign')!;
    expect(resumedSignStep.status).toBe('complete');
    expect(resumed.run.status).toBe('complete');
    const completePayload = JSON.parse(resumedSignStep.outputRef!) as {
      signatureId: number;
      payloadDigest: string;
    };
    expect(completePayload.signatureId).toBe(7777);
    expect(completePayload.payloadDigest).toBe(persistedPayload.payloadDigest);
  });

  it('resume path leaves the run in `awaiting-signature` when no signature row exists yet', async () => {
    // First: run to awaiting-signature.
    const inputs = baseInputs({ submissionType: 'IND' });
    const initial = await runOrchestrator(inputs);
    expect(initial.run.status).toBe('awaiting-signature');

    const runRow = {
      run_id: initial.run.runId,
      organization_id: 1,
      submission_id: 'sub-1',
      application_number: 'IND123456',
      region: 'US',
      submission_type: 'IND',
      started_at: initial.run.startedAt,
      completed_at: null,
      status: 'awaiting-signature',
      steps: JSON.stringify(initial.run.steps),
    };

    // Drive pool.query: getRun returns the row; signature lookup still misses.
    hoisted.poolQuery.mockImplementation(async (sql: string) => {
      if (typeof sql === 'string' && sql.includes('FROM submission_orchestrator_runs')) {
        return { rows: [runRow], rowCount: 1 };
      }
      // electronic_signatures lookup — empty (no signature yet).
      return { rows: [], rowCount: 0 };
    });

    const resumed = await runOrchestrator(inputs, { resumeRunId: initial.run.runId });

    const resumedSignStep = resumed.run.steps.find(s => s.key === 'package.sign')!;
    expect(resumedSignStep.status).toBe('awaiting-signature');
    // Run unchanged — caller polls again.
    expect(resumed.run.status).toBe('awaiting-signature');
  });
});
