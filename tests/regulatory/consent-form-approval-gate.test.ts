/**
 * The consent-form approval gate holds a form to the platform's one record of
 * the elements of informed consent (D2, 2026-10-22; decision delegated by the
 * founder 2026-10-21).
 *
 * Measured at 86a37c740 before the change: protocol-consent-logic.ts seeded a
 * new form from its own fifteen-row list citing only 45 CFR 46.116, so an
 * FDA-regulated form could be signed as approved
 *   - with a confidentiality element that never says FDA may inspect the
 *     records (21 CFR 50.25(a)(5)), and
 *   - with no ClinicalTrials.gov statement for an applicable clinical trial
 *     (21 CFR 50.25(c)) — the form had no such element at all.
 * The gate checked only "marked present and not empty".
 */
import { describe, it, expect } from 'vitest';
import {
  consentElementTemplates,
  evaluateConsentCompleteness,
  missingTemplateElements,
  type ConsentElementView,
} from '../../server/services/protocol-consent/protocol-consent-logic';

const FILLED: Record<string, string> = {
  confidentiality: 'Your records will be kept confidential. The Food and Drug Administration may inspect the records of this study.',
  clinicaltrials_gov: 'A description of this clinical trial will be available on http://www.ClinicalTrials.gov, as required by U.S. Law.',
};
const filled = (keys: { elementKey: string; required: boolean }[]): ConsentElementView[] =>
  keys.map((e) => ({ elementKey: e.elementKey, required: e.required, present: true, content: FILLED[e.elementKey] ?? 'Drafted content.' }));

describe('a new consent form is seeded from the shared record', () => {
  it('holds the 21 CFR 50.25(a) elements, the research statement among them, cited to 21 CFR 50.25', () => {
    const t = consentElementTemplates();
    const required = t.filter((e) => e.required).map((e) => e.elementKey);
    for (const k of ['research_statement', 'purpose', 'procedures', 'risks', 'benefits', 'alternatives', 'confidentiality', 'compensation_injury', 'contacts', 'voluntary']) {
      expect(required).toContain(k);
    }
    expect(t.find((e) => e.elementKey === 'confidentiality')!.basis).toMatch(/21 CFR 50\.25\(a\)\(5\)/);
  });

  it('applicable-clinical-trial status: unknown or yes requires the ClinicalTrials.gov statement; no makes it optional', () => {
    const req = (act?: boolean | null) => consentElementTemplates({ applicableClinicalTrial: act }).find((e) => e.elementKey === 'clinicaltrials_gov')!.required;
    expect(req(undefined)).toBe(true);
    expect(req(null)).toBe(true);
    expect(req(true)).toBe(true);
    expect(req(false)).toBe(false);
  });
});

describe('the approval gate', () => {
  const templates = consentElementTemplates();

  it('refuses a confidentiality element that does not say FDA may inspect the records', () => {
    const els = filled(templates).map((e) => (e.elementKey === 'confidentiality' ? { ...e, content: 'Your records will be kept confidential.' } : e));
    const r = evaluateConsentCompleteness(els, { expected: templates });
    expect(r.readyToApprove).toBe(false);
    expect(r.missingRequired).toContain('confidentiality');
    expect(r.findings.find((f) => f.severity === 'critical')!.message).toMatch(/Food and Drug Administration may inspect[\s\S]*21 CFR 50\.25\(a\)\(5\)/);
  });

  it('refuses an applicable clinical trial form without the ClinicalTrials.gov statement', () => {
    const els = filled(templates).map((e) => (e.elementKey === 'clinicaltrials_gov' ? { ...e, content: 'Results will be posted.' } : e));
    const r = evaluateConsentCompleteness(els, { expected: templates });
    expect(r.readyToApprove).toBe(false);
    expect(r.missingRequired).toContain('clinicaltrials_gov');
  });

  it('approves a form that carries every element with the required wording', () => {
    const r = evaluateConsentCompleteness(filled(templates), { expected: templates });
    expect(r.readyToApprove).toBe(true);
    expect(r.requiredPresentPct).toBe(100);
  });

  it('a required element the form does not have at all is missing, not silently absent', () => {
    const els = filled(templates).filter((e) => e.elementKey !== 'clinicaltrials_gov');
    const r = evaluateConsentCompleteness(els, { expected: templates });
    expect(r.readyToApprove).toBe(false);
    expect(r.missingRequired).toEqual(['clinicaltrials_gov']);
    expect(r.findings.find((f) => f.severity === 'critical')!.message).toMatch(/not yet on this form[\s\S]*21 CFR 50\.25\(c\)/);
  });
});

describe('a form seeded before the change', () => {
  const LEGACY = ['purpose_duration', 'procedures', 'risks', 'benefits', 'alternatives', 'confidentiality', 'compensation', 'contacts', 'voluntary']
    .map((k) => ({ elementKey: k, required: true }))
    .concat(['unforeseeable_risks', 'involuntary_termination', 'additional_costs', 'withdrawal_consequences', 'new_findings', 'number_of_subjects'].map((k) => ({ elementKey: k, required: false })));

  it('its old element keys count for the elements they always covered', () => {
    const templates = consentElementTemplates();
    expect(missingTemplateElements(LEGACY, templates).map((e) => e.elementKey)).toEqual(['clinicaltrials_gov']);
  });

  it('is held to the ClinicalTrials.gov statement until it is added and drafted', () => {
    const templates = consentElementTemplates();
    const r = evaluateConsentCompleteness(filled(LEGACY), { expected: templates });
    expect(r.readyToApprove).toBe(false);
    expect(r.missingRequired).toEqual(['clinicaltrials_gov']);
  });
});
