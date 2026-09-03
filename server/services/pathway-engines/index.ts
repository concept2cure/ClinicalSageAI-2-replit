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
import { mapToEstar, type EstarInputLeaf, type DeviceFlags } from './estar/estar-mapper';
import { assessPmdaShonin, type PmdaInputLeaf } from './pmda/pmda-shonin';
import { mapToPma, type PmaInputLeaf, type PmaSubmissionType } from './pma/pma-mapper';
import { mapToPreStar, type PreStarInputLeaf, type QSubType } from './prestar/prestar-mapper';

export * from './ctis/ctis-mapper';
export * from './mdr-ivdr/tech-doc-assembler';
export * from './estar/estar-mapper';
export * from './pmda/pmda-shonin';
export * from './pma/pma-mapper';
export * from './prestar/prestar-mapper';

export type Pathway =
  | 'ctis'
  | 'mdr'
  | 'ivdr'
  | 'estar_510k'
  | 'estar_de_novo'
  | 'pmda_shonin'
  | 'pma'
  | 'prestar_q_sub'
  | 'prestar_ide'
  | 'prestar_513g';

export const PATHWAYS: Pathway[] = [
  'ctis',
  'mdr',
  'ivdr',
  'estar_510k',
  'estar_de_novo',
  'pmda_shonin',
  'pma',
  'prestar_q_sub',
  'prestar_ide',
  'prestar_513g',
];

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
  /** PMA only: application/supplement type (defaults to 'original'). */
  pmaSubmissionType?: PmaSubmissionType;
  /** PreSTAR Q-Sub only: sub-type (defaults to 'pre_submission'). */
  qSubType?: QSubType;
  /**
   * eSTAR only: the device's answers to the seven intake flags. Sections
   * required only for some devices cannot be judged without them (W1-5).
   */
  deviceFlags?: DeviceFlags;
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
      const r = mapToEstar({
        leaves: leaves as EstarInputLeaf[],
        type: input.pathway === 'estar_de_novo' ? 'de_novo' : '510k',
        flags: input.deviceFlags,
      });
      // Undetermined sections are gaps: a question nobody answered is not a
      // section nobody needs (W1-5).
      return {
        pathway: input.pathway,
        ready: r.summary.ready,
        missingRequired: [...r.summary.missingRequired, ...r.summary.undetermined],
        detail: r,
      };
    }
    case 'pmda_shonin': {
      const r = assessPmdaShonin({ leaves: leaves as PmdaInputLeaf[] });
      return { pathway: 'pmda_shonin', ready: r.summary.ready, missingRequired: r.summary.missingRequired, detail: r };
    }
    case 'pma': {
      const r = mapToPma({ leaves: leaves as PmaInputLeaf[], submissionType: input.pmaSubmissionType });
      return { pathway: 'pma', ready: r.summary.ready, missingRequired: r.summary.missingRequired, detail: r };
    }
    case 'prestar_q_sub': {
      const r = mapToPreStar({ leaves: leaves as PreStarInputLeaf[], submissionType: 'q_sub', qSubType: input.qSubType });
      return { pathway: 'prestar_q_sub', ready: r.summary.ready, missingRequired: r.summary.missingRequired, detail: r };
    }
    case 'prestar_ide': {
      const r = mapToPreStar({ leaves: leaves as PreStarInputLeaf[], submissionType: 'ide' });
      return { pathway: 'prestar_ide', ready: r.summary.ready, missingRequired: r.summary.missingRequired, detail: r };
    }
    case 'prestar_513g': {
      const r = mapToPreStar({ leaves: leaves as PreStarInputLeaf[], submissionType: '513g' });
      return { pathway: 'prestar_513g', ready: r.summary.ready, missingRequired: r.summary.missingRequired, detail: r };
    }
    default: {
      const _exhaustive: never = input.pathway;
      throw new Error(`Unknown pathway: ${String(_exhaustive)}`);
    }
  }
}

export default { assessPathwayReadiness, PATHWAYS };
