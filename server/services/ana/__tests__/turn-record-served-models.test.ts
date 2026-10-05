/**
 * Which models wrote a turn, read from its record, and whether RULE 2 lets
 * their text stand as governed content (AnA reasoning round 10, GRD-missed,
 * 2026-10-05).
 *
 * A turn's record names the model of every call (model.calls) and, separately,
 * the first call's model (model.model). The one reader of a record's models
 * (machine-claim-verify) read model.model: the first call's. A turn whose
 * later round fell back to another model was filed as written by the first.
 * servedModelsOf is now the one reader; qualifyServedModels applies RULE 2's
 * drafting predicate to each model it names.
 */
import { describe, it, expect } from 'vitest';

import { openTurnRecorder } from '../turn-record';
import { servedModelsOf } from '../turn-record-models';
import { qualifyServedModels } from '../../ai-governance/approved-models';

const recorder = () => openTurnRecorder({ orgId: 7, userId: 3, typed: 'Draft the efficacy overview for 2.5.4' })!;

describe('servedModelsOf: every model that served the turn', () => {
  it('is each distinct model in the order it first served, not the first call alone', () => {
    const r = recorder();
    r.setModel({ provider: 'anthropic', model: 'claude-opus-5-5' });
    r.addServed(1, { provider: 'anthropic', model: 'claude-opus-5-5' });
    r.addServed(2, { provider: 'anthropic', model: 'claude-sonnet-5' });
    r.addServed(3, { provider: 'anthropic', model: 'claude-opus-5-5' });
    const { body } = r.seal('answered');
    expect(servedModelsOf(body.model)).toEqual([
      { provider: 'anthropic', model: 'claude-opus-5-5' },
      { provider: 'anthropic', model: 'claude-sonnet-5' },
    ]);
  });

  it('keeps a call whose model the gateway did not report: an unknown author is still an author', () => {
    const r = recorder();
    r.addServed(1, { provider: 'anthropic', model: 'claude-opus-5-5' });
    r.addServed(2, { provider: 'anthropic', model: null });
    expect(servedModelsOf(r.seal('answered').body.model)).toEqual([
      { provider: 'anthropic', model: 'claude-opus-5-5' },
      { provider: 'anthropic', model: null },
    ]);
  });

  it('falls back to the turn\'s one model where the door records no calls, and is empty where it names none', () => {
    const loop = recorder();
    loop.setModel({ provider: 'openai', model: 'gpt-4o' });
    expect(servedModelsOf(loop.seal('answered').body.model)).toEqual([{ provider: 'openai', model: 'gpt-4o' }]);
    expect(servedModelsOf(recorder().seal('failed').body.model)).toEqual([]);
    expect(servedModelsOf(undefined)).toEqual([]);
  });
});

describe('qualifyServedModels: RULE 2, per model', () => {
  const served = [
    { provider: 'anthropic', model: 'claude-opus-5-5' },
    { provider: 'anthropic', model: 'claude-sonnet-5' },
    { provider: 'anthropic', model: 'model-x' },
    { provider: null, model: 'claude-opus-5-5' },
  ];

  it('outside production: approved for high-risk work, whatever its PQ, and the facts it rests on', () => {
    expect(qualifyServedModels(served, { NODE_ENV: 'development' })).toEqual([
      { provider: 'anthropic', model: 'claude-opus-5-5', qualified: true, approvedForHighRisk: true, pq: 'pending' },
      { provider: 'anthropic', model: 'claude-sonnet-5', qualified: false, approvedForHighRisk: false, pq: 'pending' },
      { provider: 'anthropic', model: 'model-x', qualified: false, approvedForHighRisk: null, pq: null },
      { provider: null, model: 'claude-opus-5-5', qualified: false, approvedForHighRisk: null, pq: null },
    ]);
  });

  it('in production: only a passed PQ, so a PQ-pending approved model is not qualified', () => {
    expect(qualifyServedModels(served, { NODE_ENV: 'production' }).map((m) => m.qualified)).toEqual([false, false, false, false]);
  });
});
