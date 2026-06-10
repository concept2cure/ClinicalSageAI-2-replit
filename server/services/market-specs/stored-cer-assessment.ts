/**
 * Stored-CER assessment — gap-checks an EXISTING cer_reports / cer_sections record
 * against the canonical CER structure (cer-structure.ts).
 *
 * The CER structure model assesses supplied section ids; this reads what a tenant
 * actually has stored and maps it onto the canonical MEDDEV 2.7/1 / MDR Annex XIV
 * sections, so the blueprint/oversight can gap-check a real, persisted CER — not a
 * hand-supplied list. The mapping is heuristic (the stored sectionId/title is
 * free-form): a canonical section counts as present when a populated cer_reports
 * JSON column maps to it OR a cer_sections row's id/title matches its keywords.
 *
 * Two layers: the pure mapper (`mapStoredCerToCanonicalSections`, unit-testable)
 * and the DB orchestrator (`assessStoredCer`, tenant-scoped; needs a database).
 *
 * @module server/services/market-specs/stored-cer-assessment
 */

import { eq, and } from 'drizzle-orm';
import { db } from '../../db';
import { cerReports, cerSections } from '../../../shared/schema';
import { assessCerStructure, type CerAssessment } from './cer-structure';

/** The cer_reports JSON columns that map onto canonical CER sections. */
export interface StoredCerReportFields {
  executiveSummary?: unknown;
  deviceDescription?: unknown;
  clinicalBackground?: unknown;
  clinicalEvidence?: unknown;
  literatureReview?: unknown;
  riskBenefitAnalysis?: unknown;
  conclusions?: unknown;
}

export interface StoredCerSectionRow {
  sectionId: string;
  title: string;
}

/** Populated = non-null, non-empty value (an empty JSON object/string is "absent"). */
function populated(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return false;
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  return true;
}

/** cer_reports JSON column → canonical CER section id. */
const COLUMN_TO_SECTION: Array<{ key: keyof StoredCerReportFields; section: string }> = [
  { key: 'executiveSummary', section: 'summary' },
  { key: 'deviceDescription', section: 'device_description' },
  { key: 'clinicalBackground', section: 'clinical_background' },
  { key: 'clinicalEvidence', section: 'clinical_data' },
  { key: 'literatureReview', section: 'clinical_data' },
  { key: 'riskBenefitAnalysis', section: 'analysis' },
  { key: 'conclusions', section: 'conclusions' },
];

/** Keywords that map a free-form cer_sections id/title onto a canonical section. */
const SECTION_KEYWORDS: Record<string, string[]> = {
  summary: ['summary'],
  scope: ['scope'],
  clinical_background: ['clinical background', 'state of the art', 'current knowledge', 'background'],
  device_description: ['device description', 'device under evaluation', 'device'],
  equivalence: ['equivalence', 'equivalent device'],
  clinical_data: ['clinical data', 'literature', 'clinical evidence', 'clinical experience'],
  appraisal: ['appraisal', 'appraise'],
  analysis: ['analysis', 'benefit-risk', 'benefit risk', 'risk-benefit', 'risk benefit'],
  pmcf: ['pmcf', 'post-market clinical follow', 'post market clinical follow'],
  conclusions: ['conclusion'],
  evaluator_qualification: ['qualification', 'evaluator', 'curriculum', 'cv'],
  references: ['reference', 'appendix', 'appendic', 'bibliograph'],
};

function norm(s: string): string {
  return (s || '').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export interface StoredCerMapping {
  /** Canonical CER section ids judged present. */
  present: string[];
  /** Where each present section was found (column name and/or section row). */
  sources: Record<string, string[]>;
}

/**
 * Map a stored CER (report JSON columns + section rows) onto the canonical CER
 * section ids. Pure + deterministic.
 */
export function mapStoredCerToCanonicalSections(
  report: StoredCerReportFields,
  sections: StoredCerSectionRow[]
): StoredCerMapping {
  const sources: Record<string, string[]> = {};
  const add = (section: string, src: string) => {
    (sources[section] ??= []).push(src);
  };

  // From the report's populated JSON columns.
  for (const { key, section } of COLUMN_TO_SECTION) {
    if (populated(report[key])) add(section, `column:${key}`);
  }

  // From the free-form section rows (match id or title against keywords).
  for (const row of sections || []) {
    const hay = `${norm(row.sectionId)} ${norm(row.title)}`;
    for (const [section, keywords] of Object.entries(SECTION_KEYWORDS)) {
      if (keywords.some((k) => hay.includes(k))) add(section, `section:${row.sectionId || row.title}`);
    }
  }

  return { present: Object.keys(sources), sources };
}

export interface StoredCerAssessmentResult {
  reportId: string;
  deviceName: string;
  regulatoryFramework: string | null;
  presentSections: string[];
  mapping: Record<string, string[]>;
  assessment: CerAssessment;
}

class StoredCerError extends Error {
  constructor(public code: 'NOT_FOUND', message: string) {
    super(message);
    this.name = 'StoredCerError';
  }
}

/**
 * Assess a stored CER. Tenant-scoped: the cer_reports row must belong to
 * organizationId. Loads the report + its sections, maps them to the canonical
 * structure, and runs the completeness assessment.
 *
 * @throws StoredCerError('NOT_FOUND') when the report is not in the organization.
 */
export async function assessStoredCer(params: {
  reportId: string;
  organizationId: number;
  equivalenceClaimed?: boolean;
}): Promise<StoredCerAssessmentResult> {
  const [report] = await db
    .select()
    .from(cerReports)
    .where(and(eq(cerReports.reportId, params.reportId), eq(cerReports.organizationId, params.organizationId)))
    .limit(1);
  if (!report) {
    throw new StoredCerError('NOT_FOUND', `CER report "${params.reportId}" not found for this organization.`);
  }

  const sectionRows = await db
    .select({ sectionId: cerSections.sectionId, title: cerSections.title })
    .from(cerSections)
    .where(eq(cerSections.reportId, params.reportId));

  const mapping = mapStoredCerToCanonicalSections(report as StoredCerReportFields, sectionRows);
  const assessment = assessCerStructure(mapping.present, { equivalenceClaimed: params.equivalenceClaimed });

  return {
    reportId: report.reportId,
    deviceName: report.deviceName,
    regulatoryFramework: report.regulatoryFramework ?? null,
    presentSections: mapping.present,
    mapping: mapping.sources,
    assessment,
  };
}

export default { mapStoredCerToCanonicalSections, assessStoredCer };
