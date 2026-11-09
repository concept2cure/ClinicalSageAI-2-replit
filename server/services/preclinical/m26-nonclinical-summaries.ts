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

import { toBuilderStudy, type NonclinicalStudyInput } from './nonclinical-m24-adapter.js';
import { classifyToxFindings, type ToxFindingInput, type ToxFindingsSummary } from './tox-findings-classifier.js';
import {
  DRUG_SUBSTANCE_NAME_GAP,
  DRUG_SUBSTANCE_NAME_NOT_RECORDED,
  isRepeatDoseNonclinicalStudy,
  nonclinicalStudyRecordGaps,
  type NonclinicalStudy,
} from '../m2-summary-builders.js';

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
  record: NonclinicalStudy;
  id: string;
  category: NonclinicalStudy['studyType'];
  sourceType: string;
  species: string;
  duration: string;
  glp: string;
  noael: string;
  noel: string;
  finding: string;
  section: string;
}

function normalize(s: NonclinicalStudyInput, i: number): NormalizedStudy {
  const record = toBuilderStudy(s, i);
  return {
    record,
    id: record.studyId.trim() || '[study identifier not recorded]',
    category: record.studyType,
    sourceType: recordedCell(record.sourceStudyType),
    species: recordedCell(record.species),
    duration: recordedCell(record.duration),
    glp: recordedCell(record.glpStatus),
    noael: recordedCell(record.noael),
    noel: recordedCell(record.noel),
    finding: recordedCell(record.primaryFinding),
    section: recordedCell(record.reportSection),
  };
}

function recordedCell(value: string | undefined): string {
  return value?.trim() || '—';
}

interface StudyGroups {
  pharm: NormalizedStudy[];
  pk: NormalizedStudy[];
  tox: NormalizedStudy[];
  unclassified: NormalizedStudy[];
}

function groupStudies(studies: NormalizedStudy[]): StudyGroups {
  return {
    pharm: studies.filter(s => s.category === 'pharmacology' || s.category === 'safety_pharmacology'),
    pk: studies.filter(s => s.category === 'pharmacokinetics'),
    tox: studies.filter(s => ['toxicology', 'genotoxicity', 'carcinogenicity', 'reproductive_tox'].includes(s.category)),
    unclassified: studies.filter(s => s.category === 'unclassified'),
  };
}

function categoryGapsFor(studies: NormalizedStudy[]): string[] {
  const checked: Array<[string, (study: NormalizedStudy) => boolean]> = [
    ['primary pharmacology', s => s.category === 'pharmacology'],
    ['safety pharmacology (ICH S7A)', s => s.category === 'safety_pharmacology'],
    ['pharmacokinetics / ADME', s => s.category === 'pharmacokinetics'],
    ['repeat-dose toxicology', s => isRepeatDoseNonclinicalStudy(s.record)],
    ['genotoxicity battery (ICH S2(R1))', s => s.category === 'genotoxicity'],
  ];
  return checked.filter(([, present]) => !studies.some(present)).map(([label]) => label);
}

function observedTypes(studies: NormalizedStudy[]): string {
  return [...new Set(studies.map(s => s.sourceType))].join(', ');
}

function pharmacologyNarrative(pharm: NormalizedStudy[]): string[] {
  return [
    '2.6.2 PHARMACOLOGY WRITTEN SUMMARY',
    pharm.length > 0
      ? `Recorded pharmacology study types (${pharm.length} study/ies): ${observedTypes(pharm)}. ${pharm.map(s => `${s.id}: ${s.finding}`).join(' ')}`
      : '[No pharmacology studies provided — see gap list]',
    '2.6.3 PHARMACOLOGY TABULATED SUMMARY',
    pharm.length > 0 ? 'See preparation worksheet: Pharmacology study summary.' : '[No pharmacology table composed — applicability is not assessed]',
  ];
}

function pharmacokineticsNarrative(pk: NormalizedStudy[]): string[] {
  return [
    '2.6.4 PHARMACOKINETICS WRITTEN SUMMARY',
    pk.length > 0
      ? `Recorded pharmacokinetic / ADME study entries (${pk.length} study/ies). Species: ${[...new Set(pk.map(s => s.species))].filter(v => v !== '—').join(', ') || '[not recorded]'}.`
      : '[PK / ADME data missing]',
    '2.6.5 PHARMACOKINETICS TABULATED SUMMARY',
    pk.length > 0 ? 'See preparation worksheet: Pharmacokinetic study summary.' : '[No pharmacokinetics table composed — applicability is not assessed]',
  ];
}

