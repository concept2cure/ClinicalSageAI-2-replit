/**
 * IND cover letter assembler — deterministic letter body + gap detection. No DB.
 */

import { describe, it, expect } from 'vitest';
import { assembleCoverLetter, type CoverLetterInput } from '../ind-cover-letter-service';

function input(overrides: Partial<CoverLetterInput> = {}): CoverLetterInput {
  return {
    sponsorName: 'Acme Therapeutics',
    sponsorAddress: '1 Main St, Boston, MA',
    drugName: 'C2C-001',
    indication: 'NSCLC',
    submissionType: 'original',
    serialNumber: '0000',
    fdaDivision: 'Division of Oncology 1',
    contactName: 'Dr. Jane Roe',
    contactPhone: '+1-617-555-0100',
    contactEmail: 'jane@acme.example',
    signatoryName: 'John Doe',
    signatoryTitle: 'VP Regulatory',
    date: '2026-03-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('assembleCoverLetter', () => {
  it('builds an original-IND letter with the right RE line and default purpose', () => {
    const m = assembleCoverLetter(input());
    expect(m.reportType).toBe('IND_COVER_LETTER');
    expect(m.indNumber).toBeNull();
    expect(m.body).toContain('RE: Initial Investigational New Drug Application — C2C-001 for NSCLC');
    expect(m.body).toContain('Serial Number 0000');
    expect(m.body).toContain('initial Investigational New Drug Application');
    expect(m.body).toContain('01 March 2026');
    expect(m.body).toContain('Dr. Jane Roe at +1-617-555-0100 / jane@acme.example');
    expect(m.gaps).toHaveLength(0);
  });

  it('renders an absent or unparsable date as a placeholder, never as 1 January 1970', () => {
    const noDate = assembleCoverLetter(input({ date: undefined }));
    expect(noDate.body).toContain('[Date]');
    expect(noDate.body).not.toMatch(/1970/);
    const badDate = assembleCoverLetter(input({ date: 'not a date' }));
    expect(badDate.body).toContain('[Date]');
    expect(badDate.body).not.toMatch(/1970|NaN/);
  });

  it('uses the IND number in the RE line when assigned (amendment)', () => {
    const m = assembleCoverLetter(input({ indNumber: '123456', submissionType: 'protocol_amendment' }));
    expect(m.body).toContain('RE: IND 123456 — C2C-001');
    expect(m.body).toContain('Protocol Amendment');
    expect(m.body).toContain('21 CFR 312.30');
  });

  it('flags missing required fields and renders placeholders', () => {
    const m = assembleCoverLetter({ sponsorName: '', drugName: '', submissionType: 'original' } as CoverLetterInput);
    expect(m.gaps).toEqual(expect.arrayContaining(['sponsorName', 'drugName', 'signatoryName']));
    expect(m.body).toContain('[Sponsor Name]');
    expect(m.body).toContain('[Drug Name]');
    expect(m.body).toContain('[Authorized Representative]');
  });

  it('renders supplied contents as bullets', () => {
    const m = assembleCoverLetter(input({ contents: ['Form FDA 1571', 'Clinical protocol', 'Investigator’s Brochure'] }));
    expect(m.body).toContain('  • Form FDA 1571');
    expect(m.body).toContain('  • Investigator’s Brochure');
  });

  it('is deterministic for identical input', () => {
    expect(assembleCoverLetter(input()).body).toBe(assembleCoverLetter(input()).body);
  });
});
