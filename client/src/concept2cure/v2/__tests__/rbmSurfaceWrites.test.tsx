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
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { RbmKris, RbmQtls, RbmRact, RbmOverview } from '../surfaces/RbmSurfacesA';
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
    assessment: { id: 7, framework: 'ich_e6r3', version: 1, status: 'draft', updated: null, approval: null, history: [{ id: 7, v: 1, status: 'draft', by: null, when: null, reason: null, amendmentReason: null }] },
    items: [{ id: 21, category: 'safety', factor: 'SAE reporting', l: 3, i: 5, det: 2, critical: true, mitigation: 'Central review', residual: null, status: 'open', owner: null, refCode: 'R-1' }],
    kris: [{ id: 5, name: 'Query rate', metric: 'Open queries', source: 'edc', unit: '%', dir: 'higher_worse', amber: 10, red: 20, current: 12, status: 'amber', at: null, spark: [11, 12] }],
    qtls: [{ id: 9, parameter: 'Dropout rate', rationale: 'Power', unit: null, secondary: 0.15, threshold: 0.2, current: 0.24, status: 'breached', breachActionTaken: null }],
    signals: [{ id: 31, source: 'central_stat', type: 'outlier_quality', severity: 'high', title: 'Site 5 is a quality outlier', site: '5', detail: 'robust z 3.4', detected: null, status: 'new', resolution: null }],
    patients: [],
    sites: [{ n: '5', name: 'Mercy Clinical', country: null, composite: 71, enr: 18, qual: 20, ops: 15, tier: 'enhanced', drivers: ['quality'], at: null }],
    oversight: { 5: { open: 1, high: 1 } },
    plan: { id: 3, title: 'Monitoring plan', strategy: 'risk_based', status: 'draft', updated: null, tiers: null, anaDraft: false, approval: null },
    actions: [{ id: 41, planId: 3, type: 'issue', title: 'Confirm control', priority: 'high', owner: 'Unassigned', due: '2026-08-01', status: 'open', overdue: false, origin: 'ract' }],
    freshness: [],
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

  it('refuses to edit the CtQ register of an approved assessment', async () => {
    // The e-signature attests to specific content. Editing underneath it would
    // leave the approval block naming a signer for content they never saw.
    const approved = board({
      assessment: {
        id: 7, framework: 'ich_e6r3', version: 1, status: 'active', updated: null,
        approval: { by: 'Jordan Chen', when: '2026-06-01', reason: 'Risk review complete' }, history: [],
      },
    });
    render(<RbmRact board={approved} onReload={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Add CtQ factor/ })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Approved assessment — CtQ content is fixed under the signature' }))
      .toHaveProperty('disabled', true);
    expect(writes()).toHaveLength(0);
  });

  it('omits fields it cannot show when editing, instead of blanking them', async () => {
    // The board carries no risk description, owner or residual components, so
    // the form opens blank for them. Sending those blanks would erase stored
    // data on an unrelated edit.
    render(<RbmRact board={board()} onReload={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(await screen.findByLabelText(/Mitigation/), { target: { value: 'Central review + KRI' } });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    await waitFor(() => expect(writes().length).toBe(1));
    const [method, url, body] = writes()[0];
    expect(method).toBe('PATCH');
    expect(url).toBe('/api/mdx/rbm-risk-items/21');
    expect(body).toMatchObject({ mitigation: 'Central review + KRI' });
    for (const k of ['riskDescription', 'assignedTo', 'residualLikelihood', 'residualImpact']) {
      expect(body).not.toHaveProperty(k);
    }
  });

  it('shows and mutates only the displayed plan\'s actions', async () => {
    // An action carried on a superseded plan version must not appear under —
    // or be advanced from — the plan on screen.
    const multi = board({
      actions: [
        { id: 41, planId: 3, type: 'issue', title: 'Current plan action', priority: 'high', owner: 'Unassigned', due: '2026-08-01', status: 'open', overdue: false, origin: 'ract' },
        { id: 99, planId: 2, type: 'issue', title: 'Superseded plan action', priority: 'high', owner: 'Unassigned', due: '2026-08-01', status: 'open', overdue: false, origin: 'ract' },
      ],
    });
    render(<RbmPlan board={multi} onReload={vi.fn()} />);
    expect(screen.getByText('Current plan action')).toBeTruthy();
    expect(screen.queryByText('Superseded plan action')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Start/ }));
    await waitFor(() => {
      expect(writes()).toContainEqual(['PATCH', '/api/mdx/rbm-monitoring-actions/41', { status: 'in_progress' }]);
    });
  });

  it('records an investigation and its follow-up action in one transactional call', async () => {
    render(<RbmSignals board={board()} onReload={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Site 5 is a quality outlier/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Document investigation/ }));
    fireEvent.change(await screen.findByLabelText('Root cause'), { target: { value: 'Staff turnover' } });
    fireEvent.change(screen.getByLabelText(/Action taken/), { target: { value: 'Retrain and re-monitor' } });
    fireEvent.change(screen.getByLabelText('Follow-up action'), { target: { value: 'capa' } });
    fireEvent.click(screen.getByRole('button', { name: /Save investigation/ }));
    await waitFor(() => expect(writes().length).toBe(1));
    const [method, url, body] = writes()[0];
    // One call, not a signal PATCH followed by a separate action POST that
    // could fail after the disposition already committed.
    expect(method).toBe('POST');
    expect(url).toBe('/api/mdx/rbm-signals/31/investigate');
    expect(body).toMatchObject({ status: 'investigating' });
    expect((body as { action: { planId: number; actionType: string } }).action)
      .toMatchObject({ planId: 3, actionType: 'capa' });
  });

  it('states outright when no source feed is tracked', () => {
    // Showing nothing would let hand-entered indicator values read as
    // monitored data of unknown age.
    render(<RbmOverview board={board({ freshness: [] })} onTab={vi.fn()} />);
    expect(screen.getByText(/No source feeds are tracked for this study/)).toBeTruthy();
  });

  it('marks a stale feed on the overview rather than showing its age neutrally', () => {
    render(<RbmOverview board={board({
      freshness: [
        { source: 'edc', lastRunAt: '2026-07-01T00:00:00.000Z', dataCutoff: '2026-06-30', status: 'succeeded', rowsAccepted: 400, rowsRejected: 0, stale: false, ageDays: 1 },
        { source: 'ctms', lastRunAt: '2026-07-01T00:00:00.000Z', dataCutoff: '2026-06-01', status: 'succeeded', rowsAccepted: 90, rowsRejected: 2, stale: true, ageDays: 30 },
      ],
    })} onTab={vi.fn()} />);
    expect(screen.getByText('edc')).toBeTruthy();
    expect(screen.getByText('30d old')).toBeTruthy();
    const ctms = screen.getByText('ctms').closest('.rbm-fresh-src')!;
    expect(ctms.getAttribute('data-stale')).toBe('true');
    const edc = screen.getByText('edc').closest('.rbm-fresh-src')!;
    expect(edc.getAttribute('data-stale')).toBeNull();
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

describe('RBM metric ingest — reports what the load actually did', () => {
  const ingestResult = (over: Record<string, unknown> = {}) => ({
    runId: 12, status: 'succeeded', received: 2, accepted: 2, rejected: 0, rejects: [],
    projection: { kriReadings: 1, qtlUpdates: 1, subjectProfiles: 0, siteObservations: 0, unmatched: [] },
    ...over,
  });

  function mockIngest(payload: unknown, status = 201) {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET') return envelope({ data: [] });
      if (url === '/api/mdx/rbm-metric-ingest') return envelope({ data: payload }, status);
      return envelope({ data: {} }, 201);
    });
  }

  it('posts the pasted extract with its source and cutoff', async () => {
    mockIngest(ingestResult());
    render(<RbmOverview board={board()} onTab={vi.fn()} onReload={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Load extract…/ }));
    fireEvent.change(await screen.findByLabelText(/paste the rows/), {
      target: { value: 'metric_key,value\nQuery rate,12.5\n' },
    });
    fireEvent.change(screen.getByLabelText(/Data cutoff/), { target: { value: '2026-07-20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Load extract' }));
    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c: unknown[]) => c[1] === '/api/mdx/rbm-metric-ingest');
      expect(call).toBeTruthy();
      expect(call![2]).toMatchObject({ programId: PROGRAM, source: 'edc', dataCutoff: '2026-07-20' });
    });
    expect(await screen.findByText(/Run 12 — succeeded/)).toBeTruthy();
  });

  it('shows the rejected rows and their reasons on a partial load', async () => {
    // A partial load must not read as a success — the rejected rows are the
    // whole point of surfacing the run.
    mockIngest(ingestResult({
      status: 'partial', received: 3, accepted: 1, rejected: 2,
      rejects: [
        { row: 2, reason: 'denominator is zero — a rate cannot be computed' },
        { row: 3, reason: 'metric_key is missing' },
      ],
    }));
    render(<RbmOverview board={board()} onTab={vi.fn()} onReload={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Load extract…/ }));
    fireEvent.change(await screen.findByLabelText(/paste the rows/), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Load extract' }));
    expect(await screen.findByText(/Run 12 — partial/)).toBeTruthy();
    expect(screen.getByText(/denominator is zero/)).toBeTruthy();
    expect(screen.getByText('metric_key is missing')).toBeTruthy();
  });

  it('calls out metrics that matched no indicator, even when nothing was rejected', async () => {
    // "2 accepted, 0 rejected" would otherwise read as a clean load while every
    // indicator stayed unevaluated.
    mockIngest(ingestResult({
      projection: { kriReadings: 0, qtlUpdates: 0, subjectProfiles: 0, siteObservations: 0, unmatched: ['Screen fail rate', 'AE onset lag'] },
    }));
    render(<RbmOverview board={board()} onTab={vi.fn()} onReload={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Load extract…/ }));
    fireEvent.change(await screen.findByLabelText(/paste the rows/), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Load extract' }));
    expect(await screen.findByText(/matched no configured KRI or QTL/)).toBeTruthy();
    expect(screen.getByText(/Screen fail rate, AE onset lag/)).toBeTruthy();
    expect(screen.getByText(/Nothing on this study changed as a result of this load/)).toBeTruthy();
  });
});

