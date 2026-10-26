/** @vitest-environment jsdom */
/**
 * Project home's "Dossier readiness" — the figure the Projects list reports.
 *
 * The ring drew `progress_percent`, a column written once as 0 at creation and
 * never updated, so every program read "Dossier readiness 0%" on its own page
 * while its card in the Projects list showed the governed share, and AnA was
 * told "0% complete". The detail read now carries `readiness` from the same
 * aggregate the list uses, and null when it could not be read.
 *
 * QA 2026-10-08 (j1): with readiness null the page showed no readiness at all,
 * while the program's card said "Readiness not measured", and three other
 * screens printed three other figures. Project home now always states the one
 * figure the server computes, under the same name the card uses — the value,
 * or "not measured" — and tells AnA the same.
 *
 * F23 (2026-10-22): the card and the module rows read one dossier,
 * GET /:id/dossier (server/services/c2c/dossier-read). At head the card read
 * the detail row's pooled figure and the rows read /workstreams, which weighted
 * review as 75: every section in review drew 0% above modules at 75%. The
 * figure is the home filing's; an added market has its own line. A read in
 * flight says so ("Reading…", never "not measured"), a failed read says it
 * failed with Retry, and a 200 without the dossier's shape is a failed read.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
/* useDocumentList reads the signed-in session (CanvasDocumentList.tsx); with
   no AuthProvider mounted, the real useAuth throws before Project home renders. */
vi.mock('@/services/portal/authService', async original => ({ ...await original<typeof import('@/services/portal/authService')>(), useAuth: () => ({ user: null }) }));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
import { ProjectHome } from '../surfaces/ProjectHome';
import { useActiveSurfaceContext, type SurfaceContext } from '../surfaceContext';

const PID = '22222222-2222-4222-8222-222222222222';
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
const props = () => ({
  surface: { id: 'project-home', label: 'Project' } as any,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biopharma',
});

function program(over: Record<string, unknown> = {}) {
  return {
    id: PID, code: 'BX-512', name: 'BX-512 · Vorelinib (IND)', program_type: 'IND',
    status: 'active', phase: 'clinical', priority: 'high', description: null,
    product_name: 'Vorelinib', indication: 'KIT-mutant gastrointestinal stromal tumor',
    intended_use: null, primary_agency: 'FDA', target_submission_date: null,
    sponsor_name: 'Concept2Cure Therapeutics', application_number: '000512',
    ...over,
  };
}

type Figure = { state: 'measured'; pct: number; counted: number; complete: number } | { state: 'no_sections'; pct: null } | { state: 'unavailable'; pct: null; reason: string };
const measured = (pct: number, counted = 40): Figure => ({ state: 'measured', pct, counted, complete: Math.round((pct * counted) / 100) });
const row = (module: string, label: string, figure: Figure, over: Record<string, unknown> = {}) => ({
  group: 'module', module, agency: null, label, documentId: 'doc_home', counted: 'counted' in figure ? figure.counted : 0,
  complete: 'complete' in figure ? figure.complete : 0, inReview: 0, drafted: 0, figure, lastUpdated: null, ...over,
});
function dossier(home: Figure, over: Record<string, unknown> = {}) {
  return { projectId: PID, measuredAt: '2026-10-22T09:00:00.000Z', home, markets: [], rows: home.state === 'measured' ? [row('2', 'Module 2 · Summaries', home)] : [], ...over };
}

/** The program row and the dossier the page reads (`dossierBody` a function for a failure or a hold). */
function mockProgram(rowData: Record<string, unknown>, dossierBody: unknown | (() => Promise<Response>) = dossier(measured(62))) {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === `/api/c2c/projects/${PID}`) return ok(rowData);
    if (url === `/api/c2c/projects/${PID}/dossier`) return typeof dossierBody === 'function' ? (dossierBody as () => Promise<Response>)() : ok(dossierBody);
    return ok({});
  });
}

function Probe({ onCtx }: { onCtx: (c: SurfaceContext | null) => void }) {
  onCtx(useActiveSurfaceContext('project-home'));
  return null;
}

