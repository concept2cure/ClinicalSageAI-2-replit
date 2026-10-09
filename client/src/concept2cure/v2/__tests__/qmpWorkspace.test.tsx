// @vitest-environment jsdom
/**
 * QmpWorkspace — proves the quality-management surface reads the real
 * /api/quality endpoints (raw JSON, not {data}-wrapped): the plan register and
 * the completeness/risk dashboard.
 *
 * Its writes (activate, archive, create, delete) are governed changes (weekly
 * review 2026-09-22, P2) and are proven against the real C2CForm in
 * qmpWorkspaceGoverned.test.tsx. The two write cases that lived here asserted
 * the old one-click, reasonless calls; once rewritten they duplicated that
 * suite, so they were removed rather than kept twice.
 *
 * The dashboard's figures are shown only for the plan they belong to: none
 * while it loads, none from a slower answer for a plan selected before, whole
 * percents, and "Not assessed" — never 0% — when no risk factor is linked. What
 * the surface tells AnA follows the same rules.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

const published = vi.hoisted(() => ({ current: null as null | { summary: string; facts: Record<string, unknown> } }));
vi.mock('../surfaceContext', () => ({
  usePublishSurfaceContext: (_id: string, ctx: typeof published.current) => {
    published.current = ctx;
  },
}));

import { QmpWorkspace } from '../surfaces/QmpWorkspace';

function raw(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}
const props = () => ({ surface: { id: 'qmp', label: 'QMP' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

const PLANS = [{ id: 1, name: 'CER Quality Plan', version: '1.0', status: 'draft', description: null }];
const DASH = {
  qmp: { id: 1, name: 'CER Quality Plan', version: '1.0', status: 'draft' },
  sections: { totalSections: 10, sectionsByGateLevel: { hard: 3, soft: 5, info: 2 }, activeSections: 8, inactiveSections: 2, sectionsAllowingOverride: 1 },
  factors: { totalFactors: 6, factorsByRiskLevel: { high: 2, medium: 3, low: 1 }, activeFactors: 5, inactiveFactors: 1, requiredFactors: 4 },
  overallCompleteness: 75,
  riskProfile: { highRiskPercentage: 33, mediumRiskPercentage: 50, lowRiskPercentage: 17 },
};
const NOT_LINKED = {
  ...DASH,
  factors: { totalFactors: 0, factorsByRiskLevel: { high: 0, medium: 0, low: 0 }, activeFactors: 0, inactiveFactors: 0, requiredFactors: 0 },
  overallCompleteness: null,
  riskProfile: { highRiskPercentage: null, mediumRiskPercentage: null, lowRiskPercentage: null },
};

function serve(dashboards: Record<number, unknown | (() => Promise<Response>)>, plans: unknown = PLANS) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/quality/plans') return raw(plans);
    const m = /^\/api\/quality\/dashboard\/(\d+)$/.exec(url);
    if (method === 'GET' && m) {
      const d = dashboards[Number(m[1])];
      return typeof d === 'function' ? (d as () => Promise<Response>)() : raw(d);
    }
    return raw({});
  });
}

afterEach(() => cleanup());
beforeEach(() => {
  apiRequest.mockReset();
  published.current = null;
  serve({ 1: DASH });
});

describe('QmpWorkspace — real quality backend', () => {
  it('loads plans and the completeness/risk dashboard', async () => {
    render(<QmpWorkspace {...props()} />);
    expect(await screen.findByText('CER Quality Plan')).toBeTruthy();
    expect(await screen.findByText('75% complete')).toBeTruthy();
    expect(screen.getByText(/high 2/)).toBeTruthy();
  });

  it('a plan with no risk factor linked reads "Not assessed" — never 0% complete — and says so to AnA', async () => {
    serve({ 1: NOT_LINKED });
    render(<QmpWorkspace {...props()} />);
    expect(await screen.findByText('Not assessed')).toBeTruthy();
    expect(screen.getByText(/no risk factor is linked to this plan’s gating rules/)).toBeTruthy();
    expect(screen.queryByText(/% complete/)).toBeNull();
    expect(published.current?.summary).toMatch(/completeness not assessed — no risk factor is linked/);
    expect(published.current?.summary).not.toMatch(/null|% complete/);
  });

  it('shows whole percents, and tells AnA the same figure', async () => {
    serve({ 1: { ...DASH, overallCompleteness: 100 / 3, riskProfile: { highRiskPercentage: 100 / 3, mediumRiskPercentage: 200 / 3, lowRiskPercentage: 0 } } });
    render(<QmpWorkspace {...props()} />);
    expect(await screen.findByText('33% complete')).toBeTruthy();
    expect(screen.getByText('High 33% · Medium 67% · Low 0%')).toBeTruthy();
    expect(published.current?.summary).toMatch(/; 33% complete across 10 section\(s\)\./);
  });
});

describe('QmpWorkspace — figures belong to the plan they were read for', () => {
  const TWO = [...PLANS, { id: 2, name: 'Device Quality Plan', version: '2.0', status: 'draft', description: null }];

  it('while a plan’s dashboard loads, no figure is shown and AnA is given none', async () => {
    let release!: (r: Response) => void;
    serve({ 1: () => new Promise<Response>((r) => { release = r; }) });
    render(<QmpWorkspace {...props()} />);
    expect(await screen.findByText('Loading dashboard…')).toBeTruthy();
    expect(screen.queryByText(/% complete|Not assessed/)).toBeNull();
    expect(published.current?.facts.overallCompletenessPct).toBeUndefined();
    await act(async () => { release(raw(DASH)); });
    expect(await screen.findByText('75% complete')).toBeTruthy();
  });

  it('switching plans drops the last plan’s figure, and a slower answer for it never replaces the new one', async () => {
    let releaseFirst!: (r: Response) => void;
    let calls = 0;
    serve({
      1: () => (++calls === 1 ? Promise.resolve(raw(DASH)) : new Promise<Response>((r) => { releaseFirst = r; })),
      2: { ...NOT_LINKED, qmp: { id: 2, name: 'Device Quality Plan', version: '2.0', status: 'draft' } },
    }, TWO);
    render(<QmpWorkspace {...props()} />);
    expect(await screen.findByText('75% complete')).toBeTruthy();

    // Back to plan 2, then to plan 1 (slow), then to plan 2 again before plan 1 answers.
    fireEvent.click(screen.getByRole('button', { name: 'Device Quality Plan' }));
    expect(await screen.findByText('Not assessed')).toBeTruthy();
    expect(screen.queryByText('75% complete')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'CER Quality Plan' }));
    expect(screen.queryByText('Not assessed')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Device Quality Plan' }));
    expect(await screen.findByText('Not assessed')).toBeTruthy();

    await act(async () => { releaseFirst(raw(DASH)); });
    expect(screen.getByText('Not assessed')).toBeTruthy();
    expect(screen.queryByText('75% complete')).toBeNull();
  });
});
