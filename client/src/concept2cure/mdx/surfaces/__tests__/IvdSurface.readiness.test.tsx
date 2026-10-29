// @vitest-environment jsdom
/**
 * device-diagnostics draws the IVDR readiness board for the open project, and
 * mounts the IVD assessment workbench (D2, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-f2-ivd-completeness/).
 *
 * The family board (GSPR, analytical and clinical performance, scientific
 * validity, the PER, classification, PMPF) was drawn only by the separate
 * ivd-completeness screen, from the organization's records. IvdSurface had
 * per-program panels and no completeness or PER panel at all. It now draws the
 * same board (v2/surfaces/IvdReadinessBoard.tsx) as its readiness panel, read
 * with the project's id, and draws a response only when it says it covers that
 * project. A refused or failed read says so and draws no board.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IvdSurface } from '../IvdSurface';
import type { Program } from '../../data/programs';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

const PROGRAM = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  title: 'BX-Dx Assay',
  code: 'IVD-1',
  stageIdx: 3,
  status: 'active',
  dueLabel: 'No target set',
} as unknown as Program;

const family = (id: string, label: string, pct: number | null, items: Array<{ title: string; pct: number }> = []) => ({
  id, label, ref: `${label} ref`, blurb: `${label} blurb`, pct,
  items: items.map((i) => ({ code: id, title: i.title, ref: `${label} ref`, status: i.pct >= 100 ? 'complete' : 'review', pct: i.pct })),
});

/** The route's display shape, for the open project unless told otherwise. */
function board(over: Record<string, unknown> = {}) {
  return {
    scope: 'program', programId: PROGRAM.id, program: 'BX-Dx Assay',
    spine: 'EU IVDR 2017/746 · Annex II/III · Annex XIII', standard: 'IVDR', overall: 43,
    summary: { total: 7, evidenced: 3, inProgress: 0, notStarted: 4, unread: 0, flags: 0 },
    families: [
      family('gspr', 'General Safety & Performance Requirements', 100, [{ title: 'GSPR conformity (Annex I)', pct: 100 }]),
      family('anal', 'Analytical performance', 100, [{ title: 'Project LoD study', pct: 100 }]),
      family('clin', 'Clinical performance', 0),
      family('valid', 'Scientific validity', 0),
      family('per', 'Performance Evaluation Report (PER)', 0),
      family('desc', 'Device description & classification', 100, [{ title: 'BX-Dx Assay · Class C', pct: 100 }]),
      family('pmpf', 'Post-market performance & surveillance', 0),
    ],
    unread: [], gsprSourced: true, perDocumentPresent: false,
    ...over,
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;
let completeness: () => Response;
beforeEach(() => {
  completeness = () => json({ success: true, data: board() });
  fetchMock = vi.fn(async (url: string) => {
    if (url.startsWith('/api/ivd-completeness/')) return completeness();
    if (url.startsWith('/api/ivd-assessments')) return json({ rows: [], count: 0 });
    return json({ data: [] });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <IvdSurface program={PROGRAM} onAskAna={() => {}} onOpenEditor={() => {}} />
    </QueryClientProvider>,
  );
}
const urls = () => fetchMock.mock.calls.map(([u]) => String(u));

describe('IvdSurface draws the IVDR readiness board for the open project', () => {
  it('reads the board with the project\'s id and draws its families', async () => {
    mount();
    await screen.findByTestId('ivd-readiness-board');
    expect(urls()).toContain(`/api/ivd-completeness/completeness?program_id=${PROGRAM.id}`);
    expect(urls().filter((u) => u.startsWith('/api/ivd-completeness/'))).toEqual([
      `/api/ivd-completeness/completeness?program_id=${PROGRAM.id}`,
    ]);
    const panel = screen.getByTestId('ivd-readiness-panel');
    for (const label of ['General Safety & Performance Requirements', 'Performance Evaluation Report (PER)', 'Post-market performance & surveillance']) {
      expect(panel.textContent).toContain(label);
    }
    expect(panel.textContent).toContain('Project LoD study');
    expect(panel.textContent).toContain('This project\'s IVDR evidence coverage: 43%');
  });

  it('mounts the IVD assessment workbench for the same project', async () => {
    mount();
    await screen.findByRole('region', { name: 'IVD assessment workbench' });
    await waitFor(() => expect(urls()).toContain(`/api/ivd-assessments?program_id=${encodeURIComponent(PROGRAM.id)}`));
    expect(urls()).toContain(`/api/ivd-assessments/documents?program_id=${encodeURIComponent(PROGRAM.id)}`);
  });
});

describe('a read it may not draw says so, and is never an empty board', () => {
  it('a response for the organization is not drawn under a project', async () => {
    completeness = () => json({ success: true, data: board({ scope: 'organization', programId: undefined }) });
    mount();
    const refused = await screen.findByTestId('ivd-readiness-unread');
    expect(refused.textContent).toMatch(/not confirmed/i);
    expect(screen.queryByTestId('ivd-readiness-board')).toBeNull();
    expect(document.body.textContent).not.toContain('Project LoD study');
  });

  it('a response for another project is not drawn', async () => {
    completeness = () => json({ success: true, data: board({ programId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }) });
    mount();
    await screen.findByTestId('ivd-readiness-unread');
    expect(screen.queryByTestId('ivd-readiness-board')).toBeNull();
  });

  it('a project the organization does not own (404) says so', async () => {
    completeness = () => json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404);
    mount();
    const refused = await screen.findByTestId('ivd-readiness-unread');
    expect(refused.textContent).toMatch(/not found in your organization/);
    expect(document.body.textContent).not.toMatch(/Technical file complete|No IVDR technical-file records/);
  });

  it('an ownership check that could not run (503) says so', async () => {
    completeness = () => json({ error: { code: 'VERIFICATION_UNAVAILABLE', message: 'unavailable' } }, 503);
    mount();
    const refused = await screen.findByTestId('ivd-readiness-unread');
    expect(refused.textContent).toMatch(/unavailable/);
    expect(screen.queryByTestId('ivd-readiness-board')).toBeNull();
  });

  it('a failed read (500) says so', async () => {
    completeness = () => json({ success: false, error: 'Failed to compute IVD completeness' }, 500);
    mount();
    const refused = await screen.findByTestId('ivd-readiness-unread');
    expect(refused.textContent).toMatch(/could not be read/);
    expect(screen.queryByTestId('ivd-readiness-board')).toBeNull();
  });

  /* A 403 here is one of three facts, told apart by the server's code, never by
     its wording: the module gate's MODULE_NOT_LICENSED and LAUNCH_SCOPE
     (server/middleware/moduleEntitlementGate.ts) and the route's own
     IVD_NO_TENANT. The board read every 403 as the last (ivd-board-under-diagnostics). */
  it('a refusal by the module gate (403 MODULE_NOT_LICENSED) says the feature is not enabled, not that the organization is unconfirmed', async () => {
    completeness = () => json({
      error: 'Module access denied', code: 'MODULE_NOT_LICENSED', module: 'ivd-completeness', modules: ['ivd-completeness'],
      reason: "ivd-completeness: Module 'ivd-completeness' requires standard tier or higher (current: free)",
    }, 403);
    mount();
    const refused = await screen.findByTestId('ivd-readiness-unread');
    expect(refused.textContent).toContain('This feature is not enabled for your organization, so the IVDR readiness was not read.');
    expect(refused.textContent).not.toMatch(/could not be confirmed/);
    expect(screen.queryByTestId('ivd-readiness-board')).toBeNull();
  });

  it('a refusal outside the release (403 LAUNCH_SCOPE) says so', async () => {
    completeness = () => json({ error: { code: 'LAUNCH_SCOPE', message: 'This part of the product is not in this release.' } }, 403);
    mount();
    const refused = await screen.findByTestId('ivd-readiness-unread');
    expect(refused.textContent).toContain('This part of the product is not in this release, so the IVDR readiness was not read.');
    expect(refused.textContent).not.toMatch(/could not be confirmed|not enabled/);
  });

  it('an organization the route could not confirm (403 IVD_NO_TENANT) says so', async () => {
    completeness = () => json({ success: false, error: 'Organization context required', code: 'IVD_NO_TENANT' }, 403);
    mount();
    const refused = await screen.findByTestId('ivd-readiness-unread');
    expect(refused.textContent).toContain('Your organization could not be confirmed, so the IVDR readiness was not read.');
    expect(refused.textContent).not.toMatch(/not enabled|not in this release/);
  });

  it('a family that could not be read is "Not read", and no overall figure is shown', async () => {
    const data = board();
    data.families[0] = family('gspr', 'General Safety & Performance Requirements', null);
    completeness = () => json({ success: true, data: { ...data, overall: null, unread: ['gspr'] } });
    mount();
    const shown = await screen.findByTestId('ivd-readiness-board');
    // The family's own row, not the board's "Not read" tile.
    const row = screen.getByRole('button', { name: /General Safety & Performance Requirements/ });
    expect(row.textContent).toContain('Not read');
    expect(row.textContent).not.toMatch(/\d+%/);
    expect(shown.textContent).toMatch(/is not computed/);
    expect(shown.textContent).not.toMatch(/\d+%\s*Technical file complete/);
    expect(shown.textContent).toMatch(/could not be read \(General Safety & Performance Requirements\)/);
  });

  it('a project with no records reads empty, as a read that succeeded', async () => {
    completeness = () => json({ success: true, data: board({
      program: null, overall: 0,
      families: board().families.map((f) => ({ ...f, pct: 0, items: [] })),
    }) });
    mount();
    const empty = await screen.findByTestId('ivd-readiness-empty');
    expect(empty.textContent).toContain('No IVDR technical-file records for this project yet');
  });
});
