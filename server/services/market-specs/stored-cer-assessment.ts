/**
 * Stored-CER assessment — gap-checks an EXISTING cer_reports / cer_sections record
 * against the canonical CER structure (cer-structure.ts) or, for an IVDR report,
 * the canonical PER structure (per-structure.ts).
 *
 * The structure models assess supplied section ids; this reads what a tenant
 * actually has stored and maps it onto the canonical sections, so the
 * blueprint/oversight (assess_stored_cer) and the CER conformance validator
 * (server/services/cer/cerConformanceValidator.ts) gap-check a real, persisted
 * report — not a hand-supplied list.
 *
 * A canonical section counts as present when
 *   - a populated cer_reports JSON column maps to it (the column is a fixed,
 *     named field), OR
 *   - a cer_sections row with content has a HEADING (its title) that names it.
 *
 * A heading names a section only when, with its numbering ("2.", "4.5",
 * "Section 8:") and styling (markdown "#", "**", HTML tags, parentheticals)
 * removed, it IS one of the phrases of that framework's heading vocabulary.
 * Every accepted form is spelled out; no generic qualifier word may be appended
 * ("Appraisal Plan" is a plan, not the appraisal). Containing a keyword is not
 * naming: "Endoscope Design Overview" is not a scope section, "Analyser IQ OQ
 * Qualification" is not evaluator qualification, "Reference Interval Study" is
 * not a references section. A heading carrying a term of art of the OTHER
 * framework names nothing. The row id is not a heading and is never read.
 * Anything that is not recognised is not found — fail closed — and is reported
 * back as an unmatched heading so the author can see why.
 *
 * (Until 2026-10-05 rows were matched by substring keyword over id + title, so
 * "endoscope" was a scope section and equipment "qualification" was evaluator
 * qualification; review of g-cer-validator-canonical then showed whole-word
 * keywords fail the same way on IVD terms of art such as "reference interval".)
 *
 * Fail closed on content too: blank strings, empty HTML, empty objects/arrays
 * and containers whose every value is blank do not count, and an IVDR report's
 * CER-shaped columns map only where the PER section is unambiguous.
 *
 * Layers: the pure mappers (`mapStoredCerToCanonicalSections`,
 * `mapStoredPerToCanonicalSections`), the one tenant-scoped loader
 * (`loadStoredCer`), and the DB orchestrator (`assessStoredCer`).
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
  /** The row's heading. The only thing that can name a canonical section. */
  title: string;
  /**
   * The row's stored content. When the key is present, a row with no populated
   * content counts toward nothing (an empty placeholder is not a written
   * section). Callers that only know id/title may omit it.
   */
  content?: unknown;
}

/**
 * Populated = carries real content. Null/undefined, blank strings, strings that
 * are only HTML tags / &nbsp;, empty arrays and objects, and containers whose
 * every value is itself unpopulated are "absent". Numbers and booleans count.
 */
export function populated(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') {
    return v.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').trim().length > 0;
  }
  if (Array.isArray(v)) return v.some(populated);
  if (typeof v === 'object') return Object.values(v as object).some(populated);
  return true;
}

// ── Heading vocabularies ──────────────────────────────────────────────────────

/** A framework's closed heading vocabulary. Phrases are in normalised form. */
export interface HeadingVocabulary {
  framework: 'CER (EU MDR / MEDDEV 2.7/1 Rev 4)' | 'PER (EU IVDR)';
  /** Canonical section id → the headings that name it. */
  headings: Readonly<Record<string, readonly string[]>>;
  /**
   * Terms of art of the OTHER framework. A heading containing one (as whole
   * words) names no section here, and no phrase above may contain one.
   */
  excludedTerms: readonly string[];
}

/** Shared by both frameworks: evaluator qualification has the same headings. */
const EVALUATOR_HEADINGS = [
  'qualification of the evaluators',
  'qualification of the evaluator',
  'qualification of the responsible evaluators',
  'qualifications of the evaluators',
  'evaluator qualification',
  'evaluator qualifications',
  'evaluators',
  'evaluator cvs',
  'cvs of the evaluators',
  'curriculum vitae of the evaluators',
] as const;