function toxicologyNarrative(tox: NormalizedStudy[], toxProfile: ToxFindingsSummary | null): string[] {
  return [
    '2.6.6 TOXICOLOGY WRITTEN SUMMARY',
    tox.length > 0
      ? `Recorded toxicology study types (${tox.length} study/ies): ${observedTypes(tox)}. Recorded fields and missing values are tabulated in 2.6.7.`
      : '[No toxicology studies recorded — applicability requires assessment against the proposed clinical context]',
    toxProfile ? `Target-organ adversity profile: ${toxProfile.overviewParagraph}` : '',
    '2.6.7 TOXICOLOGY TABULATED SUMMARY',
    tox.length > 0 ? 'See preparation worksheet: Toxicology study summary.' : '[No toxicology table composed — applicability is not assessed]',
  ];
}

function studyTables({ pharm, pk, tox, unclassified }: StudyGroups): GeneratedTable[] {
  const tables: GeneratedTable[] = [];
  if (pharm.length > 0) {
    tables.push({
      title: '2.6.3 Pharmacology Tabulated Summary',
      headers: ['Study', 'Recorded type', 'Species', 'Key finding', 'Proposed section'],
      rows: pharm.map(s => [s.id, s.sourceType, s.species, s.finding, s.section]),
    });
  }
  if (pk.length > 0) {
    tables.push({
      title: '2.6.5 Pharmacokinetics Tabulated Summary',
      headers: ['Study', 'Recorded type', 'Species', 'Key finding', 'Proposed section'],
      rows: pk.map(s => [s.id, s.sourceType, s.species, s.finding, s.section]),
    });
  }
  if (tox.length > 0) {
    tables.push({
      title: '2.6.7 Toxicology Tabulated Summary',
      headers: ['Study', 'Recorded type', 'Species', 'Duration', 'GLP declaration', 'NOAEL', 'NOEL', 'Key finding', 'Proposed section'],
      rows: tox.map(s => [s.id, s.sourceType, s.species, s.duration, s.glp, s.noael, s.noel, s.finding, s.section]),
    });
  }
  if (unclassified.length > 0) {
    tables.push({
      title: 'Unclassified Study Preparation Worksheet',
      headers: ['Study', 'Recorded type', 'Species', 'Duration', 'GLP declaration', 'NOAEL', 'NOEL', 'Key finding', 'Proposed section'],
      rows: unclassified.map(s => [s.id, s.sourceType, s.species, s.duration, s.glp, s.noael, s.noel, s.finding, s.section]),
    });
  }
  return tables;
}

/** Compose preparation worksheets from supplied study facts, without assessing program readiness. */
export function buildM26NonclinicalSummaries(input: M26Input): M26Result {
  const ds = input.drugSubstanceName?.trim() || DRUG_SUBSTANCE_NAME_NOT_RECORDED;
  const studies = input.studies.map(normalize);
  const groups = groupStudies(studies);
  const categoryGaps = categoryGapsFor(studies);
  const gaps = [
    ...categoryGaps,
    ...studies.flatMap(s => nonclinicalStudyRecordGaps(s.record)),
  ];
  if (ds === DRUG_SUBSTANCE_NAME_NOT_RECORDED) gaps.push(DRUG_SUBSTANCE_NAME_GAP);

  const toxProfile = input.findings?.length ? classifyToxFindings(input.findings) : null;
  const narrative = [
    'MODULE 2.6 — NONCLINICAL WRITTEN AND TABULATED SUMMARIES',
    '2.6.1 INTRODUCTION',
    `This document summarizes the supplied nonclinical study records of ${ds}${input.indication ? ` for ${input.indication}` : ''}, organized using ICH M4S. ${studies.length} study/ies are summarized.`,
    'Tabulated summaries are preparation worksheets. Verify the source reports, report availability and intended Module 4 placement before use. GLP entries are supplied declarations; GLP compliance is not assessed.',
    "Completeness measures only the presence of the five checked study categories. Applicability under ICH M3(R2) for the proposed clinical phase and duration and the sponsor's toxicology judgment remain unassessed.",
    ...pharmacologyNarrative(groups.pharm),
    ...pharmacokineticsNarrative(groups.pk),
    ...toxicologyNarrative(groups.tox, toxProfile),
    gaps.length > 0 ? `IDENTIFIED GAPS: ${gaps.join('; ')}.` : 'Each checked study category is represented; source-report verification and sponsor scientific review remain outstanding.',
  ].filter(Boolean).join('\n');

  return {
    sectionKey: '2.6',
    title: 'Nonclinical Written and Tabulated Summaries',
    narrative,
    tables: studyTables(groups),
    gaps,
    completeness: Math.max(0, Math.round(((5 - categoryGaps.length) / 5) * 100)),
    toxProfile,
    generatedAt: new Date().toISOString(),
  };
}
