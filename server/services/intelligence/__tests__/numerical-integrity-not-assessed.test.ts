/**
 * The within-document numerical integrity check does not say "clean" when
 * nothing was compared (row 74, track NC; ADR-0014 §7).
 *
 * checkInternalNumericalIntegrity looks for one labelled quantity (N =, a dose,
 * a NOAEL, a p-value …) stated with two different values in the same draft.
 * Before this change it returned verdict 'clean', and check_numerical_integrity
 * told the model "No numerical inconsistencies detected.", when:
 *   - the draft states no labelled figure at all (factsExtracted 0);
 *   - every labelled quantity is stated once, so no figure was compared with
 *     another.
 * Neither is a finding. Each now reports verdict 'not_assessed' with the
 * reason, and the tool's copy says nothing was compared. 'clean' needs at least
 * one quantity stated more than once (`quantitiesCompared`), and a candidate
 * found is still reported whatever else was not compared.
 *
 * The same rule as the dossier consistency check (H2): one verdict list per
 * check in shared/ana/dossier-consistency.ts, one decision in
 * consistency-verdict.ts.
 */

import { describe, it, expect } from 'vitest';

import { checkInternalNumericalIntegrity } from '../cross-artifact-consistency';
import { CHECK_NUMERICAL_INTEGRITY } from '../../ana/document-intake-tool-defs';
import { BASE_SYSTEM_PROMPT } from '../../lumen-context/base-system-prompt';

const NO_FIGURES =
  'The applicant describes the overall development programme and the rationale for the ' +
  'proposed indication, in narrative form only, without figures.';
// Four labelled quantities, each stated once: sample_size, p_value, dose_kg (50 mg/kg) and noael.
const EACH_ONCE =
  'In the pivotal study the sample size was N = 240 subjects. The NOAEL of 50 mg/kg/day was set ' +
  'in the 28-day rat study. The primary endpoint was met (p = 0.003).';
// sample_size stated twice with the same value; noael once.
const REPEATED_AGREES =
  'In the pivotal study N = 240 subjects were randomized. The NOAEL of 50 mg/kg/day was set in ' +
  'the 28-day rat study. Table 14.1 confirms N = 240 in the full analysis set.';
// sample_size stated twice, once with a thousands separator: the same value.
const REPEATED_SEPARATOR =
  'The enrolled population was N = 1,000 subjects in total. Table 14.1 lists N = 1000 in ' +
  'the safety population, and the NOAEL of 50 mg/kg/day was set in the rat study.';
// mean_change stated twice with values inside the engine's 0.5% spread: agreement.
const REPEATED_WITHIN_TOLERANCE =
  'At Week 26 the mean change from baseline of 12.00 points favoured treatment. The summary ' +
  'table reports a mean change of 12.04 points for the same comparison.';
// sample_size stated twice with different values: a critical candidate.
const REPEATED_DISAGREES =
  'In the pivotal study N = 648 subjects were randomized. The NOAEL of 50 mg/kg/day was set in ' +
  'the 28-day rat study. Table 14.1 reports N = 641 in the full analysis set.';
// p_value stated twice with different values (high, not critical); N once.
const MEDIUM_DISAGREES =
  'The primary endpoint was met (p = 0.003) in N = 240 subjects. In the forest plot the same ' +
  'comparison is shown with p = 0.03 for the overall population.';

async function tool(content: string) {
  const { getToolHandler } = await import('../../ana/AnaToolExecutor');
  return JSON.parse(await getToolHandler('check_numerical_integrity')!({ content }, {} as never));
}

