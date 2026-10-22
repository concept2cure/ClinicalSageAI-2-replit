/**
 * CMC / Module 3's view of a program's agency questions (2026-10-19, rows D2
 * and D5; decisions P-38 and P-39 item 1).
 *
 * ── What changed ─────────────────────────────────────────────────────────────
 * CMC kept a second home for agency questions: its own file (reg_questions,
 * /api/cmc/agency-questions), where a question was logged, assigned, sent for
 * review, drafted into an authoring document and CLOSED by status update, with
 * no signature, and counted overdue by its own rule. Agency questions have one
 * home, the letter they came in: recorded, answered and approved by a Part 11
 * signature in Communication and Project home's Respond (AgencyInbox.tsx,
 * AgencyResponses.tsx). This module is CMC's view of that record, and nothing
 * more:
 *
 *   - CmcQuestionsProvider reads the program's Module 3 questions ONCE, at the
 *     CMC module's root (GET /api/concept2cure/projects/:projectId/
 *     agency-questions?ctdModule=3), and the earlier file's history
 *     (GET /api/cmc/agency-questions). The Overview figure, the per-tab
 *     signposts, the Program records index and AnA's facts all read that one
 *     read, so none of them can disagree with another.
 *   - Every state, overdue verdict and count shown is the server's. Nothing
 *     here computes a date rule or a count of its own.
 *   - Each question has one door: open it on its letter, in Communication
 *     (the navigation-params channel, navParams.ts). Every write and every
 *     signature happens there. CMC issues no write about agency questions.
 *   - The earlier file is shown as read-only history, saying only what its
 *     rows hold: no closure date, no overdue, and a close that was a status
 *     change. It is organization-wide, and nothing moves its rows onto a
 *     letter: a person records one still open there by hand.
 *   - A read that has not settled, or failed, is never taken as "nothing":
 *     the Overview withholds its all-clear until both reads are measured.
 */
import React from 'react';
import { ctdCodeWithin } from '@shared/regulatory/section-code';
import { I } from '../icons';
import { EmptyState, useLiveData, type DataState } from '../dataConnect';
import { stashNavParamsForTarget } from '../navParams';
import { setEditorTarget } from '../editorTarget';
import { openProgramAction } from '../programAction';
import { cmcProjectId } from './cmcShared';
import { RESPONSE_STATE_LABEL, RESPONSE_STATE_TONE, type ResponseState } from './agencyQuestionState';
/* The list classes below (cc-comm-issues) are Communication's; CMC is its own
   lazy chunk, so it loads the stylesheet that defines them rather than relying
   on Communication having been opened first. */
import '../styles/commcenter-v2.css';

type QuestionState = ResponseState;

export interface Module3Letter {
  id: string;
  communicationType: string;
  receivedDate: string | null;
  dueDate: string | null;
  closureStatus: string;
  responseRequired: boolean;
  /** The server's verdict on the whole letter (response-logic letterOverdue). */
  overdue: boolean;
}

export interface Module3Question {
  id: number;
  questionRef: string;
  questionText: string;
  discipline: string | null;
  severity: string;
  ctdSection: string | null;
  section: string | null;
  sectionSource: 'question' | 'letter' | 'discipline';
  state: QuestionState;
  /** The server's one reading of "outstanding": not answered as it stands, on a letter not closed. */
  outstanding: boolean;
  overdue: boolean;
  approval: { signatureId: number; signerName: string; signedAt: string } | null;
  /** Who owns preparing the response, as recorded on the letter; null with none. */
  owner?: { userId: number; name: string | null } | null;
  letter: Module3Letter;
}

