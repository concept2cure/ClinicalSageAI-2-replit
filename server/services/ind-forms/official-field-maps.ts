/**
 * Reviewed maps: our canonical builder field id → the OFFICIAL FDA AcroForm
 * field name embedded in the fillable PDF.
 *
 * These names come from the official (decrypted) FDA fillable forms and were
 * verified by enumerating the template's AcroForm fields (pdf-lib getFields()).
 * The onboarding step (scripts/ind-forms/onboard-fda-form.mjs) writes the map
 * for a form into that asset's reviewed manifest; runtime fills against the
 * manifest, and these constants are the reviewed source of truth + test fixture.
 *
 * A canonical field with NO entry here has no inline widget on the official form
 * (e.g. FDA 1572 Box 2 qualifications is an attachment indicated by the db_cv /
 * db_oth_qual checkboxes, and there is no study-title field). Such fields are
 * intentionally non-required in the builder so the official fill still qualifies.
 *
 * Only AcroForm forms appear here. The XFA forms (1571, 3674 dynamic; 3454, 3455
 * static) have no fillable AcroForm widgets and are handled by other renderers
 * (see docs/biotech/FDA_FORMS_FILL_STATUS.md).
 */

export interface OfficialFieldMap {
  [canonicalFieldId: string]: string;
}

export const OFFICIAL_FIELD_MAPS: Record<string, OfficialFieldMap> = {
  // FDA Form 1572 — Statement of Investigator (AcroForm, 740 fields).
  // Facility and IRB are split into name (db_*_name) + address (db_*_address1)
  // from the master data's separate siteName/siteAddress + irbName/irbAddress.
  // The clinical lab has no separate source field, so it stays composite in the
  // name field. Full granularity (db_*_city/state/zip) is a further follow-up
  // (the master data holds one address string).
  FDA_1572: {
    investigator_name: 'db_invest_name',
    facility_name: 'db_loc_name',
    facility_address: 'db_loc_address1',
    clinical_lab_name_address: 'db_lab_name',
    irb_name: 'db_irb_name',
    irb_address: 'db_irb_address1',
    sub_investigators: 'db_sub_inv_names',
    protocol_numbers: 'db_prot_name_code',
  },

  // FDA Form 356h — Application to Market a New/Abbreviated New Drug or Biologic
  // (AcroForm, 1348 fields). Application type maps via derived booleans to the
  // three type checkboxes (verified export values: _1 NDA, _2 ANDA, _3 BLA). The
  // signatory is a signature (btn_sign), so authorized_rep_name/title have no
  // inline field and are intentionally unmapped (non-required in the builder).
  // NOTE (v1): applicant address is the composite string mapped to address line 1;
  // granular city/state/zip is a follow-up (see FDA 1572).
  FDA_356H: {
    applicant_name: 'db_aplcnt_name',
    applicant_address: 'db_aplcnt_address_1',
    application_type: 'db_appl_type',
    appl_type_nda: 'db_appl_type_1',
    appl_type_anda: 'db_appl_type_2',
    appl_type_bla: 'db_appl_type_3',
    application_number: 'db_nda_bla_nmbr',
    proprietary_established_name: 'db_prdct_name',
    dosage_form: 'db_dosage_form',
    route_of_administration: 'db_route_admin',
    indication: 'db_indication',
  },
};

/** The official field map for a form id, or undefined if it has no AcroForm map. */
export function officialFieldMap(formId: string): OfficialFieldMap | undefined {
  return OFFICIAL_FIELD_MAPS[formId];
}
