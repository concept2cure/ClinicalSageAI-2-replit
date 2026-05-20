/**
 * Zod schema gating the structured output of the preclinical extractor.
 *
 * The fields mirror the columns of `ctd_nonclinical_studies` so the
 * ingest service can map the parsed object to the row insert with
 * minimal translation. Optional fields default to null so the extractor
 * can omit them when the source PDF does not state them.
 */

import { z } from 'zod';

export const PreclinicalStudyTypeEnum = z.enum([
  'single_dose_tox',
  'repeat_dose_tox',
  'genotox',
  'carc',
  'dart',
  'safety_pharm',
  'tk',
  'pk',
  'adme',
  'local_tolerance',
]);
export type PreclinicalStudyType = z.infer<typeof PreclinicalStudyTypeEnum>;

const TargetOrganFinding = z.object({
  organ: z.string().min(1),
  severity: z.string().min(1),
  doseLevel: z.string().nullable().default(null),
});

const SafetyMargin = z.object({
  basis: z.string().min(1),
  multiple: z.number().nonnegative(),
});

export const PreclinicalStudySchema = z.object({
  studyType: PreclinicalStudyTypeEnum,
  studyTitle: z.string().min(1),
  species: z.string().nullable().default(null),
  strain: z.string().nullable().default(null),
  routeOfAdministration: z.string().nullable().default(null),
  durationWeeks: z.number().int().nonnegative().nullable().default(null),
  glpCompliant: z.boolean().nullable().default(null),

  noael: z.string().nullable().default(null),
  loael: z.string().nullable().default(null),
  mtd: z.string().nullable().default(null),
  keyFindings: z.string().nullable().default(null),
  targetOrganToxicity: z.array(TargetOrganFinding).default([]),
  carcinogenicityFindings: z.string().nullable().default(null),
  genotoxicityResults: z.string().nullable().default(null),
  reproductiveToxicity: z.string().nullable().default(null),
  safetyMargins: z.array(SafetyMargin).default([]),

  studyReportNumber: z.string().nullable().default(null),
  testingFacility: z.string().nullable().default(null),
  studyCompletionDate: z.string().nullable().default(null), // ISO yyyy-mm-dd

  /** Self-reported confidence from the extractor (0–1). */
  extractionConfidence: z.number().min(0).max(1),
});

export type PreclinicalStudy = z.infer<typeof PreclinicalStudySchema>;
