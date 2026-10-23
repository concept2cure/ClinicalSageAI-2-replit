/**
 * A governed-decision row the repository cannot read is an error, never a
 * record with invented content.
 *
 * What it used to do (until 2026-10-15): mapRow turned notes or
 * decision_context that did not parse as JSON into {} — so every gate outcome
 * and count fell to its default — and a row with no created_at was stamped
 * with the current time. getRecentGovernedDecisions rethrows, and the GET
 * routes answer 500.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock('../decision-record-service.js', () => ({ decisionRecordService: { create: vi.fn(), search: h.search } }));

import { getRecentGovernedDecisions } from '../governed-decision-repository';

const row = (over: Record<string, unknown>) => ({
  id: 'row-1', organizationId: 7, projectId: 11, decidedBy: '42', recommendationSummary: 'ok',
  createdAt: '2026-10-01T00:00:00.000Z',
  decisionContext: { governedDecisionId: 'gd-1', intent: 'promote', outcome: 'allow' },
  notes: { blockerCount: 0 },
  ...over,
});
const read = () => getRecentGovernedDecisions({ organizationId: '7' });

beforeEach(() => h.search.mockReset());

describe('mapRow refuses what it cannot read', () => {
  it.each([
    ['notes', { notes: '{not json' }],
    ['decision_context', { decisionContext: 'nope' }],
  ])('unparseable %s: rejects', async (_label, over) => {
    h.search.mockResolvedValue([row(over)]);
    await expect(read(), 'unparseable JSON was read as {}').rejects.toThrow(/row-1/);
  });

  it('no created_at: rejects rather than stamping the current time', async () => {
    h.search.mockResolvedValue([row({ createdAt: null })]);
    await expect(read(), 'a missing created_at became the current time').rejects.toThrow(/created_at/);
  });

  it('a readable row maps, with its recorded time', async () => {
    h.search.mockResolvedValue([row({ notes: JSON.stringify({ blockerCount: 2 }) })]);
    const [r] = await read();
    expect(r).toMatchObject({ decisionId: 'gd-1', blockerCount: 2, timestamp: '2026-10-01T00:00:00.000Z' });
  });
});
