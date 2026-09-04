/**
 * IND form data builders.
 *
 * Pure, deterministic functions that map a project-metadata object (plus optional
 * sponsor / agent / investigator data) into typed field maps for the FDA drug-IND
 * forms:
 *   - FDA Form 1571  Investigational New Drug Application (IND)
 *   - FDA Form 1572  Statement of Investigator (one map per investigator)
 *   - FDA Form 3674  Certification of Compliance (ClinicalTrials.gov, 42 U.S.C. 282(j))
 *   - FDA Form 3454  Certification: Financial Interests/Arrangements of Clinical
 *                    Investigators (sponsor certifies NONE)
 *   - FDA Form 3455  Disclosure: Financial Interests/Arrangements of Clinical
 *                    Investigators (sponsor discloses interests)
 *   - FDA Form 356h  Application to Market a New or Abbreviated New Drug or
 *                    Biologic for Human Use
 *   - FDA Form 1574  Assurance of IRB Review
 *
 * Where a field already exists in `server/config/FDAFormsRegistry.ts` we reuse its
 * id and label so the rendered output and any future AcroForm mapping stay aligned
 * with the existing SMART-forms registry. The registry currently models a subset of
 * 1571/1572 fields (and 3674/3455 under the device-centric definitions); the real
 * FDA drug-IND forms have many more fields, so this builder layers the full
 * regulatory field set on top of the registry-derived ids.
 *
 * Determinism: no wall-clock reads, no randomness. The same input object always
 * yields the same field map and the same `missingRequired` ordering (registry /
 * declaration order is preserved).
 */

import { FDAFormsRegistry, type FormField } from '../../config/FDAFormsRegistry';

// ---------------------------------------------------------------------------
// Public result shape
// ---------------------------------------------------------------------------

export type FieldValue = string | boolean;

export interface BuiltForm {
  /** Canonical form id, e.g. 'FDA_1571'. */
  formId: string;
  /** Field id → value map (string for text/date/select, boolean for checkbox). */
  fields: Record<string, FieldValue>;
  /** Ids of required fields that were left blank/false, in declaration order. */
  missingRequired: string[];
  /** Ids of ALL required fields (present or not), in declaration order. Lets the
   *  official-fill gate qualify a template on required-field placeability. */
  requiredFields: string[];
  /** Deterministic semantic validation findings beyond simple presence checks. */
  validationErrors: Array<{ fieldId: string; code: string; message: string }>;
}

// ---------------------------------------------------------------------------
// Input shapes
// ---------------------------------------------------------------------------

export interface SponsorInfo {
  name?: string;
  address?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  /** Authorized representative who signs the 1571 / financial certifications. */
  authorizedRepName?: string;
  authorizedRepTitle?: string;
}

/** US agent (required when the sponsor's address is not in the United States). */
export interface AgentInfo {
  name?: string;
  address?: string;
  phone?: string;
}

export interface InvestigatorInfo {
  /** Full name of the investigator (1572 Box 1). */
  name?: string;
  /** Education, training and experience statement or CV reference (1572 Box 2). */
  qualifications?: string;
  /** Name and address of the clinical site/facility (1572 Box 3), composite. */
  facilityNameAddress?: string;
  /** Facility name only (1572 db_loc_name) — granular alternative to the composite. */
  facilityName?: string;
  /** Facility address only (1572 db_loc_address1) — granular alternative. */
  facilityAddress?: string;
  /** Clinical laboratory facility name and address (1572 Box 4). */
  clinicalLabNameAddress?: string;
  /** IRB name and address responsible for review (1572 Box 5), composite. */
  irbNameAddress?: string;
  /** IRB name only (1572 db_irb_name) — granular alternative to the composite. */
  irbName?: string;
  /** IRB address only (1572 db_irb_address1) — granular alternative. */
  irbAddress?: string;
  /** Names of sub-investigators (1572 Box 6). */
  subInvestigators?: string[];
  /**
   * Financial interest record for this investigator, used by 3454/3455.
   * If `hasDisclosableInterest` is true the sponsor must use Form 3455.
   */
  financial?: InvestigatorFinancialInfo;
}

/**
 * The 21 CFR 54.4 disclosure categories, mapped to the Form 3455 checkboxes
 * (verified from the official form's field tooltips):
 *   - financial_arrangement → check1: arrangement where compensation could be
 *     affected by the study outcome
 *   - significant_payments  → check2: significant payments of other sorts (>$25k)
 *   - proprietary_interest  → check3: proprietary interest in the tested product
 *   - significant_equity    → check4: significant equity interest (21 CFR 54.2(b))
 */
