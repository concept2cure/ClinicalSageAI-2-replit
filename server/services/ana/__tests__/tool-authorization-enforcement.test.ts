/**
 * P1-34: the register is enforced on every path, not only described.
 *
 * Before this, five tools asked a person first (P0-12's direct mutators) and
 * every other tool that writes ran on the model's word — a monitoring signal
 * raised, a committee vote cast, a training attestation signed in someone's
 * name. These cases go through the real registry and the real tool gate:
 *
 *   the wrapper every handler is registered through (every path: the stream,
 *   the agentic loop, deep investigation, MCP, a tool calling a tool), and
 *
 *   the gate the live chat stream consults to hold the turn and ask.
 */

import { describe, it, expect, vi } from 'vitest';
import { getToolHandler, registerToolHandler } from '../AnaToolExecutor.js';
import { classifyToolCall } from '../governed-tool-gate.js';

const CTX = { organizationId: 1, userId: 2 };
const run = async (tool: string, input: Record<string, unknown>, ctx: Record<string, unknown> = CTX) =>
  JSON.parse(await getToolHandler(tool)!(input, ctx as any));

describe('the registry wrapper', () => {
  it('a write the scanner took for a read is proposed, not run', async () => {
    const input = { program_id: '00000000-0000-4000-8000-000000000001', signal_type: 'kri_breach', title: 'Site 12 AE lag' };
    expect(await run('raise_monitoring_signal', input)).toMatchObject({
      error: 'HUMAN_CONFIRMATION_REQUIRED',
      data: { tier: 'confirm', retry: { command: 'raise_monitoring_signal', params: input } },
    });
  });

  it("a person's own act is refused, and a confirmation does not change that", async () => {
    const vote = { agenda_item_id: 4, member_id: 9, vote: 'approve' };
    for (const ctx of [CTX, { ...CTX, humanConfirmed: true }]) {
      const out = await run('cast_committee_vote', vote, ctx);
      expect(out).toMatchObject({ error: 'NOT_AN_ANA_ACTION', tool: 'cast_committee_vote', retry: false });
      expect(out.message).toMatch(/member’s own act/);
    }
  });

  it('a conditional tool is refused only on the call that would take the person’s act', async () => {
    expect(await run('qms_change_transition', { change_id: 3, to: 'closed' }, { ...CTX, humanConfirmed: true })).toMatchObject({
      error: 'NOT_AN_ANA_ACTION',
    });
    expect(await run('qms_change_transition', { change_id: 3, to: 'under_assessment' })).toMatchObject({
      error: 'HUMAN_CONFIRMATION_REQUIRED',
    });
  });

  describe('a tool nobody classified', () => {
    const probe = vi.fn(async () => JSON.stringify({ ok: true }));
    registerToolHandler('zz_unclassified_probe', probe);

    it('is proposed rather than run — it fails closed', async () => {
      expect(await run('zz_unclassified_probe', { a: 1 })).toMatchObject({ error: 'HUMAN_CONFIRMATION_REQUIRED' });
      expect(probe).not.toHaveBeenCalled();
    });

    it('runs once a person has confirmed it', async () => {
      await run('zz_unclassified_probe', { a: 1 }, { ...CTX, humanConfirmed: true });
      expect(probe).toHaveBeenCalledTimes(1);
    });

    it('never takes the confirmation from what the model wrote', async () => {
      probe.mockClear();
      await run('zz_unclassified_probe', { a: 1, humanConfirmed: true, confirm: true });
      expect(probe).not.toHaveBeenCalled();
    });
  });
});

describe('the tool gate the live stream asks', () => {
  it.each([
    ['list_vault_documents', {}, 'UNGOVERNED'],
    ['answer_intelligence_question', { answer: 'x' }, 'UNGOVERNED'],
    ['raise_monitoring_signal', { title: 't' }, 'NEEDS_APPROVAL'],
    ['cast_committee_vote', { vote: 'approve' }, 'REFUSED'],
    ['qms_change_transition', { to: 'closed' }, 'REFUSED'],
    ['qms_change_transition', { to: 'verification' }, 'NEEDS_APPROVAL'],
  ])('%s %j → %s', (name, input, kind) => {
    expect(classifyToolCall({ name, input }).kind).toBe(kind);
  });

  it('puts a write to a person at the confirm tier, carrying the call', () => {
    expect(classifyToolCall({ name: 'set_qtl', input: { parameter: 'dropout', limit: 0.2 } })).toEqual({
      kind: 'NEEDS_APPROVAL',
      command: 'set_qtl',
      params: { parameter: 'dropout', limit: 0.2 },
      tier: 'confirm',
    });
  });

  it('does not ask a person about an act that is not AnA’s to take', () => {
    const v = classifyToolCall({ name: 'ack_training', input: { document_id: 1 } });
    expect(v.kind).toBe('REFUSED');
    if (v.kind === 'REFUSED') expect(v.result).toMatchObject({ error: 'NOT_AN_ANA_ACTION', tool: 'ack_training' });
  });

  it('a write it cannot read is refused, not proposed', () => {
    expect(classifyToolCall({ name: 'set_qtl', input: null }).kind).toBe('UNDECIDABLE');
  });
});
