/**
 * @fileoverview M2 Summary Builders — 2.3 QOS / 2.4 Nonclinical / 2.7 Clinical
 * @module server/services/m2-summary-builders
 *
 * Composes the Module 2 summaries from upstream Module 3 / 4 / 5 inputs:
 *
 *   2.3 Quality Overall Summary (QOS) ← Module 3 (S, P, A, R)
 *   2.4 Nonclinical Overview        ← Module 4 study reports
 *   2.5 Clinical Overview           ← CSR critical benefit-risk assessment
 *   2.7 Clinical Summary            ← CSR §11–12, M5.3
 *
 * These services do NOT produce the upstream content — they consume it. The
 * orchestrator is responsible for ensuring upstream is locked before invoking
 * these summaries (a 2.3 QOS built before M3 is locked is a 2.3 QOS that has
 * to be re-built).
 *
 * Every numbered heading is the one ICH M2–M5 record's (D2 cleanup C4b,
 * 2026-10-26): `heading(code)` reads it, so a composer cannot carry a title of
 * its own. They had: "2.3.P.1 Description and Composition", "2.4.1 Overview of
 * Nonclinical Testing Strategy", "2.7.4.1 Exposure to the Investigational
 * Drug", and SAE and death counts under a "2.7.4.3" that the record holds as
 * Clinical Laboratory Evaluations; 2.4.6, 2.5.7 and 2.7.6 were missing.
 */

import type { ComposedSection, GeneratedTable } from './module3Composer.js';
import type { CSRSection } from './csr-builder.js';
import { ichHeadingTitle } from './ind/ctd/ich-m4-headings.js';
import { ctdRecordSubtree } from './market-specs/ctd-component-outlines.js';
import { phaseLabel, phaseNumbers } from '../../shared/clinical-phase';

/**
 * A heading line as the ICH M2–M5 record numbers and titles it. The first level
 * below a module (2.4.1, 2.3.S) is in capitals, the composers' house style.
 * Throws on a code the record does not hold: a composer cannot invent one.
 */
function heading(code: string): string {
  const title = ichHeadingTitle(code);
  if (title === null) throw new Error(`The ICH M2–M5 record holds no heading ${code}.`);
  return `${code} ${code.split('.').length <= 3 ? title.toUpperCase() : title}`;
}

/**
 * The record's headings below `root` that a composer does not write, as runs
 * in CTD order ("2.7.4.3–2.7.4.5"), for its open items. `composed` is what the
 * composer writes. A heading below one not written is covered by it; a heading
 * the record makes conditional (2.5.6.5, 2.7.4.6) is not an open item and ends
 * a run. (D2 cleanup C4c: the open items named 2.7.6 alone, so they read as if
 * everything else were written.)
 */
function notComposed(root: string, composed: readonly string[]): string[] {
  const written = new Set([root, ...composed]);
  const runs: string[][] = [];
  let run: string[] | null = null;
  for (const h of ctdRecordSubtree(root)) {
    const parent = h.code.slice(0, h.code.lastIndexOf('.'));
    if (!written.has(h.code) && !written.has(parent)) continue; // covered by an ancestor not written
    if (written.has(h.code) || h.condition) { run = null; continue; }
    if (!run) runs.push((run = []));
    run.push(h.code);
  }
  return runs.map((r) => (r.length === 1 ? r[0] : `${r[0]}–${r[r.length - 1]}`));
}

/** The open item naming what `notComposed` found, or none. */
function notComposedGap(root: string, composed: readonly string[]): string[] {
  const runs = notComposed(root, composed);
  return runs.length ? [`headings of ${root} this composer does not write: ${runs.join(', ')}`] : [];
}

/** The literature-reference placeholder: the composer cites nothing, but the text it was given may. */
const literatureReferences = (scope: string, copies: string) =>
  `[This composer cites no literature of its own. List here every reference ${scope} cites, including any in the text it was given; copies of important references are filed in ${copies}.]`;

/**
 * Where a narrative would name the drug substance and none is recorded.
 * 2026-10-15: the builders read `|| 'the drug substance'`, so a summary for a
 * product nobody named read as finished prose and reported no gap.
 */
export const DRUG_SUBSTANCE_NAME_NOT_RECORDED = '[drug substance name not recorded]';
export const DRUG_SUBSTANCE_NAME_GAP = 'drug substance name (not recorded)';

// ── Common types ────────────────────────────────────────────────────────────

export interface M2Summary {
  sectionKey: string;
  title: string;
  narrative: string;
  tables: GeneratedTable[];
  /** Sections from upstream that contributed to this summary */
  inputSectionKeys: string[];
  /** 0–100 — fraction of expected upstream that was available */
  completeness: number;
  /** Inputs that were missing or empty */
  gaps: string[];
  generatedAt: string;
}

export interface M23BuildContext {
  module3Sections: ComposedSection[];
  /** Drug substance name for narrative (pulled from 3.2.S.1) */
  drugSubstanceName?: string;
  /** Drug product name for narrative (pulled from 3.2.P.1) */
  drugProductName?: string;
}

export interface M24BuildContext {
  /** Module 4 study summaries (one per nonclinical study) */
  nonclinicalStudies: NonclinicalStudy[];
  drugSubstanceName?: string;
  indication?: string;
  /** The target-organ adversity classifier's paragraph, printed inside 2.4.4 (preclinical/nonclinical-m24-adapter.ts). */
  targetOrganProfile?: string;
}

export interface NonclinicalStudy {
  studyId: string;
  studyType: 'pharmacology' | 'pharmacokinetics' | 'toxicology' | 'safety_pharmacology' | 'reproductive_tox' | 'genotoxicity' | 'carcinogenicity';
  species?: string;
  duration?: string;
  doseLevels?: string[];
  primaryFinding: string;
  noael?: string;
  noel?: string;
  glpStatus?: 'GLP' | 'non-GLP';
  reportSection: string;
}

export interface M25BuildContext {
  /** CSRs (one per clinical study) — same clinical inputs as the 2.7 summary. */
  csrs: CSRSummaryInput[];
  /** Indication being summarized */
  indication: string;
  /** Investigational product name */
  investigationalProduct: string;
  /** Disease background / unmet need for 2.5.1 (optional). */
  developmentRationale?: string;
  /** One-line nonclinical safety conclusion carried from the 2.4 overview (optional). */
  nonclinicalConclusion?: string;
}

export interface M27BuildContext {
  /** CSRs (one per clinical study) */
  csrs: CSRSummaryInput[];
  /** Indication being summarized */
  indication: string;
  /** Investigational product name */
  investigationalProduct: string;
}

