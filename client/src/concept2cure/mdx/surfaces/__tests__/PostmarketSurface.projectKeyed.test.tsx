// @vitest-environment jsdom
/**
 * Slice 0 (.design/client-journey/INFORMATION_ARCHITECTURE.md, the
 * `device-postmarket` row): a panel whose read has no project key is not
 * shown on a project's post-market screen.
 *
 * GET /api/mdx/postmarket reads vigilance_events and capa_records for the
 * whole organisation (server/routes/mdx-postmarket.ts:43-91, `WHERE
 * p.organization_id = $1`, no program filter), and its PMS plan has no store
 * at all (`pmsPlan: []`, :111). The screen drew those rows under the open
 * project — the "Open signals" count, the signal triage queue, the CAPA board
 * and the PMS plan — so a device project showed another project's signals and
 * CAPAs as its own.
 *
 * Until that read takes the project, each of those panels says why it is not
 * shown. The reporting clocks are read by project
 * (`/api/capa-mdr/triage?program_id=`) and keep rendering.
 *
 * Vigilance trending reads the same unkeyed payload (`trends: []`, :111). It
 * is gated with the others, so the day the route computes trends, another
 * project's device does not draw a sparkline here.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PostmarketSurface } from '../PostmarketSurface';
import type { Program } from '../../data/programs';

vi.mock('@/utils/authToken', () => ({ getAuthToken: () => 'test-token', getOrgId: () => '7' }));

/* `code` has the shape useMdxPrograms.deriveCode gives it in production — a
   device class and pathway, which many projects share — not an invented
   project code. */
const PROGRAM = { id: 'project-own', code: 'Class II · 510(k)', title: 'Own infusion pump' } as unknown as Program;

/** Rows the organisation-wide read returns: they belong to another project. */
const OTHER_PROJECT = {
  metrics: [],
  signals: [
    {
      id: 'SIG-OTHER-7', device: 'OTHER-9', source: 'complaint', opened: '2026-10-01T00:00:00Z',
      severity: 'critical', kind: 'complaint', count: 3, vs: '—',
      summary: 'Other project lead fracture', owner: 'A', state: 'investigate',
    },
  ],
  capas: [
    {
      id: 'CAPA-OTHER-3', title: 'Other project seal leak', device: 'OTHER-9', stage: 'open',
      owner: 'B', opened: '2026-10-02T00:00:00Z', sla: '', critical: true, linked: [],
    },
  ],
  pmsPlan: [{ device: 'OTHER-9', source: 'Other project registry', signals: 4, state: 'on-track' }],
  trends: [{ device: 'OTHER-TREND-9', weeks: [1, 4, 2], severityMix: { critical: 1, review: 0, watching: 0 } }],
};

/** This project's reporting clock, read by project. */
const OWN_TRIAGE = {
  items: [
    {
      kind: 'complaint', id: 'c1', programId: 'project-own', code: 'CMP-OWN-1', title: 'Own project occlusion alarm',
      state: 'open', riskOrSeverity: null, receivedOrOpenedAt: '2026-10-20', dueAt: null, daysToDue: null, overdue: false,
    },
  ],
  count: 1,
};

const NOT_KEYED = /Shown once this screen reads this project's records/;

const seen: string[] = [];
function serve() {
  seen.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    seen.push(url);
    const body = url.includes('/api/capa-mdr/triage') ? OWN_TRIAGE : { data: OTHER_PROJECT };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
}
afterEach(() => { vi.unstubAllGlobals(); cleanup(); });

function mount(onAskAna: (text: string) => void = () => {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PostmarketSurface program={PROGRAM} onAskAna={onAskAna} />
    </QueryClientProvider>,
  );
}

/** Both reads resolved, and the awareness accordion (CAPA board, PMS plan) open. */
async function loadedAndExpanded(container: HTMLElement) {
  await waitFor(() => expect(container.textContent ?? '').toMatch(/CMP-OWN-1/));
  await waitFor(() => expect(seen).toContain('/api/mdx/postmarket'));
  // Give the organisation-wide read a turn to land before asserting its rows are absent.
  await new Promise((r) => setTimeout(r, 0));
  const toggle = container.querySelector('.eng-awareness-head') as HTMLElement | null;
  expect(toggle, 'the awareness accordion toggle must exist').not.toBeNull();
  fireEvent.click(toggle as HTMLElement);
}

const text = (c: HTMLElement) => c.textContent ?? '';

