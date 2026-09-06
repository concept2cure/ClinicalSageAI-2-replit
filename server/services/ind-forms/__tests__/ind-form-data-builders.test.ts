/**
 * Tests for the pure IND form data builders. No DB, no filesystem, no clock —
 * deterministic mapping of project metadata → typed field maps + missingRequired.
 */

import { describe, it, expect } from 'vitest';
import {
  buildForm1571,
  buildForm1572,
  buildAllForm1572,
  buildForm3674,
  buildForm3454,
  buildForm3455,
  buildForm356h,
  buildForm1574,
  labelsForForm,
  FORM_1571,
  FORM_1572,
  FORM_3674,
  FORM_3454,
  FORM_3455,
  FORM_356H,
  FORM_1574,
  type IndProjectMetadata,
} from '../ind-form-data-builders';

// A reasonably complete, valid project so we can subtract fields to test gaps.
function fullMeta(): IndProjectMetadata {
  return {
    sponsorName: 'Acme Therapeutics, Inc.',
    indNumber: '',
    drugName: 'ACME-001',
    indType: 'Commercial IND',
    studyPhase: 'Phase 1',
    indication: 'Advanced solid tumors',
    serialNumber: '0000',
    studyTitle: 'A Phase 1 Study of ACME-001',
    protocolNumbers: 'ACME-001-101',
    nctNumber: 'NCT00000000',
    applicationType: 'NDA',
    applicationNumber: 'NDA 123456',
    dosageForm: 'Tablet',
    routeOfAdministration: 'Oral',
    irbNameAddress: 'Acme IRB, Boston, MA',
    irbChairName: 'Dr. Robin Chair',
    irbAssuranceNumber: 'FWA00000001',
    sponsor: {
      name: 'Acme Therapeutics, Inc.',
      address: '1 Acme Way, Cambridge, MA',
      contactName: 'Jane Doe',
      contactPhone: '617-555-0100',
      contactEmail: 'jane@acme.example',
      authorizedRepName: 'John Officer',
      authorizedRepTitle: 'Chief Medical Officer',
    },
    investigators: [
      {
        name: 'Dr. Pat Smith',
        qualifications: 'MD, board-certified oncologist; CV attached',
        facilityNameAddress: 'Acme Cancer Center, Boston, MA',
        clinicalLabNameAddress: 'Acme Central Lab, Boston, MA',
        irbNameAddress: 'Acme IRB, Boston, MA',
        subInvestigators: ['Dr. Lee', 'Dr. Gomez'],
        financial: { hasDisclosableInterest: false },
      },
    ],
    ctgovCertificationBasis: 'requirements_met',
  };
}

describe('buildForm1571', () => {
  it('maps sponsor/drug metadata and reuses registry field ids', () => {
    const built = buildForm1571(fullMeta());
    expect(built.formId).toBe(FORM_1571);
    expect(built.fields.sponsor_name).toBe('Acme Therapeutics, Inc.');
    expect(built.fields.drug_name).toBe('ACME-001');
    // registry-reused ids present
    expect(built.fields.ind_type).toBe('Commercial IND');
    expect(built.fields.phase_of_study).toBe('Phase 1');
    expect(built.missingRequired).toEqual([]);
  });

  it('falls back to sponsor.name when sponsorName is absent', () => {
    const meta = fullMeta();
    meta.sponsorName = '';
    const built = buildForm1571(meta);
    expect(built.fields.sponsor_name).toBe('Acme Therapeutics, Inc.');
  });

  it('reports missingRequired in declaration order', () => {
    const built = buildForm1571({});
    expect(built.missingRequired).toContain('sponsor_name');
    expect(built.missingRequired).toContain('drug_name');
    expect(built.missingRequired).toContain('indication');
    expect(built.missingRequired).toContain('ind_type');
    expect(built.missingRequired).toContain('phase_of_study');
    // sponsor_address required too
    expect(built.missingRequired).toContain('sponsor_address');
    // authorized_rep_name is NOT required: the 1571 signature block is a
    // signature, not a data box, and buildForm356h treats the same id the same
    // way. While it was required, no official fill of this form could qualify.
    expect(built.missingRequired).not.toContain('authorized_rep_name');
    // order: sponsor_name before drug_name before phase_of_study
    const i = built.missingRequired;
    expect(i.indexOf('sponsor_name')).toBeLessThan(i.indexOf('drug_name'));
    expect(i.indexOf('drug_name')).toBeLessThan(i.indexOf('phase_of_study'));
  });

  it('is deterministic — same input yields equal field maps', () => {
    const a = buildForm1571(fullMeta());
    const b = buildForm1571(fullMeta());
    expect(a).toEqual(b);
  });
});

