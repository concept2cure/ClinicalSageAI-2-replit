/**
 * CMC / Module 3's view of the project inbox's agency questions (2026-10-19,
 * rows D2 and D5; decisions P-38, P-39 item 1). Pure, no DB.
 *
 * ── What these pin ───────────────────────────────────────────────────────────
 *   • Overdue has ONE definition, the server's, and it is a property of a
 *     letter: a response-required letter, not closed, past its due date (UTC
 *     calendar day), whose questions are not all approved as they stand
 *     (closeRefusal). An approved answer is never overdue; a letter due today
 *     is not overdue; a letter with no due date is not overdue; a closed letter
 *     is not overdue. A response-required letter with no question recorded IS
 *     overdue past its date: nothing recorded is not answered.
 *   • A question belongs to a CTD module by its own section first, then by the
 *     letter's linked section codes (normalised by the repository's one rule,
 *     codes that do not parse ignored), then, for Module 3 only, by the CMC
 *     discipline. One that has none of them is counted as unclassified, never
 *     dropped. Section membership is by whole segment: 3.2.P.5 is not 3.2.P.50.
 *   • The counts come from every row the server read, not from the listed page.
 */
import { describe, expect, it } from 'vitest';
import { normalizeCtdCode, ctdCodeWithin } from '../../../../shared/regulatory/section-code';
import {
  agencyResponseDigest,
  letterOverdue,
  questionApproval,
  questionOverdue,
  utcDay,
  type QuestionRecord,
  type ResponseSignature,
} from '../response-logic';
import { classifyForModule, moduleQuestionsView, type ViewLetter, type ViewQuestion } from '../module-view';
import { CTD_SECTION_CASES } from './ctd-section-cases';

const TODAY = '2026-10-19';

function record(over: Partial<QuestionRecord> = {}): QuestionRecord {
  return {
    id: 1,
    communicationEventId: 'ace_1',
    questionRef: 'Q1',
    questionText: 'Provide the dissolution method validation report.',
    responseText: '',
    responseRevision: 0,
    responseUpdatedBy: null,
    ...over,
  };
}

/** A question in a given state, as the server derives it from the record and the signatures. */
function inState(state: 'unanswered' | 'drafted' | 'approved' | 'changed-after-approval' | 'withdrawn', over: Partial<QuestionRecord> = {}) {
  const base = record({ ...(state === 'unanswered' ? {} : { responseText: 'Provided in 3.2.P.5.3.', responseRevision: 1, responseUpdatedBy: 7 }), ...over, withdrawn: state === 'withdrawn' });
  const sigs: ResponseSignature[] = [];
  if (state === 'approved') sigs.push({ id: 90, boundDigest: agencyResponseDigest(base), signerId: 9, signerName: 'Dana Reyes', signedAt: '2026-10-18T10:00:00.000Z', meaning: 'approval' });
  if (state === 'changed-after-approval') sigs.push({ id: 91, boundDigest: 'f'.repeat(64), signerId: 9, signerName: 'Dana Reyes', signedAt: '2026-10-18T10:00:00.000Z', meaning: 'approval' });
  const q = { ...base, approval: questionApproval(base, sigs) };
  expect(q.approval.state).toBe(state);
  return q;
}

function letter(over: Partial<ViewLetter> = {}): ViewLetter {
  return {
    eventId: 'ace_1',
    communicationType: 'Information request',
    receivedDate: '2026-10-01T09:00:00.000Z',
    dueDate: '2026-10-10T00:00:00.000Z',
    closureStatus: 'open',
    responseRequired: true,
    linkedSectionCodes: [],
    ...over,
  };
}

function vq(id: number, eventId: string, state: Parameters<typeof inState>[0], over: Partial<ViewQuestion> = {}): ViewQuestion {
  const s = inState(state, { id, communicationEventId: eventId, questionRef: `Q${id}` });
  return { ...s, ctdSection: null, discipline: null, severity: 'major', ...over } as ViewQuestion;
}

