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
 */

import type { ComposedSection, GeneratedTable } from './module3Composer.js';
import type { CSRSection } from './csr-builder.js';

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
 * 2.3.P.1–P.8 — with the heading, the excerpt length (null: printed in full, so
 * a stability qualification is never cut) and the text for a section not composed.
 */
const QOS_SECTIONS: ReadonlyArray<{ key: string; heading: string; chars: number | null; absent: string }> = [
  { key: '3.2.S.1', heading: '2.3.S.1 General Information', chars: 400, absent: '[Section 3.2.S.1 not yet composed — drug substance general information missing]' },
  { key: '3.2.S.2', heading: '2.3.S.2 Manufacture', chars: 600, absent: '[Section 3.2.S.2 not yet composed — manufacturing process information missing]' },
  { key: '3.2.S.3', heading: '2.3.S.3 Characterisation', chars: 500, absent: '[Section 3.2.S.3 not yet composed — characterisation data missing]' },
  { key: '3.2.S.4', heading: '2.3.S.4 Control of Drug Substance', chars: 500, absent: '[Section 3.2.S.4 not yet composed — specification missing]' },
  { key: '3.2.S.5', heading: '2.3.S.5 Reference Standards or Materials', chars: 400, absent: '[Section 3.2.S.5 not yet composed]' },
  { key: '3.2.S.6', heading: '2.3.S.6 Container Closure System', chars: 400, absent: '[Section 3.2.S.6 not yet composed]' },
  { key: '3.2.S.7', heading: '2.3.S.7 Stability', chars: null, absent: '[Section 3.2.S.7 not yet composed — stability data missing]' },
  { key: '3.2.P.1', heading: '2.3.P.1 Description and Composition', chars: 400, absent: '[Section 3.2.P.1 not yet composed]' },
  { key: '3.2.P.2', heading: '2.3.P.2 Pharmaceutical Development', chars: 600, absent: '[Section 3.2.P.2 not yet composed]' },
  { key: '3.2.P.3', heading: '2.3.P.3 Manufacture', chars: 500, absent: '[Section 3.2.P.3 not yet composed]' },
  { key: '3.2.P.4', heading: '2.3.P.4 Control of Excipients', chars: 400, absent: '[Section 3.2.P.4 not yet composed]' },
  { key: '3.2.P.5', heading: '2.3.P.5 Control of Drug Product', chars: 500, absent: '[Section 3.2.P.5 not yet composed]' },
  { key: '3.2.P.6', heading: '2.3.P.6 Reference Standards or Materials', chars: 400, absent: '[Section 3.2.P.6 not yet composed]' },
  { key: '3.2.P.7', heading: '2.3.P.7 Container Closure System', chars: 400, absent: '[Section 3.2.P.7 not yet composed]' },
  { key: '3.2.P.8', heading: '2.3.P.8 Stability', chars: null, absent: '[Section 3.2.P.8 not yet composed]' },
];

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
  const ds = ctx.drugSubstanceName || 'the drug substance';
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
  const gaps = rows.filter(r => r.open).map(r => `${r.key} — ${r.open}`);
  const inputSectionKeys = rows.filter(r => r.section && r.section.lineage.length > 0).map(r => r.key);
  const completeness = Math.round((rows.filter(r => !r.open).length / rows.length) * 100);

  const summarize = (part: string): string[] => rows.filter(r => r.key.startsWith(`3.2.${part}.`)).flatMap(r => [
    r.heading,
    !r.section ? r.absent : r.chars === null ? r.section.narrativeDraft : excerpt(r.section.narrativeDraft, r.chars),
    ...(r.section && r.open ? [`[Open in Module 3: ${r.open}.]`] : []),
    ``,
  ]);

  const narrative = [
    `MODULE 2.3 — QUALITY OVERALL SUMMARY`,
    ``,
    `INTRODUCTION`,
    `This Quality Overall Summary (QOS) provides a high-level summary of the chemistry, manufacturing, and controls (CMC) information for ${ds}${dp !== 'the drug product' ? ` and ${dp}` : ''}. ${gaps.length === 0 ? 'The full quality dossier is provided in Module 3.' : 'Module 3 is not yet complete; its open sections are marked below and listed under Open items.'}`,
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
  const ds = ctx.drugSubstanceName || 'the drug substance';

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

  const narrative = [
    `MODULE 2.4 — NONCLINICAL OVERVIEW`,
    ``,
    `INTRODUCTION`,
    `This Nonclinical Overview integrates the pharmacology, pharmacokinetic, and toxicology data for ${ds}${ctx.indication ? ` developed for ${ctx.indication}` : ''}. ${studies.length} nonclinical study/ies are summarized; full reports are provided in Module 4.`,
    ``,
    `2.4.1 OVERVIEW OF NONCLINICAL TESTING STRATEGY`,
    // 2026-10-15: this used to open "The nonclinical program was designed in
    // accordance with ICH M3(R2) and supports the proposed clinical use" — beside
    // its own gap list — and close "All ICH M3(R2) recommended studies have been
    // completed" when five categories had one study each. Nothing here checks
    // the program against M3(R2) for a clinical phase and duration.
    `${categoryGaps.length === 0 ? `Studies are recorded in each category this overview checks: ${checked.map(([label]) => label).join('; ')}.` : `Gaps in the program: ${categoryGaps.join('; ')}.`} Whether the program meets ICH M3(R2) for the proposed clinical phase and duration is not assessed in this overview.`,
    ``,
    `2.4.2 PHARMACOLOGY`,
    byType.pharmacology.length > 0
      ? `Primary pharmacology: ${byType.pharmacology.length} study/ies — ${recordedFindings(byType.pharmacology)}.`
      : `[No pharmacology studies provided — see gap list]`,
    byType.safetyPharm.length > 0
      ? `Safety pharmacology (ICH S7A): ${byType.safetyPharm.length} study/ies — ${recordedFindings(byType.safetyPharm)}.`
      : ``,
    ``,
    `2.4.3 PHARMACOKINETICS`,
    byType.pk.length > 0
      ? `Pharmacokinetic and ADME characterization: ${byType.pk.length} study/ies. Species: ${[...new Set(byType.pk.map(s => s.species).filter(Boolean))].join(', ') || '[not specified]'}.`
      : `[PK / ADME data missing]`,
    ``,
    `2.4.4 TOXICOLOGY`,
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
    ``,
    `2.4.5 INTEGRATED OVERVIEW AND CONCLUSIONS`,
    // The "supports the plan" sentence used to print whenever any nonclinical
    // study existed, immediately followed by the list of study categories that
    // did not — the assertion and the gap list contradicted each other in one
    // paragraph. It is not drawn automatically at all (see the gaps above).
    categoryGaps.length > 0
      ? `The nonclinical assessment of ${ds} is incomplete; no conclusion on the proposed clinical investigational plan is drawn pending: ${categoryGaps.join('; ')}.`
      : `Studies are recorded in every category this overview checks. Whether the nonclinical safety profile of ${ds} supports the proposed clinical investigational plan — the findings and NOAELs above weighed against the proposed clinical dose and exposure — is the sponsor's toxicology judgment and is not drawn automatically.`,
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

/**
 * Build M2.5 Clinical Overview from CSR data.
 * Per ICH M4E(R2), this is the *critical assessment* of the clinical data —
 * shorter and more integrative than the 2.7 Clinical Summary — culminating in
 * an explicit benefit-risk conclusion. The six subsections are:
 *   2.5.1 Product Development Rationale
 *   2.5.2 Overview of Biopharmaceutics
 *   2.5.3 Overview of Clinical Pharmacology
 *   2.5.4 Overview of Efficacy
 *   2.5.5 Overview of Safety
 *   2.5.6 Benefits and Risks Conclusions
 */
/** "n=…" for a study: the recorded size, or an explicit statement that none was recorded. */
function sampleSizeText(c: Pick<CSRSummaryInput, 'sampleSize'>): string {
  return typeof c.sampleSize === 'number' ? String(c.sampleSize) : '[sample size not recorded]';
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

export function buildM25ClinicalOverview(ctx: M25BuildContext): M2Summary {
  const csrs = ctx.csrs;
  const pivotal = csrs.filter(c => c.phase.startsWith('3'));
  const clinPharm = csrs.filter(c => c.phase.startsWith('1'));
  const controlled = csrs.filter(c => /^[2-3]/.test(c.phase));
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
  const benefitRisk = benefitRiskStatement({ indication: ctx.indication, studies: csrs.length, pivotal: pivotal.length, outcomes, totalSubjects, safetyStatement: safety.statement });

  const narrative = [
    `MODULE 2.5 — CLINICAL OVERVIEW`,
    ``,
    `This Clinical Overview provides a critical assessment of the clinical data for ${ctx.investigationalProduct} in ${ctx.indication}, per ICH M4E(R2). It is intended to be read alongside the Clinical Summary (Module 2.7) and the full study reports in Module 5.`,
    ``,
    `2.5.1 PRODUCT DEVELOPMENT RATIONALE`,
    ctx.developmentRationale ||
      `[Disease background, current therapeutic options, unmet medical need, and the scientific rationale for ${ctx.investigationalProduct} — to be provided.]`,
    ctx.nonclinicalConclusion ? `Nonclinical basis: ${ctx.nonclinicalConclusion}` : ``,
    ``,
    `2.5.2 OVERVIEW OF BIOPHARMACEUTICS`,
    // 2026-10-15: this said the data "support the proposed dosage form and raise
    // no issue affecting the benefit-risk assessment"; no biopharmaceutic input exists.
    `[No biopharmaceutic data (bioavailability, bioequivalence, dissolution) are recorded for this overview — 2.5.2 to be provided.]`,
    ``,
    `2.5.3 OVERVIEW OF CLINICAL PHARMACOLOGY`,
    // 2026-10-15: any Phase 1 CSR used to "characterize pharmacokinetics,
    // pharmacodynamics, and exposure-response, supporting the dose rationale".
    clinPharm.length > 0
      ? `Clinical pharmacology: ${clinPharm.length} Phase 1 study/ies recorded — ${clinPharm.map(studyRecordText).join('; ')}. The dose rationale is not concluded from these records.`
      : `[Clinical pharmacology characterization missing — required to justify the dose per ICH M4E.]`,
    ``,
    `2.5.4 OVERVIEW OF EFFICACY`,
    pivotal.length > 0
      ? efficacyHeadline(outcomes, pivotal.length)
      : `[No pivotal efficacy study available — efficacy is not yet established.]`,
    ...pivotal.map(
      c => `  • ${c.protocolNumber} (Phase ${c.phase}, n=${sampleSizeText(c)}): ${c.primaryEndpoint} — ${unterminated(c.primaryResult)}. Primary endpoint outcome: ${endpointOutcomeText(c)}.`,
    ),
    ``,
    `2.5.5 OVERVIEW OF SAFETY`,
    // 2026-10-15: this said "exposed to <product>" of ITT/enrolled counts summed over every arm, comparators included.
    csrs.length > 0
      ? `The safety database comprises ${totalSubjects} subjects enrolled across ${csrs.length} study/ies (ITT population where recorded, otherwise enrolled; all treatment arms). ${safety.statement} The detailed safety analysis is in Module 2.7.4.`
      : `[No safety database — clinical exposure data missing.]`,
    ``,
    `2.5.6 BENEFITS AND RISKS CONCLUSIONS`,
    benefitRisk,
    gaps.length > 0
      ? `Open items before a definitive benefit-risk conclusion: ${gaps.join('; ')}.`
      : `No open items preclude the benefit-risk conclusion.`,
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
  const efficacyRecorded = pivotal.length > 0 && outcomes.unrecorded === 0;
  const safetyRecorded = safetyDataRecorded(csrs, totalSubjects, safety.gap);
  const subsections = [
    Boolean(ctx.developmentRationale), // 2.5.1
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
 * We compose the four core subsections:
 *   2.7.1 Summary of Biopharmaceutic Studies & Methods
 *   2.7.2 Summary of Clinical Pharmacology
 *   2.7.3 Summary of Clinical Efficacy
 *   2.7.4 Summary of Clinical Safety
 */
export function buildM27ClinicalSummary(ctx: M27BuildContext): M2Summary {
  const csrs = ctx.csrs;
  const phaseCounts = csrs.reduce<Record<string, number>>((acc, c) => {
    acc[c.phase] = (acc[c.phase] || 0) + 1;
    return acc;
  }, {});
  const totalSubjects = csrs.reduce((sum, c) => sum + (c.ittPopulation || c.sampleSize || 0), 0);
  const safety = safetyCounts(csrs);
  const controlledCount = csrs.filter(c => c.phase.match(/^[2-3]/)).length;
  const phase1 = csrs.filter(c => c.phase.startsWith('1'));
  const pivotal = csrs.filter(c => c.phase.startsWith('3'));
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

  const narrative = [
    `MODULE 2.7 — CLINICAL SUMMARY`,
    ``,
    `INTRODUCTION`,
    `This Clinical Summary integrates efficacy and safety data for ${ctx.investigationalProduct} in ${ctx.indication}. ${csrs.length} clinical study/ies enrolling ${totalSubjects} subjects are summarized. Full study reports are provided in Module 5.3.`,
    ``,
    `2.7.1 SUMMARY OF BIOPHARMACEUTIC STUDIES AND ASSOCIATED ANALYTICAL METHODS`,
    // 2026-10-15: this said "Key findings have been integrated into the proposed
    // dosage form rationale"; no biopharmaceutic input exists.
    `[No biopharmaceutic study data (bioavailability, bioequivalence, dissolution) are recorded for this summary — 2.7.1 to be provided from the Module 5.3.1 reports.]`,
    ``,
    `2.7.2 SUMMARY OF CLINICAL PHARMACOLOGY STUDIES`,
    // 2026-10-15: any Phase 1 CSR used to "address pharmacokinetics,
    // pharmacodynamics, and exposure-response relationships in healthy
    // volunteers and the target population". It now states what is recorded.
    phase1.length > 0
      ? `Clinical pharmacology: ${phase1.length} Phase 1 study/ies recorded — ${phase1.map(studyRecordText).join('; ')}.`
      : `[Phase 1 clinical pharmacology data missing — required for NDA/BLA per ICH M4E]`,
    ``,
    `2.7.3 SUMMARY OF CLINICAL EFFICACY`,
    controlledCount > 0
      ? `${controlledCount} Phase 2–3 study/ies are recorded. ${pivotal.length > 0 ? efficacyHeadline(outcomes, pivotal.length) : 'No pivotal (Phase 3) study is recorded.'}`
      : `[No controlled efficacy study available — efficacy has not been evaluated]`,
    ...pivotal.map(c =>
      `  • ${c.protocolNumber} (Phase ${c.phase}): ${c.studyDesign}, n=${sampleSizeText(c)}. Primary endpoint (${c.primaryEndpoint}): ${unterminated(c.primaryResult)}. Primary endpoint outcome: ${endpointOutcomeText(c)}.`
    ),
    ``,
    `Phase distribution: ${Object.entries(phaseCounts).map(([p, n]) => `Phase ${p}: ${n}`).join(', ')}.`,
    ``,
    `2.7.4 SUMMARY OF CLINICAL SAFETY`,
    `Safety database: ${totalSubjects} subjects enrolled across ${csrs.length} study/ies (ITT population where recorded, otherwise enrolled; all treatment arms). ${safety.statement}`,
    ``,
    `2.7.4.1 Exposure to the Investigational Drug`,
    // 2026-10-15: this said every enrolled subject "received" the product (the
    // total counts comparator arms) and that an exposure-response analysis is
    // in Module 5.3.5, which no input records.
    `The number of subjects dosed with ${ctx.investigationalProduct} and the duration of exposure are not recorded for this summary; the enrolment total above counts every treatment arm.`,
    ``,
    `2.7.4.2 Adverse Events`,
    ae.statement,
    ``,
    `2.7.4.3 Serious Adverse Events and Deaths`,
    // 2026-10-15: narratives in Module 5.3.5 and a causality discussion in 2.5
    // used to be cited here; neither is among this summary's inputs, and 2.5 has none.
    safety.gap
      ? safety.statement
      : `${safety.totalSAEs} SAE(s) and ${safety.totalDeaths} death(s) reported.${safety.totalSAEs + safety.totalDeaths > 0 ? ' Their narratives and causality assessments are not among the recorded inputs to this summary.' : ''}`,
    ``,
    `2.7.5 LITERATURE REFERENCES`,
    `See Module 5.4 for the integrated reference list.`,
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
