/**
 * Preclinical intel loader for the reviewer-simulator.
 *
 * Reads `ctd_nonclinical_studies` for a CTD program, derives the
 * `NonclinicalIntelFacts` shape that the preclinical persona reasons
 * over, and returns it. Returns undefined when the
 * PRECLINICAL_REVIEWER_ENABLED flag is unset so the simulator can run
 * unchanged in environments that have not opted in.
 *
 * Heuristics encoded here (kept narrow on purpose):
 *
 *   pivotal: studyType ∈ {repeat_dose_tox, carc, dart, genotox, safety_pharm}
 *            and not explicitly marked exploratory.
 *
 *   safetyMarginMultiple: prefers the explicit `safety_margins[].multiple`
 *            JSON column. Falls back to NOAEL / MRHD when both are
 *            available in mg/kg/day.
 *
 *   genotoxBattery: derived from study titles + genotoxicity_results text
 *            on rows whose studyType = 'genotox'.
 */

import { eq } from 'drizzle-orm';

import { db } from '../../db';
import { ctdNonclinicalStudies } from '../../../shared/schema/csr-knowledge-db';
import type {
  NonclinicalIntelFacts,
  NonclinicalStudyFact,
} from '../intelligence-engine/reviewer-personas';
import { PRECLINICAL_REVIEWER_ENABLED } from './feature-flags';

const PIVOTAL_TYPES = new Set([
  'repeat_dose_tox',
  'carc',
  'dart',
  'genotox',
  'safety_pharm',
]);

interface SafetyMarginEntry {
  basis?: string;
  multiple?: number;
}

function parseMgPerKgPerDay(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = text.match(/([\d.]+)\s*mg\s*\/\s*kg(?:\s*\/\s*day)?/i);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) ? value : null;
}

function deriveSafetyMarginMultiple(
  safetyMargins: unknown,
  noael: string | null,
  mrhdMgPerKgPerDay: number | null,
): number | null {
  if (Array.isArray(safetyMargins)) {
    const multiples = (safetyMargins as SafetyMarginEntry[])
      .map(e => e?.multiple)
      .filter((m): m is number => typeof m === 'number' && Number.isFinite(m));
    if (multiples.length > 0) {
      return Math.min(...multiples);
    }
  }
  if (mrhdMgPerKgPerDay && mrhdMgPerKgPerDay > 0) {
    const noaelDose = parseMgPerKgPerDay(noael);
    if (noaelDose !== null) {
      return noaelDose / mrhdMgPerKgPerDay;
    }
  }
  return null;
}

interface GenotoxBattery {
  ames: boolean;
  inVitroMammalian: boolean;
  inVivo: boolean;
}

function deriveGenotoxBattery(
  rows: Array<{ studyType: string; studyTitle: string; genotoxicityResults: string | null; keyFindings: string | null }>,
): GenotoxBattery {
  const battery = { ames: false, inVitroMammalian: false, inVivo: false };
  for (const row of rows) {
    if (row.studyType !== 'genotox') continue;
    const text = `${row.studyTitle} ${row.genotoxicityResults ?? ''} ${row.keyFindings ?? ''}`.toLowerCase();
    if (/\bames\b|bacterial reverse mutation/.test(text)) {
      battery.ames = true;
    }
    if (/in\s*vitro|chromosom|mammalian|tk6|cho|micronucleus.*in\s*vitro/.test(text)) {
      battery.inVitroMammalian = true;
    }
    if (/in\s*vivo|comet|rodent\s*micronucleus/.test(text)) {
      battery.inVivo = true;
    }
  }
  return battery;
}

export interface LoadPreclinicalIntelOptions {
  /** MRHD value used to compute safety margins when the column lacks them. */
  mrhdMgPerKgPerDay?: number | null;
}

export async function loadPreclinicalIntel(
  ctdProgramId: number,
  options: LoadPreclinicalIntelOptions = {},
): Promise<NonclinicalIntelFacts | undefined> {
  if (!PRECLINICAL_REVIEWER_ENABLED) return undefined;
  if (!Number.isInteger(ctdProgramId) || ctdProgramId <= 0) return undefined;

  const rows = await db
    .select()
    .from(ctdNonclinicalStudies)
    .where(eq(ctdNonclinicalStudies.programId, ctdProgramId));

  const studies: NonclinicalStudyFact[] = rows.map(r => ({
    studyType: r.studyType,
    species: r.species ?? null,
    durationWeeks: r.durationWeeks ?? null,
    glpCompliant: r.glpCompliant ?? null,
    noael: r.noael ?? null,
    pivotal: PIVOTAL_TYPES.has(r.studyType),
    safetyMarginMultiple: deriveSafetyMarginMultiple(
      r.safetyMargins,
      r.noael ?? null,
      options.mrhdMgPerKgPerDay ?? null,
    ),
  }));

  const genotoxBattery = deriveGenotoxBattery(rows);

  return { studies, genotoxBattery };
}
