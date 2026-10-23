// @vitest-environment jsdom
/**
 * When the server says nothing, the answer is "not assessed" — never the
 * favourable finding.
 *
 * Five places filled a missing regulatory value with the answer a sponsor
 * would most like to hear:
 *   - useK510SeMatrix: an SE attribute with no verdict was 'equivalent' — a
 *     substantial-equivalence finding nobody made;
 *   - adaptClassification: an IVD with no Annex VIII class was 'B' — which
 *     also sets the conformity route the manufacturer then follows;
 *   - useMdxPrograms: a SUBMITTED program was 'complete', stage 7 "Cleared",
 *     and counted as cleared on the Overview while still under review;
 *   - useWorkbenchValidation: every program showed 0 errors and the summary
 *     said "All programs filing-ready", because the blocker→program join
 *     could never match (c2c_blockers references projects, not programs);
 *   - PostmarketSurface: "MDRs due ≤72h", "CAPAs in flight" and "PSURs · N
 *     signed" were counted from a document list with no feed — always 0.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, render, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useK510SeMatrix } from '../hooks/useK510';
import { adaptClassification } from '../hooks/useIvd';
import { useMdxPrograms } from '../hooks/useMdxPrograms';
import { useWorkbenchValidation } from '../hooks/useWorkbench';
import { PostmarketSurface } from '../surfaces/PostmarketSurface';
import type { Program } from '../data/programs';

vi.mock('@/utils/authToken', () => ({ getAuthToken: () => 'test-token', getOrgId: () => '7' }));

function serve(route: (url: string) => unknown | null) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const body = route(String(input));
    return body === null
      ? new Response('unavailable', { status: 503 })
      : new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
}
afterEach(() => { vi.unstubAllGlobals(); cleanup(); });

describe('no favourable default for a missing regulatory value', () => {
  it('an SE attribute with no verdict is unassessed, not equivalent', async () => {
    serve(() => ({ rows: [{ attribute: 'Wear duration', subject: '14 d', predicate: '10 d' }, { attribute: 'Technology', subject: 'x', predicate: 'x', verdict: 'same' }] }));
    const { result } = renderHook(() => useK510SeMatrix('p1'));
    await waitFor(() => expect(result.current.rows).not.toBeNull());
    expect(result.current.rows!.map((r) => r.verdict)).toEqual(['unassessed', 'same']);
  });

  it('an IVD with no Annex VIII class is not classified, not class B', () => {
    expect(adaptClassification({ device_name: 'Assay', ivdr_class: null } as never)!.classification).toBeNull();
    expect(adaptClassification({ device_name: 'Assay', ivdr_class: 'x' } as never)!.classification).toBeNull();
    expect(adaptClassification({ device_name: 'Assay', ivdr_class: 'c' } as never)!.classification).toBe('C');
  });

  it('a submitted program is in flight, not cleared', async () => {
    const row = (status: string) => ({
      id: status, name: status, code: 'X', description: null, programType: 'DEVICE_510K', productType: 'device',
      deviceClass: 'II', regulatoryPath: '510k', primaryAgency: 'FDA', productName: 'X', status, phase: 'submission',
      priority: null, targetSubmissionDate: null, progressPercent: 90, completedMilestones: null, totalMilestones: null,
      leadUserId: null, leadUserName: null, teamMembers: null, metadata: null, createdAt: '2026-01-01', updatedAt: '2026-01-01',
    });
    serve(() => ({ data: [row('submitted'), row('approved')] }));
    const { result } = renderHook(() => useMdxPrograms());
    await waitFor(() => expect(result.current.programs?.length).toBe(2));
    const byId = Object.fromEntries(result.current.programs!.map((p) => [p.id, p]));
    expect(byId.submitted.status).not.toBe('complete');
    expect(byId.submitted.stageIdx).toBe(6);
    expect(byId.approved.status).toBe('complete');
  });

  it('states no per-program blocker count, and does not call the portfolio filing-ready', async () => {
    serve(() => ({ data: [{ blockerId: 'B1', severity: 'critical', description: 'Missing biocompat report', blockerType: 'evidence' }] }));
    const programs = [{ id: 'p1', code: 'Class II · 510(k)', title: 'Device', pathway: 'k510', status: 'active', readiness: 40 }] as never;
    const { result } = renderHook(() => useWorkbenchValidation(programs));
    await waitFor(() => expect(result.current.summary).not.toBeNull());
    expect(result.current.programs![0].errs).toBeNull();
    const text = JSON.stringify(result.current.summary);
    expect(text).not.toContain('All programs filing-ready');
    expect(result.current.summary!.find((m) => m.label === 'Open errors')!.metric).toBe('1');
  });
});

describe('PostmarketSurface — statutory-clock cards come from the reads that hold them', () => {
  function mount(program?: Program) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}><PostmarketSurface program={program} onAskAna={() => {}} /></QueryClientProvider>);
  }

  it('explains the mixed scope and keeps reporting-clock requests narrowed to the project', async () => {
    const seen: string[] = [];
    serve(url => {
      seen.push(url);
      return url.includes('/api/capa-mdr/triage') ? { items: [], count: 0 }
        : { data: { metrics: [], signals: [], capas: [], pmsPlan: [], trends: [] } };
    });
    const project = { id: 'project-a', code: 'MDX-42', title: 'Device project' } as Program;
    const { getByTestId, getByText } = mount(project);
    expect(getByTestId('postmarket-scope').textContent).toContain('Surveillance signals, PMS plan entries and the CAPA board cover all projects in this organization.');
    expect(getByTestId('postmarket-scope').textContent).toContain('Reporting clocks and the MDR/CAPA deadline metrics are limited to MDX-42.');
    expect(getByText(/MDX-42 only/)).toBeTruthy();
    await waitFor(() => expect(seen.some(url => url.includes('/api/capa-mdr/triage?program_id=project-a'))).toBe(true));
    expect(seen).toContain('/api/mdx/postmarket');
    expect(seen).not.toContain('/api/capa-mdr/triage');
  });

  it('shows no count while the triage read has failed', async () => {
    serve((u) => (u.includes('/api/capa-mdr/triage') ? null : { data: { metrics: [], signals: [], capas: [], pmsPlan: [], trends: [] } }));
    const { getByTestId } = mount();
    await waitFor(() => expect(getByTestId('pm-signals').textContent).toBe('0'));
    expect(getByTestId('pm-mdr-due').textContent).toBe('—');
    expect(getByTestId('pm-capas').textContent).toBe('—');
  });

  it('counts MDRs due within 72h and open CAPAs from the server-computed queue', async () => {
    const item = (kind: string, daysToDue: number | null, overdue = false) => ({
      kind, id: `${kind}${daysToDue}`, programId: 'p', code: 'C', title: 't', state: 'open', riskOrSeverity: null,
      receivedOrOpenedAt: '2026-09-01', dueAt: null, daysToDue, overdue,
    });
    serve((u) =>
      u.includes('/api/capa-mdr/triage')
        ? { items: [item('mdr', 2), item('mdr', 20), item('mdr', -1, true), item('capa', 5), item('capa', -3, true)], count: 5 }
        : { data: { metrics: [], signals: [], capas: [], pmsPlan: [], trends: [] } },
    );
    const { getByTestId } = mount();
    await waitFor(() => expect(getByTestId('pm-mdr-due').textContent).toBe('2'));
    expect(getByTestId('pm-capas').textContent).toBe('2');
  });
});
