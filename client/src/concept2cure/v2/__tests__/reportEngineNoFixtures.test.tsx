// @vitest-environment jsdom
/**
 * ReportEngine — fixture-free contract (GA real-data standard).
 *
 * The CSR-library panel used to seed itself from an inline ANALYTICS_FIXTURE
 * (totalReports 1284, Oncology 389, Phase 2 468 …) behind a "sample" pill, and
 * the surface header carried a <SampleTag>. The protocol box was pre-filled with
 * a fabricated BX-204 study. All of that is retired.
 *
 * These tests pin the three honest states the CSR-library panel may now render
 * from the org-scoped GET /api/analytics/dashboard aggregates — REAL data, an
 * honest EMPTY state (org has no indexed reports), or an honest ERROR state
 * (403 / failed read) — and prove no retired fixture content or "Sample data"
 * pill survives. Every KPI and bar is derived from the mocked response, so
 * anything that renders proves the response was adopted, not a codebase constant.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ReportEngine } from '../surfaces/ReportEngine';

const props = () => ({
  surface: { id: 'report-engine', label: 'Reporting & analytics' } as any,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biopharma',
});

/* A REAL org-scoped dashboard payload — the bare object shape the route returns
   (server/routes/analytics-routes.ts GET /dashboard). Values are deliberately
   NOT the retired fixture numbers, so anything rendered proves the live response
   was adopted. `predictiveInsights: []` mirrors the route's honest contract-gap
   (no model yet) — an empty array, never a fabricated insight. */
const DASHBOARD = {
  totalReports: 512,
  recentAdditions: 9,
  uniqueIndications: 17,
  averageEndpoints: 1.4,
  averageCompletionRate: 0.66,
  reportsByIndication: { 'Hemophilia A': 120, 'Sickle cell disease': 74, 'Duchenne MD': 41 },
  reportsByPhase: { 'Phase 1': 88, 'Phase 2': 143, 'Phase 3': 61 },
  sponsorDistribution: [{ name: 'Aurora Bio', count: 120 }],
  monthlyTrends: [{ month: 'Jan', count: 12 }],
  mostCommonEndpoints: [{ name: 'Annualized bleeding rate', count: 30, successRate: 0 }],
  completionRates: [{ phase: 'Phase 2', rate: 0.7 }],
  predictiveInsights: [],
  filters: { indications: ['Hemophilia A'], phases: ['Phase 2'] },
};

/* An org with no indexed CSR reports — the route returns real zeros and empty
   breakdowns, not a fixture. */
const DASHBOARD_EMPTY = {
  totalReports: 0,
  recentAdditions: 0,
  uniqueIndications: 0,
  averageEndpoints: 0,
  averageCompletionRate: 0,
  reportsByIndication: {},
  reportsByPhase: {},
  sponsorDistribution: [],
  monthlyTrends: [],
  mostCommonEndpoints: [],
  completionRates: [],
  predictiveInsights: [],
  filters: { indications: [], phases: [] },
};

/** Read the value cell of the KPI whose label matches. */
function kpiValue(label: string): string {
  const card = Array.from(document.querySelectorAll('.ra-kpi')).find((el) =>
    (el.querySelector('.ra-kpi-l')?.textContent || '').includes(label),
  );
  return card?.querySelector('.ra-kpi-v')?.textContent?.trim() || '';
}

/** Read the value cell of the bar row whose label matches exactly. */
function barValue(label: string): string {
  const row = Array.from(document.querySelectorAll('.ra-bar-row')).find(
    (el) => (el.querySelector('.ra-bar-l')?.textContent || '').trim() === label,
  );
  return row?.querySelector('.ra-bar-v')?.textContent?.trim() || '';
}

/* Fixture strings that must NEVER appear once the fixtures are gone. The bare
   word "sample" is intentionally excluded — it legitimately appears in "sample
   size" prose; the "Sample data" pill is checked structurally via .c2c-sample-tag. */
const RETIRED = [
  'Sample data',
  'BX-204',
  'Advanced Solid Tumors',
  '1284',
  'Oncology',
  'Cardiovascular',
  'Rare disease',
];

afterEach(cleanup);
beforeEach(() => {
  apiRequest.mockReset();
});

describe('ReportEngine — real dashboard aggregates render (no fixture)', () => {
  beforeEach(() => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/analytics/dashboard') {
        return { ok: true, status: 200, json: async () => DASHBOARD } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
  });

  it('derives every KPI and bar from the org-scoped response', async () => {
    render(<ReportEngine {...props()} />);

    // Indication + phase labels came from the response, not a fixture.
    expect(await screen.findByText('Hemophilia A')).toBeTruthy();
    expect(screen.getByText('Sickle cell disease')).toBeTruthy();

    // KPIs are the real aggregates.
    expect(kpiValue('CSR reports')).toBe('512');
    expect(kpiValue('Indications')).toBe('17');
    expect(kpiValue('Added')).toBe('9');
    // averageCompletionRate 0.66 → 66%.
    expect(kpiValue('Avg completion')).toBe('66%');

    // Bars carry the real per-key counts.
    expect(barValue('Phase 2')).toBe('143');
    expect(barValue('Hemophilia A')).toBe('120');

    // Header reports the real total.
    expect(document.body.textContent).toContain('512 reports');

    // No provenance pill of any kind, and no retired fixture content.
    expect(document.querySelector('.c2c-sample-tag')).toBeNull();
    expect(document.querySelector('.sp-sample')).toBeNull();
    for (const s of RETIRED) expect(document.body.textContent).not.toContain(s);
  });
});

describe('ReportEngine — honest empty state (org has no CSR reports)', () => {
  beforeEach(() => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/analytics/dashboard') {
        return { ok: true, status: 200, json: async () => DASHBOARD_EMPTY } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
  });

  it('shows an EmptyState — never a fabricated metric — when the library is empty', async () => {
    render(<ReportEngine {...props()} />);

    expect(await screen.findByText('No CSR reports in your library yet')).toBeTruthy();
    // No KPI tiles or bars are rendered — nothing to fabricate.
    expect(document.querySelector('.ra-kpi')).toBeNull();
    expect(document.querySelector('.ra-bar-row')).toBeNull();
    // No pill, no retired fixture content.
    expect(document.querySelector('.c2c-sample-tag')).toBeNull();
    expect(document.querySelector('.sp-sample')).toBeNull();
    for (const s of RETIRED) expect(document.body.textContent).not.toContain(s);
  });
});

describe('ReportEngine — honest error state (tenant-isolated read fails)', () => {
  beforeEach(() => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/analytics/dashboard') {
        return {
          ok: false,
          status: 403,
          json: async () => ({ error: 'Organization context required', code: 'ORG_REQUIRED' }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
  });

  it('shows an error EmptyState — never a fixture — when the dashboard read fails', async () => {
    render(<ReportEngine {...props()} />);

    expect(await screen.findByText("Couldn't load the CSR library")).toBeTruthy();
    // No fabricated aggregates leaked in behind the error.
    await waitFor(() => expect(document.querySelector('.ra-kpi')).toBeNull());
    expect(document.querySelector('.c2c-sample-tag')).toBeNull();
    expect(document.querySelector('.sp-sample')).toBeNull();
    for (const s of RETIRED) expect(document.body.textContent).not.toContain(s);
  });
});