export interface CSRSummaryInput {
  studyId: string;
  protocolNumber: string;
  phase: string;
  studyDesign: string;
  primaryEndpoint: string;
  primaryResult: string;
  /**
   * Recorded outcome of the primary endpoint: true = met, false = not met;
   * absent or null = not recorded. "Efficacy was demonstrated" is printed only
   * from `true` — `primaryResult` is free text and is never read for a verdict.
   */
  primaryEndpointMet?: boolean | null;
  /** Enrolled subjects; null when the study record does not carry it (never 0 for "unknown"). */
  sampleSize: number | null;
  /**
   * The planned size the study information gives, when that is all there is.
   * Shown as planned; never counted as enrolled or exposed.
   */
  plannedSampleSize?: number | null;
  /** ITT analysis population */
  ittPopulation?: number;
  treatmentArms?: string[];
  /** Map of AE preferred term → incidence rate */
  topAEs?: Array<{ pt: string; rate: string; severity?: string }>;
  /** Number of SAEs */
  saeCount?: number;
  /** Number of deaths */
  deathCount?: number;
  /** Reference to ICH E3 sections */
  csrSections?: CSRSection[];
}

// ── 2.3 Quality Overall Summary ─────────────────────────────────────────────

/**
 * The Module 3 sections the QOS summarizes — ICH M4Q 2.3.S.1–S.7 and
 * 2.3.P.1–P.8 — with the excerpt length (null: printed in full, so a stability
 * qualification is never cut) and the text for a section not composed. Each
 * one's QOS heading is the record's 2.3 code for it (`qosHeading`).
 */
const QOS_SECTIONS: ReadonlyArray<{ key: string; chars: number | null; absent: string }> = [
  { key: '3.2.S.1', chars: 400, absent: '[Section 3.2.S.1 not yet composed — drug substance general information missing]' },
  { key: '3.2.S.2', chars: 600, absent: '[Section 3.2.S.2 not yet composed — manufacturing process information missing]' },
  { key: '3.2.S.3', chars: 500, absent: '[Section 3.2.S.3 not yet composed — characterisation data missing]' },
  { key: '3.2.S.4', chars: 500, absent: '[Section 3.2.S.4 not yet composed — specification missing]' },
  { key: '3.2.S.5', chars: 400, absent: '[Section 3.2.S.5 not yet composed]' },
  { key: '3.2.S.6', chars: 400, absent: '[Section 3.2.S.6 not yet composed]' },
  { key: '3.2.S.7', chars: null, absent: '[Section 3.2.S.7 not yet composed — stability data missing]' },
  { key: '3.2.P.1', chars: 400, absent: '[Section 3.2.P.1 not yet composed]' },
  { key: '3.2.P.2', chars: 600, absent: '[Section 3.2.P.2 not yet composed]' },
  { key: '3.2.P.3', chars: 500, absent: '[Section 3.2.P.3 not yet composed]' },
  { key: '3.2.P.4', chars: 400, absent: '[Section 3.2.P.4 not yet composed]' },
  { key: '3.2.P.5', chars: 500, absent: '[Section 3.2.P.5 not yet composed]' },
  { key: '3.2.P.6', chars: 400, absent: '[Section 3.2.P.6 not yet composed]' },
  { key: '3.2.P.7', chars: 400, absent: '[Section 3.2.P.7 not yet composed]' },
  { key: '3.2.P.8', chars: null, absent: '[Section 3.2.P.8 not yet composed]' },
];

/** The QOS heading for a Module 3 section: 3.2.S.4 is summarized under 2.3.S.4. */
const qosHeading = (key: string) => heading(key.replace(/^3\.2\./, '2.3.'));

/**
 * What keeps a Module 3 section from being a complete QOS input, in the
 * section's own terms — or null when it is composed, at 100%, missing nothing,
 * and traced to at least one source record.
 */
function qosSectionOpen(section: ComposedSection | undefined): string | null {
  if (!section) return 'not composed';
  const reasons: string[] = [];
  if (section.lineage.length === 0) reasons.push('no source data');
  if (section.completeness < 100) reasons.push(`${section.completeness}% complete`);
  if (section.missingInputs.length > 0) reasons.push(`missing: ${section.missingInputs.join(', ')}`);
  return reasons.length > 0 ? reasons.join('; ') : null;
}

/**
 * Build M2.3 Quality Overall Summary from a complete Module 3 composition.
 * Per ICH M4Q, the QOS is a high-level summary that mirrors the structure
 * and content of Module 3, but in 40-page summary form.
 */
export function buildM23QualityOverallSummary(ctx: M23BuildContext): M2Summary {
  const sectionsByKey = new Map(ctx.module3Sections.map(s => [s.sectionKey, s]));
  const ds = ctx.drugSubstanceName?.trim() || DRUG_SUBSTANCE_NAME_NOT_RECORDED;
  const dp = ctx.drugProductName || 'the drug product';

  // 2026-10-15: a section used to count as present whenever the composer
  // returned an object for it — which it does for every section, "has no source
  // data available" ones included — over an invented `expected = 10`, so one
  // recorded drug-substance name read "100% complete, no gaps". A section is now
  // complete only by its own completeness, missingInputs and lineage, and the
  // percentage is taken over the M4Q list above (S.5, S.6, P.4, P.6 and P.7 were
  // not summarized at all, so they could never be a gap).
  const rows = QOS_SECTIONS.map(q => {
    const section = sectionsByKey.get(q.key);
    return { ...q, section, open: qosSectionOpen(section) };
  });
  const sectionGaps = rows.filter(r => r.open).map(r => `${r.key} — ${r.open}`);
  // Completeness is over the M4Q sections; the name is a gap, not a section.
  const gaps = ds === DRUG_SUBSTANCE_NAME_NOT_RECORDED ? [...sectionGaps, DRUG_SUBSTANCE_NAME_GAP] : sectionGaps;
  const inputSectionKeys = rows.filter(r => r.section && r.section.lineage.length > 0).map(r => r.key);
  const completeness = Math.round((rows.filter(r => !r.open).length / rows.length) * 100);

  const summarize = (part: string): string[] => rows.filter(r => r.key.startsWith(`3.2.${part}.`)).flatMap(r => [
    qosHeading(r.key),
    !r.section ? r.absent : r.chars === null ? r.section.narrativeDraft : excerpt(r.section.narrativeDraft, r.chars),
    ...(r.section && r.open ? [`[Open in Module 3: ${r.open}.]`] : []),
    ``,
  ]);

  const narrative = [
    `MODULE 2.3 — QUALITY OVERALL SUMMARY`,
    ``,
    `INTRODUCTION`,
    `This Quality Overall Summary (QOS) provides a high-level summary of the chemistry, manufacturing, and controls (CMC) information for ${ds}${dp !== 'the drug product' ? ` and ${dp}` : ''}. ${sectionGaps.length === 0 ? 'The full quality dossier is provided in Module 3.' : 'Module 3 is not yet complete; its open sections are marked below and listed under Open items.'}`,
    ``,
    `2.3.S DRUG SUBSTANCE`,
    ...summarize('S'),
    `2.3.P DRUG PRODUCT`,
    ...summarize('P'),
    gaps.length === 0
      ? `Cross-references: Full data and analytical methods are provided in Module 3.`
      : `Open items: ${gaps.join('; ')}.`,
  ].join('\n');

  // Aggregate key tables from upstream — first table from each section is the headline
  const tables: GeneratedTable[] = rows.flatMap(r => (r.section?.tables[0] ? [r.section.tables[0]] : []));

  return {
    sectionKey: '2.3',
    title: 'Quality Overall Summary',
    narrative,
    tables,
    inputSectionKeys,
    completeness,
    gaps,
    generatedAt: new Date().toISOString(),
  };
}

