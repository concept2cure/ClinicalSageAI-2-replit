// @vitest-environment jsdom
/**
 * Projects — a paged portfolio says it is paged.
 *
 * GET /api/c2c/projects answers one page (50 by default) with `meta.hasMore`.
 * The surface ignored it: an organisation with 80 programs read "50 active
 * programs", the portfolio mean covered 50, search could not find the 51st, and
 * AnA was told the 50 were the portfolio. Found by the 2026-09-24 re-baseline.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: 7, firstName: 'Ada' } }),
}));

import { Projects } from '../surfaces/Projects';
import { useActiveSurfaceContext, type SurfaceContext } from '../surfaceContext';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as never;
const props = () =>
  ({ surface: { id: 'projects', label: 'Projects' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

const row = (i: number) => ({
  id: `p${i}`, title: `Program ${i}`, ws: 'Pharma', code: `PX-${i}`, stage: 'author',
  readiness: 40, status: 'active', lead: 'Rae Okafor', blocker: null, due: 'Q4',
});

function portfolio(hasMore: boolean) {
  apiRequest.mockImplementation(async (_m: string, url: string) =>
    url === '/api/c2c/projects'
      ? ok({ data: [row(1), row(2)], meta: { count: 2, limit: 2, offset: 0, hasMore } })
      : ok({ data: [] }),
  );
}

function Probe({ onCtx }: { onCtx: (c: SurfaceContext | null) => void }) {
  onCtx(useActiveSurfaceContext('projects'));
  return null;
}

afterEach(cleanup);
beforeEach(() => apiRequest.mockReset());

describe('Projects — a truncated portfolio read', () => {
  it('says the list is the first page, and the count is a floor', async () => {
    portfolio(true);
    const seen: { ctx: SurfaceContext | null } = { ctx: null };
    render(<><Projects {...props()} /><Probe onCtx={(c) => { seen.ctx = c; }} /></>);
    const note = await screen.findByText(/Showing the first 2 programs/);
    expect(note.textContent).toMatch(/cover these only/);
    expect(document.querySelector('.pj-summary')?.textContent).toContain('2+ active programs');
    await waitFor(() => expect(seen.ctx?.summary).toMatch(/first 2 .*more exist/));
    expect((seen.ctx?.facts as { portfolioTruncated?: unknown }).portfolioTruncated).toBe(true);
  });

  it('a complete read says nothing extra', async () => {
    portfolio(false);
    render(<Projects {...props()} />);
    await screen.findAllByText('Program 1');
    expect(screen.queryByText(/Showing the first/)).toBeNull();
    expect(document.querySelector('.pj-summary')?.textContent).toContain('2 active programs');
    expect(document.querySelector('.pj-summary')?.textContent).not.toContain('2+');
  });
});