export interface Module3Payload {
  module: number;
  today: string;
  questions: Module3Question[];
  /** Module 3 letters with no question to answer recorded; `sections` is empty when only the CMC discipline placed one. */
  lettersWithoutQuestions: Array<Module3Letter & { sections: string[] }>;
  summary: {
    questions: number;
    outstanding: number;
    questionsOverdue: number;
    /** The letters the overdue questions are on. */
    lettersOverdue: number;
    /** Module 3 letters with no question to answer recorded, past their date. */
    lettersWithoutQuestionsOverdue: number;
    /** Module 3 letters overdue only on their other questions: their Module 3 answers stand. */
    lettersOverdueOnOtherQuestions: number;
  };
  notCounted: { unclassifiedOutstanding: number; overdueLettersWithoutQuestions: number };
  /** Letters of this program the person may not see; their questions are neither listed nor counted. */
  withheld: number;
  truncated: boolean;
}

function isModule3Payload(v: unknown): v is Module3Payload {
  const p = v as Module3Payload | null;
  return Boolean(
    p && Array.isArray(p.questions) && Array.isArray(p.lettersWithoutQuestions)
      && p.summary && typeof p.summary.questionsOverdue === 'number' && typeof p.summary.lettersOverdue === 'number'
      && typeof p.summary.lettersWithoutQuestionsOverdue === 'number' && typeof p.summary.lettersOverdueOnOtherQuestions === 'number'
      && p.notCounted && typeof p.withheld === 'number',
  );
}

/** One row of the earlier CMC file, as stored (server/routes/cmc-agency-questions.routes.ts). */
export interface EarlierRow {
  id: number;
  question: string;
  sectionRef: string | null;
  priority: string | null;
  severity: string | null;
  status: string | null;
  region: string | null;
  dueDate: string | null;
  assignedTo: string | null;
  responseDocId: string | null;
  recordedOn: string | null;
  lastChangedOn: string | null;
}

interface EarlierMeta { total: number; notClosed: number; listed: number; truncated: boolean; provisioned: boolean }

const isEarlierRows = (v: unknown): v is EarlierRow[] => Array.isArray(v);
const isEarlierMeta = (m: unknown): m is EarlierMeta =>
  Boolean(m && typeof (m as EarlierMeta).total === 'number' && typeof (m as EarlierMeta).notClosed === 'number');

export const EARLIER_FILE_PATH = '/api/cmc/agency-questions';

export function module3QuestionsPath(projectId: string | null | undefined): string | null {
  return projectId ? `/api/concept2cure/projects/${encodeURIComponent(projectId)}/agency-questions?ctdModule=3` : null;
}

export interface CmcQuestionsRead {
  projectId: string | null;
  module3: DataState<Module3Payload>;
  earlier: DataState<EarlierRow[]>;
}

/** The one read, made at the CMC module's root. */
export function useCmcQuestionsRead(): CmcQuestionsRead {
  const projectId = cmcProjectId() ?? null;
  const path = module3QuestionsPath(projectId);
  const module3 = useLiveData<Module3Payload>(path, [path], isModule3Payload);
  const earlier = useLiveData<EarlierRow[]>(EARLIER_FILE_PATH, [EARLIER_FILE_PATH], isEarlierRows);
  return { projectId, module3, earlier };
}

/** What a component rendered outside the module reads: nothing was read, and it says so. */
const NOT_READ: CmcQuestionsRead = {
  projectId: null,
  module3: { data: null, loading: false, error: 'The agency questions were not read on this screen.', empty: false },
  earlier: { data: null, loading: false, error: 'The earlier CMC question file was not read on this screen.', empty: false },
};

const CmcQuestionsContext = React.createContext<CmcQuestionsRead | null>(null);

export function CmcQuestionsContextProvider({ value, children }: { value: CmcQuestionsRead; children: React.ReactNode }) {
  return <CmcQuestionsContext.Provider value={value}>{children}</CmcQuestionsContext.Provider>;
}

/** Reads once and provides: for a CMC tab rendered on its own (tests, a future host). */
export function CmcQuestionsProvider({ children }: { children: React.ReactNode }) {
  const value = useCmcQuestionsRead();
  return <CmcQuestionsContextProvider value={value}>{children}</CmcQuestionsContextProvider>;
}

