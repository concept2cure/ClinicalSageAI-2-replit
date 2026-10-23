// @vitest-environment jsdom
/**
 * A market's own part of the filing in the editor (FILING_SPINE F22b).
 *
 * A project that added EMA's MAA holds two governed documents: the home NDA
 * filing and the EU document with its Module 1 and 3.2.R. The outline shows
 * the filing the open document is the editing copy of, so:
 *   - in the home copy, the outline is the home filing, and the project's
 *     filings are listed: the EU one has no copy yet and offers to create one,
 *     bound to it by the server, then opened;
 *   - in the EU copy, the outline is the EU Module 1 and 3.2.R, never the home
 *     modules; the sections EMA requires that the home filing lacks are named,
 *     and nothing is offered for them; a Module 1 node starts in this copy;
 *   - a market list that could not be read is said, and the home outline stays.
 * Each action's name is its visible text; the filing is its description
 * (accessibility review, 2026-10-15).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async original => {
  const actual = await original<typeof import('@/services/portal/authService')>();
  return {
    ...actual,
    authService: {
      getUser: vi.fn().mockReturnValue({ id: 1, organizationId: 1 }),
      captureSessionReadGuard: actual.authService.captureSessionReadGuard.bind(actual.authService),
      on: actual.authService.on.bind(actual.authService),
    },
    useAuth: () => ({ user: { displayName: 'Test Author', email: 'author@test.co' } }),
  };
});

import { DocumentAuthoring } from '../surfaces/DocumentAuthoring';

const PROJECT_ID = '11111111-2222-3333-4444-555555555555';
const HOME = 'doc_home';
const EMA = 'doc_ema';

const ok = (payload: unknown, status = 200) => ({ ok: true, status, json: async () => payload }) as Response;
const node = (key: string, label: string, order: number, parent: string | null = null) => ({
  key, parent_key: parent, label, mandatory: true, path_order: order, status: 'todo', draft_source: null, has_content: false, version: 1,
});

interface DocRow { id: string; title: string; module: string; status: string; c2c_document_id: string | null }
const HOME_COPY: DocRow = { id: 'D1', title: 'NDA filing', module: 'M2', status: 'draft', c2c_document_id: HOME };
const EMA_COPY: DocRow = { id: 'D2', title: 'Vorelinib — EU MAA', module: 'M1', status: 'draft', c2c_document_id: EMA };

const HOME_DOC = { id: HOME, doc_type: 'nda', agency: 'fda', title: 'Vorelinib — NDA', rule_pack_version: 'v1', status: 'draft', readiness: 0 };
const EMA_DOC = { id: EMA, doc_type: 'maa', agency: 'ema', title: 'Vorelinib — EU MAA', rule_pack_version: 'v1', status: 'draft', readiness: 0 };
const OUTLINES: Record<string, unknown> = {
  [`/api/c2c/documents/${HOME}/outline`]: {
    document: { ...HOME_DOC, filing_scope: 'home' },
    outline: [node('2.5', 'Clinical overview', 1), node('3.2.P', 'Drug product', 2)],
    gaps: [],
  },
  [`/api/c2c/documents/${EMA}/outline`]: {
    document: { ...EMA_DOC, filing_scope: 'market' },
    outline: [node('M1', 'Module 1 (EU)', 1), node('1.3.1', 'Summary of product characteristics', 2, 'M1'), node('M3', 'Module 3', 3), node('3.2.R', 'Regional information', 4, 'M3')],
    gaps: [{ key: '3.2.A', label: 'Appendices' }],
  },
};

function wire(opts: { docs: DocRow[]; marketsFail?: boolean }) {
  const docs = [...opts.docs];
  const gets: Array<[(url: string) => boolean, () => Response]> = [
    [(u) => u.startsWith('/api/authoring/docs?'), () => ok({ success: true, documents: docs.map((d) => ({ product_code: 'ABC', updated_at: '2026-10-15T10:00:00Z', section_count: 0, ...d })) })],
    [(u) => /^\/api\/authoring\/docs\/[^/]+\/sections$/.test(u), () => ok({ success: true, sections: [] })],
    [(u) => u.endsWith('&scope=home'), () => ok({ documents: [HOME_DOC] })],
    [(u) => u.endsWith('&scope=market'), () => (opts.marketsFail
      ? ({ ok: false, status: 503, json: async () => ({ error: 'INTERNAL_ERROR' }) } as Response)
      : ok({ documents: [EMA_DOC] }))],
  ];
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: Record<string, unknown>) => {
    if (method === 'GET') {
      if (url in OUTLINES) return ok(OUTLINES[url]);
      return (gets.find(([match]) => match(url))?.[1] ?? (() => ok({ success: true })))();
    }
    if (url === '/api/authoring/docs') {
      docs.push({ ...EMA_COPY, title: String(body?.title) });
      return ok({ success: true, document: { id: 'D2' } }, 201);
    }
    return ok({ success: true, section: { id: 'S9', code: body?.code, title: body?.title } }, 201);
  });
}

const props = () => ({ surface: { id: 'document-authoring', label: 'Authoring' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biotech' });
const rowLabel = (label: string) => screen.findByText(label, { selector: '.ed-tree-row .ed-lbl' });

beforeEach(() => { (window as any).C2C_PROJECT = { id: PROJECT_ID }; });
afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; });

describe("a market's own part of the filing in the editor (F22b)", () => {
  it("in the home copy: the home outline, and the EU filing offers to create its document, bound by the server", async () => {
    wire({ docs: [HOME_COPY] });
    render(<DocumentAuthoring {...props()} />);
    await rowLabel('Clinical overview');
    const filings = await screen.findByTestId('ed-filings');
    expect(filings.textContent).toContain('FDA · NDA — home filing');
    expect(filings.textContent).toContain('EMA · MAA — Module 1 and 3.2.R');
    fireEvent.click(within(filings).getByRole('button', { name: 'Create editing copy', description: /EMA · MAA/ }));
    await waitFor(() => expect(apiRequest.mock.calls.some(([m, u]) => m === 'POST' && u === '/api/authoring/docs')).toBe(true));
    const post = apiRequest.mock.calls.find(([m, u]) => m === 'POST' && u === '/api/authoring/docs')!;
    expect(post[2]).toEqual({ title: 'Vorelinib — EU MAA', module: 'M1', client_program_id: PROJECT_ID, c2c_document_id: EMA });
    // Opened: the outline is now the EU document's.
    expect(await rowLabel('Summary of product characteristics')).toBeTruthy();
    // Focus is on the opened document's name, not lost with the button
    // (accessibility review, 2026-10-15).
    await waitFor(() => expect(document.activeElement?.classList.contains('ed-tree-t')).toBe(true));
  });

  it('in the EU copy: its Module 1 and 3.2.R, the gaps named, a Module 1 node starts here', async () => {
    wire({ docs: [EMA_COPY, HOME_COPY] });
    render(<DocumentAuthoring {...props()} />);
    const smpc = (await rowLabel('Summary of product characteristics')).closest('button') as HTMLButtonElement;
    expect(screen.queryByText('Clinical overview', { selector: '.ed-tree-row .ed-lbl' })).toBeNull();
    const gaps = await screen.findByTestId('ed-filing-gaps');
    expect(gaps.textContent).toContain('EMA requires a section the home filing does not hold');
    expect(gaps.textContent).toContain('3.2.A Appendices');
    expect(within(gaps).queryByRole('button')).toBeNull();
    await waitFor(() => expect(smpc.getAttribute('title') ?? '').toMatch(/Select to start it/));
    fireEvent.click(smpc);
    await waitFor(() => expect(apiRequest.mock.calls.some(([m, u]) => m === 'POST' && u === '/api/authoring/sections')).toBe(true));
    const post = apiRequest.mock.calls.find(([m, u]) => m === 'POST' && u === '/api/authoring/sections')!;
    expect(post[2]).toMatchObject({ doc_id: 'D2', code: '1.3.1' });
  });

  it('a market list that could not be read is said, and the home outline stays', async () => {
    wire({ docs: [HOME_COPY], marketsFail: true });
    render(<DocumentAuthoring {...props()} />);
    await rowLabel('Clinical overview');
    expect((await screen.findByText(/markets added to this project could not be read/)).getAttribute('role')).toBe('status');
  });
});
