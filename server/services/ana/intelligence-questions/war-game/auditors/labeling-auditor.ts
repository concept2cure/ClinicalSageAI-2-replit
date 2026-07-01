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
    check(answers) {
      if (isBlank(answers.highlights_section)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No Highlights of Prescribing Information section was provided in the labeling submission.',
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
      const hasSerious = answers.serious_risks === true || answers.serious_risks === 'yes' || answers.serious_risks === 'Yes';
      if (hasSerious && isBlank(answers.boxed_warning)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Serious risks are documented but no boxed warning is included in the labeling.',
          'A boxed warning is required per 21 CFR 201.57(c)(1) when there is an adverse reaction so serious relative to the drug\'s benefit that it is essential to consider in deciding whether to prescribe the drug.',
          '21 CFR 201.57(c)(1); 21 CFR 201.80(e)',
          'Evaluate whether the identified serious risks meet the threshold for a boxed warning. If so, draft the warning using the format prescribed by 21 CFR 201.57(c)(1) and include it in both Highlights and Full Prescribing Information.',
          ['boxed_warning', 'serious_risks', 'warnings_precautions'],
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
      if (isBlank(answers.contraindications)) {
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
          ['contraindications', 'warnings_precautions'],
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
      if (isBlank(answers.adverse_reactions)) {
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
          ['adverse_reactions', 'clinical_trial_data'],
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
      if (isBlank(answers.dosage_administration)) {
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
          ['dosage_administration', 'route_of_administration', 'dosage_forms'],
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
      const hasEfficacyInLabel = !isBlank(answers.clinical_studies_section);
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
          ['clinical_trial_data', 'clinical_studies_section', 'indications_usage'],
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
          ['off_label_claims', 'indications_usage', 'clinical_studies_section'],
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
      const labelDose = String(answers.labeled_dose ?? '').toLowerCase();
      const trialDose = String(answers.clinical_trial_dose ?? '').toLowerCase();
      if (!isBlank(labelDose) && !isBlank(trialDose) && labelDose !== trialDose) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          `The labeled dose "${answers.labeled_dose}" differs from the clinical trial dose "${answers.clinical_trial_dose}". The labeling dose must be supported by the pivotal trial evidence.`,
          'The recommended dosage must reflect the dosing used in clinical trials that demonstrated efficacy per 21 CFR 201.57(c)(3) and 21 CFR 314.126.',
          '21 CFR 201.57(c)(3); 21 CFR 314.126; FDA Guidance: Dosage and Administration Section (2018)',
          'Reconcile the label dose with clinical trial evidence. If the recommended dose differs from trial doses, provide pharmacokinetic or dose-response data justifying the selected dose.',
          ['labeled_dose', 'clinical_trial_dose', 'dosage_administration'],
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
          ['indication_broader_than_studied', 'indications_usage', 'clinical_trial_data'],
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
      const plrCompliant = answers.plr_format_compliant;
      if (plrCompliant === false || plrCompliant === 'no' || plrCompliant === 'No') {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'The labeling does not conform to the Physician Labeling Rule (PLR) format with the required Highlights, Table of Contents, and Full Prescribing Information structure.',
          'All new drug labeling must follow the PLR format per 21 CFR 201.56(d) and 21 CFR 201.57. Previously approved drugs must convert per the implementation timeline in 71 FR 3922.',
          '21 CFR 201.56(d); 21 CFR 201.57; 71 FR 3922 (PLR Final Rule, 2006)',
          'Restructure the labeling into the three required sections: Highlights of Prescribing Information, Full Prescribing Information Table of Contents, and Full Prescribing Information with all required subsections in the prescribed order.',
          ['plr_format_compliant', 'highlights_section'],
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
          '21 CFR 201.57(c)(9); PLLR Final Rule (79 FR 72064, 2014); FDA Guidance: Labeling for Human Prescription Drug and Biological Products -- Content and Format of the Pregnancy and Lactation Subsections',
          'Replace legacy pregnancy categories with the three PLLR-mandated subsections containing narrative summaries of risk, clinical considerations, and data from human and animal studies.',
          ['pregnancy_category_legacy', 'pregnancy_lactation_section'],
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
      const medGuideRequired = answers.medication_guide_required === true || answers.medication_guide_required === 'yes' || answers.medication_guide_required === 'Yes';
      if (medGuideRequired && isBlank(answers.medication_guide)) {
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
          ['medication_guide_required', 'medication_guide', 'serious_risks'],
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
      const isOtc = answers.product_type === 'otc' || answers.product_type === 'OTC' || answers.is_otc === true || answers.is_otc === 'yes';
      if (isOtc && isBlank(answers.drug_facts_panel)) {
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
          ['drug_facts_panel', 'product_type', 'is_otc'],
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
      const isDevice = answers.product_type === 'device' || answers.product_type === 'Device' || answers.is_device === true || answers.is_device === 'yes';
      if (isDevice && (isBlank(answers.device_intended_use) || isBlank(answers.device_directions_for_use))) {
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
          ['device_intended_use', 'device_directions_for_use', 'product_type', 'manufacturer_info'],
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
      if (isBlank(answers.clinical_pharmacology_section)) {
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
          ['clinical_pharmacology_section', 'pk_data', 'mechanism_of_action'],
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
      if (isBlank(answers.drug_interaction_studies)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No drug-drug interaction study data is cited in the Drug Interactions section of the labeling.',
          'The Drug Interactions section per 21 CFR 201.57(c)(8) must include clinically significant interactions based on in vitro and in vivo studies, including effects on CYP enzymes, transporters, and any required dose adjustments.',
          '21 CFR 201.57(c)(8); FDA Guidance: In Vitro Drug Interaction Studies (2020); FDA Guidance: Clinical Drug Interaction Studies (2020)',
          'Include results from in vitro CYP inhibition/induction studies and transporter studies, along with any clinical DDI trials. Provide specific dose adjustment recommendations for significant interactions.',
          ['drug_interaction_studies', 'drug_interactions_section', 'cyp_metabolism'],
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
      if (isBlank(answers.pk_data) && !isBlank(answers.dosage_administration)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'Dosage and administration information is provided but pharmacokinetic data supporting the dosing regimen is absent.',
          'Pharmacokinetic data including absorption, bioavailability, half-life, volume of distribution, and clearance are expected per 21 CFR 201.57(c)(13)(ii) to support dosing recommendations.',
          '21 CFR 201.57(c)(13)(ii); FDA Guidance: Population Pharmacokinetics (2022); ICH M12',
          'Provide complete PK parameters: Cmax, Tmax, AUC, bioavailability, half-life (t1/2), volume of distribution (Vd), clearance (CL), protein binding, and the effect of food on absorption.',
          ['pk_data', 'dosage_administration', 'clinical_pharmacology_section'],
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
      if (isBlank(answers.hepatic_impairment_data) && isBlank(answers.renal_impairment_data)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'Neither hepatic nor renal impairment dosing data is included in the labeling.',
          'Per 21 CFR 201.57(c)(6), the Use in Specific Populations section must address dosing in hepatic and renal impairment per FDA Guidance on Pharmacokinetics in Patients with Impaired Hepatic/Renal Function.',
          '21 CFR 201.57(c)(6); FDA Guidance: Pharmacokinetics in Patients with Impaired Renal Function (2020); FDA Guidance: Pharmacokinetics in Patients with Impaired Hepatic Function (2003)',
          'Conduct hepatic impairment (Child-Pugh A/B/C) and renal impairment (mild/moderate/severe/ESRD) studies or provide population PK analyses. Include dose adjustment recommendations or state that no adjustment is needed with supporting data.',
          ['hepatic_impairment_data', 'renal_impairment_data', 'dosage_administration', 'pk_data'],
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
      if (isBlank(answers.exposure_response_data) && !isBlank(answers.dosage_administration)) {
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
          ['exposure_response_data', 'dosage_administration', 'pk_data'],
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
      if (isBlank(answers.patient_counseling_info)) {
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
          ['patient_counseling_info', 'adverse_reactions', 'dosage_administration'],
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
          'Products for self-administration require detailed Instructions for Use (IFU) per 21 CFR 201.57(c)(18) and FDA Guidance on patient labeling. The instructions must be tested for comprehension.',
          '21 CFR 201.57(c)(18); FDA Guidance: Instructions for Use -- Patient Labeling for Human Prescription Drug and Biological Products (2022)',
          'Develop step-by-step Instructions for Use (IFU) with illustrations, plain language at appropriate reading level, injection/administration site information, storage and disposal instructions, and troubleshooting for common errors.',
          ['self_administration_instructions', 'self_administered', 'dosage_administration'],
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
          'Storage conditions must be included per 21 CFR 201.57(c)(16) based on stability study data. Proper storage instructions are essential for maintaining product quality through expiration.',
          '21 CFR 201.57(c)(16); ICH Q1A(R2); USP <659>',
          'Include specific storage conditions (temperature range, light protection, humidity), in-use stability after opening, reconstitution stability if applicable, and disposal instructions.',
          ['storage_conditions', 'dosage_forms'],
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
      if (isBlank(answers.how_supplied)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'The How Supplied/Storage and Handling section is missing or incomplete.',
          'Per 21 CFR 201.57(c)(16), the labeling must describe all available dosage forms, strengths, NDC numbers, and packaging configurations to enable accurate dispensing.',
          '21 CFR 201.57(c)(16); FDA PLR Guidance (2013)',
          'List all available dosage forms and strengths with descriptions (color, shape, markings), package sizes, NDC numbers for each presentation, and storage conditions.',
          ['how_supplied', 'dosage_forms', 'ndc_number', 'storage_conditions'],
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
      const splSubmitted = answers.spl_xml_submitted;
      if (splSubmitted === false || splSubmitted === 'no' || splSubmitted === 'No') {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Labeling has not been submitted in SPL/XML format.',
          'All drug labeling must be submitted in Structured Product Labeling (SPL) format per FDA Guidance on SPL and eCTD requirements. SPL is required for DailyMed listing and is the official electronic labeling format.',
          'FDA Guidance: Providing Regulatory Submissions in Electronic Format -- Content of Labeling (2005); eCTD Specification; 21 CFR 314.50(l)',
          'Prepare and submit labeling in SPL XML format using the current FDA SPL implementation guide, HL7 SPL schema, and LOINC document type codes. Validate the SPL file using the FDA SPL validation tool before submission.',
          ['spl_xml_submitted', 'product_name'],
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
          ['ndc_number', 'how_supplied'],
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
          'Manufacturing establishments must be registered with FDA per 21 CFR 207.20 and must have an FEI number. The FEI links the product to an inspected, registered facility.',
          '21 CFR 207.20; 21 CFR 207.25; FDCA Section 510',
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
      const remsRequired = answers.rems_required === true || answers.rems_required === 'yes' || answers.rems_required === 'Yes';
      if (remsRequired && isBlank(answers.medication_guide)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'A REMS is required but no Medication Guide has been submitted as part of the REMS program.',
          'Under FDCA Section 505-1 and 21 CFR 208, FDA may require a Medication Guide as an element of a REMS to ensure patients are informed of serious risks. Most REMS programs include a Medication Guide or communication plan.',
          'FDCA Section 505-1; 21 CFR 208; FDA Guidance: Format and Content of Proposed REMS (2009)',
          'Develop a Medication Guide as a REMS element, or justify why alternative ETASU (Elements to Assure Safe Use) are sufficient for patient risk communication. Include the REMS assessment timeline.',
          ['rems_required', 'medication_guide', 'serious_risks'],
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
      const hasPregSection = !isBlank(answers.pregnancy_lactation_section);
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
          ['pregnancy_lactation_section', 'pregnancy_category_legacy'],
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
          'Per 21 CFR 201.57(c)(14), the Drug Abuse and Dependence section must include the controlled substance schedule (if applicable), abuse potential data from clinical and nonclinical studies, and dependence/withdrawal information.',
          '21 CFR 201.57(c)(14); FDA Guidance: Assessment of Abuse Potential of Drugs (2017); Controlled Substances Act',
          'Include a complete Drug Abuse and Dependence section with: (1) Controlled Substance subsection citing DEA schedule, (2) Abuse subsection with human abuse potential study data, and (3) Dependence subsection with physical and psychological dependence characterization.',
          ['abuse_dependence_section', 'cns_active', 'controlled_substance_schedule'],
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
      if (isBlank(answers.overdosage_section)) {
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
          ['overdosage_section', 'clinical_pharmacology_section'],
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
      if (isBlank(answers.pediatric_use_section)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No Pediatric Use subsection is included in the labeling.',
          'Per 21 CFR 201.57(c)(9)(iv), the Pediatric Use subsection must either describe adequate pediatric studies or state that safety and effectiveness have not been established, along with any available pediatric pharmacokinetic data.',
          '21 CFR 201.57(c)(9)(iv); Pediatric Research Equity Act (PREA); FDA Guidance: General Clinical Pharmacology Considerations for Pediatric Studies (2014)',
          'Include a Pediatric Use subsection that either summarizes pediatric clinical data supporting use in specific age groups, or states that safety and effectiveness have not been established. Reference any pediatric study plans or waivers/deferrals under PREA.',
          ['pediatric_use_section', 'target_population'],
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
      'Medical and Education Policy) reviewer performing labeling review per 21 CFR 201.56-57 ' +
      'for prescription drugs, 21 CFR 201.66 for OTC products, 21 CFR 208 for Medication Guides, ' +
      'and 21 CFR 801 for device labeling. Evaluates completeness, internal consistency, regulatory ' +
      'alignment, scientific rigor, practical feasibility, documentation quality, and risk identification.',
    rules,
  };
}
