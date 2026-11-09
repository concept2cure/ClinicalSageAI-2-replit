// @vitest-environment jsdom
/**
 * The RBM screens name their methods in words (demo walk, 2026-11-09). The overview, the risk report, the RACT,
 * the patient profiles and site risk printed engine identifiers (buildAttentionFeed, rbm-engine scoreRisk,
 * scorePatientCohort, MIN_COHORT, site-risk-engine, monitoringTierFromRisk()), the framework code `ich_e6r3`
 * and raw ISO times to the reader. The board fixture is rbmSurfaceWrites.test.tsx's.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest: vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) })),
}));

import { RbmRact, RbmOverview } from '../surfaces/RbmSurfacesA';
import { RbmSites, RbmPatients } from '../surfaces/RbmSurfacesB';
import { RbmFreshness } from '../surfaces/RbmSurfaces';
import type { RbmBoard } from '../surfaces/rbmBoard';

const PROGRAM = '11111111-2222-3333-4444-555555555555';

function board(over: Partial<RbmBoard> = {}): RbmBoard {
  return {
    programId: PROGRAM,
    asOf: '2026-07-01T00:00:00.000Z',
    summary: {
      overallRisk: 'medium', asOf: '2026-07-01T00:00:00.000Z',
      riskItems: { total: 1, critical: 1, open: 1, high: 1 },
      kris: { total: 1, red: 0, amber: 1, notEvaluated: 0 },
      qtls: { total: 1, breached: 1, approaching: 0, notEvaluated: 0 },
      signals: { total: 1, open: 1, high: 1 },
      sites: { total: 1, enhanced: 1 },
      patients: { scored: 0, flagged: 0, review: 0 },
    },
    attention: [],
    report: null,
    reportMarkdown: null,
    assessment: { id: 7, framework: 'ich_e6r3', version: 1, status: 'draft', updated: null, approval: null, history: [{ id: 7, v: 1, status: 'draft', by: null, when: null, reason: null, amendmentReason: null }] },
    items: [{ id: 21, category: 'safety', factor: 'SAE reporting', l: 3, i: 5, det: 2, critical: true, mitigation: 'Central review', residual: null, status: 'open', owner: null, refCode: 'R-1' }],
    kris: [{ id: 5, name: 'Query rate', metric: 'Open queries', source: 'edc', unit: '%', dir: 'higher_worse', amber: 10, red: 20, current: 12, status: 'amber', at: null, spark: [11, 12] }],
    qtls: [{ id: 9, parameter: 'Dropout rate', rationale: 'Power', unit: null, secondary: 0.15, threshold: 0.2, current: 0.24, status: 'breached', breachActionTaken: null }],
    signals: [{ id: 31, source: 'central_stat', type: 'outlier_quality', severity: 'high', title: 'Site 5 is a quality outlier', site: '5', detail: 'robust z 3.4', detected: null, status: 'new', resolution: null }],
    patients: [],
    sites: [{ n: '5', name: 'Mercy Clinical', country: null, composite: 71, enr: 18, qual: 20, ops: 15, tier: 'enhanced', drivers: ['quality'], at: null }],
    oversight: { 5: { open: 1, high: 1 } },
    plan: { id: 3, title: 'Monitoring plan', strategy: 'risk_based', status: 'draft', updated: null, tiers: null, anaDraft: false, approval: null },
    governingPlanId: 3,
    actions: [{ id: 41, planId: 3, type: 'issue', title: 'Confirm control', priority: 'high', owner: 'Unassigned', due: '2026-08-01', status: 'open', overdue: false, origin: 'ract' }],
    freshness: [],
    ...over,
  };
}

afterEach(() => cleanup());

describe('RBM screens name their methods in words', () => {
  /* Demo walk 2026-11-09: the overview printed a function name and a raw ISO string to the reader,
     "buildAttentionFeed — ordered by severity — as of 2026-11-09T17:16:38.868Z". */
  it('says how the attention list is ordered and when, without a function name or a raw ISO time', () => {
    render(<RbmOverview board={board()} onTab={vi.fn()} />);
    const sub = screen.getByText('Needs attention now').closest('.rbm-sec-h')!.querySelector('.rbm-sec-sub')!;
    expect(sub.textContent).not.toMatch(/buildAttentionFeed/);
    expect(sub.textContent).not.toMatch(/T00:00:00\.000Z/);
    expect(sub.textContent).toMatch(/^Ordered by severity · as of /);
    expect(sub.querySelector('time')?.getAttribute('datetime')).toBe('2026-07-01T00:00:00.000Z');
  });

  /* The same walk: four more lines printed engine identifiers (rbm-engine, scorePatientCohort, MIN_COHORT,
     site-risk-engine) where the reader needs the method in words. */
  it('names its methods in words on the overview, the RACT, the patient profiles and site risk', () => {
    const { container } = render(<>
      <RbmOverview board={board()} onTab={vi.fn()} />
      <RbmRact board={board()} onReload={vi.fn()} />
      <RbmPatients board={board()} onReload={vi.fn()} />
      <RbmSites board={board()} onReload={vi.fn()} />
    </>);
    const text = container.textContent ?? '';
    for (const id of ['rbm-engine', 'scoreRisk', 'scorePatientCohort', 'MIN_COHORT', 'site-risk-engine', 'monitoringTierFromRisk', 'ich_e6r3']) expect(text).not.toContain(id);
    expect(text).toContain('ICH E6(R3)');
    expect(text).toContain('Likelihood × impact banding');
    expect(text).toContain('Robust modified z-score · minimum cohort of 5');
    expect(text).toContain('Composite from site intelligence');
  });

  it('shows a subject\'s scored time as a time, and an unrecorded one as a dash', () => {
    const { container } = render(<><RbmFreshness at="2026-11-09T17:07:13.543Z" /><RbmFreshness at="—" /></>);
    expect(container.textContent).not.toMatch(/T17:07:13\.543Z/);
    expect(container.querySelector('time')?.getAttribute('datetime')).toBe('2026-11-09T17:07:13.543Z');
    expect(container.textContent).toContain('scored —');
  });
});
