/**
 * @fileoverview Module 4 (4.2.x) Nonclinical Study Report Authoring Engine
 * @module server/services/authoring/nonclinical-study-report-builder
 *
 * Authors a single Module 4 nonclinical study report (one report per study) in
 * the standard study-report structure, drafting each section via the unified AI
 * gateway. Consumes the preclinical extractor's structured output
 * (`PreclinicalStudy` from preclinical-extraction-schema) so a report can be
 * drafted directly from an ingested study record.
 *
 * INTEGRATION NOTES
 * -----------------
 * - Mirrors `server/services/csr-builder.ts` so it compiles and integrates:
 *     • AI drafting uses the SAME dynamic import + call as csr-builder:
 *       `(await import('../../lib/unified-ai-client.js')).ai`, then
 *       `ai.complete(messages, { taskType, maxTokens, temperature,
 *       callerModule })`, degrading to template drafting when the gateway is
 *       absent.
 *     • The section model mirrors csr-builder's `CSRSection`.
 *     • The build-job model mirrors `CSRBuildJob` (`id`, `status`, `progress`,
 *       `sections`, `createdAt`).
 * - Input shape is the preclinical extracted-data schema
 *   (`PreclinicalStudy` / `PreclinicalStudyType`) used by the ingest pipeline,
 *   plus the loosely-typed `NonclinicalStudyInput` so a row already mapped by
 *   the program loader can be authored too. No existing files are edited.
 * - Per-section results carry `{ status: 'rendered' | 'partial' | 'missing',
 *   content, gaps }` computed deterministically from the supplied data, so the
 *   gap engine is unit-testable offline.
 *
 * @compliance ICH M4S(R2); ICH M3(R2); CTD Module 4.2.x.
 */

import type {
  PreclinicalStudy,
  PreclinicalStudyType,
} from '../preclinical/preclinical-extraction-schema.js';
import type { NonclinicalStudyInput } from '../preclinical/nonclinical-m24-adapter.js';

// AI-powered drafting via the unified AI client (Claude primary) — identical
// acquisition pattern to csr-builder.
let ai: { complete: (messages: any, options?: any) => Promise<string> } | null = null;
try {
  const mod = await import('../../lib/unified-ai-client.js');
  ai = mod.ai;
} catch {
  console.warn('[Nonclinical Study Report Builder] Unified AI client not available, using template drafting');
}

// ═══════════════════════════════════════════════════════════════════════════════
// STUDY REPORT SECTION STRUCTURE (standard nonclinical study report)
// ═══════════════════════════════════════════════════════════════════════════════

/** Coarse study discipline used for section emphasis and the CTD section number. */
export type NonclinicalDiscipline = 'pharmacology' | 'pharmacokinetics' | 'toxicology';

export interface NSRSection {
  number: string;
  title: string;
  required: boolean;
  description: string;
  content?: string;
  status: 'empty' | 'drafting' | 'drafted' | 'reviewed' | 'approved';
  /** Which extracted-data fields this section needs (for the gap engine). */
  // Fields the section needs, checked against the normalized study by the gap
  // engine. Typed against NormalizedNSRStudy (what detectSectionGaps actually
  // reads) so completeness-critical fields it holds — e.g. doseGroups — can gate
  // a section even when the raw PreclinicalStudy input type has no such key.
  requires: Array<keyof NormalizedNSRStudy>;
}

