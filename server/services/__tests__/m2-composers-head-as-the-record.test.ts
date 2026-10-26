/**
 * The deterministic Module 2 composers head each section as the one ICH M2–M5
 * record does (D2 cleanup C4b, 2026-10-26).
 *
 * The composers kept their own heading copies:
 * - the QOS wrote "2.3.P.1 Description and Composition" (the record: "… of the
 *   Drug Product");
 * - the Nonclinical Overview wrote "2.4.1 Overview of Nonclinical Testing
 *   Strategy" (the record: "… of the Nonclinical …") and had no 2.4.6;
 * - the Clinical Overview had no 2.5.7;
 * - the Clinical Summary wrote "2.7.4.1 Exposure to the Investigational Drug",
 *   put its SAE and death counts under "2.7.4.3 Serious Adverse Events and
 *   Deaths" (the record's 2.7.4.3 is Clinical Laboratory Evaluations), and had
 *   no 2.7.6.
 *
 * Not checked here, on purpose: the QOS part headings 2.3.S and 2.3.P. The
 * record titles them "Quality Overall Summary — Drug Substance/Product", a
 * label rather than the guideline's heading; correcting the record is owed a
 * verbatim read (cleanup README, C4b).
 */
import { describe, expect, it } from 'vitest';
import {
  buildM23QualityOverallSummary,
  buildM24NonclinicalOverview,
  buildM25ClinicalOverview,
  buildM27ClinicalSummary,
  type CSRSummaryInput,
} from '../m2-summary-builders';
import { ctdRecordSubtree } from '../market-specs/ctd-component-outlines';
import { ichHeadingTitle } from '../ind/ctd/ich-m4-headings';
import { compareSectionCode } from '../../../shared/regulatory/section-code';

const HEADING = /^(2\.\d+(?:\.[0-9A-Z]+)+) (.+)$/;
const PART_HEADINGS_OWED = new Set(['2.3.S', '2.3.P']);

/** Every line that opens with a CTD code: [code, text]. */
const headings = (narrative: string) => narrative.split('\n').flatMap((l) => {
  const m = l.match(HEADING);
  return m ? [[m[1], m[2]] as const] : [];
});
const children = (root: string) => ctdRecordSubtree(root).filter((h) => h.code.split('.').length === root.split('.').length + 1).map((h) => h.code);

const csr = (over: Partial<CSRSummaryInput>): CSRSummaryInput => ({
  studyId: 'S3', protocolNumber: 'BX-301', phase: '3', studyDesign: 'randomized, double-blind',
  primaryEndpoint: 'HbA1c at 24 weeks', primaryResult: '-1.2% vs placebo', primaryEndpointMet: true,
  sampleSize: 600, ittPopulation: 590, saeCount: 12, deathCount: 1, ...over,
});
const csrs = [csr({}), csr({ studyId: 'S1', protocolNumber: 'BX-101', phase: '1', saeCount: 0, deathCount: 0 })];

const COMPOSED = {
  '2.3': buildM23QualityOverallSummary({ module3Sections: [], drugSubstanceName: 'BX-115', drugProductName: 'BX-115 tablets' }),
  '2.4': buildM24NonclinicalOverview({
    drugSubstanceName: 'BX-115',
    nonclinicalStudies: [{ studyId: 'T1', studyType: 'toxicology', species: 'rat', primaryFinding: 'no adverse findings', noael: '100 mg/kg', reportSection: '4.2.3.2' }],
  }),
  '2.5': buildM25ClinicalOverview({ csrs, indication: 'T2D', investigationalProduct: 'BX-115' }),
  '2.7': buildM27ClinicalSummary({ csrs, indication: 'T2D', investigationalProduct: 'BX-115' }),
} as const;

describe('each composer heads its sections as the record titles them', () => {
  it.each(Object.keys(COMPOSED))('%s: every heading line is the record’s code and title, in CTD order', (root) => {
    const lines = headings(COMPOSED[root as keyof typeof COMPOSED].narrative).filter(([code]) => !PART_HEADINGS_OWED.has(code));
    expect(lines.length).toBeGreaterThan(0);
    for (const [code, text] of lines) expect(text.toLowerCase(), code).toBe(ichHeadingTitle(code)?.toLowerCase());
    const codes = lines.map(([code]) => code);
    expect(codes).toEqual([...codes].sort(compareSectionCode));
  });

  it.each(['2.4', '2.5', '2.7'])('%s: every heading the record holds directly below the root is composed', (root) => {
    const codes = headings(COMPOSED[root as keyof typeof COMPOSED].narrative).map(([code]) => code);
    expect(codes.filter((c) => c.split('.').length === 3)).toEqual(children(root));
  });

  it('2.3: every drug substance and drug product heading is composed', () => {
    const codes = headings(COMPOSED['2.3'].narrative).map(([code]) => code).filter((c) => !PART_HEADINGS_OWED.has(c));
    expect(codes).toEqual([...children('2.3.S'), ...children('2.3.P')]);
  });
});

describe('the Clinical Summary states SAEs and deaths where the record puts them', () => {
  const lines = COMPOSED['2.7'].narrative.split('\n');
  const under = (code: string) => {
    const at = lines.findIndex((l) => l.startsWith(`${code} `));
    const next = lines.findIndex((l, i) => i > at && HEADING.test(l));
    return at < 0 ? '' : lines.slice(at + 1, next < 0 ? undefined : next).join('\n');
  };

  it('deaths under 2.7.4.2.1.2 and other serious adverse events under 2.7.4.2.1.3, never under 2.7.4.3', () => {
    expect(under('2.7.4.2.1.2')).toMatch(/\b1 death\(s\)/);
    expect(under('2.7.4.2.1.3')).toMatch(/\b12 serious adverse event\(s\)/);
    expect(COMPOSED['2.7'].narrative).not.toMatch(/^2\.7\.4\.3 /m);
  });
});
