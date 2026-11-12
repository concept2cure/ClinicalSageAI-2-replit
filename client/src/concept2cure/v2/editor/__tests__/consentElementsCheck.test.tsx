// @vitest-environment jsdom
/**
 * P-102: the editor's Check, on an informed-consent document, shows the
 * 21 CFR 50.25 required elements and which the document satisfies.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ConsentElementsCheck, type ConsentElementsCheckData } from '../ConsentElementsCheck';

afterEach(cleanup);

const el = (key: string, title: string, section: string, complete: boolean) =>
  ({ key, title, section, required: true, complete, citation: '21 CFR 50.25(a)' });
const base: ConsentElementsCheckData = {
  basis: '21 CFR 50.25; 45 CFR 46.116',
  required_total: 3,
  required_complete: 1,
  ready: false,
  findings: ['"Extent of confidentiality of records" does not state that the Food and Drug Administration may inspect the records (21 CFR 50.25(a)(5)).'],
  elements: [el('risks', 'Reasonably foreseeable risks', '3', true), el('confidentiality', 'Extent of confidentiality of records', '6', false), el('clinicaltrials_gov', 'The ClinicalTrials.gov statement', '11', false)],
  applicable_clinical_trial_note: 'It is counted here until the study is recorded as not being one.',
};

describe('the consent elements check', () => {
  it('states the gate\'s count, why an element is not complete, and where it is drafted', () => {
    const text = render(<ConsentElementsCheck check={base} />).container.textContent ?? '';
    expect(text).toContain('1 of 3 required elements of informed consent are complete in this document.');
    expect(text).toContain('Food and Drug Administration may inspect');
    expect(text).toContain('Not complete: Extent of confidentiality of records (section 6)');
    expect(text).toContain('Complete: Reasonably foreseeable risks (section 3)');
    expect(text).toContain('until the study is recorded as not being one');
  });

  it('a complete document is not called compliant', () => {
    const done = { ...base, ready: true, required_complete: 3, findings: [], elements: base.elements.map((e) => ({ ...e, complete: true })) };
    const text = render(<ConsentElementsCheck check={done} />).container.textContent ?? '';
    expect(text).toContain('3 of 3 required elements');
    expect(text).toContain('An IRB still decides whether the form is adequate.');
    expect(text).not.toMatch(/compliant/i);
    expect(text).not.toContain('until the study is recorded');
  });

  it('is mounted in the editor\'s Check panel only when the server sent it', () => {
    const src = readFileSync(join(__dirname, '..', 'DocumentWorkbench.tsx'), 'utf8');
    expect(src).toContain('{check.consent_elements && <ConsentElementsCheck check={check.consent_elements} />}');
  });
});
