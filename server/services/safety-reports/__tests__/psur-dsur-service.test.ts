import { describe, it, expect } from 'vitest';
import { generatePsurStructure, generateDsurStructure } from '../psur-dsur-service';

const PSUR_INPUT = {
  productName: 'TestDrug XR',
  substanceName: 'testazolam',
  reportingPeriodStart: '2024-01-01',
  reportingPeriodEnd: '2024-12-31',
  marketingAuthorizations: [
    { country: 'US', holderName: 'Acme Pharma Inc.', approvalDate: '2020-06-15' },
    { country: 'EU', holderName: 'Acme Pharma EU', approvalDate: '2021-03-20' },
  ],
};

const DSUR_INPUT = {
  productName: 'TestDrug XR',
  substanceName: 'testazolam',
  developmentPhase: 'Phase 3',
  reportingPeriodStart: '2024-01-01',
  reportingPeriodEnd: '2024-12-31',
};

describe('generatePsurStructure', () => {
  it('returns all 19 E2C(R2) sections', () => {
    const result = generatePsurStructure(PSUR_INPUT);

    expect(result.status).toBe('structure_generated');
    expect(result.sections).toHaveLength(19);
  });

  it('includes reporting period in output', () => {
    const result = generatePsurStructure(PSUR_INPUT);

    expect(result.reportingPeriod).toEqual({
      start: '2024-01-01',
      end: '2024-12-31',
    });
  });

  it('all 19 sections are marked as required', () => {
    const result = generatePsurStructure(PSUR_INPUT);
    const requiredSections = result.sections.filter((s) => s.required);
    expect(requiredSections).toHaveLength(19);
  });

  it('sections have sequential numbering from 1 to 19', () => {
    const result = generatePsurStructure(PSUR_INPUT);
    const numbers = result.sections.map((s) => s.number);
    for (let i = 1; i <= 19; i++) {
      expect(numbers).toContain(String(i));
    }
  });

  it('each section has title and guidance text', () => {
    const result = generatePsurStructure(PSUR_INPUT);
    for (const section of result.sections) {
      expect(section.title).toBeTruthy();
      expect(section.guidance).toBeTruthy();
      expect(section.guidance.length).toBeGreaterThan(10);
    }
  });

  it('includes key ICH E2C(R2) sections by title', () => {
    const result = generatePsurStructure(PSUR_INPUT);
    const titles = result.sections.map((s) => s.title);

    expect(titles).toContain('Executive Summary');
    expect(titles).toContain('Introduction');
    expect(titles).toContain('Worldwide Marketing Authorization Status');
    expect(titles).toContain('Signal Evaluation and Risk Analysis');
    expect(titles).toContain('Benefit Evaluation');
    expect(titles).toContain('Integrated Benefit-Risk Analysis');
    expect(titles).toContain('Conclusions and Actions');
  });

  it('rejects missing productName', () => {
    expect(() => generatePsurStructure({ ...PSUR_INPUT, productName: '' })).toThrow(
      'productName is required'
    );
  });

  it('rejects missing reportingPeriodStart', () => {
    expect(() => generatePsurStructure({ ...PSUR_INPUT, reportingPeriodStart: '' })).toThrow(
      'reportingPeriodStart is required'
    );
  });

  it('rejects empty marketingAuthorizations', () => {
    expect(() =>
      generatePsurStructure({ ...PSUR_INPUT, marketingAuthorizations: [] })
    ).toThrow('at least one');
  });

  it('is deterministic — same input yields same output', () => {
    const result1 = generatePsurStructure(PSUR_INPUT);
    const result2 = generatePsurStructure(PSUR_INPUT);
    expect(result1).toEqual(result2);
  });
});

describe('generateDsurStructure', () => {
  it('returns all E2F sections', () => {
    const result = generateDsurStructure(DSUR_INPUT);

    expect(result.status).toBe('structure_generated');
    // 14 numbered sections + 1 appendix section
    expect(result.sections.length).toBeGreaterThanOrEqual(14);
  });

  it('includes reporting period in output', () => {
    const result = generateDsurStructure(DSUR_INPUT);

    expect(result.reportingPeriod).toEqual({
      start: '2024-01-01',
      end: '2024-12-31',
    });
  });

  it('each section has title and guidance text', () => {
    const result = generateDsurStructure(DSUR_INPUT);
    for (const section of result.sections) {
      expect(section.title).toBeTruthy();
      expect(section.guidance).toBeTruthy();
      expect(section.guidance.length).toBeGreaterThan(10);
    }
  });

  it('includes key ICH E2F sections by title', () => {
    const result = generateDsurStructure(DSUR_INPUT);
    const titles = result.sections.map((s) => s.title);

    expect(titles).toContain('Executive Summary');
    expect(titles).toContain('Introduction');
    expect(titles).toContain('Update on Ongoing and Completed Clinical Trials');
    expect(titles).toContain('Safety Signal Evaluation');
    expect(titles).toContain('Overall Safety Assessment');
    expect(titles).toContain('Conclusions');
  });

  it('rejects missing productName', () => {
    expect(() => generateDsurStructure({ ...DSUR_INPUT, productName: '' })).toThrow(
      'productName is required'
    );
  });

  it('rejects missing developmentPhase', () => {
    expect(() => generateDsurStructure({ ...DSUR_INPUT, developmentPhase: '' })).toThrow(
      'developmentPhase is required'
    );
  });

  it('rejects missing reportingPeriodEnd', () => {
    expect(() => generateDsurStructure({ ...DSUR_INPUT, reportingPeriodEnd: '' })).toThrow(
      'reportingPeriodEnd is required'
    );
  });

  it('is deterministic — same input yields same output', () => {
    const result1 = generateDsurStructure(DSUR_INPUT);
    const result2 = generateDsurStructure(DSUR_INPUT);
    expect(result1).toEqual(result2);
  });
});
