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
  labelsForForm,
  FORM_1571,
  FORM_1572,
  FORM_3674,
  FORM_3454,
  FORM_3455,
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
    expect(built.missingRequired).toContain('authorized_rep_name');
    // sponsor_address required too
    expect(built.missingRequired).toContain('sponsor_address');
    // order: sponsor_name before drug_name before authorized_rep_name
    const i = built.missingRequired;
    expect(i.indexOf('sponsor_name')).toBeLessThan(i.indexOf('drug_name'));
    expect(i.indexOf('drug_name')).toBeLessThan(i.indexOf('authorized_rep_name'));
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
    expect(built.missingRequired).toContain('investigator_qualifications');
    expect(built.missingRequired).toContain('facility_name');
    expect(built.missingRequired).toContain('irb_name_address');
    expect(built.missingRequired).toContain('study_title');
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

  it('treats no investigators as "none have interests" (vacuously true)', () => {
    const meta = fullMeta();
    meta.investigators = [];
    const built = buildForm3454(meta);
    expect(built.fields.no_disclosable_interests).toBe(true);
  });
});

describe('buildForm3455 (financial disclosure)', () => {
  it('assembles disclosure lines for investigators with interests', () => {
    const meta = fullMeta();
    meta.investigators![0].financial = {
      hasDisclosableInterest: true,
      disclosureDescription: 'Significant equity interest',
    };
    const built = buildForm3455(meta);
    expect(built.formId).toBe(FORM_3455);
    expect(built.fields.disclosure_details).toBe(
      'Dr. Pat Smith: Significant equity interest',
    );
    expect(built.fields.disclosure_descriptions_complete).toBe(true);
    expect(built.missingRequired).toEqual([]);
  });

  it('flags incomplete descriptions as missingRequired', () => {
    const meta = fullMeta();
    meta.investigators![0].financial = { hasDisclosableInterest: true };
    const built = buildForm3455(meta);
    expect(built.fields.disclosure_descriptions_complete).toBe(false);
    expect(built.missingRequired).toContain('disclosure_descriptions_complete');
    // disclosure_details is required because there IS something to disclose
    expect(built.missingRequired).toContain('disclosure_details');
  });

  it('does not require disclosure_details when nothing to disclose, but still needs sponsor/drug', () => {
    const built = buildForm3455(fullMeta());
    // no investigator has interests → disclosure_details not required
    expect(built.missingRequired).not.toContain('disclosure_details');
    // descriptions-complete is false (nothing disclosable) → flagged
    expect(built.missingRequired).toContain('disclosure_descriptions_complete');
  });
});

describe('labelsForForm', () => {
  it('returns non-empty label maps for every supported form', () => {
    for (const id of [FORM_1571, FORM_1572, FORM_3674, FORM_3454, FORM_3455]) {
      const labels = labelsForForm(id);
      expect(Object.keys(labels).length).toBeGreaterThan(0);
    }
  });

  it('returns an empty map for an unknown form id', () => {
    expect(labelsForForm('FDA_9999')).toEqual({});
  });
});
