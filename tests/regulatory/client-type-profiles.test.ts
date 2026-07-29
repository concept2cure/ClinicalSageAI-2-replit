import { describe, it, expect } from 'vitest';
import {
  getClientTypeProfile,
  verticalForIndustry,
  type IndustryMode,
  type Vertical,
} from '../../shared/regulatory/client-type-profiles';

const ALL_INDUSTRIES: IndustryMode[] = [
  'biotech', 'pharma', 'cro', 'medtech', 'academic', 'regulatory', 'medical_writing',
];

describe('client-type-profiles — catalog completeness', () => {
  it('defines profiles for all 7 industry modes', () => {
    for (const industry of ALL_INDUSTRIES) {
      const profile = getClientTypeProfile(industry);
      expect(profile, `Missing profile for "${industry}"`).not.toBeNull();
    }
  });

  it('every profile has all required fields', () => {
    for (const industry of ALL_INDUSTRIES) {
      const p = getClientTypeProfile(industry)!;
      expect(p.industry).toBe(industry);
      expect(p.vertical).toBeTruthy();
      expect(p.personaEmphasis.length).toBeGreaterThan(0);
      expect(Object.keys(p.terminology).length).toBeGreaterThan(0);
      expect(p.defaultApprovalPath).toBeTruthy();
      expect(p.defaultNeed).toBeTruthy();
    }
  });
});

describe('client-type-profiles — vertical mapping', () => {
  it('medtech maps to mdx vertical', () => {
    expect(verticalForIndustry('medtech')).toBe('mdx');
  });

  it('biotech maps to biopharma vertical', () => {
    expect(verticalForIndustry('biotech')).toBe('biopharma');
  });

  it('pharma maps to biopharma vertical', () => {
    expect(verticalForIndustry('pharma')).toBe('biopharma');
  });

  it('cro maps to biopharma vertical', () => {
    expect(verticalForIndustry('cro')).toBe('biopharma');
  });

  it('academic maps to biopharma vertical', () => {
    expect(verticalForIndustry('academic')).toBe('biopharma');
  });

  it('medical_writing maps to biopharma vertical', () => {
    expect(verticalForIndustry('medical_writing')).toBe('biopharma');
  });

  it('only medtech maps to mdx; all others to biopharma', () => {
    const verticals = ALL_INDUSTRIES.map((i) => verticalForIndustry(i));
    expect(verticals.filter((v) => v === 'mdx')).toHaveLength(1);
    expect(verticals.filter((v) => v === 'biopharma')).toHaveLength(6);
  });
});

describe('client-type-profiles — default needs', () => {
  it('medtech defaults to US_510K', () => {
    expect(getClientTypeProfile('medtech')!.defaultNeed).toBe('US_510K');
  });

  it('biotech defaults to US_IND', () => {
    expect(getClientTypeProfile('biotech')!.defaultNeed).toBe('US_IND');
  });

  it('pharma defaults to US_NDA', () => {
    expect(getClientTypeProfile('pharma')!.defaultNeed).toBe('US_NDA');
  });

  it('medical_writing defaults to CSR', () => {
    expect(getClientTypeProfile('medical_writing')!.defaultNeed).toBe('CSR');
  });

  it('cro defaults to US_IND', () => {
    expect(getClientTypeProfile('cro')!.defaultNeed).toBe('US_IND');
  });
});

describe('client-type-profiles — approval rigor', () => {
  it('medtech uses regulated_dual_review', () => {
    expect(getClientTypeProfile('medtech')!.defaultApprovalPath).toBe('regulated_dual_review');
  });

  it('cro uses signoff_required (sponsor sign-off)', () => {
    expect(getClientTypeProfile('cro')!.defaultApprovalPath).toBe('signoff_required');
  });

  it('academic uses single_reviewer', () => {
    expect(getClientTypeProfile('academic')!.defaultApprovalPath).toBe('single_reviewer');
  });

  it('pharma, biotech, regulatory, medical_writing use regulated_dual_review', () => {
    for (const i of ['pharma', 'biotech', 'regulatory', 'medical_writing'] as IndustryMode[]) {
      expect(getClientTypeProfile(i)!.defaultApprovalPath).toBe('regulated_dual_review');
    }
  });
});

describe('client-type-profiles — terminology overrides', () => {
  it('medtech calls the product "Device"', () => {
    expect(getClientTypeProfile('medtech')!.terminology['product']).toBe('Device');
  });

  it('cro calls the product "Study" and submission "Deliverable"', () => {
    const cro = getClientTypeProfile('cro')!;
    expect(cro.terminology['product']).toBe('Study');
    expect(cro.terminology['submission']).toBe('Deliverable');
  });

  it('medical_writing calls everything "Document"', () => {
    const mw = getClientTypeProfile('medical_writing')!;
    expect(mw.terminology['product']).toBe('Document');
    expect(mw.terminology['submission']).toBe('Document');
  });

  it('pharma calls the product "Program"', () => {
    expect(getClientTypeProfile('pharma')!.terminology['product']).toBe('Program');
  });
});

describe('client-type-profiles — query edge cases', () => {
  it('returns null for unknown industry', () => {
    expect(getClientTypeProfile('fintech')).toBeNull();
  });

  it('verticalForIndustry returns null for unknown industry', () => {
    expect(verticalForIndustry('fintech')).toBeNull();
  });

  it('case-insensitive lookup works', () => {
    expect(getClientTypeProfile('Medtech')).not.toBeNull();
    expect(getClientTypeProfile('PHARMA')).not.toBeNull();
  });

  it('whitespace-trimmed lookup works', () => {
    expect(getClientTypeProfile('  biotech  ')).not.toBeNull();
  });
});
