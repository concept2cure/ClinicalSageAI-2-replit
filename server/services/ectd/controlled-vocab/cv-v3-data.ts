/**
 * eCTD v3.2.2 FDA US-regional coded attributes and their v4.0 crosswalk.
 *
 * The FDA `us-regional.xml` backbone (Module 1 Backbone Files Specification,
 * current DTD version 3.3) carries its controlled values as short attribute
 * codes — `fdaatN` (application-type), `fdastN` (submission-type), `fdasstN`
 * (submission-sub-type), `fdaftN` (form-type), `fdaactN` (applicant-contact-type)
 * — NOT the genericode `us_*` codes used by eCTD v4.0.
 *
 * Confirmed directly from the FDA-provided specs:
 *   - `fdaat1` = NDA, `fdast1` = Original Application, `fdast2` = Efficacy
 *     Supplement, `fdasst4` = Amendment, `fdaft2` = Form FDA 356h,
 *     `fdaact1` = Regulatory, `fdaact2` = Technical
 *     (Example Submissions using the eCTD Backbone Files Spec for Module 1;
 *      Addendum 1 & 2 to the Backbone Files Spec for Module 1 v2.3).
 * The remaining ordinals follow the FDA us-regional DTD enumeration order,
 * which mirrors the corresponding v4.0 genericode list order. The authoritative
 * source is the `us-regional-v3-3.dtd` element/attribute enumeration; update
 * here if the DTD enumeration changes.
 *
 * @module server/services/ectd/controlled-vocab/cv-v3-data
 */

export interface V3Code {
  /** The `fdaXXn` attribute value emitted into us-regional.xml. */
  code: string;
  /** Human-readable label. */
  description: string;
  /** Equivalent eCTD v4.0 genericode code (for the forward-compatibility
   *  crosswalk), or null when there is no 1:1 v4.0 equivalent. */
  v4Code: string | null;
}

/** us-regional application-type (`application-number/@application-type`). */
export const V3_APPLICATION_TYPE: V3Code[] = [
  { code: 'fdaat1', description: 'New Drug Application (NDA)', v4Code: 'us_application_type_1' },
  { code: 'fdaat2', description: 'Abbreviated New Drug Application (ANDA)', v4Code: 'us_application_type_2' },
  { code: 'fdaat3', description: 'Biologic License Application (BLA)', v4Code: 'us_application_type_3' },
  { code: 'fdaat4', description: 'Investigational New Drug (IND)', v4Code: 'us_application_type_4' },
  { code: 'fdaat5', description: 'Drug Master File (DMF/BMF)', v4Code: 'us_application_type_5' },
];

/** us-regional submission-type (`submission-id/@submission-type`). */
export const V3_SUBMISSION_TYPE: V3Code[] = [
  { code: 'fdast1', description: 'Original Application', v4Code: 'us_submission_type_1' },
  { code: 'fdast2', description: 'Efficacy Supplement', v4Code: 'us_submission_type_2' },
  { code: 'fdast3', description: 'Chemistry Manufacturing Controls Supplement', v4Code: 'us_submission_type_3' },
  { code: 'fdast4', description: 'Labeling Supplement', v4Code: 'us_submission_type_4' },
  { code: 'fdast5', description: 'Annual Report', v4Code: 'us_submission_type_5' },
  { code: 'fdast6', description: 'Product Correspondence', v4Code: 'us_submission_type_6' },
  { code: 'fdast7', description: 'Postmarketing Requirements or Commitments', v4Code: 'us_submission_type_7' },
  { code: 'fdast8', description: 'Promotional Labeling Advertising', v4Code: 'us_submission_type_8' },
  { code: 'fdast9', description: 'IND Safety Reports', v4Code: 'us_submission_type_9' },
  { code: 'fdast10', description: 'Periodic Safety Reports', v4Code: 'us_submission_type_10' },
  { code: 'fdast11', description: 'REMS Supplement', v4Code: 'us_submission_type_11' },
];

/** us-regional submission-sub-type (`sequence-number/@submission-sub-type`).
 *  Crosswalks to the v4.0 submission-unit-type (CL13). */