describe('RBM RACT — versioned amendment of a signed assessment', () => {
  const approvedBoard = () => board({
    assessment: {
      id: 7, framework: 'ich_e6r3', version: 2, status: 'active', updated: null,
      approval: { by: 'Jordan Chen', when: '2026-06-01', reason: 'Risk review complete' },
      history: [
        { id: 7, v: 2, status: 'active', by: 'Jordan Chen', when: '2026-06-01', reason: 'Risk review complete', amendmentReason: 'Enrollment risk revised' },
        { id: 4, v: 1, status: 'archived', by: 'Sam Okafor', when: '2026-04-02', reason: 'Initial approval', amendmentReason: null },
      ],
    },
  });

  it('offers Amend on an approved assessment instead of dead-ending the register', () => {
    render(<RbmRact board={approvedBoard()} onReload={vi.fn()} />);
    // Editing in place stays refused...
    expect(screen.getByRole('button', { name: /Add CtQ factor/ })).toHaveProperty('disabled', true);
    // ...but there is a governed way forward.
    expect(screen.getByRole('button', { name: /Amend — new version/ })).toHaveProperty('disabled', false);
  });

  it('opens the amendment with a reason, and says the signed version is preserved', async () => {
    render(<RbmRact board={approvedBoard()} onReload={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Amend — new version/ }));
    // The dialog must be explicit that v2 and its signature survive.
    expect(await screen.findByText(/creates version 3 as a draft/)).toBeTruthy();
    expect(screen.getByText(/left exactly as approved/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Why is the assessment being amended/), {
      target: { value: 'Dropout rate exceeded plan assumptions' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Open amendment/ }));
    await waitFor(() => {
      expect(writes()).toContainEqual(['POST', '/api/mdx/rbm-assessments/7/amend', { reason: 'Dropout rate exceeded plan assumptions' }]);
    });
  });

  it('renders the version chain with each version\'s own signature', () => {
    render(<RbmRact board={approvedBoard()} onReload={vi.fn()} />);
    expect(screen.getByText(/v2 — active — approved 2026-06-01 by Jordan Chen/)).toBeTruthy();
    expect(screen.getByText(/v1 — archived — approved 2026-04-02 by Sam Okafor/)).toBeTruthy();
  });

  it('does not offer Amend on a draft — a draft is already editable', () => {
    render(<RbmRact board={board()} onReload={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Amend — new version/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Add CtQ factor/ })).toHaveProperty('disabled', false);
  });
});
