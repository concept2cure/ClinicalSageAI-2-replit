/**
 * Submission-Package Orchestrator — coverage for the critical paths the
 * 2026-06-29 reconciliation audit flagged as untested.
 *
 *  Covers:
 *   - regenerateAffected: the per-step staleness propagation + re-run accounting.
 *   - Region-CHECK violation: orchestrator behavior when persistence rejects
 *     a region that the route Zod accepts but the migration 0018 CHECK
 *     constraint rejects (P0 silent-data-loss path identified in Move 7).
 *
 * Mocking strategy: replace `server/db.js` with a tiny in-memory pool whose
 * `query()` is a vi.fn. We then drive the constraint-failure scenario by
 * having the query mock reject with a Postgres-shaped error.
 *
 * Audit traceability:
 *   docs/reports/RECONCILIATION_AUDIT_2026-06-29.md §A.2
 *     "Tests: end-to-end with DB mocked. regenerateAffected is NOT tested."
 *   §D.6 "Region schema drift. Route Zod accepts 13; migration 0018 CHECK
 *         accepts 4. KR/CN/UK/etc. silently fail at persist time."
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted DB mock ─────────────────────────────────────────────────────────

const hoisted = vi.hoisted(() => ({
  poolQuery: vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>>(),
  // Captured warnings so we can assert that the swallow path actually
  // surfaced an operator-visible signal (per audit recommendation #6).
  warnings: [] as Array<{ args: unknown[] }>,
}));

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

// ── Imports (after mocks) ───────────────────────────────────────────────────

import {
  runOrchestrator,
  regenerateAffected,
  markDownstreamStale,
  getRun,
  getRunAudit,
  type OrchestratorInputs,
  type OrchestratorRun,
  type StepKey,
  type StepRecord,
} from '../../server/services/submission-package-orchestrator';

// ── Fixtures ────────────────────────────────────────────────────────────────

function emptyInputs(over: Partial<OrchestratorInputs> = {}): OrchestratorInputs {
  return {
    // organizationId is required by the Move 1 tenant-scope gate
    // (runOrchestrator throws on missing/non-positive). Fixture orgId 1 is
    // a placeholder — DB mock swallows persistence so the value is never
    // round-tripped to a real organizations row.
    organizationId: 1,
    submissionId: 'sub-1',
    applicationNumber: 'IND123456',
    region: 'US',
    submissionType: 'IND',
    cmcSources: [],
    nonclinicalStudies: [],
    clinicalStudyData: [],
    csrInputs: [],
    ...over,
  };
}

/**
 * Build a minimal but TYPE-CORRECT studyData shape for csr.tabulate so the
 * orchestrator's csr step doesn't crash on Hash.update / treatmentArms walks.
 * The values are placeholders — we only need the shape to satisfy the
 * sub-builders.
 */
function validStudyData() {
  return {
    studyId: 'CL-1',
    protocolNumber: 'PROTO-1',
    treatmentArms: [
      {
        armName: 'Active',
        randomized: 50,
        populations: { safety: 50, itt: 50 },
      },
      {
        armName: 'Placebo',
        randomized: 50,
        populations: { safety: 50, itt: 50 },
      },
    ],
    disposition: [] as unknown[],
    demographics: [] as unknown[],
    efficacy: [] as unknown[],
    adverseEvents: [] as unknown[],
  };
}

