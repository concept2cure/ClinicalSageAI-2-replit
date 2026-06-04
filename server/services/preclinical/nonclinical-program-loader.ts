/**
 * @fileoverview Loader: ctd_nonclinical_studies → the shapes the engines need.
 * @module server/services/preclinical/nonclinical-program-loader
 *
 * The M2.4/M2.6 composers, the study-program gap engine, and the FIH dose
 * engine all take plain input arrays. This loader reads a program's real
 * `ctd_nonclinical_studies` rows (the output of the preclinical ingest
 * pipeline) and maps them into those input shapes, so ANA can draft and assess
 * from a program's actual data rather than hand-passed arrays — the "access"
 * half of the workflow.
 *
 * The row→shape mappers are pure and unit-testable offline; only the DB fetch
 * is gated behind PRECLINICAL_REVIEWER_ENABLED (the same flag the reviewer
 * intel loader uses to read this table), returning undefined when unset so
 * callers degrade cleanly in environments that have not opted in.
 */

import { and, eq, getTableColumns } from 'drizzle-orm';

import { db } from '../../db';
import { ctdNonclinicalStudies, ctdPrograms } from '../../../shared/schema/csr-knowledge-db';
import { PRECLINICAL_REVIEWER_ENABLED } from './feature-flags';
import { parseDoseMgPerKg, type SpeciesNoael } from './fih-dose-engine';
import type { NonclinicalStudyInput } from './nonclinical-m24-adapter';
import type { PresentStudy } from './nonclinical-program-requirements';

/** Loosely-typed row — only the columns the mappers read. */
export interface NonclinicalRow {
  id?: number | string;
  studyType: string;
  studyTitle?: string | null;
  species?: string | null;
  durationWeeks?: number | null;
  glpCompliant?: boolean | null;
  noael?: string | null;
  keyFindings?: string | null;
  genotoxicityResults?: string | null;
}

const SECTION_BY_TYPE: Record<string, string> = {
  single_dose_tox: '4.2.3.1',
  repeat_dose_tox: '4.2.3.2',
  genotox: '4.2.3.3',
  carc: '4.2.3.4',
  dart: '4.2.3.5',
  local_tolerance: '4.2.3.6',
  safety_pharm: '4.2.1.3',
  pharmacology: '4.2.1.1',
  pk: '4.2.2',
  adme: '4.2.2',
  tk: '4.2.2',
};

/** Map a row to the M2.4/M2.6 composer study shape. */
export function mapRowToStudyInput(row: NonclinicalRow): NonclinicalStudyInput {
  return {
    studyId: row.id != null ? String(row.id) : undefined,
    studyType: row.studyType,
    studyTitle: row.studyTitle ?? undefined,
    species: row.species ?? null,
    durationWeeks: row.durationWeeks ?? null,
    glpCompliant: row.glpCompliant ?? null,
    noael: row.noael ?? null,
    keyFindings: row.keyFindings ?? null,
    reportSection: SECTION_BY_TYPE[row.studyType] ?? '4.2',
  };
}

/** Derive the genotoxicity component (Ames / in-vitro / in-vivo) from row text. */
export function deriveGenotoxComponent(
  row: NonclinicalRow,
): 'ames' | 'in_vitro_mammalian' | 'in_vivo' | undefined {
  if (row.studyType !== 'genotox') return undefined;
  const text = `${row.studyTitle ?? ''} ${row.genotoxicityResults ?? ''} ${row.keyFindings ?? ''}`.toLowerCase();
  if (/\bames\b|bacterial reverse mutation/.test(text)) return 'ames';
  if (/in\s*vitro|chromosom|mammalian|tk6|cho/.test(text)) return 'in_vitro_mammalian';
  if (/in\s*vivo|comet|micronucleus/.test(text)) return 'in_vivo';
  return undefined;
}

/** Map a row to the study-program gap engine shape. */
export function mapRowToPresentStudy(row: NonclinicalRow): PresentStudy {
  return {
    studyType: row.studyType,
    species: row.species ?? null,
    durationWeeks: row.durationWeeks ?? null,
    genotoxComponent: deriveGenotoxComponent(row),
  };
}

/**
 * Study types whose NOAEL is appropriate to anchor a first-in-human dose.
 * FIH scaling derives from the pivotal general-toxicity studies; a mg/kg NOAEL
 * reported on a pharmacology or PK row should not feed the dose calculation.
 */
const FIH_NOAEL_STUDY_TYPES = new Set(['single_dose_tox', 'repeat_dose_tox']);

/** Map a tox row with a parseable mg/kg NOAEL to a FIH species-NOAEL input. */
export function mapRowToSpeciesNoael(row: NonclinicalRow): SpeciesNoael | null {
  if (!FIH_NOAEL_STUDY_TYPES.has(row.studyType)) return null;
  const noaelMgPerKg = parseDoseMgPerKg(row.noael);
  if (noaelMgPerKg == null || !row.species) return null;
  return { species: row.species, noaelMgPerKg, studyRef: row.studyTitle ?? undefined };
}

export interface LoadedNonclinicalProgram {
  studies: NonclinicalStudyInput[];
  presentStudies: PresentStudy[];
  speciesNoaels: SpeciesNoael[];
  rowCount: number;
}

/** Full ctd_nonclinical_studies row — the single source for the row shape. */
export type NonclinicalStudyRow = typeof ctdNonclinicalStudies.$inferSelect;

/**
 * The single tenant-scoped reader of ctd_nonclinical_studies. Both the
 * M2.4/M2.6 composers (via loadNonclinicalProgram) and the reviewer-simulator
 * intel loader (loadPreclinicalIntel) read through this, so the query and its
 * tenant constraint live in exactly one place. ctd_nonclinical_studies has no
 * org column of its own, so ownership is enforced through its parent program —
 * independent of whether Postgres RLS enforcement is active. Returns undefined
 * when the flag is unset or either id is invalid.
 */
export async function fetchNonclinicalRows(
  ctdProgramId: number,
  organizationId: number,
): Promise<NonclinicalStudyRow[] | undefined> {
  if (!PRECLINICAL_REVIEWER_ENABLED) return undefined;
  if (!Number.isInteger(ctdProgramId) || ctdProgramId <= 0) return undefined;
  if (!Number.isInteger(organizationId) || organizationId <= 0) return undefined;
  return (await db
    .select(getTableColumns(ctdNonclinicalStudies))
    .from(ctdNonclinicalStudies)
    .innerJoin(ctdPrograms, eq(ctdNonclinicalStudies.programId, ctdPrograms.id))
    .where(
      and(
        eq(ctdNonclinicalStudies.programId, ctdProgramId),
        eq(ctdPrograms.organizationId, organizationId),
      ),
    )) as unknown as NonclinicalStudyRow[];
}

/**
 * Load a program's nonclinical studies in every shape the composers and engines
 * consume. Tenant-scoped via {@link fetchNonclinicalRows}; an empty result also
 * covers "program not in this organization".
 */
export async function loadNonclinicalProgram(
  ctdProgramId: number,
  organizationId: number,
): Promise<LoadedNonclinicalProgram | undefined> {
  const rows = await fetchNonclinicalRows(ctdProgramId, organizationId);
  if (!rows) return undefined;
  return {
    studies: rows.map(mapRowToStudyInput),
    presentStudies: rows.map(mapRowToPresentStudy),
    speciesNoaels: rows.map(mapRowToSpeciesNoael).filter((s): s is SpeciesNoael => s !== null),
    rowCount: rows.length,
  };
}
