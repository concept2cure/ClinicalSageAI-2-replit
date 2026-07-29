/**
 * Briefing Book Auditor -- simulates FDA advisory committee reviewer scrutiny
 * of a briefing document prepared for an FDA Advisory Committee meeting.
 *
 * Generates adversarial questions across seven audit dimensions, referencing
 * 21 CFR Part 14, FDA Advisory Committee Guidance, FDA Benefit-Risk Framework
 * (2023), PDUFA VII commitments, and ICH guidelines (E7, E9, E11).
 *
 * @module server/services/ana/intelligence-questions/war-game/auditors/briefing-book-auditor
 */

import type { WarGameAuditor, AuditRule, WarGameFinding, AuditDimension } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const rid = (suffix: string) => 'bb_' + suffix;

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
  /* ========== COMPLETENESS (4 rules) ========== */
  {
    id: rid('no_benefit_risk_framework'),
    dimension: 'completeness',
    title: 'Benefit-Risk Framework Missing',
    question: 'The briefing document does not include a structured benefit-risk framework. How does the sponsor expect the Advisory Committee to weigh the totality of evidence without a systematic benefit-risk assessment?',
    check(answers) {
      if (isBlank(answers.benefit_risk_framework)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No structured benefit-risk framework is presented in the briefing document.',
          'FDA\'s Benefit-Risk Framework (2023) requires sponsors to present a structured assessment covering analysis of condition, current treatment options, benefit, risk, and risk management across the five key decision factors.',
          'FDA Benefit-Risk Framework (2023); 21 CFR Part 14; PDUFA VII Commitment Letter Section III',
          'Include a structured benefit-risk table using FDA\'s five-factor framework: (1) Analysis of Condition, (2) Current Treatment Options, (3) Benefit, (4) Risk and Risk Management, (5) Summary Assessment. Populate each factor with evidence from the development program.',
          ['benefit_risk_framework', 'efficacy_summary', 'safety_summary'],
        );
      }
      return null;
    },
  },
  {
    id: rid('missing_efficacy_summary'),
    dimension: 'completeness',
    title: 'Efficacy Summary Not Provided',
    question: 'The briefing book lacks a comprehensive efficacy summary. Without a consolidated presentation of efficacy data across pivotal trials, how can the Committee assess the strength of the efficacy evidence?',
    check(answers) {
      if (isBlank(answers.efficacy_summary)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No efficacy summary section is included in the briefing document.',
          'FDA Advisory Committee briefing documents must present a complete summary of efficacy findings from all adequate and well-controlled studies per 21 CFR 314.126.',
          '21 CFR 314.126; FDA Advisory Committee Guidance (2008); ICH E9 Section 2.2',
          'Provide a comprehensive efficacy summary including primary endpoint results from all pivotal trials, key secondary endpoint data, responder analyses, and time-to-event analyses where applicable.',
          ['efficacy_summary', 'primary_endpoint_results', 'pivotal_trial_data'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_120_day_safety_update'),
    dimension: 'completeness',
    title: 'No 120-Day Safety Update',
    question: 'The briefing document does not contain a 120-day safety update. Has the sponsor provided the most current safety data available to support the Committee\'s deliberations, as required by FDA guidance?',
    check(answers) {
      if (isBlank(answers.safety_update_120_day)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No 120-day safety update is included in the briefing document.',
          'FDA requires a 120-day safety update per 21 CFR 314.50(d)(5)(vi)(b) to ensure the Advisory Committee has access to the most recent safety data at the time of the meeting.',
          '21 CFR 314.50(d)(5)(vi)(b); FDA Guidance: Safety Reporting Requirements for INDs and BA/BE Studies (2012)',
          'Include a 120-day safety update covering all adverse events, serious adverse events, and deaths occurring since the NDA/BLA safety database lock. Present new safety signals and any changes to the known safety profile.',
          ['safety_update_120_day', 'safety_database_cutoff_date'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_subgroup_analyses'),
    dimension: 'completeness',
    title: 'Subgroup Analyses Missing',
    question: 'The briefing book does not present subgroup analyses by key demographic and baseline characteristics. How does the sponsor expect the Committee to assess whether the drug\'s effects are consistent across important patient populations?',
    check(answers) {
      if (isBlank(answers.subgroup_analyses)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No subgroup analyses are presented in the briefing document.',
          'FDA Advisory Committee briefing documents should include pre-specified subgroup analyses per ICH E9 Section 5.7 and FDA Guidance on Evaluation of Sex-Specific Data.',
          'ICH E9 Section 5.7; FDA Guidance: Evaluation of Sex-Specific Data (2020); FDA Guidance: Enhancing the Diversity of Clinical Trial Populations (2020)',
          'Present subgroup analyses by age, sex, race/ethnicity, geographic region, disease severity at baseline, and other clinically relevant subgroups. Include forest plots showing treatment effects and interaction p-values.',
          ['subgroup_analyses', 'demographic_data', 'forest_plots'],
        );
      }
      return null;
    },
  },

  /* ========== CONSISTENCY (4 rules) ========== */
  {
    id: rid('briefing_vs_nda_data_conflict'),
    dimension: 'consistency',
    title: 'Data Conflicts Between Briefing Book and NDA/BLA',
    question: 'Are there any discrepancies between the data presented in this briefing document and the data submitted in the NDA/BLA? The Committee relies on internal consistency across regulatory submissions to assess data integrity.',
    check(answers) {
      const hasConflicts = answers.data_conflicts_with_application;
      if (hasConflicts === true || hasConflicts === 'yes' || hasConflicts === 'Yes') {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Data presented in the briefing document conflicts with data submitted in the NDA/BLA application.',
          'All data presented to the Advisory Committee must be consistent with the submitted application per 21 CFR Part 14.25 and FDA Advisory Committee Guidance.',
          '21 CFR Part 14.25; FDA Advisory Committee Guidance (2008); 21 CFR 314.50',
          'Reconcile all discrepancies between the briefing book and NDA/BLA submission. Provide an errata document if corrections are needed. Ensure all tables, figures, and summary statistics are derived from the same datasets.',
          ['data_conflicts_with_application', 'nda_bla_data', 'briefing_book_data'],
        );
      }
      return null;
    },
  },
  {
    id: rid('efficacy_conclusions_vs_stats'),
    dimension: 'consistency',
    title: 'Efficacy Conclusions Inconsistent with Statistical Tables',
    question: 'The efficacy conclusions stated in the narrative do not appear to align with the statistical results in the data tables. Can the sponsor explain how the stated conclusions are supported by the quantitative evidence?',
    check(answers) {
      const mismatch = answers.efficacy_narrative_stats_mismatch;
      if (mismatch === true || mismatch === 'yes' || mismatch === 'Yes') {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Efficacy conclusions in the narrative text are inconsistent with the data presented in statistical tables.',
          'Narrative summaries must accurately reflect the statistical evidence per ICH E9 Section 5 and FDA Advisory Committee Guidance.',
          'ICH E9 Section 5; FDA Advisory Committee Guidance (2008); 21 CFR 314.126(b)',
          'Ensure all efficacy narrative statements are directly supported by the statistical tables. Cross-reference every efficacy claim with the corresponding p-values, confidence intervals, and effect sizes from the SAP-specified analyses.',
          ['efficacy_narrative_stats_mismatch', 'efficacy_summary', 'statistical_tables'],
        );
      }
      return null;
    },
  },
  {
    id: rid('safety_data_discrepancies'),
    dimension: 'consistency',
    title: 'Safety Data Discrepancies Across Sections',
    question: 'The safety data presented in different sections of the briefing document appear to show discrepant numbers. Can the sponsor confirm whether all safety tables were generated from the same safety population and database cutoff?',
    check(answers) {
      const discrepancies = answers.safety_data_discrepancies;
      if (discrepancies === true || discrepancies === 'yes' || discrepancies === 'Yes') {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Safety data show discrepancies across different sections of the briefing document.',
          'Safety data must be internally consistent throughout the briefing document, derived from a clearly defined safety population per ICH E9 Section 5.6.',
          'ICH E9 Section 5.6; FDA Advisory Committee Guidance (2008); ICH E2E',
          'Verify all safety tables use the same safety analysis population and database cutoff date. Provide a clear definition of the safety population and data lock point. Reconcile any discrepancies with an addendum.',
          ['safety_data_discrepancies', 'safety_population_definition', 'database_cutoff_date'],
        );
      }
      return null;
    },
  },
  {
    id: rid('demographic_table_mismatch'),
    dimension: 'consistency',
    title: 'Demographic Data Inconsistencies',
    question: 'The baseline demographic tables across study sections show different total N values. The Committee needs to understand which analysis population is being described in each section. Can the sponsor clarify?',
    check(answers) {
      const mismatch = answers.demographic_table_inconsistencies;
      if (mismatch === true || mismatch === 'yes' || mismatch === 'Yes') {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'Baseline demographic tables in the briefing document show inconsistent total N values across sections.',
          'Each analysis population (ITT, mITT, PP, safety) must be clearly defined with consistent N values per ICH E9 Section 5.2.',
          'ICH E9 Section 5.2; FDA Advisory Committee Guidance (2008)',
          'Provide a clear disposition diagram (CONSORT flow) and define each analysis population explicitly. Ensure every table header specifies which population is being presented.',
          ['demographic_table_inconsistencies', 'analysis_populations', 'consort_diagram'],
        );
      }
      return null;
    },
  },

  /* ========== REGULATORY ALIGNMENT (4 rules) ========== */
  {
    id: rid('fda_questions_not_addressed'),
    dimension: 'regulatory_alignment',
    title: 'FDA Questions Not Addressed',
    question: 'The Agency has posed specific questions for Committee discussion, yet several of these questions are not directly addressed in the briefing document. How does the sponsor expect the Committee to deliberate on questions for which no supporting data have been presented?',
    check(answers) {
      if (isBlank(answers.fda_questions_addressed) || answers.fda_questions_addressed === false || answers.fda_questions_addressed === 'no' || answers.fda_questions_addressed === 'No') {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'FDA-specified discussion questions are not directly addressed in the briefing document.',
          'The sponsor\'s briefing document must address the specific questions identified by FDA for Advisory Committee discussion per 21 CFR 14.25(b).',
          '21 CFR 14.25(b); FDA Advisory Committee Guidance (2008); PDUFA VII Commitment Letter',
          'Structure the briefing document to explicitly address each FDA-specified discussion question with dedicated sections. Map each question to the supporting data and analyses.',
          ['fda_questions_addressed', 'fda_discussion_questions', 'briefing_document_structure'],
        );
      }
      return null;
    },
  },
  {
    id: rid('voting_questions_label_misalignment'),
    dimension: 'regulatory_alignment',
    title: 'Voting Questions Misaligned with Label Claims',
    question: 'The proposed voting questions do not appear to align with the indication and claims in the proposed labeling. Can the sponsor explain how the voting questions will inform the labeled indication if they do not match the proposed label?',
    check(answers) {
      const misaligned = answers.voting_questions_label_aligned;
      if (misaligned === false || misaligned === 'no' || misaligned === 'No') {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Advisory Committee voting questions are not aligned with the proposed labeling claims.',
          'Voting questions must reflect the proposed indication and labeling claims to ensure the Committee\'s vote is actionable per FDA Advisory Committee Guidance.',
          'FDA Advisory Committee Guidance (2008); 21 CFR Part 14; 21 CFR 201.57',
          'Align voting questions with the exact proposed indication statement and key labeling claims. Ensure each voting question maps to a specific approvability criterion.',
          ['voting_questions_label_aligned', 'proposed_indication', 'proposed_labeling'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_structured_benefit_risk'),
    dimension: 'regulatory_alignment',
    title: 'No Structured Benefit-Risk per FDA B-R Framework',
    question: 'The briefing document does not present a structured benefit-risk assessment using FDA\'s recommended framework. Given that the Benefit-Risk Framework is central to FDA\'s regulatory decision-making, how does the sponsor justify this omission?',
    check(answers) {
      if (isBlank(answers.structured_benefit_risk_table)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No structured benefit-risk assessment table using the FDA Benefit-Risk Framework is included.',
          'FDA\'s Benefit-Risk Framework (2023) is the standard for presenting benefit-risk assessments in Advisory Committee briefing documents and throughout the drug review process.',
          'FDA Benefit-Risk Framework (2023); PDUFA VII Commitment Letter Section III; FDA Advisory Committee Guidance (2008)',
          'Create a structured benefit-risk summary table using FDA\'s five-factor framework. Include quantitative measures of benefit (NNT, effect sizes) and risk (NNH, incidence rates) alongside qualitative assessments.',
          ['structured_benefit_risk_table', 'benefit_risk_framework', 'nnt_nnh_data'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_rems_discussion'),
    dimension: 'regulatory_alignment',
    title: 'REMS Discussion Absent',
    question: 'Given the safety profile of this product, the briefing document does not discuss whether a Risk Evaluation and Mitigation Strategy is warranted. Has the sponsor considered whether a REMS is necessary to ensure benefits outweigh risks?',
    check(answers) {
      if (isBlank(answers.rems_discussion) && !isBlank(answers.serious_safety_signals)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'The briefing document identifies serious safety signals but does not discuss potential REMS requirements.',
          'Under 21 USC 355-1 (FDAAA Section 901), FDA may require a REMS when necessary to ensure a drug\'s benefits outweigh its risks. Sponsors should proactively address this in briefing documents.',
          '21 USC 355-1; FDA Guidance: REMS (2022); 21 CFR Part 14',
          'Include a dedicated section discussing whether a REMS is warranted based on the identified safety signals. If REMS is proposed, outline Elements to Assure Safe Use (ETASU).',
          ['rems_discussion', 'serious_safety_signals', 'risk_management_plan'],
        );
      }
      return null;
    },
  },

  /* ========== SCIENTIFIC RIGOR (4 rules) ========== */
  {
    id: rid('no_forest_plots'),
    dimension: 'scientific_rigor',
    title: 'No Forest Plots for Subgroup Analyses',
    question: 'The briefing document presents subgroup analyses without forest plots. Forest plots are standard for visualizing treatment effect heterogeneity across subgroups. Why has the sponsor omitted this standard analytical display?',
    check(answers) {
      if (!isBlank(answers.subgroup_analyses) && isBlank(answers.forest_plots)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'Subgroup analyses are described but no forest plots are provided to visualize treatment effect consistency.',
          'Forest plots are the standard display for subgroup analyses per ICH E9 Section 5.7 and FDA Guidance on Multiple Endpoints in Clinical Trials.',
          'ICH E9 Section 5.7; FDA Guidance: Multiple Endpoints in Clinical Trials (2022); ICH E9(R1)',
          'Include forest plots showing point estimates and confidence intervals for the treatment effect within each pre-specified subgroup, with an overall estimate and interaction p-values.',
          ['forest_plots', 'subgroup_analyses', 'treatment_effect_heterogeneity'],
        );
      }
      return null;
    },
  },
  {
    id: rid('inadequate_responder_analyses'),
    dimension: 'scientific_rigor',
    title: 'Inadequate Responder Analyses',
    question: 'The briefing document does not present adequate responder analyses. The Committee needs to understand what proportion of patients achieved clinically meaningful improvement, not just mean treatment effects. Can the sponsor provide these data?',
    check(answers) {
      if (isBlank(answers.responder_analyses)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No responder analyses are presented in the briefing document.',
          'Responder analyses are recommended per ICH E9 Section 5.4 and FDA Guidance to characterize the proportion of patients achieving clinically meaningful benefit.',
          'ICH E9 Section 5.4; FDA Guidance: Patient-Focused Drug Development (2023); ICH E9(R1) Addendum',
          'Present responder analyses using clinically meaningful thresholds (e.g., MCID). Include cumulative distribution function (CDF) plots showing the full distribution of treatment responses.',
          ['responder_analyses', 'mcid_threshold', 'cdf_plots'],
        );
      }
      return null;
    },
  },
  {
    id: rid('sensitivity_analyses_missing'),
    dimension: 'scientific_rigor',
    title: 'Sensitivity Analyses Missing',
    question: 'The briefing document does not include sensitivity analyses to test the robustness of the primary efficacy findings. How can the Committee be confident that the results are not driven by analytical choices or missing data assumptions?',
    check(answers) {
      if (isBlank(answers.sensitivity_analyses)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No sensitivity analyses are presented to support the robustness of the primary efficacy results.',
          'ICH E9 Section 5.2.3 and ICH E9(R1) require sensitivity analyses to evaluate the robustness of primary analysis results under different assumptions.',
          'ICH E9 Section 5.2.3; ICH E9(R1) Addendum; FDA Guidance: Missing Data in Confirmatory Trials (2020)',
          'Include sensitivity analyses addressing: (1) alternative missing data assumptions (e.g., tipping point, pattern mixture models), (2) per-protocol population analysis, (3) alternative endpoint definitions, and (4) covariate adjustments.',
          ['sensitivity_analyses', 'missing_data_handling', 'primary_analysis_results'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_nnt_nnh'),
    dimension: 'scientific_rigor',
    title: 'No NNT/NNH Presented',
    question: 'The briefing document does not present Number Needed to Treat or Number Needed to Harm metrics. These are essential for the Committee to contextualize the clinical significance of the benefit-risk profile. Can the sponsor provide these calculations?',
    check(answers) {
      if (isBlank(answers.nnt_nnh_data)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'NNT (Number Needed to Treat) and NNH (Number Needed to Harm) are not presented in the briefing document.',
          'NNT and NNH are recommended by FDA\'s Benefit-Risk Framework (2023) as quantitative measures to facilitate Advisory Committee deliberation on clinical significance.',
          'FDA Benefit-Risk Framework (2023); ICH E9 Section 5.4; FDA Advisory Committee Guidance (2008)',
          'Calculate and present NNT for the primary efficacy endpoint and key secondary endpoints, and NNH for the most clinically significant adverse events. Include confidence intervals for these estimates.',
          ['nnt_nnh_data', 'primary_endpoint_results', 'key_adverse_events'],
        );
      }
      return null;
    },
  },

  /* ========== PRACTICAL FEASIBILITY (4 rules) ========== */
  {
    id: rid('no_mock_advisory_committee'),
    dimension: 'practical_feasibility',
    title: 'No Mock Advisory Committee Conducted',
    question: 'Has the sponsor conducted a mock Advisory Committee meeting to stress-test the briefing document and sponsor presentation? Without rehearsal, the sponsor may be inadequately prepared for Committee questions.',
    check(answers) {
      if (isBlank(answers.mock_advisory_committee_conducted) || answers.mock_advisory_committee_conducted === false || answers.mock_advisory_committee_conducted === 'no' || answers.mock_advisory_committee_conducted === 'No') {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No mock Advisory Committee meeting has been conducted to prepare for the actual meeting.',
          'Industry best practices strongly recommend conducting at least one full mock Advisory Committee meeting to identify weaknesses in the briefing document and sponsor presentation.',
          'FDA Advisory Committee Guidance (2008); PDUFA VII Commitment Letter; Industry Best Practice',
          'Conduct a mock Advisory Committee meeting with external KOLs and former Advisory Committee members. Include a mock voting exercise and document areas requiring additional data or clarification in the briefing book.',
          ['mock_advisory_committee_conducted', 'presentation_prepared', 'kol_engagement'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_backup_slides'),
    dimension: 'practical_feasibility',
    title: 'Backup Slides Not Prepared',
    question: 'Has the sponsor prepared backup slides to address anticipated difficult questions from the Advisory Committee? Without supplementary materials, the sponsor may be unable to address Committee concerns in real time.',
    check(answers) {
      if (isBlank(answers.backup_slides_prepared) || answers.backup_slides_prepared === false || answers.backup_slides_prepared === 'no' || answers.backup_slides_prepared === 'No') {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'Backup slides for anticipated Advisory Committee questions have not been prepared.',
          'Sponsors should prepare extensive backup slide decks covering potential Committee questions beyond the formal presentation per industry best practices.',
          'FDA Advisory Committee Guidance (2008); Industry Best Practice',
          'Prepare backup slides addressing: (1) additional subgroup analyses, (2) alternative statistical approaches, (3) detailed safety narratives for deaths and serious AEs, (4) competitive landscape comparisons, (5) pharmacokinetic data, and (6) post-marketing surveillance plans.',
          ['backup_slides_prepared', 'anticipated_questions', 'presentation_prepared'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_postmarketing_plan'),
    dimension: 'practical_feasibility',
    title: 'Post-Marketing Commitment Plan Missing',
    question: 'The briefing document does not outline proposed post-marketing commitments or requirements. The Advisory Committee frequently asks about the sponsor\'s post-approval plans. How does the sponsor intend to address this gap?',
    check(answers) {
      if (isBlank(answers.postmarketing_commitment_plan)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No post-marketing commitment plan is described in the briefing document.',
          'Post-marketing commitments are a standard topic of Advisory Committee discussion per PDUFA VII and 21 CFR 314.81(b)(2)(vii).',
          'PDUFA VII Commitment Letter; 21 CFR 314.81(b)(2)(vii); FDA Guidance: Postmarketing Studies and Clinical Trials (2011)',
          'Include a post-marketing plan section covering proposed PMR/PMC studies, post-marketing safety surveillance, any planned registries, and long-term follow-up studies. Align with anticipated FDA post-marketing requirements.',
          ['postmarketing_commitment_plan', 'proposed_pmr_pmc', 'long_term_safety_plan'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_patient_perspective'),
    dimension: 'practical_feasibility',
    title: 'Patient Perspective Not Included',
    question: 'The briefing document does not include patient-reported outcomes or a patient perspective section. Given FDA\'s emphasis on patient-focused drug development under PDUFA VII, how does the sponsor justify this omission?',
    check(answers) {
      if (isBlank(answers.patient_perspective_included) || answers.patient_perspective_included === false) {
        return finding(
          this.id,
          this.dimension,
          'info',
          this.title,
          this.question,
          'No patient-reported outcomes or patient perspective section is included in the briefing document.',
          'PDUFA VII emphasizes patient-focused drug development and patient input in regulatory decision-making.',
          'PDUFA VII Commitment Letter; FDA Guidance: Patient-Focused Drug Development (2023); ICH E9(R1)',
          'Include a patient perspective section with patient-reported outcome (PRO) data, patient preference information if available, and a summary of the unmet medical need from the patient\'s viewpoint.',
          ['patient_perspective_included', 'pro_data', 'patient_preference_data'],
        );
      }
      return null;
    },
  },

  /* ========== DOCUMENTATION (4 rules) ========== */
  {
    id: rid('page_count_excessive'),
    dimension: 'documentation',
    title: 'Page Count Excessive',
    question: 'The briefing document exceeds 300 pages. Excessive length may impede the Advisory Committee members\' ability to review the material thoroughly within the allotted preparation time. Has the sponsor considered condensing the document?',
    check(answers) {
      const pages = numericVal(answers.page_count);
      if (pages !== null && pages > 300) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          `The briefing document is ${pages} pages, which exceeds the recommended 300-page limit. Excessive length may impede the Advisory Committee members' ability to review the material thoroughly within the allotted preparation time. Has the sponsor considered condensing the document?`,
          `The briefing document is ${pages} pages, significantly exceeding the recommended maximum of approximately 300 pages.`,
          'FDA Advisory Committee Guidance recommends that briefing documents be concise and focused to allow Committee members adequate time for review, typically distributed 2-3 weeks before the meeting.',
          'FDA Advisory Committee Guidance (2008); 21 CFR Part 14',
          'Condense the briefing document to under 300 pages by moving detailed data tables, case narratives, and supporting analyses to appendices. Focus the main body on key findings and their interpretation.',
          ['page_count', 'executive_summary', 'appendices'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_executive_summary'),
    dimension: 'documentation',
    title: 'No Executive Summary',
    question: 'The briefing document lacks an executive summary. Advisory Committee members review multiple lengthy documents and rely on executive summaries for efficient preparation. Why has the sponsor omitted this essential section?',
    check(answers) {
      if (isBlank(answers.executive_summary)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No executive summary is provided in the briefing document.',
          'An executive summary is expected in Advisory Committee briefing documents to provide Committee members with a concise overview of the key data and regulatory issues.',
          'FDA Advisory Committee Guidance (2008); 21 CFR Part 14; Industry Best Practice',
          'Include a 5-10 page executive summary covering: (1) product and indication overview, (2) development program summary, (3) key efficacy results, (4) safety profile summary, (5) benefit-risk assessment, and (6) questions for Committee discussion.',
          ['executive_summary', 'briefing_document_structure'],
        );
      }
      return null;
    },
  },
  {
    id: rid('missing_raw_data_appendices'),
    dimension: 'documentation',
    title: 'Missing Appendices for Raw Data Tables',
    question: 'The briefing document does not include appendices with detailed data tables. Committee members and FDA reviewers need access to granular data to verify summary-level conclusions. Where can these supporting data be found?',
    check(answers) {
      if (isBlank(answers.raw_data_appendices)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No appendices with raw data tables are included in the briefing document.',
          'Appendices with detailed data tables support transparency and allow independent verification of summary statistics per FDA Advisory Committee Guidance.',
          'FDA Advisory Committee Guidance (2008); ICH E9 Section 5; 21 CFR Part 14',
          'Provide appendices containing: (1) individual patient listings for deaths and serious AEs, (2) detailed efficacy tables by visit and subgroup, (3) laboratory shift tables, (4) complete demographic tables, and (5) protocol deviation summaries.',
          ['raw_data_appendices', 'patient_listings', 'detailed_safety_tables'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_table_of_contents'),
    dimension: 'documentation',
    title: 'Table of Contents Missing or Inadequate',
    question: 'The briefing document does not include a detailed table of contents with hyperlinks. Given the length and complexity of the document, how does the sponsor expect Committee members to navigate efficiently to relevant sections?',
    check(answers) {
      if (isBlank(answers.table_of_contents)) {
        return finding(
          this.id,
          this.dimension,
          'info',
          this.title,
          this.question,
          'The briefing document lacks a detailed table of contents.',
          'FDA Advisory Committee briefing documents should include a detailed table of contents to facilitate review by Committee members.',
          'FDA Advisory Committee Guidance (2008); 21 CFR Part 14',
          'Include a detailed table of contents with hyperlinked page numbers, covering all major sections, subsections, tables, figures, and appendices.',
          ['table_of_contents', 'briefing_document_structure'],
        );
      }
      return null;
    },
  },

  /* ========== RISK IDENTIFICATION (4 rules) ========== */
  {
    id: rid('competitive_landscape_not_addressed'),
    dimension: 'risk_identification',
    title: 'Competitive Landscape Not Addressed',
    question: 'The briefing document does not discuss the competitive landscape, including approved therapies and drugs in late-stage development for the same indication. How does the sponsor position this product relative to existing and emerging treatment options?',
    check(answers) {
      if (isBlank(answers.competitive_landscape)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No discussion of the competitive therapeutic landscape is included in the briefing document.',
          'Advisory Committee members need context on available treatment alternatives to assess the clinical significance of a new therapy per FDA Advisory Committee Guidance.',
          'FDA Advisory Committee Guidance (2008); FDA Benefit-Risk Framework (2023); ICH E10 Section 2',
          'Include a competitive landscape section covering: (1) currently approved therapies with their efficacy and safety profiles, (2) head-to-head trial data if available, (3) indirect treatment comparisons, and (4) drugs in late-stage development that may change the treatment paradigm.',
          ['competitive_landscape', 'current_treatment_options', 'indirect_comparisons'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_risk_management_strategy'),
    dimension: 'risk_identification',
    title: 'No Risk Management Strategy',
    question: 'The briefing document does not present a risk management strategy for identified safety concerns. The Committee will want to understand how the sponsor plans to mitigate known risks in clinical practice. What is the sponsor\'s risk management approach?',
    check(answers) {
      if (isBlank(answers.risk_management_strategy)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No risk management strategy is presented for identified safety concerns.',
          'A risk management strategy is expected per ICH E2E and FDA Guidance on REMS when significant safety concerns are identified.',
          'ICH E2E; FDA Guidance: REMS (2022); FDA Benefit-Risk Framework (2023); 21 CFR Part 14',
          'Present a comprehensive risk management strategy including: (1) risk characterization for each identified safety signal, (2) proposed risk minimization measures (e.g., labeling, Medication Guide, ETASU), (3) pharmacovigilance plans, and (4) risk communication strategy.',
          ['risk_management_strategy', 'safety_signals', 'rems_discussion'],
        );
      }
      return null;
    },
  },
  {
    id: rid('safety_signals_not_contextualized'),
    dimension: 'risk_identification',
    title: 'Known Safety Signals Not Contextualized',
    question: 'The briefing document identifies safety signals but does not provide clinical context, including comparison to the background rate in the target population or to the safety profiles of approved comparators. How can the Committee assess the clinical significance of these signals without context?',
    check(answers) {
      if (!isBlank(answers.safety_signals) && isBlank(answers.safety_signal_contextualization)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Safety signals are identified but not contextualized against background rates or comparator safety profiles.',
          'ICH E2E and FDA Guidance require that identified safety signals be evaluated in the context of the target disease population and available treatment alternatives.',
          'ICH E2E; FDA Benefit-Risk Framework (2023); ICH E1; FDA Advisory Committee Guidance (2008)',
          'Contextualize each identified safety signal by: (1) comparing incidence rates to known background rates in the target population, (2) comparing to approved comparator safety profiles, (3) providing individual case narratives for serious events, and (4) assessing causality using Bradford Hill criteria where applicable.',
          ['safety_signal_contextualization', 'safety_signals', 'background_rates', 'comparator_safety_data'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_pediatric_extrapolation'),
    dimension: 'risk_identification',
    title: 'Pediatric Data or Extrapolation Plan Missing',
    question: 'The briefing document does not address pediatric use, whether through clinical data or an extrapolation strategy. Given PREA requirements, how does the sponsor plan to address pediatric development for this indication?',
    check(answers) {
      if (isBlank(answers.pediatric_data) && isBlank(answers.pediatric_extrapolation_plan)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'Neither pediatric clinical data nor a pediatric extrapolation plan is presented in the briefing document.',
          'Pediatric studies are required under PREA (Pediatric Research Equity Act) and ICH E11 unless a waiver or deferral has been granted.',
          'ICH E11(R1); PREA (21 USC 355c); FDA Guidance: Pediatric Study Plans (2020); ICH E7',
          'Include a pediatric development section addressing: (1) pediatric study plan status, (2) any available pediatric pharmacokinetic data, (3) extrapolation strategy if applicable per ICH E11(R1), (4) waiver or deferral status if pediatric studies are not complete.',
          ['pediatric_data', 'pediatric_extrapolation_plan', 'prea_waiver_status'],
        );
      }
      return null;
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Factory                                                           */
/* ------------------------------------------------------------------ */

export function createBriefingBookAuditor(): WarGameAuditor {
  return {
    category: 'briefing_book',
    name: 'FDA Advisory Committee Briefing Document Reviewer',
    description:
      'Simulates an FDA Advisory Committee reviewer assessing a sponsor\'s briefing document ' +
      'per 21 CFR Part 14, evaluating completeness, internal consistency, regulatory alignment, ' +
      'scientific rigor, practical feasibility, documentation quality, and risk identification ' +
      'to prepare for Advisory Committee deliberation.',
    rules,
  };
}