function inputsWithSomeData(over: Partial<OrchestratorInputs> = {}): OrchestratorInputs {
  return emptyInputs({
    cmcSources: [
      {
        id: 'src-1',
        sourceType: 'manufacturing',
        sourcePayload: { drugSubstance: 'X', api: 'Y', spec: 'Z' },
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
    ...over,
  });
}

beforeEach(() => {
  hoisted.poolQuery.mockReset();
  hoisted.warnings = [];
  // Default: every persist call succeeds with an empty rowset.
  hoisted.poolQuery.mockResolvedValue({ rows: [], rowCount: 1 });
});

// ═══════════════════════════════════════════════════════════════════════════
// markDownstreamStale — building block used by regenerateAffected
// ═══════════════════════════════════════════════════════════════════════════

describe('markDownstreamStale', () => {
  function freshSteps(): StepRecord[] {
    // Since the run-ledger hardening (auth/e-sig audit 2026-07-30),
    // markDownstreamStale traverses each step's OWN dependsOn snapshot — the
    // edges the run was created with — not the live STEP_DEPENDENCIES
    // constant. So the fixture must carry real edges, exactly as
    // runOrchestrator snapshots them at run creation ([] is a real snapshot
    // meaning "root step", not a shortcut).
    const graph: Record<string, StepKey[]> = {
      'm3.compose': [],
      'm3.appendices': ['m3.compose'],
      'm3.regional': ['m3.compose', 'm3.refine'],
      'csr.tabulate': [],
      'm2.3.qos': ['m3.compose', 'm3.refine', 'm3.appendices', 'm3.regional'],
      'm2.4.nonclinical': [],
      'm2.5.clinical': ['csr.tabulate'],
      'm2.7.clinical': ['csr.tabulate', 'csr.draft-narrative'],
      'm1.admin': [],
      'package.assemble': ['m2.3.qos', 'm2.4.nonclinical', 'm2.5.clinical', 'm2.7.clinical', 'm1.admin'],
      'package.validate': ['package.assemble'],
    };
    return (Object.keys(graph) as StepKey[]).map(key => ({
      key,
      status: 'complete' as const,
      inputHash: 'h',
      dependsOn: graph[key],
    }));
  }

  it('returns the keys of every step transitively downstream of the changed step', () => {
    const steps = freshSteps();
    const stale = markDownstreamStale(steps, 'm3.compose');
    // Direct + transitive: m3.appendices, m3.regional, m2.3.qos, package.assemble, package.validate
    expect(stale).toEqual(
      expect.arrayContaining([
        'm3.appendices',
        'm3.regional',
        'm2.3.qos',
        'package.assemble',
        'package.validate',
      ])
    );
    // Sibling pipelines (csr.tabulate, m2.4.nonclinical, m1.admin) are NOT
    // descendants of m3.compose and must remain off the stale list.
    expect(stale).not.toContain('csr.tabulate');
    expect(stale).not.toContain('m2.4.nonclinical');
    expect(stale).not.toContain('m1.admin');
    expect(stale).not.toContain('m3.compose'); // the trigger itself is not "downstream of itself"
  });

  it('transitions only `complete` downstream steps to `stale` — leaves the changed step alone', () => {
    const steps = freshSteps();
    markDownstreamStale(steps, 'csr.tabulate');

    const byKey = Object.fromEntries(steps.map(s => [s.key, s.status])) as Record<StepKey, string>;
    // Downstream of csr.tabulate: m2.5.clinical, m2.7.clinical, package.assemble, package.validate
    expect(byKey['m2.5.clinical']).toBe('stale');
    expect(byKey['m2.7.clinical']).toBe('stale');
    expect(byKey['package.assemble']).toBe('stale');
    expect(byKey['package.validate']).toBe('stale');
    // The changed step itself is untouched.
    expect(byKey['csr.tabulate']).toBe('complete');
    // Unrelated upstream sibling pipelines also untouched.
    expect(byKey['m3.compose']).toBe('complete');
    expect(byKey['m2.4.nonclinical']).toBe('complete');
    expect(byKey['m1.admin']).toBe('complete');
  });

  it('does NOT transition steps whose current status is not `complete`', () => {
    const steps = freshSteps();
    const target = steps.find(s => s.key === 'm2.7.clinical')!;
    target.status = 'failed';

    markDownstreamStale(steps, 'csr.tabulate');

    // Failed steps stay failed — only completed work is invalidated.
    expect(target.status).toBe('failed');
  });

  it('honors the run\'s OWN dependsOn snapshot over the live definition', () => {
    // Workflow-definition versioning (auth/e-sig audit): a run created under
    // an older graph must be interpreted by ITS edges, not today's constant.
    // Fabricate a snapshot where m1.admin depended on m3.compose (contrary to
    // the live graph, where m1.admin is a root step): the traversal must
    // follow the snapshot and mark m1.admin stale.
    const steps = freshSteps();
    steps.find(s => s.key === 'm1.admin')!.dependsOn = ['m3.compose'];

    const stale = markDownstreamStale(steps, 'm3.compose');

    expect(stale).toContain('m1.admin');
    expect(steps.find(s => s.key === 'm1.admin')!.status).toBe('stale');
    // And a snapshot that REMOVED an edge is honored too: csr pipeline is
    // untouched by an m3 change in both graphs.
    expect(stale).not.toContain('csr.tabulate');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// regenerateAffected — staleness propagation + re-run behavior
// ═══════════════════════════════════════════════════════════════════════════

describe('regenerateAffected', () => {
  it('returns the list of stale step keys triggered by the changedStep parameter', async () => {
    // Build a previous run whose steps are all "complete" so the changedStep
    // path actually marks descendants stale (markDownstreamStale only
    // transitions complete → stale).
    const previousRun: OrchestratorRun = {
      runId: 'prev-run-1',
      // Must match inputs.organizationId (default 1 from inputsWithSomeData)
      // or regenerateAffected's tenant-mismatch guard throws.
      organizationId: 1,
      submissionId: 'sub-1',
      applicationNumber: 'IND123456',
      region: 'US',
      submissionType: 'IND',
      startedAt: new Date(Date.now() - 60_000).toISOString(),
      status: 'complete',
      steps: [
        { key: 'm3.compose', status: 'complete', inputHash: 'A', dependsOn: [] },
        { key: 'm3.appendices', status: 'complete', inputHash: 'A', dependsOn: ['m3.compose'] },
        { key: 'm3.regional', status: 'complete', inputHash: 'A', dependsOn: ['m3.compose'] },
        { key: 'csr.tabulate', status: 'complete', inputHash: 'B', dependsOn: [] },
        { key: 'm2.3.qos', status: 'complete', inputHash: 'A', dependsOn: ['m3.compose', 'm3.appendices', 'm3.regional'] },
        { key: 'm2.4.nonclinical', status: 'complete', inputHash: 'C', dependsOn: [] },
        { key: 'm2.5.clinical', status: 'complete', inputHash: 'B', dependsOn: ['csr.tabulate'] },
        { key: 'm2.7.clinical', status: 'complete', inputHash: 'B', dependsOn: ['csr.tabulate'] },
        { key: 'm1.admin', status: 'complete', inputHash: 'D', dependsOn: [] },
        { key: 'package.assemble', status: 'complete', inputHash: 'E', dependsOn: ['m2.3.qos', 'm2.4.nonclinical', 'm2.5.clinical', 'm2.7.clinical', 'm1.admin'] },
        { key: 'package.validate', status: 'complete', inputHash: 'F', dependsOn: ['package.assemble'] },
      ],
    };

    const inputs = inputsWithSomeData();
    const result = await regenerateAffected(previousRun, inputs, 'csr.tabulate');

    // The returned `regenerated` array reflects which steps were marked
    // stale by the changedStep + input-hash diff against previousRun.
    // csr.tabulate's downstream is: m2.5.clinical, m2.7.clinical,
    // package.assemble, package.validate.
    expect(result.regenerated).toEqual(
      expect.arrayContaining([
        'm2.5.clinical',
        'm2.7.clinical',
        'package.assemble',
        'package.validate',
      ])
    );
    // csr.tabulate is the trigger and is NOT itself marked stale (the
    // markDownstreamStale contract only marks descendants).
    expect(result.regenerated).not.toContain('csr.tabulate');
    // Sibling pipelines untouched.
    expect(result.regenerated).not.toContain('m2.4.nonclinical');
    expect(result.regenerated).not.toContain('m1.admin');
  });

  it('persists the stale markers on the superseded run and names it, so its record stops claiming `complete`', async () => {
    const previousRun: OrchestratorRun = {
      runId: 'prev-run-stale',
      organizationId: 1,
      submissionId: 'sub-1',
      applicationNumber: 'IND123456',
      region: 'US',
      submissionType: 'IND',
      startedAt: new Date(Date.now() - 60_000).toISOString(),
      status: 'complete',
      steps: [
        { key: 'csr.tabulate', status: 'complete', inputHash: 'B', dependsOn: [] },
        { key: 'm2.5.clinical', status: 'complete', inputHash: 'B', dependsOn: ['csr.tabulate'] },
      ],
    };
    hoisted.poolQuery.mockClear();
    const result = await regenerateAffected(previousRun, inputsWithSomeData(), 'csr.tabulate');
    expect(result.supersededRunId).toBe('prev-run-stale');
    expect(result.run.runId).not.toBe('prev-run-stale');
    // The previous run's row was written with the stale marker before the
    // fresh pass started — the first write names prev-run-stale, not the new id.
    const writes = hoisted.poolQuery.mock.calls
      .map(c => ({ sql: String(c[0]), args: (c[1] ?? []) as unknown[] }))
      .filter(w => /submission_orchestrator_runs/i.test(w.sql) && w.args.includes('prev-run-stale'));
    expect(writes.length).toBeGreaterThan(0);
    const stepsArg = writes[0].args.find(a => typeof a === 'string' && a.includes('m2.5.clinical')) as string;
    expect(JSON.parse(stepsArg).find((s: { key: string }) => s.key === 'm2.5.clinical').status).toBe('stale');
  });

  it('PINS CURRENT BEHAVIOR: re-runs the entire pipeline regardless of stale marking', async () => {
    // ─────────────────────────────────────────────────────────────────────
    // CONTRADICTION WITH AUDIT: the Move 12 prompt asks us to assert that
    // "the changed step + downstream steps re-ran, unchanged upstream steps
    // did NOT re-run". The current implementation does NOT skip upstream
    // work — it just calls runOrchestrator(inputs) fresh (line 508). The
    // `regenerated` field is the audit-trail of which steps were stale,
    // not which steps were actually skipped. This test PINS that.
    // ─────────────────────────────────────────────────────────────────────
    const previousRun: OrchestratorRun = {
      runId: 'prev-run-2',
      // Must match inputs.organizationId (default 1 from inputsWithSomeData).
      organizationId: 1,
      submissionId: 'sub-1',
      applicationNumber: 'IND123456',
      region: 'US',
      submissionType: 'IND',
      startedAt: new Date(Date.now() - 60_000).toISOString(),
      status: 'complete',
      steps: [
        { key: 'm3.compose', status: 'complete', inputHash: 'A', dependsOn: [] },
        { key: 'csr.tabulate', status: 'complete', inputHash: 'B', dependsOn: [] },
        { key: 'm2.4.nonclinical', status: 'complete', inputHash: 'C', dependsOn: [] },
      ],
    };

    const inputs = inputsWithSomeData();
    const result = await regenerateAffected(previousRun, inputs, 'csr.tabulate');

    // Fresh run produces a NEW runId — not a continuation of the previous one.
    expect(result.run.runId).not.toBe(previousRun.runId);
    // EVERY ordered step appears in the fresh run (not just the stale ones).
    // The contract we PIN here is: regenerateAffected delegates straight to
    // runOrchestrator, so the resulting run.steps array always contains all
    // 11 ordered keys. When the optimization lands (skip non-stale upstream
    // work), assert here that the upstream step records carry `skipped` /
    // `reused` and only the changed+downstream carry `complete`.
    const stepKeysReturned = result.run.steps.map(s => s.key);
    expect(stepKeysReturned).toEqual(
      expect.arrayContaining([
        'm3.compose',
        'm3.appendices',
        'm3.regional',
        'csr.tabulate',
        'm2.3.qos',
        'm2.4.nonclinical',
        'm2.5.clinical',
        'm2.7.clinical',
        'm1.admin',
        'package.assemble',
        'package.validate',
      ]),
    );
  });

  it('detects an input-hash change on csr.tabulate and adds its downstream to the regenerated list', async () => {
    // previousRun records inputHash 'OLD-HASH' for csr.tabulate. The fresh
    // inputs naturally produce a different hash, so the function should
    // mark csr.tabulate's downstream stale even without an explicit
    // changedStep argument.
    const previousRun: OrchestratorRun = {
      runId: 'prev-run-3',
      // Must match inputs.organizationId (default 1 from inputsWithSomeData).
      organizationId: 1,
      submissionId: 'sub-1',
      applicationNumber: 'IND123456',
      region: 'US',
      submissionType: 'IND',
      startedAt: new Date(Date.now() - 60_000).toISOString(),
      status: 'complete',
      steps: [
        { key: 'm3.compose', status: 'complete', inputHash: 'M3-OLD', dependsOn: [] },
        { key: 'csr.tabulate', status: 'complete', inputHash: 'CSR-OLD', dependsOn: [] },
        { key: 'm2.4.nonclinical', status: 'complete', inputHash: 'NC-OLD', dependsOn: [] },
        { key: 'm2.5.clinical', status: 'complete', inputHash: '', dependsOn: ['csr.tabulate'] },
        { key: 'm2.7.clinical', status: 'complete', inputHash: '', dependsOn: ['csr.tabulate'] },
        { key: 'package.assemble', status: 'complete', inputHash: '', dependsOn: ['m2.5.clinical', 'm2.7.clinical'] },
      ],
    };

    const inputs = inputsWithSomeData();
    // No changedStep argument — staleness is driven purely by input-hash diff.
    const result = await regenerateAffected(previousRun, inputs);

    // m3.compose and csr.tabulate and m2.4.nonclinical hashes all differ
    // (previousRun used placeholders), so each one's downstream lights up.
    expect(result.regenerated.length).toBeGreaterThan(0);
    // Sample: csr.tabulate's children should be in the stale set.
    expect(result.regenerated).toEqual(
      expect.arrayContaining(['m2.5.clinical', 'm2.7.clinical']),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Region-CHECK violation — Move 7 / §D.6 silent data loss
// ═══════════════════════════════════════════════════════════════════════════

describe('getRun / getRunAudit — a failed read is not a missing run', () => {
  it('getRun throws OrchestratorReadError on a database failure instead of returning null', async () => {
    hoisted.poolQuery.mockRejectedValueOnce(new Error('connection refused'));
    await expect(getRun('run-x', 1)).rejects.toMatchObject({ name: 'OrchestratorReadError', operation: 'getRun' });
  });

  it('getRunAudit throws OrchestratorReadError on a database failure instead of returning an empty history', async () => {
    hoisted.poolQuery.mockRejectedValueOnce(new Error('connection refused'));
    await expect(getRunAudit('run-x', 1)).rejects.toMatchObject({ name: 'OrchestratorReadError', operation: 'getRunAudit' });
  });

  it('a genuinely missing run is still null, and a run with no events is still []', async () => {
    hoisted.poolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    expect(await getRun('run-missing', 1)).toBeNull();
    hoisted.poolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    expect(await getRunAudit('run-missing', 1)).toEqual([]);
  });
});

describe('region-CHECK violation handling', () => {
  it('PINS POST-FIX BEHAVIOR: a CHECK violation (23514) is re-thrown — no silent dark-row creation', async () => {
    // Move 1 closes the silent-data-loss path documented in §D.6: Postgres
    // schema-shape errors (CHECK violations, undefined_column, undefined_table,
    // FK violations, NOT NULL violations) are now re-thrown from persistRun
    // so the route handler surfaces a 500. Previously the orchestrator
    // swallowed these and returned a runId pointing at nothing — the run
    // existed only in memory, then disappeared.
    //
    // The audit reconciliation Move 7 ALREADY shipped a follow-up migration
    // (20260629_orchestrator_region_check_alignment.sql) that widens the
    // CHECK to all 13 Zod regions, so in normal operation 23514 should no
    // longer fire from `region`. The re-throw is the defense-in-depth that
    // catches the failure mode if a future schema-drift recurs.
    const constraintErr: NodeJS.ErrnoException = new Error(
      'new row for relation "submission_orchestrator_runs" violates check constraint "submission_orchestrator_runs_region_check"'
    );
    (constraintErr as unknown as { code: string }).code = '23514';
    hoisted.poolQuery.mockRejectedValue(constraintErr);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const inputs = inputsWithSomeData({ region: 'KR' as unknown as OrchestratorInputs['region'] });
      // runOrchestrator must reject (not swallow + return a fake-success run).
      await expect(runOrchestrator(inputs)).rejects.toThrow(/violates check constraint/);
      // The schema-shape detection branch logs to console.error before throwing.
      expect(errorSpy).toHaveBeenCalled();
      const errCall = errorSpy.mock.calls.find(call =>
        call.some(a => typeof a === 'string' && a.includes('schema-shape error 23514'))
      );
      expect(errCall).toBeDefined();
    } finally {
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('transient persist failures (no Postgres code) are STILL swallowed — every step gets a fresh `runStep` cycle', async () => {
    // Connection-level / generic errors without a SCHEMA_SHAPE_ERROR_CODES
    // code stay on the swallow path: a transient blip should not abort the
    // in-memory pipeline; retrying or running ephemerally is the safe
    // default for those.
    const err = new Error('connection refused');
    hoisted.poolQuery.mockRejectedValue(err);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      // skipValidation keeps this test focused on its actual subject —
      // PERSISTENCE failures being swallowed without marking any step failed.
      // Since Move 3 wired package.validate to the real hardened validator, a
      // minimal fixture is (correctly) not gateway-ready, so the validate
      // step's own WORK fails independently of persistence. That work-failure
      // is out of scope here; skipping validation isolates the persistence
      // path the assertion below actually exercises.
      const inputs = inputsWithSomeData({ skipValidation: true });
      const result = await runOrchestrator(inputs);

      // All known step keys appear in the run record regardless of DB state.
      const stepKeys = result.run.steps.map(s => s.key);
      expect(stepKeys).toEqual(
        expect.arrayContaining([
          'm3.compose',
          'csr.tabulate',
          'm2.3.qos',
          'm2.4.nonclinical',
          'm2.5.clinical',
          'm2.7.clinical',
          'm1.admin',
          'package.assemble',
          'package.validate',
        ])
      );
      // Persistence failures are still swallowed (not surfaced as failed steps).
      // With skipValidation set, package.validate is marked 'skipped' (the
      // orchestrator's else-branch) rather than run — so it cannot fail on its
      // own merits here. The net effect is NO failed step, which is exactly this
      // test's subject: a transient persistence blip never aborts the pipeline.
      const failedKeys = result.run.steps.filter(s => s.status === 'failed').map(s => s.key);
      expect(failedKeys).toEqual([]);
      const validateStep = result.run.steps.find(s => s.key === 'package.validate');
      expect(validateStep?.status).toBe('skipped');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('happy path: a region the CHECK accepts (`US`) persists without surfacing warnings', async () => {
    // Default beforeEach mock: every query resolves OK. No warnings should
    // mention persistRun.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      hoisted.warnings.push({ args });
    });

    try {
      const result = await runOrchestrator(inputsWithSomeData({ region: 'US' }));

      expect(result.run.runId).toBeDefined();
      const persistWarns = hoisted.warnings.filter(w =>
        w.args.some(a => typeof a === 'string' && a.includes('[Orchestrator] persistRun failed'))
      );
      expect(persistWarns).toEqual([]);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
