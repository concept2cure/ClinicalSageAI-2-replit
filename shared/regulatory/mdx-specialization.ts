/**
 * MDX specialization — the PURE preset table for the second axis inside MDX.
 *
 * client-type-profiles.ts maps an industry to a coarse vertical (mdx / biopharma
 * / pdev). That is the right first axis and this module does not replace it. But
 * `medtech` collapses two populations that share the MDX workspace and need
 * materially different content:
 *
 *   a Class II instrument manufacturer, and
 *   an IVD manufacturer running analytical and clinical performance studies.
 *
 * They differ in study archetypes, protocol structure, evidence requirements,
 * performance statistics, filing types and terminology. Presenting an IVD
 * sponsor a device-clinical-investigation protocol outline — or a device sponsor
 * a limit-of-detection study — is not a cosmetic mismatch; it is the wrong
 * regulatory instrument, and it is what a single `medtech` value forces.
 *
 * So specialization is a separate declared field, not something inferred from a
 * product name. Nothing here forks navigation: the left rail is fixed, and these
 * presets only change what the existing modules offer inside themselves.
 *
 * Deliberately pure (no DB, no server imports), like its sibling. Persistence
 * lives in organization_industry_profiles / project_industry_profiles, and
 * license entitlement is overlaid by the server resolver — never here.
 *
 * @module shared/regulatory/mdx-specialization
 */

/**
 * The MDX population a workspace is set up for.
 *
 * `unspecified` is a real, meaningful state, not a placeholder for laziness. A
 * CRO or regulatory consultancy legitimately serves both device and IVD clients,
 * and guessing on their behalf would silently offer the wrong study archetypes.
 * The resolver reports it so the UI can ask once, at the project level, instead
 * of defaulting quietly.
 */
export const MDX_SPECIALIZATIONS = [
  'medical_device',
  'ivd_diagnostics',
  'medical_device_and_ivd',
  'software_as_medical_device',
  'companion_diagnostic',
  'combination_product',
  'unspecified',
] as const;
export type MdxSpecialization = (typeof MDX_SPECIALIZATIONS)[number];

/** The organization's declared primary industry (governed, org-level). */
export const PRIMARY_INDUSTRIES = [
  'medical_device_diagnostics',
  'biotech_pharma',
  'cro',
  'regulatory_consulting',
  'academic_research',
] as const;
export type PrimaryIndustry = (typeof PRIMARY_INDUSTRIES)[number];

/**
 * Primary industry → the `organizations.industry_mode` value it corresponds to.
 *
 * The two vocabularies coexist because industry_mode is already persisted and
 * already drives client-type-profiles; this mapping keeps the new governed field
 * consistent with it rather than establishing a second source of truth for the
 * same fact.
 */
export const INDUSTRY_MODE_FOR_PRIMARY: Record<PrimaryIndustry, string> = {
  medical_device_diagnostics: 'medtech',
  biotech_pharma: 'biotech',
  cro: 'cro',
  regulatory_consulting: 'regulatory',
  academic_research: 'academic',
};

/** Reverse map, for reading a legacy org that only has industry_mode set. */
export const PRIMARY_FOR_INDUSTRY_MODE: Record<string, PrimaryIndustry> = {
  medtech: 'medical_device_diagnostics',
  biotech: 'biotech_pharma',
  pharma: 'biotech_pharma',
  cro: 'cro',
  regulatory: 'regulatory_consulting',
  academic: 'academic_research',
  medical_writing: 'regulatory_consulting',
};

/**
 * Whether a primary industry determines the regulatory vertical on its own.
 *
 * A device company's projects are device projects. A CRO's are whatever its
 * sponsor's are — so for service organizations the org-level vertical is a weak
 * default that a project is expected to override, and the resolver says which
 * case it is rather than presenting a guess as a decision.
 */
export const INDUSTRY_DETERMINES_VERTICAL: Record<PrimaryIndustry, boolean> = {
  medical_device_diagnostics: true,
  biotech_pharma: true,
  cro: false,
  regulatory_consulting: false,
  academic_research: false,
};

