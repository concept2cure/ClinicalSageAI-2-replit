/**
 * BLA Auditor -- simulates FDA reviewer scrutiny of a Biologics License
 * Application per 42 USC 262 and 21 CFR 601.
 *
 * Generates adversarial questions across seven audit dimensions, referencing
 * 42 USC 262, 21 CFR 601, 21 CFR 610, ICH Q5A-E, ICH S6(R1), ICH Q6B,
 * FDA Immunogenicity Guidance (2019), and FDA Biosimilars Guidance.
 *
 * @module server/services/ana/intelligence-questions/war-game/auditors/bla-auditor
 */

import type { WarGameAuditor, AuditRule, WarGameFinding, AuditDimension } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const rid = (suffix: string) => 'bla_' + suffix;

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
    id: rid('no_lot_release_specs'),
    dimension: 'completeness',
    title: 'Lot Release Specifications Missing',
    question: 'The BLA does not include lot release specifications. Under 21 CFR 610.10, how does the applicant intend to demonstrate that each manufactured lot meets identity, purity, and potency requirements before distribution?',
    check(answers) {
      if (isBlank(answers.lot_release_specs) && (answers.lot_release_testing === true || answers.lot_release_testing === 'yes')) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Lot release testing is indicated as established, but no lot release specifications are provided.',
          'Per 21 CFR 610.10 and 21 CFR 610.12-610.14, lot release specifications for identity, purity, potency, and sterility must be defined and submitted in the BLA.',
          '21 CFR 610.10; 21 CFR 610.12; 21 CFR 610.14; ICH Q6B',
          'Provide complete lot release specifications including identity tests, purity limits, potency acceptance criteria, sterility testing, and endotoxin limits with validated methods for each test.',
          ['lot_release_specs', 'lot_release_testing'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_cell_bank_characterization'),
    dimension: 'completeness',
    title: 'Cell Bank Characterization Absent',
    question: 'The submission does not describe cell bank characterization testing. Under ICH Q5D, how can the Agency evaluate the suitability of the cell substrate for commercial manufacturing without identity, adventitious agent, and genetic stability data on the MCB and WCB?',
    check(answers) {
      if (isBlank(answers.cell_bank_characterization)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No cell bank characterization tests are documented in the submission.',
          'ICH Q5D requires thorough characterization of cell banks including identity, viability, sterility, mycoplasma, adventitious agent testing, and genetic stability assessment.',
          'ICH Q5D; ICH Q5B; 21 CFR 601.2',
          'Complete and document all cell bank characterization tests for both the Master Cell Bank (MCB) and Working Cell Bank (WCB), including identity, sterility, mycoplasma, adventitious agents, and genetic stability.',
          ['cell_bank_characterization', 'cell_bank_system', 'cell_line_name'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_viral_safety_evaluation'),
    dimension: 'completeness',
    title: 'No Viral Safety Evaluation',
    question: 'The BLA does not document completion of viral safety testing. Per ICH Q5A(R2), viral safety evaluation is a non-negotiable requirement for cell-line-derived biologics. What is the applicant\'s plan for addressing this critical gap?',
    check(answers) {
      if (answers.viral_testing_completed === false || answers.viral_testing_completed === 'no') {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Viral safety testing has not been completed for the cell substrate.',
          'ICH Q5A(R2) mandates comprehensive viral safety evaluation including retrovirus testing, broad-spectrum adventitious agent assays, and species-specific virus panels on cell banks and unprocessed bulk.',
          'ICH Q5A(R2); 21 CFR 601.2; 9 CFR 113',
          'Complete viral safety testing per ICH Q5A(R2) including: (1) retrovirus testing by TEM and infectivity assay on MCB/end-of-production cells, (2) in vitro and in vivo adventitious agent assays, (3) species-specific virus panels, and (4) PCR-based viral screening.',
          ['viral_testing_completed', 'adventitious_agent_testing'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_comparability_protocol'),
    dimension: 'completeness',
    title: 'Comparability Protocol Missing Despite Process Changes',
    question: 'The applicant indicates manufacturing process changes occurred during development but does not provide a comparability protocol. Per ICH Q5E, how does the applicant demonstrate that process changes did not adversely affect the product\'s quality, safety, or efficacy?',
    check(answers) {
      if (
        (answers.comparability_study_needed === true || answers.comparability_study_needed === 'yes') &&
        isBlank(answers.comparability_protocol)
      ) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Manufacturing process changes are indicated as requiring comparability, but no comparability protocol or study summary is provided.',
          'Per ICH Q5E, any manufacturing process change with potential to impact product quality requires a comparability assessment covering analytical, functional, and where appropriate, nonclinical and clinical comparability.',
          'ICH Q5E; FDA Guidance on Comparability Protocols (2016); 21 CFR 601.12',
          'Develop and submit a comprehensive comparability protocol detailing the analytical, functional, and clinical comparability studies with pre-specified acceptance criteria for each quality attribute.',
          ['comparability_protocol', 'comparability_study_needed'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_indication'),
    dimension: 'completeness',
    title: 'Proposed Indication Not Stated',
    question: 'The BLA does not include a proposed indication statement. Without a clearly defined indication, how does the applicant expect the Agency to evaluate the benefit-risk profile or draft appropriate labeling?',
    check(answers) {
      if (isBlank(answers.indication)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'No proposed indication statement is provided in the BLA.',
          'Per 21 CFR 601.2, the BLA must clearly define the proposed indication including the target population, disease, and intended use of the biological product.',
          '21 CFR 601.2; 42 USC 262(a)',
          'Provide a specific, well-defined indication statement including the target population, disease condition, line of therapy, and any biomarker-defined subpopulations.',
          ['indication', 'population_studied'],
        );
      }
      return null;
    },
  },

  /* ========== CONSISTENCY (4 rules) ========== */
  {
    id: rid('potency_assay_mismatch'),
    dimension: 'consistency',
    title: 'Potency Assay Type Inconsistent with Mechanism of Action',
    question: 'The applicant uses a binding-only potency assay for a product whose mechanism of action involves Fc-mediated effector function. A binding assay alone does not reflect the full mechanism of action. Can the applicant justify why a cell-based functional assay is not used per 21 CFR 610.10?',
    check(answers) {
      const potencyType = String(answers.potency_assay_type ?? '').toLowerCase();
      const moa = String(answers.mechanism_of_action ?? '').toLowerCase();
      if (
        potencyType === 'binding' &&
        (moa.includes('adcc') || moa.includes('cdc') || moa.includes('effector') || moa.includes('complement'))
      ) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          `Potency assay type is "${answers.potency_assay_type}" but the mechanism of action includes Fc-mediated effector functions (ADCC/CDC). A binding assay alone may not adequately reflect the product's functional mechanism.`,
          'Per 21 CFR 610.10, the potency assay must reflect the mechanism of action of the biological product. For products relying on Fc-mediated effector function, a cell-based bioassay is generally expected.',
          '21 CFR 610.10; ICH Q6B; FDA Potency Guidance',
          'Develop and validate a cell-based bioassay that measures the relevant effector function (e.g., ADCC reporter assay, CDC assay). Use the binding assay as a complementary release test.',
          ['potency_assay_type', 'mechanism_of_action', 'biological_activity'],
        );
      }
      return null;
    },
  },
  {
    id: rid('cell_line_drift'),
    dimension: 'consistency',
    title: 'Cell Line Genetic Stability Not Confirmed at Production Limit',
    question: 'The applicant has not confirmed genetic stability of the expression construct at the in vitro cell age limit used for production. How can the Agency be assured that the cell line does not undergo genetic drift that could alter product quality attributes during extended manufacturing campaigns?',
    check(answers) {
      if (answers.genetic_stability_confirmed === false || answers.genetic_stability_confirmed === 'no') {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Genetic stability of the production cell line has not been confirmed at the validated passage limit.',
          'Per ICH Q5B, genetic stability of the expression construct must be demonstrated at or beyond the limit of in vitro cell age used for production to ensure consistent product quality throughout the manufacturing campaign.',
          'ICH Q5B; ICH Q5D',
          'Conduct genetic stability studies comparing cells at the MCB level with cells at or beyond the proposed in vitro cell age limit. Assess transgene integrity, copy number, transcript levels, and product quality attributes.',
          ['genetic_stability_confirmed', 'passage_limit', 'cell_line_name'],
        );
      }
      return null;
    },
  },
  {
    id: rid('manufacturing_scale_mismatch'),
    dimension: 'consistency',
    title: 'Manufacturing Scale Inconsistency Between Clinical and Commercial',
    question: 'The BLA indicates only clinical-scale manufacturing data, yet this is a commercial licensure application. Process performance qualified at clinical scale does not guarantee equivalence at commercial scale. How does the applicant reconcile this gap?',
    check(answers) {
      const scale = String(answers.manufacturing_scale ?? '').toLowerCase();
      if (scale === 'clinical') {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Only clinical-scale manufacturing data is described, but the BLA seeks commercial licensure.',
          'Per 21 CFR 601.2 and FDA Process Validation Guidance (2011), the BLA must include manufacturing data at commercial scale. Scale-dependent process parameters may impact product quality attributes.',
          '21 CFR 601.2; FDA Process Validation Guidance (2011); ICH Q5E',
          'Complete scale-up to commercial manufacturing and provide process validation data at commercial scale. Include a comparability assessment between clinical-scale and commercial-scale product.',
          ['manufacturing_scale', 'scale_up_completed', 'process_validation_status'],
        );
      }
      return null;
    },
  },
  {
    id: rid('process_validation_not_complete'),
    dimension: 'consistency',
    title: 'Process Validation Incomplete for Commercial Licensure',
    question: 'The process validation status is reported as incomplete, yet the applicant seeks a biologics license. Per FDA Process Validation Guidance, Stage 2 process qualification must be completed at commercial scale before BLA approval. What is the applicant\'s timeline for completing validation?',
    check(answers) {
      const pvStatus = String(answers.process_validation_status ?? '').toLowerCase();
      if (pvStatus === 'planned' || pvStatus === 'ongoing') {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          `Process validation status is "${answers.process_validation_status}" — it has not been completed for commercial manufacturing.`,
          'Per FDA Process Validation Guidance (2011), Stage 2 (Process Qualification) must be completed at commercial scale, typically with a minimum of three consecutive successful batches, before the BLA can be approved.',
          'FDA Process Validation Guidance (2011); 21 CFR 211; 21 CFR 601.2',
          'Complete process validation (Stage 2) at commercial scale with at least three consecutive batches meeting all CQA specifications. Submit the validation report as part of the BLA.',
          ['process_validation_status', 'validation_batches', 'manufacturing_scale'],
        );
      }
      return null;
    },
  },

  /* ========== REGULATORY ALIGNMENT (5 rules) ========== */
  {
    id: rid('biosimilar_no_reference_product'),
    dimension: 'regulatory_alignment',
    title: 'No Reference Product Identified for 351(k) Application',
    question: 'The applicant has selected the 351(k) biosimilar pathway but has not identified the US-licensed reference product. Per 42 USC 262(k), a biosimilar application must reference a specific FDA-licensed biological product. What is the reference product?',
    check(answers) {
      const pathway = String(answers.bla_pathway ?? '').toLowerCase();
      if (pathway.includes('351k') || pathway.includes('biosimilar')) {
        if (isBlank(answers.reference_product)) {
          return finding(
            this.id,
            this.dimension,
            'critical',
            this.title,
            this.question,
            'The 351(k) biosimilar pathway is selected but no reference product is identified.',
            'Per 42 USC 262(k) and FDA Guidance on Biosimilar Development, the 351(k) application must identify a specific US-licensed reference product (with BLA number) against which biosimilarity is demonstrated.',
            '42 USC 262(k); BPCI Act; FDA Guidance: Biosimilar Development (2015)',
            'Identify the US-licensed reference product by name, BLA number, and approval date. If clinical studies used a non-US reference product, provide an analytical bridging study to the US-licensed product.',
            ['reference_product', 'reference_product_approval', 'bla_pathway'],
          );
        }
      }
      return null;
    },
  },
  {
    id: rid('bpci_act_noncompliance'),
    dimension: 'regulatory_alignment',
    title: 'BPCI Act Compliance Not Demonstrated',
    question: 'The applicant is pursuing a 351(k) pathway but has not demonstrated the analytical fingerprint-like similarity assessment expected under the BPCI Act. Without comprehensive analytical similarity, the abbreviated pathway is not supported. Can the applicant address this deficiency?',
    check(answers) {
      const pathway = String(answers.bla_pathway ?? '').toLowerCase();
      if (
        (pathway.includes('351k') || pathway.includes('biosimilar')) &&
        (answers.fingerprint_analysis === false || answers.fingerprint_analysis === 'no')
      ) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'The 351(k) biosimilar pathway is selected but the fingerprint-like analytical similarity assessment has not been completed.',
          'Per the BPCI Act and FDA Guidance on Biosimilar Development (2015), a comprehensive fingerprint-like analytical characterization using orthogonal state-of-the-art methods is the foundation of the 351(k) application.',
          'BPCI Act (42 USC 262(k)); FDA Guidance: Scientific Considerations in Demonstrating Biosimilarity (2015)',
          'Complete a comprehensive fingerprint-like analytical similarity assessment using orthogonal methods covering primary structure, higher-order structure, glycosylation, charge variants, size variants, and functional assays. Analyze a minimum of 10 lots of the US-licensed reference product.',
          ['fingerprint_analysis', 'bla_pathway', 'analytical_similarity_studies'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_form_356h'),
    dimension: 'regulatory_alignment',
    title: 'Form FDA 356h Not Prepared',
    question: 'Form FDA 356h — the mandatory BLA application cover form — has not been prepared. Per 21 CFR 601.2, the BLA will be refused to file without this form. When does the applicant plan to complete it?',
    check(answers) {
      if (answers.form_fda_356h === false || answers.form_fda_356h === 'no') {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Form FDA 356h has not been prepared for the BLA submission.',
          'Per 21 CFR 601.2, Form FDA 356h (Application to Market a New Drug, Biologic, or Antibiotic Drug for Human Use) is the mandatory cover form. The BLA will be refused to file without it.',
          '21 CFR 601.2; 42 USC 262',
          'Prepare Form FDA 356h ensuring all required sections are completed, including applicant information, product description, manufacturing sites, and required certifications.',
          ['form_fda_356h'],
        );
      }
      return null;
    },
  },
  {
    id: rid('user_fee_not_paid'),
    dimension: 'regulatory_alignment',
    title: 'PDUFA User Fee Not Paid',
    question: 'The PDUFA user fee has not been paid. Per 21 USC 379h, the BLA will not be received for filing without fee payment. Has the applicant initiated the fee payment process or applied for a waiver?',
    check(answers) {
      if (answers.user_fee_paid === false || answers.user_fee_paid === 'no') {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'The PDUFA user fee has not been paid.',
          'Per PDUFA (21 USC 379h), the application fee (exceeding $4 million for FY2026) must be paid before the BLA will be received for filing. Orphan products may qualify for a fee waiver under 21 USC 360bb.',
          'PDUFA (21 USC 379h); 21 CFR 601.2',
          'Initiate PDUFA user fee payment or, if applicable, submit a fee waiver request for orphan designation. Payment must be contemporaneous with or prior to BLA submission.',
          ['user_fee_paid', 'orphan_designation'],
        );
      }
      return null;
    },
  },
  {
    id: rid('facility_not_inspected'),
    dimension: 'regulatory_alignment',
    title: 'Manufacturing Facility Not FDA-Inspected',
    question: 'The manufacturing facility has not been inspected by FDA. Per 42 USC 262(c), FDA must inspect and approve the establishment before a biologics license can be issued. Has the applicant engaged with FDA to schedule a pre-approval inspection?',
    check(answers) {
      if (answers.facility_fda_inspected === false || answers.facility_fda_inspected === 'no') {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'The manufacturing facility has not yet been inspected by FDA.',
          'Per 42 USC 262(c) and 21 CFR 600.21, FDA must inspect the manufacturing facility and find it in compliance with cGMP before issuing a biologics license.',
          '42 USC 262(c); 21 CFR 600.21; 21 CFR 211',
          'Engage with FDA to schedule a pre-approval inspection (PAI) at least 6 months before the anticipated PDUFA goal date. Ensure the facility is cGMP-ready and all standard operating procedures are current.',
          ['facility_fda_inspected', 'manufacturing_sites'],
        );
      }
      return null;
    },
  },

  /* ========== SCIENTIFIC RIGOR (5 rules) ========== */
  {
    id: rid('immunogenicity_not_assessed'),
    dimension: 'scientific_rigor',
    title: 'Immunogenicity Assessment Incomplete',
    question: 'The ADA assay has not been validated, yet the applicant is seeking licensure. Per FDA Immunogenicity Guidance (2019), validated ADA assays are a prerequisite for interpretable immunogenicity data. How does the applicant intend to address this critical deficiency?',
    check(answers) {
      if (answers.assay_validation_complete === false || answers.assay_validation_complete === 'no') {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'The ADA assay has not been validated, rendering immunogenicity data uninterpretable for regulatory decision-making.',
          'Per FDA Guidance on Immunogenicity Testing (2019), ADA screening, confirmatory, and neutralizing antibody assays must be fully validated for sensitivity, drug tolerance, specificity, precision, selectivity, and cut point determination before data can support a BLA.',
          'FDA Immunogenicity Guidance (2019); FDA ADA Assay Guidance (2019); ICH S6(R1)',
          'Complete full validation of the ADA testing strategy per FDA guidance, including sensitivity (at least 100 ng/mL), drug tolerance assessment, cut point determination using treatment-naive samples, and precision studies.',
          ['assay_validation_complete', 'ada_assay_strategy'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_ada_nab_strategy'),
    dimension: 'scientific_rigor',
    title: 'No Tiered ADA/NAb Testing Strategy',
    question: 'The applicant uses a screening-only approach for anti-drug antibody detection without confirmatory or neutralizing antibody assays. The FDA multi-tiered approach (screen, confirm, titer, NAb) is the established standard. Can the applicant justify this deviation?',
    check(answers) {
      const strategy = String(answers.ada_assay_strategy ?? '').toLowerCase();
      if (strategy.includes('screening_only') || strategy === 'screening_only') {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'Only a screening assay is used for ADA detection without confirmatory or neutralizing antibody assays.',
          'Per FDA Immunogenicity Guidance (2019), a multi-tiered testing strategy is required: (1) screening assay, (2) confirmatory assay with drug competition, (3) titer determination, and (4) neutralizing antibody (NAb) assay to assess clinical impact.',
          'FDA Immunogenicity Guidance (2019); FDA ADA Assay Guidance (2019)',
          'Implement the full tiered ADA testing strategy: screening (bridging ELISA or ECL), confirmatory (drug competition), titer, and neutralizing antibody assay (cell-based or competitive ligand-binding).',
          ['ada_assay_strategy', 'ada_incidence', 'neutralizing_antibody_incidence'],
        );
      }
      return null;
    },
  },
  {
    id: rid('potency_assay_not_validated'),
    dimension: 'scientific_rigor',
    title: 'Potency Assay Not Validated',
    question: 'The potency assay has not been validated per ICH Q2(R2). Without a validated potency assay, how does the applicant propose to demonstrate consistent lot-to-lot potency for commercial release per 21 CFR 610.10?',
    check(answers) {
      if (answers.potency_assay_validated === false || answers.potency_assay_validated === 'no') {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'The potency assay is not validated, making it unsuitable for commercial lot release testing.',
          'Per 21 CFR 610.10 and ICH Q2(R2), the potency assay must be validated for accuracy, precision (repeatability and intermediate precision), specificity, linearity, range, and robustness before it can be used for lot release.',
          '21 CFR 610.10; ICH Q2(R2); ICH Q6B',
          'Complete full validation of the potency assay per ICH Q2(R2). Demonstrate method suitability through validation parameters appropriate for a biological assay, including system suitability criteria and reference standard qualification.',
          ['potency_assay_validated', 'potency_assay_type', 'reference_standard_established'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_reference_standard'),
    dimension: 'scientific_rigor',
    title: 'No Qualified Reference Standard',
    question: 'The applicant has not established a qualified reference standard. Per ICH Q6B, a reference standard is essential for potency calibration, lot release, and stability studies. Without one, how are analytical results traceable and consistent across the product lifecycle?',
    check(answers) {
      if (answers.reference_standard_established === false || answers.reference_standard_established === 'no') {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No qualified primary reference standard has been established for the biological product.',
          'Per ICH Q6B, a primary reference standard representative of the commercial product must be established, thoroughly characterized by orthogonal methods, and used for potency calibration and comparability.',
          'ICH Q6B; 21 CFR 610.10',
          'Establish a qualified primary reference standard from representative commercial-scale material. Characterize it by orthogonal analytical methods and define a reference standard management program including requalification and replacement protocols.',
          ['reference_standard_established', 'potency_assay_validated'],
        );
      }
      return null;
    },
  },
  {
    id: rid('lot_to_lot_variability'),
    dimension: 'scientific_rigor',
    title: 'Insufficient Process Validation Batches',
    question: 'The applicant has fewer than three process validation batches at commercial scale. With insufficient batch data, how can the Agency assess lot-to-lot consistency and confirm the manufacturing process is under control?',
    check(answers) {
      const batches = numericVal(answers.validation_batches);
      if (batches !== null && batches < 3) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          `The applicant has only ${batches} process validation batch(es) at commercial scale. The generally accepted minimum is three consecutive batches. With insufficient data, how can the Agency assess lot-to-lot consistency?`,
          `Only ${batches} process validation batch(es) reported, which is below the generally accepted minimum of three consecutive batches at commercial scale.`,
          'Per FDA Process Validation Guidance (2011), a minimum of three consecutive commercial-scale batches is typically expected for Stage 2 process qualification to demonstrate process reproducibility.',
          'FDA Process Validation Guidance (2011); ICH Q7',
          'Complete at least three consecutive process validation batches at commercial scale, demonstrating all CQAs are within acceptance criteria. Statistical analysis of batch data should confirm process capability.',
          ['validation_batches', 'process_validation_status', 'manufacturing_scale'],
        );
      }
      return null;
    },
  },

  /* ========== PRACTICAL FEASIBILITY (4 rules) ========== */
  {
    id: rid('cold_chain_not_validated'),
    dimension: 'practical_feasibility',
    title: 'Cold Chain Validation Not Addressed',
    question: 'The submission does not address cold chain validation for this biological product. Biologics are inherently sensitive to temperature excursions. How does the applicant ensure product integrity from manufacturing site to the point of administration?',
    check(answers) {
      // If no stability-related or storage info is given, and the product is a biologic
      // we flag cold chain concerns. We infer from missing upstream/downstream detail.
      const productClass = String(answers.product_class ?? '').toLowerCase();
      if (
        !productClass.includes('other') &&
        isBlank(answers.control_strategy) &&
        isBlank(answers.lot_release_specs)
      ) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'The BLA does not describe cold chain validation or temperature-controlled distribution requirements for this biological product.',
          'Per 21 CFR 600.15 and USP <1079>, biological products require validated cold chain storage and distribution. Temperature excursions can cause aggregation, denaturation, and loss of potency.',
          '21 CFR 600.15; USP <1079>; ICH Q5C',
          'Develop and validate a cold chain management plan including shipping qualification studies, temperature monitoring procedures, maximum allowable temperature excursion limits, and contingency procedures for out-of-range events.',
          ['control_strategy', 'lot_release_specs', 'product_class'],
        );
      }
      return null;
    },
  },
  {
    id: rid('scale_up_not_demonstrated'),
    dimension: 'practical_feasibility',
    title: 'Scale-Up to Commercial Scale Not Completed',
    question: 'The applicant has not completed scale-up to commercial manufacturing scale. Scale-dependent parameters — mixing, oxygen transfer, shear stress — can significantly impact product quality attributes. What is the applicant\'s scale-up strategy and timeline?',
    check(answers) {
      if (answers.scale_up_completed === false || answers.scale_up_completed === 'no') {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Scale-up from clinical to commercial manufacturing scale has not been completed.',
          'Per FDA Process Validation Guidance (2011) and ICH Q5E, scale-up must be completed and product comparability demonstrated before a BLA can be approved. Scale-dependent parameters can impact CQAs.',
          'FDA Process Validation Guidance (2011); ICH Q5E; 21 CFR 601.2',
          'Complete scale-up to commercial manufacturing scale with a documented scale-up rationale. Conduct a comparability assessment per ICH Q5E between clinical-scale and commercial-scale product covering all CQAs.',
          ['scale_up_completed', 'manufacturing_scale', 'comparability_study_needed'],
        );
      }
      return null;
    },
  },
  {
    id: rid('safety_database_inadequate'),
    dimension: 'practical_feasibility',
    title: 'Safety Database May Be Inadequate for Licensure',
    question: 'The safety database includes fewer than 1,500 patients, which falls below the ICH E1 threshold for non-life-threatening conditions. Can the applicant justify the adequacy of the safety database, or are additional safety studies planned?',
    check(answers) {
      const totalExposed = numericVal(answers.total_exposed);
      if (totalExposed !== null && totalExposed < 1500) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          `The safety database includes ${totalExposed} patients, which falls below the ICH E1 threshold of 1,500 for non-life-threatening conditions. Can the applicant justify the adequacy of the safety database?`,
          `Total patient exposure of ${totalExposed} is below the ICH E1 recommended minimum of 1,500 patients for safety assessment.`,
          'Per ICH E1, at least 1,500 patients should be exposed to the drug for non-life-threatening conditions, with 300-600 exposed for 6 months and 100 for 12 months for chronic-use products.',
          'ICH E1; 21 CFR 601.2; FDA Guidance on Safety Databases',
          'Provide a detailed justification for the smaller safety database (e.g., rare disease, oncology, unmet need). Consider whether a post-marketing safety study or registry is needed to supplement the pre-approval database.',
          ['total_exposed', 'database_adequate_per_ich_e1', 'exposure_6_months', 'exposure_12_months'],
        );
      }
      return null;
    },
  },
  {
    id: rid('viral_clearance_incomplete'),
    dimension: 'practical_feasibility',
    title: 'Viral Clearance Validation Not Completed',
    question: 'Viral clearance validation studies have not been completed. Per ICH Q5A(R2), the purification process must demonstrate adequate removal and inactivation of model viruses before the BLA can be approved. What is the applicant\'s timeline for completing these studies?',
    check(answers) {
      const vcStatus = String(answers.viral_clearance_studies ?? '').toLowerCase();
      if (vcStatus === 'planned' || vcStatus === 'in_progress') {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          `Viral clearance validation status is "${answers.viral_clearance_studies}" — not yet completed.`,
          'Per ICH Q5A(R2), viral clearance validation must demonstrate effective removal/inactivation using model viruses covering different physicochemical properties (enveloped/non-enveloped, DNA/RNA, large/small).',
          'ICH Q5A(R2); 21 CFR 601.2',
          'Complete viral clearance validation studies using at least four model viruses (e.g., MuLV, PRV for enveloped; MVM, Reo-3 for non-enveloped). Target a combined log reduction value of >18 log10 for enveloped viruses.',
          ['viral_clearance_studies', 'viral_clearance_log_reduction', 'purification_steps'],
        );
      }
      return null;
    },
  },

  /* ========== DOCUMENTATION (5 rules) ========== */
  {
    id: rid('no_ctd_module_3'),
    dimension: 'documentation',
    title: 'CTD Module 3 Quality Documentation Insufficient',
    question: 'The submission does not contain adequate Module 3 (Quality) documentation for the biological product. Per ICH M4Q and 21 CFR 601.2, where is the comprehensive description of the drug substance and drug product manufacturing, characterization, and control?',
    check(answers) {
      // Check for missing core manufacturing documentation
      if (isBlank(answers.upstream_process) && isBlank(answers.downstream_process)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Neither upstream nor downstream manufacturing process descriptions are provided, indicating CTD Module 3 documentation is incomplete.',
          'Per ICH M4Q (CTD Quality) and 21 CFR 601.2, the BLA must include comprehensive Module 3 documentation covering drug substance (S) and drug product (P) sections including manufacturing process description, process controls, characterization, and specifications.',
          'ICH M4Q; 21 CFR 601.2; ICH Q6B',
          'Prepare complete CTD Module 3 documentation including S.2 (Manufacture), S.3 (Characterisation), S.4 (Control of Drug Substance), P.2 (Pharmaceutical Development), P.3 (Manufacture), and P.5 (Control of Drug Product).',
          ['upstream_process', 'downstream_process', 'manufacturing_sites'],
        );
      }
      return null;
    },
  },
  {
    id: rid('missing_cqa_documentation'),
    dimension: 'documentation',
    title: 'Critical Quality Attributes Not Documented',
    question: 'The submission does not document critical quality attributes (CQAs). Without defined CQAs, how does the applicant link process parameters to product quality and justify the control strategy?',
    check(answers) {
      if (isBlank(answers.critical_quality_attributes) || (answers.cqas_defined === false || answers.cqas_defined === 'no')) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'Critical quality attributes are not adequately documented in the BLA.',
          'Per ICH Q8(R2), Q9, and Q10, CQAs must be identified, justified, and linked to the process control strategy. CQA definitions are essential for risk-based manufacturing process development.',
          'ICH Q8(R2); ICH Q6B; ICH Q9; ICH Q10',
          'Document all identified CQAs with their rationale (e.g., glycosylation pattern — impacts ADCC; aggregate level — impacts immunogenicity). Map each CQA to the CPPs that influence it and define acceptance criteria.',
          ['critical_quality_attributes', 'cqas_defined', 'cpps_defined'],
        );
      }
      return null;
    },
  },
  {
    id: rid('viral_clearance_undocumented'),
    dimension: 'documentation',
    title: 'Viral Clearance Study Results Not Documented',
    question: 'The applicant indicates viral clearance studies are completed, but does not provide the overall log reduction values. Per ICH Q5A(R2), the Agency requires documented clearance values for each step and in total for both enveloped and non-enveloped model viruses.',
    check(answers) {
      const vcStatus = String(answers.viral_clearance_studies ?? '').toLowerCase();
      if (vcStatus === 'completed' && isBlank(answers.viral_clearance_log_reduction)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'Viral clearance studies are reported as completed, but the overall log reduction values are not documented.',
          'Per ICH Q5A(R2), viral clearance validation results must be documented with log reduction values for each individual step and cumulative clearance for each model virus.',
          'ICH Q5A(R2)',
          'Document the viral clearance validation results including: (1) model viruses used, (2) individual step clearance (inactivation and removal) in log10, (3) cumulative log reduction factors, and (4) overall safety factor assessment.',
          ['viral_clearance_log_reduction', 'viral_clearance_studies', 'purification_steps'],
        );
      }
      return null;
    },
  },
  {
    id: rid('missing_sponsor'),
    dimension: 'documentation',
    title: 'Sponsor Identification Missing',
    question: 'The BLA does not identify the sponsor/applicant. Per 21 CFR 601.2, every BLA must clearly identify the responsible applicant. Who is the sponsor of record for this submission?',
    check(answers) {
      if (isBlank(answers.sponsor_name)) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'The sponsor name is not specified in the BLA submission.',
          'Per 21 CFR 601.2 and 42 USC 262, the BLA must identify the applicant, including full legal name, address, and responsible individual.',
          '21 CFR 601.2; 42 USC 262(a)',
          'Provide the sponsor name, address, and designated regulatory contact. Foreign sponsors must also designate a US Agent per 21 CFR 600.4.',
          ['sponsor_name', 'sponsor_address', 'regulatory_contact'],
        );
      }
      return null;
    },
  },
  {
    id: rid('no_forced_degradation'),
    dimension: 'documentation',
    title: 'Forced Degradation Studies Not Completed',
    question: 'Forced degradation studies have not been completed. These studies are essential for identifying degradation pathways and confirming the stability-indicating capability of the analytical methods. How does the applicant intend to demonstrate method suitability without this data?',
    check(answers) {
      if (answers.forced_degradation_completed === false || answers.forced_degradation_completed === 'no') {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'Forced degradation studies have not been completed for the biological product.',
          'Per ICH Q1A(R2) and ICH Q5C, forced degradation studies (thermal, oxidative, photolytic, pH extremes, mechanical stress) are expected to identify degradation pathways and confirm that analytical methods are stability-indicating.',
          'ICH Q1A(R2); ICH Q5C; ICH Q6B',
          'Complete forced degradation studies under thermal, oxidative, photolytic, pH, and mechanical stress conditions. Use the results to confirm the stability-indicating nature of release and stability methods.',
          ['forced_degradation_completed', 'critical_quality_attributes'],
        );
      }
      return null;
    },
  },

  /* ========== RISK IDENTIFICATION (5 rules) ========== */
  {
    id: rid('no_immunogenicity_risk_classification'),
    dimension: 'risk_identification',
    title: 'No Immunogenicity Risk Classification',
    question: 'The submission does not identify immunogenicity risk factors for this biological product. Per FDA Immunogenicity Guidance, a risk-based approach must inform the immunogenicity assessment strategy. Has the applicant conducted a formal immunogenicity risk assessment?',
    check(answers) {
      if (isBlank(answers.immunogenicity_risk_factors)) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'No immunogenicity risk factors have been identified or documented.',
          'Per FDA Immunogenicity Guidance (2014/2019), a risk-based approach is required. Risk factors include product-related factors (aggregates, novel sequences, glycosylation), patient-related factors (immune status, genetic predisposition), and treatment-related factors (route, dose, duration).',
          'FDA Immunogenicity Guidance (2014); FDA Immunogenicity Guidance (2019); ICH S6(R1)',
          'Conduct a formal immunogenicity risk assessment identifying product-related, patient-related, and treatment-related risk factors. Use the risk classification (high, moderate, low) to design the appropriate ADA testing strategy and mitigation plan.',
          ['immunogenicity_risk_factors', 'ada_assay_strategy', 'mitigation_strategies'],
        );
      }
      return null;
    },
  },
  {
    id: rid('cytokine_release_risk'),
    dimension: 'risk_identification',
    title: 'Cytokine Release Syndrome Risk Not Adequately Addressed',
    question: 'The product\'s safety profile includes cytokine release syndrome as a special interest safety event, yet no mitigation or management strategy is described. For products with CRS risk, this is a significant labeling and REMS consideration. What is the applicant\'s risk management plan?',
    check(answers) {
      const specialInterests = answers.special_safety_interests;
      if (
        Array.isArray(specialInterests) &&
        specialInterests.includes('cytokine_release') &&
        isBlank(answers.comparable_product_rems) &&
        (answers.rems_required === 'no' || isBlank(answers.rems_required))
      ) {
        return finding(
          this.id,
          this.dimension,
          'warning',
          this.title,
          this.question,
          'Cytokine release syndrome is identified as a special safety interest but no REMS or risk mitigation plan appears to be in place.',
          'Products with significant CRS risk (e.g., CAR-T therapies, bispecific antibodies, T-cell engagers) typically require a REMS with ETASU per 21 USC 355-1. CRS grading per ASTCT consensus criteria and management algorithms should be included in labeling.',
          '21 USC 355-1; FDA REMS Guidance; ASTCT Consensus CRS Grading',
          'Develop a comprehensive CRS risk management plan including: (1) grading criteria (ASTCT or modified Lee criteria), (2) management algorithm (tocilizumab, corticosteroids), (3) prescriber certification program, (4) certified treatment center requirements, and (5) patient monitoring requirements.',
          ['special_safety_interests', 'rems_required', 'rems_elements', 'boxed_warning_anticipated'],
        );
      }
      return null;
    },
  },
  {
    id: rid('adventitious_agent_risk'),
    dimension: 'risk_identification',
    title: 'Adventitious Agent Contamination Risk Not Mitigated',
    question: 'The applicant uses animal-derived raw materials but has not completed a TSE/BSE risk assessment. What steps is the applicant taking to mitigate the risk of adventitious agent contamination from animal-origin materials?',
    check(answers) {
      if (
        (answers.raw_materials_animal_origin === true || answers.raw_materials_animal_origin === 'yes') &&
        (answers.tse_risk_assessment === false || answers.tse_risk_assessment === 'no' || isBlank(answers.tse_risk_assessment))
      ) {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Animal-derived raw materials are used in manufacturing but no TSE/BSE risk assessment has been completed.',
          'Per EMEA/410/01 Rev.3, FDA guidance, and ICH Q5A(R2), any use of animal-derived raw materials (bovine serum, porcine trypsin, etc.) requires a documented TSE/BSE risk assessment including sourcing from BSE-free countries, certificates of suitability, and viral inactivation steps.',
          'EMEA/410/01 Rev.3; ICH Q5A(R2); 9 CFR 113',
          'Complete a TSE/BSE risk assessment for all animal-derived raw materials. Document country of origin, tissue type, sourcing certificates, and any viral/TSE inactivation steps. Consider transitioning to non-animal-derived alternatives where feasible.',
          ['raw_materials_animal_origin', 'tse_risk_assessment', 'adventitious_agent_testing'],
        );
      }
      return null;
    },
  },
  {
    id: rid('ada_cross_reactivity_risk'),
    dimension: 'risk_identification',
    title: 'Cross-Reactive Antibodies May Neutralize Endogenous Counterpart',
    question: 'The applicant reports that ADA cross-react with the endogenous protein counterpart. This raises a serious safety concern — neutralization of an essential endogenous protein could cause life-threatening deficiency syndromes. What is the applicant\'s risk mitigation strategy?',
    check(answers) {
      if (answers.cross_reactive_antibodies === true || answers.cross_reactive_antibodies === 'yes') {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'Anti-drug antibodies cross-react with the endogenous protein counterpart, creating a risk of endogenous protein neutralization.',
          'Cross-reactive ADA that neutralize endogenous proteins can cause life-threatening deficiency syndromes (e.g., pure red cell aplasia with EPO, acquired hemophilia with Factor VIII). Per FDA Immunogenicity Guidance (2014), this must be specifically evaluated for products with endogenous counterparts.',
          'FDA Immunogenicity Guidance (2014); ICH S6(R1)',
          'Implement a comprehensive risk mitigation strategy including: (1) assay to specifically detect cross-reactive antibodies, (2) clinical monitoring protocol for deficiency symptoms, (3) labeling warnings, (4) REMS evaluation, and (5) post-marketing surveillance for late-onset cross-reactivity.',
          ['cross_reactive_antibodies', 'ada_impact_on_safety', 'boxed_warning_anticipated'],
        );
      }
      return null;
    },
  },
  {
    id: rid('primary_endpoint_not_met'),
    dimension: 'risk_identification',
    title: 'Pivotal Study Primary Endpoint Not Met',
    question: 'The pivotal study did not meet its primary endpoint. This is the most fundamental requirement for demonstrating substantial evidence of effectiveness. On what basis does the applicant believe the BLA is approvable without a positive pivotal study result?',
    check(answers) {
      if (answers.primary_endpoint_met === false || answers.primary_endpoint_met === 'no') {
        return finding(
          this.id,
          this.dimension,
          'critical',
          this.title,
          this.question,
          'The pivotal study did not meet its pre-specified primary endpoint.',
          'Per 21 CFR 601.2 and 21 CFR 314.126, substantial evidence of effectiveness requires adequate and well-controlled investigations demonstrating the product is effective for its proposed indication. Failure on the primary endpoint raises fundamental questions about approvability.',
          '21 CFR 601.2; 21 CFR 314.126; ICH E9',
          'Consider: (1) whether secondary or exploratory endpoints provide compelling supportive evidence, (2) whether a post-hoc subgroup demonstrates clear benefit, (3) whether an additional pivotal study is needed, or (4) whether an alternative regulatory pathway (e.g., accelerated approval based on a different endpoint) is viable.',
          ['primary_endpoint_met', 'primary_endpoint_result', 'hazard_ratio_or_effect', 'p_value'],
        );
      }
      return null;
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Factory                                                           */
/* ------------------------------------------------------------------ */

export function createBlaAuditor(): WarGameAuditor {
  return {
    category: 'bla',
    name: 'FDA Biologics License Application Reviewer',
    description:
      'Simulates an FDA reviewer performing a comprehensive BLA (Biologics License Application) ' +
      'assessment per 42 USC 262 and 21 CFR 601, evaluating biologic characterization, manufacturing ' +
      'process controls, viral safety, immunogenicity, clinical efficacy and safety, regulatory ' +
      'alignment (including 351(a) novel and 351(k) biosimilar pathways), and risk identification.',
    rules,
  };
}
