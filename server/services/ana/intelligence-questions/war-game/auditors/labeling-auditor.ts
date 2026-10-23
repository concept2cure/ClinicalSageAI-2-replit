/**
 * Labeling Auditor -- simulates FDA OPDP/DMEPA reviewer scrutiny of drug
 * and device labeling.
 *
 * Generates adversarial questions across seven audit dimensions, referencing
 * actual FDA regulations (21 CFR 201.56-57, 21 CFR 201.66, 21 CFR 208,
 * 21 CFR 801), PLLR Final Rule, FDA PLR Guidance, and OPDP enforcement letters.
 *
 * @module server/services/ana/intelligence-questions/war-game/auditors/labeling-auditor
 */

import type { WarGameAuditor, AuditRule, WarGameFinding, AuditDimension } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const rid = (suffix: string) => 'lbl_' + suffix;

function isBlank(val: unknown): boolean {
  if (val === undefined || val === null) return true;
  if (typeof val === 'string' && val.trim() === '') return true;
  if (Array.isArray(val) && val.length === 0) return true;
  return false;
}

function numericVal(val: unknown): number | null {
  if (val === undefined || val === null) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

/* A yes_no answer is a boolean from the UI and 'yes'/'no' from the AnA tool
   surface (shared/ana/question-predicate.ts coerces the same way). */
function isYes(val: unknown): boolean {
  return val === true || (typeof val === 'string' && /^(yes|true)$/i.test(val.trim()));
}

function isNo(val: unknown): boolean {
  return val === false || (typeof val === 'string' && /^(no|false)$/i.test(val.trim()));
}

/* 2026-10-22: rules converged onto the fields flows/labeling.ts asks. A rule
   still reading a key the interview never asks is reported NOT ASSESSED by
   the war-game engine; it was left as is because the interview has no
   question asking the same thing.

   The interview branches on `product_type` at its first node: a device or
   IVD goes to device_labeling_801, an OTC drug to otc_drug_facts, and every
   other answer (blank included, via defaultNext) to the prescribing-
   information nodes. A PI field is never asked of an OTC drug or a device,
   so its blank is not an omission there. */
function onPrescribingPath(answers: Record<string, unknown>): boolean {
  return !['otc_drug', 'medical_device', 'ivd'].includes(String(answers.product_type ?? ''));
}

/** FPI section `n` (21 CFR 201.57(c)) is among those the labeling includes. */
function includesFpiSection(answers: Record<string, unknown>, n: string): boolean {
  const sections = answers.fpi_sections_included;
  return Array.isArray(sections) && sections.map(String).includes(n);
}

/** The Drug Facts panel fields of otc_drug_facts (21 CFR 201.66(c)). */
const DRUG_FACTS_FIELDS = [
  'otc_active_ingredients', 'otc_purpose', 'otc_uses', 'otc_warnings',
  'otc_directions', 'otc_inactive_ingredients', 'otc_questions_number',
] as const;

/** The 12.3 Pharmacokinetics fields of mechanism_and_pk. */
const PK_FIELDS = [
  'absorption_bioavailability', 'distribution_protein_binding', 'metabolism_enzymes', 'elimination_half_life',
] as const;

function finding(
  id: string,
  dimension: AuditDimension,
  severity: 'info' | 'warning' | 'critical',
  title: string,
  question: string,
  observation: string,
  requirement: string,
  reference: string,
  recommendation: string,
  relatedFields: string[],
): WarGameFinding {
  return { id, dimension, severity, title, question, observation, requirement, reference, recommendation, relatedFields };
}

/* ------------------------------------------------------------------ */
/*  Audit Rules                                                       */
/* ------------------------------------------------------------------ */

const rules: AuditRule[] = [
  /* ========== COMPLETENESS (5 rules) ========== */
  {
    id: rid('no_highlights'),
    dimension: 'completeness',
    title: 'Highlights Section Missing',
    question: 'The labeling does not include a Highlights of Prescribing Information section. How does the sponsor expect prescribers to quickly identify the most critical safety and efficacy information for this product?',
    /* 2026-10-22 (D2): reads the interview's `highlights_section` select
       (plr_highlights), asked on the prescribing path only. Fires on an
       explicit 'not_started'; 'not_applicable' (older-format labeling) and a
       blank answer are not findings. */
    check(answers) {
      if (onPrescribingPath(answers) && answers.highlights_section === 'not_started') {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'The Highlights of Prescribing Information section is stated as not started.',
          'The Highlights section is required for all new and recently approved prescription drug products per 21 CFR 201.57(a) under the Physician Labeling Rule (PLR).',
          '21 CFR 201.57(a); FDA PLR Guidance (2013); 71 FR 3922',
          'Draft a Highlights section that includes the product name, initial U.S. approval year, boxed warning reference (if applicable), indications, dosage, contraindications, warnings/precautions summary, and adverse reactions summary.',
          ['highlights_section', 'product_name'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_boxed_warning'),
    dimension: 'completeness',
    title: 'Boxed Warning Missing When Required',
    question: 'The product has known serious risks that may warrant a boxed warning, yet none is included. Can the sponsor justify the absence of a boxed warning given the safety profile?',
    check(answers) {
      // 2026-10-22: read the interview's own determination (boxed_warning_required),
      // not `serious_risks`, which the labeling interview does not ask.
      if (onPrescribingPath(answers) && answers.boxed_warning_required === 'yes' && isBlank(answers.boxed_warning_text)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'A boxed warning is stated to be required, but no boxed warning text is included in the labeling.',
          // 2026-10-15: attributed this criterion to 21 CFR 201.57(c)(1), which sets the box's content and format.
          'Per FDA guidance (2011) on the Warnings and Precautions, Contraindications and Boxed Warning sections (cited by title), a boxed warning is warranted when there is an adverse reaction so serious relative to the drug\'s benefit that it is essential to consider in deciding whether to prescribe the drug.',
          '21 CFR 201.57(c)(1); 21 CFR 201.80(e); FDA guidance (2011), Warnings and Precautions, Contraindications, and Boxed Warning Sections of Labeling (title only)',
          'Evaluate whether the identified serious risks meet the threshold for a boxed warning. If so, draft the warning using the format prescribed by 21 CFR 201.57(c)(1) and include it in both Highlights and Full Prescribing Information.',
          ['boxed_warning_required', 'boxed_warning_text'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_contraindications'),
    dimension: 'completeness',
    title: 'Contraindications Section Missing',
    question: 'The labeling does not include a Contraindications section. Every prescription drug label must address situations where the drug should not be used. How does the sponsor intend to inform prescribers of absolute contraindications?',
    check(answers) {
      if (onPrescribingPath(answers) && isBlank(answers.contraindications_list)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No contraindications are documented in the labeling.',
          'A Contraindications section is required per 21 CFR 201.57(c)(5) and must describe situations in which the drug should not be used because the risk clearly outweighs any possible therapeutic benefit.',
          '21 CFR 201.57(c)(5); FDA PLR Guidance (2013)',
          'Include a Contraindications section listing all conditions, patient populations, or concomitant therapies for which the drug is contraindicated, with supporting evidence from clinical or nonclinical data.',
          ['contraindications_list', 'contraindication_count'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_adverse_reactions'),
    dimension: 'completeness',
    title: 'Adverse Reactions Section Missing',
    question: 'The labeling omits an Adverse Reactions section entirely. This is a fundamental regulatory deficiency. How will healthcare providers assess the benefit-risk profile without adverse event data?',
    check(answers) {
      if (onPrescribingPath(answers) && isBlank(answers.clinical_trial_experience_summary)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No adverse reactions section is present in the labeling.',
          'An Adverse Reactions section is mandatory per 21 CFR 201.57(c)(7). It must list adverse reactions identified in clinical trials and postmarketing experience.',
          '21 CFR 201.57(c)(7); ICH E2C(R2); FDA PLR Guidance (2013)',
          'Compile all adverse reactions from clinical trial data and postmarketing surveillance. Present them by frequency and severity, with tables for common reactions (>=1%) and narratives for serious but less common events.',
          ['clinical_trial_experience_summary', 'most_common_ars'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_dosing'),
    dimension: 'completeness',
    title: 'Dosage and Administration Missing',
    question: 'The labeling does not specify dosage and administration instructions. Without this information, how can prescribers safely and effectively administer this product to patients?',
    check(answers) {
      if (onPrescribingPath(answers) && isBlank(answers.recommended_dosage)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No dosage and administration information is provided.',
          'The Dosage and Administration section is required per 21 CFR 201.57(c)(3) and must include the recommended dosage, route, frequency, duration, and any dose modifications.',
          '21 CFR 201.57(c)(3); FDA PLR Guidance (2013)',
          'Provide complete dosage and administration instructions including recommended dose, route of administration, dosing schedule, dose adjustment criteria (renal/hepatic impairment, body weight), and preparation/reconstitution instructions if applicable.',
          ['recommended_dosage', 'route_of_administration', 'dosage_forms_summary'],
        );
      }
      return null;
    },
  },

  /* ========== CONSISTENCY (4 rules) ========== */
  {
    id: rid('trial_data_not_reflected'),
    dimension: 'consistency',
    title: 'Clinical Trial Data Not Reflected in Label',
    question: 'The sponsor has completed pivotal clinical trials, but the efficacy results and safety data from these trials are not adequately reflected in the labeling. Can the sponsor explain this discrepancy between trial outcomes and label content?',
    check(answers) {
      const hasTrialData = !isBlank(answers.clinical_trial_data);
      const hasEfficacyInLabel = includesFpiSection(answers, '14');
      if (hasTrialData && !hasEfficacyInLabel) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Clinical trial data exists but is not incorporated into the Clinical Studies section of the labeling.',
          'The Clinical Studies section per 21 CFR 201.57(c)(15) must describe each clinical study that is pertinent to the drug\'s claimed effectiveness, including study design, population, endpoints, and results.',
          '21 CFR 201.57(c)(15); FDA PLR Guidance (2013)',
          'Incorporate all pivotal trial data into the Clinical Studies section, including study design summaries, patient demographics, primary and secondary endpoint results with statistical significance, and subgroup analyses.',
          ['clinical_trial_data', 'fpi_sections_included', 'indications_list'],
        );
      }
      return null;
    },
  },
  {
    id: rid('off_label_claims'),
    dimension: 'consistency',
    title: 'Off-Label Claims Detected in Labeling',
    question: 'The labeling appears to include efficacy claims for indications not supported by the approved clinical data. How does the sponsor justify the inclusion of claims that extend beyond the studied indications?',
    check(answers) {
      const hasOffLabel = answers.off_label_claims === true || answers.off_label_claims === 'yes' || answers.off_label_claims === 'Yes';
      if (hasOffLabel) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'The labeling contains claims that are not supported by approved clinical trial data, potentially constituting off-label promotion.',
          'Labeling must be consistent with the approved indication per 21 CFR 201.56(a)(1). Off-label promotion violates FDCA Sections 502(a) and 201(n). OPDP enforcement actions frequently cite misbranding for unsupported claims.',
          '21 CFR 201.56(a)(1); FDCA Sections 201(n), 502(a); OPDP Enforcement Letters',
          'Remove all efficacy claims not supported by substantial evidence from adequate and well-controlled trials. Ensure each claim in the Indications and Clinical Studies sections maps directly to approved trial data.',
          ['off_label_claims', 'indications_list', 'fpi_sections_included'],
        );
      }
      return null;
    },
  },
  {
    id: rid('dosing_protocol_mismatch'),
    dimension: 'consistency',
    title: 'Dosing in Label vs. Clinical Protocol Mismatch',
    question: 'The recommended dosing in the labeling does not match the dosing regimen used in the pivotal clinical trials. This inconsistency undermines the evidentiary basis for the approved dose. Can the sponsor reconcile this discrepancy?',
    check(answers) {
      const labelDose = String(answers.recommended_dosage ?? '').toLowerCase();
      const trialDose = String(answers.clinical_trial_dose ?? '').toLowerCase();
      if (!isBlank(labelDose) && !isBlank(trialDose) && labelDose !== trialDose) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          `The labeled dose "${answers.recommended_dosage}" differs from the clinical trial dose "${answers.clinical_trial_dose}". The labeling dose must be supported by the pivotal trial evidence.`,
          'The recommended dosage must reflect the dosing used in clinical trials that demonstrated efficacy per 21 CFR 201.57(c)(3) and 21 CFR 314.126.',
          '21 CFR 201.57(c)(3); 21 CFR 314.126; FDA Guidance: Dosage and Administration Section of Labeling for Human Prescription Drug and Biological Products -- Content and Format',
          'Reconcile the label dose with clinical trial evidence. If the recommended dose differs from trial doses, provide pharmacokinetic or dose-response data justifying the selected dose.',
          ['recommended_dosage', 'clinical_trial_dose'],
        );
      }
      return null;
    },
  },
  {
    id: rid('indication_scope_mismatch'),
    dimension: 'consistency',
    title: 'Indication Scope Broader Than Trial Population',
    question: 'The approved indication in the labeling appears broader than the population studied in pivotal trials. How does the sponsor justify extending the indication beyond the enrolled trial population?',
    check(answers) {
      const broadIndication = answers.indication_broader_than_studied === true || answers.indication_broader_than_studied === 'yes' || answers.indication_broader_than_studied === 'Yes';
      if (broadIndication) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'The labeled indication scope extends beyond the population actually studied in clinical trials.',
          'Indications must be supported by substantial evidence from adequate and well-controlled studies per 21 CFR 314.126 and must not overstate the evidence per FDCA Section 502(a).',
          '21 CFR 314.126; FDCA Section 502(a); OPDP Enforcement Letters',
          'Narrow the indication statement to match the studied population, or provide additional data (e.g., PK bridging, subgroup analyses) supporting the broader population claim.',
          ['indication_broader_than_studied', 'indications_list', 'clinical_trial_data'],
        );
      }
      return null;
    },
  },

  /* ========== REGULATORY ALIGNMENT (5 rules) ========== */
  {
    id: rid('plr_format_not_followed'),
    dimension: 'regulatory_alignment',
    title: 'PLR Format Not Followed',
    question: 'The labeling does not follow the Physician Labeling Rule (PLR) format as required by 21 CFR 201.56-57. The submission appears to use a legacy format. When does the sponsor plan to convert to the required PLR format?',
    check(answers) {
      if (isNo(answers.plr_format_confirmed)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'The labeling does not conform to the Physician Labeling Rule (PLR) format with the required Highlights, Table of Contents, and Full Prescribing Information structure.',
          'All new drug labeling must follow the PLR format per 21 CFR 201.56(d) and 21 CFR 201.57. Drugs approved on or after June 30, 2001 were required to convert under the implementation schedule in 21 CFR 201.56(c) (71 FR 3922); labeling for drugs approved before that date may remain in the 21 CFR 201.80 format unless the sponsor converts voluntarily.',
          '21 CFR 201.56(d); 21 CFR 201.57; 71 FR 3922 (PLR Final Rule, 2006)',
          'Restructure the labeling into the three required sections: Highlights of Prescribing Information, Full Prescribing Information Table of Contents, and Full Prescribing Information with all required subsections in the prescribed order.',
          ['plr_format_confirmed', 'fpi_sections_included'],
        );
      }
      return null;
    },
  },
  {
    id: rid('pllr_missing'),
    dimension: 'regulatory_alignment',
    title: 'PLLR Requirements Not Met',
    question: 'The labeling uses the outdated pregnancy category system (A/B/C/D/X) rather than the narrative format required by the Pregnancy and Lactation Labeling Rule. When does the sponsor plan to comply with PLLR requirements?',
    check(answers) {
      const usesOldCategories = answers.pregnancy_category_legacy === true || answers.pregnancy_category_legacy === 'yes' || answers.pregnancy_category_legacy === 'Yes';
      if (usesOldCategories) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'The labeling uses legacy pregnancy categories (A/B/C/D/X) instead of the narrative subsections required by the Pregnancy and Lactation Labeling Rule (PLLR).',
          'The PLLR (effective June 30, 2015) requires removal of pregnancy categories and replacement with narrative subsections: Pregnancy, Lactation, and Females and Males of Reproductive Potential per 21 CFR 201.57(c)(9).',
          '21 CFR 201.57(c)(9); PLLR Final Rule (79 FR 72064, 2014); FDA Draft Guidance: Pregnancy, Lactation, and Reproductive Potential: Labeling for Human Prescription Drug and Biological Products -- Content and Format',
          'Replace legacy pregnancy categories with the three PLLR-mandated subsections containing narrative summaries of risk, clinical considerations, and data from human and animal studies.',
          ['pregnancy_category_legacy', 'pregnancy_risk_summary', 'lactation_risk_summary'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_medication_guide'),
    dimension: 'regulatory_alignment',
    title: 'Medication Guide Required but Not Provided',
    question: 'This product meets the criteria for requiring a Medication Guide under 21 CFR 208, yet none has been submitted. How does the sponsor plan to fulfill the patient communication requirements?',
    check(answers) {
      // 2026-10-22: `medication_guide` is not asked; the interview asks its status.
      const status = String(answers.medication_guide_status ?? '');
      if (isYes(answers.medication_guide_required) && (status === '' || status === 'not_started')) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'A Medication Guide is required for this product but has not been provided.',
          'Under 21 CFR 208.1, a Medication Guide is required when FDA determines that patient labeling could help prevent serious adverse effects, the drug has serious risks relative to benefits, or patient adherence to directions is crucial to effectiveness.',
          '21 CFR 208.1; 21 CFR 208.24; FDA Guidance: Useful Written Consumer Medication Information (2006)',
          'Develop a Medication Guide conforming to 21 CFR 208.20 formatting requirements, written in patient-friendly language at an 8th-grade reading level, covering indications, important safety information, dosing instructions, and what to avoid.',
          ['medication_guide_required', 'medication_guide_status'],
        );
      }
      return null;
    },
  },
  {
    id: rid('otc_drug_facts_missing'),
    dimension: 'regulatory_alignment',
    title: 'OTC Drug Facts Panel Missing',
    question: 'This over-the-counter product does not include the required Drug Facts labeling format. The absence of a Drug Facts panel renders the product misbranded under FDCA Section 502. When will the sponsor provide compliant OTC labeling?',
    check(answers) {
      if (answers.product_type === 'otc_drug' && DRUG_FACTS_FIELDS.every((f) => isBlank(answers[f]))) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'The product is classified as OTC but does not include a Drug Facts panel.',
          'OTC drug labeling must include a Drug Facts panel per 21 CFR 201.66, presented in a standardized format with specific sections: Active Ingredient, Purpose, Uses, Warnings, Directions, Other Information, and Inactive Ingredients.',
          '21 CFR 201.66; 64 FR 13254 (OTC Drug Facts Rule, 1999); FDCA Section 502',
          'Create a Drug Facts panel following the exact format specified in 21 CFR 201.66(c) and (d), including font size requirements (minimum 6-point type), layout specifications, and all required sections.',
          ['product_type', ...DRUG_FACTS_FIELDS],
        );
      }
      return null;
    },
  },
  {
    id: rid('device_labeling_801'),
    dimension: 'regulatory_alignment',
    title: 'Device Labeling Does Not Comply with 21 CFR 801',
    question: 'The device labeling fails to meet the general labeling requirements of 21 CFR 801. Critical elements such as intended use, adequate directions for use, and manufacturer identification are missing or incomplete. How does the sponsor plan to remedy these deficiencies?',
    check(answers) {
      /* 'medical_device' only: an IVD takes the same interview branch, but its
         labeling is governed by 21 CFR 809.10, which this rule does not cite. */
      if (answers.product_type === 'medical_device' && (isBlank(answers.device_intended_use) || isBlank(answers.ifu_operating_instructions))) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Device labeling is missing required elements under 21 CFR 801, including intended use or adequate directions for use.',
          'Device labeling must include the name and place of business of the manufacturer (21 CFR 801.1), intended use (21 CFR 801.4), and adequate directions for use (21 CFR 801.5) to avoid misbranding under FDCA Section 502(f).',
          '21 CFR 801.1; 21 CFR 801.4; 21 CFR 801.5; FDCA Section 502(f)',
          'Ensure device labeling includes: (1) manufacturer name and address, (2) intended use statement, (3) adequate directions for use including indications, dosage/method, frequency, duration, and relevant warnings.',
          ['device_intended_use', 'ifu_operating_instructions', 'product_type'],
        );
      }
      return null;
    },
  },

  /* ========== SCIENTIFIC RIGOR (5 rules) ========== */
  {
    id: rid('clinical_pharm_insufficient'),
    dimension: 'scientific_rigor',
    title: 'Clinical Pharmacology Data Insufficient',
    question: 'The Clinical Pharmacology section is incomplete. Key pharmacokinetic and pharmacodynamic parameters are not adequately described. How does the sponsor expect prescribers to make informed dose adjustment decisions without this fundamental data?',
    check(answers) {
      if (onPrescribingPath(answers) && !includesFpiSection(answers, '12')) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'The Clinical Pharmacology section is absent or incomplete in the labeling.',
          'Per 21 CFR 201.57(c)(13), the Clinical Pharmacology section must describe the mechanism of action, pharmacodynamics, and pharmacokinetics (absorption, distribution, metabolism, excretion) of the drug.',
          '21 CFR 201.57(c)(13); FDA PLR Guidance (2013); ICH E14',
          'Provide a comprehensive Clinical Pharmacology section including mechanism of action, pharmacodynamic effects (including exposure-response), and full pharmacokinetic characterization (absorption, distribution, protein binding, metabolism pathways, elimination half-life, excretion routes).',
          ['fpi_sections_included', 'mechanism_of_action', ...PK_FIELDS],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_ddi_studies'),
    dimension: 'scientific_rigor',
    title: 'Drug-Drug Interaction Studies Not Cited',
    question: 'The labeling does not reference any drug-drug interaction studies. Given that polypharmacy is common in clinical practice, how does the sponsor expect prescribers to manage co-administration risks?',
    check(answers) {
      if (onPrescribingPath(answers) && !isYes(answers.ddi_studies_conducted)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No drug-drug interaction study data is cited in the Drug Interactions section of the labeling.',
          'The Drug Interactions section per 21 CFR 201.57(c)(8) must include clinically significant interactions based on in vitro and in vivo studies, including effects on CYP enzymes, transporters, and any required dose adjustments.',
          '21 CFR 201.57(c)(8); ICH M12 Drug Interaction Studies (FDA final guidance, 2024)',
          'Include results from in vitro CYP inhibition/induction studies and transporter studies, along with any clinical DDI trials. Provide specific dose adjustment recommendations for significant interactions.',
          ['ddi_studies_conducted', 'cyp_inhibition_profile', 'transporter_interactions', 'clinically_significant_ddis'],
        );
      }
      return null;
    },
  },
  {
    id: rid('pk_data_gaps'),
    dimension: 'scientific_rigor',
    title: 'Pharmacokinetic Data Gaps',
    question: 'The labeling does not include essential pharmacokinetic parameters such as bioavailability, half-life, or volume of distribution. Without these data, the scientific basis for the dosing regimen is unclear. Can the sponsor provide a complete PK characterization?',
    check(answers) {
      if (onPrescribingPath(answers) && PK_FIELDS.every((f) => isBlank(answers[f])) && !isBlank(answers.recommended_dosage)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'Dosage and administration information is provided but pharmacokinetic data supporting the dosing regimen is absent.',
          'Pharmacokinetic data including absorption, bioavailability, half-life, volume of distribution, and clearance are expected per 21 CFR 201.57(c)(13)(i) (Clinical Pharmacology, 12.3 Pharmacokinetics) to support dosing recommendations.',
          '21 CFR 201.57(c)(13)(i); FDA Guidance: Population Pharmacokinetics (2022); ICH M12',
          'Provide complete PK parameters: Cmax, Tmax, AUC, bioavailability, half-life (t1/2), volume of distribution (Vd), clearance (CL), protein binding, and the effect of food on absorption.',
          [...PK_FIELDS, 'recommended_dosage'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_hepatic_renal_data'),
    dimension: 'scientific_rigor',
    title: 'No Hepatic or Renal Impairment Data',
    question: 'The labeling does not address dosing in patients with hepatic or renal impairment. These are among the most common clinical scenarios requiring dose adjustment. How does the sponsor expect prescribers to safely dose this product in impaired populations?',
    check(answers) {
      if (onPrescribingPath(answers) && isBlank(answers.hepatic_impairment) && isBlank(answers.renal_impairment)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'Neither hepatic nor renal impairment dosing data is included in the labeling.',
          'Under 21 CFR 201.57(c)(9), the Use in Specific Populations section may include additional subsections such as hepatic and renal impairment, and FDA recommends that labeling address dosing in hepatic and renal impairment per FDA Guidance on Pharmacokinetics in Patients with Impaired Hepatic/Renal Function.',
          '21 CFR 201.57(c)(9); FDA Guidance: Pharmacokinetics in Patients with Impaired Renal Function (2020); FDA Guidance: Pharmacokinetics in Patients with Impaired Hepatic Function (2003)',
          'Conduct hepatic impairment (Child-Pugh A/B/C) and renal impairment (mild/moderate/severe/ESRD) studies or provide population PK analyses. Include dose adjustment recommendations or state that no adjustment is needed with supporting data.',
          ['hepatic_impairment', 'renal_impairment', 'special_pk_populations', 'dose_modifications'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_exposure_response'),
    dimension: 'scientific_rigor',
    title: 'Exposure-Response Analysis Missing',
    question: 'The labeling does not present any exposure-response analysis to support the recommended dose. In the absence of such data, the scientific rationale for dose selection is inadequately supported. Can the sponsor provide exposure-efficacy and exposure-safety analyses?',
    check(answers) {
      if (isBlank(answers.exposure_response_data) && !isBlank(answers.recommended_dosage)) {
        return finding(
          this.id,
          this.dimension,
          'info',
          this.title,
          this.question,
          'No exposure-response analysis data is included to justify the recommended dosing regimen.',
          'FDA increasingly expects exposure-response analyses per 21 CFR 201.57(c)(13)(i) to support dose selection and inform dose adjustments in special populations.',
          '21 CFR 201.57(c)(13)(i); FDA Guidance: Exposure-Response Relationships (2003); FDA Guidance: Population Pharmacokinetics (2022)',
          'Include exposure-response analyses linking drug exposure (AUC, Cmin, Cmax) to efficacy endpoints and key safety events. This supports dose optimization and informs labeling for special populations.',
          ['exposure_response_data', 'recommended_dosage', 'pharmacodynamics_summary'],
        );
      }
      return null;
    },
  },

  /* ========== PRACTICAL FEASIBILITY (4 rules) ========== */
  {
    id: rid('patient_counseling_not_actionable'),
    dimension: 'practical_feasibility',
    title: 'Patient Counseling Information Not Actionable',
    question: 'The Patient Counseling Information section is vague and does not provide healthcare providers with specific, actionable guidance for patient discussions. How does the sponsor expect this section to be useful in clinical practice?',
    check(answers) {
      if (onPrescribingPath(answers) && isBlank(answers.counseling_topics)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'Patient Counseling Information section is missing or non-actionable.',
          'Per 21 CFR 201.57(c)(18), the Patient Counseling Information section must advise healthcare providers about specific topics to discuss with patients, including dosing instructions, adverse reactions to watch for, and situations requiring medical attention.',
          '21 CFR 201.57(c)(18); FDA PLR Guidance (2013)',
          'Draft a Patient Counseling Information section that includes: specific symptoms patients should report, how to take the medication correctly, foods/activities to avoid, storage instructions, and when to seek emergency care.',
          ['counseling_topics', 'patient_labeling_type'],
        );
      }
      return null;
    },
  },
  {
    id: rid('self_admin_instructions_unclear'),
    dimension: 'practical_feasibility',
    title: 'Self-Administration Instructions Unclear',
    question: 'This product is intended for self-administration, but the labeling does not provide clear, step-by-step instructions for patients. Without adequate instructions, medication errors and non-adherence are predictable consequences. Can the sponsor improve these instructions?',
    check(answers) {
      const selfAdmin = answers.self_administered === true || answers.self_administered === 'yes' || answers.self_administered === 'Yes';
      if (selfAdmin && isBlank(answers.self_administration_instructions)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'Product is self-administered but lacks clear patient instructions for self-administration.',
          'Products for self-administration require detailed Instructions for Use (IFU) per 21 CFR 201.57(c)(18) and FDA Guidance on patient labeling. These provisions do not require comprehension testing of the instructions, but it is often advisable and may be expected in some cases (for example, human factors validation for combination products under FDA\'s human factors guidance).',
          '21 CFR 201.57(c)(18); FDA Guidance: Instructions for Use -- Patient Labeling for Human Prescription Drug and Biological Products (2022)',
          'Develop step-by-step Instructions for Use (IFU) with illustrations, plain language at appropriate reading level, injection/administration site information, storage and disposal instructions, and troubleshooting for common errors.',
          ['self_administration_instructions', 'self_administered', 'recommended_dosage'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_storage_conditions'),
    dimension: 'practical_feasibility',
    title: 'Storage and Handling Conditions Missing',
    question: 'The labeling does not include storage and handling information. Patients and pharmacists need this information to maintain product stability and efficacy. How does the sponsor intend to ensure product integrity through the distribution chain?',
    check(answers) {
      if (isBlank(answers.storage_conditions)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No storage and handling conditions are specified in the labeling.',
          'Storage conditions must be included per 21 CFR 201.57(c)(17) based on stability study data. Proper storage instructions are essential for maintaining product quality through expiration.',
          '21 CFR 201.57(c)(17); ICH Q1A(R2); USP <659>',
          'Include specific storage conditions (temperature range, light protection, humidity), in-use stability after opening, reconstitution stability if applicable, and disposal instructions.',
          ['storage_conditions', 'dosage_forms_summary'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_how_supplied'),
    dimension: 'practical_feasibility',
    title: 'How Supplied / Storage Section Incomplete',
    question: 'The How Supplied section does not describe available dosage forms, strengths, or packaging configurations. Pharmacists and procurement teams cannot order the correct product without this information. Can the sponsor provide complete product descriptions?',
    check(answers) {
      if (onPrescribingPath(answers) && !includesFpiSection(answers, '16')) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'The How Supplied/Storage and Handling section is missing or incomplete.',
          'Per 21 CFR 201.57(c)(17), the labeling must describe all available dosage forms, strengths, NDC numbers, and packaging configurations to enable accurate dispensing.',
          '21 CFR 201.57(c)(17); FDA PLR Guidance (2013)',
          'List all available dosage forms and strengths with descriptions (color, shape, markings), package sizes, NDC numbers for each presentation, and storage conditions.',
          ['fpi_sections_included', 'dosage_forms_summary'],
        );
      }
      return null;
    },
  },

  /* ========== DOCUMENTATION (4 rules) ========== */
  {
    id: rid('no_spl_xml'),
    dimension: 'documentation',
    title: 'SPL/XML Format Not Submitted',
    question: 'The labeling has not been submitted in Structured Product Labeling (SPL) XML format. SPL is the required format for all labeling submissions to FDA. When will the sponsor submit labeling in the mandated electronic format?',
    check(answers) {
      if (isNo(answers.spl_submission_planned)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Submission of the labeling in SPL/XML format is not planned.',
          'All drug labeling must be submitted in Structured Product Labeling (SPL) format per FDA Guidance on SPL and eCTD requirements. SPL is required for DailyMed listing and is the official electronic labeling format.',
          'FDA Guidance: Providing Regulatory Submissions in Electronic Format -- Content of Labeling (2005); eCTD Specification; 21 CFR 314.50(l)',
          'Prepare and submit labeling in SPL XML format using the current FDA SPL implementation guide, HL7 SPL schema, and LOINC document type codes. Validate the SPL file using the FDA SPL validation tool before submission.',
          ['spl_submission_planned', 'spl_tool'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_ndc'),
    dimension: 'documentation',
    title: 'NDC Not Assigned',
    question: 'No National Drug Code (NDC) has been assigned or listed for this product. The NDC is required for drug listing, claims processing, and supply chain identification. Can the sponsor provide the NDC assignment status?',
    check(answers) {
      if (isBlank(answers.ndc_number)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No National Drug Code (NDC) is listed in the labeling or submission.',
          'An NDC is required per FDCA Section 510 and 21 CFR 207 for drug listing. The NDC is essential for the FDA Drug Listing system, pharmacy claims processing, and supply chain tracking.',
          '21 CFR 207; FDCA Section 510; FDA Drug Establishment and Product Listing System',
          'Obtain an NDC from the FDA Labeler Code assignment process and include it in the How Supplied section of the labeling. Format: labeler code-product code-package code (e.g., 12345-678-90).',
          ['ndc_number', 'fpi_sections_included'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_establishment_id'),
    dimension: 'documentation',
    title: 'FDA Establishment Identifier Missing',
    question: 'The submission does not include an FDA Establishment Identifier (FEI) for the manufacturing facility. Without this, how has the sponsor confirmed that the manufacturing site is registered and inspected by FDA?',
    check(answers) {
      if (isBlank(answers.fei_number)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No FDA Establishment Identifier (FEI) is provided for the manufacturing facility.',
          'Manufacturing establishments must be registered with FDA under FD&C Act Section 510 and 21 CFR Part 207 (21 CFR 207.17 and 207.25), and FDA assigns each registered establishment an FEI number. The FEI links the product to an inspected, registered facility.',
          '21 CFR 207.17; 21 CFR 207.25; FDCA Section 510',
          'Provide the FEI number for each manufacturing facility involved in production, testing, and packaging. Ensure all facilities are registered in the FDA Unified Registration and Listing System (FURLS).',
          ['fei_number', 'manufacturer_info'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_revision_date'),
    dimension: 'documentation',
    title: 'Labeling Revision Date Missing',
    question: 'The labeling does not include a revision date. Without version control, it is impossible to determine whether the most current labeling is in use. Can the sponsor confirm the revision history of this labeling?',
    check(answers) {
      if (isBlank(answers.labeling_revision_date)) {
        return finding(
          this.id,
          this.dimension,
          'info',
          this.title,
          this.question,
          'No revision date is present on the labeling.',
          'The labeling must include the date of the most recent revision per 21 CFR 201.57(a)(15) to ensure healthcare providers can confirm they are using the current version.',
          '21 CFR 201.57(a)(15); FDA PLR Guidance (2013)',
          'Include the month and year of the most recent labeling revision in the Highlights section and maintain a revision history log for labeling supplements.',
          ['labeling_revision_date'],
        );
      }
      return null;
    },
  },

  /* ========== RISK IDENTIFICATION (5 rules) ========== */
  {
    id: rid('rems_no_medguide'),
    dimension: 'risk_identification',
    title: 'REMS Required but No Medication Guide',
    question: 'This product has a Risk Evaluation and Mitigation Strategy (REMS) requirement, but no Medication Guide has been developed as part of the REMS. A Medication Guide is a common REMS element for patient communication. How does the sponsor intend to ensure patients receive adequate risk information?',
    check(answers) {
      // 2026-10-22: read the interview's Medication Guide answers, not the unasked `medication_guide`.
      const status = String(answers.medication_guide_status ?? '');
      const noMedGuide = isNo(answers.medication_guide_required)
        || (isYes(answers.medication_guide_required) && (status === '' || status === 'not_started'));
      if (isYes(answers.rems_required) && noMedGuide) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'A REMS is required but no Medication Guide has been submitted as part of the REMS program.',
          'Under FDCA Section 505-1 and 21 CFR 208, FDA may require a Medication Guide as an element of a REMS to ensure patients are informed of serious risks. Most REMS programs include a Medication Guide or communication plan.',
          'FDCA Section 505-1; 21 CFR 208; FDA Guidance: Format and Content of a REMS Document',
          'Develop a Medication Guide as a REMS element, or justify why alternative ETASU (Elements to Assure Safe Use) are sufficient for patient risk communication. Include the REMS assessment timeline.',
          ['rems_required', 'medication_guide_required', 'medication_guide_status'],
        );
      }
      return null;
    },
  },
  {
    id: rid('pregnancy_lactation_outdated'),
    dimension: 'risk_identification',
    title: 'Pregnancy/Lactation Subsection Uses Pre-PLLR Format',
    question: 'The pregnancy and lactation information uses an outdated format that does not meet current regulatory requirements. The old category system (A/B/C/D/X) oversimplifies complex risk assessments. How does the sponsor plan to update this critical safety information?',
    check(answers) {
      const hasPregSection = !isBlank(answers.pregnancy_risk_summary) || !isBlank(answers.lactation_risk_summary);
      const usesLegacy = answers.pregnancy_category_legacy === true || answers.pregnancy_category_legacy === 'yes' || answers.pregnancy_category_legacy === 'Yes';
      if (hasPregSection && usesLegacy) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'The pregnancy/lactation subsection uses the legacy pregnancy category system rather than the PLLR-required narrative format.',
          'The PLLR requires narrative subsections (Pregnancy, Lactation, Females and Males of Reproductive Potential) that present risk summaries, clinical considerations, and supporting data rather than oversimplified letter categories.',
          '21 CFR 201.57(c)(9); PLLR Final Rule (79 FR 72064); FDA PLLR Guidance (2014)',
          'Convert the pregnancy/lactation content to the PLLR narrative format. Include pregnancy exposure registry information (if available), risk summary based on human and animal data, clinical considerations (dosing adjustments, labor/delivery effects), and data summaries.',
          ['pregnancy_risk_summary', 'lactation_risk_summary', 'pregnancy_category_legacy'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_abuse_potential_cns'),
    dimension: 'risk_identification',
    title: 'No Abuse Potential Assessment for CNS Drug',
    question: 'This product acts on the central nervous system, yet the labeling does not include a Drug Abuse and Dependence section assessing its abuse potential. Given the current opioid and substance abuse crisis, this omission raises serious public health concerns. Can the sponsor provide an abuse liability assessment?',
    check(answers) {
      const isCns = answers.cns_active === true || answers.cns_active === 'yes' || answers.cns_active === 'Yes';
      if (isCns && isBlank(answers.abuse_dependence_section)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'The product is CNS-active but no Drug Abuse and Dependence section (Controlled Substance, Abuse, Dependence subsections) is included.',
          'Per 21 CFR 201.57(c)(10), the Drug Abuse and Dependence section must include the controlled substance schedule (if applicable), abuse potential data from clinical and nonclinical studies, and dependence/withdrawal information.',
          '21 CFR 201.57(c)(10); FDA Guidance: Assessment of Abuse Potential of Drugs (2017); Controlled Substances Act',
          'Include a complete Drug Abuse and Dependence section with: (1) Controlled Substance subsection citing DEA schedule, (2) Abuse subsection with human abuse potential study data, and (3) Dependence subsection with physical and psychological dependence characterization.',
          ['abuse_dependence_section', 'cns_active', 'fpi_sections_included'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_overdosage_info'),
    dimension: 'risk_identification',
    title: 'Overdosage Section Missing',
    question: 'The labeling does not include an Overdosage section. In the event of accidental or intentional overdose, healthcare providers need guidance on signs, symptoms, and management. How does the sponsor plan to address this gap?',
    check(answers) {
      if (onPrescribingPath(answers) && !includesFpiSection(answers, '10')) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No Overdosage section is present in the labeling.',
          'The Overdosage section is required per 21 CFR 201.57(c)(11) and must include signs and symptoms of overdosage, treatment recommendations (including antidotes if available), and dialyzability of the drug.',
          '21 CFR 201.57(c)(11); FDA PLR Guidance (2013)',
          'Include an Overdosage section describing: expected signs/symptoms based on pharmacology and clinical experience, recommended treatment (supportive care, specific antidotes), hemodialysis effectiveness, and contact information for Poison Control (1-800-222-1222).',
          ['fpi_sections_included'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_pediatric_data'),
    dimension: 'risk_identification',
    title: 'Pediatric Use Information Absent',
    question: 'The labeling does not address pediatric use, either to describe approved pediatric populations or to state that safety and effectiveness have not been established. This information is critical for preventing inappropriate off-label use in children. Can the sponsor clarify the pediatric development status?',
    check(answers) {
      if (onPrescribingPath(answers) && isBlank(answers.pediatric_use)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No Pediatric Use subsection is included in the labeling.',
          'Per 21 CFR 201.57(c)(9)(iv), the Pediatric Use subsection must either describe adequate pediatric studies or state that safety and effectiveness have not been established, along with any available pediatric pharmacokinetic data.',
          '21 CFR 201.57(c)(9)(iv); Pediatric Research Equity Act (PREA); FDA Guidance: General Clinical Pharmacology Considerations for Pediatric Studies of Drugs, Including Biological Products (2022)',
          'Include a Pediatric Use subsection that either summarizes pediatric clinical data supporting use in specific age groups, or states that safety and effectiveness have not been established. Reference any pediatric study plans or waivers/deferrals under PREA.',
          ['pediatric_use', 'pediatric_studies_conducted'],
        );
      }
      return null;
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Factory                                                           */
/* ------------------------------------------------------------------ */

export function createLabelingAuditor(): WarGameAuditor {
  return {
    category: 'labeling',
    name: 'FDA OPDP/DMEPA Labeling Reviewer',
    description:
      'Simulates an FDA OPDP (Office of Prescription Drug Promotion) and DMEPA (Division of ' +
      'Medication Error Prevention and Analysis) reviewer performing labeling review per 21 CFR 201.56-57 ' +
      'for prescription drugs, 21 CFR 201.66 for OTC products, 21 CFR 208 for Medication Guides, ' +
      'and 21 CFR 801 for device labeling. Evaluates completeness, internal consistency, regulatory ' +
      'alignment, scientific rigor, practical feasibility, documentation quality, and risk identification.',
    rules,
  };
}