export function useCmcQuestions(): CmcQuestionsRead {
  return React.useContext(CmcQuestionsContext) ?? NOT_READ;
}

/* ── The figure the Overview, the signposts and AnA share ─────────────────── */

export interface Module3Figure {
  state: 'no-program' | 'loading' | 'unreadable' | 'ready';
  error?: string;
  questionsOverdue: number;
  /** The letters the overdue questions are on. */
  lettersOverdue: number;
  /** Module 3 letters with no question to answer recorded, past their date. */
  lettersWithoutQuestionsOverdue: number;
  /** Module 3 letters overdue only on their other questions (their Module 3 answers stand). */
  lettersOverdueOnOtherQuestions: number;
  outstanding: number;
  withheld: number;
  /** Outstanding questions with no CTD section: not counted. A count of questions. */
  unclassifiedOutstanding: number;
  /** Overdue letters with neither a question nor a section: not counted. A count of letters, never added to the one above. */
  overdueLettersWithoutQuestions: number;
  /** The sections of the overdue questions, for the narrative. */
  overdueSections: string[];
  /** The letter an "open the overdue letters" action opens first: the most urgent. */
  firstOverdueLetterId: string | null;
}

const ZERO = {
  questionsOverdue: 0, lettersOverdue: 0, lettersWithoutQuestionsOverdue: 0, lettersOverdueOnOtherQuestions: 0,
  outstanding: 0, withheld: 0, unclassifiedOutstanding: 0, overdueLettersWithoutQuestions: 0,
  overdueSections: [] as string[], firstOverdueLetterId: null,
};

export function module3Figure(read: CmcQuestionsRead): Module3Figure {
  if (!read.projectId) return { state: 'no-program', ...ZERO };
  const m = read.module3;
  if (m.loading) return { state: 'loading', ...ZERO };
  if (m.error || !m.data) return { state: 'unreadable', error: m.error ?? 'The agency questions did not load.', ...ZERO };
  const d = m.data;
  const overdue = d.questions.filter((q) => q.overdue);
  const firstOverdueLetterId = overdue[0]?.letter.id ?? d.lettersWithoutQuestions.find((l) => l.overdue)?.id ?? null;
  return {
    state: 'ready',
    questionsOverdue: d.summary.questionsOverdue,
    lettersOverdue: d.summary.lettersOverdue,
    lettersWithoutQuestionsOverdue: d.summary.lettersWithoutQuestionsOverdue,
    lettersOverdueOnOtherQuestions: d.summary.lettersOverdueOnOtherQuestions,
    outstanding: d.summary.outstanding,
    withheld: d.withheld,
    unclassifiedOutstanding: d.notCounted.unclassifiedOutstanding,
    overdueLettersWithoutQuestions: d.notCounted.overdueLettersWithoutQuestions,
    overdueSections: [...new Set(overdue.map((q) => q.section).filter((s): s is string => !!s))],
    firstOverdueLetterId,
  };
}

/** Whether Module 3 has overdue work of its own: an overdue question, or an overdue Module 3 letter with nothing to answer recorded. */
export function module3HasOverdue(f: Module3Figure): boolean {
  return f.state === 'ready' && (f.questionsOverdue > 0 || f.lettersWithoutQuestionsOverdue > 0);
}

/** Where the earlier file's read stands: a failed or unsettled read is never "nothing open". */
export function earlierFileState(read: CmcQuestionsRead): 'loading' | 'unreadable' | 'ready' {
  const e = read.earlier;
  if (e.loading) return 'loading';
  if (e.error || !e.data || !isEarlierMeta(e.meta)) return 'unreadable';
  return 'ready';
}

