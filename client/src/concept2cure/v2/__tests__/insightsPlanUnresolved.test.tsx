// @vitest-environment jsdom
/**
 * A plan the server could not read is not presented as the Standard plan.
 *
 * HS-1008-4, honest-state review 2026-10-08. `requireReportEntitlement` wraps
 * the capability lookup in `catch { tier = 'standard' }` and passed the
 * assumption on unflagged, so an enterprise customer whose lookup threw saw
 * "Plan: Standard", a wall of locked tiles, and nothing to say their plan had
 * not been read — they would reasonably conclude they were on the wrong plan.
 *
 * Explicit unresolved state withholds every run and gives a verification
 * reason, while saved records and known/legacy resolved behavior remain readable.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portal/authService')>()),
  useAuthUser: () => ({ id: 7, permissions: ['governed:write'] }),
}));

import { InsightsCanvas } from '../surfaces/Insights';
import type { OwnedSurfaceViewProps } from '../surfaceViews';
import { CANVAS_REPORT_TYPES } from './_insights-catalog-fixture';

const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj }) as Response;
const PROPS: OwnedSurfaceViewProps = {
  surface: { id: 'insights', label: 'Insights' } as OwnedSurfaceViewProps['surface'],
  segment: 'biotech',
  onNav: () => {},
};

/** The overview as the server sends it, with the tier-resolution flag. */
function overview(tierResolved: boolean | undefined) {
  return {
    data: {
      organizationId: 1,
      tier: 'standard',
      ...(tierResolved === undefined ? {} : { tierResolved }),
      segments: ['biotech'],
      reportTypes: CANVAS_REPORT_TYPES,
      leadProgram: {
        projectId: 1, code: 'BX204', label: 'BX204', filing: null, indication: null,
        readiness: 60, scope: 'project', scopeId: '1', agency: null, pdufa: null,
        criticalBlockerCount: 0,
      },
      portfolio: { entitled: false, requiredTier: 'enterprise', summary: null, programs: null },
    },
  };
}

let resolved: boolean | undefined = true;
let leadAvailable = true;
const RENDERED = { reportTypeId: 'readiness.executive_digest', scopeType: 'project', scopeId: '1', generatedAt: '2026-10-14T07:00:00.000Z', status: 'partial', sections: [{ id: 'summary', title: 'Readiness summary', blocks: [] }] };
beforeEach(() => {
  resolved = true;
  leadAvailable = true;
  apiRequest.mockReset();
  apiRequest.mockImplementation((method: string, url: string) => {
    if (url.includes('/api/insights-canvas/overview')) {
      const response = overview(resolved);
      return ok({ data: { ...response.data, leadProgram: leadAvailable ? response.data.leadProgram : null } });
    }
    if (method === 'POST' && url === '/api/report-os/runs') return ok({ data: { run: { id: 41 } } });
    if (url === '/api/report-os/runs/41/rendered') return ok({ data: RENDERED });
    if (url.startsWith('/api/report-os/runs')) return ok({ data: [{ id: 41, runUuid: 'aaaaaaaa-0000-4000-8000-000000000001', reportTypeId: RENDERED.reportTypeId, reportTypeLabel: 'Executive Readiness Digest', scopeType: 'project', scopeId: '1', status: 'partial', confidence: null, createdAt: RENDERED.generatedAt }] });
    return ok({});
  });
});
afterEach(() => cleanup());

async function renderCanvas() {
  render(<InsightsCanvas {...PROPS} />);
  await waitFor(() => expect(document.querySelector('.rc-ana-head')).not.toBeNull());
}

describe('Insights — a plan that could not be read', () => {
  it('says the plan could not be read, rather than naming one', async () => {
    resolved = false;
    await renderCanvas();
    const notice = document.querySelector('[data-testid="rc-tier-unresolved"]');
    expect(notice, 'a failed plan read was shown as a plan').not.toBeNull();
    expect(notice?.textContent).toMatch(/plan could not be verified/);
    expect(notice?.textContent).toMatch(/not a statement about your plan/i);
  });

  it('control: says nothing extra when the plan was read', async () => {
    await renderCanvas();
    expect(document.querySelector('[data-testid="rc-tier-unresolved"]')).toBeNull();
  });

  /* A server that predates the flag sends no `tierResolved`. Absent is read as
     resolved: the flag only ever withdraws a claim, so its absence must not
     start making one. */
  it('treats an absent flag as resolved, so an older server loses nothing', async () => {
    resolved = undefined;
    await renderCanvas();
    expect(document.querySelector('[data-testid="rc-tier-unresolved"]')).toBeNull();
  });
});

