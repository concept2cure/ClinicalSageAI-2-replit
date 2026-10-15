/**
 * The relational overlay never sends a non-integer project id to the database
 * (ana-14, 2026-10-08).
 *
 * The stream used to hand it Number(<program uuid>) = NaN. `project_id = NaN`
 * failed the whole read, so AnA also lost what she had learned about the
 * person (the user-level notes), on every turn in a v2 project
 * (server.log:11715). A non-integer now reads the person's notes alone, the
 * same rule reflectAfterTurn already applies on the write side.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../../db/runtime.js', () => ({ getPool: () => ({ query: h.query }) }));
vi.mock('../../../routes/chat/shared.js', () => ({ ensureGateway: () => null }));

import { loadRelationalOverlay } from '../relational-profile-service';

const USER_ROW = {
  id: 1, project_id: null, profile_summary: 'Prefers tables over prose.', tone_calibration: null,
  emotional_signals: [], acknowledged_mistakes: [], interaction_count: 4,
};

beforeEach(() => {
  h.query.mockReset().mockImplementation(async (_sql: string, params: unknown[]) => {
    if (params.some(p => typeof p === 'number' && Number.isNaN(p))) {
      throw Object.assign(new Error('invalid input syntax for type integer: "NaN"'), { code: '22P02' });
    }
    return { rows: [USER_ROW] };
  });
});

describe('loadRelationalOverlay project id', () => {
  it.each([Number.NaN, 0, -1, 1.5])('reads the person alone for project id %s, never sending it', async projectId => {
    const block = await loadRelationalOverlay({ organizationId: 7, userId: 3, projectId });
    expect(h.query).toHaveBeenCalledTimes(1);
    expect(h.query.mock.calls[0][1]).toEqual([7, 3, null]);
    expect(block).toContain('Prefers tables over prose.');
  });

  it('passes an integer project id through', async () => {
    await loadRelationalOverlay({ organizationId: 7, userId: 3, projectId: 42 });
    expect(h.query.mock.calls[0][1]).toEqual([7, 3, 42]);
  });
});
