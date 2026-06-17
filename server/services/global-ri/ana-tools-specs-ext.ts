/**
 * Global-RI AnA tool specs — extended catalog (CMC, access, evidence & supply).
 *
 * Data only — wiring lives in ./ana-tools-dispatch. See ./ana-tools-specs-core for
 * the core regulatory-strategy/lifecycle specs.
 *
 * @module server/services/global-ri/ana-tools-specs-ext
 */

import type { AnaAdvisoryToolSpec } from '../ana-advisory/types';

const CMC_SPECIFICATIONS_TOOL: AnaAdvisoryToolSpec = {
  name: 'global_ri_cmc_specifications',
  description:
    'Deterministic, registry-grounded lookup (no LLM, no fabrication) of the ICH Q6A/Q6B specification TEST set ' +
    'for a drug substance/product. Returns the universal tests plus the dosage-form-specific tests (e.g. solid-oral ' +
    'dissolution + uniformity of dosage units; parenteral sterility + endotoxins). Lists the expected tests, not numeric limits.',
  input_schema: {
    type: 'object',
    properties: {
      productType: { type: 'string', enum: ['small_molecule', 'biologic'], description: 'Chemical (Q6A) or biological (Q6B) product.' },
      dosageForm: { type: 'string', enum: ['solid_oral', 'oral_liquid', 'parenteral'], description: 'Optional dosage form for form-specific tests.' },
    },
    required: ['productType'],
  },
};

const BIOEQUIVALENCE_CRITERIA_TOOL: AnaAdvisoryToolSpec = {
  name: 'global_ri_bioequivalence_criteria',
  description:
    'Deterministic, registry-grounded lookup (no LLM, no fabrication) of the bioequivalence acceptance criteria for ' +
    'a region (FDA/EMA): the PK parameters, the 90% confidence interval acceptance range (80.00–125.00%), the typical ' +
    'crossover design, and the highly-variable-drug approach (RSABE/ABEL).',
  input_schema: {
    type: 'object',
    properties: { region: { type: 'string', enum: ['FDA', 'EMA'], description: 'Regulatory region.' } },
    required: ['region'],
  },
};

const BCS_BIOWAIVER_TOOL: AnaAdvisoryToolSpec = {
  name: 'global_ri_bcs_biowaiver',
  description:
    'Deterministic, registry-grounded lookup (no LLM, no fabrication) of ICH M9 BCS biowaiver eligibility for a BCS ' +
    'class (I/II/III/IV): whether an in-vivo BE study can be waived, with the solubility/permeability profile and conditions.',
  input_schema: {
    type: 'object',
    properties: { bcsClass: { type: 'string', enum: ['I', 'II', 'III', 'IV'], description: 'Biopharmaceutics Classification System class.' } },
    required: ['bcsClass'],
  },
};

const EXPANDED_ACCESS_TOOL: AnaAdvisoryToolSpec = {
  name: 'global_ri_expanded_access',
  description:
    'Deterministic, registry-grounded lookup (no LLM, no fabrication) of the pre-approval access mechanism ' +
    '(expanded access / compassionate use / named patient) for a region and patient-population size. Returns the ' +
    'recommended mechanism, its scope, and the governing citation.',
  input_schema: {
    type: 'object',
    properties: {
      region: { type: 'string', enum: ['FDA', 'EU', 'JP'], description: 'Regulatory region.' },
      populationSize: { type: 'string', enum: ['individual', 'intermediate', 'widespread'], description: 'Intended patient-population size.' },
    },
    required: ['region', 'populationSize'],
  },
};

const ADVANCED_THERAPY_TOOL: AnaAdvisoryToolSpec = {
  name: 'global_ri_advanced_therapy',
  description:
    'Deterministic, registry-grounded lookup (no LLM, no fabrication) classifying an advanced therapy (ATMP / cell & ' +
    'gene / regenerative) for a region. Returns the classification (e.g. EU GTMP/sCTMP/TEP), regulatory route, oversight ' +
    'body, and citation.',
  input_schema: {
    type: 'object',
    properties: {
      region: { type: 'string', enum: ['EU', 'FDA', 'JP'], description: 'Regulatory region.' },
      modality: { type: 'string', enum: ['gene_therapy', 'cell_therapy', 'tissue_engineered', 'combined'], description: 'Therapy modality.' },
    },
    required: ['region', 'modality'],
  },
};

