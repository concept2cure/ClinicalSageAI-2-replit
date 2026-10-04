/**
 * AnA's answer grounding checks the regulations the answer cites.
 *
 * verifyAnswerGrounding compared trial, literature and FDA-submission
 * identifiers in the answer with the turn's tool evidence, but not a CFR
 * section or an ICH guideline code. After tools ran, "21 CFR 820.30(g)" —
 * superseded by the QMSR — or "ICH E9(R1)" cited from memory read as grounded
 * as anything else. A regulation can be recalled correctly, so a miss is
 * "not supported by this turn's evidence", advisory like every other kind.
 */
import { describe, expect, it } from 'vitest';
import { verifyAnswerGrounding } from '../../server/services/ana/answer-grounding';

const EVIDENCE = JSON.stringify({
  guideline: { code: 'E6(R3)', title: 'Good Clinical Practice (GCP)' },
  text: 'The IND content requirements are in 21 C.F.R. § 312.23; electronic records fall under 21 CFR Part 11.',
});

describe('verifyAnswerGrounding — regulations', () => {
  it('flags a CFR section the evidence does not hold', () => {
    const r = verifyAnswerGrounding('Design controls are in 21 CFR 820.30(g).', EVIDENCE);
    expect(r.unsupported).toEqual([{ kind: 'cfr', text: '21 CFR 820.30(g)' }]);
  });

  it('grounds a CFR section the evidence holds, whatever the spelling', () => {
    const r = verifyAnswerGrounding('Per 21 CFR 312.23 and 21 CFR Part 11, the IND must …', EVIDENCE);
    expect(r.unsupported).toEqual([]);
    expect(r.checked).toBe(2);
    expect(r.grounded).toBe(2);
  });

  it('flags an ICH code the evidence does not hold, and grounds one it does', () => {
    const r = verifyAnswerGrounding('Follow ICH E6(R3) and the estimand framework of ICH E9(R1).', EVIDENCE);
    expect(r.unsupported).toEqual([{ kind: 'ich', text: 'ICH E9(R1)' }]);
    expect(r.grounded).toBe(1);
  });

  it('reads a revisioned code without the ICH prefix, and leaves a bare letter-number alone', () => {
    const r = verifyAnswerGrounding('E9(R1) applies. Step E2 of the process follows.', EVIDENCE);
    expect(r.unsupported).toEqual([{ kind: 'ich', text: 'E9(R1)' }]);
    expect(r.checked).toBe(1);
  });

  it('is still a no-op when no tools ran', () => {
    expect(verifyAnswerGrounding('See 21 CFR 820.30(g) and ICH E9(R1).', '')).toEqual({
      checked: 0,
      grounded: 0,
      unsupported: [],
      ratio: 1,
    });
  });
});
