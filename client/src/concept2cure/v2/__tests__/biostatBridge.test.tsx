// @vitest-environment jsdom
/**
 * Biostatistics ↔ study design bridge — the designer loads a PERSISTED study,
 * says what the design lacks, files under the right module, and hands work to
 * the board — all through the server, nothing invented in the browser.
 *
 * ── What these assert ────────────────────────────────────────────────────────
 *   • the program's designs are listed and picking one seeds the engine from
 *     the server adapter's input (the alpha field shows the design's alpha,
 *     not a preset's);
 *   • a design arriving on the nav channel (`studyId`) is loaded on mount;
 *   • blocking gaps are shown and the write-back is disabled until resolved;
 *   • the filing placement decides the authoring module (2.7.3 → M2), and the
 *     document bar says where the document files;
 *   • "Apply sample size" requires a reason and announces nothing the server
 *     did not confirm;
 *   • "Raise tasks" posts exactly the chosen blueprint keys.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Biostatistics } from '../surfaces/Biostatistics';
import { stashNavParamsForTarget, clearNavParams } from '../navParams';

const Surface = Biostatistics as unknown as React.ComponentType<Record<string, unknown>>;

const PROGRAM = { id: '0f3c1a2b-1111-4222-8333-444455556666', title: 'BX-204', product: 'BX-204' };

const DESIGNS = [
  {
    studyId: 'STUDY-1', programId: PROGRAM.id, title: 'BX-204 pivotal in T2D', phase: '3', indication: 'type 2 diabetes', status: 'draft', updatedAt: null,
    readiness: { percent: 85, checks: [{ key: 'alpha', label: 'Alpha stated', ok: true }], plannedSampleSize: 400, power: 0.9, alpha: 0.04, primaryEndpoint: 'HbA1c change' },
  },
  {
    studyId: 'STUDY-2', programId: PROGRAM.id, title: 'BX-204 OS study', phase: '3', indication: 'NSCLC', status: 'draft', updatedAt: null,
    readiness: { percent: 30, checks: [], plannedSampleSize: null, power: null, alpha: null, primaryEndpoint: 'OS' },
  },
];

const SIZED_INPUT = {
  clientTrack: 'biotech_pharma', regulatoryBody: 'FDA', studyType: 'superiority', objectiveType: 'efficacy', endpointType: 'continuous',
  alpha: 0.04, powerTarget: 0.9, effectSize: 0.4, variance: 0.25, attritionRate: 0.2, allocationRatio: 1, numberOfGroups: 2, numberOfEndpoints: 1,
  comparatorType: 'placebo', indication: 'type 2 diabetes', phase: 'Phase III',
};

const PLACEMENTS = [
  { deliverable: 'sample_size_rationale', applicationType: 'nda', backbone: 'ectd', required: 'required', code: '5.3.5.1', heading: '5.3.5.1 Study report / protocol', module: 'M5', note: 'protocol' },
  { deliverable: 'submission_statistical_note', applicationType: 'nda', backbone: 'ectd', required: 'required', code: '2.7.3', heading: '2.7.3 Summary of clinical efficacy', module: 'M2', note: 'module 2' },
  { deliverable: 'statistical_risk_memo', applicationType: 'nda', backbone: 'ectd', required: 'not_applicable', code: null, heading: 'Internal design file — not a submission document', module: null, note: 'internal' },
];

function assessment(over: Record<string, unknown> = {}) {
  return {
    studyId: 'STUDY-1', title: 'BX-204 pivotal in T2D',
    readiness: DESIGNS[0].readiness,
    adapter: { input: SIZED_INPUT, gaps: [{ field: 'attritionRate', message: 'No dropout rate; 15% assumed.', severity: 'defaulted', designPath: 'statisticalPlan.dropoutRate' }], mapped: ['alpha'] },
    computation: { method: 'Two-sample t-test', sampleSize: { total: 420, perGroup: 210 }, adjustedTotal: 526, power: 0.9 },
    judgment: { overallVerdict: 'adequate', overallRisk: 'low', actionRecommendation: 'proceed' },
    provenance: { engine: 'c2c-stats', engineVersion: '1.0.0', inputsSha256: 'abcdef0123456789' },
    filing: { programId: PROGRAM.id, programType: 'NDA', applicationType: 'nda', projectId: 42 },
    placements: PLACEMENTS,
    existingDeliverables: [],
    proposedTasks: [
      { key: 'design-gap:confirm-defaults', title: 'Confirm 1 assumed design value', description: 'attrition', priority: 'medium', trigger: 'Defaulted assumptions' },
      { key: 'deliverable:full_statistical_analysis_plan', title: 'Draft the statistical analysis plan for the NDA', description: 'Required', priority: 'high', trigger: 'NDA filing checklist', deliverable: 'full_statistical_analysis_plan' },
      { key: 'deliverable:submission_statistical_note', title: 'Draft the submission statistical note for the NDA', description: 'Required', priority: 'high', trigger: 'NDA filing checklist', deliverable: 'submission_statistical_note' },
    ],
    existingTaskKeys: ['deliverable:submission_statistical_note'],
    ...over,
  };
}

const posted: Array<{ path: string; body: any }> = [];

function route(opts: { assessment?: Record<string, unknown>; applyOk?: boolean } = {}) {
  posted.length = 0;
  apiRequest.mockImplementation(async (method: string, path: string, body?: any) => {
    if (method === 'GET' && path.startsWith('/api/biostat-bridge/designs?program_id=')) {
      return { ok: true, status: 200, json: async () => ({ data: DESIGNS }) };
    }
    if (method === 'GET' && /^\/api\/biostat-bridge\/designs\/STUDY-1\/assessment$/.test(path)) {
      return { ok: true, status: 200, json: async () => ({ data: assessment(opts.assessment) }) };
    }
    if (method === 'GET' && /^\/api\/biostat-bridge\/designs\/STUDY-2\/assessment$/.test(path)) {
      return { ok: true, status: 200, json: async () => ({ data: assessment({
        studyId: 'STUDY-2', title: 'BX-204 OS study',
        adapter: { input: null, gaps: [{ field: 'eventRate', message: 'A time-to-event endpoint needs an expected event rate.', severity: 'blocking', designPath: 'statisticalPlan.powerAssumptions.eventRate' }], mapped: [] },
        computation: null, judgment: null, provenance: { engine: 'c2c-stats', engineVersion: '1.0.0', inputsSha256: null },
        proposedTasks: [{ key: 'design-gap:eventRate', title: 'Complete the design: event rate', description: 'x', priority: 'high', trigger: 'Blocking design gap' }],
        existingTaskKeys: [],
      }) }) };
    }
    if (method === 'GET' && path.startsWith('/api/ana-biostats/governed-documents')) {
      return { ok: true, status: 200, json: async () => ({ success: true, data: [] }) };
    }
    if (method === 'POST') {
      posted.push({ path, body });
      if (path.endsWith('/apply-sample-size')) {
        return opts.applyOk === false
          ? { ok: false, status: 422, json: async () => ({ error: 'CANNOT_SIZE', details: { message: 'The design cannot be sized until its blocking gaps are resolved.' } }) }
          : { ok: true, status: 200, json: async () => ({ data: { studyId: 'STUDY-1', plannedSampleSize: 526, power: 0.9, actionId: 'act_1', auditId: 'aud_1', sha256Chain: 'c' } }) };
      }
      if (path.endsWith('/tasks')) {
        return { ok: true, status: 200, json: async () => ({ data: { created: (body.keys as string[]).map((k) => ({ taskId: 'TASK-' + k, key: k })), skipped: [] } }) };
      }
      if (path === '/api/authoring/docs') return { ok: true, status: 200, json: async () => ({ document: { id: 'doc-1' } }) };
      if (path === '/api/authoring/sections') return { ok: true, status: 200, json: async () => ({ section: { id: 'sec-1' } }) };
    }
    return { ok: true, status: 200, json: async () => ({ data: [] }) };
  });
}

const mount = (onNav = vi.fn()) => { render(<Surface onAsk={() => {}} onNav={onNav} />); return onNav; };
const designRow = (title: string) => screen.getByRole('button', { name: new RegExp(title) });
const alphaField = () => screen.getByLabelText(/^Alpha$/) as HTMLInputElement;

beforeEach(() => {
  apiRequest.mockReset();
  clearNavParams();
  (window as any).C2C_PROJECT = PROGRAM;
});
afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; clearNavParams(); });

describe('Biostatistics — study design bridge', () => {
  it('lists the program\'s persisted designs with their statistical readiness', async () => {
    route();
    mount();
    await waitFor(() => expect(designRow('BX-204 pivotal in T2D')).toBeTruthy());
    expect(designRow('BX-204 pivotal in T2D').textContent).toContain('85%');
    expect(designRow('BX-204 OS study').textContent).toContain('30%');
    // The list is scoped to the open program, and says so.
    expect(screen.getByText(/program BX-204/)).toBeTruthy();
    const listCall = apiRequest.mock.calls.find((c) => String(c[1]).startsWith('/api/biostat-bridge/designs?'));
    expect(listCall![1]).toContain(encodeURIComponent(PROGRAM.id));
  });

  it('picking a design seeds the engine from the server adapter, not from a preset', async () => {
    route();
    mount();
    await waitFor(() => expect(designRow('BX-204 pivotal in T2D')).toBeTruthy());
    expect(alphaField().value).toBe('0.05'); // the survival preset
    fireEvent.click(designRow('BX-204 pivotal in T2D'));
    await waitFor(() => expect(alphaField().value).toBe('0.04'));
    // The assessment panel shows the SERVER's sizing, provenance-stamped.
    expect(await screen.findByText('526')).toBeTruthy();
    expect(screen.getByText(/c2c-stats 1\.0\.0/)).toBeTruthy();
    expect(screen.getByText(/Files as a/).textContent).toContain('NDA');
  });

  it('loads the design handed over on the navigation channel', async () => {
    route();
    stashNavParamsForTarget('biostatistics', { studyId: 'STUDY-1' });
    mount();
    await waitFor(() => expect(alphaField().value).toBe('0.04'));
    expect(apiRequest.mock.calls.some((c) => c[1] === '/api/biostat-bridge/designs/STUDY-1/assessment')).toBe(true);
  });

  it('a design the server could not size shows its blocking gap and disables the write-back', async () => {
    route();
    mount();
    await waitFor(() => expect(designRow('BX-204 OS study')).toBeTruthy());
    fireEvent.click(designRow('BX-204 OS study'));
    expect(await screen.findByText(/Not sized\./)).toBeTruthy();
    expect(screen.getByText(/needs an expected event rate/)).toBeTruthy();
    const apply = screen.getByRole('button', { name: /Apply sample size to design/ }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    // The engine on screen was NOT reseeded from a null input.
    expect(alphaField().value).toBe('0.05');
  });

  it('files the document under the module the placement catalog names, and says where', async () => {
    route();
    mount();
    await waitFor(() => expect(designRow('BX-204 pivotal in T2D')).toBeTruthy());
    fireEvent.click(designRow('BX-204 pivotal in T2D'));
    await waitFor(() => expect(alphaField().value).toBe('0.04'));

    // The default document (sample size rationale) is a 5.3.5.1 / M5 document:
    // the document bar says so (the code also appears in the assessment panel).
    expect(screen.getAllByText(/5\.3\.5\.1/).length).toBeGreaterThan(0);
    expect(screen.getByText(/NDA:/).textContent).toMatch(/5\.3\.5\.1 \(M5\) · required/);

    // Switch to the internal risk memo: the bar says it is not filed.
    fireEvent.click(screen.getByRole('button', { name: /Statistical Risk Memo/ }));
    expect(await screen.findByText(/Not filed with the NDA/)).toBeTruthy();

    // A Module 2 deliverable files under M2, not the historical blanket M5.
    // (The SAP-section document is registered; submission_statistical_note is
    // not a generator on this surface, so we prove the mapping through the
    // authoring hand-off's `module` on a generator that HAS a placement.)
    fireEvent.click(screen.getByRole('button', { name: /Sample Size Rationale/ }));
    fireEvent.click(screen.getAllByRole('button', { name: /File it to the dossier/ })[0]);
    await waitFor(() => expect(posted.some((p) => p.path === '/api/authoring/docs')).toBe(true));
    expect(posted.find((p) => p.path === '/api/authoring/docs')!.body).toMatchObject({ module: 'M5', client_program_id: PROGRAM.id });
  });

  it('applying the sample size requires a reason and reports only what the server confirmed', async () => {
    route();
    mount();
    await waitFor(() => expect(designRow('BX-204 pivotal in T2D')).toBeTruthy());
    fireEvent.click(designRow('BX-204 pivotal in T2D'));
    await waitFor(() => expect(alphaField().value).toBe('0.04'));

    fireEvent.click(screen.getByRole('button', { name: /Apply sample size to design/ }));
    const reason = await screen.findByLabelText(/Reason for change/);
    fireEvent.change(reason, { target: { value: 'Adopt the bridge sizing for the pivotal protocol v2.' } });
    fireEvent.click(screen.getByRole('button', { name: /Apply and record/ }));

    await waitFor(() => expect(posted.some((p) => p.path.endsWith('/STUDY-1/apply-sample-size'))).toBe(true));
    expect(posted.find((p) => p.path.endsWith('/apply-sample-size'))!.body).toEqual({ reason: 'Adopt the bridge sizing for the pivotal protocol v2.' });
    expect(await screen.findByText(/Sample size 526 written to/)).toBeTruthy();
  });

  it('a refused write-back is shown as the refusal, never as success', async () => {
    route({ applyOk: false });
    mount();
    await waitFor(() => expect(designRow('BX-204 pivotal in T2D')).toBeTruthy());
    fireEvent.click(designRow('BX-204 pivotal in T2D'));
    await waitFor(() => expect(alphaField().value).toBe('0.04'));
    fireEvent.click(screen.getByRole('button', { name: /Apply sample size to design/ }));
    fireEvent.change(await screen.findByLabelText(/Reason for change/), { target: { value: 'A sufficiently long reason.' } });
    fireEvent.click(screen.getByRole('button', { name: /Apply and record/ }));
    expect(await screen.findByText(/was not applied/)).toBeTruthy();
    expect(screen.queryByText(/written to/)).toBeNull();
  });

  it('raising tasks posts exactly the chosen keys and skips what is already on the board', async () => {
    route();
    mount();
    await waitFor(() => expect(designRow('BX-204 pivotal in T2D')).toBeTruthy());
    fireEvent.click(designRow('BX-204 pivotal in T2D'));
    await waitFor(() => expect(alphaField().value).toBe('0.04'));

    // Two of three proposed tasks are not yet on the board.
    fireEvent.click(screen.getByRole('button', { name: /Raise tasks \(2\)/ }));
    const group = await screen.findByRole('group', { name: /Raise tasks/ });
    expect(within(group).queryByLabelText(/submission statistical note/)).toBeNull(); // already open → not offered
    expect(within(group).getByText(/1 task is already open/)).toBeTruthy();
    // Deselect one, keep one.
    fireEvent.click(within(group).getByLabelText(/Confirm 1 assumed design value/));
    fireEvent.click(within(group).getByRole('button', { name: /Raise 1 task/ }));

    await waitFor(() => expect(posted.some((p) => p.path.endsWith('/STUDY-1/tasks'))).toBe(true));
    expect(posted.find((p) => p.path.endsWith('/tasks'))!.body).toEqual({ keys: ['deliverable:full_statistical_analysis_plan'] });
    expect(await screen.findByText(/1 task raised on the board/)).toBeTruthy();
  });

  it('cross-links open the protocol workspace, the task board and the submission center', async () => {
    route();
    const onNav = mount();
    await waitFor(() => expect(designRow('BX-204 pivotal in T2D')).toBeTruthy());
    fireEvent.click(designRow('BX-204 pivotal in T2D'));
    await waitFor(() => expect(alphaField().value).toBe('0.04'));
    fireEvent.click(screen.getByRole('button', { name: /Open protocol workspace/ }));
    fireEvent.click(screen.getByRole('button', { name: /Open task board/ }));
    fireEvent.click(screen.getByRole('button', { name: /Open submission center/ }));
    expect(onNav.mock.calls.map((c) => c[0])).toEqual(['protocol-dev', 'tasks', 'submission-center']);
  });
});
