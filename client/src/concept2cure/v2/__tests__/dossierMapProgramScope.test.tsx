// @vitest-environment jsdom
/**
 * DossierMap — scoped to the open program by its UUID, and honest about a
 * program that has no CTD section store to map.
 *
 * ── The defect (VSR-001 F-7, OQ-SUBC-10) ────────────────────────────────────
 * The shell publishes the open program's `regulatory_programs` UUID; the
 * surface forwarded it as `?projectId=` and the route parseInt'd it. A UUID
 * whose leading characters are digits became an unrelated integer project id
 * (500 observed); otherwise 400. The route now resolves the UUID through the
 * program → PM-spine anchor and answers `meta.anchored:false` when the program
 * has no anchor — a real, expected state (intake reports
 * `projectAnchorSkipped: NO_CLIENT_WORKSPACE`).
 *
 * This surface must (1) read the program through the shell's one reader,
 * (2) send the UUID verbatim, and (3) render the unanchored answer as what it
 * is, not as "no dossier map yet" — the sections are not missing, the store
 * that would hold them does not exist for this program.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { DossierMap } from '../surfaces/DossierMap';

const PROGRAM_UUID = '6191805f-e83d-4327-af00-aa2c6f4d43b0';
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body } as Response);
const props = () =>
  ({ surface: { id: 'dossier-map', label: 'Dossier map' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'regulatory' });
const text = () => document.body.textContent ?? '';

beforeEach(() => {
  apiRequest.mockReset();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROGRAM_UUID, title: 'BX204' };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('DossierMap — program UUID scope (F-7)', () => {
  it('asks for the open program by its UUID, verbatim, and renders the anchored map', async () => {
    apiRequest.mockImplementation(async (_m: string, rawUrl: unknown) => {
      const url = String(rawUrl ?? '');
      if (url === `/api/dossier-map?projectId=${PROGRAM_UUID}`) {
        return ok({
          data: [{ m: '3', label: 'Quality', pct: 25, tone: 'warn', sections: ['3.2.P Drug Product'] }],
          meta: { count: 1, source: 'project_sections', programId: PROGRAM_UUID, projectId: 42, anchored: true },
        });
      }
      return ok({ success: true, data: null });
    });
    render(<DossierMap {...props()} />);
    await waitFor(() => expect(text()).toMatch(/M3/));
    expect(text()).toMatch(/Quality/);
    expect(text()).toMatch(/3\.2\.P Drug Product/);
    const urls = apiRequest.mock.calls.map((c) => String(c[1]));
    expect(urls).toContain(`/api/dossier-map?projectId=${PROGRAM_UUID}`);
    // Never an integer derived from the UUID.
    expect(urls.some((u) => /projectId=6191805(&|$)/.test(u))).toBe(false);
  });

  it('an unanchored program is shown as "no section store", not as an empty dossier', async () => {
    apiRequest.mockImplementation(async () =>
      ok({ data: [], meta: { count: 0, source: 'project_sections', programId: PROGRAM_UUID, projectId: null, anchored: false, reason: 'PROGRAM_UNANCHORED' } }),
    );
    render(<DossierMap {...props()} />);
    await waitFor(() => expect(text()).toMatch(/section-tracking store/i));
    // Pre-fix this rendered the generic "No dossier map yet", which claims the
    // program tracks sections and none are authored — neither is established.
    expect(text()).not.toMatch(/No dossier map yet/);
  });

  it('a program whose anchored project tracks no sections keeps the genuine empty state', async () => {
    apiRequest.mockImplementation(async () =>
      ok({ data: [], meta: { count: 0, source: 'project_sections', programId: PROGRAM_UUID, projectId: 42, anchored: true } }),
    );
    render(<DossierMap {...props()} />);
    await waitFor(() => expect(text()).toMatch(/No dossier map yet/));
  });

  it('with no program open, nothing is fetched and the surface says so', async () => {
    delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
    render(<DossierMap {...props()} />);
    await waitFor(() => expect(text()).toMatch(/Open a project/));
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