/** The earlier file's not-closed count, or null when it was not read (loading, failed, or no count returned). */
export function earlierNotClosed(read: CmcQuestionsRead): number | null {
  const e = read.earlier;
  return earlierFileState(read) === 'ready' && isEarlierMeta(e.meta) ? e.meta.notClosed : null;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * What AnA is told about agency questions on the CMC screen: the figure the
 * Overview shows, only once it is measured (a program is open, the read
 * resolved and did not fail), and the earlier file's count once that read is.
 * No figure is a guess, and each count is said as what it counts: questions
 * as questions, letters as letters, never one added to the other.
 */
export function cmcQuestionFacts(read: CmcQuestionsRead): { facts: Record<string, number>; sentence: string } {
  const f = module3Figure(read);
  const facts: Record<string, number> = {};
  let sentence = '';
  if (f.state === 'ready') {
    Object.assign(facts, {
      module3QuestionsOverdue: f.questionsOverdue,
      module3LettersOverdue: f.lettersOverdue,
      module3LettersWithoutQuestionsOverdue: f.lettersWithoutQuestionsOverdue,
      module3LettersOverdueOnOtherQuestions: f.lettersOverdueOnOtherQuestions,
      module3QuestionsOutstanding: f.outstanding,
      module3LettersWithheld: f.withheld,
      module3QuestionsNotCounted: f.unclassifiedOutstanding,
      module3OverdueLettersNotCounted: f.overdueLettersWithoutQuestions,
    });
    const u = f.unclassifiedOutstanding;
    const l = f.overdueLettersWithoutQuestions;
    sentence +=
      ` On this program, ${plural(f.questionsOverdue, 'Module 3 agency question is', 'Module 3 agency questions are')} overdue on ` +
      `${plural(f.lettersOverdue, 'letter', 'letters')}, and ${f.outstanding} ${f.outstanding === 1 ? 'is' : 'are'} outstanding` +
      (f.lettersWithoutQuestionsOverdue
        ? `; ${plural(f.lettersWithoutQuestionsOverdue, 'Module 3 letter is', 'Module 3 letters are')} overdue with no question to answer recorded`
        : '') +
      (f.lettersOverdueOnOtherQuestions
        ? `; ${plural(f.lettersOverdueOnOtherQuestions, 'letter whose Module 3 answers stand is', 'letters whose Module 3 answers stand are')} overdue on other questions`
        : '') +
      (f.withheld ? `; ${plural(f.withheld, 'letter the user cannot open is', 'letters the user cannot open are')} not counted` : '') +
      (u ? `; ${plural(u, 'outstanding question carries', 'outstanding questions carry')} no CTD section and ${u === 1 ? 'is' : 'are'} not counted` : '') +
      (l ? `; ${plural(l, 'overdue letter has', 'overdue letters have')} no question recorded and no section linked, and ${l === 1 ? 'is' : 'are'} not counted` : '') +
      '. Questions are answered and approved on their letter, in Communication.';
  }
  const earlier = earlierNotClosed(read);
  if (earlier !== null) {
    facts.earlierCmcFileNotClosed = earlier;
    if (earlier > 0) {
      sentence +=
        ` The earlier CMC question file (organization-wide, read-only) holds ${plural(earlier, 'question', 'questions')} not closed there;` +
        ' they are not counted, and nothing moves them onto a letter: a person records each one still open on its letter.';
    }
  } else if (earlierFileState(read) === 'unreadable') {
    sentence += ' The earlier CMC question file could not be read; whether it holds questions not closed is not known.';
  }
  return { facts, sentence };
}

/** Open a letter (and one of its questions) in Communication, where it is worked. */
export function openLetterInCommunication(nav: ((id: string) => void) | undefined, letterId: string, questionId?: number): void {
  if (!nav) return;
  stashNavParamsForTarget('communication-center', questionId != null ? { letterId, questionId: String(questionId) } : { letterId });
  nav('communication-center');
}

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null);

function sectionLabel(q: Module3Question): string {
  if (q.section) return q.sectionSource === 'letter' ? `${q.section} (the letter's)` : q.section;
  return q.sectionSource === 'discipline' ? 'CMC discipline, no section' : '—';
}

