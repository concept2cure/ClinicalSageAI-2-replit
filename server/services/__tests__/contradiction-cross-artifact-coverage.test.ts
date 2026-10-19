/**
 * A detector that silently dropped findings reported as a detector that found nothing.
 *
 * That is the sentence already in this directory, one level down.
 * `contradiction-scan-failclosed.test.ts` pins `scanProjectFull`'s gate, and states the harm
 * in its own words: a dropped detector means *"summary.total and, via
 * buildPreflightContradictionContext, blockingCount/unresolvedCount fall below the truth
 * (potentially to 0)"*, so *"a preflight verdict reads '0 blocking contradictions / ready to
 * promote'"*. The fix made the Pass-8 detectors reject instead of returning a partial array.
 *
 * ── THE DEFECT THIS PINS ─────────────────────────────────────────────────────
 * `detectCrossArtifactContentConflict` did the same thing to itself, inside the detector,
 * without failing:
 *
 *   for (const issue of significantIssues.slice(0, 10)) { … }
 *
 * Every significant HarmonizeIssue past the tenth was dropped. Nothing said so: the
 * promise resolved, `detectionMethods` still asserted `cross_artifact_content` had run, and
 * `summary.total` came back short by exactly what was discarded — which is the undercount
 * the fail-closed comment describes, reached by a different road. `.slice` also took the
 * issues in whatever order Harmonize produced them, so a `critical` sample-size conflict
 * could be dropped in favour of ten `error`-severity ones.
 *
 * Two quieter versions of the same thing:
 *   - fewer than two artifacts with content returned `[]` while `detectionMethods` still
 *     listed the detector, so "nothing was compared" read as "nothing is wrong";
 *   - an artifact whose text came in under 50 characters was skipped with no count.
 *
 * None of this is about whether a bound is right. A bound on writes is reasonable. Reporting
 * a bounded result as a complete one is not.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const findMany = vi.fn();
const poolQuery = vi.fn();
const warn = vi.fn();
vi.mock('../../utils/logger', () => ({
  createScopedLogger: () => ({ warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('../../db', () => ({
  db: { query: new Proxy({}, { get: () => ({ findMany: (...a: unknown[]) => findMany(...a) }) }) },
  getPool: () => ({ query: (...a: unknown[]) => poolQuery(...a) }),
  pool: { query: (...a: unknown[]) => poolQuery(...a), connect: vi.fn() },
}));
vi.mock('../tenant/governed-tenant-context', () => ({ setTenantContextTx: vi.fn() }));

/** One artifact per CTD section, each stating a sample size that disagrees with the others. */
const artifactsDisagreeingOn = (codes: readonly string[]) =>
  codes.map((code, i) => ({
    id: `art-${i}`,
    projectId: 1,
    ctdSection: code,
    content: `<p>The study randomized ${200 + i} patients across ${10 + i} sites, with a two-sided alpha = 0.0${i + 1}.</p>`,
  }));

interface Coverage {
  sectionsRead: number;
  sectionsSkippedShort: number;
  issuesFound: number;
  findingsRecorded: number;
  truncated: boolean;
  comparedNothing?: boolean;
}
interface Svc {
  detectCrossArtifactContentConflict: (
    o: number,
    p: number,
  ) => Promise<{ findings: unknown[]; coverage: Coverage }>;
}

let service: Svc;
beforeEach(async () => {
  vi.resetModules();
  findMany.mockReset();
  poolQuery.mockReset();
  warn.mockReset();
  // createFinding inserts and returns the row it wrote.
  poolQuery.mockImplementation(() => Promise.resolve({ rows: [{ id: 'f1', confidence_score: '0.9' }] }));
  const mod = await import('../contradiction-engine-service');
  service = mod.contradictionEngineService as unknown as Svc;
});

