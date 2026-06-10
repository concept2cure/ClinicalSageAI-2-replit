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
  /** Name and address of the clinical site/facility (1572 Box 3). */
  facilityNameAddress?: string;
  /** Clinical laboratory facility name and address (1572 Box 4). */
  clinicalLabNameAddress?: string;
  /** IRB name and address responsible for review (1572 Box 5). */
  irbNameAddress?: string;
  /** Names of sub-investigators (1572 Box 6). */
  subInvestigators?: string[];
  /**
   * Financial interest record for this investigator, used by 3454/3455.
   * If `hasDisclosableInterest` is true the sponsor must use Form 3455.
   */
  financial?: InvestigatorFinancialInfo;
}

export interface InvestigatorFinancialInfo {
  /** True when the investigator has interests/arrangements requiring disclosure. */
  hasDisclosableInterest?: boolean;
  /** Free-text description of the disclosable interest(s) for Form 3455. */
  disclosureDescription?: string;
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
}

function assemble(formId: string, specs: FieldSpec[]): BuiltForm {
  const fields: Record<string, FieldValue> = {};
  const missingRequired: string[] = [];
  for (const spec of specs) {
    fields[spec.id] = spec.value;
    if (spec.required && !isPresent(spec.value)) {
      missingRequired.push(spec.id);
    }
  }
  return { formId, fields, missingRequired };
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
    { id: 'authorized_rep_name', value: s(sponsor.authorizedRepName), required: true },
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
    // investigator_name / study_title reuse FDA_1572 registry field ids + labels.
    { id: 'investigator_name', value: s(investigator.name), required: true },
    { id: 'investigator_qualifications', value: s(investigator.qualifications), required: true },
    { id: 'facility_name', value: s(investigator.facilityNameAddress), required: true },
    { id: 'clinical_lab_name_address', value: s(investigator.clinicalLabNameAddress), required: false },
    { id: 'irb_name_address', value: s(investigator.irbNameAddress), required: true },
    { id: 'sub_investigators', value: subInv, required: false },
    { id: 'study_title', value: s(meta.studyTitle), required: true },
    { id: 'protocol_numbers', value: s(meta.protocolNumbers) || s(meta.serialNumber), required: false },
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
    facility_name: registryLabel(FORM_1572, 'facility_name', 'Facility Name and Address'),
    clinical_lab_name_address: 'Clinical Laboratory Facility Name and Address',
    irb_name_address: 'IRB Name and Address',
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
  const noneHaveInterest = investigators.every(
    (inv) => inv.financial?.hasDisclosableInterest !== true,
  );
  const investigatorNames = investigators
    .map((inv) => s(inv.name))
    .filter((n) => n.length > 0)
    .join('; ');

  const specs: FieldSpec[] = [
    { id: 'sponsor_name', value: sponsorName, required: true },
    { id: 'drug_name', value: s(meta.drugName), required: true },
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

  // Build one combined disclosure string: "Name: description". Only emit a
  // line when a description is actually present, so that a disclosable interest
  // with no description leaves disclosure_details empty (and thus flagged
  // missingRequired) rather than emitting a meaningless "Name: " line.
  const disclosureLines = disclosing
    .filter((inv) => s(inv.financial?.disclosureDescription).length > 0)
    .map((inv) => {
      const name = s(inv.name) || '(unnamed investigator)';
      const desc = s(inv.financial?.disclosureDescription);
      return `${name}: ${desc}`;
    })
    .join('\n');

  // The disclosure detail is required when there is something to disclose.
  const hasDisclosable = disclosing.length > 0;
  const allHaveDescriptions =
    hasDisclosable &&
    disclosing.every((inv) => s(inv.financial?.disclosureDescription).length > 0);

  const specs: FieldSpec[] = [
    { id: 'sponsor_name', value: sponsorName, required: true },
    { id: 'drug_name', value: s(meta.drugName), required: true },
    { id: 'study_title', value: s(meta.studyTitle), required: false },
    { id: 'disclosure_details', value: disclosureLines, required: hasDisclosable },
    // If this form is being produced, descriptions for every disclosing
    // investigator must be present.
    { id: 'disclosure_descriptions_complete', value: allHaveDescriptions, required: true },
    { id: 'authorized_rep_name', value: s(meta.sponsor?.authorizedRepName), required: true },
    { id: 'authorized_rep_title', value: s(meta.sponsor?.authorizedRepTitle), required: false },
  ];

  return assemble(FORM_3455, specs);
}

export function labels3455(): Record<string, string> {
  return {
    sponsor_name: 'Name of Applicant/Sponsor',
    drug_name: 'Name of Drug/Product',
    study_title: 'Study Title',
    disclosure_details: 'Disclosed Financial Interests/Arrangements (per investigator)',
    disclosure_descriptions_complete:
      'All disclosing investigators have a disclosure description',
    authorized_rep_name: 'Name of Authorized Representative',
    authorized_rep_title: 'Title of Authorized Representative',
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
    default:
      return {};
  }
}