const COMPANION_DIAGNOSTIC_TOOL: AnaAdvisoryToolSpec = {
  name: 'global_ri_companion_diagnostic',
  description:
    'Deterministic, registry-grounded lookup (no LLM, no fabrication) of the companion-diagnostic (CDx) regulatory ' +
    'framework for a region (FDA Class III/PMA contemporaneous approval; EU IVDR Class C + Notified Body medicines ' +
    'consultation). Returns classification, route, consultation requirement, and citation.',
  input_schema: {
    type: 'object',
    properties: { region: { type: 'string', enum: ['FDA', 'EU'], description: 'Regulatory region.' } },
    required: ['region'],
  },
};

const PROMOTIONAL_COMPLIANCE_TOOL: AnaAdvisoryToolSpec = {
  name: 'global_ri_promotional_compliance',
  description:
    'Deterministic, registry-grounded lookup (no LLM, no fabrication) of prescription-medicine promotion/advertising ' +
    'rules for a region (FDA OPDP fair-balance/off-label/Form 2253; EU Title VIII POM-advertising controls). Returns the ' +
    'rule set with citations.',
  input_schema: {
    type: 'object',
    properties: { region: { type: 'string', enum: ['FDA', 'EU'], description: 'Regulatory region.' } },
    required: ['region'],
  },
};

const CONTROLLED_SUBSTANCE_TOOL: AnaAdvisoryToolSpec = {
  name: 'global_ri_controlled_substance',
  description:
    'Deterministic, registry-grounded lookup (no LLM, no fabrication) of a US DEA controlled-substance schedule (I–V): ' +
    'abuse potential, accepted medical use, representative examples, and key controls (Controlled Substances Act).',
  input_schema: {
    type: 'object',
    properties: { schedule: { type: 'string', enum: ['I', 'II', 'III', 'IV', 'V'], description: 'DEA schedule.' } },
    required: ['schedule'],
  },
};

const PROCESS_VALIDATION_TOOL: AnaAdvisoryToolSpec = {
  name: 'global_ri_process_validation',
  description:
    'Deterministic, guidance-grounded lookup (no LLM, no fabrication) of the process-validation framework for a region ' +
    '(FDA 3-stage lifecycle; EU GMP Annex 15 DQ/IQ/OQ/PQ). Returns the stages, approaches, and citations.',
  input_schema: {
    type: 'object',
    properties: { region: { type: 'string', enum: ['FDA', 'EU'], description: 'Regulatory region.' } },
    required: ['region'],
  },
};

const EVIDENCE_STANDARD_TOOL: AnaAdvisoryToolSpec = {
  name: 'global_ri_evidence_standard',
  description:
    'Deterministic, regulation-grounded lookup (no LLM, no fabrication) of the standard of evidence for efficacy ' +
    '(FDA substantial evidence / adequate and well-controlled; EU pivotal trials). Returns the study requirement, ' +
    'single-study acceptability + criteria, well-controlled features, and citation.',
  input_schema: {
    type: 'object',
    properties: { region: { type: 'string', enum: ['FDA', 'EU'], description: 'Regulatory region.' } },
    required: ['region'],
  },
};

/** Extended global-RI tool specs (CMC, access, evidence & supply chain). */
export const GLOBAL_RI_EXT_TOOL_SPECS: AnaAdvisoryToolSpec[] = [
  CMC_SPECIFICATIONS_TOOL,
  BIOEQUIVALENCE_CRITERIA_TOOL,
  BCS_BIOWAIVER_TOOL,
  EXPANDED_ACCESS_TOOL,
  ADVANCED_THERAPY_TOOL,
  COMPANION_DIAGNOSTIC_TOOL,
  PROMOTIONAL_COMPLIANCE_TOOL,
  CONTROLLED_SUBSTANCE_TOOL,
  PROCESS_VALIDATION_TOOL,
  EVIDENCE_STANDARD_TOOL,
];
