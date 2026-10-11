/**
 * AnA's informed-consent QC checks what 21 CFR 50.25 requires, and cites the
 * GCP guideline in force (2026-10-08, D2; AnA's document expertise).
 *
 * Measured at 0b8a8c3d before the change (server/services/ana/gcp-consent.ts):
 *   - 21 CFR 50.25(c), the ClinicalTrials.gov statement an applicable clinical
 *     trial's consent must carry, was not checked at all;
 *   - of the additional elements, 50.25(b)(2) (termination by the
 *     investigator) and (b)(4) (consequences of withdrawing) were absent;
 *   - the cues were single words: "study" credited the research statement and
 *     "records" credited confidentiality, whose specific requirement — that
 *     FDA may inspect the records (50.25(a)(5)) — was never looked for;
 *   - every citation was ICH E6(R2), which E6(R3) superseded on 2025-01-06
 *     (currency fact ich-e6r3-gcp-step4).
 */
import { describe, it, expect } from 'vitest';
import { adviseGcp, reviewInformedConsent, listGcpDomains } from '../gcp-consent';

const ids = (xs: Array<{ id: string }>) => xs.map((x) => x.id);

describe('the required elements of 21 CFR 50.25', () => {
  it('checks the ClinicalTrials.gov statement (50.25(c)) as required', () => {
    const r = reviewInformedConsent('This research study is voluntary.');
    expect(ids(r.missingRequired)).toContain('clinicaltrials_gov');
    const withIt = reviewInformedConsent(
      'A description of this clinical trial will be available on http://www.ClinicalTrials.gov, as required by U.S. Law.',
    );
    expect(ids(withIt.present)).toContain('clinicaltrials_gov');
  });

  it('checks termination by the investigator (b)(2) and the consequences of withdrawing (b)(4)', () => {
    const r = reviewInformedConsent('This research study is voluntary.');
    expect(ids(r.missingAdditional)).toEqual(expect.arrayContaining(['investigator_termination', 'withdrawal_consequences']));
  });

  it('does not credit confidentiality from the word "records": it looks for FDA inspection of the records', () => {
    const vague = reviewInformedConsent('Your records will be kept in a locked cabinet.');
    expect(ids(vague.missingRequired)).toContain('confidentiality');
    const full = reviewInformedConsent(
      'Records identifying you will be kept confidential to the extent permitted by law; the Food and Drug Administration (FDA) may inspect the records.',
    );
    expect(ids(full.present)).toContain('confidentiality');
  });

  it('does not credit the research statement from the word "study" alone', () => {
    const r = reviewInformedConsent('Please read this before your next study visit.');
    expect(ids(r.missingRequired)).toContain('research_statement');
  });

  it('reports counts of what the wording shows, not a percentage of compliance', () => {
    const r = reviewInformedConsent('This research study is voluntary.');
    expect(r.brief).toMatch(/\d+ of \d+ required elements found in the wording/);
    expect(r.brief).not.toMatch(/% of required/);
  });
});

describe('the GCP guideline in force', () => {
  it('cites ICH E6(R3), not the superseded E6(R2)', () => {
    const all = JSON.stringify([adviseGcp(), adviseGcp('sponsor'), listGcpDomains(), reviewInformedConsent('x')]);
    expect(all).toMatch(/E6\(R3\)/);
    expect(all).not.toMatch(/E6\(R2\)(?! \(superseded)/);
  });
});