/**
 * Shared by both frameworks: the reference list. Only the plural or an explicit
 * list — never the bare word "reference", which in an IVD document is a term of
 * art (reference interval, range, material, method, measurement procedure).
 */
const REFERENCE_HEADINGS = [
  'references',
  'references and appendices',
  'reference list',
  'list of references',
  'bibliography',
] as const;

/**
 * CER headings: the canonical CER_SECTIONS titles and the MEDDEV 2.7/1 Rev 4
 * Appendix A9 table-of-contents headings (recall — see the step's facts file).
 */
export const CER_HEADING_VOCABULARY: HeadingVocabulary = {
  framework: 'CER (EU MDR / MEDDEV 2.7/1 Rev 4)',
  headings: {
    summary: ['summary', 'executive summary', 'summary of the clinical evaluation'],
    scope: [
      'scope',
      'scope of the clinical evaluation',
      'scope of the evaluation',
      'scope of the clinical evaluation report',
    ],
    clinical_background: [
      'clinical background current knowledge state of the art',
      'clinical background current knowledge and state of the art',
      'clinical background',
      'current knowledge state of the art',
      'current knowledge and state of the art',
      'state of the art',
    ],
    device_description: [
      'device under evaluation',
      'device description',
      'description of the device',
      'description of the device under evaluation',
    ],
    equivalence: [
      'equivalence',
      'demonstration of equivalence',
      'equivalent device',
      'equivalent devices',
      'equivalent device justification',
      'equivalence justification',
    ],
    clinical_data: [
      'type generation and sources of clinical data',
      'sources of clinical data',
      'clinical data',
      'clinical data generated and held by the manufacturer',
      'clinical data from literature',
      'clinical data from the literature',
      'identification of pertinent data',
      'literature review',
      'clinical evidence',
    ],
    appraisal: [
      'appraisal of the clinical data',
      'appraisal of clinical data',
      'summary and appraisal of clinical data',
      'summary and appraisal of the clinical data',
      'appraisal of pertinent data',
      'appraisal',
    ],
    analysis: [
      'analysis of the clinical data',
      'analysis of clinical data',
      'benefit risk analysis',
      'risk benefit analysis',
    ],
    pmcf: [
      'post market clinical follow up',
      'post market clinical follow up considerations',
      'post market clinical follow up plan',
      'pmcf',
      'pmcf considerations',
      'pmcf plan',
    ],
    conclusions: ['conclusions', 'conclusion'],
    evaluator_qualification: EVALUATOR_HEADINGS,
    references: REFERENCE_HEADINGS,
  },
  excludedTerms: [
    'performance evaluation',
    'scientific validity',
    'analytical performance',
    'clinical performance',
    'pmpf',
    'post market performance follow up',
    'pep',
    'analyte',
    'reference interval',
    'reference intervals',
    'reference range',
    'reference ranges',
    'reference material',
    'reference materials',
    'reference method',
    'reference methods',
    'reference measurement',
    'reference standard',
  ],
};

/**
 * PER headings: the canonical PER_SECTIONS titles and the IVDR Annex XIII Part
 * A report names (recall — see the step's facts file).
 */
export const PER_HEADING_VOCABULARY: HeadingVocabulary = {
  framework: 'PER (EU IVDR)',
  headings: {
    pep: ['performance evaluation plan', 'pep'],
    scientific_validity: ['scientific validity', 'scientific validity report'],
    analytical_performance: [
      'analytical performance',
      'analytical performance report',
      'analytical performance studies',
    ],
    clinical_performance: [
      'clinical performance',
      'clinical performance report',
      'clinical performance studies',
    ],
    per_conclusion: [
      'performance evaluation report integration and benefit risk',
      'integration and benefit risk',
      'benefit risk determination',
      'benefit risk',
      'conclusions',
      'conclusion',
    ],
    pmpf: [
      'post market performance follow up',
      'post market performance follow up considerations',
      'post market performance follow up plan',
      'pmpf',
      'pmpf considerations',
      'pmpf plan',
    ],
    evaluator_qualification: EVALUATOR_HEADINGS,
    references: REFERENCE_HEADINGS,
  },
  excludedTerms: [
    'clinical evaluation',
    'clinical investigation',
    'clinical evidence',
    'clinical data',
    'pmcf',
    'post market clinical follow up',
    'equivalence',
    'equivalent device',
    'equivalent devices',
    'cep',
  ],
};