beforeEach(() => {
  (window as any).C2C_PROJECT = { id: PID, title: 'BX-512' };
});
afterEach(() => {
  cleanup();
  delete (window as any).C2C_PROJECT;
});

describe('project home — Dossier readiness', () => {
  it('offers the existing choose-or-create door when no project is selected', async () => {
    delete (window as any).C2C_PROJECT;
    mockProgram(program());
    const p = props();
    render(<ProjectHome {...p} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Choose or create a project' }));
    expect(p.onNav).toHaveBeenCalledWith('projects');
    expect(apiRequest.mock.calls.some(([, url]) => String(url).includes('/dossier'))).toBe(false);
  });

  it('draws the dossier read’s figure, and ignores a stale progress_percent and the detail row', async () => {
    // A server that predates the fix would still send progress_percent: 0.
    mockProgram(program({ readiness: 10, progress_percent: 0 }), dossier(measured(62, 50)));
    const seen: { ctx: SurfaceContext | null } = { ctx: null };
    render(<><ProjectHome {...props()} /><Probe onCtx={(c) => { seen.ctx = c; }} /></>);
    const card = await readinessCard();
    await waitFor(() => expect(card.textContent).toContain('62%'));
    expect(card.textContent).toContain('31 of 50 sections approved or locked.');
    // F23 (8/9): what the count leaves out is said.
    expect(card.textContent).toContain('Empty headings that hold other sections are not counted.');
    expect(card.textContent).not.toMatch(/\b(0|10)%/);
    await waitFor(() => expect(seen.ctx?.summary).toContain('dossier readiness 62%'));
    expect((seen.ctx?.facts as { dossier?: { home?: unknown } }).dossier?.home).toEqual(measured(62, 50));
  });

  /* Filing-spine design review, open item 9 (2026-10-08): the figure is
     measured when the page reads it, and the card said nothing of when. */
  it('states when the server measured the figure', async () => {
    const at = '2026-10-08T21:14:00.000Z';
    mockProgram(program(), dossier(measured(62), { measuredAt: at }));
    render(<ProjectHome {...props()} />);
    const card = await readinessCard();
    await waitFor(() => expect(card.textContent).toContain(`Measured ${new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.`));
  });

  it('a program with no approved sections reads a measured 0%', async () => {
    mockProgram(program(), dossier(measured(0)));
    render(<ProjectHome {...props()} />);
    const card = await readinessCard();
    await waitFor(() => expect(card.textContent).toContain('0%'));
    expect(card.textContent).toContain('0 of 40 sections approved or locked.');
  });

  it('a program with nothing to measure is stated as "Not recorded", never left out or drawn as 0', async () => {
    mockProgram(program({ readiness: null, progress_percent: 0 }), dossier({ state: 'no_sections', pct: null }));
    const seen: { ctx: SurfaceContext | null } = { ctx: null };
    render(<><ProjectHome {...props()} /><Probe onCtx={(c) => { seen.ctx = c; }} /></>);
    await waitFor(() => expect(seen.ctx?.summary).toContain('dossier readiness Not recorded'));
    // The card is there, under the name the Projects card uses, and says what it is.
    const card = await readinessCard();
    expect(card.textContent).toMatch(/Not recorded/i);
    expect(card.textContent).not.toMatch(/\d+%/);
    expect(card.textContent).not.toMatch(/Measured/);
    expect(seen.ctx?.summary).not.toMatch(/\d+% complete|readiness \d+%/);
  });
});

describe('project home — one dossier read for the card and the module rows (F23)', () => {
  it('Author hands the critical-path question through the project’s existing AnA callback', async () => {
    mockProgram(program());
    const p = props();
    render(<ProjectHome {...p} />);
    fireEvent.click(await screen.findByRole('button', { name: /critical path to filing/i }));
    expect(p.onAsk).toHaveBeenCalledWith('What is the critical path to filing?');
    expect(p.onNav).not.toHaveBeenCalled();
  });

  it('every section in review reads 0% on the card and on its rows, with the review counted', async () => {
    const zero = measured(0, 12);
    mockProgram(program(), dossier(zero, { rows: [row('2', 'Module 2 · Summaries', zero, { inReview: 12 })] }));
    render(<ProjectHome {...props()} />);
    const card = await readinessCard();
    await waitFor(() => expect(card.textContent).toContain('0%'));
    const rowEl = await screen.findByText(/Module 2 · Summaries/);
    expect(rowEl.textContent).toContain('0 of 12 approved or locked · 12 in review');
    // At head the rollup weighted review as 75.
    expect(document.body.textContent).not.toContain('75%');
    expect(apiRequest.mock.calls.some(([, u]) => String(u).includes('/workstreams'))).toBe(false);
  });

  it('while the dossier is read the card says so, never "Not recorded"', async () => {
    mockProgram(program(), () => new Promise<Response>(() => {}));
    render(<ProjectHome {...props()} />);
    const card = await readinessCard();
    expect(card.textContent).toContain('Reading…');
    expect(card.textContent).not.toMatch(/Not recorded|\d+%/);
    expect(await screen.findByText('Loading module completion…')).toBeTruthy();
  });

  it('a failed read says it failed and offers Retry, which reads again; no 0 is drawn', async () => {
    let fail = true;
    mockProgram(program(), async () => (fail ? ({ ok: false, status: 500, json: async () => ({ error: 'boom' }) } as Response) : ok(dossier(measured(62)))));
    render(<ProjectHome {...props()} />);
    const card = await readinessCard();
    await waitFor(() => expect(card.textContent).toContain('Dossier readiness could not be read.'));
    expect(card.textContent).not.toMatch(/\d+%/);
    expect(await screen.findByText("Couldn't load module completion")).toBeTruthy();
    fail = false;
    (await screen.findAllByRole('button', { name: 'Retry' }))[0].click();
    await waitFor(() => expect(card.textContent).toContain('62%'));
  });

  it('a 200 without the dossier’s shape is a failed read, not an empty dossier', async () => {
    mockProgram(program(), { projectId: PID, home: { state: 'measured', pct: 62 } });
    render(<ProjectHome {...props()} />);
    const card = await readinessCard();
    await waitFor(() => expect(card.textContent).toContain('Dossier readiness could not be read.'));
    expect(screen.queryByText('No document sections yet')).toBeNull();
  });

  it('a store the server could not read says why, on the card and the rows', async () => {
    const reason = 'The governed section store is not provisioned in this environment.';
    mockProgram(program(), dossier({ state: 'unavailable', pct: null, reason }));
    render(<ProjectHome {...props()} />);
    const card = await readinessCard();
    await waitFor(() => expect(card.textContent).toContain(reason));
    expect(card.textContent).toContain('unavailable');
    expect(await screen.findByText('Module completion unavailable')).toBeTruthy();
  });

  it('an added market is its own line, and the header figure is the home filing’s', async () => {
    mockProgram(program(), dossier(measured(62, 50), {
      markets: [
        { scope: 'home', agency: 'fda', docType: 'ind', documentId: 'doc_home', figure: measured(62, 50), notHeld: [] },
        { scope: 'market', agency: 'ema', docType: 'maa', documentId: 'doc_ema', figure: measured(55, 60), notHeld: [{ key: '2.3', label: 'QOS' }, { key: '3.2.P.8', label: 'Stability' }] },
      ],
    }));
    render(<ProjectHome {...props()} />);
    const card = await readinessCard();
    await waitFor(() => expect(card.querySelector('[data-testid="pj-dossier-value"]')?.textContent).toBe('62%'));
    const line = card.querySelector('[data-testid="pj-dossier-market"]')!;
    expect(line.textContent).toContain('EMA · MAA: 55% · 33 of 60 sections approved or locked.');
    expect(line.textContent).toContain('2 required sections are not in this project');
  });
});

/** The aside card headed "Dossier readiness" — the one readiness the page states. */
async function readinessCard(): Promise<HTMLElement> {
  const h = await screen.findByText('Dossier readiness', { selector: 'h3' });
  return h.closest('.pj-card') as HTMLElement;
}