export type FinancialInterestType =
  | 'financial_arrangement'
  | 'significant_payments'
  | 'proprietary_interest'
  | 'significant_equity';

export interface InvestigatorFinancialInfo {
  /** True when the investigator has interests/arrangements requiring disclosure. */
  hasDisclosableInterest?: boolean;
  /** Free-text description of the disclosable interest(s) — draft/record only. */
  disclosureDescription?: string;
  /** Which 21 CFR 54.4 categories apply — drives the Form 3455 interest checkboxes. */
  interestTypes?: FinancialInterestType[];
}

export interface IndProjectMetadata {
  /** Sponsor name of the IND (1571 Box 1 — "Name of Sponsor"). */
  sponsorName?: string;
  /** IND number if already assigned (blank for an original submission). */
  indNumber?: string;
  /** Drug/product name (1571 — "Name of Drug"). */
  drugName?: string;
  /**
   * IND category. Reuses FDA_1571 registry field `ind_type` options where
   * possible: 'Commercial IND' | 'Research IND' | etc.
   */
  indType?: string;
  /** Phase of clinical investigation — reuses FDA_1571 `phase_of_study` options. */
  studyPhase?: string;
  /** Indication / disease being studied (1571 — "Indication"). */
  indication?: string;
  /** Protocol number(s) / serial number for this submission. */
  serialNumber?: string;
  /** Study title (1572 Box 7 / protocol title). */
  studyTitle?: string;
  /** Protocol number(s) covered by the investigator statement (1572 Box 8). */
  protocolNumbers?: string;
  /**
   * ClinicalTrials.gov NCT identifier(s), used by Form 3674 when the
   * certification asserts a registered trial.
   */
  nctNumber?: string;
  /** NDA, ANDA, or BLA application number when assigned. */
  applicationNumber?: string;
  /** Regulatory application type used by Form 356h. */
  applicationType?: 'NDA' | 'ANDA' | 'BLA' | 'Supplement';
  /** Dosage form and route of administration used by Form 356h. */
  dosageForm?: string;
  routeOfAdministration?: string;
  /** IRB assurance data used by Form 1574. */
  irbNameAddress?: string;
  irbChairName?: string;
  irbAssuranceNumber?: string;

  sponsor?: SponsorInfo;
  agent?: AgentInfo;
  /** One or more clinical investigators (drives 1572 / 3454 / 3455). */
  investigators?: InvestigatorInfo[];

