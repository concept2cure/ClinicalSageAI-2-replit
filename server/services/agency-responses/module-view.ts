/**
 * One CTD module's view of a project's agency questions (2026-10-19, rows D2
 * and D5; decisions P-38 and P-39 item 1). Pure: no database, no clock, no
 * model.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Agency questions have one home: the letter they came in
 * (agency_communication_questions), worked in Communication and Project home's
 * Respond. CMC / Module 3 kept a second file of its own (reg_questions), now
 * read-only. What CMC needs is not a second home but a view of the first:
 * which of a program's questions are about Module 3, where each stands, which
 * are overdue, and what it could not tell. This computes that view from the
 * rows the route read, with the states and the overdue verdict the letter
 * itself carries (response-logic.ts), so CMC and the letter cannot disagree.
 *
 * ── Which questions are a module's ───────────────────────────────────────────
 *   1. The question's own CTD section (ctd_section, recorded with the question
 *      or corrected with a reason), when there is one.
 *   2. Otherwise the letter's linked section codes, read through the
 *      repository's one CTD rule (shared/regulatory/section-code.ts); a code
 *      that does not parse is ignored. The two screens that log a letter send
 *      none today, so this rarely applies; it is kept because the column is
 *      the letter's own statement of what it concerns.
 *   3. Otherwise, for Module 3 only, the CMC discipline: CMC is Module 3's
 *      discipline. Shown as such, never as a section.
 * A question with none of these is not dropped: an outstanding one is counted
 * as `unclassifiedOutstanding`, so the module's figure says what it left out.
 * Membership is by whole segment (3.2.P.5 holds 3.2.P.5.1, not 3.2.P.50).
 *
 * ── What is counted ─────────────────────────────────────────────────────────
 * Every count is over every row the caller passed, never over the listed page.
 * A letter is a module's when it carries one of the module's questions, or,
 * with no question recorded, when one of its own codes is the module's.
 *
 * Each overdue-letter count means one thing, so a screen can say it in one
 * true sentence (review of 2026-10-19). The letter's overdue verdict is over
 * ALL its questions (letterOverdue), so a letter can be overdue while every
 * question of the module on it is answered as it stands:
 *   - lettersOverdue: the letters the module's overdue questions are on;
 *   - lettersWithoutQuestionsOverdue: the module's letters with no question to
 *     answer recorded (none, or only withdrawn ones), past their date; each is
 *     named in lettersWithoutQuestions, and none is also counted elsewhere;
 *   - lettersOverdueOnOtherQuestions: the module's letters overdue only on
 *     their other questions. An approved answer is never shown as overdue, so
 *     such a letter is neither in lettersOverdue nor said to have nothing
 *     recorded on it.
 * "Outstanding" is decided here, once, per question (`outstanding`): a screen
 * filters on it rather than restating the rule.
 *
 * @module server/services/agency-responses/module-view
 */

import { compareSectionCode, ctdCodeWithin, normalizeCtdCode } from '../../../shared/regulatory/section-code';
import {
  compareQuestionRefs,
  letterOverdue,
  questionOverdue,
  utcDay,
  type QuestionApproval,
  type QuestionRecord,
  type ResponseState,
} from './response-logic';

export type CtdModule = 1 | 2 | 3 | 4 | 5;
export type SectionSource = 'question' | 'letter' | 'discipline';

export interface ModuleClassification {
  /** Whether anything placed the question in a CTD module at all. */
  classified: boolean;
  inModule: boolean;
  /** The section shown for it; null for the discipline (it names no section). */
  section: string | null;
  source: SectionSource | null;
}

/** The letter's own codes that parse, normalised, in CTD order. */
function letterCodes(codes: readonly unknown[]): string[] {
  const out = new Set<string>();
  for (const c of codes) {
    const n = typeof c === 'string' ? normalizeCtdCode(c) : null;
    if (n) out.add(n);
  }
  return [...out].sort(compareSectionCode);
}

/** The letter's codes inside `module`, normalised, in CTD order. */
export function letterCodesInModule(codes: readonly unknown[], module: CtdModule): string[] {
  return letterCodes(codes).filter((c) => ctdCodeWithin(c, String(module)));
}

/** Where one question belongs: its own section, then its letter's codes, then (Module 3) the CMC discipline. */
export function classifyForModule(
  q: { ctdSection: string | null; discipline: string | null },
  letterSectionCodes: readonly unknown[],
  module: CtdModule,
): ModuleClassification {
  const own = normalizeCtdCode(q.ctdSection);
  if (own) return { classified: true, inModule: ctdCodeWithin(own, String(module)), section: own, source: 'question' };
  const codes = letterCodes(letterSectionCodes);
  if (codes.length > 0) {
    const mine = codes.filter((c) => ctdCodeWithin(c, String(module)));
    return { classified: true, inModule: mine.length > 0, section: mine[0] ?? null, source: 'letter' };
  }
  if (module === 3 && (q.discipline ?? '').trim().toUpperCase() === 'CMC') {
    return { classified: true, inModule: true, section: null, source: 'discipline' };
  }
  return { classified: false, inModule: false, section: null, source: null };
}

