/**
 * Pathway engines — unified readiness dispatcher.
 *
 * One normalized entry point over every non-eCTD pathway projection (CTIS,
 * MDR/IVDR tech doc, FDA eSTAR), so a route/tool can ask "is this submission
 * ready for pathway X?" without knowing each engine's shape. All engines are
 * pure projections of the one canonical core (spec §3) and report gaps, never
 * invent content.
 *
 * @module server/services/pathway-engines
 */

import { mapToCtis, type CtisInputLeaf } from './ctis/ctis-mapper';
import { assembleTechDoc, type TechDocInputLeaf } from './mdr-ivdr/tech-doc-assembler';
import { mapToEstar, type EstarInputLeaf } from './estar/estar-mapper';

export * from './ctis/ctis-mapper';
export * from './mdr-ivdr/tech-doc-assembler';
export * from './estar/estar-mapper';

export type Pathway = 'ctis' | 'mdr' | 'ivdr' | 'estar_510k' | 'estar_de_novo';

export const PATHWAYS: Pathway[] = ['ctis', 'mdr', 'ivdr', 'estar_510k', 'estar_de_novo'];

/** A canonical leaf accepted by any pathway engine. */
export interface PathwayLeaf {
  sectionCode: string;
  title: string;
  documentType?: string;
}

export interface PathwayReadiness {
  pathway: Pathway;
  ready: boolean;
  /** Required-slot ids that are missing (CTIS aggregates Part I + Part II). */
  missingRequired: string[];
  /** The full engine result for callers that want the section breakdown. */
  detail: unknown;
}

export interface AssessPathwayInput {
  pathway: Pathway;
  leaves: PathwayLeaf[];
  /** CTIS only: concerned EU member states. */
  memberStates?: string[];
}

/** Run the right pathway engine and return a normalized readiness verdict. */
export function assessPathwayReadiness(input: AssessPathwayInput): PathwayReadiness {
  const leaves = Array.isArray(input.leaves) ? input.leaves : [];
  switch (input.pathway) {
    case 'ctis': {
      const d = mapToCtis({ leaves: leaves as CtisInputLeaf[], memberStates: input.memberStates ?? [] });
      const missing = [
        ...d.summary.partIMissingRequired.map((m) => `I:${m}`),
        ...Object.entries(d.summary.partIIMissingByState).flatMap(([ms, ids]) => ids.map((m) => `II:${ms}:${m}`)),
      ];
      return { pathway: 'ctis', ready: d.summary.ready, missingRequired: missing, detail: d };
    }
    case 'mdr':
    case 'ivdr': {
      const r = assembleTechDoc({ leaves: leaves as TechDocInputLeaf[], regulation: input.pathway });
      return { pathway: input.pathway, ready: r.summary.ready, missingRequired: r.summary.missingRequired, detail: r };
    }
    case 'estar_510k':
    case 'estar_de_novo': {
      const r = mapToEstar({ leaves: leaves as EstarInputLeaf[], type: input.pathway === 'estar_de_novo' ? 'de_novo' : '510k' });
      return { pathway: input.pathway, ready: r.summary.ready, missingRequired: r.summary.missingRequired, detail: r };
    }
    default: {
      const _exhaustive: never = input.pathway;
      throw new Error(`Unknown pathway: ${String(_exhaustive)}`);
    }
  }
}

export default { assessPathwayReadiness, PATHWAYS };
