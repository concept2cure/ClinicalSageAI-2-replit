// @vitest-environment jsdom
/**
 * The Reporting canvas runs what it names, for the program it names, and says
 * so when it cannot (QA 2026-10-08, journey j8):
 *
 *   1. "Every typed report returns the same readiness digest": a type no engine
 *      computes is shown as not computed, and asking for it runs nothing.
 *   2. "Free-text report request is routed to the Controlled Substances DEA
 *      ledger": a request about controlled documents is sent to Audit &
 *      compliance reports, and nothing is run.
 *   3. "Reporting scope is fixed to project 1 with no program picker": a run
 *      names the open program; with none open, the canvas asks which program.
 *   5. "510(k) equivalence matrix runs for this biopharma organisation": the
 *      canvas offers the catalog the server answers for the program's product
 *      type, not a copy filtered by the shell's segment preference.
 *   6. "the digest names the scope by internal id": the report names it.
 *
 * Only the transport (`apiRequest`) and the signed-in user are replaced.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portal/authService')>()),
  useAuthUser: () => ({ id: 3, role: 'manager', permissions: ['governed:write'] }),
}));

import { InsightsCanvas } from '../surfaces/Insights';
import type { OwnedSurfaceViewProps } from '../surfaceViews';
import { catalogForSegment } from './_insights-catalog-fixture';

const PROGRAM = 'd979e567-4622-46f1-8cb7-8bf434227f25';
const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj }) as unknown as Response;
const LEAD = {
  projectId: 11, code: 'H', label: 'HLV-333 — Investigational New Drug Application', filing: null, indication: null,
  readiness: null, confidence: null, status: 'missing', riskLevel: 'low',
  scope: 'project', scopeId: '11', agency: null, pdufa: null, criticalBlockerCount: 0,
};
/* What the server answers for HLV-333, a biologic program: the biotech catalog. */
const overview = (over: Record<string, unknown> = {}) => ({
  data: {
    organizationId: 1, tier: 'enterprise', segments: ['biotech'], reportTypes: catalogForSegment('biotech'),
    leadProgram: LEAD, openProgram: { programId: PROGRAM, state: 'lead' }, programs: [],
    portfolio: { entitled: true, requiredTier: 'enterprise', summary: null, programs: [] },
    ...over,
  },
});
const RENDERED = {
  reportTypeId: 'readiness.executive_digest', scopeType: 'project', scopeId: '11', scopeLabel: 'HLV-333 — Investigational New Drug Application',
  generatedAt: '2026-10-08T06:00:00.000Z', status: 'partial',
  truthfulness: { allowedStatus: 'partial', reasons: [] },
  sections: [{ id: 'executive-summary', title: 'Executive summary', blocks: [{ kind: 'summary', text: 'Submission readiness not computed: the project records no registry context (registryId or submissionType).' }] }],
};

let answer: unknown;
const onNav = vi.fn();
beforeEach(() => {
  answer = overview();
  onNav.mockReset();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROGRAM, title: 'HLV-333', code: 'H' };
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (url.startsWith('/api/insights-canvas/overview')) return ok(answer);
    if (method === 'POST' && url === '/api/report-os/runs') return ok({ data: { run: { id: 9 } } });
    if (url === '/api/report-os/runs/9/rendered') return ok({ data: RENDERED });
    return ok({});
  });
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
  sessionStorage.clear();
});

/* The shell passes its segment preference; for a biologic program it reads 'biopharma'. */
const renderCanvas = () =>
  render(<InsightsCanvas surface={{ id: 'insights', label: 'Insights' } as OwnedSurfaceViewProps['surface']} segment="biopharma" onNav={onNav} />);
const ready = () => waitFor(() => expect(document.querySelector('.rc-ana-head')).not.toBeNull());
function ask(text: string) {
  const composer = document.querySelector('.rc-input textarea') as HTMLTextAreaElement;
  fireEvent.change(composer, { target: { value: text } });
  fireEvent.keyDown(composer, { key: 'Enter' });
}
const runBodies = () =>
  apiRequest.mock.calls.filter(([m, u]) => m === 'POST' && u === '/api/report-os/runs').map((c) => c[2] as Record<string, unknown>);
const overviewUrls = () => apiRequest.mock.calls.map((c) => String(c[1])).filter((u) => u.startsWith('/api/insights-canvas/overview'));

