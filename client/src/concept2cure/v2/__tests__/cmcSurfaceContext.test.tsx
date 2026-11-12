// @vitest-environment jsdom
/**
 * What AnA is told about the CMC screen the user is actually on.
 *
 * ── The gap ───────────────────────────────────────────────────────────────────
 * `useAnaChat` forwards a surface's published context to the orchestrator as
 * `module_context` (see ../surfaceContext). The shell alone knows only that the
 * active surface is "cmc" — not which of the nine sub-tabs is open, nor
 * anything on it. So a generic question ("what should I do next?") could not be
 * answered here without the user restating their situation.
 *
 * ── What must be true ─────────────────────────────────────────────────────────
 * These tests drive the REAL surface and read the store through the same public
 * hook the shell uses — no mock of the channel itself:
 *
 *   • the context follows the sub-tab, so it describes the screen in view;
 *   • measured facts appear only once the readiness endpoint has RESOLVED;
 *     while it is loading or errored they are ABSENT, because telling AnA a
 *     percentage nobody measured makes her confidently wrong, which is the
 *     failure this channel is most able to cause;
 *   • the context is withdrawn on unmount, so the next surface never inherits it;
 *   • `availableActions` names the module's real screens and governed actions,
 *     giving her a vocabulary for "drive the screen" requests.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: '7', email: 'a@b.test', displayName: 'A' } }),
}));

import { useActiveSurfaceContext, toModuleContext, type SurfaceContext } from '../surfaceContext';
import type { SurfaceViewProps } from '../surfaceViews';
import { CmcModule } from '../surfaces/CmcModule';

const PROJECT = 'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab';

function res(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

const cmcProps = () => ({
  surface: { id: 'cmc', label: 'CMC' } as unknown as SurfaceViewProps['surface'],
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biotech',
});

/** Reads the store exactly as the shell does, so the test exercises the real path. */
let seen: SurfaceContext | null = null;
function Probe() {
  seen = useActiveSurfaceContext('cmc');
  return null;
}

function renderCmc() {
  return render(
    <>
      <CmcModule {...cmcProps()} />
      <Probe />
    </>,
  );
}

/** Only the readiness endpoint is interesting; everything else is an empty list. */
const wire = (readiness: unknown, opts: { throws?: boolean } = {}) => {
  apiRequest.mockImplementation(async (_m?: string, u?: string) => {
    if (typeof u === 'string' && u.startsWith('/api/cmc/module3-os/readiness/')) {
      if (opts.throws) throw Object.assign(new Error('service unavailable'), { status: 503 });
      return res(readiness);
    }
    return res({ success: true, data: [] });
  });
};

afterEach(() => {
  cleanup();
  seen = null;
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});
beforeEach(() => apiRequest.mockReset());

describe('CMC publishes what the screen is showing', () => {
  it('describes the sub-tab in view, and follows the user to another', async () => {
    wire({ success: true, data: null });
    renderCmc();

    await waitFor(() => expect(seen).not.toBeNull());
    expect(seen!.surfaceId).toBe('cmc');
    expect(seen!.facts?.tabLabel).toBe('Overview');
    expect(seen!.summary).toMatch(/Overview tab of the CMC Module 3 operating system/);

    /* All nine tabs are one row since P-122 (2026-11-10), so Stability is one
       click from Overview — no half to choose first. */
    fireEvent.click(screen.getByRole('tab', { name: 'Stability' }));
    await waitFor(() => expect(seen!.facts?.tabLabel).toBe('Stability'));
    expect(seen!.summary).toMatch(/Stability tab/);
    /* And the tab's "what to do now" sentence is published for this tab, so the
       page's first starter answers it (D5 §A.5); since P-122 it is also printed. */
    expect(seen!.facts?.whatToDoHere).toMatch(/Register each study/);
  });

});

/* The frame of the CMC work area. Its own block: these drive the frame rather
   than the context channel above, and keeping them there put that describe
   past the 100-line cap. Since P-122 (2026-11-10) the two groups the founder
   named (D5 §A.3) are one row, so no group is ever closed. */
