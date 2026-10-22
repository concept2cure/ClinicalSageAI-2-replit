/**
 * What CMC / Module 3 reads about agency questions since 2026-10-19: Module 3's
 * view of the program's letters (GET /api/concept2cure/projects/:projectId/
 * agency-questions?ctdModule=3, the server's states and overdue verdict), and
 * the earlier CMC question file as read-only history (GET /api/cmc/agency-questions).
 */
import {
  agencyResponseDigest,
  questionApproval,
  type QuestionRecord,
  type ResponseSignature,
} from '../../../../../server/services/agency-responses/response-logic';
import { moduleQuestionsView, type ViewLetter, type ViewQuestion } from '../../../../../server/services/agency-responses/module-view';

export const PROGRAM = '3c1f8a2e-7b4d-4e9a-8c21-5d6e7f8a9b0c';
export const MODULE3_PATH = `/api/concept2cure/projects/${PROGRAM}/agency-questions?ctdModule=3`;
export const EARLIER_PATH = '/api/cmc/agency-questions';

type State = 'unanswered' | 'drafted' | 'changed-after-approval' | 'approved' | 'withdrawn';

export const letterOf = (over: Record<string, unknown> = {}) => ({
  id: 'ace_7',
  communicationType: 'Information request 4',
  receivedDate: '2026-09-20T09:00:00.000Z',
  dueDate: '2026-10-01T00:00:00.000Z',
  closureStatus: 'open',
  responseRequired: true,
  overdue: true,
  ...over,
});

let nextId = 100;
/** One question on a letter, as the server lists it for Module 3. */
export const m3Question = (section: string | null, over: Record<string, unknown> = {}) => {
  nextId += 1;
  return {
    id: nextId,
    questionRef: `Q${nextId - 100}`,
    questionText: 'Please justify the proposed change and provide comparability data for the affected material.',
    discipline: 'CMC',
    severity: 'major',
    ctdSection: section,
    section,
    sectionSource: section ? 'question' : 'discipline',
    state: 'unanswered' as State,
    outstanding: true,
    overdue: true,
    approval: null,
    letter: letterOf(),
    ...over,
  };
};

type Row = ReturnType<typeof m3Question>;
type LetterLike = { id: string; overdue: boolean; closureStatus: string };
const letterOfRow = (q: Row) => q.letter as LetterLike;

/**
 * Module 3's view; the summary is computed from the rows unless given, by the
 * server's meaning of each count (module-view.ts): the letters the overdue
 * questions are on, and, apart, letters overdue only on their other questions.
 * `serverModule3` below runs the server's own function where a case turns on it.
 */
export const module3 = (questions: Row[], over: Record<string, unknown> = {}) => {
  const lettersWithoutQuestions = (over.lettersWithoutQuestions as LetterLike[] | undefined) ?? [];
  const late = new Set(questions.filter((q) => q.overdue).map((q) => letterOfRow(q).id));
  const otherwise = new Set(questions.filter((q) => letterOfRow(q).overdue && !late.has(letterOfRow(q).id)).map((q) => letterOfRow(q).id));
  return {
    module: 3,
    today: '2026-10-19',
    questions,
    lettersWithoutQuestions,
    summary: {
      questions: questions.length,
      outstanding: questions.filter((q) => q.outstanding).length,
      questionsOverdue: questions.filter((q) => q.overdue).length,
      lettersOverdue: late.size,
      lettersWithoutQuestionsOverdue: lettersWithoutQuestions.filter((l) => l.overdue).length,
      lettersOverdueOnOtherQuestions: otherwise.size,
      byState: { unanswered: 0, drafted: 0, 'changed-after-approval': 0, approved: 0, withdrawn: 0 },
    },
    notCounted: { unclassifiedOutstanding: 0, overdueLettersWithoutQuestions: 0 },
    withheld: 0,
    truncated: false,
    ...over,
  };
};

/* ── The server's own view, for the cases that turn on its counting ──────── */