describe('the CTD section rule is the repository one (shared case table with the SQL CHECK)', () => {
  it.each(CTD_SECTION_CASES)('%j is stored as %j', (typed, stored) => {
    expect(normalizeCtdCode(typed)).toBe(stored);
  });

  it('every stored form matches the CHECK the migration declares', () => {
    const check = /^[1-5](\.[0-9A-Z]+)*$/;
    for (const [, stored] of CTD_SECTION_CASES) if (stored) expect(check.test(stored) && stored.length <= 40, stored).toBe(true);
  });

  it('membership is by whole segment: 3.2.P.5 holds 3.2.P.5.1, not 3.2.P.50', () => {
    expect(ctdCodeWithin('3.2.P.5.1', '3.2.P.5')).toBe(true);
    expect(ctdCodeWithin('3.2.P.5', '3.2.P.5')).toBe(true);
    expect(ctdCodeWithin('3.2.P.50', '3.2.P.5')).toBe(false);
    expect(ctdCodeWithin('m3.2.p.5.1', '3.2.P.5')).toBe(true);
    expect(ctdCodeWithin('3.2.S.1', '3')).toBe(true);
    expect(ctdCodeWithin('2.3.S', '3')).toBe(false);
    expect(ctdCodeWithin('not a code', '3')).toBe(false);
  });
});

describe('utcDay', () => {
  it('reads the stored instant as its UTC calendar day, and nothing for no date', () => {
    expect(utcDay('2026-10-19T23:30:00.000Z')).toBe('2026-10-19');
    expect(utcDay('2026-10-19T23:30:00-05:00')).toBe('2026-10-20');
    expect(utcDay('2026-10-19')).toBe('2026-10-19');
    expect(utcDay(null)).toBeNull();
    expect(utcDay('not a date')).toBeNull();
  });
});

describe('letterOverdue — one definition, the server\'s', () => {
  const past = { responseRequired: true, closureStatus: 'open', dueDate: '2026-10-10T00:00:00.000Z' };

  it('a response-required letter past its date with an unanswered question is overdue', () => {
    expect(letterOverdue(past, [inState('unanswered')], TODAY)).toBe(true);
    expect(letterOverdue(past, [inState('drafted')], TODAY)).toBe(true);
    expect(letterOverdue(past, [inState('changed-after-approval')], TODAY)).toBe(true);
  });

  it('a letter whose questions are all approved is not overdue, though it is not yet closed', () => {
    expect(letterOverdue(past, [inState('approved', { id: 1 }), inState('approved', { id: 2, questionRef: 'Q2' })], TODAY)).toBe(false);
    expect(letterOverdue(past, [inState('approved'), inState('withdrawn', { id: 2, questionRef: 'Q2' })], TODAY)).toBe(false);
  });

  it('a response-required letter with no question recorded is overdue past its date (nothing recorded is not answered)', () => {
    expect(letterOverdue(past, [], TODAY)).toBe(true);
    expect(letterOverdue(past, [inState('withdrawn')], TODAY)).toBe(true);
  });

  it('due today is not overdue; a due date late on the UTC day is still that day', () => {
    expect(letterOverdue({ ...past, dueDate: '2026-10-19T00:00:00.000Z' }, [inState('unanswered')], TODAY)).toBe(false);
    expect(letterOverdue({ ...past, dueDate: '2026-10-18T23:59:59.000Z' }, [inState('unanswered')], TODAY)).toBe(true);
  });

  it('no due date, a closed letter, or a letter needing no response is never overdue', () => {
    expect(letterOverdue({ ...past, dueDate: null }, [inState('unanswered')], TODAY)).toBe(false);
    expect(letterOverdue({ ...past, closureStatus: 'closed' }, [inState('unanswered')], TODAY)).toBe(false);
    expect(letterOverdue({ ...past, responseRequired: false }, [inState('unanswered')], TODAY)).toBe(false);
  });

  it('a question is overdue only when its letter is and it is not answered as it stands', () => {
    expect(questionOverdue(true, 'unanswered')).toBe(true);
    expect(questionOverdue(true, 'drafted')).toBe(true);
    expect(questionOverdue(true, 'changed-after-approval')).toBe(true);
    expect(questionOverdue(true, 'approved')).toBe(false);
    expect(questionOverdue(true, 'withdrawn')).toBe(false);
    expect(questionOverdue(false, 'unanswered')).toBe(false);
  });
});