describe('buildForm1572', () => {
  it('maps a single investigator and joins sub-investigators', () => {
    const meta = fullMeta();
    const built = buildForm1572(meta.investigators![0], meta);
    expect(built.formId).toBe(FORM_1572);
    expect(built.fields.investigator_name).toBe('Dr. Pat Smith');
    expect(built.fields.facility_name).toBe('Acme Cancer Center, Boston, MA');
    expect(built.fields.sub_investigators).toBe('Dr. Lee; Dr. Gomez');
    expect(built.fields.study_title).toBe('A Phase 1 Study of ACME-001');
    expect(built.missingRequired).toEqual([]);
  });

  it('detects missing required investigator fields', () => {
    const built = buildForm1572({}, {});
    expect(built.missingRequired).toContain('investigator_name');
    expect(built.missingRequired).toContain('facility_name');
    expect(built.missingRequired).toContain('irb_name');
    // Aligned to the OFFICIAL FDA 1572: Box 2 qualifications are an attachment
    // (db_cv / db_oth_qual checkboxes) and there is no study-title field, so
    // neither is an inline-required field (this lets the official fill qualify).
    expect(built.missingRequired).not.toContain('investigator_qualifications');
    expect(built.missingRequired).not.toContain('study_title');
  });

  it('buildAllForm1572 yields one form per investigator', () => {
    const meta = fullMeta();
    meta.investigators!.push({
      name: 'Dr. Two',
      qualifications: 'MD',
      facilityNameAddress: 'Site 2',
      irbNameAddress: 'IRB 2',
    });
    const all = buildAllForm1572(meta);
    expect(all).toHaveLength(2);
    expect(all[0].fields.investigator_name).toBe('Dr. Pat Smith');
    expect(all[1].fields.investigator_name).toBe('Dr. Two');
  });

  it('buildAllForm1572 returns empty array when no investigators', () => {
    expect(buildAllForm1572({})).toEqual([]);
  });
});

describe('buildForm3674', () => {
  it('selects the requirements_met certification checkbox', () => {
    const built = buildForm3674(fullMeta());
    expect(built.formId).toBe(FORM_3674);
    expect(built.fields.cert_requirements_met).toBe(true);
    expect(built.fields.cert_not_applicable).toBe(false);
    expect(built.fields.cert_submitted_no_data).toBe(false);
    expect(built.fields.certification_selected).toBe(true);
    expect(built.fields.nct_number).toBe('NCT00000000');
    expect(built.missingRequired).toEqual([]);
  });

  it('flags missing certification basis as missingRequired', () => {
    const meta = fullMeta();
    delete meta.ctgovCertificationBasis;
    const built = buildForm3674(meta);
    expect(built.fields.certification_selected).toBe(false);
    expect(built.missingRequired).toContain('certification_selected');
  });

  it('requires sponsor and drug names', () => {
    const built = buildForm3674({});
    expect(built.missingRequired).toContain('sponsor_name');
    expect(built.missingRequired).toContain('drug_name');
    expect(built.missingRequired).toContain('certification_selected');
  });
});

describe('buildForm3454 (financial certification: NONE)', () => {
  it('certifies no disclosable interests when none exist', () => {
    const built = buildForm3454(fullMeta());
    expect(built.formId).toBe(FORM_3454);
    expect(built.fields.no_disclosable_interests).toBe(true);
    expect(built.fields.investigator_names).toBe('Dr. Pat Smith');
    expect(built.missingRequired).toEqual([]);
  });

  it('marks no_disclosable_interests as missingRequired when an investigator has interests', () => {
    const meta = fullMeta();
    meta.investigators![0].financial = {
      hasDisclosableInterest: true,
      disclosureDescription: 'Equity stake',
    };
    const built = buildForm3454(meta);
    expect(built.fields.no_disclosable_interests).toBe(false);
    expect(built.missingRequired).toContain('no_disclosable_interests');
  });

  it('does NOT certify none when there are no covered investigators to certify about', () => {
    const meta = fullMeta();
    meta.investigators = [];
    const built = buildForm3454(meta);
    expect(built.fields.no_disclosable_interests).toBe(false);
    expect(built.missingRequired).toContain('no_disclosable_interests');
  });

  it('does NOT auto-certify none when investigator financial interest is UNKNOWN (absent)', () => {
    // The master-data path (investigatorToInfo) omits `financial`, so it arrives
    // undefined. Absence must never be read as "confirmed none" (21 CFR Part 54).
    const meta = fullMeta();
    delete (meta.investigators![0] as { financial?: unknown }).financial;
    const built = buildForm3454(meta);
    expect(built.fields.no_disclosable_interests).toBe(false);
    expect(built.missingRequired).toContain('no_disclosable_interests');
  });
});