describe('the detector says what it compared and what it dropped', () => {
  it('reports truncation rather than returning a short list silently', async () => {
    // Twelve sections, each disagreeing with the rest: far more significant issues than the cap.
    findMany.mockResolvedValue(
      artifactsDisagreeingOn(['2.5', '2.7.1', '2.7.2', '2.7.3', '2.7.4', '5.3.1', '5.3.2', '5.3.3', '5.3.4', '5.3.5', '2.4', '2.6']),
    );

    const r = await service.detectCrossArtifactContentConflict(9901, 1);

    // The whole defect in one assertion: the result knows it is incomplete.
    expect(r.coverage.truncated).toBe(true);
    expect(r.coverage.issuesFound).toBeGreaterThan(r.coverage.findingsRecorded);
    expect(r.findings.length).toBe(r.coverage.findingsRecorded);
  });

  it('never drops a critical finding in favour of a lesser one', async () => {
    findMany.mockResolvedValue(
      artifactsDisagreeingOn(['2.5', '2.7.1', '2.7.2', '2.7.3', '2.7.4', '5.3.1', '5.3.2', '5.3.3', '5.3.4', '5.3.5', '2.4', '2.6']),
    );

    const r = await service.detectCrossArtifactContentConflict(9901, 1);
    const severities = (r.findings as Array<{ severity: string }>).map((f) => f.severity);
    // Whatever the bound, what it keeps is ordered worst-first, so a bounded scan can never
    // report the lesser half of what it found.
    const rank = { critical: 0, high: 1, medium: 2, low: 3 } as Record<string, number>;
    const ranks = severities.map((s) => rank[s] ?? 9);
    expect(ranks, severities.join(',')).toEqual([...ranks].sort((a, b) => a - b));
  });

  it('a project with fewer than two readable artifacts compared NOTHING, and says so', async () => {
    findMany.mockResolvedValue(artifactsDisagreeingOn(['2.5']));

    const r = await service.detectCrossArtifactContentConflict(9901, 1);

    expect(r.findings).toEqual([]);
    expect(r.coverage.comparedNothing).toBe(true);
    expect(r.coverage.sectionsRead).toBeLessThan(2);
    // …and that is not the same answer as "two sections compared, nothing wrong".
    expect(r.coverage.truncated).toBe(false);
  });

  it('counts the artifacts it skipped for being too short to read', async () => {
    findMany.mockResolvedValue([
      { id: 'a', projectId: 1, ctdSection: '2.5', content: '<p>Too short.</p>' },
      { id: 'b', projectId: 1, ctdSection: '2.7.3', content: '<p>Also far too short.</p>' },
      ...artifactsDisagreeingOn(['5.3.5', '2.4']),
    ]);

    const r = await service.detectCrossArtifactContentConflict(9901, 1);

    expect(r.coverage.sectionsSkippedShort).toBe(2);
    expect(r.coverage.sectionsRead).toBe(2);
  });

  it('a complete scan of two agreeing sections is complete, and reports no conflict', async () => {
    const same = '<p>The study randomized 240 patients across 30 sites, with a two-sided alpha = 0.05.</p>';
    findMany.mockResolvedValue([
      { id: 'a', projectId: 1, ctdSection: '2.5', content: same },
      { id: 'b', projectId: 1, ctdSection: '5.3.5', content: same },
    ]);

    const r = await service.detectCrossArtifactContentConflict(9901, 1);

    expect(r.coverage.comparedNothing).toBeFalsy();
    expect(r.coverage.truncated).toBe(false);
    expect(r.coverage.sectionsRead).toBe(2);
    expect(r.findings).toEqual([]);
  });
});

describe('an incomplete scan never reads as "no contradictions"', () => {
  /*
   * These assert the WIRING: a coverage record that says the scan bounded or skipped its own
   * work must reach the preflight context, because that is what decision-lifecycle-service
   * renders. The detector is stubbed so the property under test is the path from coverage to
   * `scanIncomplete`, not the fidelity of a database mock through six detectors.
   */
  const withCoverage = (coverage: Partial<Coverage>) => {
    const svc = service as unknown as Record<string, unknown>;
    svc.detectCrossArtifactContentConflict = () =>
      Promise.resolve({
        findings: [],
        coverage: {
          sectionsRead: 0,
          sectionsSkippedShort: 0,
          issuesFound: 0,
          findingsRecorded: 0,
          truncated: false,
          comparedNothing: false,
          ...coverage,
        },
      });
    return svc as unknown as {
      buildPreflightContradictionContext: (
        o: number,
        p: number,
        s: Record<string, string | undefined>,
      ) => Promise<{ blockingCount: number; scanIncomplete: boolean; crossArtifactCoverage?: Coverage }>;
    };
  };

  beforeEach(() => findMany.mockResolvedValue([]));

  it('a scan that compared nothing is reported incomplete, counts and all', async () => {
    /* One readable section: nothing was compared across artifacts. The counts are 0, and a 0
       from a scan that compared nothing is unknown, not clean — decision-lifecycle-service
       renders a 0 as "No pending decisions or contradictions". */
    const ctx = await withCoverage({ comparedNothing: true, sectionsRead: 1 }).buildPreflightContradictionContext(9901, 1, {});
    expect(ctx.blockingCount).toBe(0);
    expect(ctx.scanIncomplete).toBe(true);
    expect(ctx.crossArtifactCoverage?.comparedNothing).toBe(true);
  });

  it('a scan whose bound cut in is reported incomplete', async () => {
    const ctx = await withCoverage({ truncated: true, sectionsRead: 12, issuesFound: 25, findingsRecorded: 10 })
      .buildPreflightContradictionContext(9901, 1, {});
    expect(ctx.scanIncomplete).toBe(true);
    expect(ctx.crossArtifactCoverage?.issuesFound).toBe(25);
    expect(ctx.crossArtifactCoverage?.findingsRecorded).toBe(10);
  });

  it('a complete scan with nothing wrong is NOT marked incomplete', async () => {
    const ctx = await withCoverage({ sectionsRead: 2 }).buildPreflightContradictionContext(9901, 1, {});
    expect(ctx.scanIncomplete).toBe(false);
  });
});
