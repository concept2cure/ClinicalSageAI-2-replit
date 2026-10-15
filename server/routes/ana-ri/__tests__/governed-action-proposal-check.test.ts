/**
 * The sign-off audit row records what the approver was shown about the draft
 * (GRD-2 / FIG-3, AnA reasoning round 3, 2026-10-05).
 *
 * The approval dialog shows the check of a governed draft against this turn's
 * sources. The run row holds the full check with the pending approval and
 * clears it when the person decides, so the sign-off row (21 CFR 11.10(e))
 * is where it must survive: what was found, what was not, and the verdicts
 * the draft states, as the person saw them when they approved.
 */
import { describe, expect, it } from 'vitest';

import { governedActionTrace } from '../governed-execution-audit.js';

const pending = (over: Record<string, unknown> = {}) =>
  ({
    toolUseId: 'tu_9',
    command: 'draft_authoring_document',
    params: { title: 'Clinical overview' },
    tier: 'confirm',
    requestedAt: '2026-10-05T00:00:00.000Z',
    proposedBy: { provider: 'anthropic', model: 'm', requestId: 'req_1' },
    ...over,
  }) as any;

const check = {
  engine: 'answer-check/2',
  basis: 'sources',
  claims: 4,
  checked: 3,
  found: 2,
  notFound: [{ kind: 'figure', text: '31%' }],
  unchecked: [],
  fromPerson: [],
  fromInput: [{ kind: 'figure', text: '80%', source: 'tool:compute_sample_size' }],
  sources: ['tool:search_literature'],
  unreadable: [],
  verdicts: [{ text: 'is ready to file', reason: 'States a readiness verdict.' }],
};

describe('the sign-off row names what the approver was shown about the draft', () => {
  it('carries the check of the draft: its counts, what was not found, and the verdicts it states', () => {
    const trace = governedActionTrace('run_1', 'tu_9', pending({ check }), { title: 'Clinical overview' });
    expect(trace.proposalCheck).toEqual({
      engine: 'answer-check/2',
      basis: 'sources',
      claims: 4,
      found: 2,
      notFound: ['31%'],
      fromInput: 1,
      fromPerson: 0,
      unchecked: 0,
      verdicts: ['is ready to file'],
    });
  });

  it('a proposal held with no check carries none, and claims none', () => {
    const trace = governedActionTrace('run_1', 'tu_9', pending(), { title: 'Clinical overview' });
    expect('proposalCheck' in trace).toBe(false);
  });

  it('keeps the row bounded: at most twenty texts of each list, each at most 200 characters', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ kind: 'figure', text: `${i}% ${'x'.repeat(300)}` }));
    const trace = governedActionTrace('run_1', 'tu_9', pending({ check: { ...check, notFound: many } }), {});
    expect(trace.proposalCheck?.notFound).toHaveLength(20);
    expect(trace.proposalCheck?.notFound.every((t: string) => t.length <= 200)).toBe(true);
  });
});