describe('buildForm3455 (financial disclosure)', () => {
  it('discloses the first investigator with the 21 CFR 54.4 interest-type checkboxes', () => {
    const meta = fullMeta();
    meta.investigators![0].financial = {
      hasDisclosableInterest: true,
      disclosureDescription: 'Significant equity interest',
      interestTypes: ['significant_equity', 'proprietary_interest'],
    };
    const built = buildForm3455(meta);
    expect(built.formId).toBe(FORM_3455);
    expect(built.fields.investigator_name).toBe('Dr. Pat Smith');
    // Only the selected 21 CFR 54.4 categories are checked (verified check mapping).
    expect(built.fields.interest_significant_equity).toBe(true);
    expect(built.fields.interest_proprietary).toBe(true);
    expect(built.fields.interest_financial_arrangement).toBe(false);
    expect(built.fields.interest_significant_payments).toBe(false);
    expect(built.missingRequired).toEqual([]);
  });

  it('flags a disclosure with no interest type selected — a QC gate, not a form field', () => {
    const meta = fullMeta();
    meta.investigators![0].financial = { hasDisclosableInterest: true }; // no interestTypes
    const built = buildForm3455(meta);
    expect(built.fields.interest_type_selected).toBe(false);
    // Reported for QC readiness...
    expect(built.missingRequired).toContain('interest_type_selected');
    // ...but excluded from requiredFields so it never blocks the official fill.
    expect(built.requiredFields).not.toContain('interest_type_selected');
  });

  it('needs no investigator/interest type when nothing is disclosed', () => {
    // fullMeta's investigator has hasDisclosableInterest:false → not disclosing.
    const built = buildForm3455(fullMeta());
    expect(built.missingRequired).not.toContain('interest_type_selected');
    expect(built.missingRequired).not.toContain('investigator_name');
  });
});

describe('labelsForForm', () => {
  it('returns non-empty label maps for every supported form', () => {
    for (const id of [FORM_1571, FORM_1572, FORM_3674, FORM_3454, FORM_3455, FORM_356H, FORM_1574]) {
      const labels = labelsForForm(id);
      expect(Object.keys(labels).length).toBeGreaterThan(0);
    }
  });

  it('returns an empty map for an unknown form id', () => {
    expect(labelsForForm('FDA_9999')).toEqual({});
  });
});

describe('NDA/BLA and IRB forms', () => {
  it('builds Form 356h from marketing-application metadata', () => {
    const built = buildForm356h(fullMeta());
    expect(built.formId).toBe(FORM_356H);
    expect(built.fields.application_type).toBe('NDA');
    expect(built.fields.route_of_administration).toBe('Oral');
    expect(built.missingRequired).toEqual([]);
    expect(built.validationErrors).toEqual([]);
  });

  it('requires an application number for supplements and rejects unknown application types', () => {
    const supplement = fullMeta();
    supplement.applicationType = 'Supplement';
    delete supplement.applicationNumber;
    expect(buildForm356h(supplement).missingRequired).toContain('application_number');

    const invalid = fullMeta();
    (invalid as any).applicationType = 'PMA';
    expect(buildForm356h(invalid).validationErrors).toEqual([
      expect.objectContaining({ fieldId: 'application_type', code: 'INVALID_OPTION' }),
    ]);
  });

  it('builds Form 1574 and fails closed on missing IRB chair', () => {
    const meta = fullMeta();
    delete meta.irbChairName;
    const built = buildForm1574(meta);
    expect(built.formId).toBe(FORM_1574);
    expect(built.missingRequired).toContain('irb_chair_name');
  });
});

describe('the protocol number is never borrowed from the IND serial number', () => {
  // The serial number is the IND submission sequence (0000, 0001…). The protocol
  // number identifies the study. Both builders used to fall back from one to the
  // other, and the 1572 map feeds db_prot_name_code — Box 6 of the official form
  // — so an investigator signed a 1572 whose protocol number read "0000".
  const META = { sponsorName: 'Acme Bio', drugName: 'ACME-001', serialNumber: '0000' };

  it('1572 leaves the protocol number blank rather than printing the serial', () => {
    const built = buildForm1572({ name: 'Dr Pat Smith', facilityName: 'Site A', irbName: 'WCG IRB' }, META);
    expect(built.fields.protocol_numbers).toBe('');
    expect(built.fields.protocol_numbers).not.toBe('0000');
  });

  it('1574 leaves it blank AND reports it missing, instead of silently passing the gate', () => {
    const built = buildForm1574(META);
    expect(built.fields.protocol_number).toBe('');
    expect(built.missingRequired).toContain('protocol_number');
  });

  it('a real protocol number is still carried through both forms', () => {
    const withProtocol = { ...META, protocolNumbers: 'C2C-1042-101' };
    expect(buildForm1572({ name: 'Dr Pat Smith' }, withProtocol).fields.protocol_numbers).toBe('C2C-1042-101');
    const f1574 = buildForm1574(withProtocol);
    expect(f1574.fields.protocol_number).toBe('C2C-1042-101');
    expect(f1574.missingRequired).not.toContain('protocol_number');
  });
});
