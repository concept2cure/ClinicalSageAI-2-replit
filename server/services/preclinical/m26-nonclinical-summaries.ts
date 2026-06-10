/**
 * @fileoverview M2.6 Nonclinical Written and Tabulated Summaries composer.
 * @module server/services/preclinical/m26-nonclinical-summaries
 *
 * Composes the ICH M4S Module 2.6 nonclinical summaries — the written and
 * tabulated summaries that sit between the 2.4 Overview and the Module 4 study
 * reports. The eCTD section map defines 2.6.1–2.6.7 but the codebase had no
 * composer for them; this fills that gap.
 *
 *   2.6.1 Introduction
 *   2.6.2 Pharmacology — written summary
 *   2.6.3 Pharmacology — tabulated summary
 *   2.6.4 Pharmacokinetics — written summary
 *   2.6.5 Pharmacokinetics — tabulated summary
 *   2.6.6 Toxicology — written summary (with the target-organ adversity profile)
 *   2.6.7 Toxicology — tabulated summary
 *
 * Pure module — no database. Reuses the M2.4 adapter's study shape and the
 * toxicologic-pathology classifier. Callable by ANA.
 *
 * @compliance ICH M4S(R2).
 */

import { mapStudyTypeToM24, type NonclinicalStudyInput } from './nonclinical-m24-adapter.js';
import { classifyToxFindings, type ToxFindingInput, type ToxFindingsSummary } from './tox-findings-classifier.js';

export interface GeneratedTable {
  title: string;
  headers: string[];
  rows: string[][];
}

export interface M26Input {
  studies: NonclinicalStudyInput[];
  /** Target-organ findings for the 2.6.6 adversity profile (optional). */
  findings?: ToxFindingInput[];
  drugSubstanceName?: string;
  indication?: string;
}

export interface M26Result {
  sectionKey: string;
  title: string;
  narrative: string;
  tables: GeneratedTable[];
  gaps: string[];
  /** 0–100 — fraction of expected nonclinical categories present. */
  completeness: number;
  toxProfile: ToxFindingsSummary | null;
  generatedAt: string;
}

interface NormalizedStudy {
  id: string;
  category: ReturnType<typeof mapStudyTypeToM24>;
  species: string;
  duration: string;
  glp: string;
  noael: string;
  finding: string;
  section: string;
}

function normalize(s: NonclinicalStudyInput, i: number): NormalizedStudy {
  const category = mapStudyTypeToM24(s.studyType);
  return {
    id: s.studyId ?? s.studyTitle ?? `NC-${i + 1}`,
    category,
    species: s.species ?? '—',
    duration: s.duration ?? (s.durationWeeks != null ? `${s.durationWeeks} wk` : '—'),
    glp: s.glpStatus ?? (s.glpCompliant == null ? '—' : s.glpCompliant ? 'GLP' : 'non-GLP'),
    noael: s.noael ?? '—',
    finding: s.primaryFinding ?? s.keyFindings ?? 'See Module 4 study report.',
    section: s.reportSection ?? '4.2',
  };
}