export const NONCLINICAL_STUDY_REPORT_STRUCTURE: NSRSection[] = [
  { number: '1', title: 'Title Page', required: true, status: 'empty', requires: ['studyTitle'], description: 'Study title, report number, study type, testing facility, GLP statement, dates' },
  { number: '2', title: 'Summary', required: true, status: 'empty', requires: ['keyFindings'], description: 'Concise summary of the study design, key results, and conclusion (NOAEL/LOAEL where applicable)' },
  { number: '3', title: 'Objective', required: true, status: 'empty', requires: ['studyType'], description: 'Purpose of the study and the question it was designed to answer' },
  { number: '4', title: 'Materials and Methods', required: true, status: 'empty', requires: ['species', 'routeOfAdministration', 'doseGroups'], description: 'Test article, species/strain, group design and dose levels, route, duration, endpoints, and analytical/statistical methods' },
  { number: '5', title: 'Results', required: true, status: 'empty', requires: ['keyFindings'], description: 'Observed findings: mortality, clinical signs, body weight, clinical pathology, organ weights, macroscopic/microscopic pathology, toxicokinetics' },
  { number: '6', title: 'Discussion and Conclusion', required: true, status: 'empty', requires: ['keyFindings', 'noael'], description: 'Interpretation of findings, dose-response, adversity, NOAEL/LOAEL determination, and overall conclusion' },
  { number: '7', title: 'Tabulated Data', required: true, status: 'empty', requires: ['targetOrganToxicity'], description: 'Summary tables of group means, target-organ findings, NOAEL/LOAEL, and safety margins' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// BUILD JOB
// ═══════════════════════════════════════════════════════════════════════════════

export type NSRSectionStatus = 'rendered' | 'partial' | 'missing';

export interface NSRGeneratedTable {
  title: string;
  headers: string[];
  rows: string[][];
}

export interface NSRSectionResult {
  number: string;
  title: string;
  required: boolean;
  status: NSRSectionStatus;
  content: string;
  gaps: string[];
}

export interface NonclinicalStudyReportRequest {
  organizationId?: number;
  userId?: number;
  projectId?: number;
  /** The extracted study record (preferred input). */
  study: PreclinicalStudy | NonclinicalStudyInput;
  /** Drug substance / test article name for narrative. */
  drugSubstanceName?: string;
  /** Specific sections to draft, or all when empty. */
  sectionsToGenerate?: string[];
  /** When true, skip AI even if available (deterministic template build). */
  templateOnly?: boolean;
}

export interface NonclinicalStudyReportJob {
  id: number;
  status: 'queued' | 'generating' | 'complete' | 'failed';
  progress: number;
  /** CTD Module 4.2.x section the report belongs under. */
  reportSection: string;
  discipline: NonclinicalDiscipline;
  sections: NSRSectionResult[];
  tables: NSRGeneratedTable[];
  completeness: number;
  createdAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build a single Module 4 nonclinical study report from an extracted study
 * record. Drafts each section via the unified AI gateway (falling back to
 * templates) and returns each section with a deterministic `{ status, gaps }`
 * verdict, plus headline tabulated data.
 */
export async function buildNonclinicalStudyReport(
  request: NonclinicalStudyReportRequest,
): Promise<NonclinicalStudyReportJob> {
  const study = normalizeStudy(request.study);
  const discipline = disciplineFor(study.studyType);
  const structure = JSON.parse(JSON.stringify(NONCLINICAL_STUDY_REPORT_STRUCTURE)) as NSRSection[];
  const useAI = !!ai && !request.templateOnly;

  const sections: NSRSectionResult[] = [];
  for (const section of structure) {
    if (request.sectionsToGenerate?.length && !request.sectionsToGenerate.includes(section.number)) {
      continue;
    }

    const gaps = detectSectionGaps(section, study);
    const status = sectionStatus(section, gaps);

    const content =
      status === 'missing'
        ? `[${section.number} ${section.title}] — insufficient data. Missing: ${gaps.join('; ')}.`
        : useAI
          ? await draftSectionWithAI(section, study, discipline, request.drugSubstanceName)
          : draftSectionTemplate(section, study, discipline, request.drugSubstanceName);

    sections.push({
      number: section.number,
      title: section.title,
      required: section.required,
      status,
      content,
      gaps,
    });
  }

  const required = sections.filter(s => s.required);
  const rendered = required.filter(s => s.status === 'rendered').length;
  const completeness = required.length ? Math.round((rendered / required.length) * 100) : 0;

  return {
    id: Date.now(),
    status: 'complete',
    progress: 100,
    reportSection: ctdSection(study.studyType),
    discipline,
    sections,
    tables: buildTables(study),
    completeness,
    createdAt: new Date(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DETERMINISTIC: normalization, classification, gap detection
// ═══════════════════════════════════════════════════════════════════════════════

/** A unified, internal study shape covering both supported input types. */
export interface NormalizedNSRStudy {
  studyType: string;
  studyTitle: string;
  species: string | null;
  strain: string | null;
  routeOfAdministration: string | null;
  durationWeeks: number | null;
  glpCompliant: boolean | null;
  // Dose-group design (arm label + dose level). Empty until captured — a
  // repeat-dose tox report cannot be complete without it, so Materials &
  // Methods (§4) requires it and stays 'partial' while it is absent rather than
  // reading 'rendered' over a "[group design/dose levels to be inserted]" body.
  doseGroups: Array<{ group: string; doseLevel: string }>;
  noael: string | null;
  loael: string | null;
  mtd: string | null;
  keyFindings: string | null;
  targetOrganToxicity: Array<{ organ: string; severity: string; doseLevel: string | null }>;
  genotoxicityResults: string | null;
  carcinogenicityFindings: string | null;
  reproductiveToxicity: string | null;
  safetyMargins: Array<{ basis: string; multiple: number }>;
  studyReportNumber: string | null;
  testingFacility: string | null;
}

function isPreclinicalStudy(s: PreclinicalStudy | NonclinicalStudyInput): s is PreclinicalStudy {
  // PreclinicalStudy always carries extractionConfidence; the loose input never does.
  return typeof (s as PreclinicalStudy).extractionConfidence === 'number';
}

/** Map either supported input type into the internal study shape. */
/**
 * `doseGroups` is present on some study shapes and absent from the declared
 * types of others, so it is read structurally rather than asserted onto them.
 *
 * This was written inline twice as a pair of casts, and the second one —
 * `input as { doseGroups: Array<{ group, doseLevel }> }` — does not typecheck:
 * neither declared input type overlaps that shape, so tsc rejects the
 * conversion (TS2352). Going through `unknown` once, in one place, is both
 * legal and the only honest description of what is happening: we do not know
 * that this field exists, we look.
 */
function readDoseGroups(v: unknown): Array<{ group: string; doseLevel: string }> {
  const dg = (v as { doseGroups?: unknown } | null | undefined)?.doseGroups;
  return Array.isArray(dg) ? (dg as Array<{ group: string; doseLevel: string }>) : [];
}

export function normalizeStudy(input: PreclinicalStudy | NonclinicalStudyInput): NormalizedNSRStudy {
  if (isPreclinicalStudy(input)) {
    return {
      studyType: input.studyType,
      studyTitle: input.studyTitle,
      species: input.species,
      strain: input.strain,
      routeOfAdministration: input.routeOfAdministration,
      durationWeeks: input.durationWeeks,
      glpCompliant: input.glpCompliant,
      doseGroups: readDoseGroups(input),
      noael: input.noael,
      loael: input.loael,
      mtd: input.mtd,
      keyFindings: input.keyFindings,
      targetOrganToxicity: input.targetOrganToxicity ?? [],
      genotoxicityResults: input.genotoxicityResults,
      carcinogenicityFindings: input.carcinogenicityFindings,
      reproductiveToxicity: input.reproductiveToxicity,
      safetyMargins: input.safetyMargins ?? [],
      studyReportNumber: input.studyReportNumber,
      testingFacility: input.testingFacility,
    };
  }
  // Loosely-typed NonclinicalStudyInput
  const loose = input;
  return {
    studyType: loose.studyType,
    studyTitle: loose.studyTitle ?? loose.studyId ?? 'Nonclinical Study',
    species: loose.species ?? null,
    strain: null,
    routeOfAdministration: null,
    durationWeeks: loose.durationWeeks ?? null,
    glpCompliant: loose.glpCompliant ?? (loose.glpStatus ? loose.glpStatus === 'GLP' : null),
    doseGroups: readDoseGroups(loose),
    noael: loose.noael ?? loose.noel ?? null,
    loael: null,
    mtd: null,
    keyFindings: loose.keyFindings ?? loose.primaryFinding ?? null,
    targetOrganToxicity: [],
    genotoxicityResults: null,
    carcinogenicityFindings: null,
    reproductiveToxicity: null,
    safetyMargins: [],
    studyReportNumber: loose.studyId ?? null,
    testingFacility: null,
  };
}

/** Map an extractor/loader study-type string onto the coarse discipline. */
export function disciplineFor(studyType: string): NonclinicalDiscipline {
  switch (studyType) {
    case 'pharmacology':
    case 'safety_pharm':
    case 'safety_pharmacology':
      return 'pharmacology';
    case 'pk':
    case 'tk':
    case 'adme':
    case 'pharmacokinetics':
      return 'pharmacokinetics';
    case 'single_dose_tox':
    case 'repeat_dose_tox':
    case 'genotox':
    case 'genotoxicity':
    case 'carc':
    case 'carcinogenicity':
    case 'dart':
    case 'reproductive_tox':
    case 'local_tolerance':
    case 'toxicology':
    default:
      return 'toxicology';
  }
}

/** CTD Module 4.2.x section number for a given study type. */
export function ctdSection(studyType: string): string {
  const map: Record<string, string> = {
    pharmacology: '4.2.1.1',
    safety_pharm: '4.2.1.3',
    safety_pharmacology: '4.2.1.3',
    pk: '4.2.2',
    tk: '4.2.2',
    adme: '4.2.2',
    pharmacokinetics: '4.2.2',
    single_dose_tox: '4.2.3.1',
    repeat_dose_tox: '4.2.3.2',
    genotox: '4.2.3.3',
    genotoxicity: '4.2.3.3',
    carc: '4.2.3.4',
    carcinogenicity: '4.2.3.4',
    dart: '4.2.3.5',
    reproductive_tox: '4.2.3.5',
    local_tolerance: '4.2.3.6',
  };
  return map[studyType] ?? '4.2';
}

/** Required extracted-data fields a section needs but the study lacks. */
export function detectSectionGaps(section: NSRSection, study: NormalizedNSRStudy): string[] {
  const gaps: string[] = [];
  for (const field of section.requires) {
    if (isFieldEmpty((study as unknown as Record<string, unknown>)[field as string])) {
      gaps.push(fieldLabel(field));
    }
  }
  return gaps;
}

/**
 * Verdict for a section:
 *  - 'missing'  — every required field is empty.
 *  - 'partial'  — some required fields present, some missing.
 *  - 'rendered' — all required fields present.
 */
export function sectionStatus(section: NSRSection, gaps: string[]): NSRSectionStatus {
  const needed = section.requires.length;
  if (needed === 0) return 'rendered';
  if (gaps.length === 0) return 'rendered';
  if (gaps.length === needed) return 'missing';
  return 'partial';
}

function isFieldEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function fieldLabel(field: keyof NormalizedNSRStudy): string {
  const labels: Partial<Record<keyof NormalizedNSRStudy, string>> = {
    studyTitle: 'study title',
    keyFindings: 'key findings',
    studyType: 'study type',
    species: 'test species',
    routeOfAdministration: 'route of administration',
    targetOrganToxicity: 'target-organ findings',
    doseGroups: 'dose-group design',
    noael: 'NOAEL',
  };
  return labels[field] ?? String(field);
}

/** Return the report section registry (deep copy). */
export function getNonclinicalStudyReportStructure(): NSRSection[] {
  return JSON.parse(JSON.stringify(NONCLINICAL_STUDY_REPORT_STRUCTURE));
}

// ═══════════════════════════════════════════════════════════════════════════════
// AI DRAFTING (mirrors csr-builder's generateSectionWithAI)
// ═══════════════════════════════════════════════════════════════════════════════

async function draftSectionWithAI(
  section: NSRSection,
  study: NormalizedNSRStudy,
  discipline: NonclinicalDiscipline,
  drugSubstanceName?: string,
): Promise<string> {
  if (!ai) return draftSectionTemplate(section, study, discipline, drugSubstanceName);

  const ds = drugSubstanceName || 'the test article';
  const systemPrompt = `You are an expert nonclinical (toxicology/pharmacology) study report writer.
You are drafting one section of a single ${discipline} study report for Module 4 (CTD 4.2.x) of a marketing/IND application.

Study:
- Test article: ${ds}
- Study type: ${study.studyType}
- Title: ${study.studyTitle}
${study.species ? `- Species: ${study.species}${study.strain ? ` (${study.strain})` : ''}` : ''}
${study.routeOfAdministration ? `- Route: ${study.routeOfAdministration}` : ''}
${study.durationWeeks != null ? `- Duration: ${study.durationWeeks} weeks` : ''}
${study.glpCompliant != null ? `- GLP: ${study.glpCompliant ? 'GLP-compliant' : 'non-GLP'}` : ''}
${study.noael ? `- NOAEL: ${study.noael}` : ''}
${study.loael ? `- LOAEL: ${study.loael}` : ''}

Write precise, regulatory-grade scientific prose. Base statements ONLY on the SOURCE DATA provided —
do not invent findings; insert [DATA TO BE INSERTED] where the source is silent. Do NOT use markdown;
plain text with headers in CAPS.`;

  try {
    const content = await ai.complete(
      [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Draft study-report Section ${section.number}: ${section.title}\n\nSection scope: ${section.description}\n\nSOURCE DATA:\n${studyToSourceText(study)}\n\nWrite a complete, submission-ready draft for this section following standard nonclinical study-report conventions.`,
        },
      ],
      {
        taskType: 'document_drafting',
        maxTokens: 4096,
        temperature: 0.3,
        callerModule: 'nonclinical-study-report-builder/section-draft',
      },
    );
    return content;
  } catch (err) {
    console.warn(
      `[Nonclinical Study Report Builder] AI drafting failed for section ${section.number}, using template:`,
      err,
    );
    return draftSectionTemplate(section, study, discipline, drugSubstanceName);
  }
}

function studyToSourceText(study: NormalizedNSRStudy): string {
  const bits = [
    `Study type: ${study.studyType}`,
    `Title: ${study.studyTitle}`,
    study.species && `Species/strain: ${study.species}${study.strain ? ` ${study.strain}` : ''}`,
    study.routeOfAdministration && `Route: ${study.routeOfAdministration}`,
    study.durationWeeks != null && `Duration: ${study.durationWeeks} weeks`,
    study.glpCompliant != null && `GLP: ${study.glpCompliant ? 'GLP' : 'non-GLP'}`,
    study.noael && `NOAEL: ${study.noael}`,
    study.loael && `LOAEL: ${study.loael}`,
    study.mtd && `MTD: ${study.mtd}`,
    study.keyFindings && `Key findings: ${study.keyFindings}`,
    study.targetOrganToxicity.length &&
      `Target-organ findings: ${study.targetOrganToxicity.map(t => `${t.organ} (${t.severity}${t.doseLevel ? ` at ${t.doseLevel}` : ''})`).join('; ')}`,
    study.genotoxicityResults && `Genotoxicity: ${study.genotoxicityResults}`,
    study.carcinogenicityFindings && `Carcinogenicity: ${study.carcinogenicityFindings}`,
    study.reproductiveToxicity && `Reproductive toxicity: ${study.reproductiveToxicity}`,
    study.safetyMargins.length &&
      `Safety margins: ${study.safetyMargins.map(m => `${m.multiple}× (${m.basis})`).join('; ')}`,
  ].filter(Boolean);
  return bits.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE DRAFTING (fallback when AI unavailable)
// ═══════════════════════════════════════════════════════════════════════════════

function draftSectionTemplate(
  section: NSRSection,
  study: NormalizedNSRStudy,
  discipline: NonclinicalDiscipline,
  drugSubstanceName?: string,
): string {
  const ds = drugSubstanceName || 'the test article';
  const glp = study.glpCompliant == null ? '[GLP status to be confirmed]' : study.glpCompliant ? 'This study was conducted in compliance with GLP.' : 'This study was conducted as a non-GLP study.';

  switch (section.number) {
    case '1':
      return `NONCLINICAL STUDY REPORT\n\n${study.studyTitle}\n\nTest Article: ${ds}\nStudy Type: ${study.studyType}\nReport Number: ${study.studyReportNumber || '[Report No.]'}\nTesting Facility: ${study.testingFacility || '[Testing Facility]'}\nCTD Section: ${ctdSection(study.studyType)}\n${glp}`;
    case '2':
      return `SUMMARY\n\nThis ${discipline} study (${study.studyType}) evaluated ${ds}${study.species ? ` in ${study.species}` : ''}${study.durationWeeks != null ? ` over ${study.durationWeeks} weeks` : ''}. ${study.keyFindings || '[Key findings to be inserted.]'}${study.noael ? ` The NOAEL was ${study.noael}.` : ''}${study.loael ? ` The LOAEL was ${study.loael}.` : ''}`;
    case '3':
      return `OBJECTIVE\n\nThe objective of this study was to characterize the ${discipline === 'toxicology' ? 'toxicological profile' : discipline === 'pharmacokinetics' ? 'pharmacokinetic / ADME profile' : 'pharmacological activity'} of ${ds}${study.species ? ` in ${study.species}` : ''} following ${study.routeOfAdministration || '[route]'} administration.`;
    case '4': {
      const doseGroupsText = study.doseGroups.length
        ? `Dose groups: ${study.doseGroups.map(g => `${g.group} (${g.doseLevel})`).join('; ')}.`
        : '[Group design and dose levels to be inserted.]';
      return `MATERIALS AND METHODS\n\nTest Article: ${ds}\nSpecies/Strain: ${study.species || '[species]'}${study.strain ? ` / ${study.strain}` : ''}\nRoute of Administration: ${study.routeOfAdministration || '[route]'}\nDuration: ${study.durationWeeks != null ? `${study.durationWeeks} weeks` : '[duration]'}\n${glp}\n\n${doseGroupsText}\n\n[Endpoint and analytical/statistical methods to be inserted.]`;
    }
    case '5':
      return `RESULTS\n\n${study.keyFindings || '[Observed findings — mortality, clinical signs, body weight, clinical pathology, organ weights, and pathology — to be inserted.]'}${study.targetOrganToxicity.length ? `\n\nTarget-organ findings: ${study.targetOrganToxicity.map(t => `${t.organ} (${t.severity}${t.doseLevel ? ` at ${t.doseLevel}` : ''})`).join('; ')}.` : ''}${study.genotoxicityResults ? `\n\nGenotoxicity: ${study.genotoxicityResults}.` : ''}`;
    case '6':
      return `DISCUSSION AND CONCLUSION\n\nUnder the conditions of this study, ${ds} ${study.keyFindings ? 'produced the findings described above.' : '[interpretation to be inserted].'}${study.noael ? ` The no-observed-adverse-effect level (NOAEL) was determined to be ${study.noael}.` : ' [NOAEL to be determined.]'}${study.loael ? ` The LOAEL was ${study.loael}.` : ''}${study.safetyMargins.length ? ` Safety margins: ${study.safetyMargins.map(m => `${m.multiple}× (${m.basis})`).join('; ')}.` : ''}`;
    case '7':
      return `TABULATED DATA\n\nSee summary tables for group means, target-organ findings, NOAEL/LOAEL, and safety margins.`;
    default:
      return '';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TABULATED DATA
// ═══════════════════════════════════════════════════════════════════════════════

function buildTables(study: NormalizedNSRStudy): NSRGeneratedTable[] {
  const tables: NSRGeneratedTable[] = [];

  tables.push({
    title: 'Study Design Summary',
    headers: ['Parameter', 'Value'],
    rows: [
      ['Study type', study.studyType],
      ['Species/strain', `${study.species ?? '—'}${study.strain ? ` / ${study.strain}` : ''}`],
      ['Route', study.routeOfAdministration ?? '—'],
      ['Duration', study.durationWeeks != null ? `${study.durationWeeks} weeks` : '—'],
      ['GLP', study.glpCompliant == null ? '—' : study.glpCompliant ? 'GLP' : 'non-GLP'],
      ['NOAEL', study.noael ?? '—'],
      ['LOAEL', study.loael ?? '—'],
      ['MTD', study.mtd ?? '—'],
    ],
  });

  if (study.targetOrganToxicity.length) {
    tables.push({
      title: 'Target-Organ Findings',
      headers: ['Organ', 'Severity', 'Dose Level'],
      rows: study.targetOrganToxicity.map(t => [t.organ, t.severity, t.doseLevel ?? '—']),
    });
  }

  if (study.safetyMargins.length) {
    tables.push({
      title: 'Safety Margins',
      headers: ['Basis', 'Multiple'],
      rows: study.safetyMargins.map(m => [m.basis, `${m.multiple}×`]),
    });
  }

  return tables;
}

export default {
  buildNonclinicalStudyReport,
  getNonclinicalStudyReportStructure,
  normalizeStudy,
  disciplineFor,
  ctdSection,
  detectSectionGaps,
  sectionStatus,
  NONCLINICAL_STUDY_REPORT_STRUCTURE,
};