describe('checkInternalNumericalIntegrity: nothing compared is not clean', () => {
  it('a draft with no labelled figures is not_assessed (no_figures), never clean', () => {
    const report = checkInternalNumericalIntegrity(NO_FIGURES);
    expect(report.factsExtracted).toBe(0);
    expect(report.verdict).not.toBe('clean');
    expect(report.verdict).toBe('not_assessed');
    expect(report.notAssessedReason).toBe('no_figures');
    expect(report.quantitiesCompared).toBe(0);
    expect(report.candidates).toEqual([]);
  });

  it('a draft whose labelled quantities are each stated once is not_assessed (no_repeated_figures)', () => {
    const report = checkInternalNumericalIntegrity(EACH_ONCE);
    expect(report.factsExtracted).toBe(4);
    expect(report.verdict).not.toBe('clean');
    expect(report.verdict).toBe('not_assessed');
    expect(report.notAssessedReason).toBe('no_repeated_figures');
    expect(report.quantitiesCompared).toBe(0);
  });

  // Review [2]: the extractor reads nothing under FIGURE_EXTRACTION_MIN_LENGTH
  // characters. 'N=648 vs N=641.' plainly states two sample sizes, so "states
  // no labelled figure" would be false for it: the reason is the length.
  it('content under the extractor minimum is not_assessed (content_too_short), not "no figures"', () => {
    const report = checkInternalNumericalIntegrity('N=648 vs N=641.');
    expect(report.verdict).toBe('not_assessed');
    expect(report.notAssessedReason).toBe('content_too_short');
    expect(checkInternalNumericalIntegrity('N = 240.').notAssessedReason).toBe('content_too_short');
  });

  it('the minimum is one shared constant, and content at it is read', async () => {
    const vocabulary = (await import('../../../../shared/ana/dossier-consistency')) as Record<string, unknown>;
    const min = vocabulary.FIGURE_EXTRACTION_MIN_LENGTH as number;
    expect(min).toBe(20);
    const atMin = 'N = 240; N = 240.'.padEnd(min, ' ');
    expect(atMin.length).toBe(min);
    expect(checkInternalNumericalIntegrity(atMin).verdict).toBe('clean');
    expect(checkInternalNumericalIntegrity(atMin.slice(0, min - 1)).notAssessedReason).toBe('content_too_short');
  });
});

describe('checkInternalNumericalIntegrity: a real comparison keeps its verdict', () => {
  it('a quantity stated twice with one value is clean', () => {
    expect(checkInternalNumericalIntegrity(REPEATED_AGREES).verdict).toBe('clean');
  });

  it('clean counts the quantities compared and carries no reason', () => {
    const report = checkInternalNumericalIntegrity(REPEATED_AGREES);
    expect(report.quantitiesCompared).toBe(1);
    expect(report.notAssessedReason).toBeUndefined();
  });

  it('one value written with and without a thousands separator is a comparison that agreed', () => {
    const report = checkInternalNumericalIntegrity(REPEATED_SEPARATOR);
    expect(report.verdict).toBe('clean');
    expect(report.quantitiesCompared).toBe(1);
  });

  it('values inside the 0.5% spread are a comparison that agreed: clean, counted', () => {
    const report = checkInternalNumericalIntegrity(REPEATED_WITHIN_TOLERANCE);
    expect(report.factsExtracted).toBe(3);
    expect(report.verdict).toBe('clean');
    expect(report.quantitiesCompared).toBe(1);
  });

  it('a critical quantity stated with two values is still likely_inconsistency', () => {
    const report = checkInternalNumericalIntegrity(REPEATED_DISAGREES);
    expect(report.verdict).toBe('likely_inconsistency');
    expect(report.candidateCount).toBe(1);
    expect(report.candidates[0].distinctValues).toEqual(['648', '641']);
  });

  it('a high-severity quantity stated with two values is still review_candidates', () => {
    const report = checkInternalNumericalIntegrity(MEDIUM_DISAGREES);
    expect(report.verdict).toBe('review_candidates');
    expect(report.candidates[0].label).toBe('p_value');
  });

  it('a candidate is reported with its comparison counted, beside quantities stated once', () => {
    const report = checkInternalNumericalIntegrity(REPEATED_DISAGREES);
    expect(report.quantitiesCompared).toBe(1);
    expect(report.notAssessedReason).toBeUndefined();
  });

  it('every verdict the engine returns is in the shared list', async () => {
    const { NUMERICAL_INTEGRITY_VERDICTS } = await import('../../../../shared/ana/dossier-consistency');
    expect([...NUMERICAL_INTEGRITY_VERDICTS]).toEqual([
      'clean',
      'review_candidates',
      'likely_inconsistency',
      'not_assessed',
    ]);
    for (const content of [NO_FIGURES, EACH_ONCE, REPEATED_AGREES, REPEATED_DISAGREES, MEDIUM_DISAGREES]) {
      expect(NUMERICAL_INTEGRITY_VERDICTS).toContain(checkInternalNumericalIntegrity(content).verdict);
    }
  });
});

