/**
 * CMC Auditor -- simulates FDA reviewer scrutiny of Chemistry, Manufacturing,
 * and Controls (CMC) specifications.
 *
 * Generates adversarial questions across seven audit dimensions, referencing
 * ICH Q1-Q12, Q3A-D, Q5A-E, Q6A/Q6B, M7(R2), FDA Process Validation
 * Guidance (2011), and related FDA/ICH regulatory frameworks.
 *
 * @module server/services/ana/intelligence-questions/war-game/auditors/cmc-auditor
 */

import type { WarGameAuditor, AuditRule, WarGameFinding, AuditDimension } from '../types.js';

/* 2026-10-22 (D2): rules converged onto the field ids flows/cmc-specification.ts
   (and the container-closure/stability nodes it imports) asks, with their real
   value types: yes_no is a boolean, so "No" is false, not blank. Rules whose
   question the interview does not ask still read their original keys and are
   reported NOT ASSESSED by the engine; they are not mapped to merely related
   questions. tests/ana-intelligence/war-game-reads-what-the-interview-asks.test.ts. */

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const rid = (suffix: string) => 'cmc_' + suffix;

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
    id: rid('missing_impurity_profile'),
    dimension: 'completeness',
    title: 'Impurity Profile Not Provided',
    question: 'The submission lacks an impurity profile for the drug substance. Without a comprehensive enumeration of process-related and degradation impurities, how does the sponsor expect the Agency to assess patient safety?',
    check(answers) {
      // The interview asks the impurity profile as organic_impurities (required).
      if (isBlank(answers.organic_impurities)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No impurity profile was provided for the drug substance.',
          'A complete impurity profile is required per ICH Q3A(R2) Section 3, including reporting of impurities above the reporting threshold, identification of those above the identification threshold, and qualification of those above the qualification threshold.',
          'ICH Q3A(R2) Section 3; ICH Q3B(R2) Section 3; 21 CFR 314.50(d)(1)',
          'Provide a comprehensive impurity profile listing all identified and unidentified impurities, their structures where known, proposed limits, and qualification status relative to ICH Q3A/Q3B thresholds.',
          ['organic_impurities', 'inorganic_impurities', 'ds_specification_tests'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_forced_degradation'),
    dimension: 'completeness',
    title: 'Forced Degradation Studies Absent',
    question: 'The submission does not include forced degradation (stress testing) data. How has the sponsor demonstrated the stability-indicating capability of the proposed analytical methods without evaluating degradation pathways?',
    check(answers) {
      // The interview asks stress testing as the 'stress' option ("Stress / Forced
      // Degradation") of the DS and DP stability-condition multi-selects.
      const hasStress = (v: unknown) => Array.isArray(v) && v.includes('stress');
      if (!hasStress(answers.ds_stability_conditions) && !hasStress(answers.dp_stability_conditions)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No forced degradation (stress testing) studies are documented.',
          'ICH Q1A(R2) Section 2.1.2 requires stress testing to elucidate degradation pathways and demonstrate the stability-indicating power of analytical procedures.',
          'ICH Q1A(R2) Section 2.1.2; ICH Q1B; ICH Q2(R2)',
          'Conduct forced degradation studies under acidic, basic, oxidative, thermal, humidity, and photolytic conditions per ICH Q1B. Demonstrate mass balance and confirm the specificity of stability-indicating methods.',
          ['ds_stability_conditions', 'dp_stability_conditions', 'stability_indicating'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_container_closure'),
    dimension: 'completeness',
    title: 'Container Closure System Not Described',
    question: 'The submission does not describe the container closure system for the drug product. Without this information, the Agency cannot assess extractables/leachables risk or product-container compatibility.',
    check(answers) {
      if (isBlank(answers.container_system_name) && isBlank(answers.primary_packaging)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Container closure system is not described in the CMC submission.',
          'A full description of the container closure system is required per 21 CFR 314.50(d)(1)(ii)(a) and ICH Q1A(R2) Section 2.2.4 (Container Closure System), including materials of construction, specifications, and compatibility data.',
          '21 CFR 314.50(d)(1)(ii)(a); ICH M4Q 3.2.P.7; ICH Q1A(R2) Section 2.2.4; FDA Guidance: Container Closure Systems for Packaging Human Drugs and Biologics (1999)',
          'Describe the container closure system including materials of construction, dimensions, extractables/leachables studies, and compatibility with the drug product formulation.',
          ['container_system_name', 'primary_packaging', 'closure_description', 'el_assessment'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_reference_standard'),
    dimension: 'completeness',
    title: 'Reference Standard Not Characterized',
    question: 'The submission does not provide information on the primary reference standard. How does the sponsor intend to ensure the accuracy of all quantitative analytical results without a fully characterized reference standard?',
    check(answers) {
      if (isBlank(answers.primary_reference_standard)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No primary reference standard characterization data is provided.',
          'ICH Q6A Section 2.11 and ICH Q7 Section 11.1 (paragraphs 11.17-11.19) require a well-characterized primary reference standard for use in identity, purity, and assay testing.',
          'ICH Q6A Section 2.11; ICH Q7 Section 11.1 (paragraphs 11.17-11.19); USP General Chapter <11>',
          'Provide characterization data for the primary reference standard, including purity determination by orthogonal methods, certificate of analysis, and storage/requalification procedures.',
          ['primary_reference_standard', 'reference_standard_requalification', 'key_analytical_methods'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_drug_substance_characterization'),
    dimension: 'completeness',
    title: 'Drug Substance Characterization Incomplete',
    question: 'The submission does not include adequate structural elucidation of the drug substance. How can the Agency confirm the identity and structural integrity of the molecule without spectroscopic and physicochemical data?',
    check(answers) {
      if (isBlank(answers.characterization_methods)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Drug substance structural characterization (e.g., NMR, MS, IR, elemental analysis) is not provided.',
          'CTD Module 3.2.S.3.1 (Elucidation of Structure and other Characteristics, ICH M4Q) requires comprehensive structural elucidation including spectroscopic confirmation of molecular structure.',
          'ICH M4Q(R1) Module 3.2.S.3.1',
          'Provide full structural elucidation data including 1H/13C NMR, high-resolution mass spectrometry, IR/UV spectroscopy, and elemental analysis. Include stereochemistry assignment if applicable.',
          ['characterization_methods', 'characterization_summary', 'polymorphic_forms'],
        );
      }
      return null;
    },
  },

  /* ========== CONSISTENCY (4 rules) ========== */
  {
    id: rid('ds_dp_spec_mismatch'),
    dimension: 'consistency',
    title: 'Specification Limits Mismatch Between Drug Substance and Drug Product',
    question: 'The impurity limits for the drug substance specification appear inconsistent with those in the drug product specification. Can the sponsor explain how impurity thresholds were harmonized between DS and DP to ensure overall product quality?',
    check(answers) {
      const dsLimits = answers.ds_impurity_limits;
      const dpLimits = answers.dp_impurity_limits;
      if (!isBlank(dsLimits) && !isBlank(dpLimits) && dsLimits !== dpLimits) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          `Drug substance impurity limits ("${dsLimits}") differ from drug product impurity limits ("${dpLimits}"). The relationship between DS and DP specifications should be clearly rationalized.`,
          'ICH Q6A Section 3.2 and Q3B(R2) require that DP degradation product limits account for DS impurities carried through to the finished product.',
          'ICH Q6A Section 3.2; ICH Q3A(R2); ICH Q3B(R2)',
          'Harmonize DS and DP impurity specifications. Provide a mass-balance justification showing how DS impurity limits, plus any process- or formulation-related impurities, roll up into DP limits.',
          ['ds_impurity_limits', 'dp_impurity_limits', 'impurity_profile'],
        );
      }
      return null;
    },
  },
  {
    id: rid('analytical_method_not_harmonized'),
    dimension: 'consistency',
    title: 'Analytical Methods Not Harmonized Across Sites',
    question: 'Multiple manufacturing sites are listed, yet the analytical methods do not appear harmonized. How does the sponsor ensure comparability of batch release data generated at different testing locations?',
    check(answers) {
      const sites = answers.manufacturing_sites;
      const harmonized = answers.analytical_methods_harmonized;
      if (!isBlank(sites) && Array.isArray(sites) && sites.length > 1 && (harmonized === false || harmonized === 'no' || isBlank(harmonized))) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          `Multiple manufacturing/testing sites are listed but analytical method harmonization is not confirmed. Data comparability across sites cannot be assumed.`,
          'ICH Q7 Section 12.8 and Q2(R2) require that analytical methods transferred between sites be verified or validated to demonstrate equivalence.',
          'ICH Q7 Section 12.8; ICH Q2(R2); FDA Guidance: Analytical Procedures and Methods Validation (2015)',
          'Conduct method transfer studies between all testing sites, including intermediate precision evaluations, and document acceptance criteria and results.',
          ['manufacturing_sites', 'analytical_methods_harmonized', 'method_transfer_data'],
        );
      }
      return null;
    },
  },
  {
    id: rid('batch_analysis_vs_spec'),
    dimension: 'consistency',
    title: 'Batch Analysis Results Inconsistent with Specification',
    question: 'Batch analysis data appear to show results outside the proposed specification limits. Can the sponsor reconcile these out-of-specification results with the proposed acceptance criteria?',
    check(answers) {
      if (answers.batch_oos_results === true || answers.batch_oos_results === 'yes') {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Batch analysis results include values outside the proposed specification limits, indicating potential specification or process inadequacy.',
          'ICH Q6A Section 3.1 (Specifications: Definition and Justification) requires that specifications be set based on manufacturing experience, stability data, and batch analysis results. All released batches must conform to specification.',
          'ICH Q6A Section 3.1; 21 CFR 211.165; ICH Q7 Section 11.1',
          'Investigate root causes for out-of-specification results. Either revise specifications with scientific justification or implement process improvements to ensure consistent compliance.',
          ['batch_oos_results', 'batch_analysis_data', 'drug_product_specification'],
        );
      }
      return null;
    },
  },
  {
    id: rid('shelf_life_vs_stability_data'),
    dimension: 'consistency',
    title: 'Proposed Shelf Life Not Supported by Stability Data',
    question: 'The proposed shelf life exceeds the duration of available long-term stability data. On what basis does the sponsor justify a shelf life beyond the observed data range?',
    check(answers) {
      const shelfLife = numericVal(answers.proposed_shelf_life_months);
      const stabilityDuration = numericVal(answers.stability_data_duration_months);
      if (shelfLife !== null && stabilityDuration !== null && shelfLife > stabilityDuration) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          `The proposed shelf life of ${shelfLife} months exceeds the ${stabilityDuration} months of available long-term stability data. On what basis does the sponsor justify a shelf life beyond the observed data range?`,
          `Proposed shelf life (${shelfLife} months) exceeds available stability data (${stabilityDuration} months). Extrapolation must be justified per ICH Q1E.`,
          'ICH Q1E permits limited shelf life extrapolation beyond observed long-term data; how far depends on whether significant change occurs at the accelerated (and, where tested, intermediate) condition and on the variability of the data, and statistical analysis is normally expected unless the data show little or no change and little or no variability.',
          'ICH Q1E Evaluation of Stability Data; ICH Q1A(R2) Section 2.2.9 (Evaluation)',
          'Either extend stability studies to cover the proposed shelf life or provide a formal ICH Q1E statistical extrapolation analysis. Limit initial shelf life to the duration supported by real-time data.',
          ['proposed_shelf_life_months', 'stability_data_duration_months', 'stability_trend_analysis'],
        );
      }
      return null;
    },
  },

  /* ========== REGULATORY ALIGNMENT (5 rules) ========== */
  {
    id: rid('q3_thresholds_not_met'),
    dimension: 'regulatory_alignment',
    title: 'ICH Q3 Impurity Thresholds Not Addressed',
    question: 'The proposed impurity limits do not appear to align with ICH Q3A/Q3B reporting, identification, and qualification thresholds for the given maximum daily dose. How does the sponsor justify deviation from the internationally harmonized framework?',
    check(answers) {
      // The interview asks this inverted: unqualified_impurities (yes_no, required) is
      // true when an impurity sits above the ICH Q3A qualification threshold.
      if (answers.unqualified_impurities === true || isBlank(answers.unqualified_impurities)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          answers.unqualified_impurities === true
            ? 'The sponsor reports impurities above the ICH Q3A/Q3B qualification threshold that are not qualified for the proposed maximum daily dose.'
            : 'Whether any impurity exceeds the ICH Q3A/Q3B qualification threshold for the proposed maximum daily dose is not stated.',
          'ICH Q3A(R2) and Q3B(R2) establish dose-dependent thresholds for reporting, identification, and qualification of impurities. Compliance must be demonstrated.',
          'ICH Q3A(R2) Attachment 1 (Thresholds); ICH Q3B(R2) Attachment 1 (Thresholds for Degradation Products in New Drug Products); ICH Q3C(R9); ICH Q3D(R2)',
          'Tabulate all impurities against ICH Q3A/Q3B thresholds based on maximum daily dose. For any impurity above the identification threshold, provide structural identification. For impurities above the qualification threshold, provide toxicological qualification data.',
          ['unqualified_impurities', 'max_daily_dose', 'organic_impurities'],
        );
      }
      return null;
    },
  },
  {
    id: rid('q1a_stability_gaps'),
    dimension: 'regulatory_alignment',
    title: 'ICH Q1A Stability Protocol Deficiencies',
    question: 'The stability protocol does not appear to comply with ICH Q1A(R2) requirements. Can the sponsor address the missing storage conditions, test intervals, or required attributes?',
    /* 2026-10-22 (D2): the interview now asks stability_protocol (select:
       q1a_compliant | phase_appropriate | not_q1a_compliant | no_protocol,
       optional). Fires on a stated departure or a stated absence; a justified
       phase-appropriate protocol and a blank do not fire. */
    check(answers) {
      const protocol = answers.stability_protocol;
      if (protocol === 'not_q1a_compliant' || protocol === 'no_protocol') {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          protocol === 'no_protocol'
            ? 'The sponsor states that there is no written stability protocol yet.'
            : 'The sponsor states that the stability protocol departs from ICH Q1A(R2) for storage conditions, testing intervals, or stability-indicating parameters without justification.',
          'ICH Q1A(R2) requires long-term (25C/60%RH or 30C/65%RH) and accelerated (40C/75%RH) stability studies, with intermediate (30C/65%RH) studies required when long-term storage is 25C/60%RH and significant change occurs at the accelerated condition, all with defined testing intervals and stability-indicating assays.',
          'ICH Q1A(R2) Sections 2.2.1-2.2.7; ICH Q1B; ICH Q1C; ICH Q1D',
          'Develop a stability protocol compliant with ICH Q1A(R2) covering all required conditions, time points (0, 3, 6, 9, 12, 18, 24, 36 months minimum), and stability-indicating tests. Include photostability per ICH Q1B.',
          ['stability_protocol', 'ds_stability_conditions', 'dp_stability_conditions', 'dp_stability_duration'],
        );
      }
      return null;
    },
  },
  {
    id: rid('q6_specification_deficiency'),
    dimension: 'regulatory_alignment',
    title: 'Specification Setting Does Not Follow ICH Q6A/Q6B',
    question: 'The specification-setting approach does not appear to follow the decision trees in ICH Q6A (or Q6B for biologics). How were acceptance criteria established without this systematic framework?',
    check(answers) {
      if (isBlank(answers.specification_justification) || answers.q6_decision_trees_applied === false || answers.q6_decision_trees_applied === 'no') {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'Specification setting does not reference ICH Q6A/Q6B decision trees or provide a systematic justification for acceptance criteria.',
          'ICH Q6A (small molecules) and Q6B (biologics) provide decision trees for establishing appropriate test procedures and acceptance criteria in drug substance and drug product specifications.',
          'ICH Q6A; ICH Q6B; FDA Guidance for Industry: Q6B Specifications: Test Procedures and Acceptance Criteria for Biotechnological/Biological Products (1999)',
          'Apply the relevant ICH Q6A or Q6B decision trees to systematically justify each specification attribute and acceptance criterion. Document the rationale for each included and excluded test.',
          ['specification_justification', 'q6_decision_trees_applied', 'drug_product_specification', 'drug_substance_specification'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_residual_solvents'),
    dimension: 'regulatory_alignment',
    title: 'Residual Solvents Not Controlled per ICH Q3C',
    question: 'The submission does not address residual solvent testing. Given that solvents are used in the synthesis, how does the sponsor ensure patient safety without demonstrating compliance with ICH Q3C limits?',
    check(answers) {
      if (isBlank(answers.residual_solvents)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No residual solvent testing or limits are described, despite synthetic processes that likely involve organic solvents.',
          'ICH Q3C(R9) establishes concentration limits for residual solvents in pharmaceuticals based on permitted daily exposure (PDE). All solvents used in the final synthesis steps must be tested unless justified.',
          'ICH Q3C(R9); ICH Q3D(R2); USP <467>',
          'Identify all solvents used in the drug substance synthesis. Include residual solvent testing (e.g., GC headspace) in the specification with limits per ICH Q3C Class 1/2/3 classifications.',
          ['residual_solvents', 'synthesis_overview', 'ds_specification_tests'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_gmp_compliance'),
    dimension: 'regulatory_alignment',
    title: 'GMP Compliance Not Demonstrated',
    question: 'The submission does not provide evidence that the manufacturing facility operates under current Good Manufacturing Practice (cGMP). How does the sponsor assure the Agency that product quality can be consistently achieved?',
    /* 2026-10-22 (D2): the interview now asks manufacturing_facility_gmp
       (yes_no, optional); gmp_certification was the same question and is no
       longer read. Fires on the stated "No"; a blank is not a stated absence. */
    check(answers) {
      if (answers.manufacturing_facility_gmp === false) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'The sponsor states that not all manufacturing and testing sites operate under cGMP.',
          'Manufacturing of drug substances and drug products must comply with 21 CFR Parts 210/211 (drugs) or 21 CFR Part 600 (biologics) and ICH Q7 GMP for APIs.',
          '21 CFR Parts 210/211; ICH Q7; 21 CFR 314.50(d)(1); FDA Guidance: Process Validation (2011)',
          'Provide documentation of cGMP compliance for all manufacturing and testing sites, including FDA establishment registration numbers, recent inspection history, and any relevant certifications.',
          ['manufacturing_facility_gmp', 'manufacturing_sites', 'dp_manufacturing_site'],
        );
      }
      return null;
    },
  },

  /* ========== SCIENTIFIC RIGOR (5 rules) ========== */
  {
    id: rid('no_cqa_identification'),
    dimension: 'scientific_rigor',
    title: 'Critical Quality Attributes Not Identified via QbD',
    question: 'The submission does not identify Critical Quality Attributes (CQAs) through a systematic Quality by Design approach. Without CQAs, how does the sponsor ensure that the control strategy adequately protects product quality and patient safety?',
    check(answers) {
      if (isBlank(answers.cqas_identified)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Critical Quality Attributes (CQAs) are not identified. A QbD-based approach to CQA identification is absent.',
          'ICH Q8(R2) Part II Section 2.2 defines CQAs as physical, chemical, biological, or microbiological properties that should be within an appropriate limit to ensure product quality. CQA identification is foundational to the control strategy.',
          'ICH Q8(R2) Part II Section 2.2; ICH Q9; ICH Q10; ICH Q11 Section 3',
          'Conduct a systematic risk assessment (e.g., FMEA, Ishikawa) to identify CQAs from the Quality Target Product Profile. Link each CQA to its impact on safety and efficacy.',
          ['cqas_identified', 'risk_assessment_method', 'cpps_identified'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_qtpp'),
    dimension: 'scientific_rigor',
    title: 'Quality Target Product Profile Missing',
    question: 'The submission does not include a Quality Target Product Profile (QTPP). Without a QTPP, on what basis were the drug product specifications and control strategy established?',
    check(answers) {
      if (isBlank(answers.qtpp)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No Quality Target Product Profile (QTPP) is provided to define the desired quality characteristics of the drug product.',
          'ICH Q8(R2) Section 2.1 recommends a QTPP as the starting point for pharmaceutical development, defining the prospective quality characteristics required for the intended use.',
          'ICH Q8(R2) Section 2.1; ICH Q11 Section 3',
          'Develop a QTPP that includes dosage form, route of administration, dosage strength, pharmacokinetic attributes, drug product quality criteria (e.g., dissolution, purity), and container closure.',
          ['qtpp', 'dosage_form', 'route_of_administration', 'critical_quality_attributes'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_design_space'),
    dimension: 'scientific_rigor',
    title: 'Design Space Not Established',
    question: 'No design space has been defined for the manufacturing process. Without a design space, how does the sponsor intend to manage process variability while maintaining product quality within acceptable limits?',
    check(answers) {
      if (answers.design_space_established !== true) {
        return finding(
          this.id,
          this.dimension,
          'info',
          this.title,
          this.question,
          'No design space is established for the manufacturing process. While not mandatory, a design space provides regulatory flexibility and process understanding.',
          'ICH Q8(R2) Section 3 defines design space as the multidimensional combination of input variables and process parameters demonstrated to provide assurance of quality. Operating within a design space is not considered a change.',
          'ICH Q8(R2) Section 3; ICH Q11 Section 8; ICH Q12 Section 5',
          'Consider establishing a design space based on multivariate process characterization studies (e.g., DoE). Define proven acceptable ranges for critical process parameters and link them to CQAs.',
          ['design_space_established', 'cpps_identified', 'cqas_identified'],
        );
      }
      return null;
    },
  },
  {
    id: rid('process_not_validated'),
    dimension: 'scientific_rigor',
    title: 'Process Validation Not Demonstrated',
    question: 'The submission provides no evidence of process validation. How does the sponsor ensure that the manufacturing process consistently produces product meeting its predetermined specifications and quality attributes?',
    check(answers) {
      // The interview asks the validation lifecycle stage; 'not_started' is
      // "Not Yet Started", i.e. no validation plan or data.
      if (isBlank(answers.validation_stage) || answers.validation_stage === 'not_started') {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No process validation data or validation plan is provided. The commercial manufacturing process has not been demonstrated to be in a state of control.',
          'FDA Guidance on Process Validation (2011) describes a lifecycle approach with three stages: process design, process qualification, and continued process verification. Evidence of Stage 2 (process qualification) is expected prior to commercial distribution.',
          'FDA Guidance: Process Validation (2011); 21 CFR 211.100; ICH Q8(R2); ICH Q11',
          'Provide a process validation protocol and, where available, execution data covering at least three consecutive PPQ batches at commercial scale. Include acceptance criteria for all CQAs and CPPs.',
          ['validation_stage', 'ppq_batches', 'process_validation_complete', 'cpps_identified'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_method_validation'),
    dimension: 'scientific_rigor',
    title: 'Analytical Method Validation Insufficient',
    question: 'The submission does not provide adequate analytical method validation data per ICH Q2(R2). How can the Agency have confidence in the reliability and accuracy of the reported analytical results?',
    check(answers) {
      // method_validation_status: 'qualification_only' is "Methods Qualified but Not
      // Yet Validated", 'not_started' is "Validation Not Yet Started".
      const mvs = answers.method_validation_status;
      if (isBlank(mvs) || mvs === 'not_started' || mvs === 'qualification_only') {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'Analytical method validation data per ICH Q2(R2) are not provided or are incomplete.',
          'ICH Q2(R2) requires validation of analytical procedures for specificity, linearity, range, accuracy, precision (repeatability and intermediate precision), detection limit, quantitation limit, and robustness as applicable.',
          'ICH Q2(R2); ICH Q14; FDA Guidance: Analytical Procedures and Methods Validation (2015)',
          'Provide complete validation reports for all analytical methods used in specifications, including demonstrated specificity, linearity (R2 >= 0.999), accuracy (recovery 98-102%), precision (RSD <= 2%), and robustness.',
          ['method_validation_status', 'key_analytical_methods', 'stability_indicating'],
        );
      }
      return null;
    },
  },

  /* ========== PRACTICAL FEASIBILITY (4 rules) ========== */
  {
    id: rid('single_source_api'),
    dimension: 'practical_feasibility',
    title: 'Single-Source API Supply',
    question: 'The submission identifies only a single source for the active pharmaceutical ingredient. What is the sponsor\'s contingency if this sole supplier experiences a disruption, quality failure, or regulatory action?',
    check(answers) {
      const apiSources = answers.api_sources;
      if (
        (!isBlank(apiSources) && ((Array.isArray(apiSources) && apiSources.length === 1) || (typeof apiSources === 'string' && !apiSources.includes(',')))) ||
        answers.single_source_api === true ||
        answers.single_source_api === 'yes'
      ) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'Only one API supplier is identified, creating a single point of failure in the supply chain.',
          'FDA encourages supply chain resilience to prevent drug shortages under FDCA section 506C (as amended by FDASIA and the CARES Act) and FDA guidance on notifying FDA of a permanent discontinuance or interruption in manufacturing; the Drug Supply Chain Security Act (DSCSA) addresses product tracing, not supply redundancy. Single-source APIs increase drug shortage risk.',
          'FDA Guidance: Drug Shortages (2014); ICH Q7 Section 7; 21 CFR 314.70',
          'Qualify at least one backup API supplier. Provide comparability data (physicochemical characterization, impurity profiles) between sources. Include a supply chain risk assessment.',
          ['api_sources', 'single_source_api', 'supply_chain_risk', 'api_supplier_qualification'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_backup_manufacturing_site'),
    dimension: 'practical_feasibility',
    title: 'No Backup Manufacturing Site',
    question: 'Only one drug product manufacturing site is identified. In the event of a facility shutdown, natural disaster, or regulatory action, how will the sponsor ensure continuity of supply for patients?',
    check(answers) {
      const sites = answers.manufacturing_sites;
      if (
        (!isBlank(sites) && Array.isArray(sites) && sites.length === 1) ||
        (typeof sites === 'string' && !sites.includes(',')) ||
        answers.backup_manufacturing_site === false ||
        answers.backup_manufacturing_site === 'no'
      ) {
        return finding(
          this.id,
          this.dimension,
          'info',
          this.title,
          this.question,
          'Only one manufacturing site is listed for drug product production. No backup or alternate site is identified.',
          'FDA Drug Shortage prevention guidance and business continuity best practices recommend redundancy in manufacturing capacity for marketed products.',
          'FDA Guidance: Drug Shortages (2014); FDA Guidance: Submission of Manufacturing Information for Drug Products (2019); ICH Q7 Section 2',
          'Identify and qualify at least one alternate manufacturing site. Develop a technology transfer plan and site comparability protocol to enable rapid activation if needed.',
          ['manufacturing_sites', 'backup_manufacturing_site', 'tech_transfer_protocol'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_tech_transfer_protocol'),
    dimension: 'practical_feasibility',
    title: 'No Technology Transfer Protocol',
    question: 'The submission does not describe a technology transfer protocol. How does the sponsor ensure that manufacturing knowledge is systematically transferred to receiving sites while maintaining product quality?',
    check(answers) {
      if (isBlank(answers.tech_transfer_protocol)) {
        return finding(
          this.id,
          this.dimension,
          'info',
          this.title,
          this.question,
          'No technology transfer protocol or plan is documented for the manufacturing process.',
          'ICH Q10 Section 3.1.2 (Technology Transfer) and the WHO guidelines on technology transfer in pharmaceutical manufacturing (WHO TRS 1044, 2022, which replaced TRS 961 Annex 7) recommend a structured technology transfer process to ensure successful transfer of manufacturing knowledge between development and production, or between sites.',
          'ICH Q10 Section 3.1.2; ICH Q12; WHO guidelines on technology transfer in pharmaceutical manufacturing (TRS 1044, 2022)',
          'Develop a technology transfer protocol covering process description, critical parameters, analytical methods, equipment qualification requirements, and acceptance criteria for demonstration batches at the receiving site.',
          ['tech_transfer_protocol', 'manufacturing_sites', 'process_knowledge'],
        );
      }
      return null;
    },
  },
  {
    id: rid('scale_up_not_addressed'),
    dimension: 'practical_feasibility',
    title: 'Scale-Up Strategy Not Described',
    question: 'The submission does not describe a scale-up strategy from development to commercial scale. How does the sponsor intend to ensure that critical process parameters and product quality are maintained at larger scale?',
    check(answers) {
      if (isBlank(answers.scale_up_strategy) && isBlank(answers.scale_up_data)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No scale-up strategy or bridging data between development and commercial scale is provided.',
          'ICH Q11 Section 7 and FDA Process Validation Guidance (2011) Stage 1 expect documentation of scale-up considerations, including identification of scale-dependent parameters.',
          'ICH Q11 Section 7; FDA Guidance: Process Validation (2011); ICH Q8(R2)',
          'Provide a scale-up strategy that identifies scale-dependent parameters (e.g., mixing, heat transfer, drying time), includes bridging studies or models, and demonstrates comparability between development and commercial batches.',
          ['scale_up_strategy', 'scale_up_data', 'batch_size_commercial', 'batch_size_development'],
        );
      }
      return null;
    },
  },

  /* ========== DOCUMENTATION (4 rules) ========== */
  {
    id: rid('no_master_batch_record'),
    dimension: 'documentation',
    title: 'Master Batch Record Not Provided',
    question: 'The submission does not include a master batch record or master production instruction. Without this foundational manufacturing document, how does the Agency assess the adequacy of the manufacturing process description?',
    check(answers) {
      if (isBlank(answers.master_batch_record)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No master batch record (MBR) or master production instruction is provided in the CMC submission.',
          'An executed or representative master batch record is expected per 21 CFR 211.186 and ICH Q7 Section 6.4 to demonstrate the manufacturing process in adequate detail.',
          '21 CFR 211.186; ICH Q7 Section 6.4; ICH M4Q(R1) Module 3.2.P.3.3',
          'Provide a master batch record (or representative executed batch record) that includes all manufacturing steps, in-process controls, equipment identification, and critical process parameters with operating ranges.',
          ['master_batch_record', 'manufacturing_process_description', 'in_process_controls'],
        );
      }
      return null;
    },
  },
  {
    id: rid('missing_amv_reports'),
    dimension: 'documentation',
    title: 'Analytical Method Validation Reports Missing',
    question: 'Analytical method validation reports are referenced but not provided. How does the sponsor expect the Agency to assess data reliability when the underlying method validation is absent from the submission?',
    check(answers) {
      if (isBlank(answers.amv_reports) && !isBlank(answers.key_analytical_methods)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Analytical methods are referenced in the specification but validation reports are not included in the submission.',
          'ICH Q2(R2) requires documented validation of analytical procedures. Full validation reports should be included in Module 3.2.S.4.3 and 3.2.P.5.3 of the CTD.',
          'ICH Q2(R2); ICH M4Q(R1) Modules 3.2.S.4.3, 3.2.P.5.3',
          'Include complete analytical method validation reports for all specification tests. Reports should document all ICH Q2(R2) validation characteristics with tabulated results and acceptance criteria.',
          ['amv_reports', 'key_analytical_methods', 'method_validation_status'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_stability_protocol_doc'),
    dimension: 'documentation',
    title: 'Stability Protocol Document Not Included',
    question: 'A formal stability protocol document is not included in the submission. How does the Agency evaluate the adequacy of the stability design without a documented protocol specifying conditions, time points, and testing attributes?',
    check(answers) {
      if (isBlank(answers.stability_protocol_document)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No formal stability protocol document is included in the CMC submission.',
          'A stability protocol is expected per ICH Q1A(R2) Section 2.2 and should be included in Module 3.2.S.7.1 (DS) or 3.2.P.8.1 (DP) of the CTD.',
          'ICH Q1A(R2) Section 2.2; ICH M4Q(R1) Modules 3.2.S.7.1, 3.2.P.8.1',
          'Provide a complete stability protocol document specifying batches, storage conditions, testing intervals, test attributes, acceptance criteria, and statistical analysis plan for trend analysis.',
          ['stability_protocol_document', 'stability_protocol', 'stability_conditions'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_control_strategy_summary'),
    dimension: 'documentation',
    title: 'Control Strategy Not Documented',
    question: 'The submission does not include a documented control strategy linking CQAs to process parameters, material attributes, and analytical controls. How does the sponsor demonstrate an integrated approach to quality assurance?',
    check(answers) {
      if (isBlank(answers.control_strategy)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No control strategy document is provided to link critical quality attributes to the overall quality system.',
          'The ICH Q10 Glossary and ICH Q8(R2) Part II Section 2.5 describe the control strategy as a planned set of controls derived from product and process understanding that assures process performance and product quality.',
          'ICH Q10 Glossary (Control Strategy); ICH Q8(R2) Part II Section 2.5; ICH Q11 Section 6',
          'Document a comprehensive control strategy that maps CQAs to CPPs, CMAs, in-process controls, specification tests, and GMP procedural controls. Include a visual process flow with control points.',
          ['control_strategy', 'critical_quality_attributes', 'critical_process_parameters', 'in_process_controls'],
        );
      }
      return null;
    },
  },

  /* ========== RISK IDENTIFICATION (5 rules) ========== */
  {
    id: rid('genotoxic_impurities_not_assessed'),
    dimension: 'risk_identification',
    title: 'Genotoxic Impurities Not Assessed per ICH M7',
    question: 'The submission does not include an assessment of potentially mutagenic impurities per ICH M7(R2). Given the serious patient safety implications of genotoxic impurities, how does the sponsor justify this omission?',
    check(answers) {
      // mutagenic_impurity_assessment (yes_no, required) is the ICH M7 assessment.
      if (answers.mutagenic_impurity_assessment !== true) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No assessment of mutagenic (genotoxic) impurities per ICH M7(R2) is provided. This is a significant patient safety gap.',
          'ICH M7(R2) requires assessment of mutagenic potential for all actual and potential impurities, with control strategies based on acceptable intake (AI) limits derived from the Threshold of Toxicological Concern (TTC).',
          'ICH M7(R2); FDA Guidance: M7(R2) Assessment and Control of DNA Reactive (Mutagenic) Impurities in Pharmaceuticals to Limit Potential Carcinogenic Risk; EMA/CHMP/ICH/83812/2013',
          'Conduct a comprehensive ICH M7(R2) assessment: (1) identify all potential mutagenic impurities via (Q)SAR analysis; (2) classify per M7 Classes 1-5; (3) establish acceptable intake limits; (4) demonstrate control via specification limits or purge factor arguments.',
          ['mutagenic_impurity_assessment', 'organic_impurities', 'synthesis_overview'],
        );
      }
      return null;
    },
  },
  {
    id: rid('elemental_impurities_not_controlled'),
    dimension: 'risk_identification',
    title: 'Elemental Impurities Not Controlled per ICH Q3D',
    question: 'The submission does not address elemental impurities per ICH Q3D(R2). Certain elements (e.g., Pd, Pt, Ni from catalysts) may be introduced during synthesis. How does the sponsor ensure these are controlled within permitted daily exposure limits?',
    check(answers) {
      // inorganic_impurities ("Inorganic / Elemental Impurities", required) asks for
      // the ICH Q3D risk assessment.
      if (isBlank(answers.inorganic_impurities)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No elemental impurities risk assessment per ICH Q3D(R2) is provided. Catalysts, reagents, and equipment may introduce toxic elements.',
          'ICH Q3D(R2) requires a risk-based assessment of elemental impurities from all potential sources (drug substance synthesis, excipients, manufacturing equipment, container closure) with control below established PDEs.',
          'ICH Q3D(R2); USP <232>/<233>; FDA Guidance: Elemental Impurities in Drug Products (2018)',
          'Conduct an ICH Q3D risk assessment covering all Class 1, 2A, and 2B elements. Evaluate all potential sources including catalysts, reagents, utilities, equipment, and container closure. Provide ICP-MS or ICP-OES data for relevant elements.',
          ['inorganic_impurities', 'synthesis_overview', 'equipment_type'],
        );
      }
      return null;
    },
  },
  {
    id: rid('nitrosamine_risk_not_evaluated'),
    dimension: 'risk_identification',
    title: 'Nitrosamine Risk Not Evaluated',
    question: 'The submission does not include a nitrosamine risk evaluation. Given recent FDA enforcement actions and the serious carcinogenicity concerns, how does the sponsor justify the absence of a nitrosamine assessment?',
    /* 2026-10-22 (D2): the interview now asks nitrosamine_risk_evaluation
       (select: completed | in_progress | not_started | not_applicable,
       optional); nitrosamine_assessment was the same question and is no longer
       read. Fires on the stated "Not started"; a blank is not a stated absence. */
    check(answers) {
      if (answers.nitrosamine_risk_evaluation === 'not_started') {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'The sponsor states that the nitrosamine risk evaluation has not been started. FDA expects assessment of N-nitrosamine impurity risk for all drug products.',
          'FDA requires nitrosamine risk evaluations per its guidance Control of Nitrosamine Impurities in Human Drugs (Revision 2, September 2024), including assessment of all potential root causes (amine + nitrite, nitrosating conditions, cross-contamination).',
          'FDA Guidance: Control of Nitrosamine Impurities in Human Drugs (Rev. 2, 2024); ICH M7(R2); EMA Referral on Nitrosamines (2020)',
          'Conduct a comprehensive nitrosamine risk evaluation: (1) assess all potential sources of N-nitrosamine formation; (2) test for NDSRIs using sufficiently sensitive methods (LOD at AI level); (3) implement controls if risk is identified; (4) establish confirmatory testing program.',
          ['nitrosamine_risk_evaluation', 'synthesis_overview', 'mutagenic_impurity_assessment'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_excipient_compatibility'),
    dimension: 'risk_identification',
    title: 'Excipient Compatibility Studies Not Conducted',
    question: 'The submission does not include drug-excipient compatibility studies. Without these studies, how does the sponsor assure the Agency that the formulation is stable and that no deleterious interactions occur between the drug substance and excipients?',
    check(answers) {
      // yes_no: false ("No") is an answer, not a blank, so test for true.
      if (answers.excipient_compatibility_studies !== true) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No drug-excipient compatibility studies are provided to support the chosen formulation.',
          'ICH Q8(R2) recommends drug-excipient compatibility studies as part of pharmaceutical development to identify potential incompatibilities that could affect product quality during storage.',
          'ICH Q8(R2) Section 2.1 (Components of the Drug Product: Drug Substance and Excipients)',
          'Conduct binary and multicomponent drug-excipient compatibility studies using accelerated conditions and stability-indicating analytical methods. Document results and impact on formulation selection.',
          ['excipient_compatibility_studies', 'compatibility_study_details', 'formulation_composition_detail'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_microbiological_controls'),
    dimension: 'risk_identification',
    title: 'Microbiological Controls Inadequate',
    question: 'The submission does not describe adequate microbiological controls for a product that may be susceptible to microbial contamination. How does the sponsor ensure microbial quality throughout the manufacturing process and shelf life?',
    /* 2026-10-22 (D2): the interview now asks microbiological_controls
       (select: established | in_development | not_established |
       not_applicable, optional). Fires on the stated "Not established":
       critical for a sterile, parenteral or ophthalmic product, a warning
       otherwise. A blank and a justified "Not applicable" do not fire. */
    check(answers) {
      if (answers.microbiological_controls !== 'not_established') return null;
      const route = String(answers.route_of_administration ?? '').toLowerCase();
      const dosageForm = String(answers.dosage_form ?? '').toLowerCase();
      const isHighRisk = answers.is_sterile === true
        || ['intravenous', 'subcutaneous', 'intramuscular', 'intrathecal', 'ophthalmic'].includes(route)
        || /injection|infusion|syringe|autoinjector|lyophilized|ophthalmic/.test(dosageForm);
      return finding(
        this.id,
        this.dimension,
        isHighRisk ? 'critical' : 'warning',
        this.title,
        this.question,
        'The sponsor states that microbiological controls (microbial limits, or sterility and endotoxin) are not established in the specifications.',
        'USP <61>/<62> (microbial enumeration and specified organisms), USP <85> (endotoxin), and USP <71> (sterility) requirements apply based on route of administration. 21 CFR 211.113 requires appropriate controls.',
        '21 CFR 211.113; USP <61>/<62>/<71>/<85>; ICH Q6A Decision Tree #8 (non-sterile drug products)',
        'Define microbiological specifications appropriate to the dosage form and route. For sterile products, describe the sterility assurance strategy (terminal sterilization or aseptic processing) and include media fill and environmental monitoring programs.',
        ['microbiological_controls', 'is_sterile', 'route_of_administration', 'dosage_form', 'sterile_manufacturing'],
      );
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Factory                                                           */
/* ------------------------------------------------------------------ */

export function createCmcAuditor(): WarGameAuditor {
  return {
    category: 'cmc',
    name: 'FDA CMC Reviewer',
    description:
      'Simulates an FDA Chemistry, Manufacturing, and Controls reviewer assessing CMC ' +
      'specifications per ICH Q1-Q12, Q3A-D, Q5A-E, Q6A/Q6B, M7(R2), and FDA Process ' +
      'Validation Guidance. Evaluates completeness, internal consistency, regulatory alignment, ' +
      'scientific rigor, practical feasibility, documentation quality, and risk identification.',
    rules,
  };
}
