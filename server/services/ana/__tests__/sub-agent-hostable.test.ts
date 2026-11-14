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

import { subAgentsHostable, ownerPrivateStreamBuffer } from '../sub-agent-stream';
import { runAgentInputForWire, runAgentResultForWire, recordedTeamContext } from '../sub-agent-shape';

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

describe('owner-private live output capture', () => {
  it('includes only content-free report references in recorded model team context',() => {
    const receipt={eventId:'11111111-1111-4111-8111-111111111111',eventHash:'a'.repeat(64),sequence:3,at:'2026-11-14T02:00:00.000Z',text:'PRIVATE_RECEIPT_CANARY'};
    const report={worker:'w1',receipt,reportSha256:'b'.repeat(64),text:'PRIVATE_REPORT_CANARY',reason:'PRIVATE_REASON_CANARY',source:'PRIVATE_SOURCE_CANARY'};
    const board={workers:[],messages:[],reports:[report]};
    const result=recordedTeamContext(board);
    expect(JSON.parse(result)).toHaveProperty('reports',[{worker:'w1',reportSha256:'b'.repeat(64),receipt:{
      eventId:receipt.eventId,eventHash:receipt.eventHash,sequence:receipt.sequence,at:receipt.at}}]);
    for(const canary of ['PRIVATE_RECEIPT_CANARY','PRIVATE_REPORT_CANARY','PRIVATE_REASON_CANARY','PRIVATE_SOURCE_CANARY'])expect(result).not.toContain(canary);
  });
  it('keeps worker briefs, reports, peer text and source bodies out of the operational wire', () => {
    expect(runAgentInputForWire({ role: 'research', objective: 'PRIVATE_CANARY_384', instructions: 'SECRET', text: 'PEER_SECRET' }, 's1'))
      .toEqual({ action: 'spawn', assignment: 's1', role: 'research' });
    const wire = runAgentResultForWire(JSON.stringify({ status: 'completed', agent: { role: 'research', objective: 'PRIVATE_CANARY_384' },
      report: 'PEER_SECRET', source: 'SOURCE_SECRET', trace: { steps: ['SECRET'] } }));
    expect(JSON.parse(wire)).toMatchObject({ status: 'completed', agent: { role: 'research' }, reportDisposition: 'pending' });
    for (const value of ['PRIVATE_CANARY_384', 'PEER_SECRET', 'SOURCE_SECRET', 'SECRET']) expect(wire).not.toContain(value);
  });
  it('keeps content and legacy agent frames off the wire until the protected commit callback, while measured worker progress stays live', () => {
    const wire: string[] = [], buffer = ownerPrivateStreamBuffer(frame => { wire.push(frame); return true; }, () => true);
    const content = `data: ${JSON.stringify({ type: 'text', content: 'PRIVATE_CANARY_384' })}\n\n`;
    const legacy = `data: ${JSON.stringify({ type: 'agent_event', objective: 'PRIVATE_CANARY_384' })}\n\n`;
    const progress = `data: ${JSON.stringify({ type: 'timeline', event: { kind: 'worker', worker: 'w1', completed: 1, total: 3 } })}\n\n`;
    buffer.write(content); buffer.write(legacy); buffer.write(progress);
    expect(wire).toEqual([progress]); expect(wire.join('')).not.toContain('PRIVATE_CANARY_384');
    // The caller is the postprocessor after encrypted message/record/audit and
    // current owner admission. This unit fixture qualifies ordering, not KMS.
    buffer.release(); expect(wire).toEqual([progress, content, legacy]);
  });
  it('holds oversized output and emits only a fixed failure notice without provider or private details', () => {
    const wire: string[] = [], buffer = ownerPrivateStreamBuffer(frame => { wire.push(frame); return true; }, () => true);
    buffer.write('x'.repeat(2_000_001));
    expect(() => buffer.release()).toThrow('PRIVATE_OUTPUT_BUFFER_LIMIT');
    buffer.write(`data: ${JSON.stringify({ type: 'error', error: 'PRIVATE_CANARY_384' })}\n\n`);
    expect(wire.join('')).toContain('OWNER_PRIVATE_OUTPUT_HELD'); expect(wire.join('')).not.toContain('PRIVATE_CANARY_384');
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
