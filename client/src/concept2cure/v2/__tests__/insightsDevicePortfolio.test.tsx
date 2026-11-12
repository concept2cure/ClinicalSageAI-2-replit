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
    expect(within(s).getByText('3 submitted in the 24 months to October 2026.')).toBeTruthy();
    const pace = within(s).getByRole('list', { name: 'Submissions by month' });
    expect(pace.querySelectorAll('li')).toHaveLength(24);
    expect(within(pace).getByText('Sep 2026').closest('li')!.textContent).toBe('Sep 20262');
    expect(within(s).getByTestId('device-ana-rate').textContent).toBe('75%');
    expect(within(s).getByText('3 of 4 AnA drafts accepted')).toBeTruthy();
    // Where it reads from, in words a reader can check.
    expect(s.textContent).toMatch(/projects you can open/);
  });

  /* S12 biotech sweep, finding 94 (re-checked in the running app 2026-11-12): the pace was 24 rows of raw
     'YYYY-MM' keys, every zero as heavy as a month with a submission. Each month is now named, a month with no
     submission is quieter, and all 24 stay listed (P-122: nothing the screen showed is taken away). */
  it('names each month in words, oldest first, with the record\u2019s own month kept for a machine', () => {
    render(<InsightsDevicePortfolio device={COMPUTED} />);
    const pace = within(section()).getByRole('list', { name: 'Submissions by month' });
    const times = [...pace.querySelectorAll('time')];
    expect(times).toHaveLength(24);
    expect(times[0].textContent).toBe('Nov 2024');
    expect(times[0].getAttribute('datetime')).toBe('2024-11');
    expect(times[23].textContent).toBe('Oct 2026');
    expect(pace.textContent).not.toMatch(/\d{4}-\d{2}/);
  });

  it('keeps every month listed, and marks the months with no submission as quiet', () => {
    render(<InsightsDevicePortfolio device={COMPUTED} />);
    const pace = within(section()).getByRole('list', { name: 'Submissions by month' });
    expect([...pace.querySelectorAll('li:not(.ro-pace-zero)')].map((li) => li.textContent)).toEqual(['Nov 20251', 'Sep 20262']);
    expect(pace.querySelectorAll('li.ro-pace-zero')).toHaveLength(22);
  });

  it('with nothing submitted, says so and still lists the 24 months', () => {
    const none = { ...COMPUTED, pace: { months: MONTHS, counts: MONTHS.map(() => 0), total: 0 } } as DevicePortfolioView;
    render(<InsightsDevicePortfolio device={none} />);
    expect(within(section()).getByText('0 submitted in the 24 months to October 2026.')).toBeTruthy();
    expect(within(section()).getByRole('list', { name: 'Submissions by month' }).querySelectorAll('li.ro-pace-zero')).toHaveLength(24);
  });

  it('shows a month key it cannot read as the record holds it, never a guessed month', () => {
    const odd = { ...COMPUTED, pace: { months: ['2026-13', 'Q3'], counts: [0, 1], total: 1 } } as DevicePortfolioView;
    render(<InsightsDevicePortfolio device={odd} />);
    const pace = within(section()).getByRole('list', { name: 'Submissions by month' });
    expect([...pace.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['2026-130', 'Q31']);
    expect(within(section()).getByText('1 submitted in the 2 months to Q3.')).toBeTruthy();
  });

  /* The same finding: under an open biotech IND the section gave device figures and did not say whose they were.
     It stays where it was (P-122) and says, from the server's own count, that the open project is not in it. */
  it('says the open project is not counted when the device read says so', () => {
    render(<InsightsDevicePortfolio device={{ ...COMPUTED, openProjectCounted: false } as DevicePortfolioView} openProject="ABC-101" />);
    expect(within(section()).getByRole('note').textContent?.trim()).toBe('ABC-101 is not counted in these figures, which cover device projects only.');
    expect(within(section()).getByText(/5 device projects you can open/)).toBeTruthy();
  });

  it.each([
    ['the open project is a device project', { openProjectCounted: true }, 'ABC-101'],
    ['no project is open', {}, null],
    ['the read did not say', {}, 'ABC-101'],
    ['the project has no name to say', { openProjectCounted: false }, null],
  ])('makes no such claim when %s', (_when, extra, openProject) => {
    render(<InsightsDevicePortfolio device={{ ...COMPUTED, ...extra } as DevicePortfolioView} openProject={openProject} />);
    expect(section().textContent).not.toMatch(/not counted/);
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
    await waitFor(() => expect(document.querySelector('[data-testid="rc-find-result"]')).not.toBeNull());
    expect(within(section()).getByTestId('device-ana-rate').textContent).toBe('75%');
  });

  it('under an open project that is not a device project, it stays and names that project as not counted', async () => {
    device = { ...COMPUTED, openProjectCounted: false };
    renderCanvas();
    await waitFor(() => expect(document.querySelector('[data-testid="rc-find-result"]')).not.toBeNull());
    expect(within(section()).getByTestId('device-ana-rate').textContent).toBe('75%');
    expect(within(section()).getByRole('note').textContent?.trim()).toBe('ABC-101 is not counted in these figures, which cover device projects only.');
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
    await waitFor(() => expect(document.querySelector('[data-testid="rc-find-result"]')).not.toBeNull());
    expect(within(section()).getByRole('alert')).toBeTruthy();
  });
});
