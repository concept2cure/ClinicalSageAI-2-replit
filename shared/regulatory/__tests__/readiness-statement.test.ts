import { describe, expect, it } from 'vitest';
import {
  criticalGapCountLabel,
  mayCallReady,
  readinessClaim,
  readinessPredicate,
  readinessQualifier,
  readinessSentence,
} from '../readiness-statement';

/* THE CASE THIS MODULE EXISTS FOR.
   `evaluateReadiness` scores section completion alone when the filing type has
   no resolved required-artifact matrix, and raises a `critical` gap saying so.
   The run then arrives at every surface as readiness 100, criticalBlockerCount
   1, status 'missing'. The Reporting canvas read "BX-204 is 100% ready"
   (HS-1008-1, honest-state review 2026-10-08). */
const UNASSESSED_ARTIFACT_HALF = { readiness: 100, criticalBlockerCount: 1, status: 'missing' };

describe('readinessClaim', () => {
  it('refuses to call a 100% score ready while a critical gap is outstanding', () => {
    expect(readinessClaim(UNASSESSED_ARTIFACT_HALF)).toEqual({
      kind: 'qualified',
      percent: 100,
      criticalGaps: 1,
    });
    expect(mayCallReady(UNASSESSED_ARTIFACT_HALF)).toBe(false);
    expect(readinessPredicate(UNASSESSED_ARTIFACT_HALF)).not.toContain('ready');
  });

  it('permits ready only with a score and a zero gap count', () => {
    expect(readinessClaim({ readiness: 100, criticalBlockerCount: 0 })).toEqual({ kind: 'clear', percent: 100 });
    expect(mayCallReady({ readiness: 100, criticalBlockerCount: 0 })).toBe(true);
    expect(readinessPredicate({ readiness: 72, criticalBlockerCount: 0 })).toBe('is 72% ready');
  });

  /* NOTHING-READ IS NOT ZERO. A read-model that does not carry the gap count
     has not told us there are none, so it buys no reassurance — the old client
     types declared the field and never read it, which is how the bare
     percentage survived three reviews. */
  it('treats a missing gap count as unknown, not as zero', () => {
    expect(readinessClaim({ readiness: 88 })).toEqual({ kind: 'gaps-unknown', percent: 88 });
    expect(mayCallReady({ readiness: 88 })).toBe(false);
    expect(readinessPredicate({ readiness: 88 })).toContain('was not read');
    expect(readinessClaim({ readiness: 88, criticalBlockerCount: null })).toEqual({
      kind: 'gaps-unknown',
      percent: 88,
    });
  });

  it('says not computed for an absent or unreadable score, and never 0%', () => {
    for (const facts of [{ readiness: null }, { readiness: undefined }, { readiness: Number.NaN }]) {
      expect(readinessClaim(facts).kind).toBe('not-computed');
      expect(readinessPredicate(facts)).toBe('has no computed submission readiness');
      expect(readinessPredicate(facts)).not.toContain('0%');
    }
  });

  it('scores 0% as a real measurement, not as absent', () => {
    expect(readinessClaim({ readiness: 0, criticalBlockerCount: 0 })).toEqual({ kind: 'clear', percent: 0 });
    expect(readinessPredicate({ readiness: 0, criticalBlockerCount: 0 })).toBe('is 0% ready');
  });
});

describe('wording', () => {
  it('pluralises the gap count', () => {
    expect(criticalGapCountLabel(1)).toBe('1 critical gap');
    expect(criticalGapCountLabel(3)).toBe('3 critical gaps');
  });

  it('builds a sentence that names the program and states the gaps', () => {
    expect(readinessSentence('BX-204', UNASSESSED_ARTIFACT_HALF)).toBe(
      'BX-204 scores 100% on submission readiness, with 1 critical gap outstanding.',
    );
    expect(readinessSentence('BX-204', { readiness: 100, criticalBlockerCount: 0 })).toBe('BX-204 is 100% ready.');
  });

  it('qualifies a figure shown on its own, and adds nothing when clear', () => {
    expect(readinessQualifier(UNASSESSED_ARTIFACT_HALF)).toBe('1 critical gap outstanding');
    expect(readinessQualifier({ readiness: 60, criticalBlockerCount: 2 })).toBe('2 critical gaps outstanding');
    expect(readinessQualifier({ readiness: 60, criticalBlockerCount: 0 })).toBeNull();
    expect(readinessQualifier({ readiness: 60 })).toBe('critical-gap count not read');
    expect(readinessQualifier({ readiness: null })).toBe('not computed');
  });
});