// ── 2.4 Nonclinical Overview ────────────────────────────────────────────────

/**
 * Build M2.4 Nonclinical Overview from Module 4 study reports.
 * Per ICH M4S, this is an integrated assessment across pharmacology, PK, and tox.
 */
export function buildM24NonclinicalOverview(ctx: M24BuildContext): M2Summary {
  const studies = ctx.nonclinicalStudies;
  const ds = ctx.drugSubstanceName?.trim() || DRUG_SUBSTANCE_NAME_NOT_RECORDED;

  const byType = {
    pharmacology: studies.filter(s => s.studyType === 'pharmacology'),
    safetyPharm: studies.filter(s => s.studyType === 'safety_pharmacology'),
    pk: studies.filter(s => s.studyType === 'pharmacokinetics'),
    tox: studies.filter(s => s.studyType === 'toxicology'),
    repro: studies.filter(s => s.studyType === 'reproductive_tox'),
    geno: studies.filter(s => s.studyType === 'genotoxicity'),
    carcino: studies.filter(s => s.studyType === 'carcinogenicity'),
  };

  // The categories this overview checks; completeness is taken over this list.
  const checked: Array<[string, NonclinicalStudy[]]> = [
    ['primary pharmacology studies', byType.pharmacology], ['safety pharmacology (ICH S7A)', byType.safetyPharm],
    ['pharmacokinetic / ADME studies', byType.pk], ['repeat-dose toxicology', byType.tox],
    ['genotoxicity battery (ICH S2(R1))', byType.geno],
  ];
  const categoryGaps = checked.filter(([, found]) => found.length === 0).map(([label]) => label);
  // 2026-10-15: with every category present this used to conclude "the safety
  // profile ... supports the proposed clinical investigational plan. No
  // nonclinical issues preclude clinical development", whatever the studies
  // found. That is the sponsor's toxicology judgment; it is an open item.
  const gaps = categoryGaps.length > 0 ? [...categoryGaps] : ['nonclinical safety conclusion (sponsor toxicology judgment; not drawn automatically)'];
  if (ds === DRUG_SUBSTANCE_NAME_NOT_RECORDED) gaps.push(DRUG_SUBSTANCE_NAME_GAP);

  const narrative = [
    `MODULE 2.4 — NONCLINICAL OVERVIEW`,
    ``,
    `INTRODUCTION`,
    `This Nonclinical Overview integrates the pharmacology, pharmacokinetic, and toxicology data for ${ds}${ctx.indication ? ` developed for ${ctx.indication}` : ''}. ${studies.length} nonclinical study/ies are summarized; full reports are provided in Module 4.`,
    ``,
    heading('2.4.1'),
    // 2026-10-15: this used to open "The nonclinical program was designed in
    // accordance with ICH M3(R2) and supports the proposed clinical use" — beside
    // its own gap list — and close "All ICH M3(R2) recommended studies have been
    // completed" when five categories had one study each. Nothing here checks
    // the program against M3(R2) for a clinical phase and duration.
    `${categoryGaps.length === 0 ? `Studies are recorded in each category this overview checks: ${checked.map(([label]) => label).join('; ')}.` : `Gaps in the program: ${categoryGaps.join('; ')}.`} Whether the program meets ICH M3(R2) for the proposed clinical phase and duration is not assessed in this overview.`,
    ``,
    heading('2.4.2'),
    byType.pharmacology.length > 0
      ? `Primary pharmacology: ${byType.pharmacology.length} study/ies — ${recordedFindings(byType.pharmacology)}.`
      : `[No pharmacology studies provided — see gap list]`,
    byType.safetyPharm.length > 0
      ? `Safety pharmacology (ICH S7A): ${byType.safetyPharm.length} study/ies — ${recordedFindings(byType.safetyPharm)}.`
      : ``,
    ``,
    heading('2.4.3'),
    byType.pk.length > 0
      ? `Pharmacokinetic and ADME characterization: ${byType.pk.length} study/ies. Species: ${[...new Set(byType.pk.map(s => s.species).filter(Boolean))].join(', ') || '[not specified]'}.`
      : `[PK / ADME data missing]`,
    ``,
    heading('2.4.4'),
    byType.tox.length > 0
      ? `Repeat-dose toxicology: ${byType.tox.length} study/ies in ${[...new Set(byType.tox.map(s => s.species).filter(Boolean))].join(', ') || '[species not specified]'}. NOAEL range: ${nooalSummary(byType.tox)}.`
      : `[Repeat-dose toxicology missing — required per ICH M3(R2)]`,
    byType.repro.length > 0
      ? `Reproductive toxicology per ICH S5(R3): ${byType.repro.length} study/ies.`
      : ``,
    byType.geno.length > 0
      ? `Genotoxicity (ICH S2(R1)): ${byType.geno.length} assay(s) — ${recordedFindings(byType.geno)}. Whether they make up the ICH S2(R1) standard battery is not assessed in this overview.`
      : ``,
    byType.carcino.length > 0
      ? `Carcinogenicity per ICH S1: ${byType.carcino.length} study/ies.`
      : ``,
    // 2026-10-26 (C4c): the adapter used to append this after the whole overview as "2.4.4.1", a code the record does not hold.
    ctx.targetOrganProfile ? `Target-organ adversity profile: ${ctx.targetOrganProfile}` : ``,
    ``,
    heading('2.4.5'),
    // The "supports the plan" sentence used to print whenever any nonclinical
    // study existed, immediately followed by the list of study categories that
    // did not — the assertion and the gap list contradicted each other in one
    // paragraph. It is not drawn automatically at all (see the gaps above).
    categoryGaps.length > 0
      ? `The nonclinical assessment of ${ds} is incomplete; no conclusion on the proposed clinical investigational plan is drawn pending: ${categoryGaps.join('; ')}.`
      : `Studies are recorded in every category this overview checks. Whether the nonclinical safety profile of ${ds} supports the proposed clinical investigational plan — the findings and NOAELs above weighed against the proposed clinical dose and exposure — is the sponsor's toxicology judgment and is not drawn automatically.`,
    ``,
    heading('2.4.6'),
    literatureReferences('this overview', 'Module 4.3'),
  ].filter(Boolean).join('\n');

  const tables: GeneratedTable[] = [];
  if (studies.length > 0) {
    tables.push({
      title: 'Nonclinical Study Index',
      headers: ['Study ID', 'Type', 'Species', 'GLP', 'NOAEL', 'Module 4 Section'],
      rows: studies.map(s => [
        s.studyId,
        s.studyType.replace('_', ' '),
        s.species || '—',
        s.glpStatus || '—',
        s.noael || s.noel || '—',
        s.reportSection,
      ]),
    });
  }
  if (byType.tox.length > 0) {
    tables.push({
      title: 'Repeat-Dose Toxicology Summary',
      headers: ['Study', 'Species', 'Duration', 'Dose Levels', 'NOAEL', 'Key Finding'],
      rows: byType.tox.map(s => [
        s.studyId,
        s.species || '—',
        s.duration || '—',
        (s.doseLevels || []).join(', ') || '—',
        s.noael || '—',
        s.primaryFinding,
      ]),
    });
  }

  const completeness = Math.round(((checked.length - categoryGaps.length) / checked.length) * 100);

  return {
    sectionKey: '2.4',
    title: 'Nonclinical Overview',
    narrative,
    tables,
    inputSectionKeys: studies.map(s => s.reportSection),
    completeness,
    gaps,
    generatedAt: new Date().toISOString(),
  };
}

