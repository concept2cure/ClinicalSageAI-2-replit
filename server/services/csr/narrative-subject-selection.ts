/**
 * Which subjects need a patient safety narrative (CSR slice 7, 2026-10-29;
 * ICH E3 §12.3.2 with §12.3.1.2–12.3.1.3): every subject who died, every
 * subject with any other serious adverse event, every subject whose study
 * treatment was withdrawn for an adverse event, and, when the protocol defines
 * them (CsrAdamBundle.adverseEventsOfSpecialInterest), every subject with an
 * adverse event of special interest. Pure and deterministic over ADSL and ADAE.
 *
 * The rule never narrows silently. Deaths and SAEs are selected whether or
 * not the event is treatment-emergent (E3 asks for all of them); a value that
 * does not establish whether an event was serious, fatal or led to withdrawal
 * is a typed refusal (CSR_ADAM_*), never read as "no". Each selected event
 * keeps its ADAE row index, so every fact downstream names the row it came from.
 *
 * Withdrawal for an AE is read from every place ADSL records it (2026-10-30,
 * CDISC pilot defect D8): DCSREAS, DCTREAS and DCDECOD, and the manifest's
 * declared subject-level flag (conventions.aeDiscontinuationFlag). With that
 * flag declared, a study that never collected AEACN is not refused on it; a
 * recorded DRUG WITHDRAWN still qualifies its event.
 */
import type { CsrAdamBundle } from '../../../shared/csr-adam-bundle.js';
import type { AdamDataset, AdamRow } from './adam-dataset-reader.js';
import { has, refuse, required, requireColumns, text, where, type AdamDatasets } from './adam-rows.js';

export const NARRATIVE_CATEGORIES = ['death', 'serious', 'discontinuation', 'aesi'] as const;
export type NarrativeCategory = typeof NARRATIVE_CATEGORIES[number];

export interface SelectedEvent { row: AdamRow; index: number; categories: NarrativeCategory[] }
export interface SelectedSubject {
  subjectId: string;
  adsl: AdamRow;
  adslIndex: number;
  /** Position of the subject's arm in the manifest (treatment-group order). */
  armOrder: number;
  armName: string;
  categories: NarrativeCategory[];
  /** The qualifying ADAE events, in ADAE order. */
  events: SelectedEvent[];
  /** ADSL records a death (DTHFL = Y, or DCSREAS DEATH). */
  diedPerAdsl: boolean;
  /** ADSL records discontinuation for an adverse event (DCSREAS, DCTREAS, DCDECOD or the declared flag). */
  discontinuedForAePerAdsl: boolean;
}
export interface NarrativeSelection {
  subjects: SelectedSubject[];
  /** Subjects per category; a subject in several categories counts in each. */
  counts: Record<NarrativeCategory, number>;
  aesiDeclared: boolean;
}

const yesNo = (ds: AdamDataset, row: AdamRow, i: number, v: string): boolean => {
  const value = text(row, v).toUpperCase();
  if (value === 'Y') return true;
  if (value === 'N') return false;
  return refuse('VALUE_MISSING', `${v} must be Y or N on every ADAE row; a blank does not establish whether the event qualifies for a narrative.`, where(ds, i, v));
};
const AE_REASON = /^ADVERSE EVENT/;
const yesNoBlank = (ds: AdamDataset, row: AdamRow, i: number, v: string): boolean => {
  const value = text(row, v).toUpperCase();
  if (value === 'Y') return true;
  if (value === 'N' || value === '') return false;
  return refuse('VALUE_UNMAPPED', `${v} must be Y, N or blank.`, where(ds, i, v));
};

/** The ADSL variables that may record a disposition reason; DCDECOD is the CDISC standardized disposition term. */
export const ADSL_REASON_VARIABLES = ['DCSREAS', 'DCTREAS', 'DCDECOD'] as const;

function eventCategories(ds: AdamDataset, row: AdamRow, i: number, aesi: CsrAdamBundle['adverseEventsOfSpecialInterest'], actionRequired: boolean): NarrativeCategory[] {
  const categories: NarrativeCategory[] = [];
  const fatal = (has(ds, 'AESDTH') && text(row, 'AESDTH').toUpperCase() === 'Y') || text(row, 'AEOUT').toUpperCase() === 'FATAL';
  if (fatal) categories.push('death');
  if (yesNo(ds, row, i, 'AESER')) categories.push('serious');
  const action = text(row, 'AEACN').toUpperCase();
  if (actionRequired && !action && text(row, 'TRTEMFL').toUpperCase() === 'Y') {
    refuse('VALUE_MISSING', 'AEACN does not record the action taken with study treatment for a treatment-emergent event.', where(ds, i, 'AEACN'));
  }
  if (action === 'DRUG WITHDRAWN') categories.push('discontinuation');
  if (aesi) {
    const flagged = aesi.flagVariable ? text(row, aesi.flagVariable).toUpperCase() === 'Y' : false;
    const term = required(ds, row, i, 'AEDECOD').toUpperCase();
    if (flagged || (aesi.preferredTerms ?? []).some(t => t.trim().toUpperCase() === term)) categories.push('aesi');
  }
  return categories;
}

