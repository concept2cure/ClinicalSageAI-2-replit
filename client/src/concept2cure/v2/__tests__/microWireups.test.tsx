// @vitest-environment jsdom
/**
 * §4.3 micro wire-ups — three previously-documented-but-unwired paths:
 *  • Dossier binds GET /api/dossier-readiness/:projectId (was a comment only)
 *  • HAQ Route-to-review/Approve POST the real store endpoints via the numeric
 *    dbId now emitted by /rounds (was a local-only statusMap overlay)
 *  • PrecedentEngine saves/reloads queries on /api/saved-precedent-queries
 *    (the form previously could not persist a query at all)
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Dossier } from '../surfaces/Dossier';
import { HaqManager } from '../surfaces/HaqManager';
import { PrecedentEngine } from '../surfaces/PrecedentEngine';

function ok(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}
const props = () => ({ surface: { id: 'x', label: 'X' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; });
beforeEach(() => apiRequest.mockReset());

describe('Dossier — per-section readiness binding', () => {
  it('binds the real readiness endpoint and renders the section rollups', async () => {
    (window as any).C2C_PROJECT = { id: 42 };
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === '/api/dossier-readiness/42') return ok({
        projectId: 42,
        sections: [{ ctdSection: '3.2.P.5', status: 'review', artifactCount: 4, draftCount: 1, reviewCount: 2, approvedCount: 1, lockedCount: 0, lastUpdated: '2026-07-20T00:00:00Z' }],
        summary: { totalSections: 1, readySections: 0, inProgressSections: 1, draftSections: 0 },
      });
      return ok({});
    });
    render(<Dossier {...props()} />);
    expect(await screen.findByText('3.2.P.5')).toBeTruthy();
    expect(screen.getByText('1 / 2 / 1 / 0')).toBeTruthy();
    expect(screen.getByText('review')).toBeTruthy();
  });

  it('asks for a program honestly with no numeric project (no call)', () => {
    render(<Dossier {...props()} />);
    expect(screen.getByText(/Open a program to see its dossier readiness/)).toBeTruthy();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

describe('HaqManager — governed transitions via dbId', () => {
  const ROUNDS = {
    data: {
      rounds: [{ id: 'L-1', agency: 'FDA', flag: '🇺🇸', authority: 'CDER', submission: 'NDA 215-000', type: 'IR', received: '2026-07-01', due: '2026-07-30', clockDays: 9, clockTotal: 30, note: '' }],
      questions: { 'L-1': [{ id: 'IR-07', dbId: 934, disc: 'CMC', tone: 'firm', status: 'draft', owner: 'ML', q: 'Justify the dissolution spec.', analysis: '', draft: '', cites: [], commitments: [], precedentNote: '', roundId: 'L-1' }] },
    },
    meta: { count: 1 },
  };

  it('Route to review POSTs the real endpoint with the numeric dbId and adopts the server status', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/haq-manager/rounds') return ok(ROUNDS);
      if (method === 'POST' && url === '/api/haq-manager/letters/L-1/questions/934/review') return ok({ success: true, data: { status: 'in_review' } });
      return ok({});
    });
    render(<HaqManager {...props()} />);
    await screen.findAllByText(/Justify the dissolution spec/);
    fireEvent.click(screen.getByRole('button', { name: /Route to review/ }));
    await waitFor(() => expect(apiRequest.mock.calls.some((c) => c[0] === 'POST' && c[1] === '/api/haq-manager/letters/L-1/questions/934/review')).toBe(true));
    expect(await screen.findByText(/persisted to the HAQ store/)).toBeTruthy();
  });

  it('refuses honestly when the feed lacks the numeric dbId (no call)', async () => {
    const noDbId = JSON.parse(JSON.stringify(ROUNDS));
    delete noDbId.data.questions['L-1'][0].dbId;
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/haq-manager/rounds') return ok(noDbId);
      return ok({});
    });
    render(<HaqManager {...props()} />);
    await screen.findAllByText(/Justify the dissolution spec/);
    fireEvent.click(screen.getByRole('button', { name: /Route to review/ }));
    expect(await screen.findByText(/predates the id-mapped feed/)).toBeTruthy();
    expect(apiRequest.mock.calls.some((c) => c[0] === 'POST')).toBe(false);
  });
});

describe('PrecedentEngine — saved queries', () => {
  beforeEach(() => {
    apiRequest.mockImplementation(async (method: string, url: string, body?: any) => {
      if (method === 'GET' && url.startsWith('/api/precedent-engine-board')) return ok({ results: [] });
      if (method === 'GET' && url === '/api/saved-precedent-queries/') return ok({ data: [{ id: 5, label: 'QBJ · 510(k) · CGM', query: JSON.stringify({ submissionType: '510(k)', therapeuticArea: 'Diabetes', indication: 'CGM 14-day', productCode: 'QBJ' }), scope: { productCode: 'QBJ', pathway: '510k' } }] });
      if (method === 'POST' && url === '/api/saved-precedent-queries/') return ok({ data: { id: 9, label: body.label, query: body.query, scope: body.scope } }, 201);
      if (method === 'PATCH' && url === '/api/saved-precedent-queries/5') return ok({ data: { id: 5 } });
      return ok({ data: null });
    });
  });

  it('lists saved queries and reloads one into the form (running it)', async () => {
    render(<PrecedentEngine {...props()} />);
    const chip = await screen.findByRole('button', { name: 'QBJ · 510(k) · CGM' });
    fireEvent.click(chip);
    // The board refetches with the saved query's fields committed.
    await waitFor(() => {
      const boards = apiRequest.mock.calls.filter((c) => String(c[1]).startsWith('/api/precedent-engine-board'));
      expect(boards.some((c) => String(c[1]).includes('indication=CGM+14-day'))).toBe(true);
    });
    // lastRunAt stamped via PATCH {refresh:true}.
    await waitFor(() => expect(apiRequest.mock.calls.some((c) => c[0] === 'PATCH' && c[1] === '/api/saved-precedent-queries/5')).toBe(true));
  });

  it('saves the current query via POST with the JSON round-trip + normalized scope', async () => {
    render(<PrecedentEngine {...props()} />);
    await screen.findByRole('button', { name: /Save query/ });

    // Type the product code rather than relying on a seeded one. The form used
    // to start pre-filled with an INVENTED programme (therapeutic area
    // 'Diabetes', product code 'QBJ') and this assertion read that constant
    // back out — so it proved the fabrication round-tripped, not that a user's
    // input does. The seed is gone (see the header of PrecedentEngine.tsx: the
    // surface was speaking invented product context back to the user and into
    // the AnA conversation as their own words), so the test now supplies the
    // value the way a person would. Strictly stronger: it now shows the save
    // carries USER input.
    fireEvent.change(screen.getByLabelText('Product code'), { target: { value: 'QBJ' } });

    fireEvent.click(screen.getByRole('button', { name: /Save query/ }));
    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[0] === 'POST' && c[1] === '/api/saved-precedent-queries/');
      expect(call).toBeTruthy();
      const body = call![2] as { label: string; query: string; scope: any };
      expect(JSON.parse(body.query)).toMatchObject({ submissionType: '510(k)', productCode: 'QBJ' });
      expect(body.scope).toMatchObject({ productCode: 'QBJ', pathway: '510k' });
    });
    expect(await screen.findByText(/Query saved/)).toBeTruthy();
  });
});
