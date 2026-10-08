// @vitest-environment jsdom
/**
 * The reporting canvas: a failed load can be retried where it failed, and a
 * report's tables and sources reach every reader (reporting review 2026-10-01,
 * DESIGN-3 and DESIGN-5).
 *
 * DESIGN-3: the load failure told the user to "sign in and retry" with nothing
 * to click, in engineering words ("read-model", "Insights canvas"). DESIGN-5:
 * report tables were div grids with no table semantics (WCAG 1.3.1), with an
 * aria-label on a role-less div, and a value's source was reachable only by
 * hover ("Source on hover").
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { InsightsCanvas } from '../surfaces/Insights';
import type { OwnedSurfaceViewProps } from '../surfaceViews';

const PROPS: OwnedSurfaceViewProps = {
  surface: { id: 'insights', label: 'Insights' } as OwnedSurfaceViewProps['surface'],
  segment: 'biotech',
  onNav: () => {},
};
const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj }) as unknown as Response;
const OVERVIEW = {
  data: {
    organizationId: 1, tier: 'standard', segments: ['biotech'],
    leadProgram: { projectId: 1, code: 'BX204', label: 'BX204', filing: 'NDA', indication: null, readiness: 73, scope: 'project', scopeId: '1', agency: null, pdufa: null, criticalBlockerCount: 0 },
    portfolio: { programs: null },
  },
};
const RENDERED = {
  data: {
    reportTypeId: 'readiness.executive_digest', scopeType: 'project', scopeId: '1', generatedAt: '2026-08-01T10:00:00.000Z', status: 'partial',
    sections: [{
      id: 'p', title: 'Provider readiness',
      blocks: [
        { kind: 'metric', label: 'Confidence', value: 64, unit: '%', provenance: [{ sourceTable: 'projects', sourceId: '1', field: 'readiness' }] },
        { kind: 'table', columns: ['Provider', 'Status', 'Note'], rows: [['lifecycle', 'ready', null]] },
      ],
    }],
  },
};
const overviewCalls = () => apiRequest.mock.calls.filter(([, u]) => String(u).includes('/api/insights-canvas/overview')).length;

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
});

describe('a failed canvas load', () => {
  it('offers a retry that reads again, in plain words', async () => {
    let fail = true;
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (String(url).includes('/api/insights-canvas/overview')) {
        if (fail) throw Object.assign(new Error('unavailable'), { status: 503, payload: { code: 'PORTFOLIO_UNAVAILABLE' } });
        return ok(OVERVIEW);
      }
      return ok({});
    });
    render(<InsightsCanvas {...PROPS} />);
    const alert = await screen.findByText("Couldn't load the reporting canvas");
    const panel = alert.closest('[role="alert"]') as HTMLElement;
    expect(panel.textContent).not.toMatch(/read-model|Insights canvas|sign in and retry/i);
    const before = overviewCalls();
    fail = false;
    fireEvent.click(within(panel).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(document.querySelector('.rc-ana-head')).not.toBeNull());
    expect(overviewCalls()).toBe(before + 1);
  });
});

describe("a report's tables and sources", () => {
  it('a report table is a table with column headers, and a source is a disclosure, not a hover', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (String(url).includes('/api/insights-canvas/overview')) return ok(OVERVIEW);
      if (method === 'POST' && url === '/api/report-os/runs') return ok({ data: { run: { id: 77 } } });
      if (url === '/api/report-os/runs/77/rendered') return ok(RENDERED);
      return ok({});
    });
    render(<InsightsCanvas {...PROPS} />);
    const composer = await waitFor(() => {
      const el = document.querySelector('.rc-input textarea') as HTMLTextAreaElement | null;
      if (!el) throw new Error('composer not mounted');
      return el;
    });
    fireEvent.change(composer, { target: { value: 'Run the executive readiness digest report' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find' }));
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Provider', 'Status', 'Note']);
    expect(within(table).getAllByRole('cell').map((td) => td.textContent)).toEqual(['lifecycle', 'ready', '--']);
    expect(screen.queryByText(/Source on hover/)).toBeNull();
    const source = screen.getByText('Source');
    expect(source.tagName).toBe('SUMMARY');
    expect(source.closest('details')?.textContent).toMatch(/projects/);
    expect(document.querySelector('div[aria-label]:not([role])')).toBeNull();
  });
});
