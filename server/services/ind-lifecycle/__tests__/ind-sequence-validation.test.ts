/**
 * eCTD sequence validation against the IND section map. Pure (no DB).
 */

import { describe, it, expect } from 'vitest';
import {
  validateSequenceLeaves,
  filingTypeForSequence,
  isSequenceFilingType,
  SEQUENCE_FILING_TYPES,
  IND_SAFETY_REPORT_SECTION,
  type SequenceFilingType,
} from '../ind-sequence-validation';
import { getRequiredSections } from '../../../../services/regulatory/ind-ectd-sections';
import { buildAmendmentIntent, type IndSafetyClassification } from '../ind-safety-report-service';

// All initial-required section codes, as leaves (exact match).
function allRequiredLeaves() {
  return getRequiredSections().map((s) => ({ sectionCode: s.code }));
}

/** Module 1 administrative leaves every post-original sequence carries (Form 1571 + cover letter). */
const ADMIN = [
  { sectionCode: 'm1.1', documentType: 'form_1571' },
  { sectionCode: 'm1.2', documentType: 'cover_letter' },
];

/** What persistAnnualReport files: the m1.13 annual-report leaf. */
const ANNUAL = [...ADMIN, { sectionCode: 'm1.13', documentType: 'ind_annual_report' }];

/** A 312.32 classification as the safety-report service produces it (only the fields buildAmendmentIntent reads matter). */
const FIFTEEN_DAY: IndSafetyClassification = {
  obligation: 'FIFTEEN_DAY',
  reportingWindowDays: 15,
  deadline: null,
  determinations: { serious: true, suspected: true, unexpected: true, fatalOrLifeThreatening: false },
  regulatoryBasis: '21 CFR 312.32(c)(1)(i)',
  rationale: 'serious, unexpected, suspected',
};

function codes(r: ReturnType<typeof validateSequenceLeaves>): string[] {
  return r.missing.map((m) => m.code);
}

describe('validateSequenceLeaves — initial IND (section-map required set)', () => {
  it('an empty sequence is invalid: every required section is missing', () => {
    const r = validateSequenceLeaves({ filingType: 'initial', leaves: [] });
    expect(r.valid).toBe(false);
    expect(r.presentCount).toBe(0);
    expect(r.missing.length).toBe(r.requiredCount);
  });

  it('a sequence with all required-section leaves is valid', () => {
    const r = validateSequenceLeaves({ filingType: 'initial', leaves: allRequiredLeaves() });
    expect(r.valid).toBe(true);
    expect(r.missing).toHaveLength(0);
    expect(r.presentCount).toBe(r.requiredCount);
  });

  it("normalizes the leading 'm' so 'm2.5' and '2.5' match", () => {
    const required = getRequiredSections().filter((s) => s.required);
    // Provide each required leaf but flip the leading 'm' on/off.
    const leaves = required.map((s) => ({
      sectionCode: s.code.startsWith('m') ? s.code.slice(1) : `m${s.code}`,
    }));
    const r = validateSequenceLeaves({ filingType: 'initial', leaves });
    expect(r.valid).toBe(true);
  });

  it('a descendant leaf satisfies a required parent section', () => {
    const required = getRequiredSections().filter((s) => s.required);
    const leaves = required.map((s) => ({ sectionCode: `${s.code}.99` })); // deeper leaf
    const r = validateSequenceLeaves({ filingType: 'initial', leaves });
    expect(r.valid).toBe(true);
  });

  it('flags leaves that map to no known CTD section', () => {
    const r = validateSequenceLeaves({
      filingType: 'initial',
      leaves: [...allRequiredLeaves(), { sectionCode: 'm9.9.9' }],
    });
    expect(r.unknownSections).toEqual(['m9.9.9']);
  });

  it("the 'initial' set is the section map's required flags at FDA Module 1 v2.3 headings (1.1, 1.2, 1.12.14, 1.14.4.1, 1.20)", () => {
    const r = validateSequenceLeaves({ filingType: 'initial', leaves: [] });
    expect(codes(r)).toEqual(expect.arrayContaining(['m1.1', 'm1.2', 'm1.12.14', 'm1.14.4.1', 'm1.20', 'm2', 'm3', 'm4', 'm5']));
    expect(r.requiredCount).toBe(getRequiredSections().length);
  });

  it('every filing type demands Form 1571 (1.1) and the cover letter (1.2)', () => {
    for (const filingType of SEQUENCE_FILING_TYPES) {
      const r = validateSequenceLeaves({ filingType, leaves: [] });
      expect(codes(r), filingType).toEqual(expect.arrayContaining(['m1.1', 'm1.2']));
    }
  });
});

