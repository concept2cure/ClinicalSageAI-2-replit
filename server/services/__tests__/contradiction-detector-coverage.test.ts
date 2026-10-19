/**
 * Every contradiction detector says what it read, and whether it read all of it.
 *
 * ── Where this comes from ────────────────────────────────────────────────────
 * `contradiction-cross-artifact-coverage.test.ts` fixed one detector that dropped findings
 * inside itself. Auditing the other five — the owed item from that step — found the same
 * class in all of them:
 *
 *   detectAssumptionDrift                  assumptionRegistryService.search({ limit: 200 })
 *   detectDecisionActionInconsistency      limit: 200
 *   detectCrossJurisdictionalDivergence    limit: 200
 *   detectStatusConflict                   limit: 200, twice
 *   detectBodySpecificExpectationConflict  content.length < 100 skipped; .slice(0, 3)
 *
 * A project with 201 active assumptions has its 201st onward never compared, and the
 * detector returns its findings as though it had compared everything. The harm is the one
 * `contradiction-scan-failclosed.test.ts` already names: `summary.total` is a floor,
 * `buildPreflightContradictionContext` reads it as `blockingCount`, and
 * decision-lifecycle-service renders a 0 as "No pending decisions or contradictions".
 *
 * ── One coverage shape, not two ──────────────────────────────────────────────
 * The previous step introduced `CrossArtifactCoverage` for one detector. Adding a second
 * shape for the others would be the duplication this lane has spent three commits removing,
 * so that type is generalised to `DetectorCoverage` and the cross-artifact detector reports
 * in it like the rest.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const findMany = vi.fn();
const poolQuery = vi.fn();
const search = vi.fn();
vi.mock('../../utils/logger', () => ({
  createScopedLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('../../db', () => ({
  db: { query: new Proxy({}, { get: () => ({ findMany: (...a: unknown[]) => findMany(...a) }) }) },
  getPool: () => ({ query: (...a: unknown[]) => poolQuery(...a) }),
  pool: { query: (...a: unknown[]) => poolQuery(...a), connect: vi.fn() },
}));
vi.mock('../tenant/governed-tenant-context', () => ({ setTenantContextTx: vi.fn() }));
vi.mock('../assumption-registry-service', () => ({
  assumptionRegistryService: { search: (...a: unknown[]) => search(...a) },
}));
vi.mock('../decision-record-service', () => ({
  decisionRecordService: { search: vi.fn(async () => []), list: vi.fn(async () => []) },
}));

interface Coverage {
  detector: string;
  read: number;
  readLimit?: number;
  readTruncated: boolean;
  skipped: number;
  recorded: number;
  recordTruncated: boolean;
  comparedNothing: boolean;
}
type Detected = { findings: unknown[]; coverage: Coverage };

let service: Record<string, (o: number, p: number) => Promise<Detected>>;
beforeEach(async () => {
  vi.resetModules();
  findMany.mockReset();
  poolQuery.mockReset();
  search.mockReset();
  findMany.mockResolvedValue([]);
  search.mockResolvedValue([]);
  poolQuery.mockImplementation(() => Promise.resolve({ rows: [{ id: 'f1', confidence_score: '0.9' }] }));
  const mod = await import('../contradiction-engine-service');
  service = mod.contradictionEngineService as unknown as typeof service;
});

/** `n` active assumptions in one category, each with a different value, so every pair differs. */
const assumptions = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `a-${i}`,
    category: 'sample_size',
    domainTrack: 'clinical',
    assumedValue: String(200 + i),
    assumptionCode: `ASM-${i}`,
    statementText: `Assumed ${200 + i}`,
    status: 'active',
    // A real AssumptionRecord carries this; the cross-jurisdictional detector reads it.
    applicableRegulators: [] as string[],
  }));

describe('a read that hit its limit is reported, not treated as the whole set', () => {
  it('assumption drift says the read was truncated at the limit', async () => {
    // Exactly the limit back from the store: there may be more that were never compared.
    search.mockResolvedValue(assumptions(200));

    const r = await service.detectAssumptionDrift(9901, 1);

    expect(r.coverage.detector).toBe('assumption_drift');
    expect(r.coverage.read).toBe(200);
    expect(r.coverage.readLimit).toBe(200);
    expect(r.coverage.readTruncated).toBe(true);
  });

  it('…and a read comfortably under the limit is not', async () => {
    search.mockResolvedValue(assumptions(3));

    const r = await service.detectAssumptionDrift(9901, 1);

    expect(r.coverage.read).toBe(3);
    expect(r.coverage.readTruncated).toBe(false);
  });

  it('nothing to read is "compared nothing", not "nothing is wrong"', async () => {
    search.mockResolvedValue([]);

    const r = await service.detectAssumptionDrift(9901, 1);

    expect(r.findings).toEqual([]);
    expect(r.coverage.comparedNothing).toBe(true);
    expect(r.coverage.readTruncated).toBe(false);
  });

  it('one assumption on its own is compared with nothing', async () => {
    // A group of one has no pair. The detector is right to skip it; what it must not do is
    // report that as a comparison that found no drift.
    search.mockResolvedValue(assumptions(1));

    const r = await service.detectAssumptionDrift(9901, 1);

    expect(r.findings).toEqual([]);
    expect(r.coverage.comparedNothing).toBe(true);
  });
});

describe('every detector reports coverage in the same shape', () => {
  const DETECTORS = [
    ['detectAssumptionDrift', 'assumption_drift'],
    ['detectDecisionActionInconsistency', 'decision_action_inconsistency'],
    ['detectCrossJurisdictionalDivergence', 'cross_jurisdictional_divergence'],
    ['detectApprovedVsWorkingDrift', 'approved_vs_working_drift'],
    ['detectStatusConflict', 'status_conflict'],
    ['detectCrossArtifactContentConflict', 'cross_artifact_content'],
  ] as const;

  it.each(DETECTORS)('%s reports a DetectorCoverage named %s', async (method, name) => {
    const r = await service[method](9901, 1);

    expect(r, `${method} returned no { findings, coverage }`).toHaveProperty('coverage');
    expect(r).toHaveProperty('findings');
    expect(r.coverage.detector).toBe(name);
    // Every field present and of the right kind, so a caller can read any detector's coverage.
    expect(typeof r.coverage.read).toBe('number');
    expect(typeof r.coverage.skipped).toBe('number');
    expect(typeof r.coverage.recorded).toBe('number');
    expect(typeof r.coverage.readTruncated).toBe('boolean');
    expect(typeof r.coverage.recordTruncated).toBe('boolean');
    expect(typeof r.coverage.comparedNothing).toBe('boolean');
  });

  it('recorded always matches the findings actually returned', async () => {
    search.mockResolvedValue(assumptions(4));
    const r = await service.detectAssumptionDrift(9901, 1);
    expect(r.coverage.recorded).toBe(r.findings.length);
  });
});

describe('the full scan is incomplete when ANY detector is', () => {
  it('names the detectors whose coverage was short', async () => {
    search.mockResolvedValue(assumptions(200));
    const svc = service as unknown as {
      scanProjectFull: (
        o: number,
        p: number,
      ) => Promise<{
        summary: { total: number; incomplete: boolean };
        coverage: Coverage[];
        detectionMethods: string[];
      }>;
    };

    const r = await svc.scanProjectFull(9901, 1);

    expect(r.summary.incomplete).toBe(true);
    // One record per detector that ran, so a caller can see which were short and why.
    expect(r.coverage.length).toBe(r.detectionMethods.length);
    expect(r.coverage.some((c) => c.readTruncated)).toBe(true);
  });
});