// ── 2.5 Clinical Overview ───────────────────────────────────────────────────


/**
 * SAE and death totals across the study reports, distinguishing "extracted
 * and zero" from "never extracted". `saeCount`/`deathCount` are optional on
 * CSRSummaryInput and the canonical project reader does not populate them, so
 * `c.saeCount || 0` folded every unextracted study into "0 serious adverse
 * event(s) reported" — the sentence a reviewer reads as "none occurred".
 */
function safetyCounts(csrs: CSRSummaryInput[]): {
  totalSAEs: number;
  totalDeaths: number;
  unextracted: number;
  /** The sentence the summaries print for the safety database. */
  statement: string;
  /** The open item to record when any study's counts were never extracted. */
  gap: string | null;
} {
  const unextracted = csrs.filter((c) => typeof c.saeCount !== 'number' || typeof c.deathCount !== 'number').length;
  const totalSAEs = csrs.reduce((sum, c) => sum + (typeof c.saeCount === 'number' ? c.saeCount : 0), 0);
  const totalDeaths = csrs.reduce((sum, c) => sum + (typeof c.deathCount === 'number' ? c.deathCount : 0), 0);
  if (csrs.length > 0 && unextracted > 0) {
    return {
      totalSAEs, totalDeaths, unextracted,
      statement: `SAE and death counts have not been extracted for ${unextracted} of ${csrs.length} study/ies; no integrated SAE or death count is stated until they are.`,
      gap: `SAE and death counts not extracted for ${unextracted} of ${csrs.length} study/ies`,
    };
  }
  return {
    totalSAEs, totalDeaths, unextracted,
    statement: `${totalSAEs} serious adverse event(s) and ${totalDeaths} death(s) reported.`,
    gap: null,
  };
}

/** "n=…" for a study: the recorded size, or an explicit statement that none was recorded. */
function sampleSizeText(c: Pick<CSRSummaryInput, 'sampleSize' | 'plannedSampleSize'>): string {
  if (typeof c.sampleSize === 'number') return String(c.sampleSize);
  return typeof c.plannedSampleSize === 'number'
    ? `[enrolled not recorded; planned ${c.plannedSampleSize}]`
    : '[sample size not recorded]';
}

/** Analysis population cell: ITT if recorded, else enrolled, else said to be missing. */
function populationText(c: Pick<CSRSummaryInput, 'sampleSize' | 'ittPopulation'>): string {
  const n = c.ittPopulation ?? c.sampleSize;
  return typeof n === 'number' ? String(n) : '[not recorded]';
}

/** Studies whose exposure cannot be counted because no size was recorded. */
function unsizedStudies(csrs: ReadonlyArray<Pick<CSRSummaryInput, 'sampleSize' | 'ittPopulation'>>): number {
  return csrs.filter(c => typeof (c.ittPopulation ?? c.sampleSize) !== 'number').length;
}

/** Recorded free text without its own final period, for a sentence that adds one. */
function unterminated(text: string): string {
  return text.replace(/\.\s*$/, '');
}

/** A study as its record states it: protocol, design, primary endpoint and recorded result. */
function studyRecordText(c: CSRSummaryInput): string {
  return `${c.protocolNumber} (${c.studyDesign}): ${c.primaryEndpoint} — ${unterminated(c.primaryResult)}`;
}

/** The recorded primary-endpoint outcome in words; never read from `primaryResult`. */
function endpointOutcomeText(c: CSRSummaryInput): string {
  if (c.primaryEndpointMet === true) return 'met';
  return c.primaryEndpointMet === false ? 'not met' : 'not recorded';
}

interface EndpointOutcomes { met: number; notMet: number; unrecorded: number }

function pivotalOutcomes(pivotal: CSRSummaryInput[]): EndpointOutcomes {
  const met = pivotal.filter(c => c.primaryEndpointMet === true).length;
  const notMet = pivotal.filter(c => c.primaryEndpointMet === false).length;
  return { met, notMet, unrecorded: pivotal.length - met - notMet };
}

/**
 * The efficacy statement over the pivotal studies. 2026-10-15: this used to be
 * "Efficacy was demonstrated in N pivotal study/ies" whenever a Phase 3 CSR
 * existed, whatever its primary result said; it now needs a recorded "met".
 */
function efficacyHeadline(o: EndpointOutcomes, pivotalCount: number): string {
  const tally = [
    o.met > 0 ? `met in ${o.met}` : '',
    o.notMet > 0 ? `not met in ${o.notMet}` : '',
    o.unrecorded > 0 ? `not recorded for ${o.unrecorded}` : '',
  ].filter(Boolean).join(', ');
  return o.met > 0
    ? `Efficacy was demonstrated in ${o.met} of ${pivotalCount} pivotal (Phase 3) study/ies (primary endpoint outcome: ${tally}):`
    : `Efficacy is not established from the record: no pivotal (Phase 3) study is recorded as meeting its primary endpoint (primary endpoint outcome: ${tally}):`;
}

