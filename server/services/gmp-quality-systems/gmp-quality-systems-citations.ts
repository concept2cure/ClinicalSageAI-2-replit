/**
 * GMP Quality Systems & Data Integrity — Citation Registry
 * ────────────────────────────────────────────────────────
 *
 * Central, citation-backed registry for the deterministic GMP quality-systems
 * knowledge engine (`gmp-quality-systems-knowledge.ts`). Every engine in the
 * sibling module pulls its citations from here so that wording stays
 * consistent and attributable. Same purity contract as the engine itself:
 * NO LLM, NO network, NO database — a pure lookup table with deterministic
 * accessors.
 *
 * @module server/services/gmp-quality-systems/gmp-quality-systems-citations
 */

/** A single regulatory citation with source, locator, and the relevant text. */
export interface Citation {
  /** Short source key, e.g. "ICH Q7", "21 CFR 211", "EU GMP Annex 1". */
  source: string;
  /** Section / clause / paragraph locator within the source. */
  locator: string;
  /** Plain-language statement of the requirement (paraphrased, attributable). */
  text: string;
}

/**
 * Central citation registry. Every engine pulls its citations from here so
 * that wording stays consistent and attributable. Keys are stable identifiers.
 */
interface CitationEntry {
  key: string;
  source: string;
  locator: string;
  text: string;
}

