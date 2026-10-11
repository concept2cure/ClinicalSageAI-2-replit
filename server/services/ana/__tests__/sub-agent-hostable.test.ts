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