describe('CMC opens with both groups in one row', () => {
  it('moves between a study record and the Module 3 build in one click each way', async () => {
    /* One piece of state, the tab. D5-1's half toggle remembered the last tab
       of each half because one half was hidden; with nothing hidden there is
       nothing to remember, and every tab is a click from every other. */
    wire({ success: true, data: null });
    renderCmc();
    await waitFor(() => expect(seen).not.toBeNull());

    fireEvent.click(screen.getByRole('tab', { name: 'Batch records' }));
    await waitFor(() => expect(seen!.facts?.tabLabel).toBe('Batch records'));
    fireEvent.click(screen.getByRole('tab', { name: 'Module 3 build' }));
    await waitFor(() => expect(seen!.facts?.tabLabel).toBe('Module 3 build'));
    fireEvent.click(screen.getByRole('tab', { name: 'Batch records' }));
    await waitFor(() => expect(seen!.facts?.tabLabel).toBe('Batch records'));
    expect(screen.queryByRole('button', { name: 'Study records' })).toBeNull();
  });

  it('gives AnA a vocabulary for driving the screen', async () => {
    wire({ success: true, data: null });
    renderCmc();
    await waitFor(() => expect(seen?.availableActions?.length).toBeGreaterThan(5));

    const actions = seen!.availableActions!;
    expect(actions).toContain('open the Module 3 build tab');
    expect(actions).toContain('compile Module 3 from the canonical sources');
    expect(actions).toContain('check the final-export gate');
    expect(actions.some((a) => /ICH Q1E/.test(a))).toBe(true);
  });

  it('publishes MEASURED readiness once the endpoint resolves', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROJECT };
    wire({
      success: true,
      data: {
        totalSections: 10, approvedSections: 4, staleSections: 2,
        openCriticalContradictions: 1, exportReady: false,
      },
    });
    renderCmc();

    await waitFor(() => expect(seen?.facts?.sectionsApproved).toBe(4));
    expect(seen!.facts).toMatchObject({
      sectionsTotal: 10,
      staleSections: 2,
      openCriticalContradictions: 1,
      exportReady: false,
    });
    // The summary states the same numbers, so her prose and her facts agree.
    expect(seen!.summary).toMatch(/4 of 10 §3\.2 sections are approved/);
    expect(seen!.summary).toMatch(/2 went stale after approval/);
    expect(seen!.summary).toMatch(/Final export is blocked/);
  });

  it('says the gate would pass when it would', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROJECT };
    wire({
      success: true,
      data: {
        totalSections: 6, approvedSections: 6, staleSections: 0,
        openCriticalContradictions: 0, exportReady: true,
      },
    });
    renderCmc();
    await waitFor(() => expect(seen?.facts?.exportReady).toBe(true));
    expect(seen!.summary).toMatch(/Final export would pass/);
    // Nothing that is zero is narrated as a problem.
    expect(seen!.summary).not.toMatch(/stale|unresolved/);
  });

  it('publishes NO measured fact when the readiness read fails', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROJECT };
    wire(null, { throws: true });
    renderCmc();

    await waitFor(() => expect(seen).not.toBeNull());
    // The tab is still described — that is known from the screen itself.
    expect(seen!.facts?.tabLabel).toBe('Overview');
    // But nothing is asserted about a state nobody measured.
    for (const k of ['sectionsApproved', 'sectionsTotal', 'staleSections', 'openCriticalContradictions', 'exportReady']) {
      expect(seen!.facts).not.toHaveProperty(k);
    }
    expect(seen!.summary).not.toMatch(/approved|blocked|would pass/);
  });

  it('publishes no measured fact without a project either', async () => {
    wire({ success: true, data: null });
    renderCmc();
    await waitFor(() => expect(seen).not.toBeNull());
    expect(seen!.facts).not.toHaveProperty('sectionsTotal');
  });

  it('withdraws its context on unmount, so the next surface inherits nothing', async () => {
    wire({ success: true, data: null });
    const { unmount } = renderCmc();
    await waitFor(() => expect(seen).not.toBeNull());
    unmount();
    // Read the store directly: the probe is gone with the tree.
    expect(toModuleContext(null)).toBeNull();
    render(<Probe />);
    expect(seen).toBeNull();
  });

  it('shapes onto the wire without empty keys', async () => {
    wire({ success: true, data: null });
    renderCmc();
    await waitFor(() => expect(seen).not.toBeNull());
    const wireCtx = toModuleContext(seen)!;
    expect(wireCtx.surface).toBe('cmc');
    expect(typeof wireCtx.summary).toBe('string');
    expect(wireCtx.available_actions).toBeDefined();
  });
});