describe('classifyForModule — the question\'s section, then the letter\'s, then (Module 3) the CMC discipline', () => {
  it('the question\'s own section decides, even against the letter and the discipline', () => {
    expect(classifyForModule({ ctdSection: '3.2.P.7', discipline: null }, ['5.3.5'], 3)).toEqual({ classified: true, inModule: true, section: '3.2.P.7', source: 'question' });
    expect(classifyForModule({ ctdSection: '2.3.P', discipline: 'CMC' }, ['3.2.P.5'], 3)).toMatchObject({ classified: true, inModule: false, source: 'question' });
  });

  it('then the letter\'s codes, normalised; codes that do not parse are ignored', () => {
    expect(classifyForModule({ ctdSection: null, discipline: null }, ['m3.2.p.5', 'not a code'], 3)).toEqual({ classified: true, inModule: true, section: '3.2.P.5', source: 'letter' });
    expect(classifyForModule({ ctdSection: null, discipline: null }, ['5.3.5.1'], 3)).toMatchObject({ classified: true, inModule: false, source: 'letter' });
    expect(classifyForModule({ ctdSection: null, discipline: null }, ['not a code', 42, null], 3)).toMatchObject({ classified: false, inModule: false, source: null });
  });

  it('then, for Module 3 only, the CMC discipline (any case), with no section claimed', () => {
    expect(classifyForModule({ ctdSection: null, discipline: 'cmc' }, [], 3)).toEqual({ classified: true, inModule: true, section: null, source: 'discipline' });
    expect(classifyForModule({ ctdSection: null, discipline: 'CMC' }, [], 2)).toMatchObject({ classified: false, inModule: false });
    expect(classifyForModule({ ctdSection: null, discipline: 'Clinical' }, [], 3)).toMatchObject({ classified: false, inModule: false, source: null });
  });

  it('whole segments: a question at 3.2.P.50 is in Module 3, and a letter at 30.1 is not a code', () => {
    expect(classifyForModule({ ctdSection: '3.2.P.50', discipline: null }, [], 3)).toMatchObject({ inModule: true });
    expect(classifyForModule({ ctdSection: null, discipline: null }, ['30.1'], 3)).toMatchObject({ classified: false });
  });
});