/** Leading numbering: "2", "4.5.", "A9", "iv)", "b.", optionally "Section"/"Chapter"/"Part"/"§". */
const LEADING_NUMBERING =
  /^(?:(?:section|chapter|part|§)\s*)?(?:[a-z]?\d+(?:\.\d+)*[.)]?|[ivx]+[.)]|[a-z][.)])(?=[\s:.)–—-]|$)[\s:.)–—-]*/;

/**
 * Reduce a heading to its words: HTML tags, markdown markers, parentheticals
 * and leading numbering removed; lower case; every non-alphanumeric run is one
 * space ("Post-Market" → "post market", "&" → "and").
 */
export function normaliseHeading(raw: string): string {
  const s = (raw || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .toLowerCase()
    .replace(/&amp;|&/g, ' and ')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/^[\s#*_>]+/, '')
    .replace(LEADING_NUMBERING, '');
  return s.replace(/[^a-z0-9]+/g, ' ').trim();
}

const indexCache = new WeakMap<HeadingVocabulary, Map<string, string>>();

function phraseIndex(vocab: HeadingVocabulary): Map<string, string> {
  let index = indexCache.get(vocab);
  if (!index) {
    index = new Map();
    for (const [section, phrases] of Object.entries(vocab.headings)) {
      for (const p of phrases) index.set(p, section);
    }
    indexCache.set(vocab, index);
  }
  return index;
}

/**
 * The canonical section a heading names in this vocabulary, or null. Pure.
 */
export function sectionForHeading(raw: string, vocab: HeadingVocabulary): string | null {
  const h = normaliseHeading(raw);
  if (!h) return null;
  const padded = ` ${h} `;
  if (vocab.excludedTerms.some(t => padded.includes(` ${t} `))) return null;
  return phraseIndex(vocab).get(h) ?? null;
}

// ── Mapping ───────────────────────────────────────────────────────────────────

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

/**
 * cer_reports JSON column → canonical PER section id, for an IVDR report. The
 * columns are CER-shaped, so only the unambiguous ones map: the benefit-risk
 * analysis and the conclusions are the integration section. "Clinical
 * evidence" is an IVDR term of art spanning all three pillars, so the
 * clinicalEvidence column stands in for none of them; nothing maps to the PEP,
 * the pillars, PMPF, evaluator qualification or references — those must be
 * section rows under their headings.
 */
const PER_COLUMN_TO_SECTION: Array<{ key: keyof StoredCerReportFields; section: string }> = [
  { key: 'riskBenefitAnalysis', section: 'per_conclusion' },
  { key: 'conclusions', section: 'per_conclusion' },
];

export interface StoredCerMapping {
  /** Canonical section ids judged present. */
  present: string[];
  /** Where each present section was found (column name and/or heading). */
  sources: Record<string, string[]>;
  /** Headings of content-bearing rows that name no canonical section. */
  unmatchedHeadings: string[];
}

/** The one mapper: report columns + content-bearing rows' headings → canonical ids. */
function mapStored(
  report: StoredCerReportFields,
  sections: StoredCerSectionRow[],
  columns: Array<{ key: keyof StoredCerReportFields; section: string }>,
  vocab: HeadingVocabulary
): StoredCerMapping {
  const sources: Record<string, string[]> = {};
  const unmatchedHeadings: string[] = [];
  const add = (section: string, src: string) => {
    (sources[section] ??= []).push(src);
  };

  for (const { key, section } of columns) {
    if (populated(report[key])) add(section, `column:${key}`);
  }

  for (const row of sections || []) {
    if ('content' in row && !populated(row.content)) continue;
    const section = sectionForHeading(row.title, vocab);
    if (section) add(section, `heading:${(row.title || '').trim()}`);
    else unmatchedHeadings.push((row.title || '').trim());
  }

  return { present: Object.keys(sources), sources, unmatchedHeadings };
}

/**
 * Map a stored CER (report JSON columns + section rows) onto the canonical CER
 * section ids (cer-structure.ts). Pure + deterministic.
 */
export function mapStoredCerToCanonicalSections(
  report: StoredCerReportFields,
  sections: StoredCerSectionRow[]
): StoredCerMapping {
  return mapStored(report, sections, COLUMN_TO_SECTION, CER_HEADING_VOCABULARY);
}

/**
 * Map a stored IVDR report (report JSON columns + section rows) onto the
 * canonical PER section ids (per-structure.ts). Pure + deterministic.
 */
export function mapStoredPerToCanonicalSections(
  report: StoredCerReportFields,
  sections: StoredCerSectionRow[]
): StoredCerMapping {
  return mapStored(report, sections, PER_COLUMN_TO_SECTION, PER_HEADING_VOCABULARY);
}

// ── Loading + orchestration ───────────────────────────────────────────────────

/** A stored report as loaded: the cer_reports row and its cer_sections rows. */
export interface LoadedStoredCer {
  report: typeof cerReports.$inferSelect;
  sections: StoredCerSectionRow[];
}

/**
 * Load a stored CER/PER — the cer_reports row and its section rows, with their
 * content. Tenant-scoped: returns null when the report is not in the
 * organization. The single loader for every stored-report check.
 */
export async function loadStoredCer(
  reportId: string,
  organizationId: number
): Promise<LoadedStoredCer | null> {
  const [report] = await db
    .select()
    .from(cerReports)
    .where(and(eq(cerReports.reportId, reportId), eq(cerReports.organizationId, organizationId)))
    .limit(1);
  if (!report) return null;

  const sections = await db
    .select({ sectionId: cerSections.sectionId, title: cerSections.title, content: cerSections.content })
    .from(cerSections)
    .where(eq(cerSections.reportId, reportId));

  return { report, sections };
}

export interface StoredCerAssessmentResult {
  reportId: string;
  deviceName: string;
  regulatoryFramework: string | null;
  presentSections: string[];
  mapping: Record<string, string[]>;
  unmatchedHeadings: string[];
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
 * organizationId. Loads the report + its sections (loadStoredCer), maps them to
 * the canonical CER structure, and runs the completeness assessment.
 *
 * @throws StoredCerError('NOT_FOUND') when the report is not in the organization.
 */
export async function assessStoredCer(params: {
  reportId: string;
  organizationId: number;
  equivalenceClaimed?: boolean;
}): Promise<StoredCerAssessmentResult> {
  const loaded = await loadStoredCer(params.reportId, params.organizationId);
  if (!loaded) {
    throw new StoredCerError('NOT_FOUND', `CER report "${params.reportId}" not found for this organization.`);
  }
  const { report, sections } = loaded;

  const mapping = mapStoredCerToCanonicalSections(report as StoredCerReportFields, sections);
  const assessment = assessCerStructure(mapping.present, { equivalenceClaimed: params.equivalenceClaimed });

  return {
    reportId: report.reportId,
    deviceName: report.deviceName,
    regulatoryFramework: report.regulatoryFramework ?? null,
    presentSections: mapping.present,
    mapping: mapping.sources,
    unmatchedHeadings: mapping.unmatchedHeadings,
    assessment,
  };
}

export default {
  mapStoredCerToCanonicalSections,
  mapStoredPerToCanonicalSections,
  loadStoredCer,
  assessStoredCer,
};
