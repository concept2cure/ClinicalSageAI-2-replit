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

import type { PathwayEvidenceLeaf } from './source-aware-evidence';
import { SUBMISSION_DELIVERABLE_PATHWAYS, type Pathway } from '../../../shared/types/submission-api';
export type { Pathway } from '../../../shared/types/submission-api';
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

export const PATHWAYS: Pathway[] = [...SUBMISSION_DELIVERABLE_PATHWAYS];

/** A canonical leaf accepted by any pathway engine. */
export interface PathwayLeaf extends PathwayEvidenceLeaf {
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
  sourceAware?: boolean;
  /** Recorded product family only; never inferred from placement titles. */
  deviceVariant?: 'device' | 'ivd';
  pathway: Pathway;
  leaves: PathwayLeaf[];
  /** CTIS only: concerned EU member states. */
  memberStates?: string[];
  /**
   * CTIS only: Annex I rows the sponsor recorded as not applicable, as
   * `I:<slot-id>` or `II:<MS>:<slot-id>`. Without it, "if applicable" rows
   * (GMP for an unmodified authorised IMP, recruitment, insurance, fee) stay
   * undetermined and the application is not ready.
   */
  ctisNotApplicable?: string[];
  /** PMA only: application/supplement type (defaults to 'original'). */
  pmaSubmissionType?: PmaSubmissionType;
  /** PreSTAR Q-Sub only: sub-type (defaults to 'pre_submission'). */
  /** Required for prestar_q_sub; the mapper refuses to assess a Q-Sub without it. */
  qSubType?: QSubType;
  /**
   * eSTAR only: the device's answers to the seven intake flags. Sections
   * required only for some devices cannot be judged without them (W1-5).
   */
  deviceFlags?: DeviceFlags;
  /**
   * PMDA Shōnin only: whether the device needs clinical trial results
   * (臨床試験の試験成績). Unanswered, an absent clinical slot is undetermined
   * and counted as a gap.
   */
  clinicalDataRequired?: boolean;
}

function requiredGaps(summary:{missingRequired:string[];undetermined?:string[]}) {
  return [...summary.missingRequired,...(summary.undetermined??[])];
}

/** Run the right pathway engine and return a normalized readiness verdict. */
export function assessPathwayReadiness(input: AssessPathwayInput): PathwayReadiness {
  const leaves = Array.isArray(input.leaves) ? input.leaves : [];
  switch (input.pathway) {
    case 'ctis': {
      const d = mapToCtis({
        sourceAware: input.sourceAware,
        leaves: leaves as CtisInputLeaf[],
        memberStates: input.memberStates ?? [],
        notApplicable: input.ctisNotApplicable,
      });
      // Undetermined slots are gaps, as in the eSTAR branch below: an "if
      // applicable" row nobody answered, or a Part II document with no Member
      // State, is not a slot the application can go without.
      const missing = [
        ...d.summary.partIMissingRequired.map((m) => `I:${m}`),
        ...d.summary.partIUndetermined.map((m) => `I:${m}`),
        ...Object.entries(d.summary.partIIMissingByState).flatMap(([ms, ids]) => ids.map((m) => `II:${ms}:${m}`)),
        ...Object.entries(d.summary.partIIUndeterminedByState).flatMap(([ms, ids]) => ids.map((m) => `II:${ms}:${m}`)),
      ];
      return { pathway: 'ctis', ready: d.summary.ready, missingRequired: missing, detail: d };
    }
    case 'mdr':
    case 'ivdr': {
      const r = assembleTechDoc({ leaves: leaves as TechDocInputLeaf[], regulation: input.pathway, sourceAware: input.sourceAware });
      return { pathway: input.pathway, ready: r.summary.ready, missingRequired: requiredGaps(r.summary), detail: r };
    }
    case 'estar_510k':
    case 'estar_de_novo': {
      const r = mapToEstar({
        sourceAware: input.sourceAware,
        variant: input.deviceVariant,
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
      const r = assessPmdaShonin({ leaves: leaves as PmdaInputLeaf[], clinicalDataRequired: input.clinicalDataRequired, sourceAware: input.sourceAware });
      // Undetermined slots are gaps, as in the eSTAR and CTIS branches.
      return {
        pathway: 'pmda_shonin',
        ready: r.summary.ready,
        missingRequired: [...r.summary.missingRequired, ...r.summary.undetermined],
        detail: r,
      };
    }
    case 'pma': {
      const r = mapToPma({ leaves: leaves as PmaInputLeaf[], submissionType: input.pmaSubmissionType, sourceAware: input.sourceAware });
      return { pathway: 'pma', ready: r.summary.ready, missingRequired: requiredGaps(r.summary), detail: r };
    }
    case 'prestar_q_sub': {
      const r = mapToPreStar({ leaves: leaves as PreStarInputLeaf[], submissionType: 'q_sub', qSubType: input.qSubType, sourceAware: input.sourceAware });
      return { pathway: 'prestar_q_sub', ready: r.summary.ready, missingRequired: requiredGaps(r.summary), detail: r };
    }
    case 'prestar_ide': {
      const r = mapToPreStar({ leaves: leaves as PreStarInputLeaf[], submissionType: 'ide', sourceAware: input.sourceAware });
      return { pathway: 'prestar_ide', ready: r.summary.ready, missingRequired: requiredGaps(r.summary), detail: r };
    }
    case 'prestar_513g': {
      const r = mapToPreStar({ leaves: leaves as PreStarInputLeaf[], submissionType: '513g', sourceAware: input.sourceAware });
      return { pathway: 'prestar_513g', ready: r.summary.ready, missingRequired: requiredGaps(r.summary), detail: r };
    }
    default: {
      const _exhaustive: never = input.pathway;
      throw new Error(`Unknown pathway: ${String(_exhaustive)}`);
    }
  }
}

export default { assessPathwayReadiness, PATHWAYS };
