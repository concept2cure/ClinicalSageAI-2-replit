/**
 * The two assessment panels may not say more than their engine measured.
 *
 * Both were raised by an adversarial review of the 2026-10-25 slice and are the
 * same failure in two places: a screen restating an engine's output in words
 * the engine would not use.
 *
 * ## 1. A projection is not a trend
 *
 * `stability-trending.ts` returns BOTH a slope with its confidence interval and
 * the arithmetic crossing of the recorded limit. The first version of the trend
 * table printed the crossing whenever one existed — so a series the engine had
 * measured as `significant: false` was shown as "heading toward: upper limit 1
 * at 23.37 mo", while `stabilityTrendSentence` in `module3Composer.ts`, over
 * that same output, writes into §3.2.S.7:
 *
 *   > slope … is not significantly different from zero, so no trend toward the
 *   > limit is established
 *
 * The screen and the dossier disagreeing about one study is worse than either
 * being wrong alone: a CMC lead acts on the screen and files the sentence.
 *
 * ## 2. An empty table is not a clean result
 *
 * A trend report whose results open no series at all rendered the full panel —
 * method citation, header row, no rows — and a toast pointing the reader at
 * "the reason against each of the 0 below". Nothing was assessed; it read as a
 * study assessed and found clean.
 *
 * These cases pin the RULE, taken from the composer, rather than the wording.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { trendClaim, headingToward, type TrendSeriesRow, type TrendReport } from '../surfaces/CmcModule';

const SRC = readFileSync(join(__dirname, '..', 'surfaces', 'CmcModule.tsx'), 'utf8');
const COMPOSER = readFileSync(
  join(__dirname, '..', '..', '..', '..', '..', 'server', 'services', 'module3Composer.ts'),
  'utf8',
);

/* The SHIPPED rule, imported and executed — not a copy of it. A copy would
   pass these cases while the panel did something else, which is the whole
   failure this file is about. */
type Outcome = TrendSeriesRow['outcome'];

const PROJECTION = { bound: 'upper' as const, limit: 1, time: 23.37 };

/**
 * A complete assessed outcome, as `stability-trending.ts` returns one — the
 * live 2026-10-25 case: 5 points, slope 0.0383 per month, 95% CI
 * [-0.0013, 0.078] (the interval includes zero), crossing projected at 23.37
 * months. Built whole rather than partially, so these cases run against the
 * shape the engine actually produces.
 */
function assessed(over: {
  significant: boolean;
  projection?: { bound: 'upper' | 'lower'; limit: number; time: number } | null;
}): Outcome {
  return {
    ok: true,
    method: 'PhRMA CMC Statistics and Stability Expert Teams — regression control chart',
    alpha: 0.05,
    pointsUsed: 5,
    distinctTimePoints: 5,
    evaluated: 1,
    observedPeriod: 12,
    outOfTrend: [],
    slope: { estimate: 0.0383, ci: [-0.0013, 0.078], significant: over.significant },
    projection: over.projection === undefined ? PROJECTION : over.projection,
  };
}

const REFUSED: Outcome = { ok: false, reason: 'INVALID_RECORDED_OBSERVATION', detail: 'a result is not numeric', pointsUsable: 0 };

