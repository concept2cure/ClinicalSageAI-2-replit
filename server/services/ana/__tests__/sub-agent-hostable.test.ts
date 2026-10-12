/**
 * Which turns may host sub-agents (row 74, S5c; brief T13, D13): only one with
 * a run row whose organization is the request's.
 *
 * The run's organization comes from resolveOrgId and the request's from
 * extractRequestContext, and the two do not agree on a type — so 7 and '7' are
 * the same organization, and nothing else is.
 */
import { describe, expect, it } from 'vitest';

import { readTimelineEvent } from '@shared/ana/turn-timeline';

import { subAgentsHostable } from '../sub-agent-stream';

describe('subAgentsHostable', () => {
  it.each([
    [{ runId: 'run_1', runOrgId: 7, orgId: 7 }, true],
    [{ runId: 'run_1', runOrgId: 7, orgId: '7' }, true],
    [{ runId: 'run_1', runOrgId: '7', orgId: 7 }, true],
    [{ runId: undefined, runOrgId: 7, orgId: 7 }, false],
    [{ runId: '', runOrgId: 7, orgId: 7 }, false],
    [{ runId: 'run_1', runOrgId: null, orgId: 7 }, false],
    [{ runId: 'run_1', runOrgId: 7, orgId: null }, false],
    [{ runId: 'run_1', runOrgId: 8, orgId: 7 }, false],
  ])('%o → %s', (turn, hostable) => {
    expect(subAgentsHostable(turn)).toBe(hostable);
  });
});

/**
 * The person's timeline keeps an agent's outcome. Its reader drops a status it
 * does not know, which would leave a finished step with no outcome at all —
 * read as a step that never ended rather than one that stopped at a budget.
 */
describe("the timeline keeps an agent's budget stop", () => {
  const event = (status: string) => {
    const read = readTimelineEvent({
      kind: 'step',
      seq: 1,
      at: '2026-10-11T00:00:00.000Z',
      round: 1,
      step: 's1',
      phase: 'finished',
      label: 'Running an agent',
      source: 'literature',
      status,
    });
    return read && read.kind === 'step' ? read : null;
  };

  it("reads 'incomplete' off the wire", () => {
    expect(event('incomplete')).toMatchObject({ status: 'incomplete' });
  });
  it('still drops a status nobody sends', () => {
    expect(event('nearly')?.status).toBeUndefined();
  });
});

/**
 * A pause nobody answered is not a person's Stop (review 2026-10-11).
 *
 * Under Manual, a person can pause a run while a sub-agent is working and not
 * come back. The hold then expires and ends the turn. The agent's own result
 * said so, but the step's sentence — the one in the live frame, the Summary row
 * and the retained turn record — read "You stopped running an agent before it
 * finished", crediting the person with an act they never performed.
 */
describe("an agent ended by an expired pause does not credit the person", () => {
  const ended = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      agent: { runId: 'agent_1', role: 'research', objective: 'trials' },
      status: 'cancelled',
      stoppedReason: 'cancelled',
      note: 'Stopped: the run stayed paused past its limit.',
      ...over,
    });

  it('says the run stayed paused, not that the person stopped it', async () => {
    const { finishedStep } = await import('../step-presentation');
    const step = finishedStep({ name: 'run_agent', input: { role: 'research', objective: 'trials' } }, null, {
      status: 'cancelled',
      result: ended({ endedBy: 'hold_expired' }),
    });
    expect(step.message).not.toMatch(/You stopped/);
    expect(step.message).toMatch(/stayed paused past its limit/);
  });

  it("control: a person's Stop still reads as theirs", async () => {
    const { finishedStep } = await import('../step-presentation');
    const step = finishedStep({ name: 'run_agent', input: { role: 'research', objective: 'trials' } }, null, {
      status: 'cancelled',
      result: ended(),
    });
    expect(step.message).toMatch(/^You stopped /);
  });

  it('the runner marks an expired hold on the result it returns', async () => {
    const { agentEndedByHoldExpiry } = await import('../sub-agent-result');
    expect(agentEndedByHoldExpiry(ended({ endedBy: 'hold_expired' }))).toBe(true);
    expect(agentEndedByHoldExpiry(ended())).toBe(false);
    expect(agentEndedByHoldExpiry('not json')).toBe(false);
  });
});
