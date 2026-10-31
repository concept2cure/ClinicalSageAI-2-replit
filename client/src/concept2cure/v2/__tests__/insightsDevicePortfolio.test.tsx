// @vitest-environment jsdom
/**
 * Reporting & analytics shows the device section (D2, fold F4, 2026-10-30;
 * decision P-61 item 3; docs/evidence/D2-ONE-ANA/2026-10-30/fold-f4-device-analytics/).
 *
 * The device analytics screen is retired into Reporting. The section shows what
 * the overview's device read computed (server/services/report-os/device-portfolio.ts)
 * over the device projects the reader can open: each recorded status's count,
 * the 24-month submission pace, and the AnA draft acceptance rate. It computes
 * nothing of its own: every figure on screen is a field of the payload. A failed
 * read is said, never drawn as zeros; a reader with no device project sees no
 * section; a rate with no draft recorded is not a number.
 *
 * Only the transport (`apiRequest`) and the signed-in user are replaced.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portal/authService')>()),
  useAuthUser: () => ({ id: 3, role: 'manager', permissions: ['governed:write'] }),
}));
vi.mock('../../../../../server/db', () => ({ pool: {}, db: {}, getPool: () => ({}) }));

import { InsightsCanvas } from '../surfaces/Insights';
import { InsightsDevicePortfolio, type DevicePortfolioView } from '../surfaces/InsightsDevicePortfolio';
import type { OwnedSurfaceViewProps } from '../surfaceViews';
import { CANVAS_REPORT_TYPES } from './_insights-catalog-fixture';

const PROGRAM = 'd979e567-4622-46f1-8cb7-8bf434227f25';
const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj }) as unknown as Response;
const MONTHS = Array.from({ length: 24 }, (_, i) => {
  const d = new Date(Date.UTC(2024, 10 + i, 1));
  return d.toISOString().slice(0, 7);
});
const COUNTS = MONTHS.map((m) => (m === '2026-09' ? 2 : m === '2025-11' ? 1 : 0));
const COMPUTED: DevicePortfolioView = {
  state: 'computed',
  projectCount: 5,
  byStatus: [{ status: 'active', count: 3 }, { status: 'approved', count: 1 }, { status: 'submitted', count: 1 }],
  pace: { months: MONTHS, counts: COUNTS, total: 3 },
  anaDrafts: { state: 'computed', accepted: 3, pending: 1, acceptanceRate: 75 },
};
const LEAD = {
  projectId: 12, code: 'ABC-101', label: 'ABC-101', filing: null, indication: null,
  readiness: null, confidence: null, scope: 'project', scopeId: '12', agency: null, pdufa: null, criticalBlockerCount: 0,
};
let device: unknown = COMPUTED;
let lead: unknown = LEAD;
const overview = () => ({
  data: {
    organizationId: 1, tier: 'standard', tierResolved: true, segments: ['device'], reportTypes: CANVAS_REPORT_TYPES,
    leadProgram: lead, openProgram: lead ? { programId: PROGRAM, state: 'lead' } : null,
    programs: lead ? [] : [{ programId: PROGRAM, code: 'ABC-101', label: 'ABC-101' }],
    portfolio: { entitled: false, requiredTier: 'enterprise', summary: null, programs: null },
    dataScope: 'accessible_projects',
    device,
  },
});

beforeEach(() => {
  device = COMPUTED;
  lead = LEAD;
  window.history.replaceState({}, '', '/');
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROGRAM, title: 'ABC-101', code: 'ABC-101' };
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_method: string, url: string) => {
    if (url.startsWith('/api/insights-canvas/overview')) return ok(overview());
    return ok({ data: [] });
  });
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
  sessionStorage.clear();
});

const section = () => screen.getByRole('region', { name: 'Device projects' });

describe('the device section shows what the device read computed, and nothing else', () => {
  it('states each recorded status with its count, the pace and the acceptance rate', () => {
    render(<InsightsDevicePortfolio device={COMPUTED} />);
    const s = section();
    expect(within(s).getByText(/5 device projects you can open/)).toBeTruthy();
    const statuses = within(s).getByRole('list', { name: 'Device projects by status' });
    expect([...statuses.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['Active3', 'Approved1', 'Submitted1']);
    expect(within(s).getByText('3 submitted in the 24 months to 2026-10')).toBeTruthy();
    const pace = within(s).getByRole('list', { name: 'Submissions by month' });
    expect(pace.querySelectorAll('li')).toHaveLength(24);
    expect(within(pace).getByText('2026-09').closest('li')!.textContent).toBe('2026-092');
    expect(within(s).getByTestId('device-ana-rate').textContent).toBe('75%');
    expect(within(s).getByText('3 of 4 AnA drafts accepted')).toBeTruthy();
    // Where it reads from, in words a reader can check.
    expect(s.textContent).toMatch(/projects you can open/);
  });

  it('says when no AnA draft is recorded, rather than a rate of zero', () => {
    render(<InsightsDevicePortfolio device={{ ...COMPUTED, anaDrafts: { state: 'computed', accepted: 0, pending: 0, acceptanceRate: null } } as DevicePortfolioView} />);
    expect(screen.queryByTestId('device-ana-rate')).toBeNull();
    expect(within(section()).getByText(/No AnA draft is recorded against a device project you can open/)).toBeTruthy();
  });

  it('withholds only the rate when the drafts could not be read', () => {
    render(<InsightsDevicePortfolio device={{ ...COMPUTED, anaDrafts: { state: 'unavailable' } } as DevicePortfolioView} />);
    expect(screen.queryByTestId('device-ana-rate')).toBeNull();
    expect(within(section()).getByText(/AnA draft acceptance could not be read/)).toBeTruthy();
    expect(within(section()).getByText(/5 device projects you can open/)).toBeTruthy();
  });

  it('says a failed read failed, and draws no figure', () => {
    render(<InsightsDevicePortfolio device={{ state: 'unavailable' }} />);
    const s = section();
    expect(within(s).getByRole('alert').textContent).toMatch(/could not be read/);
    expect(s.textContent).not.toMatch(/\d/);
  });

  it('draws nothing for a reader with no device project, or an overview without the section', () => {
    const { container, rerender } = render(<InsightsDevicePortfolio device={{ state: 'none' }} />);
    expect(container.innerHTML).toBe('');
    rerender(<InsightsDevicePortfolio device={undefined} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('Reporting & analytics carries the device section from its overview', () => {
  const renderCanvas = () =>
    render(<InsightsCanvas surface={{ id: 'insights', label: 'Insights' } as OwnedSurfaceViewProps['surface']} segment="medtech" onNav={vi.fn()} />);

  it('on the canvas of an open project', async () => {
    renderCanvas();
    await waitFor(() => expect(document.querySelector('.rc-ana-head')).not.toBeNull());
    expect(within(section()).getByTestId('device-ana-rate').textContent).toBe('75%');
  });

  it('with no project open, beside the project picker', async () => {
    lead = null;
    delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
    renderCanvas();
    await waitFor(() => expect(screen.getByTestId('rc-program-picker')).toBeTruthy());
    expect(within(section()).getByText(/5 device projects you can open/)).toBeTruthy();
  });

  it('a failed device read is said on the canvas', async () => {
    device = { state: 'unavailable' };
    renderCanvas();
    await waitFor(() => expect(document.querySelector('.rc-ana-head')).not.toBeNull());
    expect(within(section()).getByRole('alert')).toBeTruthy();
  });
});
