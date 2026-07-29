/**
 * NDA Auditor -- simulates FDA reviewer scrutiny of a New Drug Application.
 *
 * Generates adversarial questions across seven audit dimensions, referencing
 * actual FDA regulations (21 CFR 314), ICH guidelines (M4 CTD, E9, M1),
 * PDUFA VII, and FDA Guidance documents.
 *
 * @module server/services/ana/intelligence-questions/war-game/auditors/nda-auditor
 */

import type { WarGameAuditor, AuditRule, WarGameFinding, AuditDimension } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const rid = (suffix: string) => 'nda_' + suffix;

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
    id: rid('missing_cover_letter'),
    dimension: 'completeness',
    title: 'Cover Letter Absent',
    question: 'The submitted NDA dossier does not include a cover letter identifying the application type, proposed indication, and applicant contact information. Can the applicant explain why this foundational regulatory correspondence was omitted from Module 1?',
    check(answers) {
      if (isBlank(answers.cover_letter)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No cover letter was included in the NDA submission.',
          'A cover letter is required under 21 CFR 314.50(a) as part of the application form and must identify the drug, proposed indication, and application type.',
          '21 CFR 314.50(a); FDA Guidance: Formatting, Assembling, and Submitting NDA/BLA Applications (2022)',
          'Include a cover letter in Module 1.0 that clearly identifies the applicant, drug product, proposed indication(s), application type (505(b)(1) or 505(b)(2)), and references any pre-submission meetings with the Agency.',
          ['cover_letter', 'application_type'],
        );
      }
      return null;
    },
  },
  {
    id: rid('missing_ctd_modules'),
    dimension: 'completeness',
    title: 'CTD Modules Incomplete',
    question: 'The NDA submission appears to lack one or more of the required CTD modules (M1-M5). Under 21 CFR 314.50, all five modules must be present for filing. Which modules are missing and when does the applicant intend to provide them?',
    check(answers) {
      const modules = answers.ctd_modules;
      if (isBlank(modules)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'CTD module inventory is not specified; one or more required modules (M1 through M5) may be absent from the submission.',
          'A complete NDA must include all five CTD modules per 21 CFR 314.50 and ICH M4: Module 1 (Regional Administrative), Module 2 (Summaries), Module 3 (Quality/CMC), Module 4 (Nonclinical), and Module 5 (Clinical).',
          '21 CFR 314.50; ICH M4 (Organization of the CTD); FDA Guidance: eCTD Technical Specification (2023)',
          'Conduct a completeness check against the eCTD Module Checklist and ensure all five modules are populated with the required documents before submission.',
          ['ctd_modules', 'ectd_format'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_iss'),
    dimension: 'completeness',
    title: 'Integrated Summary of Safety (ISS) Missing',
    question: 'Can the applicant explain why the submitted dossier lacks a comprehensive Integrated Summary of Safety? The Agency considers this a critical deficiency under 21 CFR 314.50(d)(5)(vi)(a), as the ISS is essential for the benefit-risk assessment.',
    check(answers) {
      if (isBlank(answers.integrated_summary_safety)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No Integrated Summary of Safety (ISS) was identified in the submission.',
          'The ISS is required under 21 CFR 314.50(d)(5)(vi)(a) to present an integrated analysis of safety data across all clinical studies in the development program.',
          '21 CFR 314.50(d)(5)(vi)(a); ICH E1 (Extent of Population Exposure); ICH M4E(R2) Section 2.7.4',
          'Prepare a comprehensive ISS including exposure data, adverse event analyses by system organ class, deaths, serious adverse events, discontinuations due to AEs, laboratory findings, vital signs, ECG data, and special populations analysis.',
          ['integrated_summary_safety', 'safety_database_size'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_ise'),
    dimension: 'completeness',
    title: 'Integrated Summary of Effectiveness (ISE) Missing',
    question: 'The NDA does not appear to contain an Integrated Summary of Effectiveness. Without this document, how does the applicant expect the Agency to assess whether substantial evidence of effectiveness exists under 21 CFR 314.126?',
    check(answers) {
      if (isBlank(answers.integrated_summary_effectiveness)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No Integrated Summary of Effectiveness (ISE) was found in the submission.',
          'The ISE is required under 21 CFR 314.50(d)(5)(vi)(b) to integrate efficacy results across studies and demonstrate substantial evidence of effectiveness.',
          '21 CFR 314.50(d)(5)(vi)(b); 21 CFR 314.126; ICH M4E(R2) Section 2.7.3',
          'Prepare an ISE that integrates efficacy data across all adequate and well-controlled studies, including individual study results, pooled analyses, consistency of effect across subgroups, and dose-response relationships.',
          ['integrated_summary_effectiveness', 'pivotal_study_count'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_proposed_label'),
    dimension: 'completeness',
    title: 'Proposed Labeling Not Submitted',
    question: 'The NDA does not include proposed prescribing information (labeling). Under 21 CFR 314.50(c)(2)(i), draft labeling is a mandatory component. How does the applicant intend for the Agency to evaluate the proposed indication, dosing, and safety information without it?',
    check(answers) {
      if (isBlank(answers.proposed_labeling)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No proposed labeling (prescribing information) was included in the NDA submission.',
          'Draft labeling conforming to 21 CFR 201.56-57 (Physician Labeling Rule format) must be submitted as part of the NDA per 21 CFR 314.50(c)(2)(i).',
          '21 CFR 314.50(c)(2)(i); 21 CFR 201.56; 21 CFR 201.57; FDA Guidance: Labeling for Human Prescription Drugs (2013)',
          'Submit proposed labeling in PLR (Physician Labeling Rule) format including Highlights, Full Prescribing Information with all required sections, and patient labeling (Medication Guide and/or Patient Package Insert as applicable).',
          ['proposed_labeling', 'indication_statement'],
        );
      }
      return null;
    },
  },

  /* ========== CONSISTENCY (4 rules) ========== */
  {
    id: rid('dose_cmc_clinical_mismatch'),
    dimension: 'consistency',
    title: 'Dosing Inconsistency between CMC and Clinical Data',
    question: 'The dosage strength described in the CMC section (Module 3) does not appear to match the doses studied in the pivotal clinical trials (Module 5). Can the applicant reconcile this discrepancy and confirm that the to-be-marketed formulation is the same as that used in the pivotal studies?',
    check(answers) {
      const cmcDose = String(answers.cmc_dosage_strength ?? '').toLowerCase().trim();
      const clinicalDose = String(answers.clinical_dose ?? '').toLowerCase().trim();
      if (
        !isBlank(cmcDose) &&
        !isBlank(clinicalDose) &&
        cmcDose !== clinicalDose
      ) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          `CMC dosage strength "${answers.cmc_dosage_strength}" does not match the clinical dose "${answers.clinical_dose}" used in pivotal trials. This raises questions about bioequivalence of the to-be-marketed formulation.`,
          'The marketed drug product must be consistent with the formulation used in pivotal studies, or a bridging bioequivalence study must be provided per 21 CFR 314.50(d)(1) and ICH M4Q.',
          '21 CFR 314.50(d)(1); ICH M4Q(R1) Section 3.2.P; FDA Guidance: SUPAC (Scale-Up and Post-Approval Changes)',
          'Ensure the CMC dosage strength matches clinical trial doses, or provide a bridging bioavailability/bioequivalence study demonstrating comparability of the to-be-marketed formulation to the clinical trial formulation.',
          ['cmc_dosage_strength', 'clinical_dose', 'bioequivalence_study'],
        );
      }
      return null;
    },
  },
  {
    id: rid('indication_label_clinical_mismatch'),
    dimension: 'consistency',
    title: 'Indication Mismatch between Label and Clinical Data',
    question: 'The proposed indication in the draft labeling does not appear consistent with the patient population actually studied in the pivotal trials. Can the applicant clarify whether the claimed indication is supported by the enrolled population and primary endpoint results?',
    check(answers) {
      const labelIndication = String(answers.label_indication ?? '').toLowerCase().trim();
      const studiedIndication = String(answers.studied_indication ?? '').toLowerCase().trim();
      if (
        !isBlank(labelIndication) &&
        !isBlank(studiedIndication) &&
        labelIndication !== studiedIndication
      ) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          `Label indication "${answers.label_indication}" differs from studied indication "${answers.studied_indication}". The proposed labeling claim may exceed the evidence generated.`,
          'The proposed indication must be supported by substantial evidence from adequate and well-controlled studies per 21 CFR 314.126.',
          '21 CFR 314.126; 21 CFR 201.57(c)(2); FDA Guidance: Indication-Specific Labeling (2018)',
          'Align the proposed label indication with the clinical evidence, or provide additional analyses demonstrating that the broader claim is supported by the study data, including relevant subgroup analyses.',
          ['label_indication', 'studied_indication', 'proposed_labeling'],
        );
      }
      return null;
    },
  },
  {
    id: rid('population_discrepancy'),
    dimension: 'consistency',
    title: 'Population Discrepancy across Submission Components',
    question: 'The target population described in the nonclinical pharmacology section differs from the population enrolled in clinical trials. How does the applicant reconcile the animal model selection with the clinical population studied?',
    check(answers) {
      const nonclinicalPop = String(answers.nonclinical_population ?? '').toLowerCase().trim();
      const clinicalPop = String(answers.clinical_population ?? '').toLowerCase().trim();
      if (
        !isBlank(nonclinicalPop) &&
        !isBlank(clinicalPop) &&
        nonclinicalPop !== clinicalPop
      ) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          `Nonclinical population/model "${answers.nonclinical_population}" differs from clinical population "${answers.clinical_population}". This raises translational relevance concerns.`,
          'Nonclinical studies should be relevant to the intended clinical population per ICH M3(R2) Section 1 and ICH S6(R1) for biotechnology-derived products.',
          'ICH M3(R2) Section 1; ICH M4S(R2) Section 2.6; 21 CFR 314.50(d)(2)',
          'Provide a bridging rationale explaining how nonclinical models are relevant to the clinical target population and address any translational gaps in the Module 2.4 nonclinical overview.',
          ['nonclinical_population', 'clinical_population'],
        );
      }
      return null;
    },
  },
  {
    id: rid('safety_database_vs_exposure'),
    dimension: 'consistency',
    title: 'Safety Database Size Inconsistent with Claimed Exposure',
    question: 'The applicant claims a specific number of subjects in the safety database, but the total exposure data presented in the ISS does not align with this figure. Can the applicant provide a reconciliation of the safety population across all studies?',
    check(answers) {
      const dbSize = numericVal(answers.safety_database_size);
      const exposureCount = numericVal(answers.total_exposure_subjects);
      if (
        dbSize !== null &&
        exposureCount !== null &&
        Math.abs(dbSize - exposureCount) / Math.max(dbSize, exposureCount) > 0.15
      ) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          `Safety database reports ${dbSize} subjects but total exposure data references ${exposureCount} subjects -- a discrepancy of more than 15%.`,
          'The safety database must be consistent across all submission components per ICH E1 and 21 CFR 314.50(d)(5)(vi)(a). Discrepancies undermine the reliability of the safety assessment.',
          'ICH E1; 21 CFR 314.50(d)(5)(vi)(a); ICH M4E(R2) Section 2.7.4',
          'Reconcile the safety database across all submission sections. Provide a clear accounting of how subjects were included or excluded from each safety analysis set.',
          ['safety_database_size', 'total_exposure_subjects', 'integrated_summary_safety'],
        );
      }
      return null;
    },
  },

  /* ========== REGULATORY ALIGNMENT (5 rules) ========== */
  {
    id: rid('wrong_application_type'),
    dimension: 'regulatory_alignment',
    title: 'Application Type Not Justified',
    question: 'The applicant has filed under 505(b)(2) but has not identified a listed drug or provided the required right-of-reference or suitability petition. Can the applicant confirm the regulatory basis for this application type and provide the necessary supporting documentation?',
    check(answers) {
      const appType = String(answers.application_type ?? '').toLowerCase();
      if (appType.includes('505(b)(2)') || appType.includes('505b2')) {
        if (isBlank(answers.listed_drug_reference)) {
          return finding(
            this.id,
            this.dimension,
            'critical',
            this.title,
            this.question,
            `Application type is "${answers.application_type}" but no listed drug or right-of-reference is identified.`,
            'A 505(b)(2) application must identify the listed drug(s) relied upon and include a right-of-reference letter or suitability petition per 21 CFR 314.54.',
            '21 CFR 314.54; FDA Guidance: Applications Covered by Section 505(b)(2) (2023); 21 CFR 314.50(i)',
            'Identify the listed drug(s) relied upon for safety and/or efficacy data, submit a right-of-reference letter if relying on proprietary data, or reclassify as a 505(b)(1) full NDA with complete nonclinical and clinical data packages.',
            ['application_type', 'listed_drug_reference', 'suitability_petition'],
          );
        }
      }
      return null;
    },
  },
  {
    id: rid('no_rtf_shield'),
    dimension: 'regulatory_alignment',
    title: 'No Refuse-to-File (RTF) Safeguards',
    question: 'Has the applicant conducted a pre-submission completeness assessment against the FDA Refuse-to-File checklist? The Agency notes that significant omissions may result in an RTF action within 60 days of submission, which would substantially delay the review timeline.',
    check(answers) {
      if (isBlank(answers.rtf_assessment)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No pre-submission refuse-to-file (RTF) assessment was performed or documented.',
          'FDA may issue an RTF determination within 60 days under 21 CFR 314.101(d) if the application is insufficiently complete for substantive review. A pre-submission RTF check is strongly recommended.',
          '21 CFR 314.101(d); FDA Guidance: Refuse to File (2017); MAPP 5000.3',
          'Conduct a formal pre-submission completeness assessment using the FDA RTF checklist, document the results, and address any identified gaps before filing.',
          ['rtf_assessment', 'ctd_modules'],
        );
      }
      return null;
    },
  },
  {
    id: rid('missing_patent_certifications'),
    dimension: 'regulatory_alignment',
    title: 'Patent Certifications Not Provided',
    question: 'The NDA does not include the required patent certifications under 21 CFR 314.50(i). Without these certifications, the Agency cannot assess potential patent-related review issues. Can the applicant provide the required paragraph I-IV certifications for all listed patents?',
    check(answers) {
      if (isBlank(answers.patent_certifications)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Required patent certifications are absent from the submission.',
          'Patent certifications (Paragraph I-IV) are required under 21 CFR 314.50(i) for any drug product with listed patents in the Orange Book.',
          '21 CFR 314.50(i); 21 CFR 314.53; FD&C Act Section 505(b)(2)(A) and 505(j)(2)(A)',
          'Submit the required patent certifications (Paragraph I, II, III, or IV) for each patent listed in the Orange Book for the reference listed drug. If Paragraph IV certifications are made, prepare for potential patent litigation and 30-month stay provisions.',
          ['patent_certifications', 'listed_drug_reference', 'application_type'],
        );
      }
      return null;
    },
  },
  {
    id: rid('rems_not_addressed'),
    dimension: 'regulatory_alignment',
    title: 'REMS Not Addressed',
    question: 'The safety profile of this drug suggests the need for a Risk Evaluation and Mitigation Strategy (REMS), yet no REMS proposal or justification for its absence has been provided. How does the applicant intend to ensure that the benefits of the drug outweigh its risks without additional risk mitigation measures?',
    check(answers) {
      if (isBlank(answers.rems_proposal) && isBlank(answers.rems_justification)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'Neither a REMS proposal nor a justification for the absence of REMS was included in the submission.',
          'Under FD&C Act Section 505-1, FDA may require a REMS if necessary to ensure the benefits outweigh the risks. The applicant should proactively address whether REMS is warranted.',
          'FD&C Act Section 505-1; 21 CFR 314.50(d)(5)(viii); FDA Guidance: REMS (2020)',
          'Either propose a REMS (which may include a Medication Guide, Communication Plan, and/or Elements to Assure Safe Use) or provide a detailed justification explaining why a REMS is not necessary based on the safety profile.',
          ['rems_proposal', 'rems_justification', 'safety_concerns'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_pdufa_user_fee'),
    dimension: 'regulatory_alignment',
    title: 'PDUFA User Fee Not Confirmed',
    question: 'The submission does not confirm that the required PDUFA user fee has been submitted. Under PDUFA VII, the application will not be received for review until the user fee is paid. Can the applicant confirm the fee payment status?',
    check(answers) {
      if (isBlank(answers.pdufa_user_fee_paid)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'PDUFA user fee payment status is not confirmed in the submission.',
          'Under PDUFA VII (FD&C Act Section 736), a prescription drug user fee must accompany the NDA submission. The application will not be received for filing without confirmed fee payment.',
          'FD&C Act Section 736; PDUFA VII Commitment Letter; 21 CFR 314.50(a)',
          'Confirm PDUFA user fee payment and include the payment confirmation or fee waiver/reduction request in Module 1.2 of the eCTD submission.',
          ['pdufa_user_fee_paid', 'fee_waiver_request'],
        );
      }
      return null;
    },
  },

  /* ========== SCIENTIFIC RIGOR (5 rules) ========== */
  {
    id: rid('inadequate_pivotal_design'),
    dimension: 'scientific_rigor',
    title: 'Inadequate Pivotal Trial Design',
    question: 'The pivotal trial(s) do not appear to meet the standard of adequate and well-controlled studies under 21 CFR 314.126. Can the applicant address specifically how the study design controls for bias, ensures adequate comparator selection, and permits valid inference of treatment effect?',
    check(answers) {
      const pivotalDesign = String(answers.pivotal_trial_design ?? '').toLowerCase();
      if (
        !isBlank(pivotalDesign) &&
        (pivotalDesign.includes('single-arm') || pivotalDesign.includes('uncontrolled') || pivotalDesign.includes('open-label observational'))
      ) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          `Pivotal trial design "${answers.pivotal_trial_design}" may not meet the regulatory standard for adequate and well-controlled studies.`,
          'Substantial evidence of effectiveness requires adequate and well-controlled investigations per 21 CFR 314.126. Single-arm or uncontrolled studies are generally insufficient unless the disease is serious, the endpoint is objective, and the natural history is well-characterized.',
          '21 CFR 314.126; FD&C Act Section 505(d); ICH E9(R1); FDA Guidance: Demonstrating Substantial Evidence of Effectiveness (2019)',
          'Consider a randomized, controlled trial design (preferably double-blind) for pivotal evidence. If a single-arm design is proposed, provide robust justification including historical control data and an objective, well-validated endpoint.',
          ['pivotal_trial_design', 'pivotal_study_count', 'primary_endpoint'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_prespecified_primary_analysis'),
    dimension: 'scientific_rigor',
    title: 'No Pre-Specified Primary Analysis',
    question: 'The NDA submission does not document that the primary analysis was pre-specified in the Statistical Analysis Plan (SAP) before database lock. Post-hoc selection of analytical methods represents a critical source of bias. Can the applicant provide the finalized SAP with its date of completion?',
    check(answers) {
      if (isBlank(answers.prespecified_sap)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No pre-specified Statistical Analysis Plan (SAP) was referenced or provided.',
          'The primary analysis must be pre-specified per ICH E9 Section 5.1 and ICH E9(R1) to avoid bias from post-hoc analytical selection.',
          'ICH E9 Section 5.1; ICH E9(R1) Addendum; 21 CFR 314.126(b)(2)(v); FDA Guidance: Statistical Principles for Clinical Trials (1998)',
          'Provide the finalized SAP dated before database lock, clearly specifying the primary analysis method, handling of missing data (estimand framework per ICH E9(R1)), sensitivity analyses, and multiplicity adjustments.',
          ['prespecified_sap', 'statistical_method', 'primary_endpoint'],
        );
      }
      return null;
    },
  },
  {
    id: rid('multiplicity_not_controlled'),
    dimension: 'scientific_rigor',
    title: 'Multiplicity Not Controlled',
    question: 'The NDA presents multiple primary or key secondary endpoints without an apparent multiplicity adjustment strategy. How does the applicant ensure that the overall Type I error rate is controlled at the intended significance level, given the multiple comparisons performed?',
    check(answers) {
      const multipleEndpoints = answers.multiple_primary_endpoints;
      if (
        (multipleEndpoints === true || multipleEndpoints === 'yes' || multipleEndpoints === 'Yes') &&
        isBlank(answers.multiplicity_adjustment)
      ) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Multiple primary/key secondary endpoints are declared but no multiplicity adjustment strategy is described.',
          'When multiple primary endpoints or a gatekeeping strategy for key secondary endpoints is used, a pre-specified multiplicity adjustment is required per ICH E9 Section 5.7 and FDA Guidance on Multiple Endpoints.',
          'ICH E9 Section 5.7; ICH E9(R1); FDA Guidance: Multiple Endpoints in Clinical Trials (2022)',
          'Implement a pre-specified multiplicity adjustment strategy such as hierarchical (fixed-sequence) testing, Hochberg, Holm, or graphical testing procedures. Document the strategy in the SAP.',
          ['multiple_primary_endpoints', 'multiplicity_adjustment', 'prespecified_sap'],
        );
      }
      return null;
    },
  },
  {
    id: rid('missing_subgroup_analyses'),
    dimension: 'scientific_rigor',
    title: 'Subgroup Analyses Not Presented',
    question: 'The NDA does not present pre-specified subgroup analyses by age, sex, race, and ethnicity. Under FDA guidance on enhancing trial diversity, how does the applicant plan to demonstrate that the treatment effect is consistent across demographic subgroups?',
    check(answers) {
      if (isBlank(answers.subgroup_analyses)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No subgroup analyses by demographic or prognostic factors were presented in the NDA.',
          'FDA expects pre-specified subgroup analyses by sex, age, race, and ethnicity per 21 CFR 314.50(d)(5)(v) and the FDA Action Plan for Enhancing the Diversity of Clinical Trials.',
          '21 CFR 314.50(d)(5)(v); FDA Guidance: Enhancing the Diversity of Clinical Trial Populations (2020); ICH E9 Section 5.7',
          'Present subgroup analyses for the primary endpoint by age, sex, race/ethnicity, geographic region, disease severity, and other pre-specified prognostic factors using forest plots. Address any inconsistencies in treatment effect across subgroups.',
          ['subgroup_analyses', 'demographic_data', 'primary_endpoint'],
        );
      }
      return null;
    },
  },
  {
    id: rid('insufficient_pivotal_count'),
    dimension: 'scientific_rigor',
    title: 'Single Pivotal Study May Be Insufficient',
    question: 'The NDA relies on a single pivotal trial. Under the substantial evidence standard, FDA generally requires two adequate and well-controlled studies. Can the applicant justify reliance on a single study, and does it meet the criteria for a compelling single-study approval?',
    check(answers) {
      const pivotalCount = numericVal(answers.pivotal_study_count);
      if (pivotalCount !== null && pivotalCount < 2) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          `The NDA relies on ${pivotalCount} pivotal trial(s). Under the substantial evidence standard, FDA generally requires two adequate and well-controlled studies. Can the applicant justify reliance on a single study?`,
          `Only ${pivotalCount} pivotal study/studies provided. FDA traditionally requires two adequate and well-controlled studies for approval.`,
          'Substantial evidence of effectiveness generally requires at least two adequate and well-controlled studies per FD&C Act Section 505(d), though FDA has outlined circumstances where a single study may suffice.',
          'FD&C Act Section 505(d); FDA Guidance: Providing Clinical Evidence of Effectiveness (1998); 21 CFR 314.126',
          'If relying on a single pivotal study, ensure it provides a large, multicenter trial with a highly statistically significant result (p < 0.001), internal consistency across subgroups, and clinically meaningful effect size. Alternatively, add a confirmatory study.',
          ['pivotal_study_count', 'pivotal_trial_design', 'primary_endpoint'],
        );
      }
      return null;
    },
  },

  /* ========== PRACTICAL FEASIBILITY (4 rules) ========== */
  {
    id: rid('unrealistic_approval_timeline'),
    dimension: 'practical_feasibility',
    title: 'Unrealistic Approval Timeline',
    question: 'The applicant projects an approval timeline that does not appear to account for the standard PDUFA review clock. Has the applicant accounted for the 10-month standard review or 6-month priority review timeline, including potential information requests and advisory committee meetings?',
    check(answers) {
      const timeline = numericVal(answers.projected_approval_months);
      if (timeline !== null && timeline < 6) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          `The projected approval timeline of ${timeline} months is shorter than even a Priority Review cycle (6 months). Has the applicant accounted for the standard PDUFA review timeline?`,
          `Projected approval timeline of ${timeline} months is unrealistically short.`,
          'Under PDUFA VII, the standard NDA review clock is 10 months (Standard Review) or 6 months (Priority Review) from the filing date. Accelerated programs may modify the timeline but rarely compress below 6 months.',
          'PDUFA VII Commitment Letter; FD&C Act Section 505(c); FDA MAPP 6020.3 (NDA Review Timelines)',
          'Adjust the projected timeline to at least 10 months for Standard Review or 6 months for Priority Review. Factor in potential FDA information requests (Day 74 letter), pre-approval facility inspections, and potential advisory committee meetings.',
          ['projected_approval_months', 'review_designation', 'pdufa_goal_date'],
        );
      }
      return null;
    },
  },
  {
    id: rid('manufacturing_scaleup_gap'),
    dimension: 'practical_feasibility',
    title: 'Manufacturing Scale-Up Not Demonstrated',
    question: 'The CMC section does not include data demonstrating successful scale-up from clinical trial manufacturing to commercial-scale production. How does the applicant assure the Agency that the commercial product will be consistently manufactured at the intended scale?',
    check(answers) {
      if (isBlank(answers.manufacturing_scaleup)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'Manufacturing scale-up data from clinical to commercial scale is not provided.',
          'The CMC section must demonstrate that the manufacturing process is validated at commercial scale per 21 CFR 314.50(d)(1) and ICH Q8(R2) pharmaceutical development principles.',
          '21 CFR 314.50(d)(1); ICH Q8(R2); ICH Q10; FDA Guidance: Process Validation (2011)',
          'Provide process validation data at commercial scale, including at least three consecutive production batches demonstrating process consistency, critical quality attributes within specification, and comparability to clinical trial material.',
          ['manufacturing_scaleup', 'cmc_dosage_strength', 'batch_validation'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_supply_chain_plan'),
    dimension: 'practical_feasibility',
    title: 'Commercial Supply Chain Not Addressed',
    question: 'The NDA does not describe the commercial supply chain, including API sourcing, manufacturing sites, and distribution plans. Can the applicant confirm that all manufacturing facilities have been identified and are ready for pre-approval inspection?',
    check(answers) {
      if (isBlank(answers.supply_chain_plan)) {
        return finding(
          this.id,
          this.dimension,
          'info',
          this.title,
          this.question,
          'No commercial supply chain or distribution plan is described in the submission.',
          'All manufacturing, testing, and packaging sites must be identified in the NDA per 21 CFR 314.50(d)(1) to allow pre-approval inspections under 21 CFR 314.110.',
          '21 CFR 314.50(d)(1); 21 CFR 314.110; FDA Guidance: Pre-Approval Inspections (2020)',
          'Identify all manufacturing, testing, and packaging facilities in Module 3, including API suppliers, and confirm readiness for pre-approval inspections. Include site registration numbers and current cGMP compliance status.',
          ['supply_chain_plan', 'manufacturing_sites'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_launch_quantity_projection'),
    dimension: 'practical_feasibility',
    title: 'Launch Supply Projections Absent',
    question: 'The applicant has not provided projected launch quantities or evidence of manufacturing capacity to meet anticipated demand. How does the applicant plan to avoid drug shortages immediately following approval?',
    check(answers) {
      if (isBlank(answers.launch_quantity_projection)) {
        return finding(
          this.id,
          this.dimension,
          'info',
          this.title,
          this.question,
          'No launch quantity projections or manufacturing capacity assessment is provided.',
          'While not a strict filing requirement, FDA has expressed concern about drug shortages and expects applicants to have sufficient manufacturing capacity per FD&C Act Title X.',
          'FD&C Act Title X (Drug Shortage Prevention); FDA Guidance: Drug Shortage Management (2020); 21 CFR 314.81(b)(3)(iii)',
          'Include launch supply projections and demonstrate manufacturing capacity to meet projected demand for the first 12-24 months post-approval. Address contingency plans for supply disruptions.',
          ['launch_quantity_projection', 'manufacturing_scaleup', 'supply_chain_plan'],
        );
      }
      return null;
    },
  },

  /* ========== DOCUMENTATION (4 rules) ========== */
  {
    id: rid('no_ectd_format'),
    dimension: 'documentation',
    title: 'Submission Not in eCTD Format',
    question: 'The NDA does not appear to be in electronic Common Technical Document (eCTD) format. Since May 2017, eCTD is the mandatory submission format for all NDAs. Can the applicant confirm the submission format and provide an eCTD-compliant submission?',
    check(answers) {
      const format = String(answers.ectd_format ?? '').toLowerCase();
      if (isBlank(answers.ectd_format) || format === 'no' || format === 'false' || format.includes('paper') || format.includes('nees')) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'The submission does not appear to be in mandatory eCTD format.',
          'eCTD format is mandatory for all NDA submissions as of May 5, 2017 per FDA Guidance and 21 CFR 314.50(l). Paper or non-eCTD electronic submissions will not be accepted.',
          '21 CFR 314.50(l); FDA Guidance: Providing Regulatory Submissions in eCTD Format (2023); ICH M8 (eCTD v4.0)',
          'Reformat the entire submission in eCTD v4.0 format using an eCTD publishing tool that generates valid XML backbone files, proper granule structure, and compliant PDF documents.',
          ['ectd_format', 'ctd_modules'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_module2_summaries'),
    dimension: 'documentation',
    title: 'Module 2 Summaries Missing',
    question: 'Module 2 of the CTD is incomplete or missing. The Quality Overall Summary, Nonclinical Overview, and Clinical Overview are critical reviewer aids. Without them, how does the applicant expect the review team to efficiently navigate the application?',
    check(answers) {
      if (isBlank(answers.module2_summaries)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Module 2 summaries and overviews (QOS, nonclinical overview, clinical overview, nonclinical/clinical summary) are not documented.',
          'Module 2 summaries are mandatory components of the CTD per ICH M4 and include: 2.2 (CTD Introduction), 2.3 (Quality Overall Summary), 2.4 (Nonclinical Overview), 2.5 (Clinical Overview), 2.6 (Nonclinical Written and Tabulated Summaries), and 2.7 (Clinical Summary).',
          'ICH M4; ICH M4Q(R1) Section 2.3; ICH M4S(R2) Section 2.6; ICH M4E(R2) Sections 2.5 and 2.7; 21 CFR 314.50',
          'Complete all Module 2 documents including the Quality Overall Summary (2.3), Nonclinical Overview (2.4), Clinical Overview (2.5), and all nonclinical and clinical written/tabulated summaries (2.6 and 2.7).',
          ['module2_summaries', 'ctd_modules'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_comprehensive_toc'),
    dimension: 'documentation',
    title: 'Comprehensive Table of Contents Absent',
    question: 'The NDA submission lacks a comprehensive Table of Contents that maps all documents to their CTD locations. This significantly impairs the review team\'s ability to navigate the application efficiently. Can the applicant provide a hyperlinked ToC?',
    check(answers) {
      if (isBlank(answers.table_of_contents)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No comprehensive Table of Contents is provided for the NDA submission.',
          'A comprehensive ToC is required per 21 CFR 314.50(b) and is essential for eCTD navigation. The eCTD backbone itself provides structural navigation, but a reader-friendly ToC document is also expected.',
          '21 CFR 314.50(b); FDA Guidance: Providing Regulatory Submissions in eCTD Format (2023)',
          'Generate a comprehensive, hyperlinked Table of Contents document that maps every submission document to its CTD module location. Ensure all hyperlinks in eCTD PDFs are functional.',
          ['table_of_contents', 'ectd_format'],
        );
      }
      return null;
    },
  },
  {
    id: rid('missing_hyperlinks'),
    dimension: 'documentation',
    title: 'Intra-Document Hyperlinks Missing',
    question: 'The eCTD submission lacks proper intra- and inter-document hyperlinks, making cross-referencing between related sections extremely difficult. FDA reviewers rely on these hyperlinks for efficient navigation. Can the applicant update the submission with functional links?',
    check(answers) {
      const hyperlinks = String(answers.hyperlinks_present ?? '').toLowerCase();
      if (hyperlinks === 'no' || hyperlinks === 'false' || (isBlank(answers.hyperlinks_present) && !isBlank(answers.ectd_format))) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'Intra-document and inter-document hyperlinks appear to be missing or non-functional in the eCTD submission.',
          'FDA expects functional hyperlinks within and between eCTD documents per FDA Guidance on eCTD submissions. Hyperlinks should connect cross-references, tables, figures, and bibliographic citations.',
          'FDA Guidance: Providing Regulatory Submissions in eCTD Format (2023); FDA eCTD Validation Criteria v4.0',
          'Add functional hyperlinks for all cross-references, including links from Module 2 summaries to underlying Module 3-5 data, from text references to tables/figures, and from bibliographic citations to listed references.',
          ['hyperlinks_present', 'ectd_format', 'table_of_contents'],
        );
      }
      return null;
    },
  },

  /* ========== RISK IDENTIFICATION (5 rules) ========== */
  {
    id: rid('boxed_warning_not_proposed'),
    dimension: 'risk_identification',
    title: 'Boxed Warning Needed but Not Proposed',
    question: 'The safety data suggest serious risks (including potential fatalities or life-threatening adverse reactions) that may warrant a Boxed Warning under 21 CFR 201.57(c)(1). The applicant has not proposed one. Can the applicant justify why a Boxed Warning is not necessary given the identified safety signals?',
    check(answers) {
      const seriousRisks = String(answers.serious_safety_risks ?? '').toLowerCase();
      if (
        !isBlank(seriousRisks) &&
        (seriousRisks.includes('death') || seriousRisks.includes('fatal') || seriousRisks.includes('life-threatening') || seriousRisks.includes('organ damage') || seriousRisks.includes('black box')) &&
        isBlank(answers.proposed_boxed_warning)
      ) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          `Serious safety risks identified ("${answers.serious_safety_risks}") but no Boxed Warning is proposed. FDA may require one under 21 CFR 201.57(c)(1).`,
          'A Boxed Warning is required for adverse reactions so serious relative to the drug\'s benefit that they are essential to consider in deciding whether to prescribe the drug, per 21 CFR 201.57(c)(1).',
          '21 CFR 201.57(c)(1); 21 CFR 201.56(d)(1); FDA Guidance: Warnings and Precautions in Labeling (2011)',
          'Evaluate whether a Boxed Warning is warranted based on the safety data. If serious risks are identified, propose Boxed Warning language and corresponding Medication Guide. If a Boxed Warning is not warranted, provide detailed justification with supportive data.',
          ['serious_safety_risks', 'proposed_boxed_warning', 'proposed_labeling', 'rems_proposal'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_pediatric_study_plan'),
    dimension: 'risk_identification',
    title: 'Pediatric Study Plan (PSP) Not Addressed',
    question: 'The NDA does not address pediatric development obligations. Under the Pediatric Research Equity Act (PREA), all NDAs must include pediatric study plans unless a waiver or deferral has been granted. Can the applicant provide the agreed PSP or the granted waiver/deferral?',
    check(answers) {
      if (isBlank(answers.pediatric_study_plan) && isBlank(answers.pediatric_waiver)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No Pediatric Study Plan (PSP) or pediatric waiver/deferral documentation is included.',
          'Under PREA (FD&C Act Section 505B), all NDAs must contain a pediatric assessment or an approved pediatric study deferral or waiver. A PSP must be submitted and agreed upon before the NDA is filed.',
          'FD&C Act Section 505B (PREA); FDA Guidance: Pediatric Study Plans (2020); 21 CFR 314.55',
          'Submit the agreed Pediatric Study Plan (PSP) or documentation of an FDA-granted full or partial pediatric waiver or deferral. Include the FDA correspondence confirming the PSP agreement.',
          ['pediatric_study_plan', 'pediatric_waiver', 'target_population_age'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_pharmacovigilance_plan'),
    dimension: 'risk_identification',
    title: 'Pharmacovigilance Plan Not Included',
    question: 'The NDA does not include a post-marketing pharmacovigilance plan. Given the limitations of pre-approval safety databases, how does the applicant intend to monitor for rare or delayed adverse events in the broader population after approval?',
    check(answers) {
      if (isBlank(answers.pharmacovigilance_plan)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No post-marketing pharmacovigilance plan is included in the NDA.',
          'A pharmacovigilance plan addressing post-marketing safety surveillance is expected per ICH E2E and may be required as a post-marketing commitment or requirement under 21 CFR 314.81.',
          'ICH E2E; 21 CFR 314.81; FD&C Act Section 505(o)(3); FDA Guidance: Post-Marketing Safety Reporting (2001)',
          'Develop a comprehensive pharmacovigilance plan including routine pharmacovigilance activities, additional surveillance for identified and potential risks, periodic safety update reporting (PSUR/PBRER per ICH E2C(R2)), and signal detection methodology.',
          ['pharmacovigilance_plan', 'safety_concerns', 'rems_proposal'],
        );
      }
      return null;
    },
  },
  {
    id: rid('ddi_not_addressed'),
    dimension: 'risk_identification',
    title: 'Drug-Drug Interactions Not Adequately Addressed',
    question: 'The NDA does not include a comprehensive evaluation of drug-drug interactions (DDIs). Without in vitro and clinical DDI studies, the Agency cannot assess the potential for harmful interactions in patients receiving concomitant medications. Can the applicant provide the DDI evaluation?',
    check(answers) {
      if (isBlank(answers.ddi_assessment)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No drug-drug interaction assessment is provided in the NDA.',
          'A comprehensive DDI assessment including in vitro metabolism studies (CYP enzymes, transporters) and clinical DDI studies is required per 21 CFR 314.50(d)(5) and FDA DDI Guidance.',
          '21 CFR 314.50(d)(5); FDA Guidance: In Vitro Drug Interaction Studies (2020); FDA Guidance: Clinical Drug Interaction Studies (2020); ICH M4E(R2) Section 2.7.2',
          'Provide a complete DDI evaluation including in vitro CYP inhibition/induction studies (CYP3A4, 2D6, 2C9, etc.), transporter studies (P-gp, OATP, BCRP), and clinical DDI studies with sensitive substrates and strong inhibitors/inducers. Include DDI recommendations in the proposed labeling.',
          ['ddi_assessment', 'cyp_metabolism', 'proposed_labeling'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_abuse_potential_assessment'),
    dimension: 'risk_identification',
    title: 'Abuse Potential Not Evaluated',
    question: 'The NDA does not include an assessment of abuse potential. If the drug has any CNS activity or structural similarity to controlled substances, the Agency requires an abuse potential assessment. Can the applicant address whether this drug has abuse liability?',
    check(answers) {
      const mechanism = String(answers.mechanism_of_action ?? '').toLowerCase();
      if (
        (mechanism.includes('cns') || mechanism.includes('opioid') || mechanism.includes('gaba') ||
         mechanism.includes('dopamine') || mechanism.includes('serotonin') || mechanism.includes('stimulant') ||
         mechanism.includes('sedative') || mechanism.includes('anxiolytic')) &&
        isBlank(answers.abuse_potential_assessment)
      ) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          `Drug mechanism of action ("${answers.mechanism_of_action}") suggests potential CNS activity, but no abuse potential assessment is included.`,
          'For drugs with CNS activity, an abuse potential assessment is required per FDA Guidance on Abuse Potential and scheduling evaluation under the Controlled Substances Act (21 USC 811).',
          'FDA Guidance: Assessment of Abuse Potential of Drugs (2017); 21 USC 811; 21 CFR 1308; 21 CFR 314.50(d)(5)(vii)',
          'Conduct and include an 8-factor abuse potential assessment per the Controlled Substances Act. Include nonclinical abuse liability studies (self-administration, drug discrimination, physical dependence), clinical abuse potential studies (drug-liking, subjective effects), and an epidemiological assessment.',
          ['abuse_potential_assessment', 'mechanism_of_action', 'scheduling_recommendation'],
        );
      }
      return null;
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Factory                                                           */
/* ------------------------------------------------------------------ */

export function createNdaAuditor(): WarGameAuditor {
  return {
    category: 'nda',
    name: 'FDA NDA Reviewer',
    description:
      'Simulates an FDA reviewer performing a comprehensive New Drug Application (NDA) assessment ' +
      'under 21 CFR 314 and ICH M4 CTD format, evaluating completeness of CTD modules, internal ' +
      'consistency across CMC/clinical/labeling sections, regulatory alignment with 505(b)(1)/505(b)(2) ' +
      'requirements, scientific rigor of pivotal evidence, practical feasibility of manufacturing and ' +
      'approval timelines, documentation quality including eCTD compliance, and risk identification ' +
      'for post-marketing safety concerns.',
    rules,
  };
}
