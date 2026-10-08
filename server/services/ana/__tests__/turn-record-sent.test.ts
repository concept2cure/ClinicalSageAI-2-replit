/**
 * The turn record says what each model call was sent, and why the turn was
 * served as it was (MC-RL-8, AnA reasoning round 9, 2026-10-05).
 *
 * The record named the model that served each call, and nothing of what the
 * call asked for: not the gateway request it joins to the ledger by, not the
 * effort or the thinking config, not the tools it was offered, not whether
 * the closing call was told to stop calling them. Rounds 4 and 7 made those
 * depend on the turn (a high-stakes turn reasons harder; a Module 2 summary is
 * high-stakes), so a reviewer could see that a turn reasoned and not why, nor
 * whether it had the tool it needed.
 */
import { describe, it, expect } from 'vitest';

import { callSent, openTurnRecorder, TURN_RECORD_SCHEMA } from '../turn-record';

const recorder = () => openTurnRecorder({ orgId: 7, userId: 3, typed: 'What SAE rate does 2.7.4 report?' })!;

describe('what each call was sent', () => {
  it('is on the record, call by call, with the gateway request that joins it to the ledger', () => {
    const r = recorder();
    r.setRouting({ riskTier: 'high', taskType: 'regulatory_review', decisionRationale: 'Open section 2.7.4 is a CTD summary -> approved model required' });
    // The tools as the stream holds them: whole definitions, of which the record keeps the names.
    const offered = [{ name: 'search_literature', description: 'x', input_schema: { type: 'object' } }, { name: 'get_cmc_requirements' }];
    r.addServed(1, { provider: 'anthropic', model: 'claude-opus-5-5', requestId: 'req_1' }, callSent({
      apiEffort: 'high',
      thinking: { enabled: true, budgetTokens: 16000 },
      tools: offered,
    }));
    r.addServed(2, { provider: 'anthropic', model: 'claude-opus-5-5', requestId: 'req_2' }, callSent({
      apiEffort: 'high',
      thinking: { enabled: true, budgetTokens: 16000 },
      tools: [{ name: 'search_literature' }],
      toolChoice: 'none',
    }));
    const { body } = r.seal('answered');
    expect(body.schema).toBe(TURN_RECORD_SCHEMA);
    // /3's routing and per-call facts are carried on in /4 (S4 adds the timeline).
    expect(TURN_RECORD_SCHEMA).toBe('ana-turn-record/4');
    expect(body.routing).toEqual({ riskTier: 'high', taskType: 'regulatory_review', rationale: 'Open section 2.7.4 is a CTD summary -> approved model required' });
    expect(body.model.calls).toEqual([
      {
        call: 1, round: 1, provider: 'anthropic', model: 'claude-opus-5-5', requestId: 'req_1',
        sent: { effort: 'high', thinking: { enabled: true, budgetTokens: 16000 }, tools: ['search_literature', 'get_cmc_requirements'], toolChoice: null },
      },
      {
        call: 2, round: 2, provider: 'anthropic', model: 'claude-opus-5-5', requestId: 'req_2',
        sent: { effort: 'high', thinking: { enabled: true, budgetTokens: 16000 }, tools: ['search_literature'], toolChoice: 'none' },
      },
    ]);
  });

  it('says plainly what it does not know: no request id, no sent facts, no routing', () => {
    const r = recorder();
    r.addServed(1, { provider: 'anthropic', model: 'm' });
    const { body } = r.seal('answered');
    expect(body.model.calls).toEqual([{ call: 1, round: 1, provider: 'anthropic', model: 'm', requestId: null, sent: null }]);
    expect(body.routing).toBeNull();
  });

  it('records what was sent, never the tool schemas, and no thinking as none', () => {
    const tools = [{ name: 'a', input_schema: { type: 'object' } }];
    expect(callSent({ tools })).toEqual({
      effort: null,
      thinking: null,
      tools: ['a'],
      toolChoice: null,
    });
    expect(callSent({ thinking: { enabled: false } }).thinking).toEqual({ enabled: false, budgetTokens: null });
  });
});
