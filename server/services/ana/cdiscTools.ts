/**
 * CDISC conformance tool definitions — exposes the SDTM/ADaM validation and
 * define.xml generation service to AnA as deterministic tools.
 *
 * Handlers live in AnaToolExecutor.ts (registerToolHandler) and dispatch to the
 * matching `../cdisc/cdisc-conformance-service` functions. Both tools are
 * pure deterministic logic (no LLM, no network, no DB), so the pedigree
 * classifier lists them in DETERMINISTIC_QUERY_NAMES.
 *
 * NOTE: The legacy validate_cdisc_dataset, run_cdisc_pipeline, and
 * generate_define_xml tools live in extendedRegulatoryTools.ts and
 * advancedModelingTools.ts respectively (with matching handlers in
 * AnaToolExecutor.ts). They are NOT duplicated here to avoid name collisions
 * in ALL_ANA_TOOLS.
 *
 * @module server/services/ana/cdiscTools
 */

import type { AnaTool } from '../ai-gateway/types';

// ─────────────────────────────────────────────────────────────────────────────
// CDISC conformance-service tools (cdisc-conformance-service.ts)
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
  VALIDATE_SDTM_DATASET,
  VALIDATE_ADAM_DATASET,
];
