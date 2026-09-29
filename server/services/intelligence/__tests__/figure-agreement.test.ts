/**
 * When do two statements of one labelled figure agree? One rule for the two
 * checks that compare labelled figures in prose: the within-document numerical
 * integrity check and the dossier consistency check (row 74, track NC review;
 * ADR-0014 §7).
 *
 * Before the review both checks compared figures loosely, and the counted
 * 'clean' copy the track added presented the result as verified agreement:
 *   - a range (a confidence interval, an age range) was compared on its lower
 *     bound only, so "95% CI 0.5 to 0.9" against "95% CI 0.5 to 1.2" agreed
 *     (review [3]);
 *   - every numeric label agreed within a 0.5% spread, so N = 1000 against
 *     N = 1004 agreed, although a sample size is critical (review [5]). The
 *     product decision: counts and other whole-number labels match exactly,
 *     and the rounding spread stays for measured values only;
 *   - the spread was a bare literal in two engine places and hard-coded again
 *     in the copy (review [7]). It is now one constant, FIGURE_AGREEMENT_SPREAD,
 *     that both checks and the copy read.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbState = vi.hoisted(() => ({ rows: [] as unknown[] }));

vi.mock('../../../db.js', async importOriginal => {
  const real = await importOriginal<Record<string, unknown>>();
  const chain = { from: () => chain, where: () => chain, limit: async () => dbState.rows };
  return { ...real, db: { ...(real.db as object), select: () => chain } };
});

import { checkDossierConsistency, checkInternalNumericalIntegrity } from '../cross-artifact-consistency';
import * as vocabulary from '../../../../shared/ana/dossier-consistency';

/** The shared spread, read loosely so the test fails, not the import, where it is missing. */
const SPREAD = (vocabulary as Record<string, unknown>).FIGURE_AGREEMENT_SPREAD as number;

const artifact = (id: number, content: string) => ({
  id,
  artifactId: `art-${id}`,
  title: `Document ${id}`,
  content,
  ctdSection: '5.3.5.1',
  status: 'draft',
});

const dossier = (draft: string) =>
  checkDossierConsistency({ projectId: 12, organizationId: 7, draftContent: draft });

beforeEach(() => {
  dbState.rows = [];
});

describe('a range is compared on both bounds (review [3])', () => {
  const CI_UPPER_DIFFERS =
    'The hazard ratio was 0.70 (95% CI 0.5 to 0.9) in the primary analysis of the full population. ' +
    'The forest plot shows the same hazard ratio with 95% CI 0.5 to 1.2 for that population.';
  const CI_AGREES =
    'The hazard ratio was 0.70 (95% CI 0.5 to 0.9) in the primary analysis of the full population. ' +
    'The forest plot shows the same hazard ratio with 95% CI 0.5 to 0.9 for that population.';
  const AGE_UPPER_DIFFERS =
    'Eligible participants were ages 18 to 65 years at screening, in every region and site. ' +
    'The synopsis restates the population as ages 18 to 75 years for the same protocol.';

  it('integrity: the same lower CI bound with a different upper bound is a candidate, never clean', () => {
    const report = checkInternalNumericalIntegrity(CI_UPPER_DIFFERS);
    expect(report.verdict).not.toBe('clean');
    expect(report.verdict).toBe('review_candidates');
    expect(report.candidates.map(c => c.label)).toEqual(['confidence_interval']);
    expect(report.candidates[0].distinctValues).toEqual(['0.5 to 0.9', '0.5 to 1.2']);
  });

  it('integrity: an age range whose upper bound differs is a candidate', () => {
    const report = checkInternalNumericalIntegrity(AGE_UPPER_DIFFERS);
    expect(report.verdict).toBe('review_candidates');
    expect(report.candidates.map(c => c.label)).toEqual(['age_range']);
  });

  it('integrity: a range stated twice with both bounds equal is clean (the overcorrection guard)', () => {
    const report = checkInternalNumericalIntegrity(CI_AGREES);
    expect(report.verdict).toBe('clean');
    expect(report.quantitiesCompared).toBe(1);
  });

  it('dossier: a CI whose upper bound differs from another document is a divergence, not clean', async () => {
    dbState.rows = [
      artifact(1, 'Clinical overview. The hazard ratio was 0.70 (95% CI 0.5 to 1.2) in the primary analysis of the pivotal study population.'),
    ];
    const report = await dossier(CI_AGREES);
    expect(report.verdict).not.toBe('clean');
    expect(report.divergences.map(d => d.kind)).toEqual(['numeric_divergence']);
    expect(report.divergences[0].description).toMatch(/0\.5 to 0\.9/);
    expect(report.divergences[0].description).toMatch(/0\.5 to 1\.2/);
  });

  it('dossier: the same CI in another document is clean', async () => {
    dbState.rows = [
      artifact(1, 'Clinical overview. The hazard ratio was 0.70 (95% CI 0.5 to 0.9) in the primary analysis of the pivotal study population.'),
    ];
    const report = await dossier(CI_AGREES);
    expect(report.verdict).toBe('clean');
  });
});