export interface ViewLetter {
  eventId: string;
  communicationType: string;
  receivedDate: string | null;
  dueDate: string | null;
  closureStatus: string;
  responseRequired: boolean;
  linkedSectionCodes: readonly unknown[];
}

export interface ViewQuestion extends QuestionRecord {
  approval: QuestionApproval;
  ctdSection: string | null;
  discipline: string | null;
  severity: string;
  /** Who owns preparing the response, set on the letter with a reason; absent or null with none. */
  ownerUserId?: number | null;
  ownerName?: string | null;
}

interface LetterView {
  id: string;
  communicationType: string;
  receivedDate: string | null;
  dueDate: string | null;
  closureStatus: string;
  responseRequired: boolean;
  /** The server's verdict on the whole letter (letterOverdue), the same the letter's own read reports. */
  overdue: boolean;
}

export interface ModuleQuestion {
  id: number;
  questionRef: string;
  questionText: string;
  discipline: string | null;
  severity: string;
  ctdSection: string | null;
  section: string | null;
  sectionSource: SectionSource;
  state: ResponseState;
  /** Not answered as it stands (no response, draft, changed after approval), on a letter not closed. */
  outstanding: boolean;
  overdue: boolean;
  approval: { signatureId: number; signerName: string; signedAt: string } | null;
  /** Who owns preparing the response, as recorded on the letter; null with none. */
  owner: { userId: number; name: string | null } | null;
  letter: LetterView;
}

export interface ModuleView {
  questions: ModuleQuestion[];
  /**
   * The module's letters with no question to answer recorded (none, or only
   * withdrawn ones), by the letter's own codes or its withdrawn questions:
   * named, so the empty list is not read as "nothing asked". `sections` is
   * empty when only the CMC discipline placed it.
   */
  lettersWithoutQuestions: Array<LetterView & { sections: string[] }>;
  summary: {
    /** The module's questions, every state. */
    questions: number;
    /** Not answered as they stand (no response, draft, changed after approval), on letters not closed. */
    outstanding: number;
    /** Outstanding on an overdue letter. */
    questionsOverdue: number;
    /** The letters the overdue questions are on. */
    lettersOverdue: number;
    /** The module's letters with no question to answer recorded, past their date (named in lettersWithoutQuestions). */
    lettersWithoutQuestionsOverdue: number;
    /** The module's letters overdue only on their other questions: each module question on them is answered as it stands. */
    lettersOverdueOnOtherQuestions: number;
    byState: Record<ResponseState, number>;
  };
  /** What this view could not place in any module, from the program's open letters. */
  notCounted: { unclassifiedOutstanding: number; overdueLettersWithoutQuestions: number };
  /** True when `questions` lists fewer than the summary counts. */
  truncated: boolean;
}

const OUTSTANDING: ReadonlySet<ResponseState> = new Set(['unanswered', 'drafted', 'changed-after-approval']);
export const MODULE_VIEW_LIST_CAP = 200;

function letterView(l: ViewLetter, overdue: boolean): LetterView {
  return {
    id: l.eventId,
    communicationType: l.communicationType,
    receivedDate: l.receivedDate,
    dueDate: l.dueDate,
    closureStatus: l.closureStatus,
    responseRequired: l.responseRequired,
    overdue,
  };
}

/** Overdue first, then outstanding, then the letter's due date (none last), the letter, the agency's numbering. */
function byUrgency(a: ModuleQuestion, b: ModuleQuestion): number {
  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
  if (a.outstanding !== b.outstanding) return a.outstanding ? -1 : 1;
  const ad = utcDay(a.letter.dueDate);
  const bd = utcDay(b.letter.dueDate);
  if (ad !== bd) return ad === null ? 1 : bd === null ? -1 : ad < bd ? -1 : 1;
  if (a.letter.id !== b.letter.id) return a.letter.id < b.letter.id ? -1 : 1;
  return compareQuestionRefs(a, b);
}

interface Accumulator {
  listed: ModuleQuestion[];
  lettersWithoutQuestions: ModuleView['lettersWithoutQuestions'];
  lettersOverdue: number;
  lettersWithoutQuestionsOverdue: number;
  lettersOverdueOnOtherQuestions: number;
  byState: Record<ResponseState, number>;
  unclassifiedOutstanding: number;
  overdueLettersWithoutQuestions: number;
}

function moduleQuestion(q: ViewQuestion, c: ModuleClassification, outstanding: boolean, overdue: boolean, letter: LetterView): ModuleQuestion {
  const signed = q.approval.approval;
  return {
    id: q.id,
    questionRef: q.questionRef,
    questionText: q.questionText,
    discipline: q.discipline,
    severity: q.severity,
    ctdSection: q.ctdSection,
    section: c.section,
    sectionSource: c.source as SectionSource,
    state: q.approval.state,
    outstanding,
    overdue,
    approval: signed ? { signatureId: signed.id, signerName: signed.signerName, signedAt: signed.signedAt } : null,
    owner: q.ownerUserId != null ? { userId: q.ownerUserId, name: q.ownerName ?? null } : null,
    letter,
  };
}