/** Every study's size and SAE/death counts are recorded, so the safety data are complete. */
function safetyDataRecorded(csrs: CSRSummaryInput[], totalSubjects: number, safetyGap: string | null): boolean {
  return totalSubjects > 0 && unsizedStudies(csrs) === 0 && safetyGap === null;
}

/** 2.5.6: the recorded efficacy and safety data stated; the conclusion is left to the sponsor. */
function benefitRiskStatement(s: { indication: string; studies: number; pivotal: number; outcomes: EndpointOutcomes; totalSubjects: number; safetyStatement: string }): string {
  if (s.studies === 0) return '[Benefit-risk cannot be concluded — no clinical data]';
  if (s.outcomes.met > 0) {
    return `Efficacy evidence: the primary endpoint is recorded as met in ${s.outcomes.met} of ${s.pivotal} pivotal study/ies. Safety database: ${s.totalSubjects} subjects. ${s.safetyStatement} [Benefit-risk conclusion for ${s.indication} requires the sponsor's medical and regulatory judgment of these data; it is not drawn automatically.]`;
  }
  return s.pivotal > 0
    ? `Efficacy is not established from the record (no pivotal study is recorded as meeting its primary endpoint); the benefit-risk balance cannot be concluded for ${s.indication}.`
    : `Efficacy is not yet established (no pivotal study); the benefit-risk balance cannot be concluded for ${s.indication} until controlled efficacy data are available.`;
}

/** Incidence threshold of the 2.7.4.2 common-adverse-event table, in percent. */
const COMMON_AE_THRESHOLD_PCT = 5;

/**
 * A recorded AE rate as a percentage — "12%", "12.5 %", "24 (12.0%)" or
 * "24/200 (12%)" — or null for anything else (a bare number, a proportion, two
 * figures, a range): which figure is the incidence would be a guess.
 */
function ratePercent(rate: string): number | null {
  const m = /^\s*(?:\d+\s*(?:\/\s*\d+\s*)?\(\s*(\d+(?:\.\d+)?)\s*%\s*\)|(\d+(?:\.\d+)?)\s*%)\s*$/.exec(rate);
  if (!m) return null;
  const pct = Number(m[1] ?? m[2]);
  return pct <= 100 ? pct : null;
}

/** A study as the summaries name it: its protocol number, else its study id. */
function studyName(c: CSRSummaryInput): string {
  return c.protocolNumber || c.studyId;
}

/**
 * Every recorded AE rate read against the threshold: the terms at or above it
 * (by number of studies, then term), the rates that are not one readable
 * percentage, and how many rates were read.
 */
function tallyAeRates(withRates: CSRSummaryInput[]): { rows: string[][]; unread: string[]; read: number } {
  const byTerm = new Map<string, { studies: Set<string>; rates: string[] }>();
  const unread: string[] = [];
  let read = 0;
  for (const c of withRates) {
    for (const ae of c.topAEs ?? []) {
      const pct = ratePercent(ae.rate);
      if (pct === null) {
        unread.push(`${ae.pt} (${studyName(c)}: "${ae.rate}")`);
        continue;
      }
      read += 1;
      if (pct < COMMON_AE_THRESHOLD_PCT) continue;
      const term = byTerm.get(ae.pt) ?? { studies: new Set<string>(), rates: [] };
      term.studies.add(studyName(c));
      term.rates.push(`${studyName(c)}: ${ae.rate}`);
      byTerm.set(ae.pt, term);
    }
  }
  const rows = [...byTerm.entries()]
    .sort((a, b) => b[1].studies.size - a[1].studies.size || a[0].localeCompare(b[0]))
    .map(([pt, t]) => [pt, String(t.studies.size), t.rates.join('; ')]);
  return { rows, unread, read };
}

/** The 2.7.4.2 sentence: what was tabulated, from which studies, and what was left out. */
function commonAeStatement(s: { total: number; integrated: string[]; missing: string[]; unread: string[]; tabulated: number; read: number }): string {
  const T = COMMON_AE_THRESHOLD_PCT;
  if (s.integrated.length === 0) {
    return `[AE data not yet integrated — no adverse-event rates are recorded for ${s.total === 0 ? 'any study' : `any of the ${s.total} study/ies`}.]`;
  }
  const from = `the ${s.integrated.length} study/ies whose adverse-event rates are recorded (${s.integrated.join(', ')})`;
  const headline = s.tabulated > 0
    ? `Adverse events with a recorded incidence of ≥${T}% are tabulated below, from ${from}.`
    : s.read > 0
      ? `No adverse-event rate read as a percentage reaches ${T}% in ${from}.`
      : `No adverse-event rate recorded in ${from} could be read as a single percentage, so none was compared with the ${T}% threshold.`;
  const left = s.missing.length > 0
    ? ` No adverse-event rates are recorded for ${s.missing.join(', ')}; ${s.missing.length === 1 ? 'it is' : 'they are'} not included.`
    : '';
  const unreadable = s.unread.length > 0
    ? ` ${s.unread.length} recorded rate(s) could not be read as a single percentage and were not compared with the ${T}% threshold: ${s.unread.join('; ')}.`
    : '';
  return headline + left + unreadable;
}

/**
 * 2.7.4.2 common adverse events: the ≥5% filter applied to the rates of every
 * study that records any, naming the studies integrated, the studies with no
 * recorded rates, and every rate that could not be read as a percentage.
 * 2026-10-15: this used to announce "(≥5% incidence) across the integrated
 * safety database" on the strength of csrs[0] alone, and tabulate every rate
 * unfiltered.
 */
function commonAdverseEvents(csrs: CSRSummaryInput[]): { integrated: string[]; rows: string[][]; gaps: string[]; complete: boolean; statement: string } {
  const withRates = csrs.filter(c => (c.topAEs?.length ?? 0) > 0);
  const integrated = withRates.map(studyName);
  const missing = csrs.filter(c => (c.topAEs?.length ?? 0) === 0).map(studyName);
  const { rows, unread, read } = tallyAeRates(withRates);
  const gaps = [
    ...(csrs.length > 0 && missing.length > 0 ? [`adverse-event rates not recorded for ${missing.length} of ${csrs.length} study/ies`] : []),
    ...(unread.length > 0 ? [`${unread.length} adverse-event rate(s) not readable as a single percentage`] : []),
  ];
  return {
    integrated,
    rows,
    gaps,
    complete: csrs.length > 0 && missing.length === 0 && unread.length === 0,
    statement: commonAeStatement({ total: csrs.length, integrated, missing, unread, tabulated: rows.length, read }),
  };
}