const CITATION_REGISTRY: CitationEntry[] = [
  // ── ICH Q7 (API GMP) ──────────────────────────────────────────────────────
  {
    key: 'q7_intro_gmp_increases',
    source: 'ICH Q7',
    locator: 'Section 1.3 / Table 1',
    text:
      'GMP should be applied with increasing stringency as the API manufacturing ' +
      'process proceeds from early intermediate steps to final API and packaging. ' +
      'The point at which the API starting material is introduced into the process ' +
      'marks the beginning of full GMP coverage.',
  },
  {
    key: 'q7_table1',
    source: 'ICH Q7',
    locator: 'Section 1.3, Table 1 (Application of this Guide)',
    text:
      'Table 1 maps increasing GMP requirements across step types: production of API ' +
      'starting material, introduction of API starting material, production of ' +
      'intermediates, isolation and purification, and physical processing and packaging.',
  },
  {
    key: 'q7_change_control',
    source: 'ICH Q7',
    locator: 'Section 13 (Change Control)',
    text:
      'A formal change control system should evaluate all changes that may affect the ' +
      'production and control of the intermediate or API. Changes are classified by ' +
      'nature and extent, and by their potential impact on quality; significant changes ' +
      'may require revalidation and regulatory notification/approval.',
  },
  {
    key: 'q7_process_validation',
    source: 'ICH Q7',
    locator: 'Section 12 (Validation)',
    text:
      'Critical process parameters and in-process controls should be established and ' +
      'validated. Process validation should confirm that the process, operated within ' +
      'established parameters, consistently produces an API meeting its predetermined ' +
      'quality attributes.',
  },
  {
    key: 'q7_critical_steps',
    source: 'ICH Q7',
    locator: 'Section 8.3 / 12.1',
    text:
      'Critical process steps and critical process parameters should be identified ' +
      'during development or from historical data, and controlled and monitored during ' +
      'process validation and routine production.',
  },
  {
    key: 'q7_quality_unit',
    source: 'ICH Q7',
    locator: 'Section 2.2 (Responsibilities of the Quality Unit)',
    text:
      'The quality unit(s) should be independent of production and fulfil both quality ' +
      'assurance and quality control responsibilities, including review and approval of ' +
      'all quality-related documents and release/rejection of intermediates and APIs.',
  },
  // ── ICH Q9(R1) (Quality Risk Management) ──────────────────────────────────
  {
    key: 'q9_principles',
    source: 'ICH Q9(R1)',
    locator: 'Section 4 (Principles of QRM)',
    text:
      'Quality risk management is a systematic process for the assessment, control, ' +
      'communication, and review of risks to quality. The level of effort, formality, ' +
      'and documentation should be commensurate with the level of risk.',
  },
  {
    key: 'q9_tools',
    source: 'ICH Q9(R1)',
    locator: 'Annex I (Risk Management Methods and Tools)',
    text:
      'Recognized QRM tools include FMEA, FMECA, FTA, HACCP, HAZOP, PHA, and risk ' +
      'ranking and filtering. Tool selection should match the complexity of the problem ' +
      'and the decision being supported.',
  },
  {
    key: 'q9_subjectivity',
    source: 'ICH Q9(R1)',
    locator: 'Section 5.1 (Revision 1 additions on subjectivity)',
    text:
      'Subjectivity is inherent in risk assessment; it should be controlled by clearly ' +
      'defined scoring scales, diverse and knowledgeable teams, and documented assumptions ' +
      'so that risk-based decisions are reproducible and defensible.',
  },
  {
    key: 'q9_formality',
    source: 'ICH Q9(R1)',
    locator: 'Section 5.2 (Formality in QRM)',
    text:
      'The degree of formality of QRM should be proportionate to risk: higher uncertainty, ' +
      'higher severity, and higher complexity justify a more formal, documented approach.',
  },
  // ── ICH Q10 (Pharmaceutical Quality System) ───────────────────────────────
  {
    key: 'q10_capa',
    source: 'ICH Q10',
    locator: 'Section 3.2.2 (Corrective Action and Preventive Action System)',
    text:
      'The company should have a CAPA system resulting from investigation of complaints, ' +
      'product rejections, nonconformances, recalls, deviations, audits, inspections, and ' +
      'trends. A structured root-cause analysis approach should be used; the level of ' +
      'effort should be commensurate with the level of risk.',
  },
  {
    key: 'q10_effectiveness',
    source: 'ICH Q10',
    locator: 'Section 3.2.2 (CAPA effectiveness)',
    text:
      'The effectiveness of corrective and preventive actions should be evaluated and ' +
      'verified. Actions should not be closed until effectiveness has been confirmed.',
  },
  {
    key: 'q10_change_mgmt',
    source: 'ICH Q10',
    locator: 'Section 3.2.3 (Change Management System)',
    text:
      'A change management system ensures that changes are evaluated, approved, and ' +
      'implemented in a controlled manner using quality risk management, with appropriate ' +
      'expertise and an assessment of impact on the control strategy.',
  },
  {
    key: 'q10_pqs',
    source: 'ICH Q10',
    locator: 'Section 1.5 (Pharmaceutical Quality System elements)',
    text:
      'The PQS comprises a process performance and product quality monitoring system, a ' +
      'CAPA system, a change management system, and management review of process ' +
      'performance and product quality across the product lifecycle.',
  },
  {
    key: 'q10_knowledge',
    source: 'ICH Q10',
    locator: 'Section 1.6 (Knowledge Management & QRM enablers)',
    text:
      'Knowledge management and quality risk management are enablers of the PQS that ' +
      'support science- and risk-based decisions about product and process.',
  },
  // ── 21 CFR 210/211 ────────────────────────────────────────────────────────
  {
    key: 'cfr211_22',
    source: '21 CFR 211',
    locator: '§ 211.22 (Responsibilities of quality control unit)',
    text:
      'There shall be a quality control unit with responsibility and authority to approve ' +
      'or reject all components, drug product containers, closures, in-process materials, ' +
      'packaging materials, labeling, and drug products, and to review production records.',
  },
  {
    key: 'cfr211_100',
    source: '21 CFR 211',
    locator: '§ 211.100 (Written procedures; deviations)',
    text:
      'There shall be written procedures for production and process control; any deviation ' +
      'from the written procedures shall be recorded and justified.',
  },
  {
    key: 'cfr211_192',
    source: '21 CFR 211',
    locator: '§ 211.192 (Production record review)',
    text:
      'Any unexplained discrepancy or failure of a batch or any of its components to meet ' +
      'specifications shall be thoroughly investigated, whether or not the batch has been ' +
      'distributed; the investigation shall extend to other batches that may be associated.',
  },
  {
    key: 'cfr211_180e',
    source: '21 CFR 211',
    locator: '§ 211.180(e) (Records and reports / annual review)',
    text:
      'Records shall be maintained so that data can be reviewed at least annually to ' +
      'evaluate quality standards and determine the need for changes in specifications or ' +
      'manufacturing/control procedures.',
  },
  {
    key: 'cfr211_68',
    source: '21 CFR 211',
    locator: '§ 211.68 (Automatic, mechanical, and electronic equipment)',
    text:
      'Automated equipment shall be routinely calibrated, inspected, and checked; controls ' +
      'shall ensure changes are made only by authorized personnel, and backup or ' +
      'verification of data is required to assure accuracy and reliability.',
  },
  {
    key: 'cfr211_194',
    source: '21 CFR 211',
    locator: '§ 211.194 (Laboratory records)',
    text:
      'Laboratory records shall include complete data derived from all tests, including ' +
      'graphs, charts, and spectra, suitably identified to show the specific component, ' +
      'in-process material, or product and lot tested.',
  },
  {
    key: 'cfr211_198',
    source: '21 CFR 211',
    locator: '§ 211.198 (Complaint files)',
    text:
      'Written procedures describing the handling of all written and oral complaints shall ' +
      'be established and followed, including a determination of whether the complaint ' +
      'represents a serious and unexpected adverse event reportable to FDA.',
  },
  {
    key: 'cfr211_165',
    source: '21 CFR 211',
    locator: '§ 211.165 (Testing and release for distribution)',
    text:
      'For each batch of drug product, appropriate laboratory determination of satisfactory ' +
      'conformance to final specifications, including identity and strength of active ' +
      'ingredients, shall be made before release.',
  },
  // ── 21 CFR Part 11 ────────────────────────────────────────────────────────
  {
    key: 'part11_10a',
    source: '21 CFR Part 11',
    locator: '§ 11.10(a) (Validation)',
    text:
      'Persons who use closed systems to create, modify, maintain, or transmit electronic ' +
      'records shall validate systems to ensure accuracy, reliability, consistent intended ' +
      'performance, and the ability to discern invalid or altered records.',
  },
  {
    key: 'part11_10e',
    source: '21 CFR Part 11',
    locator: '§ 11.10(e) (Audit trails)',
    text:
      'Use of secure, computer-generated, time-stamped audit trails to independently record ' +
      'the date and time of operator entries and actions that create, modify, or delete ' +
      'electronic records. Record changes shall not obscure previously recorded information.',
  },
  {
    key: 'part11_10d',
    source: '21 CFR Part 11',
    locator: '§ 11.10(d) (Access controls)',
    text:
      'Limiting system access to authorized individuals.',
  },
  {
    key: 'part11_10g',
    source: '21 CFR Part 11',
    locator: '§ 11.10(g) (Authority checks)',
    text:
      'Use of authority checks to ensure that only authorized individuals can use the ' +
      'system, electronically sign a record, access the operation, or alter a record.',
  },
  {
    key: 'part11_50',
    source: '21 CFR Part 11',
    locator: '§ 11.50 (Signature manifestations)',
    text:
      'Signed electronic records shall contain the printed name of the signer, the date and ' +
      'time of signing, and the meaning (such as review, approval, responsibility, or ' +
      'authorship) associated with the signature.',
  },
  {
    key: 'part11_70',
    source: '21 CFR Part 11',
    locator: '§ 11.70 (Signature/record linking)',
    text:
      'Electronic signatures and handwritten signatures executed to electronic records ' +
      'shall be linked to their respective records so that they cannot be excised, copied, ' +
      'or otherwise transferred to falsify an electronic record.',
  },
  {
    key: 'part11_200',
    source: '21 CFR Part 11',
    locator: '§ 11.200 (Electronic signature components and controls)',
    text:
      'Electronic signatures not based on biometrics shall employ at least two distinct ' +
      'identification components such as an identification code and password, and shall be ' +
      'used only by their genuine owners.',
  },
  {
    key: 'part11_scope_2003',
    source: 'FDA Part 11 Scope & Application Guidance (2003)',
    locator: 'Section III (Narrow interpretation; predicate rules)',
    text:
      'Part 11 applies to records required by predicate rules that are maintained or ' +
      'submitted in electronic form. A risk-based approach should determine the extent of ' +
      'validation, audit trail, and record-retention controls for a given record.',
  },
  // ── FDA Data Integrity Guidance (2018) ────────────────────────────────────
  {
    key: 'fda_di_alcoa',
    source: 'FDA Data Integrity Guidance (2018)',
    locator: 'Q1 / Q3 (definitions)',
    text:
      'Data integrity refers to the completeness, consistency, and accuracy of data. ' +
      'Complete, consistent, and accurate data should be attributable, legible, ' +
      'contemporaneously recorded, original or a true copy, and accurate (ALCOA).',
  },
  {
    key: 'fda_di_audit_trail',
    source: 'FDA Data Integrity Guidance (2018)',
    locator: 'Q7 (audit trail review)',
    text:
      'Audit trails that capture changes to critical data should be reviewed with each ' +
      'record and before final approval of the record (e.g., with batch release). ' +
      'Routine review of audit trails should be based on the criticality of the data.',
  },
  {
    key: 'fda_di_shared_login',
    source: 'FDA Data Integrity Guidance (2018)',
    locator: 'Q8 / Q9 (system access)',
    text:
      'Shared login accounts that prevent attribution of actions to individuals are not ' +
      'acceptable for systems generating CGMP records; each user should have a unique ' +
      'account and appropriate access controls.',
  },
  {
    key: 'fda_di_static_dynamic',
    source: 'FDA Data Integrity Guidance (2018)',
    locator: 'Q2 (static vs dynamic records)',
    text:
      'A static record format, such as a paper or PDF, is fixed. A dynamic record format ' +
      'allows interaction between the user and the record content (e.g., reprocessing of ' +
      'chromatographic data); original dynamic records must be retained in dynamic form.',
  },
  // ── MHRA GxP Data Integrity Guidance (2018) ───────────────────────────────
  {
    key: 'mhra_alcoa_plus',
    source: 'MHRA GxP Data Integrity Guidance (2018)',
    locator: 'Section 6.3 (ALCOA principles)',
    text:
      'Data should be Attributable, Legible, Contemporaneous, Original, and Accurate ' +
      '(ALCOA); the additional attributes Complete, Consistent, Enduring, and Available ' +
      '(ALCOA+) further emphasise expectations for record integrity.',
  },
  {
    key: 'mhra_data_criticality',
    source: 'MHRA GxP Data Integrity Guidance (2018)',
    locator: 'Section 4 (Data criticality and risk)',
    text:
      'Controls should be designed using data criticality and the inherent integrity risk ' +
      'of the process. Criticality is judged by the impact of the data on product quality ' +
      'and patient safety and on the decision it supports.',
  },
  {
    key: 'mhra_data_lifecycle',
    source: 'MHRA GxP Data Integrity Guidance (2018)',
    locator: 'Section 5 (Data governance / lifecycle)',
    text:
      'Data governance should address data ownership throughout the lifecycle: generation, ' +
      'processing, reporting, checking, decision making, retention, retrieval, and ' +
      'destruction or archival of data.',
  },
  // ── PIC/S PI 041 ──────────────────────────────────────────────────────────
  {
    key: 'pics_pi041_governance',
    source: 'PIC/S PI 041-1 (2021)',
    locator: 'Section 5 (Data governance system)',
    text:
      'A data governance system should ensure controls over the data lifecycle commensurate ' +
      'with the principles of quality risk management. It includes organisational measures ' +
      '(procedures, training, culture) and technical measures (system design, audit trails).',
  },
  {
    key: 'pics_pi041_maturity',
    source: 'PIC/S PI 041-1 (2021)',
    locator: 'Section 5.4 (Data integrity maturity)',
    text:
      'Reliance on paper-based and hybrid records, manual transcription, and weak access ' +
      'controls increases data integrity risk; greater use of validated, configured ' +
      'computerised systems with automated audit trails reduces it.',
  },
  // ── EU GMP Annex 11 ───────────────────────────────────────────────────────
  {
    key: 'annex11_validation',
    source: 'EU GMP Annex 11',
    locator: 'Clause 4 (Validation)',
    text:
      'Computerised systems should be validated; the validation documentation and reports ' +
      'should cover the relevant lifecycle steps, and risk assessment should justify the ' +
      'extent of validation and data integrity controls.',
  },
  {
    key: 'annex11_audit_trail',
    source: 'EU GMP Annex 11',
    locator: 'Clause 9 (Audit Trails)',
    text:
      'Consideration should be given, based on a risk assessment, to building into the ' +
      'system the creation of a record of all GMP-relevant changes and deletions (a ' +
      'system-generated audit trail) that is available, convertible to a legible form, and ' +
      'regularly reviewed.',
  },
  {
    key: 'annex11_esig',
    source: 'EU GMP Annex 11',
    locator: 'Clause 14 (Electronic Signatures)',
    text:
      'Electronic records may be signed electronically; electronic signatures are expected ' +
      'to be permanently linked to their respective record, include the time and date, and ' +
      'have the same impact as hand-written signatures within the boundaries of the company.',
  },
  // ── EU GMP Annex 1 (2022) ─────────────────────────────────────────────────
  {
    key: 'annex1_ccs',
    source: 'EU GMP Annex 1 (2022)',
    locator: 'Section 2 (Principle) / Section 2.5 (Contamination Control Strategy)',
    text:
      'A Contamination Control Strategy (CCS) should be implemented across the facility to ' +
      'define all critical control points and assess the effectiveness of all controls ' +
      '(design, procedural, technical, organisational) used to manage risks to medicinal ' +
      'product quality and safety. Quality risk management underpins the CCS.',
  },
  {
    key: 'annex1_grades',
    source: 'EU GMP Annex 1 (2022)',
    locator: 'Section 4 (Cleanroom and clean air equipment qualification)',
    text:
      'Cleanliness grades A, B, C, and D are defined by airborne particulate limits at rest ' +
      'and in operation. Grade A is the critical zone for high-risk operations (e.g. aseptic ' +
      'filling); Grade B is the background for aseptic preparation and filling; Grades C and ' +
      'D are clean areas for less critical stages.',
  },
  {
    key: 'annex1_grade_a_limits',
    source: 'EU GMP Annex 1 (2022)',
    locator: 'Table 1 / Table 5 (particulate and microbial limits)',
    text:
      'Grade A and Grade B at rest both target a maximum of 3 520 particles/m3 ≥0.5 µm. ' +
      'Grade A microbial action limits are effectively zero CFU (no growth); unidirectional ' +
      'airflow with a target velocity of 0.36–0.54 m/s is expected at the working position.',
  },
  {
    key: 'annex1_apsmediafill',
    source: 'EU GMP Annex 1 (2022)',
    locator: 'Section 9.32–9.45 (Aseptic Process Simulation)',
    text:
      'Aseptic process simulations (media fills) should simulate the routine aseptic process ' +
      'and include worst-case activities and interventions. The target is zero contaminated ' +
      'units; any contaminated unit requires investigation. APS should be repeated twice per ' +
      'shift per line per year (semi-annually) per operator, with sufficient fill size.',
  },
  {
    key: 'annex1_sterilisation',
    source: 'EU GMP Annex 1 (2022)',
    locator: 'Section 8 (Sterilisation) / Section 8.3',
    text:
      'Terminal sterilisation by moist heat is the method of choice wherever the product and ' +
      'container can withstand it; a sterility assurance level (SAL) of 10^-6 should be ' +
      'achieved. Where terminal sterilisation is not possible, filtration and/or aseptic ' +
      'processing should be justified following a documented risk assessment.',
  },
  {
    key: 'annex1_emonitoring',
    source: 'EU GMP Annex 1 (2022)',
    locator: 'Section 9 (Environmental & process monitoring)',
    text:
      'An environmental monitoring programme based on QRM should include viable and ' +
      'non-viable particulate monitoring, with continuous viable and total particle ' +
      'monitoring of the Grade A zone during the full duration of critical processing.',
  },
  {
    key: 'annex1_barrier',
    source: 'EU GMP Annex 1 (2022)',
    locator: 'Section 4.18–4.22 (Barrier technologies)',
    text:
      'The use of barrier technologies such as RABS (Restricted Access Barrier Systems) and ' +
      'isolators reduces the need for and risk from human interventions; their selection ' +
      'should be justified in the CCS, and isolators provide higher assurance of separation.',
  },
  // ── GAMP 5 (2nd Ed) ───────────────────────────────────────────────────────
  {
    key: 'gamp5_categories',
    source: 'GAMP 5 (2nd Ed)',
    locator: 'Appendix M4 (Software categories)',
    text:
      'GAMP software categories: Category 1 (infrastructure software), Category 3 ' +
      '(non-configured / off-the-shelf), Category 4 (configured products), and Category 5 ' +
      '(custom / bespoke applications). Category 2 (firmware) was retired in GAMP 5.',
  },
  {
    key: 'gamp5_riskbased',
    source: 'GAMP 5 (2nd Ed)',
    locator: 'Section 5 / Key Concept (Scaled lifecycle activities)',
    text:
      'Validation effort should be scaled to system risk, complexity, and novelty. Higher ' +
      'GAMP category and higher GxP impact justify more rigorous specification, testing, ' +
      'and documentation; supplier assessment and leveraging supplier activity is encouraged.',
  },
  {
    key: 'gamp5_csa',
    source: 'GAMP 5 (2nd Ed) / FDA CSA Draft Guidance (2022)',
    locator: 'Computer Software Assurance concept',
    text:
      'Computer Software Assurance (CSA) is a risk-based, critical-thinking approach that ' +
      'focuses assurance effort on features with direct patient-safety or product-quality ' +
      'impact, favouring unscripted/exploratory testing and leveraging vendor activities ' +
      'for lower-risk, non-direct-impact features to reduce documentation burden.',
  },
  {
    key: 'gamp5_dataintegrity',
    source: 'GAMP 5 (2nd Ed)',
    locator: 'Appendix O / Records and Data Integrity',
    text:
      'Data integrity should be designed into computerised systems through the data ' +
      'lifecycle, with appropriate access control, audit trail, and backup/restore/archival ' +
      'controls verified during validation.',
  },
];

/** Look up a citation by registry key (throws-safe deterministic accessor). */
export function cite(key: string): Citation {
  const entry = CITATION_REGISTRY.find((c: CitationEntry): boolean => c.key === key);
  if (entry === undefined) {
    // Deterministic fallback — should never trigger in practice; keeps the
    // engine total (no throws) so identical input always yields identical output.
    return {
      source: 'unknown',
      locator: key,
      text: 'Citation not found in registry.',
    };
  }
  return { source: entry.source, locator: entry.locator, text: entry.text };
}

/** Build a list of citations from several registry keys. */
export function cites(keys: string[]): Citation[] {
  return keys.map((k: string): Citation => cite(k));
}
