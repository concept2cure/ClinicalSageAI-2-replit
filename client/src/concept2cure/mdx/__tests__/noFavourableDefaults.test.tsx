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
 *     could never match (c2c_blockers references projects, not programs).
 *     Its screen retired with the organization-wide blocker list (D2, fold F5
 *     item 2, 2026-10-29; decision P-61 item 2), and its case with it: a
 *     filing's blockers are its own readiness's (EstarFilingPanel), whose
 *     verdict the engine computes (estar-filing-readiness.test.ts);
 *   - PostmarketSurface: "MDRs due ≤72h", "CAPAs in flight" and "PSURs · N
 *     signed" were counted from a document list with no feed — always 0.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, render, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useK510SeMatrix } from '../hooks/useK510';
import { adaptClassification } from '../hooks/useIvd';
import { useMdxPrograms } from '../hooks/useMdxPrograms';
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
    /* `code` as useMdxPrograms.deriveCode builds it: a class and pathway many
       projects share. The scope names the project by its title. */
    const project = { id: 'project-a', code: 'Class II · 510(k)', title: 'Device project' } as Program;
    const { getByTestId, getByText } = mount(project);
    /* Slice 0: PMS plan entries have no store (`pmsPlan: []`), so no scope is stated for them. */
    expect(getByTestId('postmarket-scope').textContent).toContain("Surveillance signals and the CAPA board are read for every project in this organization and are not shown until this screen reads this project's records.");
    expect(getByTestId('postmarket-scope').textContent).toContain('Reporting clocks and the MDR/CAPA deadline metrics are limited to Device project.');
    expect(getByTestId('postmarket-scope').textContent).not.toContain('Class II · 510(k)');
    expect(getByText(/Device project only/)).toBeTruthy();
    await waitFor(() => expect(seen.some(url => url.includes('/api/capa-mdr/triage?program_id=project-a'))).toBe(true));
    expect(seen).toContain('/api/mdx/postmarket');
    expect(seen).not.toContain('/api/capa-mdr/triage');
  });

  it('shows no count while the triage read has failed', async () => {
    serve((u) => (u.includes('/api/capa-mdr/triage') ? null : { data: { metrics: [], signals: [], capas: [], pmsPlan: [], trends: [] } }));
    const { getByTestId } = mount();
    /* Slice 0 (IA map, `device-postmarket` row): `pm-signals` no longer counts
       the organisation-wide read, so it reads '—' on first render, while
       loading and here alike. Wait on the triage gate's own error state (the
       only top-level DataGate with the accordion closed), so the two '—'
       below are asserted after the read has failed, not before it settled. */
    await waitFor(() => getByTestId('data-gate-error'));
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