  /**
   * Form 3674 certification basis. One of these should be true:
   *  - 'not_applicable_to_374j' : trial not an applicable clinical trial
   *  - 'requirements_met'       : registration/results requirements met
   *  - 'submitted_no_data'      : submitted, results not yet due
   */
  ctgovCertificationBasis?:
    | 'not_applicable_to_374j'
    | 'requirements_met'
    | 'submitted_no_data';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Look up a registry field's label by form id + field id (falls back to a default). */
function registryLabel(formId: string, fieldId: string, fallback: string): string {
  const def = FDAFormsRegistry[formId];
  const field: FormField | undefined = def?.fields.find((f) => f.id === fieldId);
  return field?.label ?? fallback;
}

/** Trim a string value; treat undefined/null as empty. */
function s(v: string | undefined | null): string {
  return (v ?? '').trim();
}

/**
 * A field is "present" (satisfies a required check) when:
 *  - string: non-empty after trim
 *  - boolean: true
 */
function isPresent(v: FieldValue | undefined): boolean {
  if (typeof v === 'boolean') return v;
  return s(typeof v === 'string' ? v : undefined).length > 0;
}

/**
 * Internal spec describing a field to emit. `required` fields that are not present
 * are added to `missingRequired` (in the order declared here — deterministic).
 */
interface FieldSpec {
  id: string;
  value: FieldValue;
  required: boolean;
  allowedValues?: readonly string[];
  /**
   * A validation-only gate, NOT a fillable form widget (e.g. "at least one
   * disclosure interest-type is selected"). Still reported in missingRequired for
   * QC, but excluded from requiredFields so it never blocks the official-fill gate
   * (which qualifies a template on real form fields only).
   */
  qcOnly?: boolean;
}

function assemble(formId: string, specs: FieldSpec[]): BuiltForm {
  const fields: Record<string, FieldValue> = {};
  const missingRequired: string[] = [];
  const requiredFields: string[] = [];
  const validationErrors: BuiltForm['validationErrors'] = [];
  for (const spec of specs) {
    fields[spec.id] = spec.value;
    // qcOnly gates stay out of requiredFields (the official-fill placeability
    // gate) but still count toward missingRequired (QC readiness).
    if (spec.required && !spec.qcOnly) requiredFields.push(spec.id);
    if (spec.required && !isPresent(spec.value)) {
      missingRequired.push(spec.id);
    }
    if (typeof spec.value === 'string' && spec.value && spec.allowedValues && !spec.allowedValues.includes(spec.value)) {
      validationErrors.push({
        fieldId: spec.id,
        code: 'INVALID_OPTION',
        message: `${spec.id} must be one of: ${spec.allowedValues.join(', ')}`,
      });
    }
  }
  return { formId, fields, missingRequired, requiredFields, validationErrors };
}

// ---------------------------------------------------------------------------
// FDA Form 1571 — Investigational New Drug Application
// ---------------------------------------------------------------------------

export const FORM_1571 = 'FDA_1571';

export function buildForm1571(meta: IndProjectMetadata): BuiltForm {
  const sponsor = meta.sponsor ?? {};
  const agent = meta.agent ?? {};
  const sponsorName = s(meta.sponsorName) || s(sponsor.name);

  // Reuse registry ids where they exist (ind_type, phase_of_study); the remaining
  // ids follow the 1571_<snake> convention used for the full regulatory field set.
  const specs: FieldSpec[] = [
    { id: 'sponsor_name', value: sponsorName, required: true },
    { id: 'sponsor_address', value: s(sponsor.address), required: true },
    { id: 'sponsor_contact_name', value: s(sponsor.contactName), required: false },
    { id: 'sponsor_contact_phone', value: s(sponsor.contactPhone), required: false },
    { id: 'sponsor_contact_email', value: s(sponsor.contactEmail), required: false },
    { id: 'ind_number', value: s(meta.indNumber), required: false },
    { id: 'serial_number', value: s(meta.serialNumber), required: false },
    { id: 'drug_name', value: s(meta.drugName), required: true },
    { id: 'indication', value: s(meta.indication), required: true },
    // ind_type / phase_of_study reuse FDA_1571 registry field ids + labels.
    { id: 'ind_type', value: s(meta.indType), required: true },
    { id: 'phase_of_study', value: s(meta.studyPhase), required: true },
    { id: 'us_agent_name', value: s(agent.name), required: false },
    { id: 'us_agent_address', value: s(agent.address), required: false },
    { id: 'us_agent_phone', value: s(agent.phone), required: false },
    // The 1571 signature block is a signature, not a data box: the official form
    // carries the representative as first/middle/last plus a signature widget,
    // with no single full-name field to write into. buildForm356h already made
    // exactly this call for the same two ids; 1571 was the outlier, and while it
    // stayed required no official fill of this form could ever qualify.
    { id: 'authorized_rep_name', value: s(sponsor.authorizedRepName), required: false },
    { id: 'authorized_rep_title', value: s(sponsor.authorizedRepTitle), required: false },
  ];

  return assemble(FORM_1571, specs);
}

/** Human-readable labels for Form 1571 fields (used by the fallback PDF renderer). */
export function labels1571(): Record<string, string> {
  return {
    sponsor_name: registryLabel(FORM_1571, 'sponsor_name', 'Name of Sponsor'),
    sponsor_address: 'Address of Sponsor',
    sponsor_contact_name: 'Name of Person Responsible for Monitoring',
    sponsor_contact_phone: 'Telephone Number',
    sponsor_contact_email: 'Email Address',
    ind_number: 'IND Number (if previously assigned)',
    serial_number: 'Serial Number',
    drug_name: 'Name of Drug',
    indication: 'Indication',
    ind_type: registryLabel(FORM_1571, 'ind_type', 'IND Type'),
    phase_of_study: registryLabel(FORM_1571, 'phase_of_study', 'Phase of Clinical Investigation'),
    us_agent_name: 'Name of U.S. Agent (if sponsor is outside the U.S.)',
    us_agent_address: 'Address of U.S. Agent',
    us_agent_phone: 'Telephone Number of U.S. Agent',
    authorized_rep_name: 'Name of Sponsor or Sponsor’s Authorized Representative',
    authorized_rep_title: 'Title of Authorized Representative',
  };
}

// ---------------------------------------------------------------------------
// FDA Form 1572 — Statement of Investigator (one per investigator)
// ---------------------------------------------------------------------------

export const FORM_1572 = 'FDA_1572';

export function buildForm1572(
  investigator: InvestigatorInfo,
  meta: IndProjectMetadata,
): BuiltForm {
  const subInv = (investigator.subInvestigators ?? [])
    .map((n) => s(n))
    .filter((n) => n.length > 0)
    .join('; ');

  const specs: FieldSpec[] = [
    // Required-ness mirrors the OFFICIAL FDA 1572 fillable fields, so the official
    // AcroForm fill can qualify (see official-field-maps.ts). On the real form,
    // Box 2 qualifications are satisfied by an ATTACHMENT (db_cv / db_oth_qual
    // checkboxes), not an inline text field, and there is no study-title field —
    // so both are carried for the draft/record but are not inline-required.
    { id: 'investigator_name', value: s(investigator.name), required: true },
    { id: 'investigator_qualifications', value: s(investigator.qualifications), required: false },
    // Facility + IRB split into name / address so the official 1572 fills
    // db_loc_name and db_loc_address1 separately (not the whole "name and address"
    // in the name box). The composite is the fallback for the manual-entry path
    // that has no granular data.
    { id: 'facility_name', value: s(investigator.facilityName) || s(investigator.facilityNameAddress), required: true },
    { id: 'facility_address', value: s(investigator.facilityAddress), required: false },
    { id: 'clinical_lab_name_address', value: s(investigator.clinicalLabNameAddress), required: false },
    { id: 'irb_name', value: s(investigator.irbName) || s(investigator.irbNameAddress), required: true },
    { id: 'irb_address', value: s(investigator.irbAddress), required: false },
    { id: 'sub_investigators', value: subInv, required: false },
    { id: 'study_title', value: s(meta.studyTitle), required: false },
    // NOT `|| meta.serialNumber`. The serial number is the IND submission
    // sequence (0000, 0001…); the protocol number identifies the study
    // (C2C-1042-101). They are unrelated identifiers, and this map feeds
    // db_prot_name_code — Box 6 of the official 1572 — so the fallback printed
    // "0000" into the protocol box of a form an investigator signs. A protocol
    // number the platform does not hold is blank, not borrowed.
    { id: 'protocol_numbers', value: s(meta.protocolNumbers), required: false },
  ];

  return assemble(FORM_1572, specs);
}

/** Build a 1572 for every investigator in the project (empty array → no forms). */
export function buildAllForm1572(meta: IndProjectMetadata): BuiltForm[] {
  return (meta.investigators ?? []).map((inv) => buildForm1572(inv, meta));
}

export function labels1572(): Record<string, string> {
  return {
    investigator_name: registryLabel(FORM_1572, 'investigator_name', 'Name of Investigator'),
    investigator_qualifications: 'Education, Training, and Experience (Qualifications)',
    facility_name: 'Facility Name',
    facility_address: 'Facility Address',
    clinical_lab_name_address: 'Clinical Laboratory Facility Name and Address',
    irb_name: 'IRB Name',
    irb_address: 'IRB Address',
    sub_investigators: 'Sub-Investigators',
    study_title: registryLabel(FORM_1572, 'study_title', 'Study Title'),
    protocol_numbers: 'Protocol Number(s)',
  };
}

// ---------------------------------------------------------------------------
// FDA Form 3674 — Certification of Compliance (ClinicalTrials.gov)
// ---------------------------------------------------------------------------

export const FORM_3674 = 'FDA_3674';

export function buildForm3674(meta: IndProjectMetadata): BuiltForm {
  const sponsorName = s(meta.sponsorName) || s(meta.sponsor?.name);
  const basis = meta.ctgovCertificationBasis;

  const specs: FieldSpec[] = [
    { id: 'sponsor_name', value: sponsorName, required: true },
    { id: 'drug_name', value: s(meta.drugName), required: true },
    { id: 'nct_number', value: s(meta.nctNumber), required: false },
    // Mutually-exclusive certification checkboxes (Form 3674 has three options).
    { id: 'cert_not_applicable', value: basis === 'not_applicable_to_374j', required: false },
    { id: 'cert_requirements_met', value: basis === 'requirements_met', required: false },
    { id: 'cert_submitted_no_data', value: basis === 'submitted_no_data', required: false },
    // At least one certification basis must be selected.
    {
      id: 'certification_selected',
      value:
        basis === 'not_applicable_to_374j' ||
        basis === 'requirements_met' ||
        basis === 'submitted_no_data',
      required: true,
    },
  ];

  return assemble(FORM_3674, specs);
}

export function labels3674(): Record<string, string> {
  return {
    sponsor_name: 'Name of Sponsor/Applicant',
    drug_name: 'Product Name',
    nct_number: 'ClinicalTrials.gov Identifier (NCT Number)',
    cert_not_applicable: 'Certify: requirements of 42 U.S.C. 282(j) do not apply',
    cert_requirements_met: 'Certify: requirements of 42 U.S.C. 282(j) have been met',
    cert_submitted_no_data: 'Certify: registration submitted, results not yet required',
    certification_selected: 'A certification basis has been selected',
  };
}

// ---------------------------------------------------------------------------
// FDA Form 3454 — Certification: Financial Interests/Arrangements (NONE)
// ---------------------------------------------------------------------------

export const FORM_3454 = 'FDA_3454';

/**
 * Form 3454 is the sponsor's certification that NO covered investigator has a
 * disclosable financial interest/arrangement. It is only appropriate when every
 * investigator has `financial.hasDisclosableInterest !== true`; if any do, the
 * sponsor must instead complete Form 3455 (disclosure). We surface that mismatch
 * via `missingRequired` (the `no_disclosable_interests` flag becomes false).
 */
export function buildForm3454(meta: IndProjectMetadata): BuiltForm {
  const sponsorName = s(meta.sponsorName) || s(meta.sponsor?.name);
  const investigators = meta.investigators ?? [];
  // A 21 CFR Part 54 certification of "NONE" must rest on POSITIVE confirmation,
  // never on the ABSENCE of financial data. The prior `!== true` test auto-affirmed
  // whenever `financial` was undefined (e.g. the master-data pdf-from-records path,
  // where the investigators table carries no financial column), producing a
  // certification with no factual basis. Require an explicit per-investigator
  // `hasDisclosableInterest === false` for at least one covered investigator;
  // otherwise no_disclosable_interests stays false and surfaces as missingRequired
  // (the 3454 is not ready to certify until the sponsor actually confirms none).
  const noneHaveInterest =
    investigators.length > 0 &&
    investigators.every((inv) => inv.financial?.hasDisclosableInterest === false);
  const investigatorNames = investigators
    .map((inv) => s(inv.name))
    .filter((n) => n.length > 0)
    .join('; ');

  const specs: FieldSpec[] = [
    { id: 'sponsor_name', value: sponsorName, required: true },
    // The 3454 has no drug/product field — carry it for the record but do not
    // inline-require it (an unmappable required field would force the fallback).
    { id: 'drug_name', value: s(meta.drugName), required: false },
    { id: 'study_title', value: s(meta.studyTitle), required: false },
    { id: 'investigator_names', value: investigatorNames, required: false },
    // Certification is only valid when truly none have disclosable interests.
    { id: 'no_disclosable_interests', value: noneHaveInterest, required: true },
    { id: 'authorized_rep_name', value: s(meta.sponsor?.authorizedRepName), required: true },
    { id: 'authorized_rep_title', value: s(meta.sponsor?.authorizedRepTitle), required: false },
  ];

  return assemble(FORM_3454, specs);
}

export function labels3454(): Record<string, string> {
  return {
    sponsor_name: 'Name of Applicant/Sponsor',
    drug_name: 'Name of Drug/Product',
    study_title: 'Study Title',
    investigator_names: 'Covered Clinical Investigators',
    no_disclosable_interests:
      'Certify: no covered investigator has a disclosable financial interest/arrangement',
    authorized_rep_name: 'Name of Authorized Representative',
    authorized_rep_title: 'Title of Authorized Representative',
  };
}

// ---------------------------------------------------------------------------
// FDA Form 3455 — Disclosure: Financial Interests/Arrangements
// ---------------------------------------------------------------------------

export const FORM_3455 = 'FDA_3455';

/**
 * Form 3455 discloses the financial interests/arrangements of covered clinical
 * investigators. It is appropriate when at least one investigator has
 * `financial.hasDisclosableInterest === true`. We require a non-empty disclosure
 * description for each such investigator.
 */
export function buildForm3455(meta: IndProjectMetadata): BuiltForm {
  const sponsorName = s(meta.sponsorName) || s(meta.sponsor?.name);
  const investigators = meta.investigators ?? [];
  const disclosing = investigators.filter(
    (inv) => inv.financial?.hasDisclosableInterest === true,
  );
  const hasDisclosable = disclosing.length > 0;

  // The 3455 is per-investigator (a single `invesname`). This single-form entry
  // point discloses the FIRST disclosing investigator; use buildAllForm3455 for
  // one form per investigator.
  const first = disclosing[0];
  const types = new Set(first?.financial?.interestTypes ?? []);
  const anyTypeSelected = types.size > 0;

  // Free-text description(s) are carried for the draft/record only — the OFFICIAL
  // 3455 has no free-text disclosure field; the interest is expressed via the
  // 21 CFR 54.4 checkboxes below.
  const disclosureLines = disclosing
    .filter((inv) => s(inv.financial?.disclosureDescription).length > 0)
    .map((inv) => `${s(inv.name) || '(unnamed investigator)'}: ${s(inv.financial?.disclosureDescription)}`)
    .join('\n');

  const specs: FieldSpec[] = [
    { id: 'sponsor_name', value: sponsorName, required: true },                                  // → appFirm
    { id: 'authorized_rep_name', value: s(meta.sponsor?.authorizedRepName), required: true },    // → appName
    { id: 'authorized_rep_title', value: s(meta.sponsor?.authorizedRepTitle), required: false }, // → appTitle
    { id: 'study_title', value: s(meta.studyTitle), required: false },                           // → nameofstudy
    { id: 'investigator_name', value: s(first?.name), required: hasDisclosable },                // → invesname
    // 21 CFR 54.4 interest-type checkboxes (mapping verified from field tooltips).
    { id: 'interest_financial_arrangement', value: types.has('financial_arrangement'), required: false }, // → check1
    { id: 'interest_significant_payments', value: types.has('significant_payments'), required: false },   // → check2
    { id: 'interest_proprietary', value: types.has('proprietary_interest'), required: false },            // → check3
    { id: 'interest_significant_equity', value: types.has('significant_equity'), required: false },        // → check4
    // QC gate: a disclosure must name at least one interest type. Not a form
    // widget, so it never blocks the official fill — only QC readiness.
    { id: 'interest_type_selected', value: anyTypeSelected, required: hasDisclosable, qcOnly: true },
    // Draft/record only (no official field).
    { id: 'drug_name', value: s(meta.drugName), required: false, qcOnly: true },
    { id: 'disclosure_details', value: disclosureLines, required: false, qcOnly: true },
  ];

  return assemble(FORM_3455, specs);
}

/** Build one 3455 per disclosing investigator (empty when none disclose). */
export function buildAllForm3455(meta: IndProjectMetadata): BuiltForm[] {
  const disclosing = (meta.investigators ?? []).filter(
    (inv) => inv.financial?.hasDisclosableInterest === true,
  );
  return disclosing.map((inv) => buildForm3455({ ...meta, investigators: [inv] }));
}

export function labels3455(): Record<string, string> {
  return {
    sponsor_name: 'Name of Applicant/Sponsor',
    authorized_rep_name: 'Name of Authorized Representative',
    authorized_rep_title: 'Title of Authorized Representative',
    study_title: 'Name of Clinical Study',
    investigator_name: 'Name of Clinical Investigator',
    interest_financial_arrangement: 'Financial arrangement (compensation affected by outcome)',
    interest_significant_payments: 'Significant payments of other sorts (>$25,000)',
    interest_proprietary: 'Proprietary interest in the tested product',
    interest_significant_equity: 'Significant equity interest (21 CFR 54.2(b))',
    interest_type_selected: 'At least one interest type is selected',
    drug_name: 'Name of Drug/Product',
    disclosure_details: 'Disclosed Financial Interests/Arrangements (per investigator)',
  };
}

// ---------------------------------------------------------------------------
// FDA Form 356h — NDA / ANDA / BLA application
// ---------------------------------------------------------------------------

export const FORM_356H = 'FDA_356H';

export function buildForm356h(meta: IndProjectMetadata): BuiltForm {
  const sponsorName = s(meta.sponsorName) || s(meta.sponsor?.name);
  const applicationType = s(meta.applicationType);
  return assemble(FORM_356H, [
    { id: 'applicant_name', value: sponsorName, required: true },
    { id: 'applicant_address', value: s(meta.sponsor?.address), required: true },
    { id: 'application_type', value: applicationType, required: true, allowedValues: ['NDA', 'ANDA', 'BLA', 'Supplement'] },
    // Derived selectors for the official form's application-type checkboxes
    // (db_appl_type_1/2/3, verified export values NDA/ANDA/BLA). application_type
    // above is the required datum; these mirror it onto the checkboxes so the
    // official fill checks the right box. Non-required (Supplement selects none).
    { id: 'appl_type_nda', value: applicationType === 'NDA', required: false },
    { id: 'appl_type_anda', value: applicationType === 'ANDA', required: false },
    { id: 'appl_type_bla', value: applicationType === 'BLA', required: false },
    { id: 'application_number', value: s(meta.applicationNumber), required: applicationType === 'Supplement' },
    { id: 'proprietary_established_name', value: s(meta.drugName), required: true },
    { id: 'dosage_form', value: s(meta.dosageForm), required: true },
    { id: 'route_of_administration', value: s(meta.routeOfAdministration), required: true },
    { id: 'indication', value: s(meta.indication), required: true },
    // The 356h signatory is a signature (btn_sign), not an inline text field, so
    // the authorized-rep NAME is not an inline-required field on the official form.
    { id: 'authorized_rep_name', value: s(meta.sponsor?.authorizedRepName), required: false },
    { id: 'authorized_rep_title', value: s(meta.sponsor?.authorizedRepTitle), required: false },
  ]);
}

export function labels356h(): Record<string, string> {
  return {
    applicant_name: 'Applicant Name', applicant_address: 'Applicant Address',
    application_type: 'Application Type', application_number: 'Application Number',
    appl_type_nda: 'Type: New Drug Application (NDA)',
    appl_type_anda: 'Type: Abbreviated New Drug Application (ANDA)',
    appl_type_bla: 'Type: Biologics License Application (BLA)',
    proprietary_established_name: 'Proprietary / Established Name', dosage_form: 'Dosage Form',
    route_of_administration: 'Route of Administration', indication: 'Indication(s)',
    authorized_rep_name: 'Authorized Representative', authorized_rep_title: 'Representative Title',
  };
}

// ---------------------------------------------------------------------------
// FDA Form 1574 — Assurance of IRB review
// ---------------------------------------------------------------------------

export const FORM_1574 = 'FDA_1574';

export function buildForm1574(meta: IndProjectMetadata): BuiltForm {
  return assemble(FORM_1574, [
    { id: 'sponsor_name', value: s(meta.sponsorName) || s(meta.sponsor?.name), required: true },
    { id: 'drug_name', value: s(meta.drugName), required: true },
    // Same substitution as the 1572 carried, and here the field is required, so
    // the serial number silently satisfied the gate: a 1574 reported complete
    // while its protocol number was an IND sequence number. Blank now, and
    // reported in missingRequired.
    { id: 'protocol_number', value: s(meta.protocolNumbers), required: true },
    { id: 'irb_name_address', value: s(meta.irbNameAddress), required: true },
    { id: 'irb_chair_name', value: s(meta.irbChairName), required: true },
    { id: 'irb_assurance_number', value: s(meta.irbAssuranceNumber), required: false },
    { id: 'authorized_rep_name', value: s(meta.sponsor?.authorizedRepName), required: true },
  ]);
}

export function labels1574(): Record<string, string> {
  return {
    sponsor_name: 'Sponsor Name', drug_name: 'Investigational Drug',
    protocol_number: 'Protocol Number', irb_name_address: 'IRB Name and Address',
    irb_chair_name: 'IRB Chair', irb_assurance_number: 'IRB Assurance Number',
    authorized_rep_name: 'Sponsor Authorized Representative',
  };
}

// ---------------------------------------------------------------------------
// Label lookup by form id (for the fill service / fallback renderer)
// ---------------------------------------------------------------------------

export function labelsForForm(formId: string): Record<string, string> {
  switch (formId) {
    case FORM_1571:
      return labels1571();
    case FORM_1572:
      return labels1572();
    case FORM_3674:
      return labels3674();
    case FORM_3454:
      return labels3454();
    case FORM_3455:
      return labels3455();
    case FORM_356H:
      return labels356h();
    case FORM_1574:
      return labels1574();
    default:
      return {};
  }
}
