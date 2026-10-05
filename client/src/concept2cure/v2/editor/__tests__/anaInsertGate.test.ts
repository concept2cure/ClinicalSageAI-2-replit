/**
 * AnA's answer goes into a document only when every model that wrote it may
 * write governed content (AnA reasoning round 11, GRD-missed, 2026-10-05).
 *
 * Every other door that stores model-authored text already refuses a model
 * RULE 2 does not admit: governed tools, governed commands, confirmed
 * proposals, and at the gateway the AI draft panel and batch draft. "Insert
 * into … as tracked suggestion" did not. The rule is the server's
 * (approved-models.ts isServedModelApprovedForHighRisk), sent on the turn's
 * record status as `servedBy`; this applies it, and fails closed on anything
 * it cannot read.
 */
import { describe, it, expect } from 'vitest';

import { anaInsertRefusal } from '../anaInsertGate';
import type { AnaServedModel, AnaTurnRecordStatus } from '../../../components/ana/useAnaChat.types';

const SHA = 'a'.repeat(64);
const OPUS: AnaServedModel = { provider: 'anthropic', model: 'claude-opus-5-5', qualified: true, approvedForHighRisk: true, pq: 'passed' };
const SONNET: AnaServedModel = { provider: 'anthropic', model: 'claude-sonnet-5', qualified: false, approvedForHighRisk: false, pq: 'pending' };
const OPUS_PQ_PENDING: AnaServedModel = { ...OPUS, qualified: false, pq: 'pending' };
const recorded = (servedBy?: AnaServedModel[]): AnaTurnRecordStatus => ({ status: 'recorded', id: 'rec-1', sha256: SHA, ...(servedBy ? { servedBy } : {}) });

describe('anaInsertRefusal', () => {
  it('admits an answer every model of which may write governed content', () => {
    expect(anaInsertRefusal(recorded([OPUS]))).toBeNull();
  });

  it('refuses an answer a model not approved for regulatory drafting wrote, naming it and the remedy', () => {
    expect(anaInsertRefusal(recorded([SONNET]))).toBe(
      'Written by claude-sonnet-5, which is not approved for regulatory drafting. Ask again with Thorough effort to have an approved model write it.',
    );
  });

  it('refuses when any one of the models that wrote it is not admitted, and says it wrote part', () => {
    expect(anaInsertRefusal(recorded([OPUS, SONNET]))).toMatch(/^Written in part by claude-sonnet-5, which is not approved/);
  });

  it('refuses an approved model whose PQ has not passed, without offering a remedy that cannot work', () => {
    const why = anaInsertRefusal(recorded([OPUS_PQ_PENDING]));
    expect(why).toBe(
      'Written by claude-opus-5-5, which has not passed its performance qualification (PQ). Only a PQ-passed model may write text for a document here.',
    );
    expect(why).not.toMatch(/Thorough/);
  });

  it('refuses a model the record does not name, even one marked qualified', () => {
    const unnamed: AnaServedModel = { provider: 'anthropic', model: null, qualified: false, approvedForHighRisk: null, pq: null };
    const why = 'One of the models that wrote this answer is not named on its record, so it cannot go into a document as AnA’s text.';
    expect(anaInsertRefusal(recorded([OPUS, unnamed]))).toBe(why);
    expect(anaInsertRefusal(recorded([OPUS, { ...unnamed, qualified: true }]))).toBe(why);
  });

  it('fails closed on everything that does not say which models wrote it', () => {
    const askAgain = /Ask again for an answer you can insert\.$/;
    expect(anaInsertRefusal(recorded())).toMatch(/^This answer’s record does not say which model wrote it\./);
    expect(anaInsertRefusal(recorded([]))).toMatch(/^This answer’s record does not say which model wrote it\./);
    expect(anaInsertRefusal({ status: 'not_recorded', reason: 'x' })).toMatch(/^This answer’s record was not filed/);
    expect(anaInsertRefusal({ status: 'unconfirmed' })).toMatch(/^Whether this answer’s record was filed is not confirmed/);
    expect(anaInsertRefusal(undefined)).toMatch(/^Which model wrote this answer is not on record here/);
    for (const r of [recorded(), { status: 'not_recorded', reason: 'x' } as const, { status: 'unconfirmed' } as const, undefined]) {
      expect(anaInsertRefusal(r)).toMatch(askAgain);
    }
  });
});