describe('1 — a type no engine computes', () => {
  it('is a pack tile that says it is not computed, with no run', async () => {
    renderCanvas();
    await ready();
    fireEvent.click(document.querySelector('.rc-preset-btn') as HTMLElement);
    await waitFor(() => expect(document.querySelector('.ro-pack-grid')).not.toBeNull());
    const tiles = screen.getAllByTestId('ro-pack-not-computed').map((t) => t.textContent ?? '');
    expect(tiles.some((t) => /Evidence & Provenance Trace Report/.test(t) && /Not computed in this release/.test(t))).toBe(true);
    const runnable = [...document.querySelectorAll('button.ro-pack-card')].map((b) => b.textContent ?? '');
    expect(runnable.some((t) => /Evidence & Provenance/.test(t))).toBe(false);
  });

  it('is said to be not computed when asked for, and nothing is run under its name', async () => {
    renderCanvas();
    await ready();
    ask('Run the audit assurance pack');
    expect(await screen.findByText(/No engine computes the Compliance & Audit Assurance Pack in this release/)).toBeTruthy();
    expect(runBodies()).toEqual([]);
  });
});

describe('2 — a request about controlled documents', () => {
  it('is sent to Audit & compliance reports and runs nothing', async () => {
    renderCanvas();
    await ready();
    ask('Show me the controlled documents overdue for periodic review');
    expect(await screen.findByText(/reported on Audit & compliance reports, in the Controlled document register/)).toBeTruthy();
    expect(runBodies()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Open Audit & compliance reports' }));
    expect(onNav).toHaveBeenCalledWith('compliance-reports');
  });

  it('still runs the controlled substances ledger when that is what is asked for', async () => {
    renderCanvas();
    await ready();
    ask('Run the controlled substances DEA ledger');
    await waitFor(() => expect(runBodies()).toHaveLength(1));
    expect(runBodies()[0].reportTypeId).toBe('controlled_substances.inventory_ledger');
  });
});

describe('3 — the program the report runs over', () => {
  it('names the open program on the run, not a project id', async () => {
    renderCanvas();
    await ready();
    ask('Generate the Executive Readiness Digest');
    await waitFor(() => expect(runBodies()).toHaveLength(1));
    expect(runBodies()[0]).toMatchObject({ scopeType: 'project', programId: PROGRAM, reportTypeId: 'readiness.executive_digest' });
    expect(runBodies()[0]).not.toHaveProperty('scopeId');
  });

  it('with no program open, asks which program, and opening one leads the canvas with it', async () => {
    delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
    answer = overview({
      leadProgram: null, openProgram: null,
      programs: [{ programId: PROGRAM, code: 'H', label: 'HLV-333 — Investigational New Drug Application' }],
    });
    renderCanvas();
    const picker = await screen.findByTestId('rc-program-picker');
    expect(picker.textContent).toMatch(/Which program is the report for\?/);
    expect(screen.queryByText(/C2C-001/)).toBeNull();
    answer = overview();
    fireEvent.click(screen.getByRole('button', { name: /HLV-333/ }));
    await ready();
    expect(overviewUrls()).toContain(`/api/insights-canvas/overview?programId=${PROGRAM}`);
  });
});

describe('5 — the catalog follows the program’s product type', () => {
  it('offers a biologic program no 510(k) prompt, and runs no 510(k) report when asked', async () => {
    renderCanvas();
    await ready();
    expect(document.querySelector('.rc-opener')?.textContent ?? '').not.toMatch(/510\(k\)/);
    ask('Show the 510(k) equivalence matrix');
    await screen.findByText(/any of these can be run/);
    expect(runBodies()).toEqual([]);
    // Not matched to another "matrix" on that word alone.
    expect(screen.queryByText(/Cross-Region Submission Comparison Matrix/)).toBeNull();
    expect(screen.queryByRole('button', { name: /510\(k\)/ })).toBeNull();
  });
});

describe('6 — the report names its scope', () => {
  it('shows the program’s name, not "project — 11"', async () => {
    renderCanvas();
    await ready();
    ask('Generate the Executive Readiness Digest');
    const scope = await screen.findByTestId('ro-scope');
    expect(scope.textContent).toBe('HLV-333 — Investigational New Drug Application');
    expect(document.querySelector('.ro-rep-meta')?.textContent ?? '').not.toMatch(/project — 11/);
  });
});