describe("validateSequenceLeaves — 'amendment' (21 CFR 312.30 / 312.31)", () => {
  it('Form 1571 + cover letter + a 5.3.5.x protocol leaf is valid', () => {
    const r = validateSequenceLeaves({ filingType: 'amendment', leaves: [...ADMIN, { sectionCode: 'm5.3.5.1' }] });
    expect(r.valid).toBe(true);
    expect(r.requiredCount).toBe(3);
  });

  it('a 1.11 information-amendment leaf satisfies the amended-content requirement', () => {
    const r = validateSequenceLeaves({ filingType: 'amendment', leaves: [...ADMIN, { sectionCode: 'm1.11.1' }] });
    expect(r.valid).toBe(true);
  });

  it('Module 2–5 information-amendment content (312.31(a)(1) CMC at 3.2.S) satisfies it', () => {
    const r = validateSequenceLeaves({ filingType: 'amendment', leaves: [...ADMIN, { sectionCode: 'm3.2.S.4' }] });
    expect(r.valid).toBe(true);
  });

  it('Form 1571 + cover letter with no amended content is invalid, naming the accepted placements', () => {
    const r = validateSequenceLeaves({ filingType: 'amendment', leaves: ADMIN });
    expect(r.valid).toBe(false);
    expect(r.missing).toHaveLength(1);
    expect(r.missing[0].code).toBe('m5.3.5');
    expect(r.missing[0].alternatives).toEqual(expect.arrayContaining(['m1.11', 'm3']));
    expect(r.missing[0].regulatoryRef).toMatch(/312\.3[01]/);
  });

  it('does not demand the initial-IND sections (1.20, 1.14.4.1, Module 2–4)', () => {
    const r = validateSequenceLeaves({ filingType: 'amendment', leaves: [{ sectionCode: 'm5.3.5.1' }] });
    expect(codes(r)).toEqual(['m1.1', 'm1.2']);
  });
});

describe("validateSequenceLeaves — 'safety_report' (21 CFR 312.32)", () => {
  it('the leaves buildAmendmentIntent places, plus Form 1571 + cover letter, are valid', () => {
    const intent = buildAmendmentIntent(FIFTEEN_DAY, { hasIcsr: true })!;
    const r = validateSequenceLeaves({ filingType: 'safety_report', leaves: [...ADMIN, ...intent.leaves] });
    expect(r.valid).toBe(true);
    expect(r.unknownSections).toEqual([]);
  });

  it('missing the safety-report leaf fails with a finding naming its placement', () => {
    const r = validateSequenceLeaves({ filingType: 'safety_report', leaves: ADMIN });
    expect(r.valid).toBe(false);
    expect(codes(r)).toEqual([IND_SAFETY_REPORT_SECTION]);
    expect(r.missing[0].title).toMatch(/safety report/i);
    expect(r.missing[0].module).toBe('M1');
    expect(r.missing[0].regulatoryRef).toMatch(/312\.32/);
  });

  it('an ICSR narrative at 5.3.5 alone does not stand in for the 1.12.4 report', () => {
    const r = validateSequenceLeaves({ filingType: 'safety_report', leaves: [...ADMIN, { sectionCode: 'm5.3.5' }] });
    expect(r.valid).toBe(false);
    expect(codes(r)).toEqual([IND_SAFETY_REPORT_SECTION]);
  });
});

describe("validateSequenceLeaves — 'annual' (21 CFR 312.33)", () => {
  it('Form 1571 + cover letter + a 1.13 leaf is valid', () => {
    const r = validateSequenceLeaves({ filingType: 'annual', leaves: ANNUAL });
    expect(r.valid).toBe(true);
    expect(r.requiredCount).toBe(3);
  });

  it('a 1.13.x sub-heading leaf (e.g. 1.13.15 DSUR) satisfies the 1.13 requirement', () => {
    const r = validateSequenceLeaves({ filingType: 'annual', leaves: [...ADMIN, { sectionCode: 'm1.13.15' }] });
    expect(r.valid).toBe(true);
  });

  it('missing the 1.13 leaf is invalid', () => {
    const r = validateSequenceLeaves({ filingType: 'annual', leaves: ADMIN });
    expect(r.valid).toBe(false);
    expect(codes(r)).toEqual(['m1.13']);
    expect(r.missing[0].regulatoryRef).toMatch(/312\.33/);
  });

  it("judged as 'initial' — what every caller did before filingTypeForSequence — it is told to add 1.20 and 1.14.4.1", () => {
    // Documented pre-fix behaviour: the annual report was held to the original-IND set.
    const asInitial = validateSequenceLeaves({ filingType: 'initial', leaves: ANNUAL });
    expect(asInitial.valid).toBe(false);
    expect(codes(asInitial)).toEqual(expect.arrayContaining(['m1.20', 'm1.14.4.1']));

    // Routed through the mapping it is judged as an annual report and passes.
    const routed = validateSequenceLeaves({ filingType: filingTypeForSequence('annual', ANNUAL), leaves: ANNUAL });
    expect(routed.filingType).toBe('annual');
    expect(routed.valid, `missing: ${codes(routed).join(', ')}`).toBe(true);
  });
});

