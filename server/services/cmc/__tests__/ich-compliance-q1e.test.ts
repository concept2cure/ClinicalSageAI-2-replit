/**
 * ICH Q1E: the shelf-life claim against the data on file.
 *
 * The cases that matter are the ones a careless parser gets wrong. A storage
 * condition reads "25C/60%RH"; a rule that took the first integer it saw would
 * report a 25-month claim the register never made, and a 24-month claim would
 * then look like an extrapolation. So the parser's refusals are tested as
 * hard as its successes, and every refusal is `not_evaluated` — never a pass.
 */
import { describe, it, expect } from 'vitest';
import {
  checkQ1E, monthsIn, latestTimePoint, longTermCoverage, statedClaim, q1eCeiling,
  isLongTerm, isAccelerated, scopeOf,
} from '../ich-compliance-q1e';
import type { ProgramStage, ProjectInputs } from '../ich-compliance-rules';

const EMPTY: ProjectInputs = {
  specs: [], methods: [], stability: [], drugSubs: [], processes: [], sourceObjects: [], sections: [],
};

const IND: ProgramStage = { application: 'clinical_trial', phase: 1, basis: 'program_type ind' };
const NDA: ProgramStage = { application: 'marketing', phase: 3, basis: 'program_type nda' };

/** A long-term study covering `months`, claiming `claim`. */
const longTerm = (months: number, claim?: string) => ({
  studyName: `LT-${months}`,
  studyType: 'long_term',
  storageCondition: '25C/60%RH',
  duration: String(months),
  timePoints: '0,3,6,12',
  shelfLifeClaim: claim ?? '',
});
const accelerated = () => ({
  studyName: 'ACC-6', studyType: 'accelerated', storageCondition: '40C/75%RH',
  duration: '6', timePoints: '0,3,6', shelfLifeClaim: '',
});

const of = (stability: Array<Record<string, unknown>>, stage?: ProgramStage | null): ProjectInputs =>
  ({ ...EMPTY, stability, ...(stage === undefined ? {} : { stage }) });

const ruleIds = (f: ReturnType<typeof checkQ1E>) => f.map((x) => x.ruleId);
const statuses = (f: ReturnType<typeof checkQ1E>) => f.map((x) => x.status);

describe('monthsIn — a period, or nothing', () => {
  it('reads a number with a unit, and a bare number as months', () => {
    expect(monthsIn('24 months')).toBe(24);
    expect(monthsIn('24')).toBe(24);
    expect(monthsIn('2 years')).toBe(24);
    expect(monthsIn('18 mo')).toBe(18);
    expect(monthsIn('52 weeks')).toBe(12);
    expect(monthsIn('24 months at 25C/60%RH (proposed)')).toBe(24);
  });

  it('refuses a storage condition, a percentage and a temperature', () => {
    /* The whole reason this function exists: "25" here is a temperature. */
    expect(monthsIn('25C/60%RH')).toBeNull();
    expect(monthsIn('40°C/75% RH')).toBeNull();
    expect(monthsIn('')).toBeNull();
    expect(monthsIn(null)).toBeNull();
    expect(monthsIn('to be determined')).toBeNull();
  });

  it('does not read the temperature out of a condition that also names a period', () => {
    /* "25C/60%RH for 24 months" must be 24, not 25: the unit decides. */
    expect(monthsIn('25C/60%RH for 24 months')).toBe(24);
  });
});

describe('latestTimePoint and longTermCoverage', () => {
  it('takes the furthest time point', () => {
    expect(latestTimePoint('0,3,6,12,24')).toBe(24);
    expect(latestTimePoint('0 3 6')).toBe(6);
    expect(latestTimePoint('')).toBeNull();
  });

  it('reads coverage from the long-term studies only, and takes the furthest', () => {
    expect(longTermCoverage([longTerm(12), longTerm(24), accelerated()])).toBe(24);
    /* An accelerated study on its own covers no long-term period. */
    expect(longTermCoverage([accelerated()])).toBeNull();
  });

  it('is null when no long-term study states a period that parses', () => {
    expect(longTermCoverage([{ ...longTerm(12), duration: 'ongoing', timePoints: 'TBD' }])).toBeNull();
  });
});