/* 2026-10-19 (rows D2, D5; P-39 item 1): CMC's agency-question figures are
   read once, at the module root, from the program's letters; the Overview
   tile and AnA read that one read. So AnA's facts are the tile's figure, and
   they exist only when the read is measured: a program is open, it resolved,
   and it did not fail. */
describe('CMC tells AnA the Module 3 question figures it shows, and only those', () => {
  const MODULE3 = `/api/concept2cure/projects/${PROJECT}/agency-questions?ctdModule=3`;
  const measured = {
    module: 3, today: '2026-10-19', questions: [], lettersWithoutQuestions: [],
    summary: { questions: 5, outstanding: 3, questionsOverdue: 2, lettersOverdue: 1, lettersWithoutQuestionsOverdue: 0, lettersOverdueOnOtherQuestions: 0, byState: {} },
    notCounted: { unclassifiedOutstanding: 1, overdueLettersWithoutQuestions: 0 }, withheld: 1, truncated: false,
  };
  const wireQuestions = (module3: unknown | 'error' | 'pending', notClosed = 4) => {
    apiRequest.mockImplementation(async (_m?: string, u?: string) => {
      if (u === MODULE3) {
        if (module3 === 'error') throw Object.assign(new Error('The agency questions could not be read.'), { status: 500 });
        if (module3 === 'pending') return new Promise(() => {});
        return res({ success: true, data: module3 });
      }
      if (u === '/api/cmc/agency-questions') return res({ success: true, data: [], meta: { total: 6, notClosed, listed: 0, truncated: false, provisioned: true } });
      if (typeof u === 'string' && u.startsWith('/api/cmc/module3-board')) {
        return res({ success: true, data: { portfolio: [{ sub: 'IND 161234', product: 'BX-701', region: 'FDA', type: 'IND', rpi: null, ir: null, source: 'spine' }], sections: [], kpis: { submissions: 1, rpiAverage: null, sectionsApproved: 0, sectionsTotal: 0, readyPercent: 0 }, meta: { projectId: PROJECT, portfolioProvisioned: true, sectionsProvisioned: true, generatedAt: 'now' } } });
      }
      return res({ success: true, data: [] });
    });
  };
  const QUESTION_FACTS = [
    'module3QuestionsOverdue', 'module3LettersOverdue', 'module3LettersWithoutQuestionsOverdue', 'module3LettersOverdueOnOtherQuestions',
    'module3QuestionsOutstanding', 'module3LettersWithheld', 'module3QuestionsNotCounted', 'module3OverdueLettersNotCounted',
  ];

  it('publishes the figures once measured, and they are the tile\'s', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROJECT };
    wireQuestions(measured);
    renderCmc();
    await waitFor(() => expect(seen?.facts?.module3QuestionsOverdue).toBe(2));
    expect(seen!.facts).toMatchObject({
      module3LettersOverdue: 1, module3QuestionsOutstanding: 3, module3LettersWithheld: 1,
      module3QuestionsNotCounted: 1, module3OverdueLettersNotCounted: 0,
    });
    await waitFor(() => expect(seen!.facts?.earlierCmcFileNotClosed).toBe(4));
    expect(seen!.summary).toMatch(/On this project, 2 Module 3 agency questions are overdue on 1 letter, and 3 are outstanding/);
    expect(seen!.summary).toMatch(/1 letter the user cannot open is not counted/);
    expect(seen!.summary).toMatch(/1 outstanding question carries no CTD section and is not counted/);
    expect(seen!.summary).toMatch(/The earlier CMC question file \(organization-wide, read-only\) holds 4 questions not closed there; they are not counted, and nothing moves them onto a letter/);
    // The figure on screen is the same number.
    const label = await screen.findByText(/^Module 3 questions overdue on this project/, { selector: '.reg-kpi-l' });
    expect((label.closest('.reg-kpi') as HTMLElement).querySelector('.reg-kpi-v')?.textContent).toBe(String(seen!.facts!.module3QuestionsOverdue));
    // No surface action is registered for questions: CMC opens letters, it does not work them.
    expect(seen!.availableActions!.some((a) => /agency question|information request|draft/i.test(a))).toBe(false);
  });

  it('says an overdue letter with nothing recorded as a letter, never as one more question with no CTD section', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROJECT };
    wireQuestions({
      ...measured,
      summary: { ...measured.summary, questionsOverdue: 0, lettersOverdue: 0, outstanding: 0 },
      notCounted: { unclassifiedOutstanding: 0, overdueLettersWithoutQuestions: 1 },
      withheld: 0,
    });
    renderCmc();
    await waitFor(() => expect(seen?.facts?.module3OverdueLettersNotCounted).toBe(1));
    expect(seen!.facts).toMatchObject({ module3QuestionsNotCounted: 0 });
    expect(seen!.summary).toMatch(/1 overdue letter has no question recorded and no section linked, and is not counted/);
    expect(seen!.summary).not.toMatch(/more (is|are) not counted, having no CTD section/);
    expect(seen!.summary).not.toMatch(/carr(y|ies) no CTD section/);
  });

  it('publishes none of them while the read is in flight', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROJECT };
    wireQuestions('pending');
    renderCmc();
    await waitFor(() => expect(seen).not.toBeNull());
    await waitFor(() => expect(seen!.facts?.earlierCmcFileNotClosed).toBe(4));
    for (const k of QUESTION_FACTS) expect(seen!.facts).not.toHaveProperty(k);
    expect(seen!.summary).not.toMatch(/agency questions are overdue/);
  });

  it('publishes none of them when the read failed, or with no program open', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROJECT };
    wireQuestions('error');
    const first = renderCmc();
    await waitFor(() => expect(seen?.facts?.earlierCmcFileNotClosed).toBe(4));
    for (const k of QUESTION_FACTS) expect(seen!.facts).not.toHaveProperty(k);
    first.unmount();
    delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
    wireQuestions(measured);
    renderCmc();
    await waitFor(() => expect(seen?.facts?.earlierCmcFileNotClosed).toBe(4));
    for (const k of QUESTION_FACTS) expect(seen!.facts).not.toHaveProperty(k);
  });
});


