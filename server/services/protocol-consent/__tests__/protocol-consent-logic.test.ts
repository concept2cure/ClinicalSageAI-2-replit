/**
 * Informed Consent Form pure logic — the seed set and the completeness/approval
 * gate. Pure, no DB/LLM. Since 2026-10-22 the seed set is the shared record
 * (shared/regulatory/informed-consent-elements.ts) for an FDA-regulated form;
 * tests/regulatory/consent-form-approval-gate.test.ts pins the prescribed
 * wording and the forms seeded before that.
 */

import { describe, it, expect } from 'vitest';
import {
  consentElementTemplates,
  evaluateConsentCompleteness,
  type ConsentElementView,
} from '../protocol-consent-logic';

const TEMPLATES = consentElementTemplates();
const WORDING: Record<string, string> = {
  confidentiality: 'Records are confidential; the FDA may inspect the records.',
  clinicaltrials_gov: 'A description of this clinical trial will be available on http://www.ClinicalTrials.gov.',
};

describe('consentElementTemplates', () => {
  it('requires the ten 21 CFR 50.25(a) elements and, ACT status unknown, the 50.25(c) statement', () => {
    const requiredKeys = TEMPLATES.filter((e) => e.required).map((e) => e.elementKey);
    for (const key of ['research_statement', 'purpose', 'procedures', 'risks', 'benefits', 'alternatives', 'confidentiality', 'compensation_injury', 'contacts', 'voluntary', 'clinicaltrials_gov']) {
      expect(requiredKeys).toContain(key);
    }
    expect(requiredKeys.length).toBe(11);
  });

  it('cites 21 CFR 50.25 on every element and includes the 50.25(b) elements as optional', () => {
    expect(TEMPLATES.every((e) => /21 CFR 50\.25/.test(e.basis))).toBe(true);
    const optional = TEMPLATES.filter((e) => !e.required).map((e) => e.elementKey);
    expect(optional).toContain('unforeseeable_risks');
    expect(optional.length).toBe(6);
  });
});

describe('evaluateConsentCompleteness', () => {
  function seed(): ConsentElementView[] {
    return TEMPLATES.map((e) => ({ elementKey: e.elementKey, required: e.required, present: false, content: null }));
  }
  function complete(): ConsentElementView[] {
    return TEMPLATES.map((e) => ({ elementKey: e.elementKey, required: e.required, present: true, content: WORDING[e.elementKey] ?? 'Drafted content for this element.' }));
  }

  it('flags every required element on a freshly seeded form and is not ready', () => {
    const r = evaluateConsentCompleteness(seed());
    expect(r.readyToApprove).toBe(false);
    expect(r.requiredPresentPct).toBe(0);
    expect(r.missingRequired.length).toBe(11);
    expect(r.findings.every((f) => f.severity === 'critical')).toBe(true);
    expect(r.findings[0].message).toMatch(/21 CFR 50\.25\(a\)\(1\)/);
  });

  it('is ready to approve when all required elements are present with content', () => {
    const r = evaluateConsentCompleteness(complete());
    expect(r.readyToApprove).toBe(true);
    expect(r.requiredPresentPct).toBe(100);
    expect(r.missingRequired).toEqual([]);
    expect(r.findings.filter((f) => f.severity === 'critical')).toEqual([]);
  });

  it('treats present-but-empty content as not satisfied', () => {
    const els = complete();
    els[0] = { ...els[0], content: '   ' };
    const r = evaluateConsentCompleteness(els);
    expect(r.readyToApprove).toBe(false);
    expect(r.missingRequired).toContain(els[0].elementKey);
    expect(r.findings.some((f) => /has no content|included but/.test(f.message))).toBe(true);
  });

  it('warns on optional elements marked present without content but stays ready', () => {
    const els = complete();
    const optionalIdx = els.findIndex((e) => !e.required);
    els[optionalIdx] = { ...els[optionalIdx], present: true, content: '' };
    const r = evaluateConsentCompleteness(els);
    expect(r.readyToApprove).toBe(true);
    expect(r.findings.some((f) => f.severity === 'warning')).toBe(true);
  });

  /* This test read "reports 100% for an empty element list (vacuously
     complete)", and it was the defect written down. readyToApprove is the gate
     approveConsentFormTx enforces, so a consent form with no element rows --
     created but never populated, or whose elements failed to load -- scored
     100%, had an empty missingRequired list, passed the gate, and was set to
     approved. An informed-consent form with no elements at all, through
     45 CFR 46.116. */
  it('an empty element list is not a complete form and does not pass the gate', () => {
    const r = evaluateConsentCompleteness([]);
    expect(r.requiredPresentPct).toBeNull();
    expect(r.readyToApprove).toBe(false);
    expect(r.requiredTotal).toBe(0);
  });

  /* The refusal message approveConsentFormTx throws is built by joining the
     CRITICAL findings. With none it would have read "Cannot approve — " and
     stopped, so the empty case has to produce one. */
  it('the empty case states why, so the refusal carries a sentence', () => {
    const critical = evaluateConsentCompleteness([]).findings.filter((f) => f.severity === 'critical');
    expect(critical).toHaveLength(1);
    expect(critical[0].message).toMatch(/no required elements recorded/i);
    expect(critical[0].message).toMatch(/46\.116/);
  });

  /* A form that HAS required elements, all satisfied, still approves. The new
     state must not swallow a real assessment. */
  it('a form whose required elements are all satisfied still passes the gate', () => {
    const r = evaluateConsentCompleteness(complete());
    expect(r.readyToApprove).toBe(true);
    expect(r.requiredPresentPct).toBe(100);
  });

  it('rounds partial completion percent across required elements', () => {
    const els = seed();
    // satisfy 3 of 11 required → 27%
    for (let i = 0; i < 3; i++) els[i] = { ...els[i], present: true, content: 'x' };
    const r = evaluateConsentCompleteness(els);
    expect(r.requiredPresent).toBe(3);
    expect(r.requiredPresentPct).toBe(27);
  });
});
