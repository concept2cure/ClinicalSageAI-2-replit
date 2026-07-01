/**
 * Safety Narrative Auditor -- simulates FDA safety reviewer scrutiny of
 * patient safety narratives.
 *
 * Generates adversarial questions across seven audit dimensions, referencing
 * ICH E3 Section 12.3, ICH E2A, ICH E2B(R3), ICH E2D, CIOMS I/VI,
 * 21 CFR 312.32, and MedDRA Best Practices.
 *
 * @module server/services/ana/intelligence-questions/war-game/auditors/safety-narrative-auditor
 */

import type { WarGameAuditor, AuditRule, WarGameFinding, AuditDimension } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const rid = (suffix: string) => 'sn_' + suffix;

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
    id: rid('no_patient_demographics'),
    dimension: 'completeness',
    title: 'Patient Demographics Missing from Narrative',
    question: 'The safety narrative does not include basic patient demographics (age, sex, race, weight). How does the sponsor expect the Agency to assess whether the adverse event profile is consistent with the enrolled population?',
    check(answers) {
      if (isBlank(answers.patient_demographics)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No patient demographics (age, sex, race, weight) are included in the safety narrative.',
          'ICH E3 Section 12.3.1 requires that individual patient narratives include patient demographics to contextualize the adverse event.',
          'ICH E3 Section 12.3.1; ICH E2B(R3) Section 2.2; CIOMS VI Section 3.1',
          'Include complete patient demographics: age, sex, race/ethnicity, body weight, and relevant baseline characteristics. These are essential for causality assessment and signal evaluation.',
          ['patient_demographics', 'subject_id'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_medical_history'),
    dimension: 'completeness',
    title: 'Medical History Absent',
    question: 'The narrative does not document the patient\'s relevant medical history. Without this context, how can the reviewer differentiate drug-related events from pre-existing conditions or comorbid disease progression?',
    check(answers) {
      if (isBlank(answers.medical_history)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'Relevant medical history is not documented in the safety narrative.',
          'ICH E2B(R3) Section 2.4 requires documentation of relevant past medical history, including pre-existing conditions, to support causality assessment.',
          'ICH E2B(R3) Section 2.4; ICH E3 Section 12.3.1; CIOMS I',
          'Document all relevant medical history including pre-existing conditions, surgeries, allergies, and risk factors that may inform differential diagnosis.',
          ['medical_history', 'patient_demographics'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_concomitant_meds'),
    dimension: 'completeness',
    title: 'Concomitant Medications Not Listed',
    question: 'The narrative fails to list concomitant medications. Drug-drug interactions represent a major confounding factor in causality assessment. Why has the sponsor omitted this critical information?',
    check(answers) {
      if (isBlank(answers.concomitant_medications)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No concomitant medications are listed in the safety narrative.',
          'ICH E2B(R3) Section 2.6 and ICH E3 Section 12.3.1 require documentation of all concomitant therapies to assess potential drug-drug interactions.',
          'ICH E2B(R3) Section 2.6; ICH E3 Section 12.3.1; 21 CFR 312.32(c)(1)(i)',
          'Provide a complete list of concomitant medications, including dose, route, frequency, indication, and start/stop dates relative to the adverse event onset.',
          ['concomitant_medications', 'drug_interactions'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_autopsy_for_death'),
    dimension: 'completeness',
    title: 'No Autopsy Report for Fatal Case',
    question: 'This narrative describes a fatal outcome, yet no autopsy findings are reported. Given the gravity of a treatment-related death, can the sponsor explain why an autopsy was not obtained or, if conducted, why results are not included?',
    check(answers) {
      const outcome = String(answers.event_outcome ?? '').toLowerCase();
      if (
        (outcome.includes('death') || outcome.includes('fatal')) &&
        isBlank(answers.autopsy_report)
      ) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'A fatal outcome is reported but no autopsy findings are included in the narrative.',
          'ICH E2B(R3) Section 2.14 requires autopsy results (if performed) to be included in individual case safety reports for fatal cases. ICH E3 Section 12.3.2 emphasizes detailed narratives for deaths.',
          'ICH E2B(R3) Section 2.14; ICH E3 Section 12.3.2; 21 CFR 312.32(c)(1)(i)',
          'Include autopsy findings if available. If autopsy was not performed, document the reason (e.g., family refusal) and provide the best available clinical determination of cause of death.',
          ['autopsy_report', 'event_outcome', 'cause_of_death'],
        );
      }
      return null;
    },
  },

  /* ========== CONSISTENCY (4 rules) ========== */
  {
    id: rid('dates_mismatch_crf'),
    dimension: 'consistency',
    title: 'Narrative Dates Inconsistent with CRF',
    question: 'The dates reported in the narrative do not align with those recorded on the case report form. Which set of dates should the Agency rely upon, and what process failed to catch this discrepancy prior to submission?',
    check(answers) {
      if (answers.date_discrepancy === true || answers.date_discrepancy === 'yes') {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Dates in the safety narrative are inconsistent with the corresponding CRF data.',
          'ICH E3 Section 12.3 requires narrative consistency with source documents. ICH E6(R2) Section 5.18.4(e) mandates that case narratives accurately reflect CRF data.',
          'ICH E3 Section 12.3; ICH E6(R2) Section 5.18.4(e); 21 CFR 312.62',
          'Reconcile all dates between the narrative and CRF. Implement a quality control step requiring cross-verification of onset dates, treatment dates, and resolution dates prior to database lock.',
          ['date_discrepancy', 'event_onset_date', 'treatment_start_date'],
        );
      }
      return null;
    },
  },
  {
    id: rid('narrative_contradicts_tabulated'),
    dimension: 'consistency',
    title: 'Narrative Contradicts Tabulated Safety Data',
    question: 'The narrative description of the event severity and outcome conflicts with the tabulated safety data in the study report. This inconsistency undermines the reliability of the entire safety database. How does the sponsor reconcile this?',
    check(answers) {
      if (answers.tabulation_discrepancy === true || answers.tabulation_discrepancy === 'yes') {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'The narrative text contradicts the corresponding tabulated safety summary data (e.g., severity grade, outcome, or seriousness criteria differ).',
          'ICH E3 Section 12.3 requires consistency between individual narratives and summary tabulations. Discrepancies suggest data quality issues.',
          'ICH E3 Sections 12.2 and 12.3; ICH E2A Section IV',
          'Perform a systematic reconciliation of all narrative content against tabulated safety tables. Correct discrepancies and document the rationale for any changes in an amendment.',
          ['tabulation_discrepancy', 'event_severity', 'event_outcome'],
        );
      }
      return null;
    },
  },
  {
    id: rid('meddra_coding_mismatch'),
    dimension: 'consistency',
    title: 'MedDRA Coding Inconsistent with Narrative Description',
    question: 'The MedDRA preferred term assigned to this event does not accurately reflect the clinical description in the narrative. Miscoded events may obscure safety signals or inflate unrelated event categories. Can the sponsor verify the coding accuracy?',
    check(answers) {
      if (answers.meddra_mismatch === true || answers.meddra_mismatch === 'yes') {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'The MedDRA preferred term (PT) or lowest level term (LLT) does not correspond to the clinical description documented in the narrative.',
          'MedDRA Best Practices recommend coding to the most specific LLT that matches the reported verbatim term. ICH E2B(R3) Section 2.12.2 requires accurate MedDRA coding.',
          'MedDRA Best Practices (MSSO); ICH E2B(R3) Section 2.12.2; ICH E3 Section 12.2.1',
          'Review and recode the event using the current MedDRA version. Ensure the LLT/PT accurately reflects the clinical presentation described in the narrative. Document the coding rationale.',
          ['meddra_mismatch', 'meddra_preferred_term', 'verbatim_term'],
        );
      }
      return null;
    },
  },
  {
    id: rid('timeline_gaps'),
    dimension: 'consistency',
    title: 'Chronological Gaps in Event Timeline',
    question: 'The narrative contains unexplained gaps in the event timeline. Critical intervals between drug administration, symptom onset, and clinical response are missing. How does the sponsor account for these temporal discontinuities?',
    check(answers) {
      if (isBlank(answers.event_timeline) || answers.timeline_has_gaps === true || answers.timeline_has_gaps === 'yes') {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'The safety narrative contains chronological gaps or the event timeline is incomplete, making temporal causality assessment unreliable.',
          'ICH E3 Section 12.3.1 requires a complete chronological account of the event from onset to resolution or stabilization.',
          'ICH E3 Section 12.3.1; ICH E2A Section III; CIOMS I',
          'Reconstruct a complete event timeline including: drug exposure dates, symptom onset, diagnostic evaluations, interventions, and outcome. Mark any unavailable dates as "unknown" with explanation.',
          ['event_timeline', 'timeline_has_gaps', 'event_onset_date'],
        );
      }
      return null;
    },
  },

  /* ========== REGULATORY ALIGNMENT (4 rules) ========== */
  {
    id: rid('susar_reporting_delay'),
    dimension: 'regulatory_alignment',
    title: 'SUSAR Not Reported within Required Timeframe',
    question: 'This suspected unexpected serious adverse reaction (SUSAR) was not reported to regulatory authorities within the mandatory 15-day (or 7-day for fatal/life-threatening) window. What systemic failures led to this reporting violation?',
    check(answers) {
      const daysSinceEvent = numericVal(answers.days_to_report);
      const isSusar = answers.is_susar === true || answers.is_susar === 'yes';
      const isFatal = String(answers.event_outcome ?? '').toLowerCase().includes('death') ||
                      String(answers.event_outcome ?? '').toLowerCase().includes('fatal');
      if (isSusar && daysSinceEvent !== null) {
        if ((isFatal && daysSinceEvent > 7) || (!isFatal && daysSinceEvent > 15)) {
          return finding(
            this.id,
            this.dimension,
            'critical',
            this.title,
            this.question,
            `SUSAR was reported ${daysSinceEvent} days after the event, exceeding the ${isFatal ? '7-day (fatal/life-threatening)' : '15-day'} regulatory reporting deadline.`,
            'ICH E2A Section IV.A requires expedited reporting of SUSARs: 7 calendar days for fatal/life-threatening events, 15 calendar days for all other serious events. 21 CFR 312.32(c)(1) mandates IND safety reports within these timeframes.',
            'ICH E2A Section IV.A; 21 CFR 312.32(c)(1); ICH E2D Section III',
            'Investigate the root cause of the reporting delay and implement corrective actions. File a late report with explanation. Review all SUSARs in the database for similar delays.',
            ['days_to_report', 'is_susar', 'event_outcome', 'reporting_date'],
          );
        }
      }
      return null;
    },
  },
  {
    id: rid('cioms_form_incomplete'),
    dimension: 'regulatory_alignment',
    title: 'CIOMS Form Incomplete',
    question: 'The CIOMS I form submitted with this case is missing required fields. Incomplete expedited reports may trigger regulatory deficiency letters. Has the sponsor verified that all mandatory CIOMS fields are populated?',
    check(answers) {
      if (answers.cioms_complete === false || answers.cioms_complete === 'no') {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'The CIOMS I form for this case is missing one or more required data fields.',
          'CIOMS I requires complete population of all mandatory fields including patient identifiers, suspect drug information, reaction details, and reporter information.',
          'CIOMS I Form Requirements; ICH E2A Section IV; ICH E2B(R3) Section 2',
          'Complete all mandatory CIOMS I fields: patient initials/identifier, age, sex, suspect drug details (name, dose, dates), reaction (onset, description, outcome), and reporter details. Submit an amended report.',
          ['cioms_complete', 'reporting_form_type'],
        );
      }
      return null;
    },
  },
  {
    id: rid('e2b_fields_missing'),
    dimension: 'regulatory_alignment',
    title: 'E2B(R3) Required Fields Not Populated',
    question: 'The electronic case safety report is missing mandatory E2B(R3) data elements. This will result in automatic rejection by EudraVigilance and FAERS. Can the sponsor confirm that all minimum reporting criteria are met?',
    check(answers) {
      if (isBlank(answers.e2b_completeness) || answers.e2b_completeness === 'incomplete') {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'One or more mandatory E2B(R3) data elements are missing from the electronic case safety report.',
          'ICH E2B(R3) defines minimum reporting criteria (Section 2.1) that must be met for valid ICSR submission to global pharmacovigilance databases.',
          'ICH E2B(R3) Section 2.1; ICH E2D Section III.A; EMA/FAERS Technical Specifications',
          'Run an E2B(R3) validation check against the case. Populate all mandatory fields including: identifiable patient, identifiable reporter, suspect drug, and adverse reaction. Ensure ICSR header and administrative information are complete.',
          ['e2b_completeness', 'icsr_fields'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_seriousness_criteria'),
    dimension: 'regulatory_alignment',
    title: 'Seriousness Criteria Not Documented',
    question: 'The narrative describes a serious adverse event but does not explicitly state which seriousness criterion is met (death, life-threatening, hospitalization, disability, congenital anomaly, or medically important). How was the seriousness determination made?',
    check(answers) {
      const isSerious = answers.is_serious === true || answers.is_serious === 'yes';
      if (isSerious && isBlank(answers.seriousness_criteria)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'The event is classified as serious but no specific seriousness criterion (per ICH E2A) is documented in the narrative.',
          'ICH E2A Section II defines seriousness criteria. Each SAE narrative must explicitly state which criterion was met for regulatory categorization.',
          'ICH E2A Section II; ICH E2B(R3) Section 2.12.1; 21 CFR 312.32(a)',
          'Explicitly document the applicable seriousness criterion: results in death, is life-threatening, requires inpatient hospitalization or prolongation of existing hospitalization, results in persistent or significant disability/incapacity, is a congenital anomaly/birth defect, or is a medically important event.',
          ['seriousness_criteria', 'is_serious', 'event_outcome'],
        );
      }
      return null;
    },
  },

  /* ========== SCIENTIFIC RIGOR (4 rules) ========== */
  {
    id: rid('no_causality_assessment'),
    dimension: 'scientific_rigor',
    title: 'No Causality Assessment Provided',
    question: 'The narrative lacks a formal causality assessment using an accepted methodology (e.g., WHO-UMC, Naranjo scale). Without this, how does the sponsor expect the Agency to evaluate the drug-event relationship?',
    check(answers) {
      if (isBlank(answers.causality_assessment)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No formal causality assessment (e.g., WHO-UMC criteria, Naranjo algorithm) is documented in the safety narrative.',
          'ICH E2A Section III.B requires an assessment of the causal relationship between the drug and the event. WHO-UMC or Naranjo algorithms provide standardized assessment frameworks.',
          'ICH E2A Section III.B; WHO-UMC Causality Categories; ICH E2B(R3) Section 2.12.4',
          'Include a formal causality assessment using a validated algorithm (WHO-UMC preferred). Document the assessment criteria: temporal relationship, dechallenge/rechallenge, confounders, and biological plausibility.',
          ['causality_assessment', 'causality_method'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_dechallenge_rechallenge'),
    dimension: 'scientific_rigor',
    title: 'Dechallenge/Rechallenge Information Absent',
    question: 'The narrative does not report whether the event resolved upon drug discontinuation (dechallenge) or recurred upon re-exposure (rechallenge). This is among the strongest evidence for causality. Why is this information missing?',
    check(answers) {
      if (isBlank(answers.dechallenge_result) && isBlank(answers.rechallenge_result)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'Neither dechallenge nor rechallenge information is provided in the safety narrative.',
          'ICH E2A Section III.B.a identifies dechallenge and rechallenge as critical elements for causality assessment. ICH E2B(R3) Section 2.12.5 requires this data when available.',
          'ICH E2A Section III.B.a; ICH E2B(R3) Section 2.12.5; WHO-UMC Causality Assessment',
          'Document the dechallenge result (did the event resolve or improve after drug discontinuation?) and, if applicable, rechallenge result (did the event recur upon re-exposure?). If drug was not discontinued, state this explicitly.',
          ['dechallenge_result', 'rechallenge_result', 'drug_action_taken'],
        );
      }
      return null;
    },
  },
  {
    id: rid('alternative_etiologies_not_explored'),
    dimension: 'scientific_rigor',
    title: 'Alternative Etiologies Not Explored',
    question: 'The narrative attributes the event to the investigational product without exploring alternative etiologies. Has the sponsor considered underlying disease progression, concomitant medications, or intercurrent illness as potential causes?',
    check(answers) {
      if (isBlank(answers.alternative_etiologies)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'Alternative etiologies (e.g., underlying disease, concomitant medications, intercurrent illness) are not discussed in the narrative.',
          'ICH E2A Section III.B requires consideration of alternative explanations as part of a thorough causality evaluation. CIOMS VI emphasizes differential diagnosis in individual case assessment.',
          'ICH E2A Section III.B; CIOMS VI Section 3.3; ICH E2D Section II.C',
          'Discuss and systematically evaluate alternative etiologies including: underlying disease progression, concomitant drug effects, intercurrent illness, pre-existing conditions, procedural complications, and natural history of the condition.',
          ['alternative_etiologies', 'medical_history', 'concomitant_medications'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_biological_plausibility'),
    dimension: 'scientific_rigor',
    title: 'Biological Plausibility Not Addressed',
    question: 'The narrative does not discuss whether a biological mechanism supports the drug-event relationship. Is there pharmacological, toxicological, or clinical precedent linking this drug class to the observed adverse event?',
    check(answers) {
      if (isBlank(answers.biological_plausibility)) {
        return finding(
          this.id,
          this.dimension,
          'info',
          this.title,
          this.question,
          'No discussion of biological plausibility or pharmacological mechanism linking the investigational product to the adverse event is provided.',
          'ICH E2A Section III.B includes biological plausibility as a factor in causality assessment. CIOMS VI recommends considering known pharmacology and class effects.',
          'ICH E2A Section III.B; CIOMS VI Section 3.3; ICH E2D Section II.C',
          'Include a brief discussion of biological plausibility based on the drug\'s mechanism of action, known pharmacology, class effects, and any preclinical toxicology findings that may explain the observed event.',
          ['biological_plausibility', 'mechanism_of_action'],
        );
      }
      return null;
    },
  },

  /* ========== PRACTICAL FEASIBILITY (4 rules) ========== */
  {
    id: rid('unblinding_not_documented'),
    dimension: 'practical_feasibility',
    title: 'Unblinding Procedure Not Documented',
    question: 'The narrative describes an SAE in a blinded study but does not document whether unblinding occurred or the procedure followed. Was the blind broken, and if so, was the emergency unblinding procedure properly followed?',
    check(answers) {
      const isBlinded = String(answers.study_blinding ?? '').toLowerCase();
      const isSerious = answers.is_serious === true || answers.is_serious === 'yes';
      if (
        isSerious &&
        (isBlinded.includes('double') || isBlinded.includes('single') || isBlinded.includes('blind')) &&
        isBlank(answers.unblinding_documented)
      ) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'An SAE occurred in a blinded study but the narrative does not document whether unblinding was performed or the procedure followed.',
          'ICH E6(R2) Section 6.4.10 requires pre-specified procedures for emergency unblinding. ICH E2A Section IV.A requires unblinding for SUSAR determination.',
          'ICH E6(R2) Section 6.4.10; ICH E2A Section IV.A; 21 CFR 312.32(c)(1)(iv)',
          'Document whether unblinding occurred, who authorized it, the date, and the treatment assignment revealed. If unblinding was not performed, state the rationale and how SUSAR determination was made without unblinding.',
          ['unblinding_documented', 'study_blinding', 'is_serious'],
        );
      }
      return null;
    },
  },
  {
    id: rid('expedited_reporting_at_risk'),
    dimension: 'practical_feasibility',
    title: 'Expedited Reporting Timeline at Risk',
    question: 'Based on the event awareness date and current processing status, this SUSAR may not meet the expedited reporting deadline. What measures are in place to ensure timely submission to all applicable regulatory authorities?',
    check(answers) {
      const daysProcessing = numericVal(answers.days_in_processing);
      const isSusar = answers.is_susar === true || answers.is_susar === 'yes';
      if (isSusar && daysProcessing !== null && daysProcessing > 10) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          `SUSAR has been in processing for ${daysProcessing} days, putting the 15-day expedited reporting timeline at serious risk.`,
          'ICH E2A Section IV.A mandates 15-day reporting for SUSARs (7 days for fatal/life-threatening). Internal processing should target completion well within this window.',
          'ICH E2A Section IV.A; 21 CFR 312.32(c)(1); ICH E2D Section III',
          'Escalate to pharmacovigilance leadership immediately. Implement a fast-track review process. If the deadline will be missed, prepare a late submission notification with root-cause explanation.',
          ['days_in_processing', 'is_susar', 'reporting_date'],
        );
      }
      return null;
    },
  },
  {
    id: rid('follow_up_incomplete'),
    dimension: 'practical_feasibility',
    title: 'Patient Follow-Up Incomplete',
    question: 'The narrative describes an unresolved or ongoing event but no follow-up information has been obtained. Without adequate follow-up, the final event outcome and any sequelae remain unknown. What efforts have been made to obtain follow-up?',
    check(answers) {
      const outcome = String(answers.event_outcome ?? '').toLowerCase();
      if (
        (outcome.includes('ongoing') || outcome.includes('unresolved') || outcome.includes('not recovered') || outcome.includes('unknown')) &&
        isBlank(answers.follow_up_obtained)
      ) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'The event outcome is unresolved or ongoing but no follow-up information has been documented.',
          'ICH E2D Section III.B requires sponsors to make reasonable efforts to obtain follow-up information on serious cases. ICH E2B(R3) requires follow-up reports.',
          'ICH E2D Section III.B; ICH E2B(R3) Section 1.8; 21 CFR 312.32(d)(2)',
          'Initiate site contact to obtain follow-up. Document all attempts to obtain follow-up information, including dates and methods of contact. Submit a follow-up ICSR when additional information becomes available.',
          ['follow_up_obtained', 'event_outcome', 'follow_up_attempts'],
        );
      }
      return null;
    },
  },
  {
    id: rid('late_awareness_date'),
    dimension: 'practical_feasibility',
    title: 'Delayed Sponsor Awareness of SAE',
    question: 'There is a significant delay between the event occurrence at the site and the sponsor\'s awareness date. This delay compresses the regulatory reporting window and may indicate systemic site-reporting deficiencies. What is the root cause?',
    check(answers) {
      const daysToAwareness = numericVal(answers.days_site_to_sponsor);
      if (daysToAwareness !== null && daysToAwareness > 5) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          `Sponsor became aware of the SAE ${daysToAwareness} days after site awareness, creating a compressed reporting timeline.`,
          'ICH E6(R2) Section 4.11.1 requires investigators to report SAEs to the sponsor within 24 hours. Delays in sponsor awareness compromise regulatory reporting compliance.',
          'ICH E6(R2) Section 4.11.1; 21 CFR 312.64(b); ICH E2A Section IV',
          'Investigate the site-level cause of reporting delay. Retrain site personnel on SAE reporting timelines. Consider implementing electronic SAE reporting to reduce notification lag.',
          ['days_site_to_sponsor', 'site_awareness_date', 'sponsor_awareness_date'],
        );
      }
      return null;
    },
  },

  /* ========== DOCUMENTATION (4 rules) ========== */
  {
    id: rid('no_source_document_verification'),
    dimension: 'documentation',
    title: 'Source Document Verification Not Performed',
    question: 'The safety narrative has not been verified against source documents (hospital records, laboratory reports, discharge summaries). How can the Agency rely on the accuracy of this narrative without source data verification?',
    check(answers) {
      if (isBlank(answers.source_verified) || answers.source_verified === false || answers.source_verified === 'no') {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'Source document verification has not been performed or documented for this safety narrative.',
          'ICH E6(R2) Section 5.18.4(e) requires verification of individual SAE narratives against source data. This is a fundamental GCP requirement.',
          'ICH E6(R2) Section 5.18.4(e); ICH E6(R2) Section 6.4.9; 21 CFR 312.58',
          'Perform and document source data verification (SDV) against hospital records, lab reports, imaging studies, and other primary medical records. Flag any discrepancies for resolution.',
          ['source_verified', 'source_documents_available'],
        );
      }
      return null;
    },
  },
  {
    id: rid('investigator_signature_missing'),
    dimension: 'documentation',
    title: 'Investigator Signature Missing',
    question: 'The narrative and SAE report lack the principal investigator\'s signature or attestation. Under GCP, the investigator is responsible for the accuracy of all data submitted from the site. How does the sponsor verify investigator review?',
    check(answers) {
      if (isBlank(answers.investigator_signed) || answers.investigator_signed === false || answers.investigator_signed === 'no') {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'The investigator has not signed or attested to the accuracy of the SAE report and narrative.',
          'ICH E6(R2) Section 4.5.1 requires the investigator to ensure the accuracy, completeness, and timeliness of data reported to the sponsor.',
          'ICH E6(R2) Section 4.5.1; 21 CFR 312.62(b); 21 CFR 312.64',
          'Obtain the principal investigator\'s signature or electronic attestation on the SAE report. Implement a workflow that requires investigator sign-off before narrative finalization.',
          ['investigator_signed', 'investigator_name'],
        );
      }
      return null;
    },
  },
  {
    id: rid('regulatory_notification_gaps'),
    dimension: 'documentation',
    title: 'Regulatory Authority Notification Gaps',
    question: 'The documentation does not confirm that all applicable regulatory authorities and IRBs/ECs have been notified of this serious adverse event. Can the sponsor provide evidence of complete regulatory notification?',
    check(answers) {
      if (isBlank(answers.regulatory_notifications_complete) || answers.regulatory_notifications_complete === false || answers.regulatory_notifications_complete === 'no') {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Documentation does not confirm notification of all applicable regulatory authorities and IRBs/Ethics Committees.',
          'ICH E2A Section IV.B requires notification to all regulatory authorities where the IND/CTA is active. ICH E6(R2) Section 4.11.1 requires investigator notification to the IRB/EC.',
          'ICH E2A Section IV.B; ICH E6(R2) Section 4.11.1; 21 CFR 312.32(c)(1); 21 CFR 312.66',
          'Verify and document that all applicable regulatory authorities (FDA, EMA, Health Canada, etc.) and all IRBs/ECs at participating sites have been notified per local requirements. Maintain a notification log.',
          ['regulatory_notifications_complete', 'authorities_notified'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_narrative_version_control'),
    dimension: 'documentation',
    title: 'Narrative Version Control Absent',
    question: 'The safety narrative lacks version control information. Without version tracking, it is impossible to determine whether this is the initial report or a follow-up, and what information was added or modified. How does the sponsor maintain narrative audit trails?',
    check(answers) {
      if (isBlank(answers.narrative_version)) {
        return finding(
          this.id,
          this.dimension,
          'info',
          this.title,
          this.question,
          'No version number, revision date, or change history is documented for the safety narrative.',
          'ICH E2B(R3) Section 1.8 requires identification of initial and follow-up reports. Good pharmacovigilance practice requires version control for all safety documents.',
          'ICH E2B(R3) Section 1.8; ICH E2D Section III.B; GVP Module VI',
          'Implement version control for all safety narratives, including version number, date of revision, author, and a change log summarizing modifications from the prior version.',
          ['narrative_version', 'report_type'],
        );
      }
      return null;
    },
  },

  /* ========== RISK IDENTIFICATION (4 rules) ========== */
  {
    id: rid('potential_signal_not_flagged'),
    dimension: 'risk_identification',
    title: 'Potential Safety Signal Not Flagged',
    question: 'The event described in this narrative may represent an emerging safety signal based on its nature, severity, or frequency. Has the sponsor evaluated this case in the context of cumulative safety data to determine if signal detection activities are warranted?',
    check(answers) {
      if (answers.signal_evaluated === false || answers.signal_evaluated === 'no' || isBlank(answers.signal_evaluated)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No evidence that this case was evaluated in the context of cumulative safety data for potential safety signal identification.',
          'ICH E2E Section IV requires ongoing signal detection and evaluation throughout clinical development. CIOMS VI outlines best practices for signal identification from individual case reports.',
          'ICH E2E Section IV; CIOMS VI Section 4; ICH E2D Section II.B',
          'Evaluate this case against the cumulative safety database using established signal detection methods (e.g., disproportionality analysis). If a signal is identified, initiate signal evaluation per the pharmacovigilance plan.',
          ['signal_evaluated', 'similar_cases_count'],
        );
      }
      return null;
    },
  },
  {
    id: rid('aggregate_analysis_not_referenced'),
    dimension: 'risk_identification',
    title: 'Aggregate Safety Analysis Not Referenced',
    question: 'This narrative describes a serious event but does not reference aggregate safety data or line listings. Is this event consistent with the known safety profile, or does it represent a new finding? The reviewer cannot determine this without aggregate context.',
    check(answers) {
      const isSerious = answers.is_serious === true || answers.is_serious === 'yes';
      if (isSerious && isBlank(answers.aggregate_analysis_referenced)) {
        return finding(
          this.id,
          this.dimension,
          'info',
          this.title,
          this.question,
          'A serious event narrative does not reference or contextualize the event within aggregate safety data or cumulative line listings.',
          'ICH E3 Section 12.2.2 requires that individual serious case narratives be interpretable in the context of the overall safety summary. ICH E2E recommends ongoing aggregate review.',
          'ICH E3 Section 12.2.2; ICH E2E Section III; CIOMS VI Section 2',
          'Include a brief reference to the cumulative incidence of similar events in the study population. Note whether this event is consistent with the known safety profile or represents a potentially new finding.',
          ['aggregate_analysis_referenced', 'similar_cases_count', 'is_serious'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_pbrer_dsur_crossref'),
    dimension: 'risk_identification',
    title: 'No PBRER/DSUR Cross-Reference',
    question: 'The narrative does not cross-reference the most recent Periodic Benefit-Risk Evaluation Report (PBRER) or Development Safety Update Report (DSUR). Has this event been incorporated into the periodic safety analysis?',
    check(answers) {
      if (isBlank(answers.pbrer_dsur_referenced)) {
        return finding(
          this.id,
          this.dimension,
          'info',
          this.title,
          this.question,
          'No cross-reference to the PBRER or DSUR is included in the safety narrative, preventing reviewers from assessing integration of this case into periodic safety evaluations.',
          'ICH E2F (DSUR) and ICH E2C(R2) (PBRER) require that individual serious cases be integrated into periodic safety assessments. Cross-referencing ensures continuity of safety evaluation.',
          'ICH E2F Section 3; ICH E2C(R2) Section 2; ICH E2E Section V',
          'Include a cross-reference to the most recent DSUR (during development) or PBRER (post-authorization) that incorporates this case. Note the relevant data lock point and report period.',
          ['pbrer_dsur_referenced', 'dsur_period', 'pbrer_period'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_risk_mitigation_proposed'),
    dimension: 'risk_identification',
    title: 'No Risk Mitigation Measures Proposed',
    question: 'Given the severity of this event, the narrative does not propose any risk mitigation measures such as protocol amendments, informed consent updates, or enhanced monitoring. What actions does the sponsor intend to take to protect remaining study participants?',
    check(answers) {
      const severity = String(answers.event_severity ?? '').toLowerCase();
      const isSerious = answers.is_serious === true || answers.is_serious === 'yes';
      if (
        (isSerious || severity.includes('severe') || severity.includes('life') || severity.includes('grade 4') || severity.includes('grade 5')) &&
        isBlank(answers.risk_mitigation_proposed)
      ) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'A severe or serious event is described without any proposed risk mitigation measures for ongoing or future study participants.',
          'ICH E2E Section V and ICH E6(R2) Section 5.17.1 require sponsors to implement risk mitigation actions when safety findings warrant. 21 CFR 312.32(d) requires IND safety report follow-up actions.',
          'ICH E2E Section V; ICH E6(R2) Section 5.17.1; 21 CFR 312.32(d); ICH E2D Section IV',
          'Evaluate whether risk mitigation is warranted: protocol amendment (e.g., additional exclusion criteria, enhanced monitoring), informed consent revision, Investigator Brochure update, REMS modification, or study suspension. Document the rationale for the chosen course of action.',
          ['risk_mitigation_proposed', 'event_severity', 'is_serious'],
        );
      }
      return null;
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Factory                                                           */
/* ------------------------------------------------------------------ */

export function createSafetyNarrativeAuditor(): WarGameAuditor {
  return {
    category: 'safety_narrative',
    name: 'FDA Safety Narrative Reviewer',
    description:
      'Simulates an FDA safety reviewer performing scrutiny of patient safety narratives ' +
      'per ICH E3 Section 12.3 and ICH E2A, evaluating completeness of patient information, ' +
      'consistency with CRF and tabulated data, regulatory compliance for expedited reporting, ' +
      'scientific rigor of causality assessments, practical feasibility of pharmacovigilance processes, ' +
      'documentation quality, and safety signal risk identification.',
    rules,
  };
}