/** What one letter's questions contributed to the module, for the letter-level counts. */
interface LetterTally {
  placed: boolean;
  anyClassified: boolean;
  questionOverdueHere: boolean;
  withdrawnSections: Set<string>;
}

/** One letter's questions: each of the module's is listed and counted; an outstanding one no module can place is counted as such. */
function tallyQuestions(acc: Accumulator, l: ViewLetter, qs: readonly ViewQuestion[], module: CtdModule, lv: LetterView): LetterTally {
  const lateLetter = lv.overdue;
  const open = l.closureStatus !== 'closed';
  const t: LetterTally = { placed: false, anyClassified: false, questionOverdueHere: false, withdrawnSections: new Set<string>() };
  for (const q of qs) {
    const c = classifyForModule(q, l.linkedSectionCodes, module);
    const state = q.approval.state;
    if (!c.classified) {
      if (open && OUTSTANDING.has(state)) acc.unclassifiedOutstanding += 1;
      continue;
    }
    t.anyClassified = true;
    if (!c.inModule) continue;
    t.placed = true;
    const overdue = questionOverdue(lateLetter, state);
    if (overdue) t.questionOverdueHere = true;
    if (state === 'withdrawn' && c.section) t.withdrawnSections.add(c.section);
    acc.byState[state] += 1;
    acc.listed.push(moduleQuestion(q, c, open && OUTSTANDING.has(state), overdue, lv));
  }
  return t;
}

/**
 * One letter's contribution: its module questions, or (with no question to
 * answer) the letter itself, and what could not be placed. Each letter lands
 * in at most one overdue-letter count.
 */
function addLetter(acc: Accumulator, l: ViewLetter, qs: readonly ViewQuestion[], module: CtdModule, today: string): void {
  const lateLetter = letterOverdue(l, qs, today);
  const lv = letterView(l, lateLetter);
  const { placed, anyClassified, questionOverdueHere, withdrawnSections } = tallyQuestions(acc, l, qs, module, lv);
  if (!qs.some((q) => q.approval.state !== 'withdrawn')) {
    // Nothing to answer is recorded on it. The module names it when its own
    // codes, or a withdrawn question of the module, place it here.
    const sections = [...new Set([...letterCodesInModule(l.linkedSectionCodes, module), ...withdrawnSections])].sort(compareSectionCode);
    if (placed || sections.length > 0) {
      acc.lettersWithoutQuestions.push({ ...lv, sections });
      if (lateLetter) acc.lettersWithoutQuestionsOverdue += 1;
    } else if (lateLetter && !anyClassified && letterCodes(l.linkedSectionCodes).length === 0) {
      acc.overdueLettersWithoutQuestions += 1;
    }
    return;
  }
  if (questionOverdueHere) acc.lettersOverdue += 1;
  else if (placed && lateLetter) acc.lettersOverdueOnOtherQuestions += 1;
}

/**
 * The module's view of the letters passed. `letters` must already be only those
 * the person may see (the route drops the others and reports how many); every
 * question passed must be on one of them.
 */
export function moduleQuestionsView(input: {
  letters: readonly ViewLetter[];
  questions: readonly ViewQuestion[];
  module: CtdModule;
  today: string;
  listCap?: number;
}): ModuleView {
  const { module, today } = input;
  const cap = input.listCap ?? MODULE_VIEW_LIST_CAP;
  const byLetter = new Map<string, ViewQuestion[]>();
  for (const q of input.questions) {
    const list = byLetter.get(q.communicationEventId) ?? [];
    list.push(q);
    byLetter.set(q.communicationEventId, list);
  }

  const acc: Accumulator = {
    listed: [],
    lettersWithoutQuestions: [],
    lettersOverdue: 0,
    lettersWithoutQuestionsOverdue: 0,
    lettersOverdueOnOtherQuestions: 0,
    byState: { unanswered: 0, drafted: 0, 'changed-after-approval': 0, approved: 0, withdrawn: 0 },
    unclassifiedOutstanding: 0,
    overdueLettersWithoutQuestions: 0,
  };
  for (const l of input.letters) addLetter(acc, l, byLetter.get(l.eventId) ?? [], module, today);
  const { listed, lettersWithoutQuestions, byState, unclassifiedOutstanding, overdueLettersWithoutQuestions } = acc;

  listed.sort(byUrgency);
  return {
    questions: listed.slice(0, cap),
    lettersWithoutQuestions,
    summary: {
      questions: listed.length,
      outstanding: listed.filter((q) => q.outstanding).length,
      questionsOverdue: listed.filter((q) => q.overdue).length,
      lettersOverdue: acc.lettersOverdue,
      lettersWithoutQuestionsOverdue: acc.lettersWithoutQuestionsOverdue,
      lettersOverdueOnOtherQuestions: acc.lettersOverdueOnOtherQuestions,
      byState,
    },
    notCounted: { unclassifiedOutstanding, overdueLettersWithoutQuestions },
    truncated: listed.length > cap,
  };
}