describe('PostmarketSurface — panels that read across projects are not shown (slice 0)', () => {
  it("shows none of another project's signals, CAPAs or PMS plan rows", async () => {
    serve();
    const { container } = mount();
    await loadedAndExpanded(container);

    expect(text(container)).not.toMatch(/SIG-OTHER-7|Other project lead fracture/);
    expect(text(container)).not.toMatch(/CAPA-OTHER-3|Other project seal leak/);
    expect(text(container)).not.toMatch(/Other project registry/);
    expect(text(container)).not.toMatch(/OTHER-TREND-9/);
  });

  it('states no organisation-wide count as this project’s', async () => {
    serve();
    const { container, getByTestId } = mount();
    await loadedAndExpanded(container);

    expect(getByTestId('pm-signals').textContent).toBe('—');
    expect(getByTestId('pm-pms').textContent).toBe('—');
    // The line saying why: not read for this project, not a read in flight.
    const meta = (id: string) => getByTestId(id).parentElement?.querySelector('.metric-meta')?.textContent ?? '';
    expect(meta('pm-signals')).toMatch(/Not read for this project yet/);
    expect(meta('pm-pms')).toMatch(/Not read for this project yet/);
    expect(text(container)).not.toMatch(/1 critical · awaiting MDR roll-up/);
    expect(text(container)).not.toMatch(/1 active · 5-stage/);
  });

  it('says why each of the signals, CAPA board, trends and PMS plan panels is not shown', async () => {
    serve();
    const { container } = mount();
    await loadedAndExpanded(container);

    for (const id of ['signals', 'capas', 'trends', 'pms']) {
      const note = container.querySelector(`[data-testid="pm-not-keyed-${id}"]`);
      expect(note, `panel ${id} must say why it is not shown`).not.toBeNull();
      expect(note?.textContent ?? '').toMatch(NOT_KEYED);
    }
    expect(text(container.querySelector('[data-testid="postmarket-scope"]') as HTMLElement))
      .toMatch(/not shown until this screen reads this project's records/);
  });

  it('names what has no per-project store: PMS plan execution, not the PMS plan', async () => {
    // A PMS plan is a per-project document (`pms_plan`,
    // server/services/gspr-postmarket/post-market-authoring.ts); what has no
    // store is the plan-execution table (device, sources, signals, state).
    serve();
    const { container, getByTestId } = mount();
    await loadedAndExpanded(container);

    const note = getByTestId('pm-not-keyed-pms').textContent ?? '';
    expect(note).toMatch(/PMS plan execution is not tracked per project yet/);
    expect(note).not.toMatch(/PMS plans are not recorded/);
  });

  it("keeps this project's reporting clocks, read by project", async () => {
    // Over-correction guard: the triage queue is keyed and must keep rendering.
    serve();
    const { container } = mount();
    await loadedAndExpanded(container);

    expect(seen.some((u) => u.includes('/api/capa-mdr/triage?program_id=project-own'))).toBe(true);
    expect(text(container)).toMatch(/Own project occlusion alarm/);
  });

  it('names the project the reporting clocks are limited to by its title, not its class and pathway', async () => {
    // `program.code` is "Class II · 510(k)" in production: a sentence limited to
    // it describes every Class II 510(k) project, not this one.
    serve();
    const { container, getByTestId } = mount();
    await loadedAndExpanded(container);

    const scope = getByTestId('postmarket-scope').textContent ?? '';
    expect(scope).toContain('Reporting clocks and the MDR/CAPA deadline metrics are limited to Own infusion pump.');
    expect(scope).not.toContain('Class II · 510(k)');
    const clocksSub = Array.from(container.querySelectorAll('.section-head'))
      .find((h) => /Reporting clocks/.test(h.textContent ?? ''))?.querySelector('.section-sub')?.textContent ?? '';
    expect(clocksSub).toMatch(/^Own infusion pump only/);
    expect(clocksSub).not.toContain('Class II · 510(k)');
  });

  it('asks AnA to triage only what its triage tool reads, for this project', async () => {
    // triage_capa_mdr_queue (server/services/ana/capaMdrTools.ts) reads one
    // program's complaints, MDR events and CAPAs and requires its id. There is
    // no portfolio-wide or signals triage tool.
    serve();
    const asked: string[] = [];
    const { container } = mount((t) => asked.push(t));
    await loadedAndExpanded(container);

    const button = Array.from(container.querySelectorAll('.page-actions button'))
      .find((b) => /Triage/.test(b.textContent ?? '')) as HTMLElement | undefined;
    expect(button, 'the header triage button must exist').toBeDefined();
    fireEvent.click(button as HTMLElement);
    expect(asked).toHaveLength(1);
    expect(asked[0]).not.toMatch(/portfolio|vigilance signals/i);
    expect(asked[0]).toContain('Own infusion pump (project project-own)');
    expect(asked[0]).toMatch(/complaints, MDR events and CAPAs/);
    // Nor does its label offer to triage signals, which no tool reads.
    expect(button?.textContent ?? '').not.toMatch(/signals/i);
  });

  it('states no scope for PMS plan entries, which have no store', async () => {
    // GET /api/mdx/postmarket returns `pmsPlan: []` always (mdx-postmarket.ts:111).
    serve();
    const { container, getByTestId } = mount();
    await loadedAndExpanded(container);

    const scope = getByTestId('postmarket-scope').textContent ?? '';
    expect(scope).not.toMatch(/PMS plan entries/);
    expect(scope).toContain(
      "Surveillance signals and the CAPA board are read for every project in this organization and are not shown until this screen reads this project's records.",
    );
    expect(scope).toContain('PMS plan execution is not tracked yet.');
  });

  it('the Situational awareness toggle names only what it holds', async () => {
    // It never held a signals feed or an MDR clock, and with the panels not
    // keyed it holds only the notes saying why.
    serve();
    const { container } = mount();
    await loadedAndExpanded(container);

    const sub = container.querySelector('.eng-awareness-head .section-sub')?.textContent ?? '';
    expect(sub).not.toMatch(/Full signals feed|MDR clock/);
    expect(sub.replace(/\s+/g, ' ')).toBe('CAPA board · vigilance trending · PMS plan execution — not shown for this project yet');
  });
});
