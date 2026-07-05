/**
 * Predicate-intelligence tools — expose the predicate-intelligence shadow
 * service (proxied by server/routes/predicate-intelligence.ts) to AnA.
 *
 * `score_predicate_adequacy` (local rubric) and `analyze_predicate_device` (one
 * K-number's detail) already exist, but nothing let AnA DISCOVER and RANK
 * candidate predicates, auto-build the substantial-equivalence matrix, or read
 * the defense preview. These tools close that: each handler does the same
 * org→program ownership check the BFF route enforces, then calls the shadow
 * service directly (SHADOW_SERVICE_URL + X-Admin-Token) — the tool holds a
 * tenant context, not a JWT, so it cannot hop the authenticated localhost route.
 *
 * Handlers live in AnaToolExecutor.ts (registerToolHandler). Field names are
 * snake_case to match the shadow contract (the payload is passed through).
 *
 * @module server/services/ana/predicateIntelligenceTools
 */

import type { AnaTool } from '../ai-gateway/types';

export const SUGGEST_PREDICATE_DEVICES: AnaTool = {
  name: 'suggest_predicate_devices',
  description:
    "Discover and RANK candidate predicate devices for a 510(k) — the answer to 'find me the strongest predicates', which score_predicate_adequacy (a rubric on a predicate you already named) and analyze_predicate_device (one K-number's detail) cannot do. Scans the predicate universe and returns ranked suggestions each with a similarity score, defense-readiness score, toxicity/enforcement risk, strategy recommendation, reasoning, anticipated objections, and a defense-packet seed. Requires the subject device's product code, name, intended use, and technology description.",
  input_schema: {
    type: 'object',
    properties: {
      program_id: { type: 'string', description: 'The regulatory program UUID.' },
      product_code: { type: 'string', description: 'FDA product code of the subject device.' },
      device_name: { type: 'string' },
      intended_use: { type: 'string' },
      technology_description: { type: 'string' },
      materials: { type: 'array', items: { type: 'string' } },
      energy_source: { type: 'string' },
      tissue_contact: { type: 'string' },
      duration: { type: 'string' },
      software_present: { type: 'boolean' },
      sterilization: { type: 'string' },
      patient_population: { type: 'string' },
    },
    required: ['program_id', 'product_code', 'device_name', 'intended_use', 'technology_description'],
  },
};

export const GENERATE_SE_MATRIX: AnaTool = {
  name: 'generate_se_matrix',
  description:
    'Auto-generate the substantial-equivalence (SE) matrix comparing the subject device to a selected predicate — the characteristic-by-characteristic comparison that anchors the 510(k) SE argument. Returns the SE matrix payload, a defense-readiness score, and an evidence manifest. Provide the selected predicate K-number and the subject device characteristics.',
  input_schema: {
    type: 'object',
    properties: {
      program_id: { type: 'string', description: 'The regulatory program UUID.' },
      selected_predicate_k_number: { type: 'string', description: 'The chosen predicate 510(k) number (K######).' },
      subject_device: {
        type: 'object',
        description: 'The subject device characteristics as a flat map of characteristic → value.',
        additionalProperties: { type: 'string' },
      },
      design_control_ids: { type: 'array', items: { type: 'string' }, description: 'Optional design-control record ids to link as evidence.' },
    },
    required: ['program_id', 'selected_predicate_k_number', 'subject_device'],
  },
};

export const GET_PREDICATE_DEFENSE_PREVIEW: AnaTool = {
  name: 'get_predicate_defense_preview',
  description:
    "Read the predicate defense preview for a program — the reviewer's-eye view of the SE argument's weak points: anticipated reviewer questions, internal contradictions, evidence gaps, a readiness score, and a recommendation. Use to pressure-test a 510(k) before submission. Optionally scope to one candidate.",
  input_schema: {
    type: 'object',
    properties: {
      program_id: { type: 'string', description: 'The regulatory program UUID.' },
      candidate_id: { type: 'string', description: 'Optional predicate-candidate id to scope the preview.' },
    },
    required: ['program_id'],
  },
};

/** All predicate-intelligence tools, spread into ALL_ANA_TOOLS. */
export const PREDICATE_INTELLIGENCE_TOOLS: AnaTool[] = [
  SUGGEST_PREDICATE_DEVICES,
  GENERATE_SE_MATRIX,
  GET_PREDICATE_DEFENSE_PREVIEW,
];