function serverRecord(id: number, eventId: string, state: State): QuestionRecord & { approval: ReturnType<typeof questionApproval> } {
  const base: QuestionRecord = {
    id,
    communicationEventId: eventId,
    questionRef: `Q${id}`,
    questionText: 'Provide the dissolution method validation report.',
    responseText: state === 'unanswered' ? '' : 'Provided in 3.2.P.5.3.',
    responseRevision: state === 'unanswered' ? 0 : 1,
    responseUpdatedBy: state === 'unanswered' ? null : 7,
    withdrawn: state === 'withdrawn',
  };
  const signed = (boundDigest: string): ResponseSignature =>
    ({ id: 90 + id, boundDigest, signerId: 9, signerName: 'Dana Reyes', signedAt: '2026-10-18T10:00:00.000Z', meaning: 'approval' });
  const sigs: ResponseSignature[] = state === 'approved'
    ? [signed(agencyResponseDigest(base))]
    : state === 'changed-after-approval' ? [signed('f'.repeat(64))] : [];
  const approval = questionApproval(base, sigs);
  if (approval.state !== state) throw new Error(`fixture: wanted ${state}, the server derives ${approval.state}`);
  return { ...base, approval };
}

/** A letter, and its questions, as the database holds them. */
export interface ServerLetter {
  eventId: string;
  communicationType?: string;
  dueDate?: string | null;
  closureStatus?: string;
  responseRequired?: boolean;
  linkedSectionCodes?: string[];
  questions: Array<{ id: number; state: State; ctdSection?: string | null; discipline?: string | null }>;
}

/** GET …/agency-questions?ctdModule=3 exactly as the route builds it: the server's moduleQuestionsView over these letters. */
export function serverModule3(letters: ServerLetter[], today = '2026-10-19', withheld = 0) {
  const viewLetters: ViewLetter[] = letters.map((l) => ({
    eventId: l.eventId,
    communicationType: l.communicationType ?? 'Information request 4',
    receivedDate: '2026-09-20T09:00:00.000Z',
    dueDate: l.dueDate === undefined ? '2026-10-10T00:00:00.000Z' : l.dueDate,
    closureStatus: l.closureStatus ?? 'open',
    responseRequired: l.responseRequired ?? true,
    linkedSectionCodes: l.linkedSectionCodes ?? [],
  }));
  const questions: ViewQuestion[] = letters.flatMap((l) =>
    l.questions.map((q) => ({
      ...serverRecord(q.id, l.eventId, q.state),
      ctdSection: q.ctdSection ?? null,
      discipline: q.discipline ?? null,
      severity: 'major',
    })),
  );
  return { module: 3, today, ...moduleQuestionsView({ letters: viewLetters, questions, module: 3, today }), withheld };
}

/** One row of the earlier CMC file, as stored. */
export const earlierRow = (over: Record<string, unknown> = {}) => ({
  id: 9,
  question: 'Clarify the shelf-life claim.',
  sectionRef: '3.2.P.8.1',
  priority: 'medium',
  severity: 'MAJOR',
  status: 'OPEN',
  region: 'FDA',
  dueDate: '2026-09-03',
  assignedTo: null,
  responseDocId: null,
  recordedOn: '2026-08-24',
  lastChangedOn: '2026-09-02',
  ...over,
});

export const earlier = (rows: unknown[], meta: Record<string, unknown> = {}) => ({
  success: true,
  data: rows,
  meta: { total: rows.length, notClosed: 0, listed: rows.length, truncated: false, provisioned: true, ...meta },
});

/** A live board with one submission. It carries no agency correspondence any more. */
export const board = () => ({
  portfolio: [{ sub: 'BLA 761234', product: 'Compound A', region: 'FDA', type: 'BLA', rpi: 82, ir: null, source: 'spine' }],
  sections: null,
  kpis: { submissions: 1, rpiAverage: 82, sectionsApproved: null, sectionsTotal: null, readyPercent: null },
  meta: { projectId: null, portfolioProvisioned: true, sectionsProvisioned: null, generatedAt: '2026-10-19T00:00:00.000Z' },
});
