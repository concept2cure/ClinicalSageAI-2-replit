// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (original) => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
import { InsightsCanvas } from '../surfaces/Insights';
import { CatalogPanel } from '../surfaces/InsightsCatalogPanel';
import { SchedulesPanel } from '../surfaces/InsightsSchedulesPanel';
import { publishShellProject } from '../shellProject';
import type { LibraryReportType } from '../surfaces/insightsLibraryShared';
import type { OwnedSurfaceViewProps } from '../surfaceViews';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const TYPE = { typeId: 'readiness.executive_digest', label: 'Executive Readiness Digest', family: 'readiness', allowedScopes: ['project'], computedScopes: ['project'], allowedClientSegments: [], runnable: true, runScopeType: 'project', runScopeId: '11' };
const ORG_TYPE = { ...TYPE, typeId: 'inspection.readiness_pack', label: 'Inspection register', family: 'inspection_readiness', allowedScopes: ['account'], computedScopes: ['account'], computedScope: 'organization', runScopeType: 'account', runScopeId: '1' };
const lead = (name: string, id: number) => ({ scope: 'project', scopeId: String(id), projectId: id, code: name, label: name, readiness: 50, criticalBlockerCount: 1, filing: null });
const overview = (program: ReturnType<typeof lead> | null, types = [TYPE]) => ({ data: { organizationId: 1, tier: 'enterprise', segments: ['pharma'], reportTypes: types, leadProgram: program, openProgram: program ? { programId: program.projectId === 11 ? A : B, state: 'lead' } : null, portfolio: { programs: null } } });
const doc = (name: string, scopeType = 'project', scopeId = '11') => ({ data: { reportTypeId: TYPE.typeId, scopeType, scopeId, scopeLabel: name, generatedAt: '2026-10-13T08:00:00Z', status: 'partial', truthfulness: { reasons: [] }, sections: [{ id: 'test', title: `${name} saved evidence`, blocks: [{ kind: 'paragraph', text: `${name} retained snapshot` }] }] } });
const props = { surface: { id: 'insights', label: 'Reporting' } as OwnedSurfaceViewProps['surface'], segment: 'pharma', onNav: vi.fn() };
beforeEach(() => { apiRequest.mockReset(); props.onNav.mockReset(); window.history.replaceState({}, '', '/'); sessionStorage.clear(); delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT; });
afterEach(() => { cleanup(); delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT; });

