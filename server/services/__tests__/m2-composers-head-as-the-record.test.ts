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
 * C4c's cases are at the end.
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
import { buildEnrichedM24 } from '../preclinical/nonclinical-m24-adapter';
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

/** The text under a heading, up to the next heading line. */
const under = (narrative: string, code: string) => {
  const lines = narrative.split('\n');
  const at = lines.findIndex((l) => l.startsWith(`${code} `));
  const next = lines.findIndex((l, i) => i > at && HEADING.test(l));
  return at < 0 ? '' : lines.slice(at + 1, next < 0 ? undefined : next).join('\n');
};

describe('the Clinical Summary states SAEs and deaths where the record puts them', () => {
  it('deaths under 2.7.4.2.1.2 and other serious adverse events under 2.7.4.2.1.3, never under 2.7.4.3', () => {
    expect(under(COMPOSED['2.7'].narrative, '2.7.4.2.1.2')).toMatch(/\b1 death\(s\)/);
    expect(under(COMPOSED['2.7'].narrative, '2.7.4.2.1.3')).toMatch(/\b12 serious adverse event\(s\)/);
    expect(COMPOSED['2.7'].narrative).not.toMatch(/^2\.7\.4\.3 /m);
  });

  it('counts not extracted: both sections say so, and neither states a number', () => {
    const r = buildM27ClinicalSummary({ csrs: [csr({}), csr({ studyId: 'S2', saeCount: undefined, deathCount: undefined })], indication: 'T2D', investigationalProduct: 'BX-115' });
    for (const code of ['2.7.4.2.1.2', '2.7.4.2.1.3']) {
      expect(under(r.narrative, code), code).toMatch(/have not been extracted for 1 of 2 study/);
      expect(under(r.narrative, code), code).not.toMatch(/\d+ (death|serious adverse event)\(s\) reported/);
    }
  });
});

/*
 * C4c (2026-10-26), the review of C4a/C4b (wf_4db15643-511): AnA's 2.4 draft
 * appended an invented "2.4.4.1" after 2.4.6; the literature placeholders said
 * nothing was cited beside caller text that can cite; 2.7.6 asked for synopses
 * the record's brief says a US eCTD does not repeat; the record's headings the
 * composers do not write were not open items.
 */
describe('C4c: what the review of C4b found', () => {
  it('2.4 with a target-organ profile: every heading is the record’s, and the profile sits inside 2.4.4, before 2.4.5', () => {
    const { summary } = buildEnrichedM24({
      studies: [{ studyType: 'repeat_dose_tox', species: 'rat', keyFindings: 'Hepatocellular hypertrophy.' }],
      findings: [{ organ: 'liver', finding: 'hepatocellular hypertrophy' }, { organ: 'kidney', finding: 'tubular necrosis' }],
    });
    for (const [code, text] of headings(summary.narrative)) expect(text.toLowerCase(), code).toBe(ichHeadingTitle(code)?.toLowerCase());
    const lines = summary.narrative.split('\n');
    const at = lines.findIndex((l) => /target-organ adversity profile/i.test(l));
    expect(at).toBeGreaterThan(lines.findIndex((l) => l.startsWith('2.4.4 ')));
    expect(at).toBeLessThan(lines.findIndex((l) => l.startsWith('2.4.5 ')));
  });

  it.each([['2.4', '2.4.6', 'Module 4.3'], ['2.5', '2.5.7', 'Module 5.4'], ['2.7', '2.7.5', 'Module 5.4']] as const)(
    '%s: %s never says nothing is cited, and asks for every reference the document cites',
    (root, code, copies) => {
      const text = under(COMPOSED[root].narrative, code);
      expect(text).not.toMatch(/No literature is cited/);
      expect(text).toMatch(/List here every reference/);
      expect(text).toContain(copies);
    },
  );

  it('2.7.6 leads with the Listing of Clinical Studies, as the record’s brief does, and is an open item', () => {
    const text = under(COMPOSED['2.7'].narrative, '2.7.6');
    expect(text).toMatch(/Listing of Clinical Studies/);
    expect(text).toMatch(/not repeated in Module 2/);
    expect(COMPOSED['2.7'].gaps.some((g) => /2\.7\.6/.test(g))).toBe(true);
  });

  it.each(['2.5', '2.7'] as const)('%s: every unconditional heading the record holds below it that is not composed is an open item', (root) => {
    const { narrative, gaps } = COMPOSED[root];
    const order = ctdRecordSubtree(root).map((h) => h.code);
    const written = new Set([root, ...headings(narrative).map(([code]) => code)]);
    const parent = (c: string) => c.slice(0, c.lastIndexOf('.'));
    const missing = ctdRecordSubtree(root).filter((h) => !h.condition && !written.has(h.code) && written.has(parent(h.code))).map((h) => h.code);
    expect(missing.length).toBeGreaterThan(0);
    const text = gaps.join('; ');
    const runs = [...text.matchAll(/(\d+(?:\.\d+)+)(?:–(\d+(?:\.\d+)+))?/g)].map((m) => [order.indexOf(m[1]), order.indexOf(m[2] ?? m[1])]);
    for (const code of missing) {
      const i = order.indexOf(code);
      expect(runs.some(([a, b]) => a >= 0 && b >= 0 && a <= i && i <= b), code).toBe(true);
    }
  });
});
