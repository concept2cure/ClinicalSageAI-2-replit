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

describe('servedModelsOf: a malformed record body yields a verdict, never a fault', () => {
  /* Round 15 made this function load-bearing on a WRITE path: the three server
     doors of SEC-A-7 read it through servedModelsForTurn to decide whether
     RULE 2 admits a document's prose, and authoring-record.ts's own comments
     say that path must not fault — a failed statement aborts the transaction
     the write is being checked for, and an unhandled throw is a 500 instead of
     a recorded verdict.
     A record body is written by our own writer and hash-checked by a table
     CHECK, so these shapes mean a corrupt or hand-written row. The point is
     not that they are likely; it is that the answer to one must be a verdict
     the doors can refuse on. Each of these threw or invented an entry. */
  it('tolerates a `calls` that is not an array', () => {
    expect(servedModelsOf({ calls: 'anthropic' } as never)).toEqual([]);
    expect(servedModelsOf({ calls: { length: 2 } } as never)).toEqual([]);
    expect(servedModelsOf({ calls: 42 } as never)).toEqual([]);
  });

  it('falls back to the turn’s own model when `calls` is unusable', () => {
    /* The shape that matters: a body whose call list is corrupt but which does
       name the model that served the turn. Dropping to [] there would make the
       doors refuse a turn the record can still speak for. */
    expect(servedModelsOf({ calls: 'bad', provider: 'anthropic', model: 'claude-opus-5-5' } as never)).toEqual([
      { provider: 'anthropic', model: 'claude-opus-5-5' },
    ]);
  });

  it('skips a call that is not an object instead of throwing on it', () => {
    expect(servedModelsOf({ calls: [null] } as never)).toEqual([]);
    expect(servedModelsOf({ calls: ['claude-opus-5-5'] } as never)).toEqual([]);
    expect(servedModelsOf({ calls: [null, { provider: 'anthropic', model: 'claude-opus-5-5' }] } as never)).toEqual([
      { provider: 'anthropic', model: 'claude-opus-5-5' },
    ]);
  });

  it('a call whose model the gateway did not report still counts as an unknown author', () => {
    /* Not a malformed shape — the documented case, and it must keep working:
       an unknown author is what the doors refuse on. */
    expect(servedModelsOf({ calls: [{ provider: 'anthropic' }] } as never)).toEqual([
      { provider: 'anthropic', model: null },
    ]);
  });
});