/** The headings the 2.5 composer writes; the record's others below 2.5 are open items. */
const COMPOSED_25 = ['2.5.1', '2.5.2', '2.5.3', '2.5.4', '2.5.5', '2.5.6', '2.5.7'] as const;

/**
 * Build M2.5 Clinical Overview from CSR data.
 * Per ICH M4E(R2), this is the *critical assessment* of the clinical data —
 * shorter and more integrative than the 2.7 Clinical Summary — culminating in
 * an explicit benefit-risk conclusion. It writes 2.5.1–2.5.7 as the record
 * heads them; the 2.5.6 benefit-risk subdivisions are not composed, and say so.
 */
/* What each study is, by the first phase its recorded text names
   (shared/clinical-phase.ts). These read c.phase as a bare digit with
   startsWith('3'), so a study recorded as "Phase 3" or "III" was never pivotal
   and "Phase 1" was never clinical pharmacology (CSR path review, 2026-10-29).
   "2/3" reads as it always did here, Phase 2 first: whether a Phase 2/3 study
   counts as pivotal is a product decision, not a parser's. */
const firstPhase = (c: CSRSummaryInput) => phaseNumbers(c.phase)[0] ?? null;
const isPhase1 = (c: CSRSummaryInput) => firstPhase(c) === 1;
const isPhase3 = (c: CSRSummaryInput) => firstPhase(c) === 3;
const isPhase2Or3 = (c: CSRSummaryInput) => firstPhase(c) === 2 || firstPhase(c) === 3;

export function buildM25ClinicalOverview(ctx: M25BuildContext): M2Summary {
  const csrs = ctx.csrs;
  const pivotal = csrs.filter(isPhase3);
  const clinPharm = csrs.filter(isPhase1);
  const controlled = csrs.filter(isPhase2Or3);
  const totalSubjects = csrs.reduce((s, c) => s + (c.ittPopulation || c.sampleSize || 0), 0);
  const safety = safetyCounts(csrs);
  const outcomes = pivotalOutcomes(pivotal);

  const gaps: string[] = [];
  if (csrs.length === 0) gaps.push('no clinical studies available');
  const unsized = unsizedStudies(csrs);
  if (unsized > 0) gaps.push(`sample size not recorded for ${unsized} study/ies — the exposure total excludes them`);
  gaps.push('biopharmaceutics (2.5.2): no biopharmaceutic data recorded');
  if (clinPharm.length === 0) gaps.push('clinical pharmacology (Phase 1) characterization');
  if (pivotal.length === 0) gaps.push('pivotal (Phase 3) efficacy evidence');
  if (outcomes.unrecorded > 0) gaps.push(`primary endpoint outcome not recorded for ${outcomes.unrecorded} of ${pivotal.length} pivotal study/ies`);
  if (totalSubjects === 0) gaps.push('safety database (no exposure data)');
  if (safety.gap) gaps.push(safety.gap);

  // 2026-10-15: this was `pivotal.length > 0` — a Phase 3 CSR existing, whatever
  // its primary result said. It is now a recorded "met" primary endpoint.
  const efficacyShown = outcomes.met > 0;
  // The benefit-risk conclusion is the sponsor's medical and regulatory
  // judgment. This used to print "the benefit-risk balance is favorable"
  // whenever one pivotal study existed, reciting the SAE and death counts in
  // the same sentence without either gating the word. The counts are stated;
  // the conclusion is left for a reviewer and recorded as an open item.
  if (efficacyShown) gaps.push('benefit-risk conclusion (sponsor medical/regulatory judgment; not drawn automatically)');
  gaps.push(...notComposedGap('2.5', COMPOSED_25));
  const benefitRisk = benefitRiskStatement({ indication: ctx.indication, studies: csrs.length, pivotal: pivotal.length, outcomes, totalSubjects, safetyStatement: safety.statement });

  const narrative = [
    `MODULE 2.5 — CLINICAL OVERVIEW`,
    ``,
    `This Clinical Overview provides a critical assessment of the clinical data for ${ctx.investigationalProduct} in ${ctx.indication}, per ICH M4E(R2). It is intended to be read alongside the Clinical Summary (Module 2.7) and the full study reports in Module 5.`,
    ``,
    heading('2.5.1'),
    ctx.developmentRationale ||
      `[Disease background, current therapeutic options, unmet medical need, and the scientific rationale for ${ctx.investigationalProduct} — to be provided.]`,
    ctx.nonclinicalConclusion ? `Nonclinical basis: ${ctx.nonclinicalConclusion}` : ``,
    ``,
    heading('2.5.2'),
    // 2026-10-15: this said the data "support the proposed dosage form and raise
    // no issue affecting the benefit-risk assessment"; no biopharmaceutic input exists.
    `[No biopharmaceutic data (bioavailability, bioequivalence, dissolution) are recorded for this overview — 2.5.2 to be provided.]`,
    ``,
    heading('2.5.3'),
    // 2026-10-15: any Phase 1 CSR used to "characterize pharmacokinetics,
    // pharmacodynamics, and exposure-response, supporting the dose rationale".
    clinPharm.length > 0
      ? `Clinical pharmacology: ${clinPharm.length} Phase 1 study/ies recorded — ${clinPharm.map(studyRecordText).join('; ')}. The dose rationale is not concluded from these records.`
      : `[Clinical pharmacology characterization missing — required to justify the dose per ICH M4E.]`,
    ``,
    heading('2.5.4'),
    pivotal.length > 0
      ? efficacyHeadline(outcomes, pivotal.length)
      : `[No pivotal efficacy study available — efficacy is not yet established.]`,
    ...pivotal.map(
      c => `  • ${c.protocolNumber} (${phaseLabel(c.phase)}, n=${sampleSizeText(c)}): ${c.primaryEndpoint} — ${unterminated(c.primaryResult)}. Primary endpoint outcome: ${endpointOutcomeText(c)}.`,
    ),
    ``,
    heading('2.5.5'),
    // 2026-10-15: this said "exposed to <product>" of ITT/enrolled counts summed over every arm, comparators included.
    csrs.length > 0
      ? `The safety database comprises ${totalSubjects} subjects enrolled across ${csrs.length} study/ies (ITT population where recorded, otherwise enrolled; all treatment arms). ${safety.statement} The detailed safety analysis is in Module 2.7.4.`
      : `[No safety database — clinical exposure data missing.]`,
    ``,
    heading('2.5.6'),
    benefitRisk,
    gaps.length > 0
      ? `Open items before a definitive benefit-risk conclusion: ${gaps.join('; ')}.`
      : `No open items preclude the benefit-risk conclusion.`,
    ``,
    heading('2.5.7'),
    literatureReferences('this overview', 'Module 5.4'),
  ]
    .filter(Boolean)
    .join('\n');

  const tables: GeneratedTable[] = [];
  if (controlled.length > 0) {
    tables.push({
      // 2026-10-15: was "Pivotal and Controlled"; the rows are Phase 2–3 by phase alone, and neither is recorded.
      title: 'Phase 2–3 Efficacy Studies',
      headers: ['Study', 'Phase', 'Design', 'N', 'Primary Endpoint', 'Result'],
      rows: controlled.map(c => [
        c.protocolNumber,
        c.phase,
        c.studyDesign,
        populationText(c),
        c.primaryEndpoint,
        c.primaryResult,
      ]),
    });
  }
  if (csrs.length > 0) {
    tables.push({
      title: 'Benefit-Risk Safety Overview',
      headers: ['Metric', 'Value'],
      rows: [
        ['Total subjects exposed', String(totalSubjects)],
        ['Studies', String(csrs.length)],
        ['Serious adverse events', String(safety.totalSAEs)],
        ['Deaths', String(safety.totalDeaths)],
      ],
    });
  }

  // 2026-10-15: 2.5.2 used to count as "always summarized" (no biopharmaceutic
  // input exists) and 2.5.4 as present whenever a Phase 3 CSR existed. Each
  // subsection now counts only when the records it is written from are present.
  // 2026-10-26 (3b Slice 1): 2.5.1 counted whenever the caller passed a
  // rationale, which AnA writes, so a model could raise the figure with prose.
  // It is printed, but no record backs it, so it does not count.
  const efficacyRecorded = pivotal.length > 0 && outcomes.unrecorded === 0;
  const safetyRecorded = safetyDataRecorded(csrs, totalSubjects, safety.gap);
  const subsections = [
    false, // 2.5.1 — the rationale is caller text, not a record
    false, // 2.5.2 — no biopharmaceutic input exists
    clinPharm.length > 0, // 2.5.3
    efficacyRecorded, // 2.5.4 — every pivotal outcome recorded
    safetyRecorded, // 2.5.5 — sizes and SAE/death counts recorded
    efficacyRecorded && safetyRecorded, // 2.5.6 — the data it weighs; the conclusion itself stays open
  ];
  const completeness = Math.round((subsections.filter(Boolean).length / subsections.length) * 100);

  return {
    sectionKey: '2.5',
    title: 'Clinical Overview',
    narrative,
    tables,
    inputSectionKeys: csrs.map(c => `m5.3.5/${c.studyId}`),
    completeness,
    gaps,
    generatedAt: new Date().toISOString(),
  };
}

