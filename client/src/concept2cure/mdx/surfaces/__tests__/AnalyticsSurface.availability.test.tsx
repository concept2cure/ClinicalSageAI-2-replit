// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AnalyticsSurface } from '../AnalyticsSurface';

vi.mock('@/utils/authToken', () => ({ getAuthToken: () => 'test-token', getOrgId: () => '7' }));

const metricPayload = {
  data: {
    kpis: [{ label: 'Programs', metric: '2', meta: '1 active' }],
    blockers: [{ cause: 'Missing evidence', count: 1, pathway: '510(k)', median: null, owner: null, trend: null }],
    pace24m: [0, 1], phases: null, reviewers: null, anaUsage: null,
  },
};
const report = {
  id: 47, reportTypeId: 'portfolio-snapshot', reportTypeLabel: 'Saved portfolio snapshot',
  status: 'partial', scopeType: 'program', scopeId: 'program-1', scopeLabel: 'Authorized program',
  updatedAt: '2026-10-14T10:00:00Z', createdAt: '2026-10-14T09:00:00Z',
};
const library = { data: [report], meta: { total: 1, hasMore: false, limit: 100, offset: 0 } };
let metricsStatus: number;
let reportsStatus: number;
let reportsPayload: unknown;
let metricsDeferred: boolean;

beforeEach(() => {
  metricsStatus = 200; reportsStatus = 200; reportsPayload = library; metricsDeferred = false;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const isReports = String(url).startsWith('/api/report-os/runs');
    if (!isReports && metricsDeferred) return new Promise(() => {});
    const status = isReports ? reportsStatus : metricsStatus;
    return {
      ok: status === 200, status,
      json: async () => isReports ? reportsPayload : metricPayload,
      text: async () => JSON.stringify({ code: 'ANALYTICS_UNAVAILABLE', message: 'Source unavailable' }),
    };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('retained Analytics source availability and canonical saved reports', () => {
  it('reads the authorized report register and opens the exact saved run without inventing completion or signatures', async () => {
    render(<AnalyticsSurface onAskAna={vi.fn()} />);
    const link = await screen.findByRole('link', { name: /Saved portfolio snapshot/ });
    expect(link.getAttribute('href')).toBe('/concept2cure/insights?reportRunId=47');
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/report-os\/runs\?/), expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer test-token', 'x-organization-id': '7' }),
    }));
    expect(screen.getByText('partial')).toBeTruthy();
    expect(screen.queryByText(/signed|100%|64%|median age 0d/i)).toBeNull();
    expect(screen.getByText('Submission pace')).toBeTruthy();
    expect(screen.getByText(/1 submitted in last 24 months/)).toBeTruthy();
    expect(screen.getByText(/Peer cycle-time data is unavailable/)).toBeTruthy();
    expect(screen.getByText(/FDA reviewer cohort data is unavailable/)).toBeTruthy();
    expect(screen.getByText(/Per-tool acceptance data is unavailable/)).toBeTruthy();
  });

  it('shows an unavailable metric source with retry while keeping independent authorized reports usable', async () => {
    metricsStatus = 503;
    render(<AnalyticsSurface onAskAna={vi.fn()} />);
    await screen.findByText(/Analytics metrics are unavailable/);
    expect(await screen.findByRole('link', { name: /Saved portfolio snapshot/ })).toBeTruthy();
    expect(screen.queryByText(/0 submitted|0 cleared/)).toBeNull();
    metricsStatus = 200;
    fireEvent.click(screen.getByRole('button', { name: 'Retry analytics' }));
    await screen.findByText(/1 submitted in last 24 months/);
  });

  it('distinguishes an unreadable report library from a confirmed empty register', async () => {
    reportsStatus = 403;
    const mounted = render(<AnalyticsSurface onAskAna={vi.fn()} />);
    await screen.findByText(/Saved reports are unavailable/);
    expect(screen.queryByText(/No saved reports/)).toBeNull();
    reportsStatus = 200; reportsPayload = { data: [], meta: { total: 0, hasMore: false, limit: 100, offset: 0 } };
    fireEvent.click(screen.getByRole('button', { name: 'Retry saved reports' }));
    await screen.findByText(/No saved reports are visible in your authorized report register/);
    mounted.unmount();
  });

  it('does not claim empty or zero metrics while loading', async () => {
    metricsDeferred = true;
    render(<AnalyticsSurface onAskAna={vi.fn()} />);
    await screen.findByText('Loading analytics metrics…');
    expect(screen.queryByText(/0 submitted|0 cleared|No saved reports/)).toBeNull();
  });

  it('rejects a malformed successful library as unavailable', async () => {
    reportsPayload = { data: null };
    render(<AnalyticsSurface onAskAna={vi.fn()} />);
    await screen.findByText(/Saved reports are unavailable/);
    expect(screen.queryByText(/No saved reports/)).toBeNull();
  });

  it('does not offer pathway filters that the aggregate cannot honor', async () => {
    render(<AnalyticsSurface onAskAna={vi.fn()} />);
    await screen.findByText('Submission pace');
    for (const name of ['510(k)', 'PMA', 'CER']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
    expect(screen.getByText(/Pathway filtering is unavailable/)).toBeTruthy();
    await waitFor(() => expect(fetch).not.toHaveBeenCalledWith('/api/mdx/analytics?pathway=k510', expect.anything()));
  });
});
