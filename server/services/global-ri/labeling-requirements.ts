/**
 * Cross-market product-labeling requirements expert.
 *
 * The mandatory labeling document for an approved medicine — its required
 * sections, ordering, and headings — is fixed by regulation and differs by
 * health authority. This service encodes the required labeling sections per
 * market and assesses a sponsor's draft against them, surfacing exactly which
 * required sections are missing before submission.
 *
 * Markets:
 *  - FDA  — US Prescribing Information (PI), Physician Labeling Rule
 *           (21 CFR 201.56 / 201.57).
 *  - EMA  — Summary of Product Characteristics (SmPC), QRD template numbered
 *           sections per Directive 2001/83/EC Art. 11.
 *  - PMDA — Japanese package insert (添付文書), core sections per the MHLW/PMDA
 *           notification on package-insert format.
 *
 * The section lists capture the mandatory document headings; sponsor SOPs and
 * the current agency templates remain authoritative for edge cases (this is a
 * readiness aid, honest-by-construction). Note the FDA BOXED WARNING is
 * conditional (only when applicable) and is therefore not modeled as a required
 * section here.
 *
 * Pure / deterministic — no DB, no IO.
 *
 * Reference: 21 CFR 201.57 (FDA Physician Labeling Rule content/format);
 * EMA QRD template / Directive 2001/83/EC Art. 11 (SmPC); PMDA/MHLW notification
 * on the format of package inserts for prescription drugs (添付文書).
 *
 * @module server/services/global-ri/labeling-requirements
 */

export type LabelMarket = 'FDA' | 'EMA' | 'PMDA';

export interface LabelingSection {
  /** Stable section code (e.g. 'us_indications_usage'). */
  code: string;
  /** Human-readable section title. */
  title: string;
}

/** Required labeling document sections for an approved medicine, by market. */
export const LABELING_REQUIREMENTS: Record<LabelMarket, LabelingSection[]> = {
  // FDA US Prescribing Information (PI) — 21 CFR 201.56/201.57.
  // BOXED WARNING is intentionally omitted: it is required only when applicable.
  FDA: [
    { code: 'us_highlights', title: 'Highlights of Prescribing Information' },
    { code: 'us_indications_usage', title: 'Indications and Usage' },
    { code: 'us_dosage_administration', title: 'Dosage and Administration' },
    { code: 'us_dosage_forms_strengths', title: 'Dosage Forms and Strengths' },
    { code: 'us_contraindications', title: 'Contraindications' },
    { code: 'us_warnings_precautions', title: 'Warnings and Precautions' },
    { code: 'us_adverse_reactions', title: 'Adverse Reactions' },
    { code: 'us_drug_interactions', title: 'Drug Interactions' },
    { code: 'us_use_specific_populations', title: 'Use in Specific Populations' },
    { code: 'us_overdosage', title: 'Overdosage' },
    { code: 'us_description', title: 'Description' },
    { code: 'us_clinical_pharmacology', title: 'Clinical Pharmacology' },
    { code: 'us_nonclinical_toxicology', title: 'Nonclinical Toxicology' },
    { code: 'us_clinical_studies', title: 'Clinical Studies' },
    { code: 'us_how_supplied_storage', title: 'How Supplied/Storage and Handling' },
    { code: 'us_patient_counseling', title: 'Patient Counseling Information' },
  ],
  // EMA Summary of Product Characteristics (SmPC) — QRD template,
  // Directive 2001/83/EC Art. 11. Numbered sections 1–10 (section 4 expanded).
  EMA: [
    { code: 'eu_1_name', title: '1. Name of the medicinal product' },
    { code: 'eu_2_composition', title: '2. Qualitative and quantitative composition' },
    { code: 'eu_3_pharmaceutical_form', title: '3. Pharmaceutical form' },
    { code: 'eu_4_clinical_particulars', title: '4. Clinical particulars' },
    { code: 'eu_4_1_indications', title: '4.1 Therapeutic indications' },
    { code: 'eu_4_2_posology', title: '4.2 Posology and method of administration' },
    { code: 'eu_4_3_contraindications', title: '4.3 Contraindications' },
    { code: 'eu_4_4_special_warnings', title: '4.4 Special warnings and precautions for use' },
    { code: 'eu_4_5_interactions', title: '4.5 Interaction with other medicinal products and other forms of interaction' },
    { code: 'eu_4_6_pregnancy_lactation', title: '4.6 Fertility, pregnancy and lactation' },
    { code: 'eu_4_7_driving', title: '4.7 Effects on ability to drive and use machines' },
    { code: 'eu_4_8_undesirable_effects', title: '4.8 Undesirable effects' },
    { code: 'eu_4_9_overdose', title: '4.9 Overdose' },
    { code: 'eu_5_pharmacological_properties', title: '5. Pharmacological properties' },
    { code: 'eu_6_pharmaceutical_particulars', title: '6. Pharmaceutical particulars' },
    { code: 'eu_7_ma_holder', title: '7. Marketing authorisation holder' },
    { code: 'eu_8_ma_number', title: '8. Marketing authorisation number(s)' },
    { code: 'eu_9_date_first_authorisation', title: '9. Date of first authorisation/renewal of the authorisation' },
    { code: 'eu_10_date_revision', title: '10. Date of revision of the text' },
  ],
  // PMDA Japanese package insert (添付文書) — core sections per MHLW/PMDA
  // notification on package-insert format.
  PMDA: [
    { code: 'jp_warnings', title: 'Warnings (警告)' },
    { code: 'jp_contraindications', title: 'Contraindications (禁忌)' },
    { code: 'jp_composition_description', title: 'Composition and Product Description (組成・性状)' },
    { code: 'jp_indications', title: 'Indications (効能・効果)' },
    { code: 'jp_dosage_administration', title: 'Dosage and Administration (用法・用量)' },
    { code: 'jp_precautions', title: 'Precautions for Use (使用上の注意)' },
    { code: 'jp_adverse_reactions', title: 'Adverse Reactions (副作用)' },
    { code: 'jp_pharmacokinetics', title: 'Pharmacokinetics (薬物動態)' },
    { code: 'jp_clinical_studies', title: 'Clinical Studies (臨床成績)' },
    { code: 'jp_pharmacology', title: 'Pharmacology (薬効薬理)' },
    { code: 'jp_handling_precautions', title: 'Handling Precautions (取扱い上の注意)' },
    { code: 'jp_approval_conditions', title: 'Approval Conditions (承認条件)' },
  ],
};

