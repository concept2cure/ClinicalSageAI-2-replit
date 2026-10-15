/**
 * One record of the elements of informed consent, and every AnA path that
 * says what a consent form must contain reads it (D2, 2026-10-15).
 *
 * Measured at 5cd343ee5 before the change:
 *   - design_informed_consent (gcp-operations-knowledge.ts) cited
 *     "21 CFR 50.25(b)(7)", "(b)(8)" and "(b)(9)" — paragraphs 50.25(b) does
 *     not have; the content is 45 CFR 46.116(c)(7)–(9), a Common Rule element;
 *   - review_informed_consent (gcp-consent.ts) and design_informed_consent
 *     answered "what must my ICF contain" with different element sets;
 *   - review_informed_consent called the 50.25(c) ClinicalTrials.gov statement
 *     missing on every form, though it applies only to an applicable clinical
 *     trial;
 *   - the IND war-game auditor numbered the 50.25(a) elements wrongly
 *     ("(1) purpose, (2) procedures … (8) contacts and voluntary"), and left
 *     out the research statement and 50.25(c).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  INFORMED_CONSENT_ELEMENTS,
  CONSENT_ELEMENTS_BASIS,
  consentElementsFor,
} from '../../shared/regulatory/informed-consent-elements';
import { basisProblems } from '../../shared/regulatory/regulatory-basis';
import { reviewInformedConsent } from '../../server/services/ana/gcp-consent';
import { designInformedConsent } from '../../server/services/gcp-operations/gcp-operations-knowledge';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

describe('the record', () => {
  it('cites only paragraphs that exist: 50.25(a)(1)–(8), (b)(1)–(6), (c)', () => {
    for (const el of INFORMED_CONSENT_ELEMENTS) {
      expect(el.cfr50 || el.hhs46, el.id).toBeTruthy();
      if (el.cfr50) expect(el.cfr50, el.id).toMatch(/^21 CFR 50\.25\((a\)\([1-8]|b\)\([1-6]|c)\)$/);
    }
    expect(basisProblems(CONSENT_ELEMENTS_BASIS)).toEqual([]);
  });

  it('FDA and Common Rule element sets differ only by the Common Rule-only elements and 50.25(c)', () => {
    const fda = consentElementsFor('fda').map((e) => e.id);
    const cr = consentElementsFor('common_rule').map((e) => e.id);
    expect(fda).toContain('clinicaltrials_gov');
    expect(cr).not.toContain('clinicaltrials_gov');
    expect(cr).toEqual(expect.arrayContaining(['key_information', 'future_use', 'commercial_profit', 'return_of_results', 'genome_sequencing']));
    expect(fda).not.toContain('key_information');
  });
});

describe('design_informed_consent reads the record', () => {
  const all = (r: ReturnType<typeof designInformedConsent>) =>
    [...r.requiredElements, ...r.additionalElements, ...r.applicableAdditionalElements];

  it('cites no 21 CFR 50.25(b) paragraph past (b)(6); the biospecimen elements are 45 CFR 46.116(c)(7)–(9)', () => {
    const r = designInformedConsent({ studyType: 'interventional', collectsBiospecimens: true, commercialProfitPotential: true, genomicData: true });
    const cites = all(r).map((e) => e.citation).join('\n');
    expect(cites).not.toMatch(/50\.25\(b\)\([7-9]\)/);
    expect(cites).toMatch(/45 CFR 46\.116\(c\)\(7\)/);
    expect(cites).toMatch(/45 CFR 46\.116\(c\)\(9\)/);
  });

  it('holds the same required FDA elements the consent review checks', () => {
    const r = designInformedConsent({ studyType: 'interventional' });
    const required = r.requiredElements.map((e) => e.id).sort();
    const reviewed = consentElementsFor('fda').filter((e) => e.applicability === 'required').map((e) => e.id).sort();
    expect(required).toEqual(reviewed);
  });

  it('asks whether the trial is an applicable clinical trial rather than assuming it from the study type', () => {
    const unknown = designInformedConsent({ studyType: 'interventional' });
    expect(unknown.warnings.join(' ')).toMatch(/applicable clinical trial/i);
    const act = designInformedConsent({ studyType: 'interventional', applicableClinicalTrial: true } as never);
    expect(act.requiredElements.map((e) => e.id)).toContain('clinicaltrials_gov');
  });
});

describe('review_informed_consent does not call 50.25(c) missing when it may not apply', () => {
  const text = 'This research study is voluntary.';
  it('with ACT status unknown, the ClinicalTrials.gov statement is a question, not a missing element', () => {
    const r = reviewInformedConsent(text);
    expect(r.missingRequired.map((m) => m.id)).not.toContain('clinicaltrials_gov');
    expect(r.brief).toMatch(/applicable clinical trial/i);
  });
  it('for an applicable clinical trial it is required', () => {
    const r = reviewInformedConsent(text, { applicableClinicalTrial: true });
    expect(r.missingRequired.map((m) => m.id)).toContain('clinicaltrials_gov');
  });
});

describe('what the IND auditor and the protocol question flow tell clients', () => {
  it('the IND auditor lists the 50.25(a) elements in their order, with the research statement and 50.25(c)', () => {
    const src = read('server/services/ana/intelligence-questions/war-game/auditors/ind-auditor.ts');
    expect(src).not.toMatch(/\(1\) purpose, \(2\) procedures/);
    expect(src).toMatch(/consentElementsFor|INFORMED_CONSENT_ELEMENTS/);
  });
  it('the protocol flow states the required elements from the record', () => {
    const src = read('server/services/ana/intelligence-questions/flows/protocol-development.ts');
    expect(src).toMatch(/consentElementsFor|INFORMED_CONSENT_ELEMENTS/);
  });
});
