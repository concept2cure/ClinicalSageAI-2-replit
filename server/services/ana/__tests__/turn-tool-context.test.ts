/**
 * The context an AnA tool runs with names its conversation, its turn and its
 * model — dispatched, held, and confirmed alike (PF-10 S5; LX-06's stream half).
 *
 * draft_authoring_document is confirm-class: in production it runs from the
 * held context, after the person's yes. So the chain held → confirmed must
 * carry what the dispatch knew, or every real draft records no conversation,
 * turn or model.
 */
import { describe, expect, it } from 'vitest';
import { confirmedToolContext, heldToolContext, turnToolContext } from '../turn-tool-context';
import { PLATFORM_COMMAND_TOOL } from '../governed-tool-gate';

const PROGRAM = '0f3c1a2b-1111-4222-8333-444455556666';
const SERVED = { provider: 'anthropic', model: 'model-x', requestId: 'req-1' };
const ID = { threadId: 'ana-ri_1', turnId: 'run_1', servingModel: SERVED };

describe('turnToolContext', () => {
  it('a v2 project: the UUID as its ref and no integer form; the conversation, turn and model', () => {
    expect(turnToolContext(PROGRAM, ID)).toEqual({
      projectId: null, projectRef: PROGRAM, servingModel: SERVED, threadId: 'ana-ri_1', turnId: 'run_1', model: 'model-x',
    });
  });

  it('a legacy integer project keeps its integer form', () => {
    expect(turnToolContext('42', ID)).toMatchObject({ projectId: 42, projectRef: '42' });
  });

  it('claims nothing it was not told: no thread (persistence failed), no run, no model', () => {
    expect(turnToolContext(null, { threadId: null, turnId: '', servingModel: null })).toEqual({
      projectId: null, projectRef: null, servingModel: null, threadId: null, turnId: null, model: null,
    });
  });
});

describe('held, then confirmed: what the person confirmed runs as the turn that proposed it', () => {
  it('the confirmed context carries the held conversation, turn and model', () => {
    const held = heldToolContext('draft_authoring_document', PROGRAM, ID)!;
    // As the run row stores it.
    const stored = JSON.parse(JSON.stringify(held));
    expect(confirmedToolContext(stored, 7, 3)).toEqual({
      organizationId: 7, userId: 3, projectId: null, projectRef: PROGRAM,
      servingModel: SERVED, threadId: 'ana-ri_1', turnId: 'run_1', model: 'model-x',
    });
  });

  it('a run held before this change (no thread or turn recorded) confirms with none, honestly', () => {
    const before = { projectId: null, projectRef: PROGRAM, servingModel: SERVED };
    expect(confirmedToolContext(before, 7, 3)).toMatchObject({ threadId: null, turnId: null, model: 'model-x' });
  });

  it("never stamps the person's yes: that has one writer, the governed-action route", () => {
    expect(confirmedToolContext(heldToolContext('draft_authoring_document', PROGRAM, ID), 7, 3)).not.toHaveProperty('humanConfirmed');
  });

  it('a platform command holds no tool context', () => {
    expect(heldToolContext(PLATFORM_COMMAND_TOOL, PROGRAM, ID)).toBeUndefined();
  });
});