// ── Study archetypes ─────────────────────────────────────────────────────────

/**
 * Device clinical/human-factors study archetypes.
 *
 * Kept separate from the IVD list because the overlap is almost empty: a device
 * study asks whether the device is safe and performs as intended in use, an IVD
 * study asks whether the measurement is accurate and reproducible.
 */
export const DEVICE_STUDY_TYPES = [
  'feasibility',
  'early_feasibility',
  'pivotal_clinical_investigation',
  'comparative_device_study',
  'human_factors_formative',
  'human_factors_validation',
  'software_clinical_validation',
  'pmcf',
  'registry',
  'postmarket_study',
  'real_world_evidence',
] as const;

/** IVD analytical performance archetypes — the measurement's own properties. */
export const IVD_ANALYTICAL_STUDY_TYPES = [
  'scientific_validity',
  'precision',
  'reproducibility',
  'lob_lod_loq',
  'linearity_measuring_range',
  'analytical_specificity',
  'interference',
  'cross_reactivity',
  'carryover',
  'matrix_equivalence',
  'specimen_stability',
  'reagent_stability',
] as const;

/** IVD clinical performance archetypes — what the result means for a patient. */
export const IVD_CLINICAL_STUDY_TYPES = [
  'clinical_sensitivity_specificity',
  'ppa_npa_opa',
  'roc_cutoff',
  'prospective_clinical_performance',
  'retrospective_specimen',
  'lay_user',
  'untrained_operator',
  'clia_waiver_flex',
  'cdx_concordance',
  'pmpf',
] as const;

export type MdxStudyType =
  | (typeof DEVICE_STUDY_TYPES)[number]
  | (typeof IVD_ANALYTICAL_STUDY_TYPES)[number]
  | (typeof IVD_CLINICAL_STUDY_TYPES)[number];

// ── Filing types ─────────────────────────────────────────────────────────────

export const DEVICE_FILING_TYPES = [
  'q_submission',
  'section_513g',
  'ide',
  'us_510k',
  'de_novo',
  'pma',
  'pma_supplement',
  'hde',
  'eu_mdr_technical_documentation',
  'cer',
  'pmcf_plan',
] as const;

export const IVD_FILING_TYPES = [
  'ivd_510k',
  'dual_510k_clia_waiver',
  'de_novo_ivd',
  'pma_cdx',
  'eu_ivdr_technical_documentation',
  'performance_evaluation_report',
  'performance_study',
  'pmpf_plan',
  'canadian_ivdd_licence',
] as const;

export type MdxFilingType =
  | (typeof DEVICE_FILING_TYPES)[number]
  | (typeof IVD_FILING_TYPES)[number];

// ── What each specialization enables ─────────────────────────────────────────

export interface SpecializationPreset {
  specialization: MdxSpecialization;
  label: string;
  /** Study archetypes the Study Design Center should offer. */
  studyTypes: readonly MdxStudyType[];
  /** Filing types project creation and the Submission Center should offer. */
  filingTypes: readonly MdxFilingType[];
  /**
   * Terminology deltas layered OVER the industry profile's terminology. An IVD
   * sponsor does not call the thing a "Device", and a shell that does reads as
   * built for someone else.
   */
  terminology: Record<string, string>;
  /** The filing a new project of this specialization most often starts from. */
  defaultFilingType: MdxFilingType | null;
}

const DEVICE_PRESET: SpecializationPreset = {
  specialization: 'medical_device',
  label: 'Medical Device',
  studyTypes: DEVICE_STUDY_TYPES,
  filingTypes: DEVICE_FILING_TYPES,
  terminology: { product: 'Device', study: 'Clinical investigation', subject: 'Subject' },
  defaultFilingType: 'us_510k',
};

const IVD_PRESET: SpecializationPreset = {
  specialization: 'ivd_diagnostics',
  label: 'IVD / Diagnostics',
  studyTypes: [...IVD_ANALYTICAL_STUDY_TYPES, ...IVD_CLINICAL_STUDY_TYPES],
  filingTypes: IVD_FILING_TYPES,
  // An IVD's unit of analysis is a specimen, not a subject, and its "study" is a
  // performance study. Using device words here would misdescribe the work.
  terminology: { product: 'Assay', study: 'Performance study', subject: 'Specimen' },
  defaultFilingType: 'ivd_510k',
};

