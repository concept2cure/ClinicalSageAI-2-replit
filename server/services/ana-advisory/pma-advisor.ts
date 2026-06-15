/**
 * AnA PMA readiness advisor — pure advisory wrapper over the PMA mapper.
 *
 * A grounded, deterministic advisor AnA ("AnA 1.0 RI") can call to advise on FDA
 * PMA (Class III premarket approval) filing readiness:
 *   - advisePmaReadiness — turns mapToPma() into plain-language-ready advice with
 *     completeness, missing required modules, and prioritized next steps.
 *
 * NO LLM, NO fabrication: derived entirely from the PMA section mapper. PMA is
 * filed on eCTD/eSTAR rails; this is the readiness/structure check, not assembly.
 *
 * @module server/services/ana-advisory/pma-advisor
 */

import { mapToPma, type PmaInputLeaf, type PmaSubmissionType } from '../pathway-engines/pma/pma-mapper';
import type { AnaAdvisoryToolSpec } from './types';

export interface PmaReadinessAdviceInput {
  leaves: PmaInputLeaf[];
  submissionType?: PmaSubmissionType;
}

export interface PmaMissingModule {
  id: string;
  label: string;
  module: number;
}

export interface PmaReadinessAdvice {
  headline: string;
  submissionType: PmaSubmissionType;
  ready: boolean;
  completeness: number;
  missingRequiredModules: PmaMissingModule[];
  recommendedActions: string[];
  provenance: { generatedAt: string; modules: string[] };
}

/**
 * Produce structured, honest PMA filing-readiness advice by composing
 * {@link mapToPma}. Honest: when required modules are missing it says the PMA is
 * not yet fileable and lists exactly what to produce.
 */
export function advisePmaReadiness(input: PmaReadinessAdviceInput): PmaReadinessAdvice {
  const result = mapToPma({ leaves: input.leaves, submissionType: input.submissionType });

  const missingRequiredModules: PmaMissingModule[] = result.sections
    .filter((s) => s.required && !s.present)
    .map((s) => ({ id: s.id, label: s.label, module: s.module }))
    .sort((a, b) => a.module - b.module);

  const headline = result.summary.ready
    ? `PMA filing-ready: all required modules are present (${result.summary.completeness}% complete). PMA is filed on eCTD/eSTAR rails — you submit it to FDA.`
    : `Not yet fileable: ${missingRequiredModules.length} required PMA module(s) missing (${result.summary.completeness}% complete). Produce them before assembling.`;

  const recommendedActions = missingRequiredModules.map(
    (m) => `Produce PMA module ${m.module}: ${m.label}.`,
  );

  return {
    headline,
    submissionType: result.submissionType,
    ready: result.summary.ready,
    completeness: result.summary.completeness,
    missingRequiredModules,
    recommendedActions,
    provenance: {
      generatedAt: new Date().toISOString(),
      modules: ['pathway-engines/pma/pma-mapper'],
    },
  };
}

/** Tool descriptor so AnA can register this advisor. */
export const PMA_ADVISORY_TOOL_SPEC: AnaAdvisoryToolSpec = {
  name: 'advise_pma_readiness',
  description:
    'Give grounded, honest advice on FDA PMA (Class III premarket approval) filing readiness. Reports ' +
    'completeness across the PMA module structure (21 CFR 814.20), which required modules are missing, and ' +
    'prioritized next steps. Never claims a fileable PMA when required modules are missing, and never claims ' +
    'transmission to FDA — the sponsor files the submission.',
  input_schema: {
    type: 'object',
    properties: {
      leaves: {
        type: 'array',
        description: 'Canonical content leaves available to project onto the PMA module structure.',
        items: {
          type: 'object',
          properties: {
            sectionCode: { type: 'string', description: 'Stable section code of the content leaf.' },
            title: { type: 'string', description: 'Human-readable title of the content leaf.' },
            documentType: { type: 'string', description: 'Optional document-type tag used for module matching.' },
          },
          required: ['sectionCode', 'title'],
        },
      },
      submissionType: {
        type: 'string',
        enum: ['original', 'panel_track_supplement', '180_day_supplement', 'real_time_supplement'],
        description: 'PMA submission type (default "original").',
      },
    },
    required: ['leaves'],
  },
};

export default { advisePmaReadiness, PMA_ADVISORY_TOOL_SPEC };
