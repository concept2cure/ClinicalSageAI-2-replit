/**
 * The attribution gate on the RAG eval harness.
 *
 * A RAG run becomes performance-qualification evidence only when the numbers
 * can be pinned to a named model. Two things have to be true: the model that
 * ANSWERED is named, and the model that GRADED is named and is not the one
 * being graded. `pqAttributionGaps` is the single place that decides, and
 * run-eval.ts prints its output verbatim, so these cases are the ones that
 * keep an unattributable run from reading as a PQ pass.
 *
 * Importing the harness is safe: run-eval.ts only calls main() when it is the
 * process entrypoint.
 */

import { describe, it, expect } from 'vitest';
import { pqAttributionGaps, buildQueryParams, buildJudgeRequest } from '../run-eval';

describe('pqAttributionGaps', () => {
  it('reports no gaps when the generator and a different judge are both pinned', () => {
    expect(pqAttributionGaps({ model: 'claude-opus-4', judgeModel: 'claude-sonnet-4-5' })).toEqual(
      []
    );
  });

  it('refuses a run with no pinned generator — the answer is unattributable', () => {
    const gaps = pqAttributionGaps({ model: null, judgeModel: 'claude-sonnet-4-5' });
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toContain('--model not set');
  });

  it('refuses a run with no pinned judge — an unpinned model graded it', () => {
    const gaps = pqAttributionGaps({ model: 'claude-opus-4', judgeModel: null });
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toContain('--judge-model not set');
  });

  it('refuses self-grading: the same model cannot answer and judge', () => {
    const gaps = pqAttributionGaps({ model: 'claude-opus-4', judgeModel: 'claude-opus-4' });
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toContain('cannot grade itself');
    expect(gaps[0]).toContain('claude-opus-4');
  });

  it('reports BOTH gaps for a bare run — the default invocation', () => {
    // `tsx run-eval.ts --min-hit-rate 0.6` pins nothing. It is a valid
    // regression run and an invalid qualification, and must say so.
    expect(pqAttributionGaps({ model: null, judgeModel: null })).toHaveLength(2);
  });

  it('does not treat an empty string as a pin', () => {
    // `--model` with a missing value parses to '' rather than undefined.
    // Falling through as "pinned" would attribute a run to no model at all.
    expect(pqAttributionGaps({ model: '', judgeModel: '' })).toHaveLength(2);
  });
});

/**
 * pqAttributionGaps reads the flags. These assert the pin reaches the call —
 * the difference between "the operator asked for model X" and "model X
 * answered". Only the second justifies the printed attestation.
 */
describe('the pinned model reaches the call it is supposed to pin', () => {
  it('forwards --model to the retrieval/generation call', () => {
    const params = buildQueryParams('what does ICH E3 section 10 require?', {
      model: 'claude-opus-4',
      k: 5,
    });
    expect(params.model).toBe('claude-opus-4');
    expect(params.query).toBe('what does ICH E3 section 10 require?');
  });

  it('omits model entirely when unpinned, rather than sending undefined', () => {
    // An explicit `model: undefined` key is not the same as no key: it can
    // override a default further down. Existing callers must be untouched.
    const params = buildQueryParams('q', { model: null, k: 5 });
    expect('model' in params).toBe(false);
  });

  it('forwards --judge-model to the judge call', () => {
    const req = buildJudgeRequest('grade this', { judgeModel: 'claude-sonnet-4-5' });
    expect(req.model).toBe('claude-sonnet-4-5');
    expect(req.temperature).toBe(0);
  });

  it('omits model from the judge call when unpinned', () => {
    expect('model' in buildJudgeRequest('grade this', { judgeModel: null })).toBe(false);
  });
});
