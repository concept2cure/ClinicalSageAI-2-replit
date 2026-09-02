/**
 * FDA Forms Registry - Central configuration for all SMART FDA forms
 * Defines form metadata, fields, and mappings to CERV2 workflow stages
 */

export interface FormField {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'date' | 'number';
  required: boolean;
  maxLength?: number;
  options?: string[];
  workflowMapping?: {
    stage: string;
    section?: string;
    field: string;
  };
  aiSuggestionEnabled?: boolean;
  validationRule?: string;
}

/** FDA center that owns a form. */
export type FdaCenter = 'CDER' | 'CBER' | 'CDRH' | 'CVM' | 'CTP';
/** Regulated product domain a form applies to. */
export type ProductDomain = 'drug' | 'biologic' | 'device' | 'combination';
/** Submission program / pathway a form is used in. */
export type SubmissionProgram =
  | 'IND' | 'NDA' | 'ANDA' | 'BLA'
  | '510k' | 'PMA' | 'DeNovo' | 'Q-Sub' | 'Breakthrough';
/** Which FDA center / product domain(s) / program(s) a form applies to. */
export interface FormApplicability {
  center: FdaCenter;
  domains: ProductDomain[];
  programs: SubmissionProgram[];
}

export interface FDAFormDefinition {
  formId: string;
  formNumber: string;
  title: string;
  description: string;
  category: '510k' | 'PMA' | 'Clinical' | 'Special' | 'Common';
  version: string;
  lastUpdated: string;
  fields: FormField[];
  dependencies?: string[]; // Other forms that must be completed first
  autoGenerationTrigger?: {
    stage: number;
    condition?: string;
  };
  implementationStatus?: 'metadata' | 'full';
  source?: { authority: 'FDA'; catalogUrl: string; retrievedAt?: string };
  governance?: {
    states: Array<'draft' | 'in_review' | 'approved' | 'superseded'>;
    approvalRequired: boolean;
    failClosed: boolean;
  };
  pdf?: { officialTemplatePreferred: boolean; fallbackWatermarkedDraft: boolean };
  storage?: { format: 'structured-field-map'; versioned: boolean; provenanceRequired: boolean };
  conditionalLogic?: Array<{
    when: { fieldId: string; operator: 'equals' | 'not_equals' | 'truthy' | 'falsy'; value?: string | number | boolean };
    effect: 'required' | 'visible' | 'excluded';
    fieldIds: string[];
  }>;
  /**
   * FDA center + product domain(s) + submission program(s) this form applies to.
   * Lets the platform serve the RIGHT forms for a given client's program rather
   * than the device-centric `category` alone. When omitted, `applicabilityOf()`
   * derives a sensible default from `category`.
   */
  applicability?: FormApplicability;
}

