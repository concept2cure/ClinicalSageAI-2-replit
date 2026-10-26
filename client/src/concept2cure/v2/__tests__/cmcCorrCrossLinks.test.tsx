// @vitest-environment jsdom
/**
 * CMC / Module 3's agency questions, at render level, since they converged
 * onto the letter's record (2026-10-19, rows D2 and D5; decisions P-38 and
 * P-39 item 1).
 *
 * ── The gap ───────────────────────────────────────────────────────────────────
 * CMC kept a second home for agency questions: the reg_questions file, where a
 * question was logged, assigned, sent for review, drafted into an authoring
 * document and CLOSED by status update, with no signature and no reason, and
 * an overdue count by its own rule. The questions have one home, the letter
 * they came in, worked in Communication and Respond, where a response is
 * approved by a Part 11 signature.
 *
 * ── What must be true ─────────────────────────────────────────────────────────
 *   • CMC reads the program's letters (one read at the module root) and shows
 *     Module 3's view of them: the server's states, the server's overdue
 *     verdict, counts by letter, what it could not count and why;
 *   • every question has one door, "Open on its letter", the navigation-params
 *     channel into Communication; CMC offers no write of its own and issues
 *     none (no POST, PUT or PATCH to /api/cmc/agency-questions or to any
 *     agency-communications path, checked after every case);
 *   • the Overview's figure is per program, '—' when no program is open or the
 *     read failed, never 0 for "not read"; its action opens the overdue letter
 *     in Communication rather than asking AnA to draft or promising sign-offs;
 *   • a section signpost matches whole segments (3.2.S.2 is not 3.2.S.20);
 *   • the earlier CMC file is shown as read-only history, saying only what its
 *     rows hold: no closure date, no overdue, a close that was a status change.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async original => ({
  ...(await original<typeof import('@/services/portal/authService')>()),
  useAuth: () => ({ user: { id: '7', email: 'lead@example.test', displayName: 'R. Lead' } }),
}));
vi.mock('../navEntitlements', () => ({ useNavEntitlements: () => ({ launchScopeEnforced: false }) }));

import { CmOverview, CmChange, CmPathway } from '../surfaces/CmcModule';
import { CmcQuestionsProvider } from '../surfaces/cmcAgencyQuestions';
import { consumeEditorTarget } from '../editorTarget';
import { board, earlier, earlierRow, letterOf, m3Question, module3, serverModule3, EARLIER_PATH, MODULE3_PATH, PROGRAM } from './cmcCorrCrossLinks.fixtures';

function res(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

const calls = () => apiRequest.mock.calls as Array<[string, string, unknown?]>;
const module3Reads = () => calls().filter(([m, u]) => m === 'GET' && u.includes('/agency-questions?ctdModule='));
/** Any write CMC might make about agency questions: there must never be one. */
const questionWrites = () =>
  calls().filter(([m, u]) => m !== 'GET' && (u.startsWith('/api/cmc/agency-questions') || /^\/api\/concept2cure\/projects\/[^/]+\/agency-communications/.test(u)));

interface Wiring {
  module3?: unknown | 'error';
  earlier?: unknown | 'error';
}
function wire(w: Wiring) {
  apiRequest.mockImplementation(async (m: string, u: string) => {
    if (m === 'GET' && u === MODULE3_PATH) {
      if (w.module3 === 'error') throw Object.assign(new Error('The agency questions could not be read.'), { status: 500 });
      return res({ success: true, data: w.module3 ?? module3([]) });
    }
    if (m === 'GET' && u === EARLIER_PATH) {
      if (w.earlier === 'error') throw Object.assign(new Error('The earlier CMC question file could not be read.'), { status: 500 });
      return res(w.earlier ?? earlier([]));
    }
    if (m === 'GET' && u.startsWith('/api/cmc/module3-board')) return res({ success: true, data: board() });
    if (m === 'POST' && u === '/api/cmc/variations/classify') return res({ success: true, data: { fdaReportingCategory: 'pas', emaVariationCategory: 'type_ii', rationale: ['Recorded site change'], validationRequirements: ['Review comparability'], impactedCtdSections: ['3.2.S.2'], citations: ['21 CFR 314.70'] } });
    return res({ success: true, data: [] });
  });
}