const runCalls = () => apiRequest.mock.calls.filter(([method, url]) => method === 'POST' && url === '/api/report-os/runs');
function ask(text: string) {
  const field = screen.getByLabelText('Find a report');
  fireEvent.change(field, { target: { value: text } });
  fireEvent.keyDown(field, { key: 'Enter' });
}
async function openLibrary(name: RegExp) {
  fireEvent.click(screen.getByRole('tab', { name }));
  await screen.findByRole('heading', { name });
}

describe('Insights — unverified plan execution', () => {
  beforeEach(() => { resolved = false; });

  it('disables the generation-bearing Find button', async () => {
    await renderCanvas();
    fireEvent.change(screen.getByLabelText('Find a report'), { target: { value: 'Executive Readiness Digest' } });
    expect((screen.getByRole('button', { name: 'Find' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('refuses base-report dispatch even when Enter reaches the handler', async () => {
    await renderCanvas();
    ask('Generate the Executive Readiness Digest');
    expect(runCalls()).toHaveLength(0);
    expect(screen.getByTestId('rc-find-result').textContent).toMatch(/plan could not be verified/);
  });

  it('does not replace an unread plan with a portfolio upgrade claim', async () => {
    await renderCanvas();
    ask('Portfolio readiness rollup');
    expect(document.querySelector('.rc-lock')).toBeNull();
    expect(screen.getByTestId('rc-find-result').textContent).toMatch(/plan could not be verified/);
    expect(runCalls()).toHaveLength(0);
  });

  it('keeps packs readable but removes runnable tiles and fallback plan locks', async () => {
    await renderCanvas();
    fireEvent.click(document.querySelector('.rc-preset-btn') as HTMLElement);
    await waitFor(() => expect(document.querySelector('.ro-pack-grid')).not.toBeNull());
    expect(document.querySelectorAll('button.ro-pack-card')).toHaveLength(0);
    expect(document.querySelector('.ro-pack-grid')?.textContent).toMatch(/plan could not be verified/);
    expect(document.querySelector('.ro-pack-grid')?.textContent).not.toMatch(/unlock to include|needs an editor role/);
  });

  it('makes catalog generation unavailable with a verification reason', async () => {
    await renderCanvas();
    await openLibrary(/Report catalog/);
    expect(document.querySelectorAll('button.rl-card-run:not(:disabled)')).toHaveLength(0);
    expect(document.querySelector('.rc-canvas')?.textContent).toMatch(/plan could not be verified/);
    expect(document.querySelector('.rl-card-lock')).toBeNull();
  });

  it('also withholds organization catalog generation before a lead program exists', async () => {
    leadAvailable = false;
    render(<InsightsCanvas {...PROPS} />);
    await screen.findByRole('tab', { name: /Report catalog/ });
    await openLibrary(/Report catalog/);
    expect(document.querySelectorAll('button.rl-card-run:not(:disabled)')).toHaveLength(0);
    expect(document.querySelector('.rc-canvas')?.textContent).toMatch(/plan could not be verified/);
  });
});

describe('Insights — unverified plan read and compatibility controls', () => {
  it.each([true, undefined])('continues known/legacy report generation when tierResolved is %s', async (flag) => {
    resolved = flag;
    await renderCanvas();
    ask('Generate the Executive Readiness Digest');
    await waitFor(() => expect(document.querySelector('.ro-report')).not.toBeNull());
    expect(runCalls()).toHaveLength(1);
    expect(screen.queryByTestId('rc-tier-unresolved')).toBeNull();
  });

  it('opens a retained report from history while plan generation is unavailable', async () => {
    resolved = false;
    await renderCanvas();
    await openLibrary(/Run history/);
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }));
    await waitFor(() => expect(document.querySelector('.ro-report')).not.toBeNull());
    expect(apiRequest.mock.calls.some(([method, url]) => method === 'GET' && url === '/api/report-os/runs/41/rendered')).toBe(true);
    expect(runCalls()).toHaveLength(0);
  });
});
