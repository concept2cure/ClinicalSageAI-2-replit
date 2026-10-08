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
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
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

function mockProgram(row: Record<string, unknown>) {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === `/api/c2c/projects/${PID}`) return ok(row);
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
  it('draws the governed readiness, and ignores a stale progress_percent', async () => {
    // A server that predates the fix would still send progress_percent: 0.
    mockProgram(program({ readiness: 62, progress_percent: 0 }));
    const seen: { ctx: SurfaceContext | null } = { ctx: null };
    render(<><ProjectHome {...props()} /><Probe onCtx={(c) => { seen.ctx = c; }} /></>);
    const card = await readinessCard();
    expect(card.textContent).toContain('62%');
    expect(card.textContent).not.toContain('0%');
    await waitFor(() => expect(seen.ctx?.summary).toContain('dossier readiness 62%'));
    expect((seen.ctx?.facts as { program?: { progressPercent?: unknown } }).program?.progressPercent).toBe(62);
  });

  it('a program with no approved sections reads 0%, the same as its card', async () => {
    mockProgram(program({ readiness: 0 }));
    render(<ProjectHome {...props()} />);
    expect((await readinessCard()).textContent).toContain('0%');
  });

  it('readiness that could not be measured is stated as "not measured", never left out or drawn as 0', async () => {
    mockProgram(program({ readiness: null, progress_percent: 0 }));
    const seen: { ctx: SurfaceContext | null } = { ctx: null };
    render(<><ProjectHome {...props()} /><Probe onCtx={(c) => { seen.ctx = c; }} /></>);
    await waitFor(() => expect(seen.ctx?.summary).toContain('BX-512'));
    // The card is there, under the name the Projects card uses, and says what it is.
    const card = await readinessCard();
    expect(card.textContent).toMatch(/not measured/i);
    expect(card.textContent).not.toMatch(/\d+%/);
    expect(seen.ctx?.summary).toContain('dossier readiness not measured');
    expect(seen.ctx?.summary).not.toMatch(/\d+% complete|readiness \d+%/);
  });
});

/** The aside card headed "Dossier readiness" — the one readiness the page states. */
async function readinessCard(): Promise<HTMLElement> {
  const h = await screen.findByText('Dossier readiness', { selector: 'h3' });
  return h.closest('.pj-card') as HTMLElement;
}
