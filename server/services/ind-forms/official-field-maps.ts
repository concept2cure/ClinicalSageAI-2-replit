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
 * Two kinds of map live here. `OFFICIAL_FIELD_MAPS` targets the AcroForm forms
 * by widget name. `OFFICIAL_XFA_FIELD_MAPS` targets the *dynamic XFA* forms
 * (1571, 3674) by SOM path — those expose no AcroForm widgets at all, so a
 * name-keyed map matches nothing on them and they are filled through the XFA
 * `datasets` packet instead (see server/services/forms/fill-official-pdf).
 */

import type { OfficialPdfFieldMap } from '../forms/fill-official-pdf';

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

  // FDA Form 3454 — Certification: Financial Interests/Arrangements NONE (static
  // XFA; pdf-lib strips the XFA and fills the 14-field AcroForm layer). The "certify
  // none" checkbox (check1), the applicant firm/name/title, and up to six covered
  // investigator names. The signatory is a signature (appSignature) + a governed
  // date (appSigDate), so authorized_rep is name-only here and the date stays blank.
  // NOTE (v1): investigator_names is the composite list mapped to the first name
  // slot; per-investigator fill across invName1..6 is a follow-on. There is no
  // drug/product or study field on the 3454.
  FDA_3454: {
    sponsor_name: 'topmostSubform[0].Page1[0].Subform1[0].appFirm[0]',
    authorized_rep_name: 'topmostSubform[0].Page1[0].Subform1[0].appName[0]',
    authorized_rep_title: 'topmostSubform[0].Page1[0].Subform1[0].appTitle[0]',
    no_disclosable_interests: 'topmostSubform[0].Page1[0].Subform1[0].checkboxList[0].LI1[0].check1[0]',
    investigator_names: 'topmostSubform[0].Page1[0].Subform1[0].checkboxList[0].LI1[0].clinInvList[0].LI1[0].invName1[0]',
  },

  // FDA Form 3455 — Disclosure: Financial Interests/Arrangements (static XFA;
  // pdf-lib strips the XFA and fills the 12-field AcroForm layer). Per-investigator
  // (one invesname). The four interest checkboxes map to the 21 CFR 54.4 categories
  // in the ORDER VERIFIED from the form's field tooltips: check1 financial
  // arrangement, check2 significant payments, check3 proprietary interest, check4
  // significant equity. Signature (appSignature) + governed date (appSigDate) are
  // left for the signing event. NOTE (v1): this fills the FIRST disclosing
  // investigator; per-investigator fill uses buildAllForm3455.
  FDA_3455: {
    sponsor_name: 'topmostSubform[0].Page1[0].appFirm[0]',
    authorized_rep_name: 'topmostSubform[0].Page1[0].appName[0]',
    authorized_rep_title: 'topmostSubform[0].Page1[0].appTitle[0]',
    study_title: 'topmostSubform[0].Page1[0].nameofstudy[0]',
    investigator_name: 'topmostSubform[0].Page1[0].invesname[0]',
    interest_financial_arrangement: 'topmostSubform[0].Page1[0].checkboxList[0].LI1[0].check1[0]',
    interest_significant_payments: 'topmostSubform[0].Page1[0].checkboxList[0].LI2[0].check2[0]',
    interest_proprietary: 'topmostSubform[0].Page1[0].checkboxList[0].LI3[0].check3[0]',
    interest_significant_equity: 'topmostSubform[0].Page1[0].checkboxList[0].LI4[0].check4[0]',
  },
};

/** The official field map for a form id, or undefined if it has no AcroForm map. */
export function officialFieldMap(formId: string): OfficialFieldMap | undefined {
  return OFFICIAL_FIELD_MAPS[formId];
}

/**
 * Reviewed maps for the DYNAMIC XFA forms: canonical builder field id → the SOM
 * path of the field inside the official FDA template.
 *
 * These two forms were long recorded as unfillable — their AcroForm `/Fields`
 * array is empty, so `pdf-lib getFields()` returns nothing and the platform fell
 * back to a drawn reconstruction stamped NOT the official form. That reading was
 * of the wrong layer. Enumerated through the XFA packets instead, FDA 1571
 * declares 283 fields of which 246 resolve to a fillable data node, and FDA 3674
 * declares 190 of which 178 do.
 *
 * Every path below was ENUMERATED from the vendored template (`listXfaFields`),
 * is declared exactly once by it, and resolves to a node in its `datasets`
 * skeleton. None was hand-typed. A path the template does not declare is skipped
 * with a warning at fill time rather than invented, so a stale map degrades to a
 * blank box, never to a value written into the wrong box of a form a sponsor
 * signs.
 *
 * DELIBERATELY UNMAPPED, and why — these are boxes the sponsor completes on the
 * form itself, not data the platform may assert on their behalf:
 *   - `ind_type` / `phase_of_study` — carried by `db_purpose*` and
 *     `db_clin_inves_phases`, whose accepted tokens are set by the form's own
 *     XFA script. Writing an unverified token would tick the wrong box.
 *   - the certification checkboxes on 3674 (42 U.S.C. § 282(j)) — a sponsor
 *     attestation, and the checkbox on/off values on these editions are not
 *     verified against the template's items.
 *   - the signature block — a signature, not a data field.
 */
export const OFFICIAL_XFA_FIELD_MAPS: Record<string, OfficialPdfFieldMap> = {
  // FDA Form 1571 — Investigational New Drug Application (dynamic XFA, edition 2025-03-28).
  FDA_1571: {
    sponsor_name: { xfaSomPath: 'topmostSubform.Page1.db_sponsor_name', type: 'text' },
    // The master data holds one address string; it goes to address line 1, the
    // same convention the 1572 and 356h AcroForm maps already use.
    sponsor_address: { xfaSomPath: 'topmostSubform.Page1.db_aplcnt_address_1', type: 'text' },
    sponsor_contact_phone: { xfaSomPath: 'topmostSubform.Page1.db_aplcnt_phone', type: 'text' },
    ind_number: { xfaSomPath: 'topmostSubform.Page1.db_ind_id', type: 'text' },
    serial_number: { xfaSomPath: 'topmostSubform.Page1.db_serial_no', type: 'text' },
    drug_name: { xfaSomPath: 'topmostSubform.Page1.db_drug_names', type: 'text' },
    indication: { xfaSomPath: 'topmostSubform.Page1.db_indication', type: 'text' },
    authorized_rep_title: { xfaSomPath: 'topmostSubform.Page2.db_sponsor_title', type: 'text' },
  },

  // FDA Form 3674 — Certification of Compliance, 42 U.S.C. § 282(j) (dynamic XFA,
  // edition 2024-04-15). The product-name and NCT-number boxes repeat (…_1 … _105);
  // the builder carries one of each, so the first row is mapped.
  FDA_3674: {
    sponsor_name: { xfaSomPath: 'topmostSubform.Page1.db_sponsor_name', type: 'text' },
    drug_name: { xfaSomPath: 'topmostSubform.Page1.db_prdct_name_1', type: 'text' },
    nct_number: { xfaSomPath: 'topmostSubform.Page2.db_NCT_nmbrs_1', type: 'text' },
  },
};

/** The reviewed XFA map for a form id, or undefined when the form has none. */
export function getOfficialXfaFieldMap(formId: string): OfficialPdfFieldMap | undefined {
  return OFFICIAL_XFA_FIELD_MAPS[formId];
}
