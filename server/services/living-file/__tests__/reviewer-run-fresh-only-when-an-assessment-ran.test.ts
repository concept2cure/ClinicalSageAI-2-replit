/**
 * A reviewer simulation run is 'fresh' only when a check that reads the
 * program's records ran; otherwise it is 'not_assessed', and the report says
 * what was not read.
 *
 * What the code used to do: reviewerSimFreshness marked the latest run 'fresh'
 * whenever criticalCount was 0. Since 2026-10-15 the simulator reads packet and
 * nonclinical facts only from records and no record holds claim-health figures,
 * so a run with no defense packet and no nonclinical studies contains only the
 * personas' static checklist prompts — 0 critical questions because nothing
 * could raise one — and it read as "fresh". So did a run with no persona in
 * scope, and a run from before the simulator recorded its sources (its packet
 * and intel came from the request).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rows = vi.hoisted(() => ({ perTable: new Map<unknown, unknown[]>() }));

function chain() {
  let table: unknown = null;
  const c: any = {
    from(t: unknown) {
      table = t;
      return c;
    },
    leftJoin: () => c,
    where: () => c,
    orderBy: () => c,
    limit: () => Promise.resolve(rows.perTable.get(table) ?? []),
    then: (resolve: (r: unknown[]) => void) => resolve(rows.perTable.get(table) ?? []),
  };
  return c;
}
vi.mock('../../../db', () => ({ db: { select: () => chain() } }));

import { programFreshnessReport } from '../freshness-report.service';
import { reviewerSimulationRuns } from '../../../../shared/schema/reviewer-simulation';

const ORG = 7;
const PROGRAM = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const NOTHING_READ = { program: 'caller_stated', packet: 'not_available', claimHealth: 'not_available', nonclinical: 'not_available' };

const run = (over: Record<string, unknown>) => ({
  id: 'sim-1',
  createdAt: new Date(),
  criticalCount: 0,
  personaScope: ['labeling_reviewer', 'quality_systems_reviewer'],
  summary: { inputsSource: NOTHING_READ },
  ...over,
});
// The route supplies its already admitted request connection. This focused
// fixture provides an explicit empty canonical packet result, not a pool fallback.
const packetClient = { query: vi.fn(async (_text: string, _params?: unknown[]) => ({ rows: [] })) };
const reviewerRow = async () => {
  const r = await programFreshnessReport(ORG, PROGRAM, packetClient);
  return { row: r.artifacts.find(a => a.artifact === 'reviewer_simulation_run')!, report: r };
};

beforeEach(() => { rows.perTable.clear(); packetClient.query.mockClear(); });

describe('reviewer simulation run freshness: fresh needs an assessment that ran', () => {
  it('a run that read nothing from the records is not assessed, not fresh', async () => {
    rows.perTable.set(reviewerSimulationRuns, [run({})]);
    const { row, report } = await reviewerRow();
    expect(packetClient.query).toHaveBeenCalledWith(expect.stringContaining('FROM predicate.defense_packets'), [ORG, PROGRAM]);
    expect(row.state, 'a run that assessed no record was reported fresh').toBe('not_assessed');
    expect(row.reason).toMatch(/defense packet/);
    expect(row.reason).toMatch(/claim-health/);
    expect(row.reason).toMatch(/nonclinical/);
    expect(report.counts.reviewer_simulation_run.not_assessed).toBe(1);
    expect(report.counts.reviewer_simulation_run.fresh).toBe(0);
  });

  it('a run with no persona in scope is not assessed', async () => {
    rows.perTable.set(reviewerSimulationRuns, [
      run({ personaScope: [], summary: { inputsSource: { ...NOTHING_READ, packet: 'defense_packets' } } }),
    ]);
    const { row } = await reviewerRow();
    expect(row.state).toBe('not_assessed');
    expect(row.reason).toMatch(/no reviewer persona/);
  });

  it('a run that did not record its sources is not assessed', async () => {
    rows.perTable.set(reviewerSimulationRuns, [run({ summary: { baseQuestionCount: 4, personaQuestionCount: 3 } })]);
    const { row } = await reviewerRow();
    expect(row.state).toBe('not_assessed');
    expect(row.reason).toMatch(/did not record where its facts came from/);
  });

  it('a run that read the defense packet and raised no critical question is fresh, and says what it did not read', async () => {
    rows.perTable.set(reviewerSimulationRuns, [
      run({ summary: { inputsSource: { ...NOTHING_READ, packet: 'defense_packets' } } }),
    ]);
    const { row } = await reviewerRow();
    expect(row.state).toBe('fresh');
    expect(row.reason).toMatch(/not assessed: claim-health figures, nonclinical studies/);
  });

  it('control: critical questions outstanding are stale, as before', async () => {
    rows.perTable.set(reviewerSimulationRuns, [run({ criticalCount: 2 })]);
    const { row } = await reviewerRow();
    expect(row.state).toBe('stale');
    expect(row.reason).toBe('2 critical reviewer questions outstanding');
  });
});
