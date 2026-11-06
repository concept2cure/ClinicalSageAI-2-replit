/**
 * @fileoverview M2.4 Nonclinical Overview adapter.
 * @module server/services/preclinical/nonclinical-m24-adapter
 *
 * Bridges the nonclinical study record shape used by the ingest pipeline
 * (`ctd_nonclinical_studies` / PreclinicalStudyType enum) into the
 * `buildM24NonclinicalOverview` composer, and enriches the result with the
 * toxicologic-pathology adversity classifier so the overview's target-organ
 * profile is framed consistently (adverse vs adaptive vs monitor) rather than
 * left to free text. This is the wiring the audit flagged as missing — the
 * M2.4 generator existed but nothing fed it the ingested studies.
 *
 * Pure module — no database. A feature-flagged DB loader can sit on top of
 * this; keeping the mapping pure makes it unit-testable offline and callable
 * by ANA with an explicit studies array.
 *
 * @compliance ICH M4S(R2); ICH M3(R2).
 */

import {
  buildM24NonclinicalOverview,
  type M2Summary,
  type NonclinicalStudy,
} from '../m2-summary-builders.js';
import {
  classifyToxFindings,
  type ToxFindingInput,
  type ToxFindingsSummary,
} from './tox-findings-classifier.js';

/** Builder study-type union (target of the mapping). */
type M24StudyType = NonclinicalStudy['studyType'];

/**
 * Map a `ctd_nonclinical_studies` / PreclinicalStudyType enum value onto the
 * coarser M2.4 builder category. Pass-through when already a builder value.
 */
export function mapStudyTypeToM24(studyType: string): M24StudyType {
  switch (studyType) {
    case 'single_dose_tox':
    case 'repeat_dose_tox':
    case 'local_tolerance':
    case 'immunotoxicity':
    case 'toxicology':
      return 'toxicology';
    case 'genotox':
    case 'genotoxicity':
      return 'genotoxicity';
    case 'carc':
    case 'carcinogenicity':
      return 'carcinogenicity';
    case 'dart':
    case 'reproductive_tox':
      return 'reproductive_tox';
    case 'safety_pharm':
    case 'safety_pharmacology':
      return 'safety_pharmacology';
    case 'tk':
    case 'pk':
    case 'adme':
    case 'adme_pk':
    case 'pharmacokinetics':
      return 'pharmacokinetics';
    case 'pharmacology':
      return 'pharmacology';
    default:
      // Retain these in the study index without inventing a discipline.
      return 'unclassified';
  }
}

/** Flexible input study shape accepting DB-ish or builder-ish fields. */
export interface NonclinicalStudyInput {
  studyId?: string;
  studyType: string;
  /** Original taxonomy retained when an already-adapted category is passed on. */
  sourceStudyType?: string;
  studyTitle?: string;
  species?: string | null;
  durationWeeks?: number | null;
  duration?: string;
  glpCompliant?: boolean | null;
  glpStatus?: 'GLP' | 'non-GLP';
  noael?: string | null;
  noel?: string | null;
  keyFindings?: string | null;
  primaryFinding?: string;
  doseLevels?: string[];
  reportSection?: string;
}

export interface EnrichedM24Input {
  studies: NonclinicalStudyInput[];
  /** Target-organ findings to classify for the overview (optional). */
  findings?: ToxFindingInput[];
  drugSubstanceName?: string;
  indication?: string;
}

export interface EnrichedM24Result {
  summary: M2Summary;
  /** Adversity classification of the supplied target-organ findings. */
  toxProfile: ToxFindingsSummary | null;
}

/** Preserve a prior subtype only within its recorded broad category. A raw
 * specific type takes precedence over conflicting round-trip metadata. */
function originalStudyType(input: NonclinicalStudyInput, category: M24StudyType): string {
  if (input.studyType !== category || typeof input.sourceStudyType !== 'string') return input.studyType;
  return mapStudyTypeToM24(input.sourceStudyType) === category ? input.sourceStudyType : input.studyType;
}

/**
 * Map a single NonclinicalStudyInput (loader shape) to the NonclinicalStudy
 * shape consumed by `buildM24NonclinicalOverview` and the orchestrator.
 *
 * Promoted to a public export (Path-to-GA Turn 1) so the orchestrator's
 * input-adapter layer can call it directly without going through
 * `buildEnrichedM24`. Used by `loadNonclinicalStudiesForProject`.
 */
export function toBuilderStudy(input: NonclinicalStudyInput, _index: number): NonclinicalStudy {
  const studyType = mapStudyTypeToM24(input.studyType);
  const duration =
    input.duration ??
    (input.durationWeeks != null ? `${input.durationWeeks} weeks` : undefined);
  const glpStatus =
    input.glpStatus ??
    (input.glpCompliant == null ? undefined : input.glpCompliant ? 'GLP' : 'non-GLP');
  return {
    studyId: input.studyId ?? '',
    studyType,
    sourceStudyType: originalStudyType(input, studyType),
    species: input.species ?? undefined,
    duration,
    doseLevels: input.doseLevels,
    primaryFinding: input.primaryFinding ?? input.keyFindings ?? '',
    noael: input.noael ?? undefined,
    noel: input.noel ?? undefined,
    glpStatus,
    reportSection: input.reportSection ?? '',
  };
}

/**
 * Build the M2.4 Nonclinical Overview from ingest-shaped studies and enrich it
 * with the target-organ adversity profile. The classifier's overview paragraph
 * goes into the composer, which prints it inside 2.4.4 Toxicology, so the
 * framing travels with the document. (D2 cleanup C4c, 2026-10-26: it was
 * appended after the whole overview as "2.4.4.1", a code the ICH M2–M5 record
 * does not hold, and so landed after 2.4.5 and 2.4.6.)
 */
export function buildEnrichedM24(input: EnrichedM24Input): EnrichedM24Result {
  const builderStudies = input.studies.map(toBuilderStudy);
  const toxProfile: ToxFindingsSummary | null =
    input.findings && input.findings.length > 0 ? classifyToxFindings(input.findings) : null;
  const summary = buildM24NonclinicalOverview({
    nonclinicalStudies: builderStudies,
    drugSubstanceName: input.drugSubstanceName,
    indication: input.indication,
    ...(toxProfile ? { targetOrganProfile: toxProfile.overviewParagraph } : {}),
  });

  return { summary, toxProfile };
}