export const V3_SUBMISSION_SUB_TYPE: V3Code[] = [
  { code: 'fdasst1', description: 'Original', v4Code: 'us_submission_unit_type_1' },
  { code: 'fdasst2', description: 'Presubmission', v4Code: 'us_submission_unit_type_2' },
  { code: 'fdasst3', description: 'Application', v4Code: 'us_submission_unit_type_3' },
  { code: 'fdasst4', description: 'Amendment', v4Code: 'us_submission_unit_type_4' },
  { code: 'fdasst5', description: 'Resubmission', v4Code: 'us_submission_unit_type_5' },
  { code: 'fdasst6', description: 'Report', v4Code: 'us_submission_unit_type_6' },
  { code: 'fdasst7', description: 'Correspondence', v4Code: 'us_submission_unit_type_7' },
];

/** us-regional form-type (`form/@form-type`). Crosswalks to v4.0 form-type (CL5). */
export const V3_FORM_TYPE: V3Code[] = [
  { code: 'fdaft1', description: 'Form FDA 1571 (IND)', v4Code: 'us_form_type_1' },
  { code: 'fdaft2', description: 'Form FDA 356h', v4Code: 'us_form_type_2' },
  { code: 'fdaft3', description: 'Form FDA 3397 (User Fee Cover Sheet)', v4Code: 'us_form_type_3' },
  { code: 'fdaft4', description: 'Form FDA 2252 (Annual Report Transmittal)', v4Code: 'us_form_type_4' },
  { code: 'fdaft5', description: 'Form FDA 2253 (Promotional Transmittal)', v4Code: 'us_form_type_5' },
  { code: 'fdaft6', description: 'Form FDA 2567 (Labels/Circulars Transmittal)', v4Code: 'us_form_type_6' },
  { code: 'fdaft7', description: 'Form FDA 3674 (Certification of Compliance)', v4Code: 'us_form_type_7' },
];

/** us-regional applicant-contact-type (`applicant-contact-name/@applicant-contact-type`). */
export const V3_APPLICANT_CONTACT_TYPE: V3Code[] = [
  { code: 'fdaact1', description: 'Regulatory', v4Code: 'us_submission_contact_type_1' },
  { code: 'fdaact2', description: 'Technical', v4Code: 'us_submission_contact_type_2' },
  { code: 'fdaact3', description: 'United States Agent', v4Code: 'us_submission_contact_type_3' },
];

/**
 * FDA server application-number path prefixes for lifecycle `modified-file`
 * references in grouped submissions (Addendum 1 to the Module 1 Backbone Spec).
 * When a leaf from a prior grouped submission is modified, the modified-file
 * path must carry the application prefix + number, e.g.
 * `../../../../nda456789/0001/m1/us/us-regional.xml#id21342`.
 */
export const FDA_APPLICATION_PREFIX: Record<string, string> = {
  fdaat1: 'nda',
  fdaat2: 'anda',
  fdaat3: 'bla',
  fdaat4: 'ind',
  fdaat5: 'mf',
};

/** v3.2.2 coded-attribute list identifiers. */
export type V3ListId =
  | 'applicationType'
  | 'submissionType'
  | 'submissionSubType'
  | 'formType'
  | 'applicantContactType';

/** All v3.2.2 coded-attribute lists keyed by list id. */
export const V3_CODE_LISTS: Record<V3ListId, V3Code[]> = {
  applicationType: V3_APPLICATION_TYPE,
  submissionType: V3_SUBMISSION_TYPE,
  submissionSubType: V3_SUBMISSION_SUB_TYPE,
  formType: V3_FORM_TYPE,
  applicantContactType: V3_APPLICANT_CONTACT_TYPE,
};

/**
 * Map a free-text application/submission-type string (as stored on the
 * canonical `submissions.applicationType`, e.g. 'nda', 'ind', 'bla', 'anda',
 * 'dmf') to its us-regional `fdaatN` attribute code. Returns null for unknown
 * values so callers can fail closed rather than mislabel an application.
 */
export function applicationTypeToFdaCode(applicationType: string): string | null {
  const norm = applicationType.trim().toLowerCase();
  const table: Record<string, string> = {
    nda: 'fdaat1', snda: 'fdaat1',
    anda: 'fdaat2',
    bla: 'fdaat3',
    ind: 'fdaat4',
    dmf: 'fdaat5', mf: 'fdaat5', bmf: 'fdaat5',
  };
  return table[norm] ?? null;
}