describe('statedClaim — the largest claim, because it is the one the dossier carries', () => {
  it('takes the largest readable claim and names its study', () => {
    const claim = statedClaim([longTerm(24, '18 months'), longTerm(24, '36 months')]);
    expect(claim.months).toBe(36);
    expect((claim as { study: string }).study).toBe('LT-24');
  });

  it('names a study with no recorded title rather than leaving the evidence blank', () => {
    /* The register's study title is nullable, and `?? 'unnamed'` does not
       catch the empty string: an evidence line read "(24 months, )". */
    const claim = statedClaim([{ ...longTerm(24, '24 months'), studyName: '' }]);
    expect((claim as { study: string }).study).toBe('a study with no recorded title');
  });

  it('reports the unreadable claims rather than ignoring them', () => {
    const claim = statedClaim([longTerm(24, 'TBD at 25C')]);
    expect(claim.months).toBeNull();
    expect((claim as { raw: string[] }).raw).toEqual(['TBD at 25C']);
  });
});

describe('q1eCeiling — twice the data, never more than 12 months beyond', () => {
  it('is 2x for short coverage and +12 for long', () => {
    expect(q1eCeiling(6)).toBe(12);
    expect(q1eCeiling(12)).toBe(24);
    expect(q1eCeiling(24)).toBe(36);
    expect(q1eCeiling(36)).toBe(48);
  });
});

/**
 * Seven ways the first version of this rule got a verdict wrong, found by
 * probing it with register-shaped text rather than by reading it
 * (docs/evidence/CMC-M3-GA/2026-10-18/06-ich-q1e-verdict/). Three of them
 * produced a PASS over a claim nobody had evaluated, which is the one outcome
 * a compliance verdict must never fabricate.
 */
