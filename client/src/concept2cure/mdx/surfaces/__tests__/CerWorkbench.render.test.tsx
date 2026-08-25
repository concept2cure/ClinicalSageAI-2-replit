// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CerSurface } from '../CerSurface';
import type { Program } from '../../data/programs';

/** PathwayPanes reads through react-query; retries off, fresh client per
 *  mount so one test's cache can never mask another's render. */
function renderSurface(program: Program | null, onAskAna: (text: string) => void = () => {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CerSurface program={program} onAskAna={onAskAna} />
    </QueryClientProvider>,
  );
}

/** The workbench's own tablist — scoped so the outer PathwayPanes tab bar
 *  (whose CER Workspace tab is subtitled "Signals · literature") can never
 *  shadow a query. */
function cerTabs() {
  return within(screen.getByRole('tablist', { name: /clinical evaluation workbench/i }));
}

/**
 * Mount tests for the CER workbench.
 *
 * The honest-state contract across all six tabs: an empty tenant renders
 * empty states that say why and what to do next — NEVER the kit fixtures
 * (sample mode is off in these tests, as it is in production). The tab bar
 * is a real tablist (roles, aria-selected, arrow-key navigation), and the
 * previously dead "Draft with AnA" button now routes a concrete prompt
 * through onAskAna.
 */

const PROGRAM: Program = {
  id: 'a2b4c6d8-0000-0000-0000-00000000cer1',
  title: 'IV-415 Companion Diagnostic',
  code: 'IV-415',
  pathway: 'cer',
  stage: 'Clinical Evaluation Report',
  stageIdx: 2,
  readiness: 34,
  status: 'blocked',
  lead: 'Ana Müller',
  owners: ['AM'],
  nextBlocker: null,
  dueLabel: 'EU MDR · notified body Q1',
  dueTone: 'warn',
  lastActivity: '3h ago',
  meta: 'EU MDR Article 61',
};

const okJson = (body: unknown) =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);

