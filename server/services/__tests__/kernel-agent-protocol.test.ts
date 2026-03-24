import { describe, expect, test, vi } from 'vitest';

vi.mock('../../db.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { validateProtocolEvent } from '../kernel-agent-protocol';

describe('kernel-agent-protocol', () => {
  test('validates required fields for proposal', () => {
    const ok = validateProtocolEvent({
      planRunId: 'gpr_1',
      actorType: 'agent',
      actorId: 'drafter',
      messageType: 'proposal',
      payload: { title: 'Option A', summary: 'Use risk-first framing' },
    });
    expect(ok.ok).toBe(true);
  });

  test('rejects missing required payload keys', () => {
    const bad = validateProtocolEvent({
      planRunId: 'gpr_1',
      actorType: 'agent',
      actorId: 'critic',
      messageType: 'decision',
      payload: { note: 'ship it' },
    });
    expect(bad.ok).toBe(false);
  });
});
