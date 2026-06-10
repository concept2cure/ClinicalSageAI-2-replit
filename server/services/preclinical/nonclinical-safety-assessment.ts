/**
 * @fileoverview Integrated nonclinical safety assessment.
 * @module server/services/preclinical/nonclinical-safety-assessment
 *
 * Composes the individual nonclinical engines into the single integrated
 * assessment a toxicology lead produces for an IND: the first-in-human starting
 * dose, the target-organ adversity profile, the ICH M3(R2)/S-series program
 * gaps, and the M2.4 overview — rolled up into a readiness verdict. Each input
 * block is optional; the engine runs what it has and reports what is missing.
 *
 * Pure module — composes other pure engines, no database. Callable by ANA as a
 * one-shot "what is the nonclinical safety story for this program?".
 *
 * @compliance ICH M3(R2); FDA 2005 MRSD guidance; ICH M4S(R2).
 */

import {
  computeFirstInHumanDose,
  type FihDoseInput,
  type FihDoseResult,
} from './fih-dose-engine.js';
import {
  classifyToxFindings,
  type ToxFindingInput,
  type ToxFindingsSummary,
} from './tox-findings-classifier.js';
import {
  assessNonclinicalProgram,
  type ProgramContext,
  type PresentStudy,
  type ProgramAssessment,
} from './nonclinical-program-requirements.js';
import { buildEnrichedM24, type NonclinicalStudyInput } from './nonclinical-m24-adapter.js';
import type { M2Summary } from '../m2-summary-builders.js';

export interface NonclinicalSafetyInput {
  drugSubstanceName?: string;
  indication?: string;
  /** FIH dose inputs (species NOAELs + optional MABEL). */
  fih?: FihDoseInput;
  /** Target-organ findings to classify. */
  findings?: ToxFindingInput[];
  /** Program context for the gap analysis. */
  program?: ProgramContext;
  /** Studies the program holds (for the gap analysis). */
  presentStudies?: PresentStudy[];
  /** Studies feeding the M2.4 overview narrative. */
  studies?: NonclinicalStudyInput[];
}

export type NonclinicalReadiness = 'ready_for_fih' | 'gaps_block_fih' | 'insufficient_input';

export interface NonclinicalSafetyAssessment {
  fihDose: FihDoseResult | null;
  toxProfile: ToxFindingsSummary | null;
  programGaps: ProgramAssessment | null;
  overview: M2Summary | null;
  readiness: NonclinicalReadiness;
  blockers: string[];
  summary: string;
}

/** Run the integrated nonclinical safety assessment over whatever inputs exist. */
export function assessNonclinicalSafety(input: NonclinicalSafetyInput): NonclinicalSafetyAssessment {
  const blockers: string[] = [];

  let fihDose: FihDoseResult | null = null;
  if (input.fih && Array.isArray(input.fih.speciesNoaels) && input.fih.speciesNoaels.length > 0) {
    try {
      fihDose = computeFirstInHumanDose(input.fih);
    } catch {
      fihDose = null;
    }
  }

  const toxProfile = input.findings && input.findings.length > 0 ? classifyToxFindings(input.findings) : null;

  let programGaps: ProgramAssessment | null = null;
  if (input.program) {
    programGaps = assessNonclinicalProgram(input.program, input.presentStudies ?? []);
    for (const g of programGaps.gaps) blockers.push(`${g.label}: ${g.reason}`);
  }

  const overview =
    input.studies && input.studies.length > 0
      ? buildEnrichedM24({
          studies: input.studies,
          findings: input.findings,
          drugSubstanceName: input.drugSubstanceName,
          indication: input.indication,
        }).summary
      : null;

  // Readiness: program gaps gate FIH; otherwise a computed dose signals readiness.
  let readiness: NonclinicalReadiness;
  if (programGaps && programGaps.gaps.length > 0) {
    readiness = 'gaps_block_fih';
  } else if (fihDose) {
    readiness = 'ready_for_fih';
  } else {
    readiness = 'insufficient_input';
  }

  const parts: string[] = [];
  const ds = input.drugSubstanceName || 'the drug substance';
  if (fihDose) {
    parts.push(
      `Recommended FIH starting dose for ${ds}: ${fihDose.recommendedStartingDoseMg} mg (${fihDose.limitedBy}-limited).`,
    );
  }
  if (toxProfile) {
    parts.push(
      toxProfile.adverseFindings.length > 0
        ? `Adverse target-organ findings: ${toxProfile.adverseFindings.map(f => `${f.finding} (${f.organ})`).join('; ')}.`
        : 'No frankly adverse target-organ findings.',
    );
  }
  if (programGaps) {
    parts.push(
      programGaps.gaps.length === 0
        ? 'The nonclinical battery is complete for the target phase.'
        : `${programGaps.gaps.length} nonclinical study gap(s) remain for the target phase.`,
    );
  }
  if (parts.length === 0) {
    parts.push('Insufficient input to assess nonclinical safety; supply FIH NOAELs, findings, program context, or studies.');
  }

  return {
    fihDose,
    toxProfile,
    programGaps,
    overview,
    readiness,
    blockers,
    summary: parts.join(' '),
  };
}