/** Empty-tenant backend: every live endpoint answers with a valid, empty payload. */
function mockEmptyTenantFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/document-preview')) {
        return okJson({
          projectId: PROGRAM.id,
          totalSections: 0,
          approvedCount: 0,
          draftingCount: 0,
          todoCount: 0,
          completionPercentage: 0,
          sections: [],
        });
      }
      if (url.includes('/device/profile')) {
        return okJson({
          profile: {
            id: PROGRAM.id,
            name: PROGRAM.code,
            code: PROGRAM.code,
            productName: null,
            productType: 'device',
            deviceClass: null,
            regulatoryPath: null,
            productCode: null,
            intendedUse: null,
            indication: null,
            predicateDevices: null,
            equivalentDevices: [],
          },
        });
      }
      if (url.includes('/literature')) {
        return okJson({ data: [], meta: { total: 0 } });
      }
      if (url.includes('/api/gspr/catalog')) {
        return okJson({ regulation: 'MDR', requirements: [], count: 0 });
      }
      if (url.includes('/mappings')) {
        return okJson({ programId: PROGRAM.id, mappings: [], count: 0 });
      }
      if (url.includes('/coverage')) {
        return okJson({
          programId: PROGRAM.id,
          regulation: 'MDR',
          totalApplicable: 0,
          mappedApplies: 0,
          mappedNotApplicable: 0,
          mappedPartial: 0,
          mappedTbd: 0,
          unmapped: 0,
          conformantCount: 0,
          nonConformantCount: 0,
          needsEvidenceCount: 0,
          findings: [],
          coveragePercent: 100,
          passesGate: true,
        });
      }
      if (url.includes('/device/cer/structure')) {
        return okJson({ stages: [], sections: [] });
      }
      if (url.includes('/documentation-status')) {
        return okJson({
          programId: PROGRAM.id,
          deviceClass: null,
          regulation: 'MDR',
          documents: [],
          requiredTotal: 0,
          requiredPresent: 0,
          requiredApprovedCount: 0,
          allRequiredApproved: false,
          generatedAt: new Date().toISOString(),
        });
      }
      return okJson({ data: [] });
    }),
  );
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CerSurface — the CER workbench', () => {
  it('renders all six tabs as a real tablist, with the pathway header', async () => {
    mockEmptyTenantFetch();
    renderSurface(PROGRAM);

    expect(screen.getByText(/Clinical Evaluation Report · IV-415 Companion Diagnostic/)).toBeTruthy();
    const tablist = screen.getByRole('tablist', { name: /clinical evaluation workbench/i });
    const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
    expect(tabs.map((t) => t.textContent)).toEqual([
      expect.stringContaining('Signals'),
      expect.stringContaining('Literature'),
      expect.stringContaining('GSPR'),
      expect.stringContaining('Equivalence'),
      expect.stringContaining('PMS / PMCF'),
      expect.stringContaining('Generator'),
    ]);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    await waitFor(() => expect(screen.getByText('No safety signals reported yet')).toBeTruthy());
  });

  it('says so when no program is selected, without inventing one', () => {
    mockEmptyTenantFetch();
    renderSurface(null);
    expect(screen.getByText(/select a CER program to load its evaluation/)).toBeTruthy();
    /* The old surface defaulted to a fictitious "IV-415 Companion Diagnostic". */
    expect(screen.queryByText(/IV-415/)).toBeNull();
  });

  it('never leaks kit fixtures into an empty tenant (sample mode off)', async () => {
    mockEmptyTenantFetch();
    renderSurface(PROGRAM);
    await waitFor(() => expect(screen.getByText('No safety signals reported yet')).toBeTruthy());

    /* Fixture signal ids, GSPR evidence refs, equivalence devices, PMS codes. */
    expect(screen.queryByText(/FR-8812/)).toBeNull();
    expect(screen.queryByText(/PrecisionPath CDx 3\.0/)).toBeNull();
    expect(screen.queryByText(/RMF-IV415/)).toBeNull();
    expect(screen.queryByText(/CMP-3104/)).toBeNull();

    fireEvent.click(cerTabs().getByRole('tab', { name: /GSPR/ }));
    await waitFor(() => expect(screen.getByText('No GSPR requirements to show')).toBeTruthy());
    expect(screen.queryByText(/Devices shall achieve their intended performance/)).toBeNull();

    fireEvent.click(cerTabs().getByRole('tab', { name: /Equivalence/ }));
    await waitFor(() => expect(screen.getByText('No equivalence claim recorded')).toBeTruthy());
    expect(screen.queryByText(/AccuMatch EGFR Panel/)).toBeNull();
  });

  it('the Generator tab shows honest empty sections and routes drafting through AnA', async () => {
    mockEmptyTenantFetch();
    const onAskAna = vi.fn();
    renderSurface(PROGRAM, onAskAna);

    fireEvent.click(cerTabs().getByRole('tab', { name: /Generator/ }));
    await waitFor(() => expect(screen.getByText('No CER sections created yet')).toBeTruthy());
    expect(screen.getByText('Run structure check')).toBeTruthy();
    expect(screen.getByText(/A human has reviewed the assembled content/)).toBeTruthy();

    /* The previously dead button — now a real AnA routing with live context. */
    fireEvent.click(screen.getByText('Draft with AnA'));
    expect(onAskAna).toHaveBeenCalledTimes(1);
    expect(String(onAskAna.mock.calls[0][0])).toContain('IV-415 Companion Diagnostic');
  });

  it('supports arrow-key navigation across the tablist', async () => {
    mockEmptyTenantFetch();
    renderSurface(PROGRAM);

    const signalsTab = cerTabs().getByRole('tab', { name: /Signals/ });
    fireEvent.keyDown(signalsTab, { key: 'ArrowRight' });
    await waitFor(() =>
      expect(cerTabs().getByRole('tab', { name: /Literature/ }).getAttribute('aria-selected')).toBe('true'),
    );
    fireEvent.keyDown(cerTabs().getByRole('tab', { name: /Literature/ }), { key: 'ArrowLeft' });
    await waitFor(() =>
      expect(cerTabs().getByRole('tab', { name: /Signals/ }).getAttribute('aria-selected')).toBe('true'),
    );
    fireEvent.keyDown(cerTabs().getByRole('tab', { name: /Signals/ }), { key: 'End' });
    await waitFor(() =>
      expect(cerTabs().getByRole('tab', { name: /Generator/ }).getAttribute('aria-selected')).toBe('true'),
    );
  });

  it('the literature tab offers per-row recording and refuses a too-short search locally', async () => {
    mockEmptyTenantFetch();
    renderSurface(PROGRAM);

    fireEvent.click(cerTabs().getByRole('tab', { name: /Literature/ }));
    await waitFor(() => expect(screen.getByText('Search PubMed')).toBeTruthy());
    // The panel was read-only when this test was written, and asserted the
    // "results are not recorded to the project corpus" caveat. Literature
    // persistence (GA ledger L4) removed that caveat: hits are recorded to the
    // org corpus per row and the include/exclude decision, its reason and its
    // reviewer are persisted per MEDDEV 2.7/1 Rev 4 appraisal stage. Assert the
    // capability that replaced it, so the test fails if persistence regresses
    // rather than if the wording changes again.
    expect(screen.getByText(/Record hits to the organization corpus per row/)).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText(/EGFR companion diagnostic/), {
      target: { value: 'x' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Search$/ }));
    await waitFor(() =>
      expect(screen.getByText(/Enter a search of at least 2 characters first/)).toBeTruthy(),
    );
  });
});
