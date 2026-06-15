/**
 * AnA EU MDR/IVDR technical-file readiness advisor — pure wrapper over the
 * MDR/IVDR tech-doc assembler.
 *
 *   - adviseEuTechnicalFileReadiness — turns assembleTechDoc() into honest,
 *     plain-language-ready Notified-Body readiness advice for EU MDR (2017/745)
 *     or IVDR (2017/746) technical documentation.
 *
 * NO LLM, NO fabrication: derived entirely from the tech-doc section mapper. This
 * is the readiness/structure check (Annex II/III completeness), not assembly or
 * NB submission.
 *
 * @module server/services/ana-advisory/eu-techdoc-advisor
 */

import { assembleTechDoc, type TechDocInputLeaf, type EuRegulation } from '../pathway-engines/mdr-ivdr/tech-doc-assembler';
import type { AnaAdvisoryToolSpec } from './types';

export interface EuTechDocAdviceInput {
  leaves: TechDocInputLeaf[];
  regulation: EuRegulation;
}

export interface EuTechDocMissingSection {
  id: string;
  label: string;
  annex: string;
}

export interface EuTechDocAdvice {
  headline: string;
  regulation: EuRegulation;
  ready: boolean;
  missingRequiredSections: EuTechDocMissingSection[];
  recommendedActions: string[];
  provenance: { generatedAt: string; modules: string[] };
}

/**
 * Produce structured, honest EU MDR/IVDR technical-documentation readiness advice
 * by composing {@link assembleTechDoc}. Honest: when required Annex sections are
 * missing it says the file is not yet Notified-Body-ready and lists what to produce.
 */
export function adviseEuTechnicalFileReadiness(input: EuTechDocAdviceInput): EuTechDocAdvice {
  const result = assembleTechDoc({ leaves: input.leaves, regulation: input.regulation });

  const missingRequiredSections: EuTechDocMissingSection[] = result.sections
    .filter((s) => s.required && !s.present)
    .map((s) => ({ id: s.id, label: s.label, annex: s.annex }));

  const reg = input.regulation === 'ivdr' ? 'IVDR (EU 2017/746)' : 'MDR (EU 2017/745)';
  const headline = result.summary.ready
    ? `${reg} technical documentation is structurally complete for Notified-Body review. NB conformity assessment and CE marking are the manufacturer's responsibility.`
    : `Not yet NB-ready: ${missingRequiredSections.length} required ${reg} section(s) missing. Produce them before Notified-Body submission.`;

  const recommendedActions = missingRequiredSections.map(
    (s) => `Produce ${s.label} (${s.annex}).`,
  );

  return {
    headline,
    regulation: result.regulation,
    ready: result.summary.ready,
    missingRequiredSections,
    recommendedActions,
    provenance: {
      generatedAt: new Date().toISOString(),
      modules: ['pathway-engines/mdr-ivdr/tech-doc-assembler'],
    },
  };
}

/** Tool descriptor so AnA can register this advisor. */
export const EU_TECHDOC_TOOL_SPEC: AnaAdvisoryToolSpec = {
  name: 'advise_eu_technical_file_readiness',
  description:
    'Give grounded, honest advice on EU MDR (2017/745) or IVDR (2017/746) technical-documentation ' +
    'readiness for Notified-Body review. Reports which required Annex II/III sections are present vs ' +
    'missing and prioritized next steps. Never claims NB conformity or CE marking — that is the ' +
    "manufacturer's responsibility.",
  input_schema: {
    type: 'object',
    properties: {
      regulation: {
        type: 'string',
        enum: ['mdr', 'ivdr'],
        description: 'EU regulation: "mdr" (medical devices) or "ivdr" (in-vitro diagnostics).',
      },
      leaves: {
        type: 'array',
        description: 'Canonical content leaves available to project onto the MDR/IVDR Annex structure.',
        items: {
          type: 'object',
          properties: {
            sectionCode: { type: 'string', description: 'Stable section code of the content leaf.' },
            title: { type: 'string', description: 'Human-readable title of the content leaf.' },
            documentType: { type: 'string', description: 'Optional document-type tag used for section matching.' },
          },
          required: ['sectionCode', 'title'],
        },
      },
    },
    required: ['regulation', 'leaves'],
  },
};

export default { adviseEuTechnicalFileReadiness, EU_TECHDOC_TOOL_SPEC };