function subjectSkeleton(adsl: AdamDataset, row: AdamRow, i: number, bundle: CsrAdamBundle, aeFlag: string | undefined): SelectedSubject {
  const treatment = (has(adsl, 'TRT01A') && text(row, 'TRT01A')) || text(row, 'TRT01P');
  const armOrder = bundle.arms.findIndex(a => a.treatment === treatment);
  if (armOrder < 0) refuse('ARM_UNMAPPED', 'A subject’s treatment (TRT01A, else TRT01P) is not mapped to an arm in the manifest.', where(adsl, i, 'TRT01P'));
  const reasons = ADSL_REASON_VARIABLES.filter(v => has(adsl, v)).map(v => text(row, v).toUpperCase());
  const flagged = aeFlag ? yesNoBlank(adsl, row, i, aeFlag) : false;
  return {
    subjectId: required(adsl, row, i, 'USUBJID'), adsl: row, adslIndex: i, armOrder, armName: bundle.arms[armOrder].armName,
    categories: [], events: [],
    diedPerAdsl: (has(adsl, 'DTHFL') && text(row, 'DTHFL').toUpperCase() === 'Y') || reasons.includes('DEATH'),
    discontinuedForAePerAdsl: flagged || reasons.some(r => AE_REASON.test(r)),
  };
}

function addCategories(subject: SelectedSubject, categories: NarrativeCategory[]) {
  for (const c of categories) if (!subject.categories.includes(c)) subject.categories.push(c);
}

/** Every subject the E3 §12.3.2 rule selects, in treatment-group then subject order. */
export function selectNarrativeSubjects(bundle: CsrAdamBundle, datasets: Pick<AdamDatasets, 'ADSL' | 'ADAE'>): NarrativeSelection {
  const { ADSL: adsl, ADAE: adae } = datasets;
  const aeFlag = bundle.conventions?.aeDiscontinuationFlag;
  requireColumns(adsl, 'USUBJID', 'TRT01P', ...(aeFlag ? [aeFlag] : []));
  requireColumns(adae, 'USUBJID', 'AEDECOD', 'AESER', ...(aeFlag ? [] : ['AEACN']), has(adae, 'AESDTH') ? 'AESDTH' : 'AEOUT');
  const aesi = bundle.adverseEventsOfSpecialInterest;
  if (aesi?.flagVariable) requireColumns(adae, aesi.flagVariable);
  const all = new Map<string, SelectedSubject>();
  adsl.rows.forEach((row, i) => {
    const subject = subjectSkeleton(adsl, row, i, bundle, aeFlag);
    if (all.has(subject.subjectId)) refuse('DUPLICATE_SUBJECT', 'ADSL lists a subject more than once.', where(adsl, i, 'USUBJID'));
    all.set(subject.subjectId, subject);
  });
  adae.rows.forEach((row, i) => {
    const subject = all.get(text(row, 'USUBJID'))
      ?? refuse('SUBJECT_NOT_IN_ADSL', 'An ADAE row names a subject that ADSL does not list.', where(adae, i, 'USUBJID'));
    const categories = eventCategories(adae, row, i, aesi, !aeFlag);
    if (!categories.length) return;
    subject.events.push({ row, index: i, categories });
    addCategories(subject, categories);
  });
  const subjects: SelectedSubject[] = [];
  for (const subject of all.values()) {
    if (subject.diedPerAdsl) addCategories(subject, ['death']);
    if (subject.discontinuedForAePerAdsl) addCategories(subject, ['discontinuation']);
    if (subject.categories.length) subjects.push(subject);
  }
  subjects.sort((a, b) => a.armOrder - b.armOrder || (a.subjectId < b.subjectId ? -1 : a.subjectId > b.subjectId ? 1 : 0));
  const counts = Object.fromEntries(NARRATIVE_CATEGORIES.map(c => [c, subjects.filter(s => s.categories.includes(c)).length])) as Record<NarrativeCategory, number>;
  return { subjects, counts, aesiDeclared: !!aesi };
}
