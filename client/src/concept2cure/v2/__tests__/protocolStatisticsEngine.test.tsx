// @vitest-environment jsdom
/**
 * The Statistics tab sizes the protocol's study WITHOUT leaving Authoring.
 *
 * Until this file the tab showed the readiness percentage and the N / power /
 * alpha already stored on the design record, and the one action that computes
 * and applies a sample size rendered only on the separate `biostatistics`
 * surface. A statistician in the launch Authoring app could read the stored
 * figures and could not produce them: the tab's single action was a deep link
 * out of the app.
 *
 * These assert the four things that make the tab stand on its own:
 *
 *   1. the engine's COMPUTATION is on screen — the computed N and power, the
 *      assumptions it used, and the judgment verdict by dimension — beside the
 *      stored figures, not instead of them;
 *   2. the governed write that puts the engine's N onto the design is IN the
 *      tab, and posts the reason the author stated;
 *   3. a design the engine cannot size shows the named gap and NO computed N
 *      (an IVD design records no accuracy targets, and the bridge says so);
 *   4. a refusal from the server is shown as the server's own sentence.
 *
 * The tab is driven through `ProtocolWorkspace`, not in isolation, because
 * "available in the Authoring app" is the claim under test.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ProtocolWorkspace } from '../surfaces/ProtocolDev';
import { clearNavParams } from '../navParams';

const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj }) as Response;
const refuse = (status: number, body: unknown) => ({ ok: false, status, json: async () => body }) as Response;

function Providers({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const PROGRAM = { id: '0f3c1a2b-1111-4222-8333-444455556666', title: 'BX-204', product: 'BX-204' };

const DOC = {
  id: '41', title: 'A Phase III Study of BX-204', shortTitle: 'BX-204-301', kind: 'clinical',
  version: '0.7', status: 'draft', sponsor: 'Sponsor', pi: 'PI', updated: 'today',
  completeness: 68, openSection: 's1',
  sections: [{ id: 's1', num: '1', title: 'Background', status: 'draft', required: true }],
  content: {}, objectives: [], eligibility: { inclusion: [], exclusion: [] },
  soa: { visits: [], rows: [] }, risks: [], milestones: [],
  budget: { total: 0, categories: [], spent: 0 }, amendments: [], deviations: [],
  reviews: [], consent: [], completenessFindings: [],
  studyDesign: {
    studyId: 'STUDY-1', resolved: true, title: 'BX-204 pivotal in T2D', phase: '3', indication: 'type 2 diabetes',
    status: 'draft', linkedAt: '', riskLevel: 'medium', canAdvance: false, blocksApproval: false,
    counts: { critical: 0, major: 1, minor: 0, info: 0 }, summary: '', standardsChecked: [], findings: [],
  },
};

/* The STORED figures differ from the COMPUTED ones on purpose: 400 subjects at
   80% power is what the design record holds, 526 at 90% is what the engine
   computes for it. A tab that only echoed the record would show 400/80% and
   nothing else, and would pass no assertion below. */
const SIZED = {
  studyId: 'STUDY-1', title: 'BX-204 pivotal in T2D',
  readiness: {
    percent: 62,
    checks: [
      { key: 'alpha', label: 'Alpha stated', ok: true },
      { key: 'estimand', label: 'Primary estimand defined (ICH E9(R1))', ok: false, hint: 'Define the estimand for the primary endpoint.' },
    ],
    plannedSampleSize: 400, power: 0.8, alpha: 0.05, primaryEndpoint: 'HbA1c change',
  },
  adapter: {
    input: { alpha: 0.05, powerTarget: 0.9, effectSize: 0.4, variance: 0.25, endpointType: 'continuous' },
    gaps: [{ field: 'attritionRate', message: 'No dropout rate in the statistical plan; 15% assumed.', severity: 'defaulted', designPath: 'statisticalPlan.dropoutRate' }],
    mapped: ['alpha', 'effectSize'],
  },
  computation: {
    method: 'Two-sample t-test (normal approximation)',
    sampleSize: { total: 420, perGroup: 210, groups: 2 },
    adjustedTotal: 526, power: 0.902, alpha: 0.05, effectSize: 0.4, attritionAdjusted: true,
    formula: 'n per group = 2(z(1-a/2) + z(1-b))^2 s^2 / d^2',
    assumptions: [
      { parameter: 'variance', value: 0.25, source: 'user_provided', sensitivity: 'high' },
      { parameter: 'dropoutRate', value: 0.15, source: 'default', sensitivity: 'moderate' },
    ],
  },
  judgment: {
    overallVerdict: 'marginal', overallRisk: 'moderate', actionRecommendation: 'proceed_with_conditions',
    dimensions: [
      { name: 'Power Adequacy', verdict: 'adequate', score: 88, rationale: '90% power at the stated effect size.', flags: [] },
      { name: 'Attrition Sensitivity', verdict: 'marginal', score: 61, rationale: 'The dropout rate is assumed, not recorded.', flags: ['assumed dropout'] },
    ],
    escalationReasons: [],
  },
  provenance: { engine: 'c2c-stats', engineVersion: '1.0.0', inputsSha256: 'abcdef0123456789' },
  filing: { programId: PROGRAM.id, programType: 'NDA', applicationType: 'nda', projectId: 42 },
  placements: [], existingDeliverables: [], proposedTasks: [], existingTaskKeys: [],
};

