// @vitest-environment jsdom
/**
 * The protocol's consent tab shows the approval gate's verdict (2026-11-11, F1).
 *
 * It printed "% complete" from the `present` ticks. The gate that decides
 * approval also needs content, the wording 21 CFR 50.25 prescribes and every
 * element the form is now held to, so a form approval refuses could read
 * "100% complete". The tab now reads `consentGate`, the server's own verdict.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import { ConsentTab } from '../surfaces/ProtocolDevReviews';

afterEach(cleanup);

const form = (status = 'in_review') => ({ id: '1', title: 'ICF', version: '0.2', status, formsLinked: 1 });
const rows = [
  { id: '1', el: 'Risks', key: 'risks', required: true, present: true, complete: true },
  { id: '2', el: 'Confidentiality', key: 'confidentiality', required: true, present: true, complete: false },
];

describe('the consent tab', () => {
  it('a form whose every element is ticked but which the gate refuses is not "100% complete"', () => {
    const { container } = render(<ConsentTab doc={{
      consent: rows, consentForm: form(),
      consentGate: { requiredTotal: 11, requiredComplete: 1, pct: 9, readyToApprove: false, predates: [],
        findings: ['Required consent element "confidentiality" does not state that the Food and Drug Administration may inspect the records (21 CFR 50.25(a)(5)).'] },
    }} />);
    const text = container.textContent ?? '';
    expect(text).toContain('1 of 11 required elements complete');
    expect(text).toContain('9% complete');
    expect(text).not.toContain('100% complete');
    expect(text).toContain('This form cannot be approved yet.');
    expect(text).toContain('Food and Drug Administration may inspect');
  });

  it('says a complete form can be approved', () => {
    const { container } = render(<ConsentTab doc={{ consent: rows.map((r) => ({ ...r, complete: true })), consentForm: form(),
      consentGate: { requiredTotal: 2, requiredComplete: 2, pct: 100, readyToApprove: true, findings: [], predates: [] } }} />);
    expect(container.textContent).toContain('Every required element is complete, so this form can be approved.');
  });

  it('an approved form shows what it predates, and is not told it cannot be approved', () => {
    const { container } = render(<ConsentTab doc={{ consent: rows, consentForm: form('approved'),
      consentGate: { requiredTotal: 3, requiredComplete: 2, pct: 67, readyToApprove: false, findings: ['x'], predates: ['For an applicable clinical trial: the ClinicalTrials.gov statement'] } }} />);
    const text = container.textContent ?? '';
    expect(text).toContain('was approved before the platform held consent forms to');
    expect(text).toContain('ClinicalTrials.gov statement');
    expect(text).not.toContain('cannot be approved yet');
  });

  it('with no verdict from the server it prints no percentage', () => {
    const { container } = render(<ConsentTab doc={{ consent: rows, consentForm: form() }} />);
    expect(container.textContent).not.toMatch(/% complete/);
    expect(container.textContent).toContain('was not returned');
    expect(container.textContent).not.toContain('no elements recorded');
  });
});
