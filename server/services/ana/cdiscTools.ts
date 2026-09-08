/**
 * CDISC conformance tool definitions — exposes the SDTM/ADaM validation and
 * define.xml generation service to AnA as deterministic tools.
 *
 * Handlers live in AnaToolExecutor.ts (registerToolHandler) and dispatch to the
 * matching `../cdisc/cdisc-conformance-service` functions. All three tools are
 * pure deterministic logic (no LLM, no network, no DB), so the pedigree
 * classifier lists them in DETERMINISTIC_QUERY_NAMES.
 *
 * This file also used to define `run_cdisc_pipeline` and `generate_define_xml`.
 * Both names are defined earlier in ALL_ANA_TOOLS (advancedModelingTools and
 * extendedRegulatoryTools), which spreads first and wins, so neither definition
 * here ever reached the model — and the `generate_define_xml` one described a
 * different input shape (`domain`, `type: 'Char' | 'Num'`) than the handler
 * accepts, so it would have produced an unusable define.xml had it won. Both are
 * deleted; the winning definitions are the ones to edit.
 *
 * @module server/services/ana/cdiscTools
 */

import type { AnaTool } from '../ai-gateway/types';

// ─────────────────────────────────────────────────────────────────────────────
// Existing CDISC tools (preserved — handlers already registered)
// ─────────────────────────────────────────────────────────────────────────────

const VALIDATE_CDISC_DATASET: AnaTool = {
  name: 'validate_cdisc_dataset',
  description:
    'Validate an SDTM or ADaM dataset spec against structural conformance rules (variable naming, ' +
    'required identifiers, data types, codelist resolution). Returns severity-tagged findings. ' +
    'Honest scope: covers structural/metadata rules — run Pinnacle21 for full validator-of-record clearance.',
  input_schema: {
    type: 'object',
    properties: {
      studyName: { type: 'string', description: 'Study name / identifier' },
      standard: { type: 'string', enum: ['SDTM', 'ADaM'], description: 'CDISC standard (SDTM or ADaM)' },
      datasets: {
        type: 'array',
        description: 'Array of dataset descriptors',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Dataset/domain name (e.g. DM, AE, ADSL)' },
            label: { type: 'string', description: 'Dataset label' },
            datasetClass: { type: 'string', description: 'Observation class (EVENTS, FINDINGS, etc.)' },
            variables: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  label: { type: 'string' },
                  type: { type: 'string', enum: ['text', 'integer', 'float', 'date', 'datetime', 'time'] },
                  length: { type: 'number' },
                  codelist: { type: 'string' },
                  mandatory: { type: 'boolean' },
                },
                required: ['name', 'label', 'type'],
              },
            },
          },
          required: ['name', 'label', 'variables'],
        },
      },
      codelists: {
        type: 'array',
        description: 'Optional codelist definitions',
        items: {
          type: 'object',
          properties: {
            oid: { type: 'string' },
            name: { type: 'string' },
            type: { type: 'string' },
            items: { type: 'array', items: { type: 'object', properties: { code: { type: 'string' }, decode: { type: 'string' } } } },
          },
          required: ['oid', 'name'],
        },
      },
    },
    required: ['studyName', 'standard', 'datasets'],
  },
} as unknown as AnaTool;

// ─────────────────────────────────────────────────────────────────────────────
// New CDISC conformance-service tools (cdisc-conformance-service.ts)
// ─────────────────────────────────────────────────────────────────────────────

const CDISC_NOTE =
  'Pure deterministic CDISC standards check — no LLM, no network. Cite rule codes and messages verbatim; do not fabricate or reinterpret findings.';

export const VALIDATE_SDTM_DATASET: AnaTool = {
  name: 'validate_sdtm_dataset',
  description:
    'Validate an SDTM dataset descriptor against SDTM IG 3.4 rules. Checks domain code, required variables, naming conventions. Returns structured findings with severity. ' +
    CDISC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      domain: { type: 'string', description: 'SDTM domain code (DM, AE, CM, LB, VS, EX, DS, MH, etc.)' },
      variables: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            label: { type: 'string' },
            type: { type: 'string', enum: ['Char', 'Num'] },
            length: { type: 'number' },
          },
          required: ['name'],
        },
        description: 'Variable definitions in the dataset',
      },
    },
    required: ['domain', 'variables'],
  },
};

export const VALIDATE_ADAM_DATASET: AnaTool = {
  name: 'validate_adam_dataset',
  description:
    'Validate an ADaM dataset descriptor against ADaM IG 1.3 rules. Checks dataset name, required variables, naming conventions. Returns structured findings with severity. ' +
    CDISC_NOTE,
  input_schema: {
    type: 'object',
    properties: {
      dataset: { type: 'string', description: 'ADaM dataset name (ADSL, ADAE, ADTTE, ADLB, etc.)' },
      variables: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            label: { type: 'string' },
            type: { type: 'string', enum: ['Char', 'Num'] },
            length: { type: 'number' },
          },
          required: ['name'],
        },
        description: 'Variable definitions in the dataset',
      },
    },
    required: ['dataset', 'variables'],
  },
};

/** CDISC conformance tools, spread into ALL_ANA_TOOLS. */
export const CDISC_TOOLS: AnaTool[] = [
  VALIDATE_CDISC_DATASET,
  VALIDATE_SDTM_DATASET,
  VALIDATE_ADAM_DATASET,
];