/* An IVD accuracy design: the schema records no target sensitivity,
   specificity, prevalence or performance-goal margin, so the adapter yields no
   engine input and the bridge reports it blocked (design-adapter.ts). */
const IVD_BLOCKED = {
  ...SIZED,
  readiness: { ...SIZED.readiness, percent: 24, plannedSampleSize: null, power: null },
  adapter: {
    input: null,
    gaps: [{
      field: 'sensitivity',
      message: 'An IVD accuracy study is sized from target sensitivity and specificity, expected prevalence and the performance-goal margin. The design does not record them, so it cannot be sized here.',
      severity: 'blocking',
      designPath: 'statisticalPlan.powerAssumptions',
    }],
    mapped: [],
  },
  computation: null,
  judgment: null,
  provenance: { engine: 'c2c-stats', engineVersion: '1.0.0', inputsSha256: null },
};

const REFUSAL = 'The design cannot be sized until its blocking gaps are resolved.';

const posted: Array<{ path: string; body: any }> = [];

function route(opts: { assessment?: Record<string, unknown>; applyRefused?: boolean } = {}) {
  posted.length = 0;
  apiRequest.mockImplementation(async (method: string, url: string, body?: any) => {
    if (method === 'GET' && url.startsWith('/api/protocol-dev')) return ok({ success: true, data: [DOC] });
    if (method === 'GET' && url === '/api/biostat-bridge/designs/STUDY-1/assessment') {
      return ok({ data: opts.assessment ?? SIZED });
    }
    if (method === 'POST' && url.endsWith('/STUDY-1/apply-sample-size')) {
      posted.push({ path: url, body });
      return opts.applyRefused
        ? refuse(422, { error: 'CANNOT_SIZE', details: { message: REFUSAL } })
        : ok({ data: { studyId: 'STUDY-1', plannedSampleSize: 526, power: 0.9, actionId: 'act_1', auditId: 'aud_1', sha256Chain: 'c' } });
    }
    if (method === 'POST') { posted.push({ path: url, body }); return ok({ data: {} }); }
    return ok({});
  });
}