describe('the trend panel claims a trend only where the engine establishes one', () => {
  it('does not call an insignificant slope a trend, even with a crossing projected', () => {
    /* The live case that motivated this: 5 points, slope 0.0383 per month,
       95% CI [-0.0013, 0.078] — the interval includes zero — and a crossing
       projected at 23.37 months. */
    const claim = trendClaim(assessed({ significant: false }));
    expect(claim.tone).toBe('dim');
    expect(claim.text).toMatch(/no trend established/i);
    expect(claim.text).not.toContain('23.37');
  });

  it('states the crossing when the slope IS significantly non-zero', () => {
    const claim = trendClaim(assessed({ significant: true }));
    expect(claim.tone).toBe('warn');
    expect(claim.text).toBe('upper limit 1 at 23.37 mo');
  });

  it('says a significant slope heading away from the limit is heading away', () => {
    const claim = trendClaim(assessed({ significant: true, projection: null }));
    expect(claim.tone).toBe('dim');
    expect(claim.text).toMatch(/heads away/i);
  });

  it('claims nothing at all about a series the engine refused', () => {
    expect(trendClaim(REFUSED).tone).toBe('dim');
  });

  it('counts for the toast exactly what the table marks', () => {
    /* One figure, one rule: the toast said "n heading toward a limit" from its
       own filter over `projection`, which is how the two came to disagree. */
    const series: Outcome[] = [
      assessed({ significant: false }),
      assessed({ significant: true }),
      assessed({ significant: true, projection: null }),
      REFUSED,
    ];
    expect(series.filter((o) => trendClaim(o).tone === 'warn')).toHaveLength(1);
    /* The naive count, which is what shipped first. */
    expect(series.filter((o) => o.ok && o.projection).length).toBe(2);
    /* And the shipped `headingToward`, over a whole report, agrees. */
    const report = { studyId: 1, basis: '', alpha: 0.05, unassignedObservations: [], series:
      series.map((outcome, i) => ({ parameter: `p${i}`, condition: '25C/60%RH', pointsRecorded: 5, pointsUsable: 5, criterionRecordedAs: null, outcome })),
    } as unknown as TrendReport;
    expect(headingToward(report)).toHaveLength(1);
  });
});

describe('the panel’s rule is the composer’s rule', () => {
  it('branches on significance first, exactly as §3.2.S.7 is written', () => {
    /* If the composer's rule changes, this fails and the panel is revisited —
       the two must not drift, because a client reads one and files the other. */
    expect(COMPOSER).toMatch(/if \(!o\.slope\.significant\)[\s\S]{0,200}no trend toward the limit is established/);
    expect(SRC).toMatch(/function trendClaim[\s\S]{0,400}if \(!o\.slope\.significant\)/);
    expect(SRC).toMatch(/no trend established \(slope not significant\)/);
  });

  it('uses that one function for both the table and the toast', () => {
    expect(SRC).toMatch(/function headingToward\(report: TrendReport\)[\s\S]{0,200}trendClaim\(x\.outcome\)\.tone === 'warn'/);
    expect(SRC).toMatch(/const heading = headingToward\(report\)\.length/);
    /* And the discarded filter is gone. */
    expect(SRC).not.toMatch(/filter\(\(x\) => x\.outcome\.ok && x\.outcome\.projection\)\.length/);
  });
});

describe('nothing assessed is never shown as nothing found', () => {
  it('replaces the table with an honest empty state when no series opened', () => {
    expect(SRC).toMatch(/if \(report\.series\.length === 0\)/);
    expect(SRC).toMatch(/Nothing on this study could be assessed for drift/);
    expect(SRC).toMatch(/no trend is being claimed either way/);
  });

  it('does not point the reader at "each of the 0 below"', () => {
    expect(SRC).toMatch(/report\.series\.length === 0\s*\n?\s*\? 'This study’s recorded results open no attribute\/condition series/);
  });
});

describe('a capability index is attributed to the material it was measured on', () => {
  it('names the side and its §3.2 section on every row', () => {
    /* Both sides were flattened into one unlabelled table, so one test method
       run on the substance AND the product produced two rows of the same name
       with different indices and nothing to tell them apart. */
    expect(SRC).toMatch(/\{side\.label\} · \{side\.section\}/);
  });

  it('keys each row by side and test, so two sides cannot collide', () => {
    /* React keeps ONE row for a duplicate key: the second side's index
       disappeared silently. */
    expect(SRC).toMatch(/key=\{`\$\{side\.key\}:\$\{row\.test\}`\}/);
    expect(SRC).not.toMatch(/key=\{row\.test\}/);
  });

  it('reads the citation with a guard, not a non-null assertion', () => {
    /* `series.find(r => r.outcome.ok)!` crashes the panel on a report where
       every series was refused — the honest case. */
    expect(SRC).toMatch(/function citationOf\(series: CapabilitySeriesRow\[\]\): string \| null/);
    expect(SRC).not.toContain('series.find((r) => r.outcome.ok)!');
  });
});
