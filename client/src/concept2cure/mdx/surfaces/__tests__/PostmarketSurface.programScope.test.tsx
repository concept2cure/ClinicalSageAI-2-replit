// @vitest-environment jsdom
/**
 * P-122 (2026-11-10): the Post-market screen shows its surveillance panels once the read is this project's.
 *
 * Since 10bbeeeea (2026-10-26) the signal triage queue, the CAPA board, vigilance trending and PMS plan execution
 * said "Shown once this screen reads this project's records", because GET /api/mdx/postmarket read the whole
 * organisation (SURVEILLANCE_KEYED_TO_PROJECT = false). The route now takes `program_id` and reports
 * `meta.scope: 'program'` (server/routes/mdx-postmarket.ts; tests/db/p122-quality-surveillance-reads.dbtest.ts). The
 * screen asks for the open project and draws the panels when, and only when, the server says the rows are that
 * project's, as Engineering does since P-60. A failed read is a failure with a retry, never an empty panel.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PostmarketSurface } from '../PostmarketSurface';
import type { Program } from '../../data/programs';

vi.mock('@/utils/authToken', () => ({ getAuthToken: () => 'test-token', getOrgId: () => '7' }));

const PROGRAM = { id: '33333333-3333-4333-8333-333333333333', code: 'Class II · 510(k)', title: 'Own infusion pump' } as unknown as Program;

const OWN = {
  metrics: [],
  signals: [{
    id: 'SIG-OWN-1', device: 'PUMP-1', source: 'complaint', opened: '2026-11-01T00:00:00Z', severity: 'critical',
    kind: 'complaint_received', count: 2, vs: '—', summary: 'Own pump occlusion', owner: 'A', state: 'investigate',
  }],
  capas: [{
    id: 'CAPA-OWN-4', title: 'Own pump seal', device: 'PUMP-1', stage: 'open', owner: 'B', opened: '2026-11-02T00:00:00Z',
    sla: '', critical: true, linked: [],
  }],
  pmsPlan: [],
  trends: [],
};

const seen: string[] = [];
function serve(postmarket: { status: number; body: unknown }) {
  seen.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    seen.push(url);
    const { status, body } = url.includes('/api/mdx/postmarket') ? postmarket : { status: 200, body: { items: [], count: 0 } };
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }));
}
afterEach(() => { vi.unstubAllGlobals(); cleanup(); });

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><PostmarketSurface program={PROGRAM} onAskAna={() => {}} /></QueryClientProvider>);
}
const text = (c: HTMLElement) => c.textContent ?? '';

describe('PostmarketSurface — the surveillance panels, read for this project (P-122)', () => {
  it("asks for this project's records", async () => {
    serve({ status: 200, body: { data: OWN, meta: { count: 1, scope: 'program' } } });
    mount();
    await waitFor(() => expect(seen).toContain(`/api/mdx/postmarket?program_id=${PROGRAM.id}`));
    expect(seen).not.toContain('/api/mdx/postmarket');
  });

  it("shows this project's signals, CAPA board, trends and PMS plan execution when the server says they are its", async () => {
    serve({ status: 200, body: { data: OWN, meta: { count: 1, scope: 'program' } } });
    const { container, getByTestId } = mount();
    await waitFor(() => expect(text(container)).toMatch(/Own pump occlusion/));
    expect(container.querySelector('[data-testid^="pm-not-keyed-"]')).toBeNull();
    expect(getByTestId('pm-signals').textContent).toBe('1');
    expect(getByTestId('pm-pms').textContent).toBe('0');
    fireEvent.click(container.querySelector('.eng-awareness-head') as HTMLElement);
    expect(text(container)).toMatch(/CAPA-OWN-4/);
    expect(text(container)).toMatch(/Own pump seal/);
    // No store yet: said as such, not as a project with nothing in it.
    expect(text(container)).toMatch(/Trend series are not yet computed/);
    expect(text(container)).toMatch(/PMS plan execution is not yet tracked/);
    const scope = getByTestId('postmarket-scope').textContent ?? '';
    expect(scope).toContain('Surveillance signals and the CAPA board are read for Own infusion pump.');
    expect(scope).not.toMatch(/every project in this organization/);
    expect(container.querySelector('.eng-awareness-head .section-sub')?.textContent?.replace(/\s+/g, ' '))
      .toBe('CAPA board · vigilance trending · PMS plan execution');
  });

  it('says a failed read is a failure, with a retry, and never an empty or unkeyed panel', async () => {
    serve({ status: 500, body: { error: 'The surveillance read failed.' } });
    const { container, getByTestId } = mount();
    await waitFor(() => expect(text(container)).toMatch(/could not|couldn['’]t|failed/i));
    expect(container.querySelector('[data-testid="pm-not-keyed-signals"]')).toBeNull();
    expect(getByTestId('pm-signals').textContent).toBe('—');
    const signals = Array.from(container.querySelectorAll('section'))
      .find((s) => /Signal triage queue/.test(s.querySelector('h2')?.textContent ?? '')) as HTMLElement;
    expect(signals.querySelector('button')?.textContent ?? '').toMatch(/Try again|Retry/);
  });

  it("keeps the panels hidden when the server does not say the rows are this project's", async () => {
    serve({ status: 200, body: { data: OWN, meta: { count: 1, scope: 'organization' } } });
    const { container } = mount();
    await waitFor(() => expect(container.querySelector('[data-testid="pm-not-keyed-signals"]')).not.toBeNull());
    expect(text(container)).not.toMatch(/Own pump occlusion/);
  });

  /* The triage queue's clearance copy now goes through the four-state
     discriminator (v2/assessmentState.ts), as the device surface's "Nothing is
     blocking" does. This case holds the half that is easy to break while
     tightening the other: a read that DID run for this project and holds
     records, whose signals simply do not qualify for triage, must still be
     allowed to say the queue is clear. Suppressing that would be its own
     dishonesty — a project with nothing waiting told "in the signals read".

     The signal is critical AND already closed as a trend, which is the real
     shape of a non-triage row: the queue filter is
     `(critical || review) && state !== 'closed-trend'`. */
  it('still says the triage queue is clear when the read ran for this project and nothing qualifies', async () => {
    const CLOSED = {
      ...OWN,
      signals: [{
        ...OWN.signals[0], id: 'SIG-OWN-CLOSED-1', summary: 'Own pump occlusion, closed as a trend',
        state: 'closed-trend',
      }],
    };
    serve({ status: 200, body: { data: CLOSED, meta: { count: 1, scope: 'program' } } });
    const { container, getByTestId } = mount();
    await waitFor(() => expect(container.querySelector('[data-testid="pm-signals-none"]')).not.toBeNull());
    expect(container.querySelector('[data-testid^="pm-not-keyed-"]')).toBeNull();
    expect(getByTestId('pm-signals-none').textContent)
      .toBe('No critical or under-review signal is waiting for an MDR or CAPA.');
    /* Not the narrower wording, which belongs to a read that did not run for
       this project — asserted by name so a later edit cannot quietly swap them. */
    expect(text(container)).not.toMatch(/in the signals read for this project/);
  });
});