const props = () => ({ surface: { id: 'protocol-dev', label: 'Protocol', navTier: 'project' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biotech' });

async function openStatistics(p = props()) {
  render(<Providers><ProtocolWorkspace {...p} /></Providers>);
  fireEvent.click(await screen.findByRole('tab', { name: /Statistics/ }));
  return p;
}

const applyButton = () => screen.getByRole('button', { name: /Apply sample size to design/ }) as HTMLButtonElement;

async function applyWithReason(reason: string) {
  fireEvent.click(applyButton());
  fireEvent.change(await screen.findByLabelText(/Reason for change/), { target: { value: reason } });
  fireEvent.click(screen.getByRole('button', { name: /Apply and record/ }));
}

beforeEach(() => {
  apiRequest.mockReset();
  clearNavParams();
  (window as any).C2C_PROJECT = PROGRAM;
});
afterEach(() => { cleanup(); clearNavParams(); delete (window as any).C2C_PROJECT; });

describe('protocol-dev Statistics tab — the engine computes in the tab', () => {
  it("shows the engine's computed N and power, the assumptions it used, and the verdict by dimension", async () => {
    route();
    await openStatistics();
    await screen.findByText('BX-204 pivotal in T2D');

    // The COMPUTATION, not the stored figures: 526 at 90%, with the method and
    // the engine that produced them.
    expect(screen.getByText('526')).toBeTruthy();
    expect(screen.getByText('90%')).toBeTruthy();
    expect(screen.getByText(/Two-sample t-test/)).toBeTruthy();
    expect(screen.getByText(/c2c-stats 1\.0\.0/)).toBeTruthy();

    // The stored figures are still there — the tab does not replace the record
    // with the recomputation.
    expect(screen.getByText('400')).toBeTruthy();
    expect(screen.getByText('80%')).toBeTruthy();

    // The assumptions the engine used, each with where the value came from.
    const assumptions = screen.getByRole('table', { name: /Assumptions the engine used/i });
    expect(within(assumptions).getByText('dropoutRate')).toBeTruthy();
    expect(within(assumptions).getByText('0.15')).toBeTruthy();
    expect(within(assumptions).getByText(/default/)).toBeTruthy();
    expect(within(assumptions).getByText('variance')).toBeTruthy();

    // The judgment, by dimension, with the engine's reason for each.
    const judged = screen.getByRole('table', { name: /Judged by dimension/i });
    expect(within(judged).getByText('Power Adequacy')).toBeTruthy();
    expect(within(judged).getByText('Attrition Sensitivity')).toBeTruthy();
    expect(within(judged).getByText(/dropout rate is assumed, not recorded/)).toBeTruthy();

    // The deep link into the designer is still offered, and is no longer the
    // only way to compute.
    expect(screen.getByRole('button', { name: /Open in Biostatistics/ })).toBeTruthy();
  });

  it('applies the engine’s sample size from the tab, as a governed write with the stated reason', async () => {
    route();
    await openStatistics();
    await screen.findByText('526');

    expect(applyButton().disabled).toBe(false);
    await applyWithReason('Adopt the bridge sizing for protocol v0.8.');

    await waitFor(() => expect(posted.some((p) => p.path.endsWith('/STUDY-1/apply-sample-size'))).toBe(true));
    expect(posted.find((p) => p.path.endsWith('/apply-sample-size'))!.body).toEqual({ reason: 'Adopt the bridge sizing for protocol v0.8.' });
    expect(await screen.findByText(/Sample size 526 written to/)).toBeTruthy();
  });

  it('a design the engine cannot size shows the named gap and offers no computed N', async () => {
    route({ assessment: IVD_BLOCKED });
    await openStatistics();
    await screen.findByText('BX-204 pivotal in T2D');

    expect(screen.getByText(/does not record them, so it cannot be sized here/)).toBeTruthy();
    expect(screen.getByText(/blocking/)).toBeTruthy();
    expect(screen.getByText(/Not sized/)).toBeTruthy();
    // No number is shown for a design that was not sized, and the write is refused locally.
    expect(screen.queryByText('526')).toBeNull();
    expect(applyButton().disabled).toBe(true);
  });

  /* The write changes the design's statistical plan, and the design gates'
     findings this workspace shows on its Study design tab are computed FROM
     that plan. A tab that wrote and did not re-read would leave the rest of
     the workspace reporting the previous plan as current. */
  it('re-reads the design and the protocol after the write it confirmed', async () => {
    route();
    await openStatistics();
    await screen.findByText('526');
    const reads = (u: string) => apiRequest.mock.calls.filter((c) => String(c[1]).startsWith(u)).length;
    const beforeDesign = reads('/api/biostat-bridge/designs/STUDY-1/assessment');
    const beforeDoc = reads('/api/protocol-dev');

    await applyWithReason('Adopt the bridge sizing for protocol v0.8.');
    await screen.findByText(/Sample size 526 written to/);

    await waitFor(() => expect(reads('/api/biostat-bridge/designs/STUDY-1/assessment')).toBeGreaterThan(beforeDesign));
    await waitFor(() => expect(reads('/api/protocol-dev')).toBeGreaterThan(beforeDoc));
  });

  it('shows a refusal from the server as the server’s own sentence', async () => {
    route({ applyRefused: true });
    await openStatistics();
    await screen.findByText('526');

    await applyWithReason('A sufficiently long reason for the change.');

    expect(await screen.findByText(new RegExp(REFUSAL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeTruthy();
    expect(screen.queryByText(/written to/)).toBeNull();
  });
});
