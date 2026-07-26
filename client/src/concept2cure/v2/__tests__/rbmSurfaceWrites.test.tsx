// @vitest-environment jsdom
/**
 * Proves the RBM v2 surfaces persist. Every control that looks like it changed
 * something must hit the real /api/mdx/rbm-* endpoint and then ask the shell to
 * re-read the board — never mutate a local copy. These tests fail if a surface
 * regresses to optimistic local state.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest }));

import { RbmKris, RbmQtls, RbmRact } from '../surfaces/RbmSurfacesA';
import { RbmSignals, RbmSites, RbmPlan } from '../surfaces/RbmSurfacesB';
import type { RbmBoard } from '../surfaces/rbmBoard';

const PROGRAM = '11111111-2222-3333-4444-555555555555';

function envelope(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

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
    assessment: { id: 7, framework: 'ich_e6r3', version: 1, status: 'draft', updated: null, approval: null, history: [] },
    items: [{ id: 21, category: 'safety', factor: 'SAE reporting', l: 3, i: 5, det: 2, critical: true, mitigation: 'Central review', residual: null, status: 'open', owner: null, refCode: 'R-1' }],
    kris: [{ id: 5, name: 'Query rate', metric: 'Open queries', source: 'edc', unit: '%', dir: 'higher_worse', amber: 10, red: 20, current: 12, status: 'amber', at: null, spark: [11, 12] }],
    qtls: [{ id: 9, parameter: 'Dropout rate', rationale: 'Power', unit: null, secondary: 0.15, threshold: 0.2, current: 0.24, status: 'breached', breachActionTaken: null }],
    signals: [{ id: 31, source: 'central_stat', type: 'outlier_quality', severity: 'high', title: 'Site 5 is a quality outlier', site: '5', detail: 'robust z 3.4', detected: null, status: 'new', resolution: null }],
    patients: [],
    sites: [{ n: '5', name: 'Mercy Clinical', country: null, composite: 71, enr: 18, qual: 20, ops: 15, tier: 'enhanced', drivers: ['quality'], at: null }],
    oversight: { 5: { open: 1, high: 1 } },
    plan: { id: 3, title: 'Monitoring plan', strategy: 'risk_based', status: 'draft', updated: null, tiers: null, anaDraft: false, approval: null },
    actions: [{ id: 41, type: 'issue', title: 'Confirm control', priority: 'high', owner: 'Unassigned', due: '2026-08-01', status: 'open', overdue: false, origin: 'ract' }],
    ...over,
  };
}

/** The write calls made in a test, ignoring the reads the surfaces do. */
function writes() {
  return apiRequest.mock.calls.filter((c: unknown[]) => c[0] !== 'GET');
}

afterEach(() => cleanup());
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/task-management/assignees') {
      return envelope({ success: true, data: [{ id: '12', name: 'Jordan Chen' }], total: 1 });
    }
    if (method === 'GET') return envelope({ data: [] });
    return envelope({ data: { id: 1 }, meta: { count: 1, cohortSize: 4, flagged: 2 } }, 201);
  });
});