describe("validateSequenceLeaves — 'response' and 'withdrawal'", () => {
  it('response: Form 1571 + cover letter + Module 2–5 content is valid', () => {
    const r = validateSequenceLeaves({ filingType: 'response', leaves: [...ADMIN, { sectionCode: 'm4.2.3' }] });
    expect(r.valid).toBe(true);
  });

  it('response: a 1.11 information-amendment leaf is accepted as the response content', () => {
    const r = validateSequenceLeaves({ filingType: 'response', leaves: [...ADMIN, { sectionCode: 'm1.11.3' }] });
    expect(r.valid).toBe(true);
  });

  it('response: Module 1 correspondence alone is invalid', () => {
    const r = validateSequenceLeaves({ filingType: 'response', leaves: [...ADMIN, { sectionCode: 'm1.12.1' }] });
    expect(r.valid).toBe(false);
    expect(r.missing).toHaveLength(1);
    expect(r.missing[0].alternatives).toEqual(expect.arrayContaining(['m1.11', 'm2', 'm3', 'm4', 'm5']));
  });

  it('withdrawal: Form 1571 + cover letter + a 1.5 application-status leaf is valid', () => {
    const r = validateSequenceLeaves({ filingType: 'withdrawal', leaves: [...ADMIN, { sectionCode: 'm1.5.1' }] });
    expect(r.valid).toBe(true);
  });

  it('withdrawal: missing the 1.5 leaf is invalid', () => {
    const r = validateSequenceLeaves({ filingType: 'withdrawal', leaves: ADMIN });
    expect(r.valid).toBe(false);
    expect(codes(r)).toEqual(['m1.5']);
    expect(r.missing[0].regulatoryRef).toMatch(/312\.38/);
  });
});

describe('filingTypeForSequence', () => {
  it('maps ectd_sequences.type to the validator filing type', () => {
    const expected: Record<string, SequenceFilingType> = {
      original: 'initial',
      amendment: 'amendment',
      variation: 'amendment',
      response: 'response',
      annual: 'annual',
      withdrawal: 'withdrawal',
    };
    for (const [type, filingType] of Object.entries(expected)) {
      expect(filingTypeForSequence(type), type).toBe(filingType);
    }
  });

  it("returns 'safety_report' when any leaf's documentType is a safety report / ICSR, regardless of sequence type", () => {
    expect(filingTypeForSequence('amendment', [{ documentType: 'protocol' }, { documentType: 'ind_safety_report' }])).toBe('safety_report');
    expect(filingTypeForSequence('amendment', [{ documentType: 'icsr_narrative' }])).toBe('safety_report');
    expect(filingTypeForSequence('original', [{ documentType: 'IND-Safety-Report' }])).toBe('safety_report');
    expect(filingTypeForSequence('annual', [{ documentType: 'ICSR' }])).toBe('safety_report');
  });

  it('a non-safety documentType leaves the sequence type in charge', () => {
    expect(filingTypeForSequence('amendment', [{ documentType: 'protocol' }, { documentType: null }])).toBe('amendment');
    expect(filingTypeForSequence('annual', ANNUAL)).toBe('annual');
  });

  it('the persisted 312.32 intent (type amendment + ind_safety_report leaf) maps to safety_report', () => {
    const intent = buildAmendmentIntent(FIFTEEN_DAY)!;
    expect(filingTypeForSequence(intent.sequenceType, intent.leaves)).toBe('safety_report');
  });

  it("falls back to the strictest set ('initial') for an unknown or absent type", () => {
    expect(filingTypeForSequence(undefined)).toBe('initial');
    expect(filingTypeForSequence(null)).toBe('initial');
    expect(filingTypeForSequence('bogus')).toBe('initial');
  });
});

describe('isSequenceFilingType', () => {
  it('accepts exactly the validator filing types', () => {
    for (const t of SEQUENCE_FILING_TYPES) expect(isSequenceFilingType(t)).toBe(true);
    expect(SEQUENCE_FILING_TYPES).toEqual(['initial', 'amendment', 'safety_report', 'annual', 'response', 'withdrawal']);
    for (const bad of ['original', 'nope', '', undefined, null, 1]) expect(isSequenceFilingType(bad), String(bad)).toBe(false);
  });
});
