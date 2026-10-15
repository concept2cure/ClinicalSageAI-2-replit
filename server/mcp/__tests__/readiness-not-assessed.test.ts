/**
 * c2c_assess_sequence_readiness says which gates cleared without assessing what
 * they guard. A model narrating "dispatch gate CLEAR" over a Shadow Review
 * waived by signature (P-34), an advisory external validator or an IND clinical
 * hold (P-33) would report a check that never ran as passed.
 */
import { describe, expect, it } from 'vitest';
import { notAssessedOf } from '../tools/readiness';

describe('notAssessedOf', () => {
  it('carries every cleared gate’s note verbatim, in gate order', () => {
    expect(
      notAssessedOf([
        { key: 'structural', cleared: true, notAssessed: 'Whether the IND is on clinical hold is not assessed here.' },
        { key: 'external', cleared: true },
        { key: 'shadowPresence', cleared: true, notAssessed: 'Shadow Review waived under signature 41 by Dana Reyes.' },
        { key: 'releaseSignature', cleared: true },
      ]),
    ).toEqual([
      { gate: 'structural', note: 'Whether the IND is on clinical hold is not assessed here.' },
      { gate: 'shadowPresence', note: 'Shadow Review waived under signature 41 by Dana Reyes.' },
    ]);
  });

  it('a blocked gate is reported by its blockers, never as not assessed; an empty note is no note', () => {
    expect(
      notAssessedOf([
        { key: 'shadowPresence', cleared: false, notAssessed: 'stale' },
        { key: 'external', cleared: true, notAssessed: '  ' },
      ]),
    ).toEqual([]);
  });
});