describe('the seven defects the first version had', () => {
  it('1. a four-digit claim is refused, not truncated to a passing number', () => {
    /* "1000 months" matched as "000 months" and returned 0, so a nonsense claim
       came back inside any coverage and PASSED. */
    expect(monthsIn('1000 months')).toBeNull();
    const f = checkQ1E(of([longTerm(24, '1000 months'), accelerated()], NDA));
    expect(statuses(f)).toEqual(['not_evaluated']);
    expect(ruleIds(f)).toEqual(['Q1E_CLAIM_NOT_READABLE']);
  });

  it('2. a fractional period keeps its fraction', () => {
    /* The decimal was matched and discarded: half a year was no months at all,
       and eighteen months was twelve. */
    expect(monthsIn('1.5 years')).toBe(18);
    expect(monthsIn('0.5 years')).toBe(6);
    expect(monthsIn('2.5 years')).toBe(30);
  });

  it('3. an unreadable claim defeats the verdict even beside a readable one', () => {
    /* The readable claim was judged and the other dropped, so a programme
       stating "12 months" and "thirty-six months" was judged on the 12 and
       PASSED. The dropped text may state the larger period. */
    const studies = [longTerm(12, '12 months'), { ...longTerm(12, 'thirty-six months'), studyName: 'LT-12b' }];
    expect(statedClaim(studies).months).toBeNull();
    const f = checkQ1E(of(studies, NDA));
    expect(ruleIds(f)).toEqual(['Q1E_CLAIM_NOT_READABLE']);
    expect(f[0].evidence.join(' ')).toMatch(/thirty-six months/);
  });

  it('4. a refrigerated product is judged on its 5C data, not its 25C accelerated study', () => {
    /* ICH Q1A(R2) §2.2.7.3: for a product stored in a refrigerator the
       long-term condition is 5C and the ACCELERATED condition is 25C/60% RH.
       Matching 25C as long-term made the coverage the accelerated study's 6
       months, and a correct 24-month claim came back `fail`. */
    const fridge = [
      { studyName: 'LT-5C', studyType: 'primary stability', storageCondition: 'LT, 5°C ± 3°C', duration: '24', timePoints: '0, 3, 6, 12, 24', shelfLifeClaim: '24 months' },
      { studyName: 'ACC-25C', studyType: 'accelerated', storageCondition: 'ACC, 25°C ± 2°C / 60% ± 5% RH', duration: '6', timePoints: '0, 3, 6', shelfLifeClaim: '' },
    ];
    expect(isLongTerm(fridge[0])).toBe(true);
    expect(isLongTerm(fridge[1])).toBe(false);
    expect(isAccelerated(fridge[1])).toBe(true);
    expect(longTermCoverage(fridge)).toBe(24);
    expect(ruleIds(checkQ1E(of(fridge, NDA)))).toEqual(['Q1E_CLAIM_WITHIN_DATA']);
  });

  it('5. an intermediate 30C study is not long-term coverage', () => {
    /* 30C/65% RH is the INTERMEDIATE condition in zones I and II. Counting it
       as long-term let a 12-month intermediate study justify a 12-month claim
       with no long-term data at all, and it PASSED. */
    const inter = [{
      studyName: 'INT-12', studyType: 'intermediate', storageCondition: 'INT, 30°C ± 2°C / 65% ± 5% RH',
      duration: '12', timePoints: '0, 3, 6, 9, 12', shelfLifeClaim: '12 months',
    }];
    expect(isLongTerm(inter[0])).toBe(false);
    expect(longTermCoverage(inter)).toBeNull();
    expect(statuses(checkQ1E(of(inter, NDA)))).toEqual(['not_evaluated']);
  });

  it('6. a drug substance re-test period is judged on the substance\u2019s own data', () => {
    /* Q1A(R2)/Q1E treat them separately: a substance has a re-test period on
       its own studies, a product a shelf life on its own. The largest claim won
       whatever it belonged to, so a 36-month DS re-test period was compared
       with the product\u2019s 24 months of coverage and a compliant pair failed. */
    const both = [
      { studyName: 'DS', studyType: 'long-term', storageCondition: '25C/60%RH', duration: '36', timePoints: '0,6,12,24,36', shelfLifeClaim: '36 months', scope: 'DS' },
      { studyName: 'DP', studyType: 'long-term', storageCondition: '25C/60%RH', duration: '24', timePoints: '0,3,6,12,24', shelfLifeClaim: '24 months', scope: 'DP' },
      { studyName: 'DP acc', studyType: 'accelerated', storageCondition: '40C/75%RH', duration: '6', timePoints: '0,3,6', shelfLifeClaim: '', scope: 'DP' },
    ];
    expect(scopeOf(both[0])).toBe('DS');
    expect(scopeOf(both[1])).toBe('DP');
    expect(scopeOf({ studyName: 'x' })).toBe('unstated');
    const f = checkQ1E(of(both, NDA));
    expect(statuses(f)).toEqual(['pass', 'pass']);
    /* ...and each says which scope it speaks for, since there is more than one. */
    expect(f.map((x) => x.message).join(' ')).toMatch(/drug substance/);
    expect(f.map((x) => x.message).join(' ')).toMatch(/drug product/);
  });

  it('7. a JSON-shaped time-point list is read, not understated', () => {
    /* The brackets stayed attached to the first and last token, so "[0" and
       "24]" read as no period and the coverage came back 12 — inventing an
       extrapolation out of a complete study. */
    expect(latestTimePoint('[0,3,6,12,24]')).toBe(24);
    expect(monthsIn('(24 months)')).toBe(24);
  });

  it('refuses a shelf life no product has, rather than judging it', () => {
    expect(monthsIn('900 months')).toBeNull();
    expect(monthsIn('0 months')).toBeNull();
    expect(monthsIn('600 months')).toBe(600);
  });
});

