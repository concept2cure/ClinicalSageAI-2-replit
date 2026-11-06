/**
 * Shared prompt/record construction never receives owner-private relational
 * prose. Invalid project ids also never reach SQL while that raw channel is
 * held; the protected SDK capsule is the only future raw expansion point.
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
  it.each([Number.NaN, 0, -1, 1.5])('omits private notes for project id %s, never sending it', async projectId => {
    const block = await loadRelationalOverlay({ organizationId: 7, userId: 3, projectId });
    expect(h.query).not.toHaveBeenCalled();
    expect(block).toContain('not included in the shared context');
    expect(block).not.toContain(USER_ROW.profile_summary);
  });

  it('also keeps a valid project’s raw notes out of generic capture', async () => {
    const block = await loadRelationalOverlay({ organizationId: 7, userId: 3, projectId: 42 });
    expect(h.query).not.toHaveBeenCalled();
    expect(block).toContain('protected owner context');
    expect(block).not.toContain(USER_ROW.profile_summary);
  });
});
