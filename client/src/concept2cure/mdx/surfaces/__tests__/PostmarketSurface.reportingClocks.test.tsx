// @vitest-environment jsdom
/**
 * Slice 0 (.design/client-journey/INFORMATION_ARCHITECTURE.md, the
 * `device-postmarket` row): the reporting-clock figures say only what the
 * triage read holds.
 *
 * GET /api/capa-mdr/triage returns open complaints and open CAPAs, but MDR
 * events in every state: getTriageQueueTx calls listMdrEventsTx with no state
 * filter (server/services/capa-mdr/capaMdr.service.ts:1040-1043). It sets
 * `daysToDue` for every MDR and exempts filed, acknowledged and closed ones
 * only from `overdue` (:1076-1087). So:
 *
 *   - A filed MDR whose due date has passed arrives with `overdue: false` and
 *     a negative `daysToDue`. The "MDRs due ≤72h" card counted it, for ever,
 *     because its `daysToDue <= 3` had no lower bound — the server had already
 *     said it is not overdue. Its row read "-12d left". Fixed here.
 *   - A filed MDR whose due date is still ahead is counted as due. Excluding it
 *     is a server change (deferred); until then the screen says filed MDRs are
 *     counted, and no figure is called a running clock or "open".
 *
 * And a triage read that answered with nothing is a read, not "Not yet read".
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PostmarketSurface } from '../PostmarketSurface';
import type { Program } from '../../data/programs';

vi.mock('@/utils/authToken', () => ({ getAuthToken: () => 'test-token', getOrgId: () => '7' }));

const PROGRAM = { id: 'project-own', code: 'Class II · 510(k)', title: 'Own infusion pump' } as unknown as Program;

type Item = {
  kind: 'complaint' | 'mdr' | 'capa'; id: string; programId: string; code: string; title: string; state: string;
  riskOrSeverity: string | null; receivedOrOpenedAt: string; dueAt: string | null; daysToDue: number | null; overdue: boolean;
};
const mdr = (code: string, state: string, daysToDue: number, overdue: boolean): Item => ({
  kind: 'mdr', id: code, programId: 'project-own', code, title: `${code} narrative`, state,
  riskOrSeverity: '5-day', receivedOrOpenedAt: '2026-10-01', dueAt: '2026-10-20T00:00:00Z', daysToDue, overdue,
});

function serve(items: Item[]) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.includes('/api/capa-mdr/triage')
      ? { items, count: items.length }
      : { data: { metrics: [], signals: [], capas: [], pmsPlan: [], trends: [] } };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
}
afterEach(() => { vi.unstubAllGlobals(); cleanup(); });

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PostmarketSurface program={PROGRAM} onAskAna={() => {}} />
    </QueryClientProvider>,
  );
}

const text = (c: HTMLElement) => (c.textContent ?? '').replace(/\s+/g, ' ');
const meta = (c: HTMLElement, testId: string) =>
  c.querySelector(`[data-testid="${testId}"]`)?.parentElement?.querySelector('.metric-meta')?.textContent ?? '';
const rowFor = (c: HTMLElement, code: string) =>
  Array.from(c.querySelectorAll('.eng-blocker-row')).find((r) => r.textContent?.includes(code)) as HTMLElement | undefined;

describe('PostmarketSurface — reporting-clock figures say only what the triage read holds (slice 0)', () => {
  it('does not count a filed MDR past its due date, which the server says is not overdue, as due within 72h', async () => {
    serve([mdr('MDR-FILED-PAST', 'filed', -12, false)]);
    const { container, getByTestId } = mount();
    await waitFor(() => expect(text(container)).toMatch(/MDR-FILED-PAST/));

    expect(getByTestId('pm-mdr-due').textContent).toBe('0');
    const row = rowFor(container, 'MDR-FILED-PAST');
    expect(row?.textContent ?? '').not.toMatch(/-12d left/);
    expect(row?.querySelector('.eng-blocker-age')?.textContent).toBe('due 12d ago');
    // The server said it is not overdue: no warning tone on a met deadline.
    expect(row?.getAttribute('data-sev')).toBe('low');
  });

  it('still counts what the server marks overdue and what is due within 72h', async () => {
    // Over-correction guard.
    serve([mdr('MDR-LATE', 'draft', -1, true), mdr('MDR-SOON', 'draft', 2, false), mdr('MDR-LATER', 'draft', 20, false)]);
    const { container, getByTestId } = mount();
    await waitFor(() => expect(text(container)).toMatch(/MDR-SOON/));

    expect(getByTestId('pm-mdr-due').textContent).toBe('2');
    expect(rowFor(container, 'MDR-LATE')?.querySelector('.eng-blocker-age')?.textContent).toBe('1d overdue');
    expect(rowFor(container, 'MDR-SOON')?.querySelector('.eng-blocker-age')?.textContent).toBe('due in 2d');
    expect(rowFor(container, 'MDR-SOON')?.getAttribute('data-sev')).toBe('warn');
  });

  it('calls no figure a running clock or "open" while filed MDRs are still counted', async () => {
    // A filed MDR due in 2 days is in the read (server, deferred). The screen
    // must say so rather than vouch for it as an open reporting deadline.
    serve([mdr('MDR-FILED-SOON', 'filed', 2, false)]);
    const { container, getByTestId } = mount();
    await waitFor(() => expect(text(container)).toMatch(/MDR-FILED-SOON/));

    expect(text(container)).not.toMatch(/Clock running/);
    expect(text(container)).not.toMatch(/Open items/);
    expect(text(container)).not.toMatch(/\dd left/);
    expect(meta(container, 'pm-mdr-due')).toMatch(/filed MDRs not yet excluded/);
    const clocksSub = Array.from(container.querySelectorAll('.section-head'))
      .find((h) => /Reporting clocks/.test(h.textContent ?? ''))?.querySelector('.section-sub')?.textContent ?? '';
    expect(clocksSub.replace(/\s+/g, ' ')).toMatch(/MDR events are listed in every state, filed and closed included/);
    expect(getByTestId('pm-mdr-due').textContent).toBe('1');
  });

  it('says only what the server\'s overdue means, beside an MDR filed after its date', async () => {
    // The server's `overdue` is an MDR past its due date and not filed, or an open
    // CAPA past its target date (capaMdr.service.ts getTriageQueueTx). The triage
    // read never compares when an MDR was filed with its due date, so neither "no
    // deadline passed" nor "no deadline missed" is something it knows.
    serve([mdr('MDR-FILED-PAST', 'filed', -12, false)]);
    const { container } = mount();
    await waitFor(() => expect(text(container)).toMatch(/MDR-FILED-PAST/));

    expect(text(container)).not.toMatch(/No reporting deadline (passed|missed)/);
    expect(text(container)).toMatch(/No unfiled MDR or open CAPA past its due date/);
  });

  it('shows 0, not "Not yet read", when the triage read answered with nothing', async () => {
    serve([]);
    const { container, getByTestId } = mount();
    await waitFor(() => getByTestId('data-gate-empty'));

    expect(getByTestId('pm-mdr-due').textContent).toBe('0');
    expect(getByTestId('pm-capas').textContent).toBe('0');
    expect(meta(container, 'pm-capas')).toBe('0 past target date');
  });

  it('keeps "—" while the triage read is in flight', async () => {
    // Over-correction guard: only a resolved read is a zero.
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    const { getByTestId } = mount();

    expect(getByTestId('pm-mdr-due').textContent).toBe('—');
    expect(getByTestId('pm-capas').textContent).toBe('—');
  });
});
