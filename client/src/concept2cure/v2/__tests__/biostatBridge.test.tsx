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
import { isStatisticalSave, statisticalSaveReceipt } from './_statistical-handoff-fixture';
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
    provenance: { engine: 'c2c-stats', engineVersion: '1.0.0', inputsSha256: 'abcdef0123456789'.repeat(4) },
    filing: { programId: PROGRAM.id, programType: 'NDA', applicationType: 'nda', projectId: 42 },
    validation: { riskLevel: 'high', summary: '1 major finding', counts: { critical: 0, major: 1, minor: 0, info: 0 } },
    review: {
      overallRisk: 'high',
      standardsChecked: ['ICH E9(R1) §A.5'],
      verdict: { challengeLikelihood: 'moderate', mostVulnerable: 'Missing data', recommendedActions: ['Missing data: Make MMRM or multiple imputation the primary approach.'] },
      rows: [
        { element: 'Primary endpoint', risk: 'low', finding: 'Single primary endpoint with a complete ICH E9(R1) estimand.', action: 'No action required.', codes: [] },
        { element: 'Missing data', risk: 'high', finding: 'LOCF as the primary missing-data method.', action: 'Make MMRM or multiple imputation the primary approach.', codes: ['MIS-002'] },
      ],
    },
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

/* The deterministic statistical engine. The surface computes nothing in the
   browser: it posts the design to /api/ana-biostats/compute and renders the
   document /api/ana-biostats/document generates from that same result. These
   two are routed BEFORE `posted` is recorded, so `posted` stays a record of
   governed WRITES. The figures are deliberately not the bridge assessment's —
   the bridge panel shows the server's sizing for the persisted design, and the
   engine panel shows the engine's sizing for what is on screen; they are
   different reads and must not be confused for one another. */
const ENGINE_COMPUTE = {
  validation: { valid: true, normalizedInput: SIZED_INPUT, warnings: [], errors: [], prefilled: [] },
  computation: {
    method: 'Two-sample t-test (ANCOVA-adjusted)',
    sampleSize: { perGroup: 210, total: 420, groups: 2 },
    power: 0.9012, effectSize: 0.4, alpha: 0.04,
    adjustedSampleSize: 263, adjustedTotal: 526, attritionAdjusted: true,
    formula: 'n per group = 2 * sigma^2 * (z_a + z_b)^2 / delta^2',
    assumptions: [],
  },
  judgment: {
    overallVerdict: 'adequate', overallRisk: 'low', actionRecommendation: 'proceed',
    confidence: { level: 'high', score: 86, factors: [], limitations: [] },
    dimensions: [], fragility: { fragilityIndex: 25, category: 'robust', sensitiveParameters: [], narrative: '' },
    endpointMethodFit: { fit: 'strong', suggestedMethod: 'ANCOVA', currentMethod: 'Two-sample t-test', rationale: '', alternatives: [] },
    escalationReasons: [], roleExplanations: { technical: '', clinical: '', regulatory: '', executive: '' },
  },
  domain: { track: 'biotech_pharma', methodSuggestions: [], designConsiderations: [], endpointGuidance: [], regulatoryNotes: [], riskFactors: [] },
};

const engineDocument = (type: string) => ({
  type,
  title: type,
  content: '# ' + type + '\n\n## Sample Size Determination\n\n- **Total (adjusted)**: 526\n',
  version: 1,
  status: 'draft',
  provenance: { engineVersion: '1.0.0' },
});

/** The engine's document for the chosen type is on screen. */
const engineDocReady = (type: string) =>
  waitFor(() => expect(document.querySelector('.bs-doc-render')?.textContent ?? '').toContain(type));

/** The engine's two routes, or null when this is not one of them. */
function engineRoute(method: string, path: string, body?: any) {
  if (method !== 'POST') return null;
  if (isStatisticalSave(path, body)) {
    posted.push({ path, body });
    return { ok: true, status: 201, json: async () => statisticalSaveReceipt(body, 'doc-1') };
  }
  if (path === '/api/ana-biostats/compute') {
    return { ok: true, status: 200, json: async () => ENGINE_COMPUTE };
  }
  if (path === '/api/ana-biostats/document') {
    return { ok: true, status: 200, json: async () => engineDocument(String(body?.documentType ?? '')) };
  }
  return null;
}

