// @vitest-environment jsdom
/**
 * §4.3 micro wire-ups — three previously-documented-but-unwired paths:
 *  • Author preserves artifact rollups through GET /api/c2c/projects/:id/dossier (A2.7)
 *  • Health authority questions is a view of the project's agency inbox (the
 *    /api/haq-manager store it used to call was retired 2026-10-18)
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

import { ModuleCompletion, useProjectDossier } from '../surfaces/ProjectDossier';
import { HaqManager } from '../surfaces/HaqManager';
import { PrecedentEngine } from '../surfaces/PrecedentEngine';

function ok(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}
const props = () => ({ surface: { id: 'x', label: 'X' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; });
beforeEach(() => apiRequest.mockReset());

const PROGRAM = '6191805f-e83d-4327-af00-aa2c6f4d43b0';
function DossierProjection() {
  const read = useProjectDossier(PROGRAM);
  return <ModuleCompletion read={read} docForModule={() => null} onOpen={vi.fn()} />;
}

describe('Author — preserved per-section artifact readiness binding', () => {
  it('reads the canonical program dossier and renders artifact rollups without the retired numeric route', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === `/api/c2c/projects/${PROGRAM}/dossier`) return ok({
        projectId: PROGRAM, measuredAt: '2026-10-26T00:00:00Z', home: { state: 'no_sections', pct: null }, markets: [], rows: [],
        artifactReadiness: {
            basis: 'governed_artifacts', state: 'measured',
            sections: [{ ctdSection: '3.2.P.5', status: 'review', artifactCount: 4, draftCount: 0, reviewCount: 2, approvedCount: 1, lockedCount: 1, unknownCount: 0, lastUpdated: '2026-07-20T00:00:00Z' }],
            summary: { totalSections: 1, readySections: 0, inProgressSections: 1, draftSections: 0, notAssessedSections: 0 },
          },
        supportingReadiness: {
          sectionTracking: { state: 'read', modules: [] },
        },
      });
      return ok({});
    });
    render(<DossierProjection />);
    expect(await screen.findByText('3.2.P.5')).toBeTruthy();
    expect(screen.getByText('0 / 2 / 1 / 1 / 0')).toBeTruthy();
    expect(screen.getByText('In review')).toBeTruthy();
    expect(apiRequest.mock.calls.some(([, u]) => String(u).startsWith('/api/dossier-readiness'))).toBe(false);
  });
  // The former no-numeric-project empty state is now the actual Projects
  // destination, covered by projectDestinationShell and projectHomeReadiness.
});

describe('HaqManager — a view of the project inbox, not a store of its own (2026-10-18)', () => {
  const INBOX = '/api/concept2cure/projects/42/agency-communications';
  const row = (over: Record<string, unknown>) => ({
    id: 'ace_1', sourceType: 'uploaded_official_correspondence', communicationType: 'FDA information request',
    sourceChannel: 'esg', linkedSectionCodes: [], linkedArtifactIds: [], receivedDate: '2026-10-12T00:00:00.000Z',
    urgency: 'high', responseRequired: true, extractedIssues: [], humanReviewStatus: 'triaged', closureStatus: 'in_progress',
    ...over,
  });

  it('lists the letters awaiting a response from the inbox, and calls no /api/haq-manager path', async () => {
    (window as any).C2C_PROJECT = { id: 42 };
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === INBOX) {
        return ok({ success: true, data: [
          row({}),
          row({ id: 'ace_2', communicationType: 'Acknowledgement of receipt', responseRequired: false }),
          row({ id: 'ace_3', communicationType: 'Closed IR', closureStatus: 'closed' }),
        ] });
      }
      return ok({});
    });
    render(<HaqManager {...props()} />);
    expect(await screen.findByText('FDA information request')).toBeTruthy();
    expect(screen.queryByText('Acknowledgement of receipt')).toBeNull();
    expect(screen.queryByText('Closed IR')).toBeNull();
    expect(screen.getByRole('button', { name: /Questions & responses/ })).toBeTruthy();
    expect(apiRequest.mock.calls.some((c) => String(c[1]).startsWith('/api/haq-manager'))).toBe(false);
  });

  it('with no project open, says so and reads nothing', async () => {
    render(<HaqManager {...props()} />);
    expect(await screen.findByText(/Open a project to see its agency communications/)).toBeTruthy();
    expect(apiRequest).not.toHaveBeenCalled();
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
