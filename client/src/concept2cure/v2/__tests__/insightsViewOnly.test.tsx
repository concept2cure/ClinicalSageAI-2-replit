// @vitest-environment jsdom
/**
 * A viewer reads the reporting canvas and is told it is view only; a refusal
 * from the write gate is never reported as a plan refusal.
 *
 * Reporting review 2026-10-01: every write under /api/report-os and
 * /api/insights now needs a writing role (requireEditorAccessForWrites). The
 * canvas offered a viewer "Run report" tiles the server refuses, and mapped
 * every 403 from POST /runs to "needs a higher plan", so a viewer would have
 * been told to upgrade. A plan refusal carries requiredTier; the write gate's
 * does not.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
const auth = vi.hoisted(() => ({ user: null as null | { id: number; permissions: string[] } }));
vi.mock('@/services/portal/authService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portal/authService')>()),
  useAuthUser: () => auth.user,
}));

import { InsightsCanvas } from '../surfaces/Insights';
import type { OwnedSurfaceViewProps } from '../surfaceViews';

const res = (status: number, obj: unknown) => ({ ok: status < 300, status, json: async () => obj }) as Response;
const PROPS: OwnedSurfaceViewProps = {
  surface: { id: 'insights', label: 'Insights' } as OwnedSurfaceViewProps['surface'],
  segment: 'biotech',
  onNav: () => {},
};
const OVERVIEW = {
  data: {
    organizationId: 1,
    tier: 'enterprise',
    segments: ['biotech'],
    leadProgram: {
      projectId: 1, code: 'BX204', label: 'BX204', filing: null, indication: null,
      readiness: 70, scope: 'program', scopeId: '1', agency: null, pdufa: null, criticalBlockerCount: 0,
    },
    portfolio: { programs: [] },
  },
};

const VIEWER = { id: 2, permissions: [] as string[] };
const MEMBER = { id: 3, permissions: ['governed:write'] };
let runsReply: Response;

beforeEach(() => {
  auth.user = VIEWER;
  runsReply = res(403, { error: 'Insufficient permissions' });
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (url.includes('/api/insights-canvas/overview')) return res(200, OVERVIEW);
    if (method === 'POST' && url === '/api/report-os/runs') return runsReply;
    return res(200, {});
  });
});
afterEach(() => cleanup());

async function renderCanvas() {
  render(<InsightsCanvas {...PROPS} />);
  await waitFor(() => expect(document.querySelector('.rc-ana-head')).not.toBeNull());
}

function ask(text: string) {
  const composer = document.querySelector('.rc-input textarea') as HTMLTextAreaElement;
  fireEvent.change(composer, { target: { value: text } });
  fireEvent.keyDown(composer, { key: 'Enter' });
}

const runsCalls = () => apiRequest.mock.calls.filter(([m, u]) => m === 'POST' && u === '/api/report-os/runs');

describe('Insights canvas — a viewer', () => {
  it('is told the canvas is view only', async () => {
    await renderCanvas();
    expect(screen.getByTestId('rc-view-only').textContent).toMatch(/View only/);
  });

  it('is shown pack tiles it cannot run, not run buttons', async () => {
    await renderCanvas();
    fireEvent.click(document.querySelector('.rc-preset-btn') as HTMLElement);
    await waitFor(() => expect(document.querySelector('.ro-pack-grid')).not.toBeNull());
    expect(document.querySelectorAll('button.ro-pack-card')).toHaveLength(0);
    expect(screen.getAllByText(/Running a report needs an editor role/).length).toBeGreaterThan(0);
  });

  it('asking for a report sends no run and says why', async () => {
    await renderCanvas();
    ask('Generate the Executive Readiness Digest for BX204');
    await screen.findByText(/wasn't run\. Running a report creates a governed record/);
    expect(runsCalls()).toHaveLength(0);
  });
});

describe('Insights canvas — a member', () => {
  beforeEach(() => { auth.user = MEMBER; });

  it('sees no view-only note and gets runnable tiles', async () => {
    await renderCanvas();
    expect(screen.queryByTestId('rc-view-only')).toBeNull();
    fireEvent.click(document.querySelector('.rc-preset-btn') as HTMLElement);
    await waitFor(() => expect(document.querySelectorAll('button.ro-pack-card').length).toBeGreaterThan(0));
  });

  it('a 403 from the write gate is not reported as a plan refusal', async () => {
    await renderCanvas();
    ask('Generate the Executive Readiness Digest for BX204');
    await screen.findByText(/wasn't run — Insufficient permissions/);
    expect(runsCalls()).toHaveLength(1);
    expect(screen.queryByText(/needs a higher plan/)).toBeNull();
  });

  it('a 403 that names a required plan is still reported as one', async () => {
    runsReply = res(403, { error: 'This report requires the enterprise plan.', requiredTier: 'enterprise' });
    await renderCanvas();
    ask('Generate the Executive Readiness Digest for BX204');
    await screen.findByText(/needs a higher plan \(enterprise\)/);
  });
});
