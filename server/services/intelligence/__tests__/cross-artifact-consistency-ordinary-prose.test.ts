import { describe, expect, it } from 'vitest';

import { extractNumericalFacts, numericValueOf } from '../cross-artifact-consistency';

/**
 * What the one labelled-figure lexicon reads out of ORDINARY regulatory prose.
 *
 * ## Why this file exists
 *
 * The lexicon is the platform's single extractor: the truth engine's figure
 * consistency, the harmonize engine, the mined-figure and device-document
 * reconcilers, terminology consistency, and the living record's binder and
 * citations all read figures through it. Whatever it cannot see, none of them
 * can compare — and `figure-consistency` then reports, honestly but
 * uselessly, that nothing was compared.
 *
 * Measured on 2026-11-01 against fifteen phase-III randomised-trial abstracts
 * from PubMed (open literature, the nearest public corpus to the prose a CSR
 * and a Module 2.5 are written in): of 123 sentences stating a figure a
 * reviewer reconciles, the lexicon read **24 — 20%**. The misses were not
 * exotic. They were four mechanical shapes, every one of them the ordinary
 * way the figure is written:
 *
 *   1. a comma between the figure's name and its number — "hazard ratio, 0.65",
 *      "95% CI, 0.53 to 0.79". Every pattern allowed "of", "was", "=" and ":"
 *      and no comma, which is how almost every journal and CSR writes it;
 *   2. a qualifier between them — "hazard ratio for death, 0.64";
 *   3. the number before the verb — "496 patients were randomly assigned",
 *      "Of 994 patients who underwent randomization". The two `sample_size`
 *      patterns both required the keyword FIRST;
 *   4. figures with no label at all: median PFS / OS / DFS, median follow-up,
 *      mean age — each reconciled between the CSR, the SAP and Module 2.5.
 *
 * And one false positive, measured the same day: `\bOR\b` under the `i` flag
 * matched the English word "or", so "the 0.3 or 0.5 mg dose" stated an odds
 * ratio of 0.5. In a reconciliation engine that is worse than a miss — it
 * manufactures a conflict between two documents that merely both use "or".
 *
 * The cases below are the real sentences, by PMID where they came from one.
 * Every pattern here stays anchored on an explicit label: the module's rule is
 * that a free-standing number is never captured, and the negative cases at the
 * foot are what hold that line.
 */

/** The labels read from `text`, as `label=value`, sorted. */
function read(text: string): string[] {
  return extractNumericalFacts(text).map((f) => `${f.label}=${f.value}`).sort();
}
const labels = (text: string): string[] => [...new Set(extractNumericalFacts(text).map((f) => f.label))].sort();

describe('the lexicon reads a figure written with a comma, as journals and CSRs write it', () => {
  it('reads a hazard ratio stated with a comma', () => {
    /* PMID 39413375. The single most common shape in the corpus. */
    const t = 'In 617 patients in the intention-to-treat population, progression-free survival was 10.4 months and 8.2 months, respectively (hazard ratio, 0.65; 95% CI, 0.53 to 0.79).';
    expect(read(t)).toContain('hazard_ratio=0.65');
  });

  it('reads a hazard ratio stated with a qualifier before the comma', () => {
    const t = 'Overall survival at 24 months was 53.0% in the pembrolizumab group and 41.7% in the placebo group (hazard ratio for death, 0.64; 95% CI, 0.50 to 0.81).';
    expect(read(t)).toContain('hazard_ratio=0.64');
  });

  it('reads a confidence interval stated with a comma', () => {
    const t = 'The primary analysis gave a difference of 2.3 months (95% CI, 0.53 to 0.79) in the intention-to-treat population.';
    const ci = extractNumericalFacts(t).find((f) => f.label === 'confidence_interval');
    expect(ci, '95% CI with a comma was not read').toBeTruthy();
    expect([ci!.value, ci!.upper]).toEqual(['0.53', '0.79']);
  });

  it('reads a confidence interval written as a hyphen range inside parentheses', () => {
    const t = 'Median progression-free survival was 7.1 (95% CI, 5.9-8.7) months in the ivonescimab group in this analysis.';
    const ci = extractNumericalFacts(t).find((f) => f.label === 'confidence_interval');
    expect(ci, 'a parenthesised hyphen range was not read').toBeTruthy();
    expect([ci!.value, ci!.upper]).toEqual(['5.9', '8.7']);
  });

  it('reads alpha, power and a response rate stated with a comma', () => {
    expect(read('The significance level, 0.025 one-sided, was agreed with the agency before the database lock.')).toContain('alpha=0.025');
    expect(read('The trial was sized for power, 0.90, against the primary endpoint under the stated assumptions.')).toContain('power=0.90');
    expect(read('The objective response rate, 42.1%, was assessed by blinded independent central review of the scans.')).toContain('response_rate=42.1');
  });
});

