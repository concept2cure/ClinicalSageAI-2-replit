/**
 * GET /api/ectd-compile/:projectIdent/status measures placement, for the
 * sequence's own market (FILING_SPINE F23 6/9).
 *
 * At head:
 *   - a sequence with nothing placed fell back to the program's section store
 *     ('approved'), which a program does not have, and read "0% · incomplete"
 *     as if approval had been counted;
 *   - the required set was the program's (an NDA's FDA set), so an EU MAA
 *     sequence of that program was measured against FDA's requirements;
 *   - a module with nothing required read 0% and "ready";
 *   - a program with no sequence read a measured-looking 0%.
 * Now a sequence's placement is counted against the sequence's market (0
 * placed is a measured 0), a module with nothing required has no figure, a
 * program with no sequence says so with no figure, and a market whose agency
 * has no required set says why there is no figure.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockResponse } from '../setup';

const { poolQuery } = vi.hoisted(() => ({ poolQuery: vi.fn() }));

vi.mock('../../server/db', () => ({ pool: { query: poolQuery } }));
vi.mock('../../server/db/requestDb', () => ({ requestDb: () => ({ query: poolQuery }) }));

import ectdCompileRoutes from '../../server/routes/ectd-compile';
import { PROGRAM, handlerOf, mockSpineOn, makeReq } from './ectd-compile-spine.harness';

const status = handlerOf(ectdCompileRoutes, '/:projectIdent/status', 'get');
const mockSpine = mockSpineOn(poolQuery);

async function readStatus(query: Record<string, string> = {}) {
  const req = makeReq();
  req.query = query;
  const res = createMockResponse() as any;
  await status(req, res);
  return res.json.mock.calls[0][0];
}

/** Answer the reads a named sequence makes (resolveSequenceSpine), on top of the harness. */
function namedSequence(seq: { id: number; region: string; applicationType: string; leaves: number }) {
  const base = poolQuery.getMockImplementation()!;
  poolQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (/FROM ectd_sequences q\s+JOIN submissions s/i.test(sql)) {
      return { rows: [{ id: seq.id, sequence_number: '0000', region: seq.region, submission_id: 56, application_type: seq.applicationType, primary_region: seq.region }] };
    }
    if (/count\(\*\)::int AS n FROM submission_leaves/i.test(sql)) return { rows: [{ n: seq.leaves }] };
    return base(sql, params);
  });
}

beforeEach(() => vi.clearAllMocks());

describe('GET /:projectIdent/status measures what the sequence has placed', () => {
  it('a sequence with nothing placed is a measured 0, counted as placement (at head: "approved")', async () => {
    mockSpine({ leaves: [], pack: [{ key: '2.5', mandatory: true }, { key: '3.2.S', mandatory: true }] });
    const payload = await readStatus();
    expect(payload.readinessBasis).toBe('placed');
    expect(payload).toMatchObject({ overallReadiness: 0, totalRequired: 2, totalCompleted: 0 });
  });

  it('an EU sequence of an NDA/FDA program is measured against the EMA set, not FDA’s', async () => {
    mockSpine({ program: { ...PROGRAM, program_type: 'nda', primary_agency: 'FDA' }, pack: [{ key: '2.5', mandatory: true }] });
    namedSequence({ id: 21, region: 'eu', applicationType: 'maa', leaves: 0 });
    const payload = await readStatus({ sequenceId: '21' });
    const packReads = poolQuery.mock.calls.filter(([sql]) => /FROM c2c_rule_packs/i.test(String(sql)));
    expect(packReads.length).toBeGreaterThan(0);
    expect(packReads[0][1]).toEqual(['maa', 'ema']);
    expect(payload.requiredSectionSource).toMatchObject({ source: 'rule_pack', docType: 'maa', agency: 'ema' });
    expect(payload.readinessBasis).toBe('placed');
  });

  it('a module with nothing required has no figure and is not "ready" (at head: 0% and ready)', async () => {
    mockSpine({ pack: [{ key: '2.5', mandatory: true }] });
    const payload = await readStatus();
    const m1 = payload.modules.find((m: any) => m.moduleCode === 'm1');
    expect(m1).toMatchObject({ requiredSections: 0, completionPct: null, ready: null });
    const m2 = payload.modules.find((m: any) => m.moduleCode === 'm2');
    expect(m2).toMatchObject({ requiredSections: 1, completedRequired: 1, completionPct: 100, ready: true });
  });

  it('a market whose agency has no required set is unavailable, with the reason, and no figure', async () => {
    mockSpine({ pack: [{ key: '2.5', mandatory: true }] });
    namedSequence({ id: 22, region: 'zz', applicationType: 'nda', leaves: 1 });
    const payload = await readStatus({ sequenceId: '22' });
    expect(payload.readinessBasis).toBe('unavailable');
    expect(payload.overallReadiness).toBeNull();
    expect(payload.readinessNote).toMatch(/sequence 0000/i);
    expect(payload.submissionReady).toBe(false);
  });
});

describe('GET /:projectIdent/status with no sequence', () => {
  it('a program with no sequence has no figure and says so (at head: a measured-looking 0)', async () => {
    mockSpine();
    const base = poolQuery.getMockImplementation()!;
    poolQuery.mockImplementation(async (sql: string, params?: unknown[]) =>
      (/FROM submissions/i.test(sql) ? { rows: [] } : base(sql, params)));
    const payload = await readStatus();
    expect(payload).toMatchObject({ readinessBasis: 'no-sequence', overallReadiness: null, submissionReady: false });
    expect(payload.readinessNote).toBe('No sequence exists for this program yet, so nothing is counted as placed. Approved sections are on the project’s Author tab.');
    expect(payload.modules).toEqual([]);
    // The first blocker says why nothing is counted, and the program's missing
    // section store is still named.
    expect(payload.submissionBlockers[0]).toBe(payload.readinessNote);
    expect(payload.submissionBlockers.join(' ')).toContain('no linked section-tracking store');
  });
});
