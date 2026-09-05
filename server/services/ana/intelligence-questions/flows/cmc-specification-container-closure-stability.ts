/**
 * CMC Specification flow — Section 7: Container Closure & Stability nodes.
 *
 * Sibling module of `cmc-specification.ts`: defines the container closure
 * system and stability program question nodes (per ICH Q1A(R2)–Q1F, Q1B,
 * Q1E, and FDA Container Closure guidance) that
 * `createCmcSpecificationFlow()` composes into the flow's `nodes` array.
 *
 * @module server/services/ana/intelligence-questions/flows/cmc-specification-container-closure-stability
 */

import type { QuestionNode } from '../../../../../shared/types/intelligence-questions.js';

export function createContainerClosureStabilityNodes(): QuestionNode[] {
  return [
    {
      id: 'container_closure',
      section: 'Container Closure & Stability',
      question:
        'Describe the container closure system for the drug product.',
      guidance:
        'Per ICH Q8(R2) and FDA Guidance on Container Closure Systems, the container closure system must protect the drug product throughout its shelf life, be compatible with the dosage form, and (for parenteral products) maintain sterility. Include extractables and leachables (E&L) assessment.',
      fields: [
        {
          id: 'primary_packaging',
          label: 'Primary Container Closure System',
          type: 'textarea',
          placeholder:
            'e.g., 10 mL Type I borosilicate glass vial with 20 mm bromobutyl rubber stopper and aluminum flip-off seal',
          helpText:
            'Describe the primary container closure system including materials of construction (glass type, rubber formulation, plastic type), dimensions, and suppliers.',
          required: true,
          validation: { minLength: 10, maxLength: 3000 },
        },
        {
          id: 'secondary_packaging',
          label: 'Secondary / Tertiary Packaging',
          type: 'textarea',
          placeholder: 'e.g., Carton, shipper, cold chain packaging',
          helpText: 'Describe secondary and tertiary packaging components. Include cold chain requirements if applicable.',
          required: false,
          validation: { maxLength: 2000 },
        },
        {
          id: 'el_assessment',
          label: 'Has an Extractables & Leachables (E&L) assessment been performed?',
          type: 'yes_no',
          required: true,
          helpText:
            'Per FDA guidance and PQRI recommendations, E&L studies should be performed for inhalation, ophthalmic, parenteral, and transdermal products. The assessment evaluates potential chemical migration from container closure components into the drug product.',
        },
        {
          id: 'el_assessment_details',
          label: 'E&L Assessment Summary',
          type: 'textarea',
          placeholder: 'Summarize E&L study design, key findings, and toxicological risk assessment of identified leachables.',
          helpText: 'Provide an overview of the extractables study (controlled extraction) and leachables study (drug product contact) results.',
          required: true,
          visibleWhen: { field: 'el_assessment', operator: 'eq', value: true },
          validation: { minLength: 20, maxLength: 5000 },
        },
        {
          id: 'cci_testing',
          label: 'Container Closure Integrity (CCI) Testing',
          type: 'select',
          required: false,
          options: [
            { value: 'not_applicable', label: 'Not Applicable (non-sterile solid oral)' },
            { value: 'dye_ingress', label: 'Dye Ingress / Blue Dye' },
            { value: 'vacuum_decay', label: 'Vacuum Decay' },
            { value: 'helium_leak', label: 'Helium Leak Detection' },
            { value: 'headspace_analysis', label: 'Headspace Analysis (O₂ / CO₂)' },
            { value: 'hlpc', label: 'High-Voltage Leak Detection (HVLD)' },
            { value: 'microbial_ingress', label: 'Microbial Ingress' },
            { value: 'other', label: 'Other' },
          ],
          helpText:
            'For sterile products, describe the CCI test method used to demonstrate that the container closure system maintains sterility throughout shelf life.',
        },
      ],
      issueChecks: [
        {
          id: 'cmc_no_el_assessment',
          condition: { field: 'el_assessment', operator: 'eq', value: false },
          severity: 'warning',
          title: 'E&L Assessment Not Performed',
          message:
            'Extractables and leachables assessment is expected for parenteral, ophthalmic, inhalation, and transdermal products. For oral solid dosage forms, a risk-based justification for not performing E&L may be acceptable. Ensure the rationale is documented.',
          reference: 'FDA Guidance: Container Closure Systems for Packaging Human Drugs and Biologics, PQRI E&L Recommendations',
        },
      ],
      defaultNext: 'stability_program',
    },

    {
      id: 'stability_program',
      section: 'Container Closure & Stability',
      question:
        'Describe the stability program for the drug substance and drug product.',
      guidance:
        'Per ICH Q1A(R2)–Q1F, stability studies must be conducted under defined storage conditions to establish shelf life (retest period for drug substance, expiration date for drug product). Include long-term, accelerated, and (if applicable) intermediate conditions. Photostability per ICH Q1B is also required.',
      provideExpertFeedback: true,
      fields: [
        {
          id: 'ds_stability_conditions',
          label: 'Drug Substance Stability Conditions',
          type: 'multi_select',
          required: true,
          options: [
            { value: 'long_term_25', label: '25°C / 60% RH (Long-Term)' },
            { value: 'long_term_30', label: '30°C / 65% RH (Long-Term, Zone III/IV)' },
            { value: 'intermediate', label: '30°C / 65% RH (Intermediate)' },
            { value: 'accelerated', label: '40°C / 75% RH (Accelerated)' },
            { value: 'refrigerated', label: '5°C ± 3°C (Refrigerated)' },
            { value: 'frozen', label: '-20°C ± 5°C (Frozen)' },
            { value: 'photostability', label: 'Photostability (ICH Q1B)' },
            { value: 'stress', label: 'Stress / Forced Degradation' },
          ],
          helpText: 'Select all storage conditions included in the drug substance stability program per ICH Q1A(R2).',
        },
        {
          id: 'ds_stability_duration',
          label: 'Drug Substance Stability Data Duration (months)',
          type: 'number',
          placeholder: 'e.g., 24',
          helpText:
            'Longest duration of available long-term stability data for the drug substance. Per ICH Q1A(R2), at least 12 months of long-term data are needed for submission, with 6 months accelerated.',
          required: true,
          validation: { min: 0, max: 120 },
        },
        {
          id: 'dp_stability_conditions',
          label: 'Drug Product Stability Conditions',
          type: 'multi_select',
          required: true,
          options: [
            { value: 'long_term_25', label: '25°C / 60% RH (Long-Term)' },
            { value: 'long_term_30', label: '30°C / 65% RH (Long-Term, Zone III/IV)' },
            { value: 'intermediate', label: '30°C / 65% RH (Intermediate)' },
            { value: 'accelerated', label: '40°C / 75% RH (Accelerated)' },
            { value: 'refrigerated', label: '5°C ± 3°C (Refrigerated)' },
            { value: 'frozen', label: '-20°C ± 5°C (Frozen)' },
            { value: 'photostability', label: 'Photostability (ICH Q1B)' },
            { value: 'in_use', label: 'In-Use Stability' },
            { value: 'stress', label: 'Stress / Forced Degradation' },
          ],
          helpText: 'Select all storage conditions included in the drug product stability program per ICH Q1A(R2).',
        },
        {
          id: 'dp_stability_duration',
          label: 'Drug Product Stability Data Duration (months)',
          type: 'number',
          placeholder: 'e.g., 18',
          helpText:
            'Longest duration of available long-term stability data for the drug product. Per ICH Q1A(R2), 12 months minimum for submission with 6 months accelerated. Shelf life assignment per ICH Q1E.',
          required: true,
          validation: { min: 0, max: 120 },
        },
        {
          id: 'proposed_shelf_life',
          label: 'Proposed Shelf Life / Retest Period',
          type: 'text',
          placeholder: 'e.g., DS: 36 months at 2–8°C; DP: 24 months at 25°C/60% RH',
          helpText:
            'Proposed retest period (drug substance) and shelf life (drug product) with storage conditions. Must be supported by stability data per ICH Q1E.',
          required: true,
        },
        {
          id: 'stability_batches',
          label: 'Number of Stability Batches',
          type: 'text',
          placeholder: 'e.g., DS: 3 batches (pilot scale); DP: 3 batches (registration scale)',
          helpText:
            'Per ICH Q1A(R2), at least 3 batches of both drug substance and drug product should be placed on long-term and accelerated stability. Include batch scale information.',
          required: true,
        },
        {
          id: 'stability_indicating',
          label: 'Are stability-indicating methods in place?',
          type: 'yes_no',
          required: true,
          helpText:
            'Stability-indicating analytical methods must discriminate between the drug substance/product and its degradation products. Forced degradation studies (stress testing) are used to demonstrate that methods are stability-indicating.',
        },
      ],
      issueChecks: [
        {
          id: 'cmc_insufficient_stability_ds',
          condition: { field: 'ds_stability_duration', operator: 'lt', value: 12 },
          severity: 'warning',
          title: 'Insufficient Drug Substance Stability Data',
          message:
            'Per ICH Q1A(R2), at least 12 months of long-term stability data and 6 months of accelerated data are required at the time of NDA/BLA submission. Extrapolation beyond the available data may be possible per ICH Q1E, but is limited.',
          reference: 'ICH Q1A(R2), ICH Q1E Evaluation of Stability Data',
        },
        {
          id: 'cmc_insufficient_stability_dp',
          condition: { field: 'dp_stability_duration', operator: 'lt', value: 12 },
          severity: 'warning',
          title: 'Insufficient Drug Product Stability Data',
          message:
            'Per ICH Q1A(R2), at least 12 months of long-term stability data are needed at submission. If the proposed shelf life exceeds the available long-term data, extrapolation per ICH Q1E must be justified. Regulators frequently challenge shelf life claims not fully supported by data.',
          reference: 'ICH Q1A(R2), ICH Q1E Evaluation of Stability Data',
        },
        {
          id: 'cmc_no_stability_indicating',
          condition: { field: 'stability_indicating', operator: 'eq', value: false },
          severity: 'critical',
          title: 'Stability-Indicating Methods Not Established',
          message:
            'Stability-indicating analytical methods are essential for demonstrating that the drug substance/product specifications can detect degradation over time. Without stability-indicating methods, stability data cannot be considered reliable. Conduct forced degradation studies and validate stability-indicating capability per ICH Q2(R2).',
          reference: 'ICH Q2(R2) Validation of Analytical Procedures, ICH Q1A(R2) Section 2.2.5',
        },
      ],
      defaultNext: null,
    },
  ];
}