describe('counts match exactly; measured values keep the rounding spread (review [5])', () => {
  const N_1000_1004 =
    'The enrolled population was N = 1000 subjects across all sites in the pivotal study. ' +
    'Table 14.1 reports N = 1004 in the same population for the primary analysis.';
  const BATCHES_DIFFER =
    'Stability data are provided for 3 registration batches of the drug product at release. ' +
    'The stability summary tabulates results for 4 registration batches at the same condition.';

  it('integrity: N = 1000 against N = 1004 in one document is a likely inconsistency', () => {
    const report = checkInternalNumericalIntegrity(N_1000_1004);
    expect(report.verdict).toBe('likely_inconsistency');
    expect(report.candidates[0].distinctValues).toEqual(['1000', '1004']);
  });

  it('integrity: the same N written with a thousands separator still agrees (the overcorrection guard)', () => {
    const report = checkInternalNumericalIntegrity(
      'The enrolled population was N = 1,000 subjects across all sites. Table 14.1 lists N = 1000 in the same population.',
    );
    expect(report.verdict).toBe('clean');
  });

  it('integrity: a batch count stated as 3 and as 4 is a candidate', () => {
    expect(checkInternalNumericalIntegrity(BATCHES_DIFFER).candidates.map(c => c.label)).toEqual(['batches']);
  });

  it('dossier: N = 1000 in the draft against N = 1004 in another document is a blocker', async () => {
    dbState.rows = [
      artifact(1, 'Clinical study report. The enrolled population was N = 1004 subjects across all sites in the pivotal study.'),
    ];
    const report = await dossier(
      'Clinical overview. The enrolled population was N = 1000 subjects across all sites in the pivotal study of the product.',
    );
    expect(report.verdict).toBe('blocker');
    expect(report.divergences[0].severity).toBe('critical');
  });

  it('the spread is one shared constant, 0.5%', () => {
    expect(SPREAD).toBe(0.005);
  });

  it('integrity: a measured value inside the shared spread agrees, and one just outside it does not', () => {
    const at = (b: number) =>
      checkInternalNumericalIntegrity(
        `At Week 26 the mean change from baseline of 100 points favoured treatment. The summary table ` +
          `reports a mean change of ${b} points for the same comparison.`,
      ).verdict;
    expect(at(Number((100 * (1 + SPREAD * 0.8)).toFixed(3)))).toBe('clean');
    expect(at(Number((100 * (1 + SPREAD * 2)).toFixed(3)))).toBe('review_candidates');
  });

  it('dossier: a measured value inside the shared spread agrees across documents', async () => {
    dbState.rows = [
      artifact(1, 'Clinical study report. At Week 26 the mean change from baseline of 12.04 points favoured the treatment arm.'),
    ];
    const report = await dossier(
      'Clinical overview. At Week 26 the mean change from baseline of 12.00 points favoured the treatment arm over placebo.',
    );
    expect(report.verdict).toBe('clean');
  });
});

describe('the clean copy states the rule the check applied (reviews [5], [7])', () => {
  it('names exact matching for counts and the shared spread, not a hard-coded 0.5%', async () => {
    const { integrityRecommendationFor } = await import('../consistency-verdict');
    const copy = integrityRecommendationFor({ verdict: 'clean', factsExtracted: 2, quantitiesCompared: 1 });
    expect(copy).toMatch(/counts .*exactly/);
    expect(copy).toMatch(/both bounds of a range/);
    expect(copy).toContain(`${Number((SPREAD * 100).toPrecision(6))}%`);
    expect(copy).not.toMatch(/none with values 0\.5% or more apart/);
  });

  it("the dossier check's clean copy states the same rule, from the same place", async () => {
    const { integrityRecommendationFor, recommendationFor } = await import('../consistency-verdict');
    const dossierCopy = recommendationFor({
      verdict: 'clean',
      figuresCompared: 2,
      artifactsCompared: 1,
      crossReferencesChecked: 0,
      draftCopiesSetAside: 0,
    });
    const integrityCopy = integrityRecommendationFor({ verdict: 'clean', factsExtracted: 2, quantitiesCompared: 1 });
    const rule = /\((counts and other whole numbers exactly, both bounds of a range, other values within [0-9.]+%)\)/;
    expect(dossierCopy).toMatch(rule);
    expect(dossierCopy.match(rule)?.[1]).toBe(integrityCopy.match(rule)?.[1]);
  });
});