type CmWindow = { __cmSetTab?: (id: string) => void; C2C_NAV_PARAMS?: { surfaceId: string; params: Record<string, string> } };
const setProject = (p: unknown) => { (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = p; };
const inModule = (el: React.ReactElement) => render(<CmcQuestionsProvider>{el}</CmcQuestionsProvider>);
const navParams = () => (window as unknown as CmWindow).C2C_NAV_PARAMS;

beforeEach(() => {
  apiRequest.mockReset();
  setProject({ id: PROGRAM });
});
afterEach(() => {
  // CMC writes nothing about agency questions, in any case below.
  expect(questionWrites()).toEqual([]);
  cleanup();
  delete (window as unknown as CmWindow).__cmSetTab;
  delete (window as unknown as CmWindow).C2C_NAV_PARAMS;
  delete (window as unknown as { C2C_EDITOR_TARGET?: unknown }).C2C_EDITOR_TARGET;
  setProject(undefined);
});

/* ══════════════════ Overview — the per-program figure ══════════════════ */

describe('CmOverview — Module 3 questions overdue on this project', () => {
  it('a positive count is a button that opens the Module 3 questions', async () => {
    wire({ module3: module3([m3Question('3.2.P.7'), m3Question('3.2.S.4.1')]) });
    const setTab = vi.fn();
    (window as unknown as CmWindow).__cmSetTab = setTab;
    inModule(<CmOverview ask={vi.fn()} nav={vi.fn()} />);
    const kpi = await screen.findByRole('button', { name: /Module 3 questions overdue on this project/ });
    expect(within(kpi).getByText('2')).toBeTruthy();
    expect(kpi.getAttribute('title')).toMatch(/agency questions/i);
    fireEvent.click(kpi);
    expect(setTab).toHaveBeenCalledWith('pathway');
    expect(module3Reads()).toHaveLength(1);
  });

  it('shows the server\'s figure: an approved answer on an overdue letter is not counted, a zero is a plain figure', async () => {
    wire({ module3: module3([m3Question('3.2.P.7', { state: 'approved', outstanding: false, overdue: false, letter: letterOf({ overdue: true }) })]) });
    inModule(<CmOverview ask={vi.fn()} nav={vi.fn()} />);
    await screen.findAllByText('BLA 761234');
    const label = await screen.findByText(/^Module 3 questions overdue on this project/, { selector: '.reg-kpi-l' });
    const tile = label.closest('.reg-kpi') as HTMLElement;
    await waitFor(() => expect(within(tile).getByText('0')).toBeTruthy());
    expect(label.closest('button')).toBeNull();
    expect(screen.queryByText(/questions? (is|are) overdue/)).toBeNull();
  });

  it('a read that failed is unknown, never zero, and the lead says so', async () => {
    wire({ module3: 'error' });
    inModule(<CmOverview ask={vi.fn()} nav={vi.fn()} />);
    await screen.findAllByText('BLA 761234');
    const label = await screen.findByText(/^Module 3 questions overdue on this project/, { selector: '.reg-kpi-l' });
    await waitFor(() => expect(label.textContent).toMatch(/not established/i));
    const tile = label.closest('.reg-kpi') as HTMLElement;
    expect(within(tile).getByText('—')).toBeTruthy();
    expect(within(tile).queryByText('0')).toBeNull();
    expect(screen.queryByRole('button', { name: /questions overdue/ })).toBeNull();
    expect(screen.getAllByText(/not established/i).length).toBeGreaterThan(1);
  });

  it('with no program open it claims no count and issues no read', async () => {
    setProject(undefined);
    wire({});
    inModule(<CmOverview ask={vi.fn()} nav={vi.fn()} />);
    await screen.findAllByText('BLA 761234');
    const label = await screen.findByText(/^Module 3 questions overdue on this project/, { selector: '.reg-kpi-l' });
    expect(label.textContent).toMatch(/counted per project; open one/);
    expect(within(label.closest('.reg-kpi') as HTMLElement).getByText('—')).toBeTruthy();
    expect(module3Reads()).toEqual([]);
  });

  it('its action opens the overdue letter in Communication; it neither drafts nor promises sign-offs', async () => {
    wire({ module3: module3([m3Question('3.2.P.7', { letter: letterOf({ id: 'ace_late' }) })]) });
    const ask = vi.fn();
    const nav = vi.fn();
    inModule(<CmOverview ask={ask} nav={nav} />);
    const action = await screen.findByRole('button', { name: 'Open the overdue letters in Communication' });
    expect(screen.queryByText(/route the sign-offs/)).toBeNull();
    expect(screen.queryByText(/I'll draft the responses/)).toBeNull();
    fireEvent.click(action);
    expect(nav).toHaveBeenCalledWith('communication-center');
    expect(navParams()).toMatchObject({ surfaceId: 'communication-center', params: { letterId: 'ace_late' } });
    expect(ask).not.toHaveBeenCalled();
  });

  it('says what it did not count, each as what it counts: questions as questions, letters as letters, and the earlier file as organization-wide', async () => {
    wire({
      module3: module3([m3Question('3.2.P.7')], { withheld: 1, notCounted: { unclassifiedOutstanding: 2, overdueLettersWithoutQuestions: 1 } }),
      earlier: earlier([earlierRow()], { total: 5, notClosed: 3 }),
    });
    inModule(<CmOverview ask={vi.fn()} nav={vi.fn()} />);
    const label = await screen.findByText(/^Module 3 questions overdue on this project/, { selector: '.reg-kpi-l' });
    await waitFor(() => expect(label.textContent).toMatch(/2 outstanding questions with no CTD section not counted/));
    expect(label.textContent).toMatch(/1 overdue letter with no question or section not counted/);
    expect(label.textContent).not.toMatch(/3 not counted/);
    expect(label.textContent).toMatch(/1 letter you cannot open/);
    const line = await screen.findByTestId('cmc-earlier-file-line');
    expect(line.textContent).toMatch(/The earlier CMC question file \(organization-wide, read-only\) holds 3 questions not\s+closed there\./);
    expect(line.textContent).toMatch(/nothing moves them onto a\s+letter: record each one still open on its letter in Communication/);
    // Never that they are already on their letters, and never "Plus" under this program's figure.
    expect(line.textContent).not.toMatch(/Each is recorded on its letter|^Plus/);
  });

  it('a failed read of the earlier file is said on the Overview, never taken for "nothing open"', async () => {
    wire({ module3: module3([]), earlier: 'error' });
    inModule(<CmOverview ask={vi.fn()} nav={vi.fn()} />);
    const line = await screen.findByTestId('cmc-earlier-file-line');
    expect(line.textContent).toMatch(/The earlier CMC question file could not be read; whether it holds open questions is not known\./);
  });

  it('a zero is green only as an all-clear: never over letters withheld from this person', async () => {
    wire({ module3: module3([], { withheld: 1 }) });
    inModule(<CmOverview ask={vi.fn()} nav={vi.fn()} />);
    const label = await screen.findByText(/^Module 3 questions overdue on this project/, { selector: '.reg-kpi-l' });
    await waitFor(() => expect(label.textContent).toMatch(/1 letter you cannot open not counted/));
    const tile = label.closest('.reg-kpi') as HTMLElement;
    expect(within(tile).getByText('0')).toBeTruthy();
    expect(tile.getAttribute('data-tone')).not.toBe('ok');
  });

  it('a zero over a measured, complete figure is green', async () => {
    wire({ module3: module3([]) });
    inModule(<CmOverview ask={vi.fn()} nav={vi.fn()} />);
    const label = await screen.findByText(/^Module 3 questions overdue on this project/, { selector: '.reg-kpi-l' });
    const tile = label.closest('.reg-kpi') as HTMLElement;
    await waitFor(() => expect(tile.getAttribute('data-tone')).toBe('ok'));
  });
});

/* ══════════ Overview — the server's own counting, run here (review of 2026-10-19) ══════════
   The payloads below are the server's moduleQuestionsView over the letters
   described, so the client is read against the shape the route returns. */

describe('CmOverview — what the server counts is said as what it is', () => {
  it('an approved Module 3 answer on a letter overdue only on a Clinical question: no Module 3 overdue, no "no question recorded"', async () => {
    const payload = serverModule3([
      { eventId: 'ace_mix', questions: [{ id: 1, state: 'approved', ctdSection: '3.2.P.7' }, { id: 2, state: 'unanswered', ctdSection: '5.3.5.1' }] },
    ]);
    expect(payload.summary).toMatchObject({ questionsOverdue: 0, lettersOverdue: 0, lettersOverdueOnOtherQuestions: 1 });
    wire({ module3: payload });
    const nav = vi.fn();
    inModule(<CmOverview ask={vi.fn()} nav={nav} />);
    const label = await screen.findByText(/^Module 3 questions overdue on this project/, { selector: '.reg-kpi-l' });
    await waitFor(() => expect(label.textContent).toMatch(/1 letter overdue on other questions, Module 3's answered/));
    expect(within(label.closest('.reg-kpi') as HTMLElement).getByText('0')).toBeTruthy();
    expect(label.textContent).not.toMatch(/on 1 letter/);
    expect(screen.queryByText(/no question (to answer )?recorded/)).toBeNull();
    expect(screen.queryByText(/Module 3 letters? (is|are) overdue/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open the overdue letters in Communication' })).toBeNull();
  });

  it('a Module 3 letter with nothing recorded, past its date: said as that, and the action opens that letter', async () => {
    const payload = serverModule3([{ eventId: 'ace_bare', linkedSectionCodes: ['3.2.P.5'], questions: [] }]);
    expect(payload.summary).toMatchObject({ lettersOverdue: 0, lettersWithoutQuestionsOverdue: 1 });
    wire({ module3: payload });
    const nav = vi.fn();
    inModule(<CmOverview ask={vi.fn()} nav={nav} />);
    expect(await screen.findByText(/1 Module 3 letter is overdue/)).toBeTruthy();
    expect(screen.getByText(/with no question to answer recorded on it\. Record its questions on the letter, or mark it as needing no response, in Communication\./)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open the overdue letters in Communication' }));
    expect(nav).toHaveBeenCalledWith('communication-center');
    expect(navParams()?.params).toEqual({ letterId: 'ace_bare' });
  });

  it('one question overdue on one letter, and another letter overdue only on a Clinical question: "on 1 letter"', async () => {
    const payload = serverModule3([
      { eventId: 'ace_a', questions: [{ id: 1, state: 'unanswered', ctdSection: '3.2.P.7' }] },
      { eventId: 'ace_b', questions: [{ id: 2, state: 'approved', ctdSection: '3.2.S.4.1' }, { id: 3, state: 'unanswered', discipline: 'Clinical' }] },
    ]);
    wire({ module3: payload });
    inModule(<CmOverview ask={vi.fn()} nav={vi.fn()} />);
    expect(await screen.findByText(/1 Module 3 question is overdue/)).toBeTruthy();
    expect(screen.getByText(/on 1 letter \(§3\.2\.P\.7\)/)).toBeTruthy();
  });
});

/* ══════════════════ Change simulator — collision signpost ══════════════════ */

/** Drive the simulator: describe the change, keep the preselected markets, run. */
function simulate(desc: string) {
  fireEvent.change(screen.getByPlaceholderText(/switch the drug-substance supplier/), { target: { value: desc } });
  const choose = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
  choose('Dosage form', 'immediate_release_oral_solid'); choose('Change category', 'manufacturing_site');
  choose('Material affected', 'drug_substance'); choose('Touches a critical step', 'no'); choose('Site change', 'different_country');
  fireEvent.click(screen.getByRole('button', { name: /Assess proposed variation/ }));
}

describe('CmChange — a simulated change collides with an outstanding agency question', () => {
  it('names the section, and opens the question on its letter', async () => {
    wire({ module3: module3([m3Question('3.2.S.2.2', { id: 55, letter: letterOf({ id: 'ace_s2' }) })]) });
    const nav = vi.fn();
    inModule(<CmChange ask={vi.fn()} nav={nav} />);
    simulate('Switch the drug-substance supplier from A to B; comparable process, new site');
    const notice = await screen.findByTestId('cmc-corr-notice');
    expect(within(notice).getByText(/3\.2\.S\.2\.2/)).toBeTruthy();
    expect(within(notice).getByText(/the sections this change affects/)).toBeTruthy();
    fireEvent.click(within(notice).getByRole('button', { name: /Open its letter in Communication/ }));
    expect(nav).toHaveBeenCalledWith('communication-center');
    expect(navParams()?.params).toEqual({ letterId: 'ace_s2', questionId: '55' });
  });

  it('counts by the server\'s "outstanding", and says "at least" when the server listed a page', async () => {
    wire({
      module3: module3([
        m3Question('3.2.S.2.2', { id: 56, letter: letterOf({ id: 'ace_s2' }) }),
        // The server says this one is not outstanding (its letter is closed): the signpost does not restate the rule.
        m3Question('3.2.S.2.3', { id: 57, state: 'drafted', outstanding: false, overdue: false, letter: letterOf({ id: 'ace_s3', overdue: false }) }),
      ], { truncated: true }),
    });
    inModule(<CmChange ask={vi.fn()} nav={vi.fn()} />);
    simulate('Switch the drug-substance supplier from A to B; comparable process, new site');
    const notice = await screen.findByTestId('cmc-corr-notice');
    expect(within(notice).getByText(/^At least 1 outstanding agency question references the sections this change affects/)).toBeTruthy();
  });

  it('matches whole segments: a question at 3.2.S.20 is not about 3.2.S.2', async () => {
    wire({ module3: module3([m3Question('3.2.S.20')]) });
    inModule(<CmChange ask={vi.fn()} nav={vi.fn()} />);
    simulate('Switch the drug-substance supplier from A to B');
    await screen.findByText('Regulatory Change Impact Assessment', { selector: 'h3' });
    await waitFor(() => expect(module3Reads().length).toBe(1));
    await act(async () => {});
    expect(screen.queryByTestId('cmc-corr-notice')).toBeNull();
  });
});

/* ══════════════════ Program records — the Module 3 index ══════════════════ */

describe('CmPathway — the program\'s Module 3 questions, read from the letters', () => {
  it('with no program open it asks for one and reads nothing', async () => {
    setProject(undefined);
    wire({});
    inModule(<CmPathway ask={() => {}} nav={vi.fn()} />);
    expect(await screen.findByText('Open a project to see its agency questions')).toBeTruthy();
    expect(module3Reads()).toEqual([]);
  });

  it('lists each question with the server\'s state and one door: open it on its letter', async () => {
    const late = m3Question('3.2.S.4.1', { id: 71, questionRef: 'Q2', owner: { userId: 41, name: 'Ines Okafor' }, letter: letterOf({ id: 'ace_late' }) });
    const done = m3Question('3.2.P.7', { id: 72, questionRef: 'Q1', state: 'approved', outstanding: false, overdue: false, letter: letterOf({ id: 'ace_late' }) });
    const fromLetter = m3Question('3.2.P.5', { id: 73, questionRef: 'Q3', sectionSource: 'letter', ctdSection: null, overdue: false, letter: letterOf({ id: 'ace_now', overdue: false, dueDate: null }) });
    wire({ module3: module3([late, done, fromLetter]) });
    const nav = vi.fn();
    inModule(<CmPathway ask={() => {}} nav={nav} />);

    const table = await screen.findByTestId('cmc-module3-questions');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText('No response')).toBeTruthy();
    // The same chip the letter draws for the same state (one map, agencyQuestionState.ts).
    expect(within(rows[0]).getByText('No response').className).toBe('rd-chip tone-idle');
    expect(within(rows[0]).getByText(/overdue/)).toBeTruthy();
    expect(within(rows[1]).getByText('Approved')).toBeTruthy();
    expect(within(rows[1]).queryByText(/overdue/)).toBeNull();
    expect(within(rows[2]).getByText(/3\.2\.P\.5 \(the letter's\)/)).toBeTruthy();
    // The owner recorded on the letter, and none where none is.
    expect(within(rows[0]).getByText('Ines Okafor')).toBeTruthy();
    expect(within(rows[1]).getByText('none set')).toBeTruthy();
    expect(screen.getByText(/2 outstanding · 1 overdue on 1 letter/)).toBeTruthy();
    // The action column is named for assistive technology.
    expect(within(table).getAllByRole('columnheader').every((th) => (th.textContent ?? '').trim().length > 0)).toBe(true);

    fireEvent.click(within(rows[0]).getByRole('button', { name: /Open on its letter/ }));
    expect(nav).toHaveBeenCalledWith('communication-center');
    expect(navParams()?.params).toEqual({ letterId: 'ace_late', questionId: '71' });
  });

  it('offers no working act of its own', async () => {
    wire({ module3: module3([m3Question('3.2.P.7')]), earlier: earlier([earlierRow()], { notClosed: 1 }) });
    inModule(<CmPathway ask={() => {}} nav={vi.fn()} />);
    await screen.findByTestId('cmc-module3-questions');
    await screen.findByText(/Earlier CMC question file/);
    for (const name of [/Log question/, /^Close$/, /Reopen/, /Send for review/, /Return to drafting/, /Draft response/, /Re-draft/, /Create task/, /^Assign$/, /Record question/, /Approve/]) {
      expect(screen.queryByRole('button', { name }), String(name)).toBeNull();
    }
  });

  it('a failed read is an error, never the empty list', async () => {
    wire({ module3: 'error' });
    inModule(<CmPathway ask={() => {}} nav={vi.fn()} />);
    expect(await screen.findByText("Couldn't read this project's agency questions")).toBeTruthy();
    expect(screen.queryByText(/No Module 3 questions are recorded/)).toBeNull();
  });

  it('says what it did not count, and names a Module 3 letter with no question recorded', async () => {
    wire({
      module3: module3([], {
        withheld: 2,
        notCounted: { unclassifiedOutstanding: 1, overdueLettersWithoutQuestions: 1 },
        lettersWithoutQuestions: [{ ...letterOf({ id: 'ace_bare', communicationType: 'IR 9' }), sections: ['3.2.P.5'] }],
      }),
    });
    const nav = vi.fn();
    inModule(<CmPathway ask={() => {}} nav={nav} />);
    expect(await screen.findByText(/2 letters on this project are restricted from you/)).toBeTruthy();
    expect(screen.getByText(/1 outstanding question on this project carries no CTD section/)).toBeTruthy();
    expect(screen.getByText(/Record each question's CTD section on its letter in Communication\./)).toBeTruthy();
    expect(screen.getByText(/1 overdue letter has no question recorded and no section linked/)).toBeTruthy();
    const bare = screen.getByText(/IR 9/).closest('li') as HTMLElement;
    fireEvent.click(within(bare).getByRole('button', { name: /Open on its letter/ }));
    expect(navParams()?.params).toEqual({ letterId: 'ace_bare' });
  });

  it('an empty program says where questions are recorded', async () => {
    wire({ module3: module3([]) });
    inModule(<CmPathway ask={() => {}} nav={vi.fn()} />);
    expect(await screen.findByText("No Module 3 questions are recorded on this project's letters")).toBeTruthy();
  });

  it('an empty list over letters withheld from this person speaks only for the letters read', async () => {
    wire({ module3: module3([], { withheld: 1 }) });
    inModule(<CmPathway ask={() => {}} nav={vi.fn()} />);
    expect(await screen.findByText(/1 letter on this project is restricted from you/)).toBeTruthy();
    expect(screen.getByText('No Module 3 questions are recorded on the letters read here')).toBeTruthy();
    expect(screen.queryByText("No Module 3 questions are recorded on this project's letters")).toBeNull();
  });

  it('as the server counts them: a letter overdue on its other questions is said, and its approved answer is not overdue', async () => {
    wire({
      module3: serverModule3([
        { eventId: 'ace_mix', questions: [{ id: 1, state: 'approved', ctdSection: '3.2.P.7' }, { id: 2, state: 'unanswered', ctdSection: '5.3.5.1' }] },
      ]),
    });
    inModule(<CmPathway ask={() => {}} nav={vi.fn()} />);
    const table = await screen.findByTestId('cmc-module3-questions');
    const [row] = within(table).getAllByRole('row').slice(1);
    expect(within(row).getByText('Approved')).toBeTruthy();
    // The approved answer's row says nothing of overdue; the letter's other questions are said once, below.
    expect(within(row).queryByText(/overdue/)).toBeNull();
    expect(screen.getByText(/0 outstanding · 0 overdue on 0 letters/)).toBeTruthy();
    expect(screen.getByText(/1 letter whose Module 3 answers stand is overdue on its other questions/)).toBeTruthy();
  });

  it('as the server counts them: a Module 3 letter whose only question is withdrawn is named once, and not "not counted"', async () => {
    wire({ module3: serverModule3([{ eventId: 'ace_wd', communicationType: 'IR 12', questions: [{ id: 1, state: 'withdrawn', ctdSection: '3.2.P.7' }] }]) });
    inModule(<CmPathway ask={() => {}} nav={vi.fn()} />);
    const named = (await screen.findByText(/Module 3 letters with no question to answer recorded/)).parentElement as HTMLElement;
    expect(within(named).getByText(/IR 12/)).toBeTruthy();
    expect(within(named).getByText(/§3\.2\.P\.7/)).toBeTruthy();
    expect(screen.queryByText(/no question recorded and no section linked/)).toBeNull();
  });
});

/* ══════════════════ Program records — the earlier CMC file ══════════════════ */

describe('CmPathway — the earlier CMC question file, read-only history', () => {
  it('renders nothing when the file holds nothing', async () => {
    wire({ module3: module3([]), earlier: earlier([]) });
    inModule(<CmPathway ask={() => {}} nav={vi.fn()} />);
    await screen.findByText("No Module 3 questions are recorded on this project's letters");
    await waitFor(() => expect(calls().some(([m, u]) => m === 'GET' && u === EARLIER_PATH)).toBe(true));
    await act(async () => {});
    expect(screen.queryByText(/Earlier CMC question file/)).toBeNull();
  });

  it('says what each row holds, and nothing it does not', async () => {
    wire({
      module3: module3([]),
      earlier: earlier([
        earlierRow({ id: 1, status: 'CLOSED', responseDocId: 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e' }),
        earlierRow({ id: 2, status: 'OPEN', question: 'Provide the Q1E analysis.', dueDate: '2026-01-01' }),
      ], { total: 2, notClosed: 1 }),
    });
    const nav = vi.fn();
    inModule(<CmPathway ask={() => {}} nav={nav} />);
    const card = (await screen.findByText(/Earlier CMC question file/)).closest('.pj-card') as HTMLElement;
    expect(within(card).getByText(/read-only history, organization-wide/)).toBeTruthy();
    expect(within(card).getByText(/recorded in CMC, across the organization, before agency questions moved onto the letter \(2026-10-19\)\.\s+This file is read-only\. Nothing moves these onto a letter: record a question still open here on its letter in\s+Communication, by hand\./)).toBeTruthy();
    expect(within(card).queryByText(/is recorded on its letter in Communication/)).toBeNull();
    expect(within(card).getByText(/1 not closed in the earlier file/)).toBeTruthy();
    expect(within(card).getAllByText(/Recorded 2026-08-24; status CLOSED, last changed 2026-09-02\./).length).toBe(1);
    expect(within(card).getByText(/Closed by a status change, not a signed approval\./)).toBeTruthy();
    expect(within(card).getByText(/Record it on its letter in Communication\. It will still read OPEN here: nothing writes this file any more\./)).toBeTruthy();
    expect(within(card).queryByText(/overdue/i)).toBeNull();
    expect(within(card).queryByText(/awaiting transfer/i)).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: /Linked draft document \(not an approved response\)/ }));
    expect(nav).toHaveBeenCalledWith('document-authoring');
    expect(consumeEditorTarget()).toMatchObject({ docId: 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e' });
  });

  it('a failed read of the earlier file is said, not hidden', async () => {
    wire({ module3: module3([]), earlier: 'error' });
    inModule(<CmPathway ask={() => {}} nav={vi.fn()} />);
    expect(await screen.findByText(/The earlier CMC question file could not be read/)).toBeTruthy();
  });
});
