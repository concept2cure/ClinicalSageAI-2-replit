/**
 * FCOI deterministic logic (C2C-01) — form-type derivation, the 21 CFR 54
 * completeness gate, and the certification content hash. Pure, no DB/LLM.
 */

import { describe, it, expect } from 'vitest';
import {
  deriveFormType,
  validateDisclosureCompleteness,
  computeDisclosureContentHash,
  FCOI_INTEREST_CATEGORIES,
  type DisclosureSnapshot,
} from '../fcoi-logic';

const clean3454: DisclosureSnapshot = {
  hasDisclosableInterests: false,
  formType: 'FDA_3454',
  disclosurePeriodStart: '2025-01-01',
  disclosurePeriodEnd: '2026-01-01',
  interests: [],
};

const good3455: DisclosureSnapshot = {
  hasDisclosableInterests: true,
  formType: 'FDA_3455',
  disclosurePeriodStart: '2025-01-01',
  disclosurePeriodEnd: '2026-01-01',
  interests: [
    { interestType: 'EQUITY_INTEREST', description: 'Sponsor stock options', monetaryValue: '60000.00', arrangementsToMinimizeBias: 'Blinded analysis; no involvement in data lock.' },
  ],
};

describe('deriveFormType', () => {
  it('maps no-interests to 3454 and interests to 3455', () => {
    expect(deriveFormType(false)).toBe('FDA_3454');
    expect(deriveFormType(true)).toBe('FDA_3455');
  });
});

describe('FCOI_INTEREST_CATEGORIES', () => {
  it('encodes the four 21 CFR 54.2 categories with citations', () => {
    expect(FCOI_INTEREST_CATEGORIES).toHaveLength(4);
    for (const c of FCOI_INTEREST_CATEGORIES) expect(c.citation).toMatch(/21 CFR 54\.2/);
  });
});

describe('validateDisclosureCompleteness', () => {
  it('passes a clean 3454 certification (low risk)', () => {
    const r = validateDisclosureCompleteness(clean3454);
    expect(r.findings).toHaveLength(0);
    expect(r.riskLevel).toBe('low');
  });

  it('passes a complete 3455 with mitigation (low risk)', () => {
    const r = validateDisclosureCompleteness(good3455);
    expect(r.riskLevel).toBe('low');
  });

  it('flags a 3455 with no interest rows as high risk', () => {
    const r = validateDisclosureCompleteness({ ...good3455, interests: [] });
    expect(r.riskLevel).toBe('high');
    expect(r.findings.some((f) => f.severity === 'critical')).toBe(true);
  });

  it('flags form_type / flag mismatch as critical', () => {
    const r = validateDisclosureCompleteness({ ...clean3454, formType: 'FDA_3455' });
    expect(r.findings.some((f) => /does not match/.test(f.message))).toBe(true);
    expect(r.riskLevel).toBe('high');
  });

  it('flags a 3454 that nonetheless carries interest rows', () => {
    const r = validateDisclosureCompleteness({ ...clean3454, interests: [{ interestType: 'EQUITY_INTEREST', description: 'x' }] });
    expect(r.riskLevel).toBe('high');
  });

  it('flags missing disclosure period as major (medium risk)', () => {
    const r = validateDisclosureCompleteness({ ...good3455, disclosurePeriodStart: null, disclosurePeriodEnd: null });
    expect(r.findings.some((f) => /period/i.test(f.message))).toBe(true);
  });

  it('flags an interest missing arrangements-to-minimize-bias as minor', () => {
    const r = validateDisclosureCompleteness({
      ...good3455,
      interests: [{ interestType: 'EQUITY_INTEREST', description: 'Sponsor equity' }],
    });
    expect(r.findings.some((f) => /minimize/i.test(f.message))).toBe(true);
  });

  it('flags an unknown interest_type as critical', () => {
    const r = validateDisclosureCompleteness({
      ...good3455,
      interests: [{ interestType: 'BRIBE', description: 'x' }],
    });
    expect(r.findings.some((f) => /unknown interest_type/.test(f.message))).toBe(true);
  });
});

describe('computeDisclosureContentHash', () => {
  it('is stable regardless of interest ordering', () => {
    const a: DisclosureSnapshot = {
      ...good3455,
      interests: [
        { interestType: 'EQUITY_INTEREST', description: 'b', arrangementsToMinimizeBias: 'x' },
        { interestType: 'PROPRIETARY_INTEREST', description: 'a', arrangementsToMinimizeBias: 'y' },
      ],
    };
    const b: DisclosureSnapshot = { ...a, interests: [a.interests[1], a.interests[0]] };
    expect(computeDisclosureContentHash(a)).toBe(computeDisclosureContentHash(b));
  });

  it('changes when a material field changes (post-sign edit invalidates)', () => {
    const before = computeDisclosureContentHash(good3455);
    const after = computeDisclosureContentHash({ ...good3455, interests: [{ ...good3455.interests[0], monetaryValue: '999999.00' }] });
    expect(before).not.toBe(after);
  });
});