/** The governed WRITES this surface makes, recorded in `posted` as they go. */
function writeRoute(path: string, body: any, opts: { applyOk?: boolean }) {
  posted.push({ path, body });
  if (path.endsWith('/apply-sample-size')) {
    return opts.applyOk === false
      ? { ok: false, status: 422, json: async () => ({ error: 'CANNOT_SIZE', details: { message: 'The design cannot be sized until its blocking gaps are resolved.' } }) }
      : { ok: true, status: 200, json: async () => ({ data: { studyId: 'STUDY-1', plannedSampleSize: 526, power: 0.9, actionId: 'act_1', auditId: 'aud_1', sha256Chain: 'c' } }) };
  }
  if (path.endsWith('/tasks')) {
    return { ok: true, status: 200, json: async () => ({ data: { created: (body.keys as string[]).map((k: string) => ({ taskId: 'TASK-' + k, key: k })), skipped: [] } }) };
  }
  if (path === '/api/authoring/docs') return { ok: true, status: 200, json: async () => ({ document: { id: 'doc-1' } }) };
  if (path === '/api/authoring/sections') return { ok: true, status: 200, json: async () => ({ section: { id: 'sec-1' } }) };
  return null;
}

function route(opts: { assessment?: Record<string, unknown>; applyOk?: boolean; designDelayMs?: number; designs?: unknown[] } = {}) {
  posted.length = 0;
  /* A design read slower than the engine's 180 ms debounce: what a real
     network does, and what let the worked example be sized first. */
  const slow = () => (opts.designDelayMs ? new Promise((r) => setTimeout(r, opts.designDelayMs)) : Promise.resolve());
  apiRequest.mockImplementation(async (method: string, path: string, body?: any) => {
    if (method === 'GET' && path.startsWith('/api/biostat-bridge/designs?program_id=')) {
      await slow();
      return { ok: true, status: 200, json: async () => ({ data: opts.designs ?? DESIGNS }) };
    }
    if (method === 'GET' && /^\/api\/biostat-bridge\/designs\/STUDY-1\/assessment$/.test(path)) {
      await slow();
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
    const engine = engineRoute(method, path, body);
    if (engine) return engine;
    if (method === 'POST') {
      const write = writeRoute(path, body, opts);
      if (write) return write;
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
    expect(screen.getByText(/project BX-204/)).toBeTruthy();
    const listCall = apiRequest.mock.calls.find((c) => String(c[1]).startsWith('/api/biostat-bridge/designs?'));
    expect(listCall![1]).toContain(encodeURIComponent(PROGRAM.id));
  });

  it('with a project open, its first design loads on arrival, seeded from the server adapter, not from a preset', async () => {
    /* 2026-10-31: the screen opened on the oncology preset and called it "your
       superiority design" while the project's own design sat unloaded in the list. */
    route();
    mount();
    await waitFor(() => expect(alphaField().value).toBe('0.04'));
    expect(apiRequest.mock.calls.some((c) => c[1] === '/api/biostat-bridge/designs/STUDY-1/assessment')).toBe(true);
    expect(screen.getByTitle('Load "BX-204 pivotal in T2D" into the engine').getAttribute('aria-pressed')).toBe('true');
    // The assessment panel shows the SERVER's sizing, provenance-stamped.
    expect(await screen.findByText('526')).toBeTruthy();
    expect(screen.getByText(/c2c-stats 1\.0\.0/)).toBeTruthy();
    expect(screen.getByText(/Files as a/).textContent).toContain('NDA');
  });

  it('opens on the project\'s first design, never on a record with no design to assess', async () => {
    /* 2026-11-09, before a client demo: the list also carries study records with no design metadata (the server
       lists them with no readiness checks, and their assessment answers 404). The newest of them was opened on
       arrival, so the page led with "Couldn't assess the design". */
    const record = { studyId: 'REGISTER-1', programId: PROGRAM.id, title: 'Stability study register entry', phase: '', indication: '', status: 'draft', updatedAt: null,
      readiness: { percent: 0, checks: [], plannedSampleSize: null, power: null, alpha: null, primaryEndpoint: null } };
    route({ designs: [record, ...DESIGNS] });
    mount();
    await waitFor(() => expect(alphaField().value).toBe('0.04'));
    expect(apiRequest.mock.calls.some((c) => c[1] === '/api/biostat-bridge/designs/STUDY-1/assessment')).toBe(true);
    expect(apiRequest.mock.calls.some((c) => String(c[1]).includes('/designs/REGISTER-1/assessment'))).toBe(false);
    expect(screen.queryByText("Couldn't assess the design")).toBeNull();
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

  /* D5 §B.4 steps 3 and 6: `ResultLead`'s headline facts moved into the
     assessment section's heading. Measured in the running app on 2026-11-02,
     the first build of it printed "137 subjects · 90% power · Inadequate"
     twice, thirty pixels apart — once in the heading and once on the engine's
     own line below it. Both halves are pinned: the heading says them, and the
     section says them once. */
  it('summarises the engine\'s figures in the section heading, once', async () => {
    route();
    mount();
    await waitFor(() => expect(designRow('BX-204 pivotal in T2D')).toBeTruthy());
    fireEvent.click(designRow('BX-204 pivotal in T2D'));
    await waitFor(() => expect(alphaField().value).toBe('0.04'));

    const assess = document.querySelector('.bs-assess')!;
    const summary = assess.querySelector('.pj-sec-h .sec-sub')!;
    expect(summary.textContent).toBe('526 subjects \u00b7 90% power \u00b7 Adequate \u00b7 1 of 1 checks pass');

    const body = (assess.querySelector('.bs-assess-b')!.textContent || '');
    expect(body, 'the heading\'s figures are printed again in the section body').not.toMatch(/526 subjects/);
    // The method and the engine are NOT the heading's, so they stay on the line.
    expect(body).toMatch(/Two-sample t-test/);
    expect(body).toMatch(/c2c-stats 1\.0\.0/);
  });

  it('says "Not sized" in that heading for a design the engine could not size', async () => {
    /* The honesty rule the lead carried comes with its figures: no dash where
       a number belongs, and the heading agrees with the disabled write. */
    route();
    mount();
    await waitFor(() => expect(designRow('BX-204 OS study')).toBeTruthy());
    fireEvent.click(designRow('BX-204 OS study'));
    await screen.findByText(/Not sized\./);

    const summary = document.querySelector('.bs-assess .pj-sec-h .sec-sub')!;
    expect(summary.textContent).toBe('Not sized \u00b7 1 of 1 checks pass');
    expect(summary.textContent).not.toMatch(/\u2014|subjects|power/);
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
    await engineDocReady('sample_size_rationale');
    fireEvent.click(screen.getAllByRole('button', { name: /^Save as a working document$/ })[0]);
    await waitFor(() => expect(posted.some(p => isStatisticalSave(p.path, p.body))).toBe(true));
    expect(posted.find(p => isStatisticalSave(p.path, p.body))!.body).toMatchObject({ module: 'M5', programId: PROGRAM.id,
      basis: { kind: 'study_design', studyId: 'STUDY-1', designInputsSha256: 'abcdef0123456789'.repeat(4) } });
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

  it('renders the statistical review as a risk table with the verdict and each row\'s finding', async () => {
    route();
    mount();
    await waitFor(() => expect(designRow('BX-204 pivotal in T2D')).toBeTruthy());
    fireEvent.click(designRow('BX-204 pivotal in T2D'));
    await waitFor(() => expect(alphaField().value).toBe('0.04'));
    expect(screen.getByText(/high statistical risk/)).toBeTruthy();
    expect(screen.getByText(/Regulatory challenge likelihood/).textContent).toMatch(/moderate.*Missing data/);
    const table = screen.getByRole('table', { name: /Statistical risk summary/ });
    expect(within(table).getByText(/LOCF as the primary/)).toBeTruthy();
    expect(within(table).getByText(/Make MMRM or multiple imputation/)).toBeTruthy();
    // A clean row is still a row — it says which standard it meets.
    expect(within(table).getByText(/complete ICH E9\(R1\) estimand/)).toBeTruthy();
  });

  /* D5 §B.4 step 6. `PWR-003 MIS-002` was printed in monospace under each
     element's name — a second line of gate codes down the first column of
     every row, which is the "ids and enums on screen" pattern §WA.4.2 rule 10
     retires, and which a reader cannot look up anywhere in this product.
     Moving them must not LOSE them: a finding is traced back to the gate that
     raised it, so the codes are the row's own hover text. Both halves are
     asserted here, because only the second one is the easy mistake. */
  it('traces each finding to its gates in the row\'s title, and prints no gate code on screen', async () => {
    route();
    mount();
    await waitFor(() => expect(designRow('BX-204 pivotal in T2D')).toBeTruthy());
    fireEvent.click(designRow('BX-204 pivotal in T2D'));
    await waitFor(() => expect(alphaField().value).toBe('0.04'));
    const table = screen.getByRole('table', { name: /Statistical risk summary/ });

    const cell = within(table).getByText('Missing data').closest('td')!;
    const title = cell.getAttribute('title') ?? '';
    expect(title, 'the gates the finding rests on are not reachable at all').toMatch(/MIS-002/);
    expect(title).toMatch(/raised by gate MIS-002/);

    expect(table.textContent, 'a gate code is still printed as visible text').not.toMatch(/[A-Z]{3}-\d{3}/);
  });
});

describe('Biostatistics — the loaded design, where and when it shows', () => {
  /* 2026-10-31 audit: the assessment and the review — wide tables of
     assumptions, dimensions, findings and actions — rendered inside the 300px
     left column, a word per line. They get the full width, under the document. */
  it('renders the assessment and the review full width, not in the 300px design column', async () => {
    route();
    mount();
    await waitFor(() => expect(alphaField().value).toBe('0.04'));
    const review = await screen.findByRole('table', { name: /Statistical risk summary/ });
    expect(review.closest('.bs-side'), 'the review is inside the narrow left column').toBeNull();
    expect(review.closest('.bs-assess')).not.toBeNull();
    const assessment = screen.getByText('Design assessment');
    expect(assessment.closest('.bs-side')).toBeNull();
    // Below the document, not beside it.
    const doc = document.querySelector('.bs-doc-layout')!;
    expect(doc.compareDocumentPosition(assessment) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('with a project open, never sizes a worked example before the project\'s design arrives', async () => {
    route({ designDelayMs: 400 });
    mount();
    await waitFor(() => expect(alphaField().value).toBe('0.04'), { timeout: 4000 });
    await waitFor(() => expect(apiRequest.mock.calls.some((c) => c[1] === '/api/ana-biostats/compute')).toBe(true));
    const computed = apiRequest.mock.calls.filter((c) => c[1] === '/api/ana-biostats/compute').map((c) => (c[2] as { alpha?: number }).alpha);
    expect(computed.every((a) => a === 0.04), `the engine was asked to size alphas ${computed.join(', ')}`).toBe(true);
  });
});

/**
 * The ask row carries a name a screen reader can reach.
 *
 * `BsStarters` was written in D5-3a with `aria-label="Ask AnA"` on a
 * role-less `<div>`, where assistive technology ignores it: the row of
 * starters has no accessible name at all. The coordinator found the identical
 * shape in CMC on 2026-11-02, having been sent it from Insights; it was in
 * this file's surface too, and a probe of the running app is what found it
 * here. `getByRole` is the assertion because it resolves the name the way a
 * reader's software does — with no role, the query cannot find the element
 * even though the attribute is sitting on it.
 */
describe('Biostatistics — the ask row is named for a screen reader', () => {
  it('exposes the starters as a group with an accessible name', async () => {
    route();
    mount();
    const row = await screen.findByRole('group', { name: 'Ask AnA' });
    expect(row.classList.contains('sp-starters')).toBe(true);
    expect(row.querySelectorAll('button.sp-starter').length).toBeGreaterThan(0);
  });
});

describe('Biostatistics — study design bridge, cross-links', () => {
  it('cross-links open the protocol workspace, the task board and the submission center', async () => {
    route();
    const onNav = mount();
    await waitFor(() => expect(designRow('BX-204 pivotal in T2D')).toBeTruthy());
    fireEvent.click(designRow('BX-204 pivotal in T2D'));
    await waitFor(() => expect(alphaField().value).toBe('0.04'));
    /* The three doors are named for where they go, not for the kind of thing
       that is there: "Open the protocol", not "Open protocol workspace"
       (D5 §B.4 step 6 — the product has no workspaces, RULE 4). What they do
       is unchanged, which is what this case is for. */
    fireEvent.click(screen.getByRole('button', { name: /Open the protocol/ }));
    fireEvent.click(screen.getByRole('button', { name: /Open Tasks/ }));
    fireEvent.click(screen.getByRole('button', { name: /Open Submission Center/ }));
    expect(onNav.mock.calls.map((c) => c[0])).toEqual(['protocol-dev', 'tasks', 'submission-center']);
  });
});
