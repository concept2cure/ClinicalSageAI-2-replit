/**
 * A reopened thread says what a budget-stopped agent said live (row 74, S5c;
 * brief T10). The stream's tool_result for an 'incomplete' run_agent carries
 * "The agent's result is incomplete: <summary>."; hydration from the persisted
 * trace said "AnA couldn't finish …" instead, so the same step read two ways.
 */
import { describe, expect, it } from 'vitest';

import { hydrateToolTrace } from '../useAnaChat';

describe('hydrateToolTrace', () => {
  it("an incomplete agent says its result is incomplete, with the trace's summary", () => {
    const [call] = hydrateToolTrace([
      { tool: 'run_agent', label: 'Running an agent - "trials"', status: 'incomplete', resultSummary: 'agent: incomplete (round limit)' },
    ]);
    expect(call.status).toBe('error');
    expect(call.message).toBe("The agent's result is incomplete: agent: incomplete (round limit).");
    expect(call.message).not.toMatch(/couldn't finish/);
  });
  it('control: an error still reads as not finished', () => {
    const [call] = hydrateToolTrace([{ tool: 'search_literature', label: 'Searching', status: 'error' }]);
    expect(call.message).toMatch(/couldn't finish/);
  });
});
