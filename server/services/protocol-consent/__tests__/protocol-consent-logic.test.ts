/**
 * Informed Consent Form pure logic — required-element seed set and the
 * completeness/approval gate (45 CFR 46.116). Pure, no DB/LLM.
 */

import { describe, it, expect } from 'vitest';
import {
  REQUIRED_CONSENT_ELEMENTS,
  consentElementTemplates,
  evaluateConsentCompleteness,
  type ConsentElementView,
} from '../protocol-consent-logic';

describe('REQUIRED_CONSENT_ELEMENTS', () => {
  it('includes the nine basic 45 CFR 46.116(b) elements as required', () => {
    const requiredKeys = REQUIRED_CONSENT_ELEMENTS.filter((e) => e.required).map((e) => e.elementKey);
    for (const key of ['purpose_duration', 'procedures', 'risks', 'benefits', 'alternatives', 'confidentiality', 'compensation', 'contacts', 'voluntary']) {
      expect(requiredKeys).toContain(key);
    }
    expect(requiredKeys.length).toBe(9);
  });

  it('cites 45 CFR 46.116 on every element and includes additional (c) elements as optional', () => {
    expect(REQUIRED_CONSENT_ELEMENTS.every((e) => e.basis === '45 CFR 46.116')).toBe(true);
    const optional = REQUIRED_CONSENT_ELEMENTS.filter((e) => !e.required).map((e) => e.elementKey);
    expect(optional).toContain('unforeseeable_risks');
    expect(optional.length).toBeGreaterThan(0);
  });

  it('consentElementTemplates returns the canonical set', () => {
    expect(consentElementTemplates()).toBe(REQUIRED_CONSENT_ELEMENTS);
  });
});

describe('evaluateConsentCompleteness', () => {
  function seed(): ConsentElementView[] {
    return REQUIRED_CONSENT_ELEMENTS.map((e) => ({ elementKey: e.elementKey, required: e.required, present: false, content: null }));
  }
  function complete(): ConsentElementView[] {
    return REQUIRED_CONSENT_ELEMENTS.map((e) => ({ elementKey: e.elementKey, required: e.required, present: true, content: 'Drafted content for this element.' }));
  }

  it('flags every required element on a freshly seeded form and is not ready', () => {
    const r = evaluateConsentCompleteness(seed());
    expect(r.readyToApprove).toBe(false);
    expect(r.requiredPresentPct).toBe(0);
    expect(r.missingRequired.length).toBe(9);
    expect(r.findings.every((f) => f.severity === 'critical')).toBe(true);
    expect(r.findings[0].message).toMatch(/45 CFR 46\.116/);
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

  it('reports 100% for an empty element list (vacuously complete)', () => {
    const r = evaluateConsentCompleteness([]);
    expect(r.requiredPresentPct).toBe(100);
    expect(r.readyToApprove).toBe(true);
    expect(r.requiredTotal).toBe(0);
  });

  it('rounds partial completion percent across required elements', () => {
    const els = seed();
    // satisfy 3 of 9 required → 33%
    for (let i = 0; i < 3; i++) els[i] = { ...els[i], present: true, content: 'x' };
    const r = evaluateConsentCompleteness(els);
    expect(r.requiredPresent).toBe(3);
    expect(r.requiredPresentPct).toBe(33);
  });
});