/**
 * The ask row carries a name a screen reader can reach (coordinator, 2026-11-02).
 *
 * `CmStarters` rendered `<div className="sp-starters" data-layout="row"
 * aria-label="Ask AnA">`. An `aria-label` on a `<div>` with no role is ignored
 * by assistive technology — the element has no accessible name at all, so the
 * row of starters is an unlabelled group of buttons. The Reporting session
 * found the identical shape on the Insights canvas, where
 * `insightsCanvasAccessible.test.tsx` catches it; CMC had no such case, which
 * is why the same defect could be written here and not be noticed.
 *
 * `getByRole('group', { name: 'Ask AnA' })` is the assertion rather than a
 * class query precisely because it resolves the name the way a reader's
 * software does: with the role absent, the query cannot find the element even
 * though the attribute is on it.
 */
describe('CMC — the ask row is named for a screen reader', () => {
  it('exposes the starters as a group with an accessible name', async () => {
    wire({ success: true, data: {} });
    renderCmc();
    const row = await screen.findByRole('group', { name: 'Ask AnA' });
    expect(row.classList.contains('sp-starters')).toBe(true);
    // And it is the row of starters, not an empty landmark.
    expect(row.querySelectorAll('button.sp-starter').length).toBeGreaterThan(0);
  });
});
