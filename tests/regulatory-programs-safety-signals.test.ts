/**
 * getSafetySignals — per-signal, per-program supporting-case counts.
 *
 * The kit's "N" column previously showed an ORG-WIDE count of safety_signals
 * grouped by signal_source — every same-source signal displayed one shared
 * approximate figure. The accurate semantics under test:
 *
 *   - count = number of adverse_events rows sharing the signal's MedDRA
 *     reaction PT code (the schema's join key), scoped to the SAME
 *     org/program visibility as the signal list;
 *   - a signal without a reaction_pt_code → count null (uncountable, shown
 *     as "—"), never a fabricated 1;
 *   - adverse_events table missing → ALL counts null (we could not count),
 *     never 0 (a claim we counted and found none);
 *   - safety_signals table missing → honest empty list.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPoolQuery, mockProgramRows } = vi.hoisted(() => ({
  mockPoolQuery: vi.fn(),
  mockProgramRows: vi.fn<[], unknown[]>(() => []),
}));

vi.mock('../server/db', () => ({
  pool: { query: mockPoolQuery },
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn(async () => mockProgramRows()) })),
      })),
    })),
  },
}));

import { getSafetySignals } from '../server/services/regulatory-programs.service';

const ORG = 7;
const PROGRAM_ID = '2b6d4a80-6a35-4b1e-9f6e-3a9d2c1e5f70';
const PROGRAM_ROW = { id: PROGRAM_ID, organizationId: ORG, productName: 'CGM', name: 'CGM' };

const SIGNAL_ROWS = [
  {
    id: 'sig-1',
    signal_source: 'faers',
    description: 'Hyperglycemia reports trending up',
    detected_at: new Date('2026-08-01T00:00:00Z'),
    evaluation_status: 'under_evaluation',
    action: 'label_change',
    reaction_pt_code: '10020635',
  },
  {
    id: 'sig-2',
    signal_source: 'faers',
    description: 'Sensor adhesive dermatitis',
    detected_at: new Date('2026-07-15T00:00:00Z'),
    evaluation_status: 'new',
    action: null,
    reaction_pt_code: '10012431',
  },
  {
    id: 'sig-3',
    signal_source: 'literature',
    description: 'Case series without MedDRA coding',
    detected_at: new Date('2026-07-01T00:00:00Z'),
    evaluation_status: 'new',
    action: null,
    reaction_pt_code: null,
  },
];

function undefinedTableError(): Error {
  const err = new Error('relation does not exist') as Error & { code: string };
  err.code = '42P01';
  return err;
}

describe('getSafetySignals counts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProgramRows.mockReturnValue([PROGRAM_ROW]);
  });

  it('returns null for a program outside the org (no signal leak)', async () => {
    mockProgramRows.mockReturnValue([]);
    expect(await getSafetySignals(ORG, PROGRAM_ID)).toBeNull();
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  it('counts per-signal via the MedDRA PT join, program-scoped — null without a PT', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: SIGNAL_ROWS })
      .mockResolvedValueOnce({
        rows: [{ reaction_pt_code: '10020635', n: 12 }], // no rows for 10012431
      });

    const signals = await getSafetySignals(ORG, PROGRAM_ID);
    expect(signals).toHaveLength(3);
    expect(signals![0].count).toBe(12); // real per-signal case count
    expect(signals![1].count).toBe(0); // counted, none found
    expect(signals![2].count).toBeNull(); // no PT linkage → uncountable, not 1

    // Both queries carry the SAME org + program scope — the fix removes the
    // org-wide grouped-by-source approximation.
    const [signalSql, signalParams] = mockPoolQuery.mock.calls[0];
    const [aeSql, aeParams] = mockPoolQuery.mock.calls[1];
    expect(String(signalSql)).toMatch(/FROM safety_signals/);
    expect(String(aeSql)).toMatch(/FROM adverse_events/);
    expect(String(aeSql)).toMatch(/reaction_pt_code/);
    expect(String(aeSql)).not.toMatch(/GROUP BY signal_source/);
    expect(signalParams).toEqual([String(ORG), PROGRAM_ID]);
    expect(aeParams).toEqual([String(ORG), PROGRAM_ID]);
  });

  it('makes every count null when adverse_events is not provisioned — not 0', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: SIGNAL_ROWS })
      .mockRejectedValueOnce(undefinedTableError());

    const signals = await getSafetySignals(ORG, PROGRAM_ID);
    expect(signals!.map((s) => s.count)).toEqual([null, null, null]);
  });

  it('returns an honest empty list when safety_signals is not provisioned', async () => {
    mockPoolQuery
      .mockRejectedValueOnce(undefinedTableError())
      .mockResolvedValueOnce({ rows: [] });

    expect(await getSafetySignals(ORG, PROGRAM_ID)).toEqual([]);
  });

  it('propagates non-42P01 database failures instead of masking them', async () => {
    mockPoolQuery.mockRejectedValueOnce(new Error('connection refused'));
    await expect(getSafetySignals(ORG, PROGRAM_ID)).rejects.toThrow(/connection refused/);
  });
});