/**
 * The outstanding questions a tab's own sections are cited by: whole CTD
 * segments, never a string prefix. "Outstanding" is the server's flag, not a
 * rule restated here. `partial` is true when the server listed a page of the
 * program's questions (its cap), so a count of these rows is a lower bound.
 */
export function outstandingAt(read: CmcQuestionsRead, prefixes: readonly string[]): { rows: Module3Question[]; partial: boolean } {
  const d = !read.projectId || read.module3.loading || read.module3.error ? null : read.module3.data;
  if (!d) return { rows: [], partial: false };
  return {
    rows: d.questions.filter((q) => q.section && q.outstanding && prefixes.some((p) => ctdCodeWithin(q.section, p))),
    partial: d.truncated,
  };
}

/** What the view did not count, and the letters overdue on questions that are not Module 3's, said once. */
function NotCountedLines({ d }: { d: Module3Payload }) {
  const lines: string[] = [];
  if (d.withheld > 0) {
    lines.push(
      `${plural(d.withheld, 'letter on this program is', 'letters on this program are')} restricted from you; ` +
        'their questions are not listed or counted here.',
    );
  }
  const u = d.notCounted.unclassifiedOutstanding;
  if (u > 0) {
    lines.push(
      `${plural(u, 'outstanding question on this program carries', 'outstanding questions on this program carry')} no CTD section, ` +
        `so Module 3 cannot tell whether ${u === 1 ? 'it is' : 'they are'} its own; not counted here. ` +
        "Record each question's CTD section on its letter in Communication.",
    );
  }
  const l = d.notCounted.overdueLettersWithoutQuestions;
  if (l > 0) {
    lines.push(`${plural(l, 'overdue letter has', 'overdue letters have')} no question recorded and no section linked; not counted here.`);
  }
  const o = d.summary.lettersOverdueOnOtherQuestions;
  if (o > 0) {
    lines.push(
      `${plural(o, 'letter whose Module 3 answers stand is', 'letters whose Module 3 answers stand are')} overdue on ${o === 1 ? 'its' : 'their'} other questions, ` +
        'which are answered and approved on the letter in Communication.',
    );
  }
  if (!lines.length) return null;
  return (
    <div style={{ padding: '10px 12px 0' }}>
      {lines.map((t) => (
        <div key={t} className="cm-meta" role="note">{t}</div>
      ))}
    </div>
  );
}

