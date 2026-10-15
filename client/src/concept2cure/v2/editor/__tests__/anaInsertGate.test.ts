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
 *
 * Round 13 (round 11's UI review) rewrote what a refusal says. It had sent the
 * person to "Ask again with Thorough effort", a control neither host draws,
 * and that in production ends in a second refusal. It said a record "does not
 * say" which model wrote an answer when only this view had not been told. And
 * it let an answer that did not finish go in as one that did.
 */
import { describe, it, expect } from 'vitest';

import { anaInsertRefusal, answerUnfinished } from '../anaInsertGate';
import type { AnaChatMessage, AnaServedModel, AnaTurnRecordStatus } from '../../../components/ana/useAnaChat.types';

const SHA = 'a'.repeat(64);
const OPUS: AnaServedModel = { provider: 'anthropic', model: 'claude-opus-5-5', qualified: true, approvedForHighRisk: true, pq: 'passed' };
const SONNET: AnaServedModel = { provider: 'anthropic', model: 'claude-sonnet-5', qualified: false, approvedForHighRisk: false, pq: 'pending' };
const OPUS_PQ_PENDING: AnaServedModel = { ...OPUS, qualified: false, pq: 'pending' };
const UNNAMED: AnaServedModel = { provider: 'anthropic', model: null, qualified: false, approvedForHighRisk: null, pq: null };
const recorded = (servedBy?: AnaServedModel[]): AnaTurnRecordStatus => ({ status: 'recorded', id: 'rec-1', sha256: SHA, ...(servedBy ? { servedBy } : {}) });
const ASK_AGAIN = 'Ask again to get an answer with its own record.';

describe('anaInsertRefusal', () => {
  it('admits a finished answer every model of which may write governed content', () => {
    expect(anaInsertRefusal(recorded([OPUS]), false)).toBeNull();
  });

  it('a caller must say whether the answer finished, rather than getting "it did" by default', () => {
    /* A compile-time assertion: this line type-checks only while the flag is
       REQUIRED. The rule is fail closed, and an optional flag defaulting to
       "finished" is the one shape that silently admits an unfinished answer. */
    // @ts-expect-error the second argument is required.
    anaInsertRefusal(recorded([OPUS]));
  });

  it('refuses an answer a model not approved for regulatory drafting wrote, naming it, with no remedy the screen cannot carry out', () => {
    const why = anaInsertRefusal(recorded([SONNET]), false);
    expect(why).toBe('This answer was written by claude-sonnet-5, which is not approved for regulatory drafting, so the answer can’t be inserted.');
    expect(why).not.toMatch(/Thorough|effort/);
  });

  it('refuses when any one of the models that worked on it is not admitted, without saying which words it wrote', () => {
    expect(anaInsertRefusal(recorded([OPUS, SONNET]), false)).toBe(
      'More than one model worked on this answer, including claude-sonnet-5, which is not approved for regulatory drafting, so the answer can’t be inserted.',
    );
  });

  it('refuses an approved model whose performance qualification has not passed, and says asking again will not change that', () => {
    const why = anaInsertRefusal(recorded([OPUS_PQ_PENDING]), false);
    expect(why).toBe(
      'This answer was written by claude-opus-5-5, which has not passed performance qualification, so the answer can’t be inserted. Asking again will not change that.',
    );
    expect(why).not.toMatch(/\bPQ\b/);
  });

  it('refuses a model the record does not name, even one marked qualified, one model or several', () => {
    expect(anaInsertRefusal(recorded([UNNAMED]), false)).toBe(
      `The record does not name the model that wrote this answer, so the answer can’t be inserted. ${ASK_AGAIN}`,
    );
    const several = `The record does not name one of the models that worked on this answer, so the answer can’t be inserted. ${ASK_AGAIN}`;
    expect(anaInsertRefusal(recorded([OPUS, UNNAMED]), false)).toBe(several);
    expect(anaInsertRefusal(recorded([OPUS, { ...UNNAMED, qualified: true }]), false)).toBe(several);
  });

  it('says what this view was not told apart from what the record says: no list is not an empty one', () => {
    // Not told is this PAGE's limit, not a fact about the record: the server holds it.
    const notTold = `This page has no record of which model wrote this answer, so the answer can’t be inserted. ${ASK_AGAIN}`;
    expect(anaInsertRefusal(undefined, false)).toBe(notTold);
    expect(anaInsertRefusal(recorded(), false)).toBe(notTold);
    // An empty list IS a fact about the record, and reads as one.
    expect(anaInsertRefusal(recorded([]), false)).toBe(`This answer’s record names no model, so the answer can’t be inserted. ${ASK_AGAIN}`);
  });

  it('fails closed on a record that was not made or not confirmed, in the activity strip’s own words', () => {
    expect(anaInsertRefusal({ status: 'not_recorded', reason: 'x' }, false)).toBe(
      `This answer was not recorded, so the model that wrote it can’t be checked and the answer can’t be inserted. ${ASK_AGAIN}`,
    );
    expect(anaInsertRefusal({ status: 'unconfirmed' }, false)).toBe(
      `This answer’s record is not confirmed, so the model that wrote it can’t be checked and the answer can’t be inserted. ${ASK_AGAIN}`,
    );
  });

  it('refuses an answer that did not finish before anything else, however it was recorded', () => {
    const why = 'This answer did not finish, so it can’t be inserted. Ask again to get a complete answer.';
    expect(anaInsertRefusal(recorded([OPUS]), true)).toBe(why);
    expect(anaInsertRefusal(recorded([SONNET]), true)).toBe(why);
    expect(anaInsertRefusal(undefined, true)).toBe(why);
  });
});

describe('answerUnfinished', () => {
  const turn = (over: Partial<AnaChatMessage>): AnaChatMessage => ({ id: 'a1', role: 'assistant', text: 'ORR was 31%.', ...over }) as AnaChatMessage;

  it('a stop, a failed stream, a cut-short phase, a cancelled run or an answer cut off is unfinished text', () => {
    expect(answerUnfinished(turn({ stopped: true }))).toBe(true);
    expect(answerUnfinished(turn({ interrupted: true }))).toBe(true);
    expect(answerUnfinished(turn({ stoppedReason: 'cancelled' }))).toBe(true);
    expect(answerUnfinished(turn({ stoppedReason: 'answer_cut_off' }))).toBe(true);
    // Reloaded after the connection dropped: the saved text is what had streamed.
    expect(answerUnfinished(turn({ stoppedReason: 'client_disconnected' }))).toBe(true);
    expect(answerUnfinished(turn({ progress: [{ phase: 'answering', label: 'Answering', status: 'stopped', startedAt: 0 }] }))).toBe(true);
  });

  it('a finished answer, and one the loop forced to an end, is whole text (negative control)', () => {
    expect(answerUnfinished(turn({}))).toBe(false);
    expect(answerUnfinished(turn({ stoppedReason: 'max_rounds' }))).toBe(false);
    expect(answerUnfinished(turn({ stoppedReason: 'no_more_tools' }))).toBe(false);
    expect(answerUnfinished(turn({ progress: [{ phase: 'answering', label: 'Answering', status: 'done', startedAt: 0 }] }))).toBe(false);
  });
});
