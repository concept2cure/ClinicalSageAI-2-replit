/**
 * A run_agent step in the turn's trace says what the agent did (row 74, S5c;
 * brief T9, D16).
 *
 * 'incomplete' means one thing: the agent stopped at a budget. It is not a
 * failure to retry, so the next turn's note lists it on its own, with "do not
 * re-run the same brief", not among the attempts to retry with a changed
 * approach. A verify agent that ran to completion is a successful step whatever
 * its verdict; a person's Stop stays cancelled.
 */
import { describe, expect, it } from 'vitest';

import { buildTraceEntry, formatTraceForContext } from '../tool-trace';
import { CANCELLED_TOOL_RESULT } from '../agentic-loop';

const result = (r: object) => JSON.stringify(r);
const verify = { agent: { role: 'verify' } };

describe('buildTraceEntry for run_agent', () => {
  it('a budget stop is incomplete, and says which budget', () => {
    const e = buildTraceEntry('run_agent', 'Running an agent', 'success', result({ agent: { role: 'research' }, status: 'incomplete', budget: 'rounds' }));
    expect(e.status).toBe('incomplete');
    expect(e.resultSummary).toBe('agent: incomplete (round limit)');
  });
  it.each(['inconclusive', 'nothing_checkable', 'issues_found'])('a completed verify with verdict %s is a success', verdict => {
    const e = buildTraceEntry('run_agent', 'Running a verification agent', 'success', result({ ...verify, status: 'completed', verdict }));
    expect(e.status).toBe('success');
    expect(e.resultSummary).toBe(`verification agent: completed, ${verdict}`);
  });
  it('AGENT_FAILED is an error', () => {
    const e = buildTraceEntry('run_agent', 'x', 'success', result({ error: 'AGENT_FAILED', code: 'MODEL_DECLINED', agent: { role: 'research' } }));
    expect(e.status).toBe('error');
    expect(e.resultSummary).toBe('agent: did not run (AGENT_FAILED, MODEL_DECLINED)');
  });
  it("a person's Stop stays cancelled; mechanical errors pass through", () => {
    expect(buildTraceEntry('run_agent', 'x', 'cancelled', JSON.stringify(CANCELLED_TOOL_RESULT('run_agent'))).status).toBe('cancelled');
    expect(buildTraceEntry('run_agent', 'x', 'error', '{}').status).toBe('error');
    expect(buildTraceEntry('run_agent', 'x', 'not_found', '{}').status).toBe('not_found');
  });
  it('an unreadable success is incomplete, never success', () => {
    expect(buildTraceEntry('run_agent', 'x', 'success', 'not json').status).toBe('incomplete');
  });
  it('other tools are untouched', () => {
    expect(buildTraceEntry('search_literature', 'x', 'success', result({ status: 'incomplete' })).status).toBe('success');
  });
});

describe('formatTraceForContext', () => {
  it('lists a budget-stopped agent on its own, not among attempts to retry', () => {
    const note = formatTraceForContext([
      { tool: 'run_agent', label: 'Running an agent - "trials"', status: 'incomplete', resultSummary: 'agent: incomplete (round limit)' },
      { tool: 'run_agent', label: 'Running a verification agent - "2.5"', status: 'success', resultSummary: 'verification agent: completed, inconclusive' },
      { tool: 'search_literature', label: 'Searching', status: 'error', resultSummary: 'timeout' },
    ]);
    const [already, stopped, failed] = note.split('\n\n');
    expect(already).toMatch(/already run[\s\S]*verification agent: completed, inconclusive/);
    expect(stopped).toMatch(/^Agents that stopped at a budget[\s\S]*do not re-run the same brief[\s\S]*"trials"/);
    expect(failed).toMatch(/did not return a usable result[\s\S]*Searching/);
    expect(failed).not.toMatch(/trials/);
  });
});

describe('the run_agent step label (D21)', () => {
  it('a quote inside the objective cannot open a second quoted span', async () => {
    const { describeToolPlan } = await import('../agentic-loop');
    const [step] = describeToolPlan([{ id: 'c', name: 'run_agent', input: { role: 'verify', objective: 'check the "N=305" claim' } }]);
    expect(step.label).toBe(`Running a verification agent - "check the 'N=305' claim"`);
    expect(step.label.split('"')).toHaveLength(3);
    const [research] = describeToolPlan([{ id: 'c', name: 'run_agent', input: { role: 'research', objective: 'trials' } }]);
    expect(research.label).toBe('Running an agent - "trials"');
  });
});