describe('moduleQuestionsView — Module 3\'s view of a program\'s letters', () => {
  const overdue = letter({ eventId: 'ace_late' });
  const current = letter({ eventId: 'ace_now', dueDate: '2026-11-30T00:00:00.000Z' });
  const closed = letter({ eventId: 'ace_closed', closureStatus: 'closed' });

  it('an approved answer on an overdue letter is never counted overdue; the unanswered one beside it is', () => {
    const v = moduleQuestionsView({
      letters: [overdue],
      questions: [vq(1, 'ace_late', 'approved', { ctdSection: '3.2.P.7' }), vq(2, 'ace_late', 'unanswered', { ctdSection: '3.2.S.4.1' })],
      module: 3,
      today: TODAY,
    });
    expect(v.questions.map((q) => [q.questionRef, q.state, q.overdue])).toEqual([
      ['Q2', 'unanswered', true],
      ['Q1', 'approved', false],
    ]);
    expect(v.summary).toMatchObject({ questions: 2, outstanding: 1, questionsOverdue: 1, lettersOverdue: 1 });
    expect(v.questions[0].letter).toMatchObject({ id: 'ace_late', overdue: true });
  });

  it('the letter is overdue on ALL its questions, the module\'s count is of the module\'s: a Clinical question keeps a CMC letter overdue, and Module 3 does not call it its own', () => {
    const v = moduleQuestionsView({
      letters: [overdue],
      questions: [vq(1, 'ace_late', 'approved', { ctdSection: '3.2.P.7' }), vq(2, 'ace_late', 'unanswered', { ctdSection: '5.3.5.1' })],
      module: 3,
      today: TODAY,
    });
    expect(v.questions.map((q) => q.questionRef)).toEqual(['Q1']);
    expect(v.questions[0].letter.overdue).toBe(true);
    expect(v.questions[0].overdue).toBe(false);
    // Review of 2026-10-19: the approved Module 3 answer is the only Module 3
    // content on this letter. The letter is not one of Module 3's overdue
    // letters, nor one with nothing recorded on it; it is overdue on its other
    // questions, and said so by that count alone.
    expect(v.summary).toMatchObject({
      questions: 1, outstanding: 0, questionsOverdue: 0,
      lettersOverdue: 0, lettersWithoutQuestionsOverdue: 0, lettersOverdueOnOtherQuestions: 1,
    });
    expect(v.lettersWithoutQuestions).toEqual([]);
  });

  it('each overdue letter lands in one count: questions overdue on 1 letter, another overdue on its other questions', () => {
    const v = moduleQuestionsView({
      letters: [letter({ eventId: 'ace_a' }), letter({ eventId: 'ace_b' })],
      questions: [
        vq(1, 'ace_a', 'unanswered', { ctdSection: '3.2.P.7' }),
        vq(2, 'ace_b', 'approved', { ctdSection: '3.2.S.4.1' }),
        vq(3, 'ace_b', 'unanswered', { discipline: 'Clinical' }),
      ],
      module: 3,
      today: TODAY,
    });
    expect(v.summary).toMatchObject({ questionsOverdue: 1, lettersOverdue: 1, lettersWithoutQuestionsOverdue: 0, lettersOverdueOnOtherQuestions: 1 });
    expect(v.notCounted).toEqual({ unclassifiedOutstanding: 1, overdueLettersWithoutQuestions: 0 });
  });

  it('decides "outstanding" once, per question: not answered as it stands, on a letter not closed', () => {
    const v = moduleQuestionsView({
      letters: [letter({ eventId: 'ace_open' }), letter({ eventId: 'ace_shut', closureStatus: 'closed' })],
      questions: [
        vq(1, 'ace_open', 'drafted', { ctdSection: '3.2.P.7' }),
        vq(2, 'ace_open', 'approved', { ctdSection: '3.2.P.7' }),
        vq(3, 'ace_shut', 'unanswered', { ctdSection: '3.2.P.7' }),
      ],
      module: 3,
      today: TODAY,
    });
    expect(Object.fromEntries(v.questions.map((q) => [q.questionRef, q.outstanding]))).toEqual({ Q1: true, Q2: false, Q3: false });
    expect(v.summary.outstanding).toBe(1);
  });

  it('a Module 3 letter whose only question is withdrawn is named once, as a letter with nothing to answer, never also "not counted"', () => {
    const v = moduleQuestionsView({
      letters: [overdue],
      questions: [vq(1, 'ace_late', 'withdrawn', { ctdSection: '3.2.P.7' })],
      module: 3,
      today: TODAY,
    });
    expect(v.questions.map((q) => [q.questionRef, q.state, q.overdue])).toEqual([['Q1', 'withdrawn', false]]);
    expect(v.lettersWithoutQuestions.map((l) => [l.id, l.overdue, l.sections])).toEqual([['ace_late', true, ['3.2.P.7']]]);
    expect(v.summary).toMatchObject({ lettersOverdue: 0, lettersWithoutQuestionsOverdue: 1, lettersOverdueOnOtherQuestions: 0 });
    expect(v.notCounted).toEqual({ unclassifiedOutstanding: 0, overdueLettersWithoutQuestions: 0 });
  });

  it('a letter whose only question is withdrawn and placed in another module is that module\'s, not "not counted"', () => {
    const v = moduleQuestionsView({
      letters: [overdue],
      questions: [vq(1, 'ace_late', 'withdrawn', { ctdSection: '5.3.5.1' })],
      module: 3,
      today: TODAY,
    });
    expect(v.lettersWithoutQuestions).toEqual([]);
    expect(v.notCounted).toEqual({ unclassifiedOutstanding: 0, overdueLettersWithoutQuestions: 0 });
  });

  it('counts an outstanding question it cannot classify, rather than dropping it', () => {
    const v = moduleQuestionsView({
      letters: [current],
      questions: [vq(1, 'ace_now', 'unanswered', { discipline: 'Regulatory' }), vq(2, 'ace_now', 'drafted', { discipline: 'CMC' })],
      module: 3,
      today: TODAY,
    });
    expect(v.questions.map((q) => [q.questionRef, q.section, q.sectionSource])).toEqual([['Q2', null, 'discipline']]);
    expect(v.notCounted).toEqual({ unclassifiedOutstanding: 1, overdueLettersWithoutQuestions: 0 });
  });

  it('a Module 3 letter with no question recorded is named; an overdue one it cannot classify is counted as not counted', () => {
    const v = moduleQuestionsView({
      letters: [letter({ eventId: 'ace_m3', linkedSectionCodes: ['3.2.P.5'] }), letter({ eventId: 'ace_bare' }), letter({ eventId: 'ace_m5', linkedSectionCodes: ['5.3.5'] })],
      questions: [],
      module: 3,
      today: TODAY,
    });
    expect(v.lettersWithoutQuestions.map((l) => [l.id, l.overdue, l.sections])).toEqual([['ace_m3', true, ['3.2.P.5']]]);
    // Counted once, as what it is: a letter with nothing recorded, not a letter its questions are overdue on.
    expect(v.summary).toMatchObject({ lettersOverdue: 0, lettersWithoutQuestionsOverdue: 1, questionsOverdue: 0 });
    expect(v.notCounted).toEqual({ unclassifiedOutstanding: 0, overdueLettersWithoutQuestions: 1 });
  });

  it('a closed letter\'s questions are listed after the open ones and are neither outstanding nor overdue', () => {
    const v = moduleQuestionsView({
      letters: [closed, current],
      questions: [vq(1, 'ace_closed', 'drafted', { ctdSection: '3.2.P.7' }), vq(2, 'ace_now', 'drafted', { ctdSection: '3.2.P.8' })],
      module: 3,
      today: TODAY,
    });
    expect(v.questions.map((q) => [q.questionRef, q.overdue])).toEqual([['Q2', false], ['Q1', false]]);
    expect(v.summary).toMatchObject({ outstanding: 1, questionsOverdue: 0, lettersOverdue: 0 });
  });

  it('carries the owner recorded on the letter, and none when none is', () => {
    const v = moduleQuestionsView({
      letters: [current],
      questions: [vq(1, 'ace_now', 'drafted', { ctdSection: '3.2.P.7', ownerUserId: 41, ownerName: 'Ines Okafor' }), vq(2, 'ace_now', 'unanswered', { ctdSection: '3.2.P.8' })],
      module: 3,
      today: TODAY,
    });
    expect(Object.fromEntries(v.questions.map((q) => [q.questionRef, q.owner]))).toEqual({ Q1: { userId: 41, name: 'Ines Okafor' }, Q2: null });
  });

  it('lists a page and counts the whole: the summary is of every row read', () => {
    const qs = Array.from({ length: 5 }, (_, i) => vq(i + 1, 'ace_late', 'unanswered', { ctdSection: '3.2.P.7' }));
    const v = moduleQuestionsView({ letters: [overdue], questions: qs, module: 3, today: TODAY, listCap: 2 });
    expect(v.questions).toHaveLength(2);
    expect(v.truncated).toBe(true);
    expect(v.summary).toMatchObject({ questions: 5, outstanding: 5, questionsOverdue: 5 });
  });
});