describe('check_numerical_integrity: the tool says nothing was compared', () => {
  it('no labelled figures: not_assessed with the reason, and no "No numerical inconsistencies detected"', async () => {
    const out = await tool(NO_FIGURES);
    expect(out.verdict).toBe('not_assessed');
    expect(out.notAssessedReason).toBe('no_figures');
    expect(out.quantitiesCompared).toBe(0);
    expect(out.recommendation).not.toMatch(/No numerical inconsistencies detected/);
    expect(out.recommendation).toMatch(/^No labelled figure \(such as N =, a dose, a NOAEL or a p-value\) was found in the content/);
    expect(out.recommendation).toMatch(/not assessed; this is not a clean result/);
  });

  it('content too short to read: the copy states the minimum, and claims nothing about the content', async () => {
    const out = await tool('N=648 vs N=641.');
    expect(out.verdict).toBe('not_assessed');
    expect(out.notAssessedReason).toBe('content_too_short');
    expect(out.recommendation).toMatch(/^The content is under 20 characters, so it was not read for figures/);
    expect(out.recommendation).not.toMatch(/no labelled figure/i);
    expect(out.recommendation).toMatch(/not a clean result/);
  });

  it('each quantity stated once: not_assessed, and the copy counts what was found', async () => {
    const out = await tool(EACH_ONCE);
    expect(out.verdict).toBe('not_assessed');
    expect(out.notAssessedReason).toBe('no_repeated_figures');
    expect(out.recommendation).not.toMatch(/No numerical inconsistencies detected/);
    expect(out.recommendation).toMatch(/^4 labelled figures found/);
    expect(out.recommendation).toMatch(/each quantity is stated only once/);
    expect(out.recommendation).toMatch(/not a clean result/);
  });

  it('a real agreement is still clean, and the copy counts what was compared', async () => {
    const out = await tool(REPEATED_AGREES);
    expect(out.verdict).toBe('clean');
    expect(out.quantitiesCompared).toBe(1);
    expect(out.recommendation).toMatch(/^No numerical inconsistencies detected: 1 quantity stated more than once/);
    expect(out.recommendation).toMatch(/stated only once were not compared/);
  });

  it('a disagreement keeps its copy and its candidates', async () => {
    const out = await tool(REPEATED_DISAGREES);
    expect(out.verdict).toBe('likely_inconsistency');
    expect(out.candidateCount).toBe(1);
    expect(out.recommendation).toMatch(/^LIKELY INCONSISTENCY/);
    const review = await tool(MEDIUM_DISAGREES);
    expect(review.verdict).toBe('review_candidates');
    expect(review.recommendation).toMatch(/^Candidate inconsistencies detected/);
  });

  it('every reason has its own copy, and no copy is the clean one', async () => {
    const { NUMERICAL_INTEGRITY_NOT_ASSESSED_REASONS } = await import('../../../../shared/ana/dossier-consistency');
    const { integrityRecommendationFor } = await import('../consistency-verdict');
    const copies = NUMERICAL_INTEGRITY_NOT_ASSESSED_REASONS.map(reason =>
      integrityRecommendationFor({ verdict: 'not_assessed', notAssessedReason: reason, factsExtracted: 2, quantitiesCompared: 0 }),
    );
    expect(new Set(copies).size).toBe(NUMERICAL_INTEGRITY_NOT_ASSESSED_REASONS.length);
    for (const copy of copies) {
      expect(copy).not.toMatch(/No numerical inconsistencies detected/);
      expect(copy).toMatch(/not a clean result/);
    }
  });
});

describe('the model hears the same thing', () => {
  it('the tool description names not_assessed and says it is not clean, within the 1024-character trim', () => {
    expect(CHECK_NUMERICAL_INTEGRITY.description).toMatch(/not_assessed/);
    expect(CHECK_NUMERICAL_INTEGRITY.description).toMatch(/not a clean result/);
    expect(CHECK_NUMERICAL_INTEGRITY.description.length).toBeLessThanOrEqual(1024);
  });

  it('the base system prompt tells AnA never to call not_assessed numbers consistent', () => {
    const line = BASE_SYSTEM_PROMPT.split('\n').find(l => l.includes('`check_numerical_integrity`'));
    expect(line).toBeDefined();
    expect(line).toMatch(/not_assessed/);
    expect(line).toMatch(/never call the draft's numbers consistent/);
  });
});