describe('reporting context integrity', () => {
  it('allows organization reports and saved history before a product program exists', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (url.startsWith('/api/insights-canvas/overview')) return ok(overview(null, [ORG_TYPE]));
      if (method === 'POST' && url === '/api/report-os/runs') return ok({ data: { run: { id: 41 } } });
      if (url === '/api/report-os/runs/41/rendered') return ok(doc('Organization', 'account', '1'));
      return ok({ data: [] });
    });
    render(<InsightsCanvas {...props} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Report catalog' }));
    expect(await screen.findByText('Organization-wide records')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Run$/ }));
    await screen.findByText('Organization saved evidence');
    expect(apiRequest.mock.calls.find(([method, url]) => method === 'POST' && url === '/api/report-os/runs')?.[2]).toMatchObject({ scopeType: 'account', scopeId: '1' });
    fireEvent.click(screen.getByRole('tab', { name: 'Run history' }));
    await waitFor(() => expect(apiRequest.mock.calls.some(([method, url]) => method === 'GET' && String(url).startsWith('/api/report-os/runs?'))).toBe(true));
  });

  it('discards a completed request from a program that was replaced while it ran', async () => {
    let finish: ((response: Response) => void) | undefined;
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (url.startsWith('/api/insights-canvas/overview')) return ok(overview(url.includes(B) ? lead('B-202', 22) : lead('A-101', 11)));
      if (method === 'POST' && url === '/api/report-os/runs') return new Promise<Response>((resolve) => { finish = resolve; });
      if (url === '/api/report-os/runs/41/rendered') return ok(doc('A-101'));
      return ok({ data: [] });
    });
    publishShellProject({ id: A, code: 'A-101' });
    render(<InsightsCanvas {...props} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Report catalog' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Run$/ }));
    await waitFor(() => expect(finish).toBeDefined());
    act(() => publishShellProject({ id: B, code: 'B-202' }));
    await waitFor(() => expect(document.body.textContent).toContain('B-202'));
    await act(async () => { finish?.(ok({ data: { run: { id: 41 } } })); });
    await waitFor(() => expect(screen.queryByText('A-101 saved evidence')).toBeNull());
    expect(document.querySelector('.ro-report')).toBeNull();
  });
  it('does not draw a forecast trajectory from a single anchor value', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (url.startsWith('/api/insights-canvas/overview')) return ok(overview(lead('A-101', 11)));
      if (method === 'POST') return ok({ data: { run: { id: 41 } } });
      const rendered = doc('A-101');
      return ok({ data: { ...rendered.data, sections: [{ id: 'forecast', title: 'Forecast', blocks: [{ kind: 'chart', chartType: 'forecast_band', spec: { anchor: 80 } }] }] } });
    });
    render(<InsightsCanvas {...props} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Report catalog' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Run$/ }));
    expect(await screen.findByText(/no measured forecast series is recorded/)).toBeTruthy();
    expect(document.querySelector('.ro-svgwrap polyline')).toBeNull();
  });

  it('opens a notification deep link from the stored run scope even without a selected program', async () => {
    window.history.replaceState({}, '', '/concept2cure/insights?reportRunId=41');
    apiRequest.mockImplementation(async (_method: string, url: string) => {
      if (url.startsWith('/api/insights-canvas/overview')) return ok(overview(null, []));
      if (url === '/api/report-os/runs/41') return ok({ data: { id: 41, runUuid: 'uuid', reportTypeId: TYPE.typeId, reportTypeLabel: TYPE.label, scopeType: 'project', scopeId: '11', status: 'partial', confidence: null, createdAt: '2026-10-13T08:00:00Z' } });
      if (url === '/api/report-os/runs/41/rendered') return ok(doc('Stored program'));
      return ok({ data: [] });
    });
    render(<InsightsCanvas {...props} />);
    expect(await screen.findByText('Stored program saved evidence')).toBeTruthy();
    expect(apiRequest.mock.calls.some(([method]) => method === 'POST')).toBe(false);
    expect(screen.getByTestId('ro-scope').textContent).toBe('Stored program');
  });

  it('shows portfolio risk and blockers and opens the matching program', async () => {
    apiRequest.mockImplementation(async (_method: string, url: string) => url.startsWith('/api/insights-canvas/overview') ? ok({ data: { ...overview(lead('A-101', 11)).data, portfolio: { entitled: true, summary: { truncated: false }, programs: [{ projectId: 22, programId: B, code: 'B-202', label: 'B', indication: null, readiness: 100, status: 'missing', riskLevel: 'high', criticalBlockerCount: 2, topBlockers: ['Missing protocol'] }] } } }) : ok({ data: [] }));
    render(<InsightsCanvas {...props} />);
    const input = await screen.findByRole('textbox', { name: 'Find a report' });
    fireEvent.change(input, { target: { value: 'Show the portfolio' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find' }));
    const row = await screen.findByRole('button', { name: /Open B-202/ });
    expect(row.textContent).toMatch(/high|High/);
    expect(row.textContent).toMatch(/2 critical blockers/);
    fireEvent.click(row);
    expect(props.onNav).toHaveBeenCalledWith('project-home');
    expect(String((window.C2C_PROJECT as unknown as { id: string }).id)).toBe(B);
  });
});

describe('reactive saved report links', () => {
  it('responds to a report notification while the reporting screen is already open', async () => {
    apiRequest.mockImplementation(async (_method: string, url: string) => {
      if (url.startsWith('/api/insights-canvas/overview')) return ok(overview(null, []));
      const id = Number(url.match(/runs\/(\d+)/)?.[1]);
      if (url.endsWith('/rendered')) return ok(doc(`Stored run ${id}`));
      if (id) return ok({ data: { id, runUuid: 'uuid', reportTypeId: TYPE.typeId, reportTypeLabel: TYPE.label, scopeType: 'project', scopeId: '11', status: 'partial', confidence: null, createdAt: '2026-10-13T08:00:00Z' } });
      return ok({ data: [] });
    });
    render(<InsightsCanvas {...props} />);
    await screen.findByRole('tab', { name: 'Run history' });
    act(() => window.history.pushState({}, '', '/concept2cure/insights?reportRunId=41'));
    await screen.findByText('Stored run 41 saved evidence');
    act(() => window.history.pushState({}, '', '/concept2cure/insights?reportRunId=42'));
    await screen.findByText('Stored run 42 saved evidence');
    expect(screen.queryByText('Stored run 41 saved evidence')).toBeNull();
  });
});

describe('catalog applicability and local cadence', () => {
  it('runs a lineage report for the chosen owned document instead of the program id', async () => {
    const onRun = vi.fn();
    apiRequest.mockImplementation(async () => ok({ success: true, data: [{ id: 'artifact-owned', title: 'Approved protocol', status: 'approved' }] }));
    render(<CatalogPanel types={[{ typeId: 'provenance.evidence_trace_report', label: 'Document evidence trace', family: 'evidence_provenance', scopes: ['document'], computedScopes: ['document'], segments: [], runnable: false, availabilityState: 'scope-required' }]} projectId={11} programLabel="A-101" canRun onRun={onRun} />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a document' }));
    fireEvent.change(await screen.findByLabelText('Document'), { target: { value: 'artifact-owned' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run document trace' }));
    expect(onRun).toHaveBeenCalledWith(expect.objectContaining({ runScopeType: 'document', runScopeId: 'artifact-owned' }));
    expect(apiRequest).toHaveBeenCalledWith('GET', '/api/concept2cure/projects/11/artifacts');
  });
  it('keeps a disabled document trace unavailable even when its engine supports document scope', () => {
    render(<CatalogPanel types={[{ typeId: 'provenance.evidence_trace_report', label: 'Document evidence trace', family: 'evidence_provenance', scopes: ['document'], computedScopes: ['document'], segments: [], runnable: false, availabilityState: 'disabled', availabilityReason: 'This report is disabled in the organization registry.' }]} projectId={11} programLabel="A-101" canRun onRun={vi.fn()} />);
    expect(screen.getByText(/disabled in the organization registry/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Choose a document|Run document trace/ })).toBeNull();
    expect(apiRequest).not.toHaveBeenCalled();
  });
  it('filters regional reports by reporting role and discloses organization data scope', () => {
    const types = [
      { typeId: 'shared', label: 'Organization register', family: 'readiness', scopes: ['account'], computedScopes: ['account'], segments: [], runnable: true, computedScope: 'organization', runScopeType: 'account', runScopeId: '1', allowedPersonas: ['quality'] },
      { typeId: 'ema', label: 'EU assessment', family: 'ema_maa', scopes: ['project'], computedScopes: ['project'], segments: [], runnable: true, region: 'EU', allowedPersonas: ['regulatory'] },
    ] as LibraryReportType[];
    render(<CatalogPanel types={types} programLabel="A-101" canRun onRun={vi.fn()} />);
    expect(screen.getByText('Organization-wide records')).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'Reporting role' }), { target: { value: 'quality' } });
    expect(screen.queryByText('EU assessment')).toBeNull();
    expect(screen.getByText('Organization register')).toBeTruthy();
  });

  it('creates a platform schedule using the chosen IANA timezone', async () => {
    apiRequest.mockImplementation(async () => ok({ data: [] }));
    render(<SchedulesPanel types={[{ typeId: TYPE.typeId, label: TYPE.label, family: 'readiness', scopes: ['project'], computedScopes: ['project'], segments: [], runnable: true }]} scope={{ scopeType: 'project', scopeId: '11' }} canWrite onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'New schedule' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Report' }), { target: { value: TYPE.typeId } });
    fireEvent.change(screen.getByLabelText('Timezone'), { target: { value: 'Asia/Tokyo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    await waitFor(() => expect(apiRequest.mock.calls.some(([method]) => method === 'POST')).toBe(true));
    expect(apiRequest.mock.calls.find(([method]) => method === 'POST')?.[2]).toMatchObject({ channel: 'platform', format: 'in_app', schedule: { timeZone: 'Asia/Tokyo', hour: 8 } });
  });
});
