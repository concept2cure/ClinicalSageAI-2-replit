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
    case 'pharmacokinetics':
      return 'pharmacokinetics';
    case 'pharmacology':
      return 'pharmacology';
    default:
      // Unknown types are summarized under toxicology so they are not dropped.
      return 'toxicology';
  }
}

/** Flexible input study shape accepting DB-ish or builder-ish fields. */
export interface NonclinicalStudyInput {
  studyId?: string;
  studyType: string;
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

const DEFAULT_SECTION: Record<M24StudyType, string> = {
  pharmacology: '4.2.1.1',
  safety_pharmacology: '4.2.1.3',
  pharmacokinetics: '4.2.2',
  toxicology: '4.2.3.2',
  genotoxicity: '4.2.3.3',
  carcinogenicity: '4.2.3.4',
  reproductive_tox: '4.2.3.5',
};

function toBuilderStudy(input: NonclinicalStudyInput, index: number): NonclinicalStudy {
  const studyType = mapStudyTypeToM24(input.studyType);
  const duration =
    input.duration ??
    (input.durationWeeks != null ? `${input.durationWeeks} weeks` : undefined);
  const glpStatus =
    input.glpStatus ??
    (input.glpCompliant == null ? undefined : input.glpCompliant ? 'GLP' : 'non-GLP');
  return {
    studyId: input.studyId ?? `NC-${index + 1}`,
    studyType,
    species: input.species ?? undefined,
    duration,
    doseLevels: input.doseLevels,
    primaryFinding: input.primaryFinding ?? input.keyFindings ?? 'See Module 4 study report.',
    noael: input.noael ?? undefined,
    noel: input.noel ?? undefined,
    glpStatus,
    reportSection: input.reportSection ?? DEFAULT_SECTION[studyType],
  };
}

/**
 * Build the M2.4 Nonclinical Overview from ingest-shaped studies and enrich it
 * with the target-organ adversity profile. The classifier's overview paragraph
 * is appended into the returned summary narrative so the framing travels with
 * the document.
 */
export function buildEnrichedM24(input: EnrichedM24Input): EnrichedM24Result {
  const builderStudies = input.studies.map(toBuilderStudy);
  const summary = buildM24NonclinicalOverview({
    nonclinicalStudies: builderStudies,
    drugSubstanceName: input.drugSubstanceName,
    indication: input.indication,
  });

  let toxProfile: ToxFindingsSummary | null = null;
  if (input.findings && input.findings.length > 0) {
    toxProfile = classifyToxFindings(input.findings);
    summary.narrative = `${summary.narrative}\n\n2.4.4.1 TARGET-ORGAN ADVERSITY PROFILE\n${toxProfile.overviewParagraph}`;
  }

  return { summary, toxProfile };
}