describe('the lexicon reads a patient count written before its verb', () => {
  it('reads "A total of N patients were randomly assigned"', () => {
    /* PMID 40532178. Both `sample_size` patterns wanted the keyword first. */
    const t = 'A total of 994 patients were randomly assigned in this multicentre study of the investigational regimen.';
    expect(read(t)).toContain('sample_size=994');
  });

  it('reads "Of N patients who underwent randomization"', () => {
    const t = 'Of 994 patients who underwent randomization, 970 were included in the intention-to-treat population.';
    expect(labels(t)).toContain('sample_size');
    expect(extractNumericalFacts(t).filter((f) => f.label === 'sample_size').map((f) => f.value)).toContain('994');
  });

  it('reads the prose form the route was measured failing on', () => {
    /* The case recorded in figure-consistency's own header on 2026-10-26:
       "A total of 248 subjects were randomised." against "In total 251
       subjects were randomised to treatment." answered 200 [] with
       X-Consistency-Not-Compared: 0, over two numbers that plainly disagree.
       The header says widening the extractor "is its own change". This is it. */
    expect(read('A total of 248 subjects were randomised in the pivotal study described in this section.')).toContain('sample_size=248');
    expect(read('In total 251 subjects were randomised across the participating investigational sites.')).toContain('sample_size=251');
  });

  it('reads a count stated with a thousands separator', () => {
    expect(read('A total of 1,286 participants were enrolled across the participating centres in this study.')).toContain('sample_size=1,286');
  });
});

describe('the lexicon reads the figures that had no label at all', () => {
  it('reads median PFS, OS and DFS as DISTINCT labels', () => {
    /* Distinct on purpose. One `median_survival_months` label would compare a
       protocol's median OS against a CSR's median PFS and call the difference
       a conflict — a fabricated finding, which is the failure this engine
       exists to prevent. */
    const t = 'Median progression-free survival was 10.4 months and median overall survival was 24.1 months in the treatment group.';
    expect(read(t)).toEqual(expect.arrayContaining(['median_pfs_months=10.4', 'median_os_months=24.1']));
    expect(read('Median disease-free survival was 38.3 months in the pembrolizumab group of this trial.')).toContain('median_dfs_months=38.3');
  });

  it('reads median follow-up, and reads it in years as the months it is', () => {
    const inMonths = extractNumericalFacts('At the first interim analysis, the median follow-up was 38.3 months in both groups.')
      .find((f) => f.label === 'median_followup_months');
    expect(inMonths, 'median follow-up in months was not read').toBeTruthy();
    expect(numericValueOf(inMonths!)).toBe(38.3);

    /* PMID 40960239: "with a median follow-up of 2.1 years". A CSR states this
       in months and a publication in years; they are the same figure, so they
       are normalised to one unit rather than left incomparable. */
    const inYears = extractNumericalFacts('We repeated the analysis with a median follow-up of 2.1 years across the enrolled population.')
      .find((f) => f.label === 'median_followup_months');
    expect(inYears, 'median follow-up in years was not read').toBeTruthy();
    expect(numericValueOf(inYears!)).toBeCloseTo(25.2, 5);
  });

  it('reads mean age from a baseline sentence', () => {
    expect(read('Of 210 randomized participants, the mean age was 36.1 years at the time of first dose.')).toContain('mean_age_years=36.1');
    expect(read('Baseline characteristics were balanced; mean [SD] age, 36.1 [9.1] years, was similar across arms.')).toContain('mean_age_years=36.1');
  });

  it('reads MEDIAN age as its own label, never as the mean', () => {
    /* A baseline table states one or the other. Comparing a protocol's mean
       against a CSR's median would be a conflict nobody disagreed about. */
    const t = 'The median age of the patients was 61 years (range, 26 to 86) at the time of enrolment.';
    expect(read(t)).toContain('median_age_years=61');
    expect(labels(t)).not.toContain('mean_age_years');
  });

  it('reads median follow-up written as "follow-up time"', () => {
    expect(read('As of March 10, 2023, median follow-up time was 7.89 months in the enrolled population.'))
      .toContain('median_followup_months=7.89');
  });
});

describe('an anchored lexicon still captures no free-standing number', () => {
  it('does not read the English word "or" as an odds ratio', () => {
    /* Measured live on 2026-11-01, before this change:
         "Subjects received either the 0.3 or 0.5 mg dose once daily"
           → odds_ratio=0.5
       `\bOR\b` sat in a case-INSENSITIVE pattern. */
    for (const t of [
      'Subjects received either the 0.3 or 0.5 mg dose once daily for the duration of the treatment period.',
      'The sponsor may file a Type II variation or 0.25 of the annual fee is refunded under the schedule.',
      'Patients were stratified by region or 0.5 mg stratum in accordance with the randomisation schedule.',
    ]) {
      expect(labels(t), `"${t.slice(0, 48)}…" read an odds ratio from the word "or"`).not.toContain('odds_ratio');
    }
  });

  it('still reads a real odds ratio, in either spelling', () => {
    expect(read('The odds ratio, 1.42, favoured the active arm in the prespecified subgroup analysis of the trial.')).toContain('odds_ratio=1.42');
    expect(read('The adjusted estimate (OR, 1.42) favoured the active arm in the prespecified subgroup analysis.')).toContain('odds_ratio=1.42');
  });

  it('does not read a bare number, a date or a heart rate as a figure', () => {
    expect(labels('The study design is described in the protocol dated 12 March 2024 and its two amendments thereafter.')).toEqual([]);
    expect(labels('Heart rate was monitored throughout; mean HR 72 bpm was recorded at each visit for all subjects.')).not.toContain('hazard_ratio');
    expect(labels('Section 3 and Section 4 of the dossier were revised following the agency interaction last quarter.')).toEqual([]);
  });

  it('does not read a comma that is not a connector', () => {
    /* The comma is only a connector when the number follows it immediately. */
    expect(labels('The power, which the agency agreed, was revisited after 3 further sites opened in the region.'))
      .not.toContain('power');
  });
});
