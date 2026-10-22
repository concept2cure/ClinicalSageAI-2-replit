// @vitest-environment jsdom
/**
 * POST /api/report-os/runs on a plan the server could not read is not "needs a
 * higher plan".
 *
 * Since 2026-10-15 the server's plan refusal (report-os.ts planRefusal) on an
 * unread plan carries `tier: null` and still names the gate's requiredTier
 * ('standard'). The canvas keyed on requiredTier alone, so it told the user the
 * report "needs a higher plan (standard)" — an upgrade the server never said
 * was needed. It now says the plan could not be read.
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
// The catalog the overview answers with (the canvas holds no copy of its own).
import { CANVAS_REPORT_TYPES } from './_insights-catalog-fixture';
import type { OwnedSurfaceViewProps } from '../surfaceViews';

const res = (status: number, obj: unknown) => ({ ok: status < 300, status, json: async () => obj }) as Response;
/** How apiRequest delivers a non-OK status other than 401: it throws, carrying the status and the body. */
const refusal = (status: number, payload: unknown) => Object.assign(new Error('refused'), { status, payload });
const PROPS: OwnedSurfaceViewProps = {
  surface: { id: 'insights', label: 'Insights' } as OwnedSurfaceViewProps['surface'],
  segment: 'biotech',
  onNav: () => {},
};
const OVERVIEW = {
  data: {
    organizationId: 1,
    tier: 'enterprise',
    segments: ['biotech'], reportTypes: CANVAS_REPORT_TYPES,
    leadProgram: {
      projectId: 1, code: 'BX204', label: 'BX204', filing: null, indication: null,
      readiness: 70, scope: 'program', scopeId: '1', agency: null, pdufa: null, criticalBlockerCount: 0,
    },
    portfolio: { programs: [] },
  },
};

const VIEWER = { id: 2, permissions: [] as string[] };
const MEMBER = { id: 3, permissions: ['governed:write'] };
let runsReply: Error;

beforeEach(() => {
  auth.user = VIEWER;
  runsReply = refusal(403, { error: 'Insufficient permissions' });
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (url.includes('/api/insights-canvas/overview')) return res(200, OVERVIEW);
    if (method === 'POST' && url === '/api/report-os/runs') throw runsReply;
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

describe('Insights canvas — a run refused on an unread plan', () => {
  beforeEach(() => { auth.user = MEMBER; });

  it('says the plan could not be read, not that a higher plan is needed', async () => {
    runsReply = refusal(403, {
      error: 'Your plan could not be read, so this report was not run.',
      feature: 'report',
      requiredTier: 'standard',
      tier: null,
    });
    await renderCanvas();
    ask('Generate the Executive Readiness Digest for BX204');
    await screen.findByText(/wasn't run — your plan could not be read\./);
    expect(screen.queryByText(/needs a higher plan/)).toBeNull();
  });

  it('a 403 naming a required plan over a READ tier is still a plan refusal', async () => {
    runsReply = refusal(403, { error: 'This report requires the enterprise plan.', requiredTier: 'enterprise', tier: 'standard' });
    await renderCanvas();
    ask('Generate the Executive Readiness Digest for BX204');
    await screen.findByText(/needs a higher plan \(enterprise\)/);
  });
});