const PRESETS: Record<MdxSpecialization, SpecializationPreset> = {
  medical_device: DEVICE_PRESET,
  ivd_diagnostics: IVD_PRESET,

  medical_device_and_ivd: {
    specialization: 'medical_device_and_ivd',
    label: 'Medical Device and IVD',
    studyTypes: [...DEVICE_STUDY_TYPES, ...IVD_ANALYTICAL_STUDY_TYPES, ...IVD_CLINICAL_STUDY_TYPES],
    filingTypes: [...DEVICE_FILING_TYPES, ...IVD_FILING_TYPES],
    // Neutral wording, because either could be meant. The project-level
    // specialization narrows it; the org level should not pick a side.
    terminology: { product: 'Product', study: 'Study', subject: 'Subject' },
    defaultFilingType: null,
  },

  software_as_medical_device: {
    specialization: 'software_as_medical_device',
    label: 'Software as a Medical Device',
    // SaMD evidence is clinical validation and human factors; the analytical
    // panel does not apply, since there is no reagent or specimen.
    studyTypes: [
      'software_clinical_validation', 'human_factors_formative', 'human_factors_validation',
      'pivotal_clinical_investigation', 'real_world_evidence', 'pmcf', 'postmarket_study',
    ],
    filingTypes: DEVICE_FILING_TYPES,
    terminology: { product: 'Software', study: 'Clinical validation', subject: 'Subject' },
    defaultFilingType: 'us_510k',
  },

  companion_diagnostic: {
    specialization: 'companion_diagnostic',
    label: 'Companion Diagnostic',
    // A CDx is an IVD whose claim is tied to a therapeutic, so it needs the full
    // IVD panel plus concordance against the drug's clinical trial assay.
    studyTypes: [...IVD_ANALYTICAL_STUDY_TYPES, ...IVD_CLINICAL_STUDY_TYPES],
    filingTypes: [...IVD_FILING_TYPES, 'pma', 'pma_supplement'],
    terminology: { product: 'Companion diagnostic', study: 'Performance study', subject: 'Specimen' },
    defaultFilingType: 'pma_cdx',
  },

  combination_product: {
    specialization: 'combination_product',
    label: 'Combination Product',
    studyTypes: [...DEVICE_STUDY_TYPES, 'human_factors_validation'],
    filingTypes: [...DEVICE_FILING_TYPES, 'pma', 'pma_supplement'],
    terminology: { product: 'Combination product', study: 'Clinical study', subject: 'Subject' },
    defaultFilingType: 'ide',
  },

  unspecified: {
    specialization: 'unspecified',
    label: 'Not yet specified',
    // Deliberately empty. Offering every archetype would be the same failure as
    // guessing — the point is that the surface asks rather than presents a menu
    // that is wrong for at least half of it.
    studyTypes: [],
    filingTypes: [],
    terminology: {},
    defaultFilingType: null,
  },
};

/** The preset for a specialization; `unspecified` for anything unrecognized. */
export function specializationPreset(value: string | null | undefined): SpecializationPreset {
  const key = (value ?? '').trim().toLowerCase() as MdxSpecialization;
  return PRESETS[key] ?? PRESETS.unspecified;
}

export function isMdxSpecialization(value: unknown): value is MdxSpecialization {
  return typeof value === 'string' && (MDX_SPECIALIZATIONS as readonly string[]).includes(value);
}

export function isPrimaryIndustry(value: unknown): value is PrimaryIndustry {
  return typeof value === 'string' && (PRIMARY_INDUSTRIES as readonly string[]).includes(value);
}

/** Does this specialization carry IVD performance work? */
export function isIvdLike(s: MdxSpecialization): boolean {
  return s === 'ivd_diagnostics' || s === 'companion_diagnostic' || s === 'medical_device_and_ivd';
}

export default { specializationPreset, isMdxSpecialization, isPrimaryIndustry, isIvdLike };
