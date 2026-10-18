/**
 * The Q1E rule against the REAL loader path, not hand-built fixtures.
 *
 * ## Why this file exists separately
 *
 * The DS/DP split in `ich-compliance-q1e.ts` was written, tested, and would
 * never have fired in production. Its tests built study objects with
 * `scope: 'DS'`; the register's row goes
 *
 *   register row → mapStabilityPayload (cmc-write-through)
 *                → normalizeStabilityPayload (stability-source)
 *                → the rule
 *
 * and two links in that chain disagreed with the fixtures: the write-through
 * emits the shared vocabulary's `stabilityScope` ('drug_substance' |
 * 'drug_product' | 'both'), and `normalizeStabilityPayload` did not carry the
 * field at all. So every study arrived 'unstated', the split never engaged, and
 * a drug substance's 36-month re-test period went on being compared with the
 * drug product's coverage — the exact defect the split was written to fix.
 *
 * A fixture proves the rule. Only the chain proves the product. Both of the
 * fields this rule turns on — the scope and the RECORDED results — are
 * therefore asserted here as they arrive from the writer.
 */
import { describe, it, expect } from 'vitest';
import { mapStabilityPayload } from '../../cmc-write-through';
import { normalizeStabilityPayload } from '../stability-source';
import { checkQ1E, scopeOf, studyCoverage } from '../ich-compliance-q1e';
import type { ProgramStage, ProjectInputs } from '../ich-compliance-rules';

const resultsTo = (months: number) =>
  [0, 3, 6, 9, 12, 18, 24, 36].filter((t) => t <= months)
    .map((t) => ({ timePoint: String(t), parameter: 'assay', result: '99.6' }));

/** A row shaped as the stability register stores one. */
const row = (over: Record<string, unknown>) => ({
  studyTitle: 'S', studyType: 'long-term', storageConditions: ['25C/60%RH'],
  duration: 24, timePoints: ['0', '6', '12', '24'], shelfLife: '24 months',
  stabilityData: resultsTo(24), status: 'ACTIVE', ...over,
});

/** Through the writer and the loader, exactly as a compliance read does it. */
const throughTheLoader = (rows: Array<Record<string, unknown>>) =>
  rows.map((r) => normalizeStabilityPayload(
    mapStabilityPayload(r as never) as unknown as Record<string, unknown>,
  ) as unknown as Record<string, unknown>);

const NDA: ProgramStage = { application: 'marketing', phase: 3, basis: 'program_type nda' };
const inputs = (stability: Array<Record<string, unknown>>): ProjectInputs => ({
  specs: [], methods: [], stability, drugSubs: [], processes: [],
  sourceObjects: [], sections: [], stage: NDA,
});

describe('the fields the rule turns on survive the writer and the loader', () => {
  it('carries the scope, in the shared vocabulary', () => {
    const [ds, dp, both] = throughTheLoader([
      row({ scope: 'DS' }), row({ scope: 'DP' }), row({ scope: 'both' }),
    ]);
    expect(scopeOf(ds)).toBe('drug_substance');
    expect(scopeOf(dp)).toBe('drug_product');
    expect(scopeOf(both)).toBe('both');
  });

  it('carries the recorded pull points, and tells them from the plan', () => {
    const [recorded, unpulled] = throughTheLoader([
      row({}), row({ stabilityData: null }),
    ]);
    expect(studyCoverage(recorded)).toEqual({ recorded: 24, planned: 24, unreadable: false });
    /* The study registered and not yet pulled: its plan is 24 months and its
       data is none. Reading the plan as coverage is what made a claim over an
       empty study pass. */
    expect(studyCoverage(unpulled)).toEqual({ recorded: 0, planned: 24, unreadable: false });
  });

  it('carries the shelf-life claim from the register’s own column', () => {
    const [s] = throughTheLoader([row({ shelfLife: '36 months at 25C/60%RH' })]);
    expect(String(s.shelfLifeClaim)).toBe('36 months at 25C/60%RH');
  });
});

describe('a drug substance and a drug product are judged on their own data', () => {
  it('passes the product and fails the substance, through the real path', () => {
    /* The register's own pair: a 36-month DS study claiming a 60-month re-test
       period, and a 24-month DP study claiming a 24-month shelf life. Judged as
       one pool, the 60-month claim won and the compliant product failed with
       it. */
    const studies = throughTheLoader([
      row({ studyTitle: 'DS-retest-36', scope: 'DS', duration: 36, timePoints: ['0', '6', '12', '24', '36'], shelfLife: '60 months', stabilityData: resultsTo(36) }),
      row({ studyTitle: 'DP-primary-24', scope: 'DP' }),
      row({ studyTitle: 'DP-acc-6', scope: 'DP', studyType: 'accelerated', storageConditions: ['40C/75%RH'], duration: 6, timePoints: ['0', '3', '6'], shelfLife: '', stabilityData: resultsTo(6) }),
    ]);
    const f = checkQ1E(inputs(studies));
    const byRule = new Map(f.map((x) => [x.ruleId, x]));

    /* The substance: 60 months claimed on 36 months of its own data, which is
       past the Q1E ceiling of 48, and with no accelerated study of its own. */
    expect(byRule.get('Q1E_EXTRAPOLATION_BEYOND_LIMIT')?.status).toBe('fail');
    expect(byRule.get('Q1E_EXTRAPOLATION_BEYOND_LIMIT')?.message).toMatch(/drug substance/);
    expect(byRule.get('Q1E_EXTRAPOLATION_BEYOND_LIMIT')?.evidence.join(' ')).toMatch(/Q1E ceiling: 48 months/);

    /* The product: 24 months claimed on 24 months of its own data. */
    expect(byRule.get('Q1E_CLAIM_WITHIN_DATA')?.status).toBe('pass');
    expect(byRule.get('Q1E_CLAIM_WITHIN_DATA')?.message).toMatch(/drug product/);
  });

  it('judges a `both` study as evidence for each side', () => {
    const studies = throughTheLoader([
      row({ studyTitle: 'DS-and-DP', scope: 'both', shelfLife: '24 months' }),
      row({ studyTitle: 'acc', scope: 'both', studyType: 'accelerated', storageConditions: ['40C/75%RH'], duration: 6, timePoints: ['0', '3', '6'], shelfLife: '', stabilityData: resultsTo(6) }),
    ]);
    const f = checkQ1E(inputs(studies));
    /* One study, two sides, so the claim is judged twice — once for each. */
    expect(f.map((x) => x.status)).toEqual(['pass', 'pass']);
    expect(f.map((x) => x.message).join(' ')).toMatch(/drug substance/);
    expect(f.map((x) => x.message).join(' ')).toMatch(/drug product/);
  });
});