describe('RBM v2 surfaces persist their writes', () => {
  it('appends a KRI reading through the real values endpoint', async () => {
    const reload = vi.fn();
    render(<RbmKris board={board()} onReload={reload} />);
    fireEvent.click(screen.getByRole('button', { name: /Add reading/ }));
    fireEvent.change(await screen.findByRole('spinbutton'), { target: { value: '18' } });
    fireEvent.click(screen.getByRole('button', { name: /Append reading/ }));
    await waitFor(() => {
      expect(writes()).toContainEqual(['POST', '/api/mdx/rbm-kris/5/values', { value: 18 }]);
    });
    // The board is re-read rather than the local row being patched.
    expect(reload).toHaveBeenCalled();
  });

  it('creates a KRI against the program, with blank thresholds left null', async () => {
    render(<RbmKris board={board()} onReload={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /New KRI/ }));
    fireEvent.change(screen.getByLabelText('Indicator name'), { target: { value: 'CRF entry lag' } });
    fireEvent.change(screen.getByLabelText('Metric definition'), { target: { value: 'Days to entry' } });
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'days' } });
    fireEvent.click(screen.getByRole('button', { name: /Create KRI/ }));
    await waitFor(() => expect(writes().length).toBe(1));
    const [method, url, body] = writes()[0];
    expect(method).toBe('POST');
    expect(url).toBe('/api/mdx/rbm-kris');
    expect(body).toMatchObject({ programId: PROGRAM, name: 'CRF entry lag', thresholdAmber: null, thresholdRed: null });
  });

  it('writes a QTL breach response onto the QTL', async () => {
    render(<RbmQtls board={board()} onReload={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Document breach/ }));
    fireEvent.change(screen.getByLabelText('Root-cause justification'), { target: { value: 'Site 5 attrition' } });
    fireEvent.change(screen.getByLabelText(/Supporting evidence/), { target: { value: 'Listing 3.1' } });
    fireEvent.change(screen.getByLabelText(/CAPA/), { target: { value: 'Retention plan' } });
    fireEvent.click(screen.getByRole('button', { name: /Record breach response/ }));
    await waitFor(() => expect(writes().length).toBe(1));
    const [method, url, body] = writes()[0];
    expect(method).toBe('PATCH');
    expect(url).toBe('/api/mdx/rbm-qtls/9');
    expect((body as { breachActionTaken: string }).breachActionTaken).toContain('Site 5 attrition');
  });

  it('posts a CtQ factor with the components, letting the engine derive the score', async () => {
    render(<RbmRact board={board()} onReload={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Add CtQ factor/ }));
    fireEvent.change(screen.getByLabelText('Critical-to-quality factor'), { target: { value: 'Consent documentation' } });
    fireEvent.change(screen.getByLabelText(/Mitigation/), { target: { value: 'Consent version control' } });
    fireEvent.change(screen.getByLabelText('Likelihood (1-5)'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Impact (1-5)'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /Add factor/ }));
    await waitFor(() => expect(writes().length).toBe(1));
    const [, url, body] = writes()[0];
    expect(url).toBe('/api/mdx/rbm-risk-items');
    // No riskScore is posted — the server computes likelihood x impact — and
    // 4 x 5 = 20 lands in the engine's high band, so the factor is critical.
    expect(body).toMatchObject({ likelihood: 4, impact: 5, isCritical: true, assessmentId: 7 });
    expect(body).not.toHaveProperty('riskScore');
  });

  it('triages a signal through the signals endpoint', async () => {
    render(<RbmSignals board={board()} onReload={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Site 5 is a quality outlier/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Triage' }));
    await waitFor(() => {
      expect(writes()).toContainEqual(['PATCH', '/api/mdx/rbm-signals/31', { status: 'triaged' }]);
    });
  });

  it('runs central monitoring server-side and reports the engine counts', async () => {
    render(<RbmSignals board={board()} onReload={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Run central monitoring/ }));
    await waitFor(() => {
      expect(writes()).toContainEqual(['POST', '/api/mdx/rbm-central-monitoring/run', { programId: PROGRAM }]);
    });
    expect(await screen.findByText(/Scanned 4 sites/)).toBeTruthy();
  });

  it('recomputes site risk server-side', async () => {
    render(<RbmSites board={board()} onReload={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Recompute site risk/ }));
    await waitFor(() => {
      expect(writes()).toContainEqual(['POST', '/api/mdx/rbm-site-risk/recompute', { programId: PROGRAM }]);
    });
  });

  it('advances a monitoring action through the actions endpoint', async () => {
    render(<RbmPlan board={board()} onReload={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Start/ }));
    await waitFor(() => {
      expect(writes()).toContainEqual(['PATCH', '/api/mdx/rbm-monitoring-actions/41', { status: 'in_progress' }]);
    });
  });

  it('generates the plan from the RACT when the study has none', async () => {
    render(<RbmPlan board={board({ plan: null })} onReload={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Generate from RACT/ }));
    await waitFor(() => {
      expect(writes()).toContainEqual(['POST', '/api/mdx/rbm-monitoring-plans/generate', { programId: PROGRAM }]);
    });
  });

  it('will not offer to raise an action when there is no plan to attach it to', async () => {
    render(<RbmPlan board={board({ plan: null, actions: [] })} onReload={vi.fn()} />);
    const add = await screen.findByRole('button', { name: /Add action/ });
    await waitFor(() => expect(add).toHaveProperty('disabled', true));
  });

  it('surfaces the server error and changes nothing when a write is rejected', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET') return envelope({ data: [] });
      return envelope({ error: 'Signal not found in this organization' }, 404);
    });
    const reload = vi.fn();
    render(<RbmSignals board={board()} onReload={reload} />);
    fireEvent.click(screen.getByRole('button', { name: /Site 5 is a quality outlier/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Triage' }));
    expect(await screen.findByText(/Signal not found in this organization/)).toBeTruthy();
    // A failed write must not be reported as success, and must not refresh as
    // though something had changed.
    expect(screen.getByText(/The change was not saved/)).toBeTruthy();
    expect(reload).not.toHaveBeenCalled();
  });
});