describe('checkQ1E', () => {
  it('cannot evaluate when the stability read failed — and says so, not "pass"', () => {
    const f = checkQ1E({ ...EMPTY, unavailable: { stability: 'relation does not exist' } } as ProjectInputs);
    expect(statuses(f)).toEqual(['not_evaluated']);
    expect(f[0].message).toMatch(/did not run/);
  });

  it('says it had nothing to evaluate when no study is recorded, and leaves the absence to Q1A', () => {
    const f = checkQ1E(of([], IND));
    expect(ruleIds(f)).toEqual(['Q1E_NO_STABILITY']);
    expect(statuses(f)).toEqual(['not_evaluated']);
    expect(f[0].message).toMatch(/reported under Q1A/);
  });

  it('warns when studies exist but none states a shelf life — §3.2.P.8 has no other source', () => {
    const f = checkQ1E(of([longTerm(24), accelerated()], IND));
    expect(ruleIds(f)).toEqual(['Q1E_NO_CLAIM']);
    expect(statuses(f)).toEqual(['warning']);
  });

  it('refuses to judge a claim it cannot read, and does not call it a pass', () => {
    const f = checkQ1E(of([longTerm(24, 'to be confirmed')], IND));
    expect(ruleIds(f)).toEqual(['Q1E_CLAIM_NOT_READABLE']);
    expect(statuses(f)).toEqual(['not_evaluated']);
    expect(f[0].evidence.join(' ')).toMatch(/to be confirmed/);
  });

  it('refuses to judge when the coverage cannot be read', () => {
    const f = checkQ1E(of([{ ...longTerm(24, '24 months'), duration: 'ongoing', timePoints: 'TBD' }], IND));
    expect(ruleIds(f)).toEqual(['Q1E_COVERAGE_NOT_READABLE']);
    expect(statuses(f)).toEqual(['not_evaluated']);
  });

  it('passes a claim within the data', () => {
    const f = checkQ1E(of([longTerm(24, '24 months at 25C/60%RH'), accelerated()], IND));
    expect(ruleIds(f)).toEqual(['Q1E_CLAIM_WITHIN_DATA']);
    expect(statuses(f)).toEqual(['pass']);
    expect(f[0].evidence.join(' ')).toMatch(/long-term coverage: 24 months/);
  });

  describe('a claim beyond the data', () => {
    it('is a gap to justify for a clinical-trial application, citing 312.23(a)(7)(ii)', () => {
      const f = checkQ1E(of([longTerm(12, '24 months'), accelerated()], IND));
      expect(ruleIds(f)).toEqual(['Q1E_CLAIM_BEYOND_DATA']);
      expect(statuses(f)).toEqual(['warning']);
      expect(f[0].citation).toMatch(/312\.23\(a\)\(7\)\(ii\)/);
      expect(f[0].message).toMatch(/12 month\(s\) past the 12 months/);
    });

    it('is a FAIL for a marketing application once it passes the Q1E ceiling', () => {
      /* 12 months of data admits 24; a 36-month claim does not. */
      const f = checkQ1E(of([longTerm(12, '36 months'), accelerated()], NDA));
      expect(ruleIds(f)).toEqual(['Q1E_EXTRAPOLATION_BEYOND_LIMIT']);
      expect(statuses(f)).toEqual(['fail']);
      expect(f[0].evidence.join(' ')).toMatch(/Q1E ceiling: 24 months/);
    });

    it('is within the ceiling for a marketing application that extrapolates modestly', () => {
      /* 24 months of data admits 36. A 36-month claim raises nothing. */
      const f = checkQ1E(of([longTerm(24, '36 months'), accelerated()], NDA));
      expect(f).toEqual([]);
    });

    it('refuses extrapolation with no accelerated study, at either stage', () => {
      const ind = checkQ1E(of([longTerm(12, '24 months')], IND));
      expect(ruleIds(ind)).toContain('Q1E_EXTRAPOLATION_WITHOUT_ACCELERATED');
      expect(ind.find((x) => x.ruleId === 'Q1E_EXTRAPOLATION_WITHOUT_ACCELERATED')!.status).toBe('warning');

      const nda = checkQ1E(of([longTerm(12, '24 months')], NDA));
      expect(ruleIds(nda)).toContain('Q1E_EXTRAPOLATION_WITHOUT_ACCELERATED');
      expect(nda.find((x) => x.ruleId === 'Q1E_EXTRAPOLATION_WITHOUT_ACCELERATED')!.status).toBe('fail');
    });

    it('judges a program with NO recorded application type as a gap, and says to record one', () => {
      const f = checkQ1E(of([longTerm(12, '24 months'), accelerated()], null));
      expect(statuses(f)).toEqual(['warning']);
      expect(f[0].message).toMatch(/records no application type/);
    });
  });

  it('cites the ICH record rather than a hard-coded revision', () => {
    const f = checkQ1E(of([longTerm(24, '24 months'), accelerated()], IND));
    expect(f[0].citation).toMatch(/ICH Q1E \(2003-02\)|Q1E/);
  });
});