// Registry of all FDA SMART Forms
export const FDAFormsRegistry: Record<string, FDAFormDefinition> = {
  // ============ Already Implemented Forms ============
  FDA_3514: {
    formId: 'FDA_3514',
    formNumber: '3514',
    title: 'CDRH Premarket Notification 510(k) Cover Sheet',
    description: 'Cover sheet for 510(k) premarket notification submission',
    category: '510k',
    version: '2024.1',
    lastUpdated: '2024-01-01',
    fields: [
      {
        id: 'applicant_name',
        label: 'Applicant Name',
        type: 'text',
        required: true,
        workflowMapping: { stage: 'Setup', section: 'DeviceIntake', field: 'applicantName' }
      },
      {
        id: 'device_name',
        label: 'Device Trade/Proprietary Name',
        type: 'text',
        required: true,
        workflowMapping: { stage: 'Setup', section: 'DeviceIntake', field: 'deviceName' }
      }
    ],
    autoGenerationTrigger: { stage: 0 }
  },

  FDA_3601: {
    formId: 'FDA_3601',
    formNumber: '3601',
    title: 'Medical Device User Fee Cover Sheet',
    description: 'User fee information for medical device submissions',
    category: '510k',
    version: '2024.1',
    lastUpdated: '2024-01-01',
    fields: [],
    autoGenerationTrigger: { stage: 0 }
  },

  FDA_3881: {
    formId: 'FDA_3881',
    formNumber: '3881',
    title: 'Indications for Use Statement',
    description: 'Statement of indications for use for the medical device',
    category: '510k',
    version: '2024.1',
    lastUpdated: '2024-01-01',
    fields: [],
    autoGenerationTrigger: { stage: 1 }
  },

  FDA_3654: {
    formId: 'FDA_3654',
    formNumber: '3654',
    title: 'Standards Data Report for 510(k)s',
    description: 'Declaration of conformity to FDA-recognized consensus standards cited in a 510(k) (Form FDA 3654). Not a financial-disclosure form: investigator financial certification/disclosure is Form FDA 3454/3455.',
    category: 'Common',
    version: '2024.1',
    lastUpdated: '2024-01-01',
    fields: [],
    autoGenerationTrigger: { stage: 5 }
  },

  // ============ New 510(k) Forms ============
  FDA_3872: {
    formId: 'FDA_3872',
    formNumber: '3872',
    title: '510(k) Summary or Statement',
    description: '510(k) summary of safety and effectiveness or 510(k) statement',
    category: '510k',
    version: '2024.1',
    lastUpdated: '2024-01-01',
    fields: [
      {
        id: 'submission_type',
        label: 'Submission Type',
        type: 'select',
        required: true,
        options: ['510(k) Summary', '510(k) Statement'],
        workflowMapping: { stage: 'Strategy', field: 'submissionType' }
      },
      {
        id: 'device_description',
        label: 'Device Description',
        type: 'textarea',
        required: true,
        maxLength: 5000,
        workflowMapping: { stage: 'Setup', section: 'DeviceIntake', field: 'deviceDescription' },
        aiSuggestionEnabled: true
      },
      {
        id: 'intended_use',
        label: 'Intended Use',
        type: 'textarea',
        required: true,
        maxLength: 3000,
        workflowMapping: { stage: 'Strategy', section: 'IntendedUse', field: 'intendedUseStatement' }
      },
      {
        id: 'predicate_device',
        label: 'Predicate Device',
        type: 'text',
        required: true,
        workflowMapping: { stage: 'Strategy', section: 'PredicateSearch', field: 'predicateDevice' }
      }
    ],
    dependencies: ['FDA_3514'],
    autoGenerationTrigger: { stage: 1 }
  },

  FDA_3674: {
    formId: 'FDA_3674', formNumber: '3674',
    title: 'Certification of Compliance, under 42 U.S.C. § 282(j)(5)(B)',
    description: 'ClinicalTrials.gov certification submitted with certain human drug, biologic, and device applications',
    category: 'Clinical', version: 'unverified', lastUpdated: 'unknown',
    fields: [
      { id: 'sponsor_name', label: 'Sponsor/Applicant Name', type: 'text', required: true },
      { id: 'drug_name', label: 'Product Name', type: 'text', required: true },
      { id: 'nct_number', label: 'NCT Number', type: 'text', required: false },
      { id: 'cert_not_applicable', label: 'Requirements do not apply', type: 'checkbox', required: false },
      { id: 'cert_requirements_met', label: 'Requirements have been met', type: 'checkbox', required: false },
      { id: 'cert_submitted_no_data', label: 'Registration submitted; results not due', type: 'checkbox', required: false },
      { id: 'certification_selected', label: 'Certification basis selected', type: 'checkbox', required: true },
    ], autoGenerationTrigger: { stage: 5 }, implementationStatus: 'full'
  },

  FDA_2891: {
    formId: 'FDA_2891',
    formNumber: '2891',
    title: 'Truthful and Accuracy Statement (21 CFR 807.87(k))',
    description: 'The signed statement that all data and information in a 510(k) are truthful and accurate. It is NOT a numbered FDA form: Form FDA 2891 is the Registration of Device Establishment; this entry keeps the legacy id so existing artifacts resolve, and its formNumber must not be reconciled against the FDA catalog as form 2891.',
    category: 'Common',
    version: '2024.1',
    lastUpdated: '2024-01-01',
    fields: [
      {
        id: 'signatory_name',
        label: 'Name of Responsible Person',
        type: 'text',
        required: true,
        workflowMapping: { stage: 'Setup', section: 'DeviceIntake', field: 'contactName' }
      },
      {
        id: 'signatory_title',
        label: 'Title',
        type: 'text',
        required: true,
        workflowMapping: { stage: 'Setup', section: 'DeviceIntake', field: 'contactTitle' }
      },
      {
        id: 'signature_date',
        label: 'Date',
        type: 'date',
        required: true
      }
    ],
    autoGenerationTrigger: { stage: 6 }
  },

  FDA_3455: {
    formId: 'FDA_3455', formNumber: '3455',
    title: 'Disclosure: Financial Interests and Arrangements of Clinical Investigators',
    description: 'Applicant disclosure of covered clinical investigator financial interests and arrangements',
    category: 'Clinical', version: 'unverified', lastUpdated: 'unknown',
    fields: [
      { id: 'sponsor_name', label: 'Applicant/Sponsor', type: 'text', required: true },
      { id: 'drug_name', label: 'Drug/Product', type: 'text', required: true },
      { id: 'study_title', label: 'Study Title', type: 'text', required: false },
      { id: 'has_disclosable_interest', label: 'A covered clinical investigator has a disclosable financial interest or arrangement', type: 'checkbox', required: false },
      { id: 'disclosure_details', label: 'Disclosure Details', type: 'textarea', required: false, maxLength: 10000 },
      { id: 'disclosure_descriptions_complete', label: 'All disclosures complete', type: 'checkbox', required: true },
      { id: 'authorized_rep_name', label: 'Authorized Representative', type: 'text', required: true },
      { id: 'authorized_rep_title', label: 'Representative Title', type: 'text', required: false },
    ], autoGenerationTrigger: { stage: 5 }, implementationStatus: 'full',
    // Disclosure detail is required only when a covered investigator actually has a
    // disclosable interest. Typed and declarative (never an executable expression):
    // the `when` clause references an in-form field id (has_disclosable_interest,
    // defined in this form's fields above) so the flat-lookup evaluator in
    // FDAFormGenerator.validateEditableValues can actually resolve it. NB: a dotted
    // path like 'investigators[].financial.hasDisclosableInterest' compiles but the
    // evaluator does values[fieldId], so it never resolves and the rule never fires.
    conditionalLogic: [{
      when: { fieldId: 'has_disclosable_interest', operator: 'truthy' },
      effect: 'required',
      fieldIds: ['disclosure_details'],
    }],
  },

  // ============ PMA Forms ============
  FDA_3663: {
    formId: 'FDA_3663',
    formNumber: '3663',
    title: 'PMA Cover Sheet',
    description: 'Cover sheet for Premarket Approval Application',
    category: 'PMA',
    version: '2024.1',
    lastUpdated: '2024-01-01',
    fields: [
      {
        id: 'pma_type',
        label: 'PMA Type',
        type: 'select',
        required: true,
        options: ['Original PMA', 'Panel Track Supplement', '180-Day Supplement', 'Real-Time Supplement'],
        workflowMapping: { stage: 'Strategy', field: 'pmaType' }
      },
      {
        id: 'trade_name',
        label: 'Trade/Proprietary Name',
        type: 'text',
        required: true,
        workflowMapping: { stage: 'Setup', section: 'DeviceIntake', field: 'deviceName' }
      },
      {
        id: 'common_name',
        label: 'Common/Usual Name',
        type: 'text',
        required: true,
        workflowMapping: { stage: 'Setup', section: 'DeviceIntake', field: 'commonName' }
      }
    ],
    autoGenerationTrigger: { stage: 0 }
  },

  FDA_3667: {
    formId: 'FDA_3667',
    formNumber: '3667',
    title: 'PMA Amendment',
    description: 'Amendment to a pending PMA application',
    category: 'PMA',
    version: '2024.1',
    lastUpdated: '2024-01-01',
    fields: [
      {
        id: 'pma_number',
        label: 'PMA Number',
        type: 'text',
        required: true,
        workflowMapping: { stage: 'Setup', field: 'pmaNumber' }
      },
      {
        id: 'amendment_number',
        label: 'Amendment Number',
        type: 'number',
        required: true
      },
      {
        id: 'amendment_reason',
        label: 'Reason for Amendment',
        type: 'textarea',
        required: true,
        maxLength: 3000,
        aiSuggestionEnabled: true
      }
    ],
    dependencies: ['FDA_3663'],
    autoGenerationTrigger: { stage: 6, condition: 'amendment_required' }
  },

  // ============ Clinical Forms ============
  FDA_1571: {
    formId: 'FDA_1571', formNumber: '1571', title: 'Investigational New Drug Application (IND)',
    description: 'Application for authorization to conduct a clinical investigation under an IND',
    category: 'Clinical', version: 'unverified', lastUpdated: 'unknown',
    fields: [
      { id: 'sponsor_name', label: 'Name of Sponsor', type: 'text', required: true },
      { id: 'sponsor_address', label: 'Address of Sponsor', type: 'textarea', required: true },
      { id: 'sponsor_contact_name', label: 'Responsible Contact', type: 'text', required: false },
      { id: 'sponsor_contact_phone', label: 'Contact Phone', type: 'text', required: false },
      { id: 'sponsor_contact_email', label: 'Contact Email', type: 'text', required: false },
      { id: 'ind_number', label: 'IND Number', type: 'text', required: false },
      { id: 'serial_number', label: 'Serial Number', type: 'text', required: false },
      { id: 'drug_name', label: 'Name of Drug', type: 'text', required: true },
      { id: 'indication', label: 'Indication', type: 'textarea', required: true },
      { id: 'ind_type', label: 'IND Type', type: 'select', required: true, options: ['Commercial IND', 'Research IND', 'Emergency Use IND', 'Treatment IND'] },
      { id: 'phase_of_study', label: 'Phase of Clinical Investigation', type: 'select', required: true, options: ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'] },
      { id: 'us_agent_name', label: 'U.S. Agent Name', type: 'text', required: false },
      { id: 'us_agent_address', label: 'U.S. Agent Address', type: 'textarea', required: false },
      { id: 'us_agent_phone', label: 'U.S. Agent Phone', type: 'text', required: false },
      { id: 'authorized_rep_name', label: 'Authorized Representative', type: 'text', required: true },
      { id: 'authorized_rep_title', label: 'Representative Title', type: 'text', required: false },
    ], autoGenerationTrigger: { stage: 2 }, implementationStatus: 'full'
  },

  FDA_1572: {
    formId: 'FDA_1572', formNumber: '1572', title: 'Statement of Investigator',
    description: 'Clinical investigator statement for studies conducted under an IND',
    category: 'Clinical', version: 'unverified', lastUpdated: 'unknown',
    fields: [
      { id: 'investigator_name', label: 'Name of Investigator', type: 'text', required: true },
      // Box 2 qualifications are satisfied by an attachment (CV), not an inline
      // required field on the official 1572 — mirrors buildForm1572.
      { id: 'investigator_qualifications', label: 'Education, Training, and Experience', type: 'textarea', required: false },
      { id: 'facility_name', label: 'Facility Name and Address', type: 'textarea', required: true },
      { id: 'clinical_lab_name_address', label: 'Clinical Laboratory Name and Address', type: 'textarea', required: false },
      { id: 'irb_name_address', label: 'IRB Name and Address', type: 'textarea', required: true },
      { id: 'sub_investigators', label: 'Sub-Investigators', type: 'textarea', required: false },
      // The official Statement of Investigator has no study-title field; the
      // study is identified by protocol number(s). Not inline-required.
      { id: 'study_title', label: 'Study Title', type: 'text', required: false },
      { id: 'protocol_numbers', label: 'Protocol Number(s)', type: 'text', required: false },
    ], dependencies: ['FDA_1571'], autoGenerationTrigger: { stage: 2 }, implementationStatus: 'full'
  },

  FDA_1574: {
    formId: 'FDA_1574', formNumber: '1574', title: 'Assurance of IRB Review',
    description: 'Sponsor assurance of institutional review board review for a clinical investigation',
    category: 'Clinical', version: 'unverified', lastUpdated: 'unknown',
    fields: [
      { id: 'sponsor_name', label: 'Sponsor Name', type: 'text', required: true },
      { id: 'drug_name', label: 'Investigational Drug', type: 'text', required: true },
      { id: 'protocol_number', label: 'Protocol Number', type: 'text', required: true },
      { id: 'irb_name_address', label: 'IRB Name and Address', type: 'textarea', required: true },
      { id: 'irb_chair_name', label: 'IRB Chair', type: 'text', required: true },
      { id: 'irb_assurance_number', label: 'IRB Assurance Number', type: 'text', required: false },
      { id: 'authorized_rep_name', label: 'Sponsor Authorized Representative', type: 'text', required: true },
    ], dependencies: ['FDA_1571'], autoGenerationTrigger: { stage: 2 }, implementationStatus: 'full'
  },

  FDA_3454: {
    formId: 'FDA_3454', formNumber: '3454',
    title: 'Certification: Financial Interests and Arrangements of Clinical Investigators',
    description: 'Certification that no covered clinical investigator has a disclosable financial interest or arrangement',
    category: 'Clinical', version: 'unverified', lastUpdated: 'unknown',
    fields: [
      { id: 'sponsor_name', label: 'Applicant/Sponsor', type: 'text', required: true },
      { id: 'drug_name', label: 'Drug/Product', type: 'text', required: true },
      { id: 'study_title', label: 'Study Title', type: 'text', required: false },
      { id: 'investigator_names', label: 'Covered Clinical Investigators', type: 'textarea', required: false },
      { id: 'no_disclosable_interests', label: 'No disclosable interests certification', type: 'checkbox', required: true },
      { id: 'authorized_rep_name', label: 'Authorized Representative', type: 'text', required: true },
      { id: 'authorized_rep_title', label: 'Representative Title', type: 'text', required: false },
    ], autoGenerationTrigger: { stage: 5 }, implementationStatus: 'full'
  },

  FDA_356H: {
    formId: 'FDA_356H', formNumber: '356h',
    title: 'Application to Market a New or Abbreviated New Drug or Biologic for Human Use',
    description: 'Marketing application cover form for NDA, ANDA, BLA, and supplements',
    category: 'Common', version: 'unverified', lastUpdated: 'unknown',
    fields: [
      { id: 'applicant_name', label: 'Applicant Name', type: 'text', required: true },
      { id: 'applicant_address', label: 'Applicant Address', type: 'textarea', required: true },
      { id: 'application_type', label: 'Application Type', type: 'select', required: true, options: ['NDA', 'ANDA', 'BLA', 'Supplement'] },
      { id: 'application_number', label: 'Application Number', type: 'text', required: false },
      { id: 'proprietary_established_name', label: 'Proprietary / Established Name', type: 'text', required: true },
      { id: 'dosage_form', label: 'Dosage Form', type: 'text', required: true },
      { id: 'route_of_administration', label: 'Route of Administration', type: 'text', required: true },
      { id: 'indication', label: 'Indication(s)', type: 'textarea', required: true },
      { id: 'authorized_rep_name', label: 'Authorized Representative', type: 'text', required: true },
      { id: 'authorized_rep_title', label: 'Representative Title', type: 'text', required: false },
    ], autoGenerationTrigger: { stage: 6 }, implementationStatus: 'full',
    conditionalLogic: [{
      when: { fieldId: 'application_type', operator: 'equals', value: 'Supplement' },
      effect: 'required', fieldIds: ['application_number']
    }]
  },

  // ============ Special Submission Forms ============
  FDA_3847: {
    formId: 'FDA_3847',
    formNumber: '3847',
    title: 'Q-Submission Cover Sheet',
    description: 'Cover sheet for Q-Submission (Pre-Submission) meetings with FDA',
    category: 'Special',
    version: '2024.1',
    lastUpdated: '2024-01-01',
    fields: [
      {
        id: 'q_sub_type',
        label: 'Q-Submission Type',
        type: 'select',
        required: true,
        options: ['Pre-Submission', 'Submission Issue Meeting', 'Study Risk Determination', 'Informational Meeting'],
        workflowMapping: { stage: 'Strategy', section: 'RegulatoryStrategy', field: 'qSubType' }
      },
      {
        id: 'meeting_type',
        label: 'Meeting Type Requested',
        type: 'select',
        required: true,
        options: ['In-Person', 'Teleconference', 'Written Feedback Only'],
        workflowMapping: { stage: 'Strategy', section: 'RegulatoryStrategy', field: 'meetingType' }
      }
    ],
    autoGenerationTrigger: { stage: 1, condition: 'q_submission_planned' }
  },

  FDA_3898: {
    formId: 'FDA_3898',
    formNumber: '3898',
    title: 'De Novo Classification Request',
    description: 'Request for De Novo classification for novel devices',
    category: 'Special',
    version: '2024.1',
    lastUpdated: '2024-01-01',
    fields: [
      {
        id: 'device_name',
        label: 'Device Name',
        type: 'text',
        required: true,
        workflowMapping: { stage: 'Setup', section: 'DeviceIntake', field: 'deviceName' }
      },
      {
        id: 'classification_name',
        label: 'Proposed Classification Name',
        type: 'text',
        required: true,
        workflowMapping: { stage: 'Strategy', field: 'proposedClassification' }
      },
      {
        id: 'novel_features',
        label: 'Novel Features Description',
        type: 'textarea',
        required: true,
        maxLength: 5000,
        aiSuggestionEnabled: true,
        workflowMapping: { stage: 'Strategy', section: 'DeNovoJustification', field: 'novelFeatures' }
      }
    ],
    autoGenerationTrigger: { stage: 1, condition: 'de_novo_pathway' }
  },

  FDA_3853: {
    formId: 'FDA_3853',
    formNumber: '3853',
    title: 'Breakthrough Device Designation Request',
    description: 'Request for breakthrough device designation',
    category: 'Special',
    version: '2024.1',
    lastUpdated: '2024-01-01',
    fields: [
      {
        id: 'device_description',
        label: 'Device Description',
        type: 'textarea',
        required: true,
        maxLength: 3000,
        workflowMapping: { stage: 'Setup', section: 'DeviceIntake', field: 'deviceDescription' }
      },
      {
        id: 'breakthrough_criteria',
        label: 'Breakthrough Criteria Met',
        type: 'textarea',
        required: true,
        maxLength: 5000,
        aiSuggestionEnabled: true,
        workflowMapping: { stage: 'Strategy', section: 'BreakthroughJustification', field: 'criteria' }
      },
      {
        id: 'unmet_medical_need',
        label: 'Description of Unmet Medical Need',
        type: 'textarea',
        required: true,
        maxLength: 5000,
        aiSuggestionEnabled: true,
        workflowMapping: { stage: 'Strategy', section: 'BreakthroughJustification', field: 'unmetNeed' }
      }
    ],
    autoGenerationTrigger: { stage: 1, condition: 'breakthrough_eligible' }
  }
};

const FDA_FORMS_CATALOG_URL = 'https://www.fda.gov/about-fda/forms/new-and-updated-fda-forms';
export const FDA_FORMS_RELEASE_READINESS = {
  releaseReady: false,
  catalogComplete: false,
  officialAssetsVerified: false,
  blockers: ['FDA_CATALOG_NOT_RECONCILED', 'OFFICIAL_PDF_ASSETS_NOT_VERIFIED'],
} as const;
const FULLY_IMPLEMENTED_FORMS = new Set([
  'FDA_1571', 'FDA_1572', 'FDA_1574', 'FDA_3454', 'FDA_3455', 'FDA_356H', 'FDA_3674',
]);

export interface FDAOfficialCatalogEntry {
  formNumber: string;
  title: string;
  sourceUrl: string;
  revisionDate?: string;
}

export interface FDACatalogReconciliation {
  catalogEntries: number;
  registryEntries: number;
  missingFromRegistry: FDAOfficialCatalogEntry[];
  duplicateCatalogNumbers: string[];
  registryEntriesNotInSnapshot: string[];
  invalidSourceUrls: string[];
  reconciled: boolean;
}

function normalizedFormNumber(value: string): string {
  return value.toLowerCase().replace(/^fda\s*/i, '').replace(/[^a-z0-9]/g, '');
}

/**
 * Pure reconciliation gate for a reviewed FDA catalog snapshot. This does not
 * scrape or mutate the registry: ingestion supplies the reviewed snapshot and
 * promotion remains blocked until every official entry maps exactly once.
 */
export function reconcileFdaCatalogSnapshot(entries: FDAOfficialCatalogEntry[]): FDACatalogReconciliation {
  const counts = new Map<string, number>();
  const invalidSourceUrls: string[] = [];
  for (const entry of entries) {
    const number = normalizedFormNumber(entry.formNumber);
    counts.set(number, (counts.get(number) ?? 0) + 1);
    try {
      const url = new URL(entry.sourceUrl);
      if (url.protocol !== 'https:' || !(url.hostname === 'fda.gov' || url.hostname.endsWith('.fda.gov'))) invalidSourceUrls.push(entry.sourceUrl);
    } catch {
      invalidSourceUrls.push(entry.sourceUrl);
    }
  }
  const registryByNumber = new Map(Object.values(FDAFormsRegistry).map((form) => [normalizedFormNumber(form.formNumber), form]));
  const missingFromRegistry = entries.filter((entry) => !registryByNumber.has(normalizedFormNumber(entry.formNumber)));
  const duplicateCatalogNumbers = [...counts.entries()].filter(([, count]) => count > 1).map(([number]) => number).sort();
  const registryEntriesNotInSnapshot = [...registryByNumber.entries()]
    .filter(([number]) => !counts.has(number)).map(([, form]) => form.formId).sort();
  return {
    catalogEntries: entries.length,
    registryEntries: registryByNumber.size,
    missingFromRegistry,
    duplicateCatalogNumbers,
    registryEntriesNotInSnapshot,
    invalidSourceUrls,
    reconciled: entries.length > 0 && missingFromRegistry.length === 0
      && registryEntriesNotInSnapshot.length === 0
      && duplicateCatalogNumbers.length === 0 && invalidSourceUrls.length === 0,
  };
}

/** Add the governed lifecycle contract to legacy definitions without cloning registries. */
export function governedFormDefinition(form: FDAFormDefinition): FDAFormDefinition {
  return {
    ...form,
    implementationStatus: form.implementationStatus ?? (FULLY_IMPLEMENTED_FORMS.has(form.formId) ? 'full' : 'metadata'),
    source: form.source ?? { authority: 'FDA', catalogUrl: FDA_FORMS_CATALOG_URL },
    governance: form.governance ?? {
      states: ['draft', 'in_review', 'approved', 'superseded'],
      approvalRequired: true,
      failClosed: true,
    },
    pdf: form.pdf ?? { officialTemplatePreferred: true, fallbackWatermarkedDraft: true },
    storage: form.storage ?? { format: 'structured-field-map', versioned: true, provenanceRequired: true },
    applicability: applicabilityOf(form),
  };
}

// Helper function to get forms by category
export function getFormsByCategory(category: FDAFormDefinition['category']): FDAFormDefinition[] {
  return Object.values(FDAFormsRegistry).filter(form => form.category === category);
}

// ---------------------------------------------------------------------------
// Applicability — which FDA center / product domain / program a form belongs to.
//
// The device-centric `category` alone can't answer "which forms apply to THIS
// client's program" (e.g. an IND drug program vs a 510(k) device program). This
// models center/domain/program so the platform can serve the right form set.
// First model — refine per regulatory review; not claimed authoritative.
// ---------------------------------------------------------------------------

/** Forms whose real applicability differs from the category-derived default. */
const APPLICABILITY_OVERRIDES: Record<string, FormApplicability> = {
  // ClinicalTrials.gov certification — applicable across drug/biologic/device submissions.
  FDA_3674: { center: 'CDER', domains: ['drug', 'biologic', 'device'], programs: ['IND', 'NDA', 'BLA', '510k', 'PMA'] },
  // Financial interest cert/disclosure (21 CFR 54) — drug/biologic INDs + marketing apps.
  FDA_3454: { center: 'CDER', domains: ['drug', 'biologic'], programs: ['IND', 'NDA', 'BLA'] },
  FDA_3455: { center: 'CDER', domains: ['drug', 'biologic'], programs: ['IND', 'NDA', 'BLA'] },
  // Marketing application cover — NDA/ANDA/BLA (drug + biologic).
  FDA_356H: { center: 'CDER', domains: ['drug', 'biologic'], programs: ['NDA', 'ANDA', 'BLA'] },
  // Device certification/disclosure cover — 510(k).
  FDA_3654: { center: 'CDRH', domains: ['device'], programs: ['510k'] },
  // Truthful & accurate statement — used broadly.
  FDA_2891: { center: 'CDER', domains: ['drug', 'biologic', 'device'], programs: ['IND', 'NDA', 'BLA', '510k', 'PMA'] },
};

function deriveApplicabilityFromCategory(category: FDAFormDefinition['category']): FormApplicability {
  switch (category) {
    case '510k': return { center: 'CDRH', domains: ['device'], programs: ['510k'] };
    case 'PMA': return { center: 'CDRH', domains: ['device'], programs: ['PMA'] };
    case 'Special': return { center: 'CDRH', domains: ['device'], programs: ['DeNovo', 'Q-Sub', 'Breakthrough'] };
    case 'Clinical': return { center: 'CDER', domains: ['drug', 'biologic'], programs: ['IND'] };
    case 'Common':
    default: return { center: 'CDER', domains: ['drug', 'biologic', 'device'], programs: [] };
  }
}

/** A form's applicability: explicit field, else a per-form override, else derived from category. */
export function applicabilityOf(form: FDAFormDefinition): FormApplicability {
  return form.applicability ?? APPLICABILITY_OVERRIDES[form.formId] ?? deriveApplicabilityFromCategory(form.category);
}

/** Forms used in a given submission program (IND, NDA, 510k, …). */
export function getFormsForProgram(program: SubmissionProgram): FDAFormDefinition[] {
  return Object.values(FDAFormsRegistry).filter((f) => applicabilityOf(f).programs.includes(program));
}

/** Forms that apply to a given product domain (drug, biologic, device, combination). */
export function getFormsForDomain(domain: ProductDomain): FDAFormDefinition[] {
  return Object.values(FDAFormsRegistry).filter((f) => applicabilityOf(f).domains.includes(domain));
}

/** Forms owned by a given FDA center. */
export function getFormsForCenter(center: FdaCenter): FDAFormDefinition[] {
  return Object.values(FDAFormsRegistry).filter((f) => applicabilityOf(f).center === center);
}

/** Forms matching ALL supplied criteria (center AND domain AND program). */
export function getApplicableForms(criteria: {
  center?: FdaCenter;
  domain?: ProductDomain;
  program?: SubmissionProgram;
}): FDAFormDefinition[] {
  return Object.values(FDAFormsRegistry).filter((f) => {
    const a = applicabilityOf(f);
    if (criteria.center && a.center !== criteria.center) return false;
    if (criteria.domain && !a.domains.includes(criteria.domain)) return false;
    if (criteria.program && !a.programs.includes(criteria.program)) return false;
    return true;
  });
}

// Helper function to get forms required for a specific submission type
export function getRequiredForms(submissionType: '510k' | 'PMA' | 'DeNovo'): string[] {
  switch (submissionType) {
    // Form FDA 3514 (CDRH premarket review submission cover sheet) was retired
    // for 510(k) and De Novo when eSTAR became mandatory: the eSTAR captures the
    // cover-sheet data itself. Forms 1571/1572 are IND forms and never belong
    // to a PMA.
    case '510k':
      return ['FDA_3601', 'FDA_3881', 'FDA_3654', 'FDA_3872', 'FDA_2891'];
    case 'PMA':
      return ['FDA_3663', 'FDA_3601', 'FDA_3654', 'FDA_2891'];
    case 'DeNovo':
      return ['FDA_3898', 'FDA_3601', 'FDA_3654', 'FDA_2891'];
    default:
      return [];
  }
}

// Helper function to check if all dependencies are met
export function checkFormDependencies(formId: string, completedForms: string[]): boolean {
  const form = FDAFormsRegistry[formId];
  if (!form || !form.dependencies) return true;
  
  return form.dependencies.every(dep => completedForms.includes(dep));
}

// Helper function to get forms that should auto-generate at a specific stage
export function getFormsForStage(stage: number): string[] {
  return Object.entries(FDAFormsRegistry)
    .filter(([_, form]) => form.autoGenerationTrigger?.stage === stage)
    .map(([formId, _]) => formId);
}

// Class wrapper for FDAFormsRegistry
export class FDAFormsRegistryClass {
  private registry = FDAFormsRegistry;
  
  getFullRegistry(): Record<string, FDAFormDefinition> {
    return Object.fromEntries(Object.entries(this.registry).map(([id, form]) => [id, governedFormDefinition(form)]));
  }
  
  getForm(formId: string): FDAFormDefinition | undefined {
    const form = this.registry[formId];
    return form ? governedFormDefinition(form) : undefined;
  }
  
  getCategories(): string[] {
    return ['510k', 'PMA', 'Clinical', 'Special', 'Common'];
  }
  
  getFormsByCategory(category: FDAFormDefinition['category']): string[] {
    return Object.keys(this.registry).filter(
      formId => this.registry[formId].category === category
    );
  }
  
  getRequiredForms(submissionType: '510k' | 'PMA' | 'DeNovo'): string[] {
    return getRequiredForms(submissionType);
  }
  
  checkDependencies(formId: string, completedForms: string[]): boolean {
    return checkFormDependencies(formId, completedForms);
  }
  
  getFormsForStage(stage: number): string[] {
    return getFormsForStage(stage);
  }

  /** The center/domain/program applicability for a form (explicit, override, or derived). */
  getApplicability(formId: string): FormApplicability | undefined {
    const form = this.registry[formId];
    return form ? applicabilityOf(form) : undefined;
  }

  /** Governed form definitions applicable to a submission program (IND, NDA, 510k, …). */
  getFormsForProgram(program: SubmissionProgram): FDAFormDefinition[] {
    return getFormsForProgram(program).map(governedFormDefinition);
  }

  /** Governed form definitions matching ALL supplied criteria (center/domain/program). */
  getApplicableForms(criteria: { center?: FdaCenter; domain?: ProductDomain; program?: SubmissionProgram }): FDAFormDefinition[] {
    return getApplicableForms(criteria).map(governedFormDefinition);
  }
}