/** Compose the Module 2.6 nonclinical written and tabulated summaries. */
export function buildM26NonclinicalSummaries(input: M26Input): M26Result {
  const ds = input.drugSubstanceName || 'the drug substance';
  const studies = input.studies.map(normalize);

  const pharm = studies.filter(s => s.category === 'pharmacology' || s.category === 'safety_pharmacology');
  const pk = studies.filter(s => s.category === 'pharmacokinetics');
  const tox = studies.filter(
    s => s.category === 'toxicology' || s.category === 'genotoxicity' || s.category === 'carcinogenicity' || s.category === 'reproductive_tox',
  );

  const gaps: string[] = [];
  if (!studies.some(s => s.category === 'pharmacology')) gaps.push('primary pharmacology');
  if (!studies.some(s => s.category === 'safety_pharmacology')) gaps.push('safety pharmacology (ICH S7A)');
  if (pk.length === 0) gaps.push('pharmacokinetics / ADME');
  if (!studies.some(s => s.category === 'toxicology')) gaps.push('repeat-dose toxicology');
  if (!studies.some(s => s.category === 'genotoxicity')) gaps.push('genotoxicity battery (ICH S2(R1))');

  let toxProfile: ToxFindingsSummary | null = null;
  if (input.findings && input.findings.length > 0) {
    toxProfile = classifyToxFindings(input.findings);
  }

  const narrative = [
    'MODULE 2.6 — NONCLINICAL WRITTEN AND TABULATED SUMMARIES',
    '',
    '2.6.1 INTRODUCTION',
    `This document summarizes the nonclinical pharmacology, pharmacokinetics, and toxicology of ${ds}${input.indication ? ` for ${input.indication}` : ''}, per ICH M4S. ${studies.length} study/ies are summarized; full reports are in Module 4.`,
    '',
    '2.6.2 PHARMACOLOGY WRITTEN SUMMARY',
    pharm.length > 0
      ? `Primary/secondary pharmacodynamics and safety pharmacology (${pharm.length} study/ies). ${pharm.map(s => `${s.id}: ${s.finding}`).join(' ')}`
      : '[No pharmacology studies provided — see gap list]',
    '',
    '2.6.3 PHARMACOLOGY TABULATED SUMMARY',
    pharm.length > 0 ? 'See table: Pharmacology study summary.' : '[Not applicable]',
    '',
    '2.6.4 PHARMACOKINETICS WRITTEN SUMMARY',
    pk.length > 0
      ? `Absorption, distribution, metabolism, and excretion (${pk.length} study/ies). Species: ${[...new Set(pk.map(s => s.species))].filter(v => v !== '—').join(', ') || '[not specified]'}.`
      : '[PK / ADME data missing]',
    '',
    '2.6.5 PHARMACOKINETICS TABULATED SUMMARY',
    pk.length > 0 ? 'See table: Pharmacokinetic study summary.' : '[Not applicable]',
    '',
    '2.6.6 TOXICOLOGY WRITTEN SUMMARY',
    tox.length > 0
      ? `Single- and repeat-dose toxicity, genotoxicity, and reproductive/carcinogenicity studies as applicable (${tox.length} study/ies). NOAELs and target-organ findings are tabulated in 2.6.7.`
      : '[Toxicology data missing — required per ICH M3(R2)]',
    toxProfile ? `Target-organ adversity profile: ${toxProfile.overviewParagraph}` : '',
    '',
    '2.6.7 TOXICOLOGY TABULATED SUMMARY',
    tox.length > 0 ? 'See table: Toxicology study summary.' : '[Not applicable]',
    '',
    gaps.length > 0 ? `IDENTIFIED GAPS: ${gaps.join('; ')}.` : 'No gaps identified against the ICH M4S nonclinical summary set.',
  ]
    .filter(line => line !== '')
    .join('\n');

  const tables: GeneratedTable[] = [];
  if (pharm.length > 0) {
    tables.push({
      title: '2.6.3 Pharmacology Tabulated Summary',
      headers: ['Study', 'Category', 'Species', 'Key finding', 'Section'],
      rows: pharm.map(s => [s.id, s.category.replace(/_/g, ' '), s.species, s.finding, s.section]),
    });
  }
  if (pk.length > 0) {
    tables.push({
      title: '2.6.5 Pharmacokinetics Tabulated Summary',
      headers: ['Study', 'Species', 'Key finding', 'Section'],
      rows: pk.map(s => [s.id, s.species, s.finding, s.section]),
    });
  }
  if (tox.length > 0) {
    tables.push({
      title: '2.6.7 Toxicology Tabulated Summary',
      headers: ['Study', 'Category', 'Species', 'Duration', 'GLP', 'NOAEL', 'Key finding'],
      rows: tox.map(s => [s.id, s.category.replace(/_/g, ' '), s.species, s.duration, s.glp, s.noael, s.finding]),
    });
  }

  const expected = 5;
  const completeness = Math.max(0, Math.round(((expected - gaps.length) / expected) * 100));

  return {
    sectionKey: '2.6',
    title: 'Nonclinical Written and Tabulated Summaries',
    narrative,
    tables,
    gaps,
    completeness,
    toxProfile,
    generatedAt: new Date().toISOString(),
  };
}