export type LabelingFindingSeverity = 'error' | 'warning';

export interface LabelingFinding {
  severity: LabelingFindingSeverity;
  /** MISSING_SECTION / EXTRA_SECTION / UNKNOWN_MARKET. */
  code: string;
  message: string;
  /** The section code the finding concerns, when applicable. */
  section?: string;
}

export interface LabelingResult {
  market: LabelMarket;
  ready: boolean;
  /** All required sections for the market. */
  required: LabelingSection[];
  /** Required section codes the sponsor has not provided. */
  missing: string[];
  findings: LabelingFinding[];
  counts: { errors: number; warnings: number };
}

export interface LabelingInput {
  market: LabelMarket;
  /** Section codes the sponsor has drafted (from LABELING_REQUIREMENTS). */
  providedSections: string[];
}

/**
 * Assess a sponsor's labeling sections against the market's required set.
 * A missing required section is a blocking error; an unrecognized provided
 * code is an informational warning. ready ⇔ no errors.
 * Pure / deterministic; findings ordered by section code then severity.
 */
export function assessLabeling(input: LabelingInput): LabelingResult {
  const required = LABELING_REQUIREMENTS[input.market];

  if (!required) {
    return {
      market: input.market,
      ready: false,
      required: [],
      missing: [],
      findings: [{ severity: 'error', code: 'UNKNOWN_MARKET', message: `No labeling requirements modeled for market "${input.market}".` }],
      counts: { errors: 1, warnings: 0 },
    };
  }

  const provided = new Set((input.providedSections ?? []).map((s) => String(s)));
  const requiredCodes = new Set(required.map((r) => r.code));

  const findings: LabelingFinding[] = [];
  const missing: string[] = [];

  for (const section of required) {
    if (!provided.has(section.code)) {
      missing.push(section.code);
      findings.push({ severity: 'error', code: 'MISSING_SECTION', message: `Missing required labeling section: ${section.title}.`, section: section.code });
    }
  }

  for (const code of provided) {
    if (!requiredCodes.has(code)) {
      findings.push({ severity: 'warning', code: 'EXTRA_SECTION', message: `Provided section "${code}" is not in the ${input.market} required labeling set; confirm placement.`, section: code });
    }
  }

  findings.sort((a, b) => {
    const sa = a.section ?? '';
    const sb = b.section ?? '';
    if (sa !== sb) return sa.localeCompare(sb);
    return a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1;
  });

  const errors = findings.filter((f) => f.severity === 'error').length;

  return {
    market: input.market,
    ready: errors === 0,
    required,
    missing,
    findings,
    counts: { errors, warnings: findings.length - errors },
  };
}

/** List the required labeling sections for a market (for a checklist UI). */
export function getLabelingRequirements(market: LabelMarket): LabelingSection[] {
  return LABELING_REQUIREMENTS[market] ?? [];
}