/** The question rows, each with its one door. */
function QuestionTable({ questions, nav }: { questions: Module3Question[]; nav?: (id: string) => void }) {
  return (
    <table className="reg-tbl" data-testid="cmc-module3-questions">
      <thead><tr><th>Letter due</th><th>Section</th><th>Ref</th><th>Question</th><th>Letter</th><th>State</th><th>Owner</th><th style={{ textAlign: 'right' }}><span className="sr-only">Open on its letter</span></th></tr></thead>
      <tbody>
        {questions.map((q) => (
          <tr key={q.id}>
            <td style={{ whiteSpace: 'nowrap' }}>
              {day(q.letter.dueDate) ?? <span className="cm-meta">no due date</span>}
              {q.overdue ? <span className="rd-chip tone-err" style={{ marginLeft: 6 }}>overdue</span> : null}
            </td>
            <td className="mono">{sectionLabel(q)}</td>
            <td className="mono">{q.questionRef}</td>
            <td title={q.questionText}>{q.questionText.length > 120 ? q.questionText.slice(0, 120) + '…' : q.questionText}</td>
            <td>{q.letter.communicationType}{q.letter.closureStatus === 'closed' ? <span className="cm-meta"> · closed</span> : null}</td>
            <td><span className={'rd-chip tone-' + RESPONSE_STATE_TONE[q.state]}>{RESPONSE_STATE_LABEL[q.state]}</span></td>
            <td>{q.owner ? (q.owner.name ?? 'a member') : <span className="cm-meta">none set</span>}</td>
            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
              {nav ? (
                <button className="nda-open" title="Open this question on its letter in Communication, where it is answered and approved" onClick={() => openLetterInCommunication(nav, q.letter.id, q.id)}>
                  {I.arrowRight} Open on its letter
                </button>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The module's letters with no question to answer recorded, named so an empty list is not read as "nothing asked". */
function LettersWithoutQuestions({ letters, nav }: { letters: Module3Payload['lettersWithoutQuestions']; nav?: (id: string) => void }) {
  return (
    <div style={{ padding: '10px 12px 0' }}>
      <div className="cm-meta">Module 3 letters with no question to answer recorded (none, or only withdrawn ones)</div>
      <ul className="cc-comm-issues">
        {letters.map((l) => (
          <li key={l.id}>
            <span>{l.communicationType}</span>
            <span className="cm-meta"> · {l.sections.length ? `§${l.sections.join(', §')}` : 'CMC discipline, no section'}{day(l.dueDate) ? ` · due ${day(l.dueDate)}` : ''}</span>
            {l.overdue ? <span className="rd-chip tone-err" style={{ marginLeft: 6 }}>overdue</span> : null}
            {nav ? (
              <button className="nda-open" style={{ marginLeft: 8 }} onClick={() => openLetterInCommunication(nav, l.id)}>
                {I.arrowRight} Open on its letter
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The Program records index: the program's Module 3 questions, read from their
 * letters. Read-only; each row's one door opens it on its letter.
 */
export function CmcModule3QuestionIndex({ nav }: { nav?: (id: string) => void }) {
  const read = useCmcQuestions();
  const m = read.module3;
  const d = m.data;
  let body: React.ReactNode;
  if (!read.projectId) {
    body = (
      <div style={{ padding: 12 }}>
        <EmptyState
          icon={I.globe}
          title="Open a program to see its agency questions"
          hint="Agency questions are recorded on the letters a program receives, in Communication. Module 3 shows the ones about its sections here."
          action={openProgramAction(nav)}
        />
      </div>
    );
  } else if (m.loading) {
    body = <div style={{ padding: 12 }}><EmptyState icon={I.globe} title="Reading this program's agency letters…" busy /></div>;
  } else if (m.error || !d) {
    body = (
      <div style={{ padding: 12 }}>
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't read this program's agency questions"
          hint={`${m.error ?? 'The read did not complete.'} This is a failed read, not an empty list.`}
        />
      </div>
    );
  } else {
    const empty = d.questions.length === 0 && d.lettersWithoutQuestions.length === 0;
    /* What the view could not see or place may hold Module 3 questions, so an
       empty list then speaks only for the letters it read, and claims no all-clear. */
    const partialView = d.withheld > 0 || d.notCounted.unclassifiedOutstanding > 0 || d.notCounted.overdueLettersWithoutQuestions > 0;
    body = (
      <>
        <div className="cm-meta" style={{ padding: '10px 12px 0' }}>
          {d.summary.outstanding} outstanding · {d.summary.questionsOverdue} overdue on {plural(d.summary.lettersOverdue, 'letter', 'letters')}
        </div>
        <NotCountedLines d={d} />
        {empty ? (
          <div style={{ padding: 12 }}>
            <EmptyState
              icon={partialView ? I.globe : I.shieldCheck}
              title={partialView
                ? 'No Module 3 questions are recorded on the letters read here'
                : "No Module 3 questions are recorded on this program's letters"}
              hint="Agency questions are recorded on the letter they came in, in Communication, with the CTD section they concern. Those about §3 are listed here."
            />
          </div>
        ) : null}
        {d.questions.length > 0 && <QuestionTable questions={d.questions} nav={nav} />}
        {d.lettersWithoutQuestions.length > 0 && <LettersWithoutQuestions letters={d.lettersWithoutQuestions} nav={nav} />}
        {d.truncated && (
          <div className="cm-meta" style={{ padding: '6px 12px 0' }}>
            Showing the first {d.questions.length} of {d.summary.questions} questions; the counts above are of all of them.
          </div>
        )}
        <div className="cm-meta" style={{ padding: '8px 12px 12px' }}>
          Questions are recorded, answered and approved on their letter, in Communication. This list is read from there and changes nothing.
        </div>
      </>
    );
  }
  return (
    <div className="pj-card" style={{ marginBottom: 16 }}>
      <div className="pj-card-h">
        <span className="t">Agency questions on Module 3</span>
        <span className="s">read from this program's letters in Communication</span>
      </div>
      <div className="pj-card-b" style={{ padding: 0 }}>{body}</div>
    </div>
  );
}

const isClosed = (status: string | null) => (status ?? '').toUpperCase() === 'CLOSED';

/**
 * The earlier CMC question file, as read-only history. Says only what each row
 * holds; renders nothing when the file holds nothing; a failed read is said.
 */
export function CmcEarlierQuestionFile({ nav }: { nav?: (id: string) => void }) {
  const read = useCmcQuestions();
  const e = read.earlier;
  if (e.loading) {
    return <div role="status" className="cm-meta" style={{ marginBottom: 16 }}>Reading the earlier CMC question file…</div>;
  }
  if (e.error || !e.data) {
    return (
      <div className="pj-card" style={{ marginBottom: 16 }}>
        <div className="pj-card-b">
          <div className="sp-tone-err" role="alert" style={{ fontSize: 12.5 }}>
            The earlier CMC question file could not be read. Whether it holds questions is not known.
          </div>
        </div>
      </div>
    );
  }
  const meta = isEarlierMeta(e.meta) ? e.meta : null;
  const rows = e.data;
  if (rows.length === 0 && (!meta || meta.total === 0)) return null;
  const total = meta?.total ?? rows.length;
  return (
    <div className="pj-card" style={{ marginBottom: 16 }}>
      <div className="pj-card-h">
        <span className="t">Earlier CMC question file</span>
        <span className="s">read-only history, organization-wide</span>
      </div>
      <div className="pj-card-b">
        <p className="cm-meta">
          Questions recorded in CMC, across the organization, before agency questions moved onto the letter (2026-10-19).
          This file is read-only. Nothing moves these onto a letter: record a question still open here on its letter in
          Communication, by hand.
        </p>
        <p className="cm-meta">
          {total} recorded · {meta ? meta.notClosed : '—'} not closed in the earlier file. These are not counted in Module 3's figures.
        </p>
        <details>
          <summary>Show the {rows.length} recorded question{rows.length === 1 ? '' : 's'}</summary>
          <ul className="cc-comm-issues">
            {rows.map((r) => (
              <li key={r.id}>
                <div>{r.question}</div>
                <div className="cm-meta">
                  {r.sectionRef ? `§${r.sectionRef}` : 'no section recorded'}
                  {r.dueDate ? ` · due ${r.dueDate} as recorded in this file` : ''}
                  {r.assignedTo ? ` · assigned to ${r.assignedTo} (free text)` : ''}
                </div>
                <div className="cm-meta">
                  Recorded {r.recordedOn ?? 'on a date not recorded'}; status {r.status ?? 'none recorded'}, last changed {r.lastChangedOn ?? '—'}.
                </div>
                {isClosed(r.status) ? (
                  <div className="cm-meta">Closed by a status change, not a signed approval.</div>
                ) : (
                  <div className="cm-meta">
                    Record it on its letter in Communication. It will still read {r.status ?? 'no status'} here: nothing writes this file any more.
                  </div>
                )}
                {r.responseDocId && nav ? (
                  <button
                    className="nda-open"
                    title="Open the authoring document this row links to. It is a draft, not an approved response."
                    onClick={() => {
                      setEditorTarget({ docType: null, docId: r.responseDocId });
                      nav('document-authoring');
                    }}
                  >
                    {I.fileText} Linked draft document (not an approved response)
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
        {meta?.truncated ? <p className="cm-meta">Showing the {rows.length} listed of {total}.</p> : null}
      </div>
    </div>
  );
}
