// @vitest-environment jsdom
/**
 * Site risk says where its figures came from (GA-S8-02).
 *
 * A study's sites are scored from its own site-level indicator readings when Site Intelligence holds none
 * (server/services/rbm/site-risk-engine.ts). The Site risk and Site oversight tabs, and the extract-load panel,
 * say which source they are showing and what became of the site rows. Split out of rbmSurfaceWrites.test.tsx,
 * beside it, to keep that file inside its size limit.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { RbmOverview } from '../surfaces/RbmSurfacesA';
import { RbmSites, RbmOversight } from '../surfaces/RbmSurfacesB';
import type { RbmBoard } from '../surfaces/rbmBoard';

const PROGRAM = '11111111-2222-3333-4444-555555555555';
const envelope = (payload: unknown, status = 200) => ({ ok: status < 400, status, json: async () => payload }) as Response;

function board(over: Partial<RbmBoard> = {}): RbmBoard {
  return {
    programId: PROGRAM,
    asOf: '2026-07-01T00:00:00.000Z',
    summary: {
      overallRisk: 'medium', asOf: '2026-07-01T00:00:00.000Z',
      riskItems: { total: 0, critical: 0, open: 0, high: 0 },
      kris: { total: 0, red: 0, amber: 0, notEvaluated: 0 },
      qtls: { total: 0, breached: 0, approaching: 0, notEvaluated: 0 },
      signals: { total: 0, open: 0, high: 0 },
      sites: { total: 1, enhanced: 1 },
      patients: { scored: 0, flagged: 0, review: 0 },
    },
    attention: [], report: null, reportMarkdown: null, assessment: null, items: [], kris: [], qtls: [], signals: [], patients: [],
    sites: [{ n: '5', name: 'Mercy Clinical', country: null, composite: 71, enr: 18, qual: 20, ops: 15, tier: 'enhanced', drivers: ['quality'], at: null }],
    oversight: {}, plan: null, governingPlanId: null, actions: [], freshness: [],
    ...over,
  };
}

afterEach(() => cleanup());
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string) => (method === 'GET' ? envelope({ data: [] }) : envelope({ data: { id: 1 }, meta: { count: 1 } }, 201)));
});

describe('Site risk says where its figures came from', () => {
  const STUDY_SITES: RbmBoard['sites'] = [
    { n: '104', name: '', country: null, composite: 100, enr: null, qual: null, ops: null, tier: 'enhanced', at: '2026-11-11T23:56:47.000Z',
      drivers: ['Open query aging 58 days: red (limit 28 days)'], source: 'study_indicators', basis: { red: 2, amber: 0, green: 0, unbanded: 0 } },
    { n: '103', name: '', country: null, composite: 25, enr: null, qual: null, ops: null, tier: 'reduced', at: '2026-11-11T23:56:47.000Z',
      drivers: ['Open query aging 14 days: amber (limit 14 days)'], source: 'study_indicators', basis: { red: 0, amber: 1, green: 1, unbanded: 0 } },
    { n: '108', name: '', country: null, composite: null, enr: null, qual: null, ops: null, tier: 'standard', at: '2026-11-11T23:56:47.000Z',
      drivers: [], source: 'study_indicators', basis: { red: 0, amber: 0, green: 0, unbanded: 1 } },
  ];

  it('sites scored from the study\'s indicators: the source, each site\'s indicator counts, and the rule', () => {
    const { container } = render(<RbmSites board={board({ sites: STUDY_SITES })} onReload={vi.fn()} />);
    expect(container.querySelector('.rbm-bar-info')?.textContent).toMatch(/^Composite from the study’s site-level indicators/);
    expect(screen.queryByText(/site intelligence/i)).toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Indicators at the site' })).toBeTruthy();
    expect(screen.getByText('2 red')).toBeTruthy();
    expect(screen.getByText('1 amber · 1 green')).toBeTruthy();
    expect(screen.getByText('1 with no limit — not scored')).toBeTruthy();
    expect(screen.getByText('Not scored')).toBeTruthy();
    expect(screen.getByText(/red counts 100, amber 50, green 0/)).toBeTruthy();
  });

  it('the composite is coloured by the tier the engine set, not re-banded on the RACT\'s 1 to 25 scale', () => {
    const { container } = render(<RbmSites board={board({ sites: STUDY_SITES })} onReload={vi.fn()} />);
    const chips = [...container.querySelectorAll('.rbm-score')].map((el) => [el.textContent, el.getAttribute('data-band')]);
    expect(chips).toEqual([['100', 'high'], ['25', 'low']]);
    cleanup();
    const oversight = render(<RbmOversight board={board({ sites: STUDY_SITES, oversight: {} })} onReload={vi.fn()} />);
    expect([...oversight.container.querySelectorAll('.rbm-score')].map((el) => [el.textContent, el.getAttribute('data-band')])).toEqual([['100', 'high'], ['25', 'low']]);
  });

  it('a recompute says which source the sites were rescored from', async () => {
    apiRequest.mockImplementation(async (method: string) => (method === 'GET' ? envelope({ data: [] })
      : envelope({ data: [], meta: { count: 8, source: 'study_indicators' } })));
    render(<RbmSites board={board({ sites: STUDY_SITES })} onReload={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Recompute site risk/ }));
    expect(await screen.findByText('Rescored 8 sites from the study’s site-level indicators.')).toBeTruthy();
  });

  it('sites from Site Intelligence still read as they did', () => {
    const { container } = render(<RbmSites board={board()} onReload={vi.fn()} />);
    expect(container.querySelector('.rbm-bar-info')?.textContent).toMatch(/^Composite from site intelligence/);
    expect(screen.getByRole('columnheader', { name: 'Dimensions (of 25)' })).toBeTruthy();
  });

  it('no site scored: it credits no source and says how sites come to be scored', () => {
    const { container } = render(<RbmSites board={board({ sites: [] })} onReload={vi.fn()} />);
    expect(container.querySelector('.rbm-bar-info')?.textContent).toMatch(/^Site risk · never scored/);
    expect(screen.getByText(/load an extract that carries site rows for an indicator that has limits, then recompute/)).toBeTruthy();
  });
});

describe('The extract-load panel says what became of the site rows', () => {
  const ingestResult = (over: Record<string, unknown> = {}) => ({
    runId: 12, status: 'succeeded', received: 2, accepted: 2, rejected: 0, rejects: [],
    projection: { kriReadings: 1, qtlUpdates: 1, subjectProfiles: 0, siteObservations: 0, unmatched: [] },
    ...over,
  });
  function mockIngest(payload: unknown) {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET') return envelope({ data: [] });
      if (url === '/api/mdx/rbm-metric-ingest') return envelope({ data: payload }, 201);
      return envelope({ data: {} }, 201);
    });
  }
  const loadExtract = async () => {
    render(<RbmOverview board={board()} onTab={vi.fn()} onReload={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Load extract…/ }));
    fireEvent.change(await screen.findByLabelText(/paste the rows/), { target: { value: 'metric_key,scope_level,scope_id,value\nQuery rate,site,104,58\n' } });
    fireEvent.click(screen.getByRole('button', { name: 'Load extract' }));
    await screen.findByText(/Run 12 — succeeded/);
  };

  it('says how many sites were rescored when the extract carried site rows', async () => {
    mockIngest(ingestResult({ projection: { kriReadings: 0, qtlUpdates: 0, subjectProfiles: 0, siteObservations: 8, unmatched: [] },
      siteRisk: { rescored: 8, source: 'study_indicators' } }));
    await loadExtract();
    expect(screen.getByText(/8 site\/country observations stored · site risk rescored for 8 sites/)).toBeTruthy();
  });

  it('says so, with the reason, when the sites could not be rescored', async () => {
    mockIngest(ingestResult({ projection: { kriReadings: 0, qtlUpdates: 0, subjectProfiles: 0, siteObservations: 8, unmatched: [] },
      siteRisk: { notRescored: 'Site Intelligence is not available in this environment, so site risk cannot be derived. The previous snapshot is unchanged.' } }));
    await loadExtract();
    expect(screen.getByText('Site risk was not rescored from this load.')).toBeTruthy();
    expect(screen.getByText(/The previous snapshot is unchanged\. The site rows are stored; use “Recompute site risk”/)).toBeTruthy();
    expect(screen.queryByText(/site risk rescored for/)).toBeNull();
  });

  it('says nothing about site risk when the extract carried no site rows', async () => {
    mockIngest(ingestResult());
    await loadExtract();
    expect(screen.queryByText(/site risk/i)).toBeNull();
  });
});