// ── 2.7 Clinical Summary ────────────────────────────────────────────────────

/**
 * Build M2.7 Clinical Summary from CSR data.
 * Per ICH M4E, this is a 50–400 page integrated summary of efficacy and safety.
 * Every heading the record holds directly below 2.7 is written; 2.7.1–2.7.4 are
 * composed from the CSR records, and of 2.7.4's subdivisions, those the records
 * reach (exposure; common adverse events, deaths, other serious adverse events).
 * The record's other headings below 2.7 are named as open items (COMPOSED_27).
 */
const NOT_AMONG_INPUTS = 'Their narratives and causality assessments are not among the recorded inputs to this summary.';

/** The headings the 2.7 composer writes; the record's others below 2.7 are open items. */
const COMPOSED_27 = ['2.7.1', '2.7.2', '2.7.3', '2.7.4', '2.7.4.1', '2.7.4.2', '2.7.4.2.1', '2.7.4.2.1.1', '2.7.4.2.1.2', '2.7.4.2.1.3', '2.7.5', '2.7.6'] as const;

export function buildM27ClinicalSummary(ctx: M27BuildContext): M2Summary {
  const csrs = ctx.csrs;
  const phaseCounts = csrs.reduce<Record<string, number>>((acc, c) => {
    acc[c.phase] = (acc[c.phase] || 0) + 1;
    return acc;
  }, {});
  const totalSubjects = csrs.reduce((sum, c) => sum + (c.ittPopulation || c.sampleSize || 0), 0);
  const safety = safetyCounts(csrs);
  const controlledCount = csrs.filter(isPhase2Or3).length;
  const phase1 = csrs.filter(isPhase1);
  const pivotal = csrs.filter(isPhase3);
  const outcomes = pivotalOutcomes(pivotal);
  const ae = commonAdverseEvents(csrs);

  const gaps: string[] = [];
  if (csrs.length === 0) gaps.push('no CSRs available');
  const unsized27 = unsizedStudies(csrs);
  if (unsized27 > 0) gaps.push(`sample size not recorded for ${unsized27} study/ies — the exposure total excludes them`);
  gaps.push('biopharmaceutic studies (2.7.1): no biopharmaceutic data recorded');
  if (phase1.length === 0) gaps.push('no Phase 1 (clinical pharmacology) studies');
  if (pivotal.length === 0) gaps.push('no Phase 3 (pivotal efficacy) studies');
  if (outcomes.unrecorded > 0) gaps.push(`primary endpoint outcome not recorded for ${outcomes.unrecorded} of ${pivotal.length} pivotal study/ies`);
  if (safety.gap) gaps.push(safety.gap);
  gaps.push(...ae.gaps);
  gaps.push('Listing of Clinical Studies and synopsis links (2.7.6): not composed');
  gaps.push(...notComposedGap('2.7', COMPOSED_27));

  const narrative = [
    `MODULE 2.7 — CLINICAL SUMMARY`,
    ``,
    `INTRODUCTION`,
    `This Clinical Summary integrates efficacy and safety data for ${ctx.investigationalProduct} in ${ctx.indication}. ${csrs.length} clinical study/ies enrolling ${totalSubjects} subjects are summarized. Full study reports are provided in Module 5.3.`,
    ``,
    heading('2.7.1'),
    // 2026-10-15: this said "Key findings have been integrated into the proposed
    // dosage form rationale"; no biopharmaceutic input exists.
    `[No biopharmaceutic study data (bioavailability, bioequivalence, dissolution) are recorded for this summary — 2.7.1 to be provided from the Module 5.3.1 reports.]`,
    ``,
    heading('2.7.2'),
    // 2026-10-15: any Phase 1 CSR used to "address pharmacokinetics,
    // pharmacodynamics, and exposure-response relationships in healthy
    // volunteers and the target population". It now states what is recorded.
    phase1.length > 0
      ? `Clinical pharmacology: ${phase1.length} Phase 1 study/ies recorded — ${phase1.map(studyRecordText).join('; ')}.`
      : `[Phase 1 clinical pharmacology data missing — required for NDA/BLA per ICH M4E]`,
    ``,
    heading('2.7.3'),
    controlledCount > 0
      ? `${controlledCount} Phase 2–3 study/ies are recorded. ${pivotal.length > 0 ? efficacyHeadline(outcomes, pivotal.length) : 'No pivotal (Phase 3) study is recorded.'}`
      : `[No controlled efficacy study available — efficacy has not been evaluated]`,
    ...pivotal.map(c =>
      `  • ${c.protocolNumber} (${phaseLabel(c.phase)}): ${c.studyDesign}, n=${sampleSizeText(c)}. Primary endpoint (${c.primaryEndpoint}): ${unterminated(c.primaryResult)}. Primary endpoint outcome: ${endpointOutcomeText(c)}.`
    ),
    ``,
    `Phase distribution: ${Object.entries(phaseCounts).map(([p, n]) => `${phaseLabel(p)}: ${n}`).join(', ')}.`,
    ``,
    heading('2.7.4'),
    `Safety database: ${totalSubjects} subjects enrolled across ${csrs.length} study/ies (ITT population where recorded, otherwise enrolled; all treatment arms). ${safety.statement}`,
    ``,
    heading('2.7.4.1'),
    // 2026-10-15: this said every enrolled subject "received" the product (the
    // total counts comparator arms) and that an exposure-response analysis is
    // in Module 5.3.5, which no input records.
    `The number of subjects dosed with ${ctx.investigationalProduct} and the duration of exposure are not recorded for this summary; the enrolment total above counts every treatment arm.`,
    ``,
    heading('2.7.4.2'),
    heading('2.7.4.2.1'),
    heading('2.7.4.2.1.1'),
    ae.statement,
    ``,
    // 2026-10-26: the SAE and death counts sat under "2.7.4.3 Serious Adverse
    // Events and Deaths"; the record's 2.7.4.3 is Clinical Laboratory
    // Evaluations, and M4E puts deaths and other SAEs under 2.7.4.2.1.
    // 2026-10-15: narratives in Module 5.3.5 and a causality discussion in 2.5
    // used to be cited here; neither is among this summary's inputs, and 2.5 has none.
    heading('2.7.4.2.1.2'),
    safety.gap
      ? safety.statement
      : `${safety.totalDeaths} death(s) reported.${safety.totalDeaths > 0 ? ` ${NOT_AMONG_INPUTS}` : ''}`,
    ``,
    heading('2.7.4.2.1.3'),
    safety.gap
      ? safety.statement
      // Whether a study's SAE count includes its fatal events is not recorded.
      : `${safety.totalSAEs} serious adverse event(s) reported${safety.totalDeaths > 0 ? '; whether this count includes the deaths above is not recorded' : ''}.${safety.totalSAEs > 0 ? ` ${NOT_AMONG_INPUTS}` : ''}`,
    ``,
    heading('2.7.5'),
    // 2026-10-26 (C4c): this said "See Module 5.4 for the integrated reference list"; 2.7.5 is the list, and 5.4 holds the copies.
    literatureReferences('2.7.1–2.7.4', 'Module 5.4'),
    ``,
    heading('2.7.6'),
    `[Not composed: the Listing of Clinical Studies, one row per study with its Module 5 location, each linked to the synopsis in its study report. For a US eCTD the synopses are not repeated in Module 2.]`,
    // The open items used to live only on the sibling `gaps` field, which a
    // consumer of the narrative alone (the authoring tool) never renders.
    ...(gaps.length > 0 ? [``, `Open items: ${gaps.join('; ')}.`] : []),
  ].join('\n');

  const tables: GeneratedTable[] = [{
    title: 'Clinical Study Index',
    headers: ['Study ID', 'Phase', 'Design', 'N (ITT)', 'Primary Endpoint', 'Primary Result'],
    rows: csrs.map(c => [
      c.protocolNumber,
      c.phase,
      c.studyDesign,
      populationText(c),
      c.primaryEndpoint,
      c.primaryResult,
    ]),
  }];

  // Common AEs: the stated ≥5% filter over the studies named in the title (no silent top-20 cut).
  if (ae.rows.length > 0) {
    tables.push({
      title: `Adverse Events with Recorded Incidence ≥${COMMON_AE_THRESHOLD_PCT}% (${ae.integrated.join(', ')})`,
      headers: ['Preferred Term', `Studies with Incidence ≥${COMMON_AE_THRESHOLD_PCT}%`, 'Per-Study Rates'],
      rows: ae.rows,
    });
  }

  if (safety.totalSAEs > 0 || safety.totalDeaths > 0 || safety.unextracted > 0) {
    tables.push({
      title: 'Serious Adverse Events and Deaths Summary',
      headers: ['Study', 'N (ITT)', 'SAEs', 'Deaths'],
      rows: csrs.map(c => [
        c.protocolNumber,
        populationText(c),
        typeof c.saeCount === 'number' ? String(c.saeCount) : 'not extracted',
        typeof c.deathCount === 'number' ? String(c.deathCount) : 'not extracted',
      ]),
    });
  }

  // 2026-10-15: `csrs.length > 0` used to count twice — once as 2.7.1
  // biopharmaceutics, for which no input exists. Each subsection now counts
  // once, when the records it is written from are present.
  const subsections = [
    false, // 2.7.1 — no biopharmaceutic input exists
    phase1.length > 0, // 2.7.2
    controlledCount > 0 && outcomes.unrecorded === 0, // 2.7.3 — every pivotal outcome recorded
    safetyDataRecorded(csrs, totalSubjects, safety.gap) && ae.complete, // 2.7.4 — sizes, SAE/deaths and AE rates
  ];
  const completeness = Math.round((subsections.filter(Boolean).length / subsections.length) * 100);

  return {
    sectionKey: '2.7',
    title: 'Clinical Summary',
    narrative,
    tables,
    inputSectionKeys: csrs.map(c => `m5.3.5/${c.studyId}`),
    completeness,
    gaps,
    generatedAt: new Date().toISOString(),
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function excerpt(text: string, maxChars: number): string {
  if (!text) return '';
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars).trim() + '…';
}

/** Each study's recorded primary finding, by study id. */
function recordedFindings(studies: NonclinicalStudy[]): string {
  return studies.map(s => `${s.studyId}: ${s.primaryFinding || 'finding not recorded'}`).join('; ');
}

function nooalSummary(toxStudies: NonclinicalStudy[]): string {
  const noaels = toxStudies.map(s => s.noael).filter(Boolean);
  if (noaels.length === 0) return '[NOAELs not provided]';
  return noaels.join(', ');
}
