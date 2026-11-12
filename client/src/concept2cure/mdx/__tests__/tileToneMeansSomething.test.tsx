// @vitest-environment jsdom
/**
 * D8 slice 1a (founder decision P-128): a stat tile's figure takes a status colour only when the figure means it.
 *
 * ONE_DESIGN_PLAN §2: status colour only for meaning. Slice 1 moved a tile's tone from its fill to its figure
 * (sharedLookRetiredPatterns.test.ts). Three tiles set their tone whatever the figure was, so after slice 1 the
 * running app showed "MDRs due ≤72h 0" in the error colour and "CAPAs open 0" and "Awaiting signature 0" in the
 * warning colour (docs/evidence/DESIGN/D8/slice-1/screenshots/after-1440-light-device-postmarket.png), and a read
 * that had failed showed "—" in the same colours.
 *
 * Nothing a screen shows is removed (P-122): each tile, its label, its figure and its note are still drawn. The
 * tone is the screen's own choice when the figure is above zero, and is unchanged there.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PostmarketSurface } from '../surfaces/PostmarketSurface';
import { UdiSurface } from '../surfaces/UdiSurface';

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

/** The tile a figure sits in, and the tone it carries ('' when it carries none). */
const toneOf = (figure: HTMLElement): string => figure.closest('.metric-card')?.getAttribute('data-tone') ?? '';
/** The tile with this label. */
const tileLabelled = (label: string): HTMLElement => {
  const found = [...document.querySelectorAll<HTMLElement>('.metric-card')].find(
    (card) => card.querySelector('.metric-label')?.textContent === label,
  );
  if (!found) throw new Error(`no tile labelled "${label}"`);
  return found;
};

describe('Post-market vigilance: the deadline tiles', () => {
  const SURVEILLANCE = { data: { metrics: [], signals: [], capas: [], pmsPlan: [], trends: [] } };
  const item = (kind: string, daysToDue: number | null, overdue = false) => ({
    kind, id: `${kind}${daysToDue}`, programId: 'p', code: 'C', title: 't', state: 'open', riskOrSeverity: null,
    receivedOrOpenedAt: '2026-09-01', dueAt: null, daysToDue, overdue,
  });
  const mount = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}><PostmarketSurface onAskAna={() => {}} /></QueryClientProvider>);
  };

  it('a queue with nothing in it shows 0 with no status colour', async () => {
    serve((u) => (u.includes('/api/capa-mdr/triage') ? { items: [], count: 0 } : SURVEILLANCE));
    const { getByTestId } = mount();
    await waitFor(() => expect(getByTestId('pm-mdr-due').textContent).toBe('0'));
    expect(getByTestId('pm-capas').textContent).toBe('0');
    expect(toneOf(getByTestId('pm-mdr-due'))).toBe('');
    expect(toneOf(getByTestId('pm-capas'))).toBe('');
  });

  it('a queue that could not be read shows no figure and no status colour', async () => {
    serve((u) => (u.includes('/api/capa-mdr/triage') ? null : SURVEILLANCE));
    const { getByTestId } = mount();
    await waitFor(() => getByTestId('data-gate-error'));
    expect(getByTestId('pm-mdr-due').textContent).toBe('—');
    expect(toneOf(getByTestId('pm-mdr-due'))).toBe('');
    expect(toneOf(getByTestId('pm-capas'))).toBe('');
  });

  it('an MDR due within 72 hours is still the error colour, and an open CAPA the warning colour', async () => {
    serve((u) => (u.includes('/api/capa-mdr/triage') ? { items: [item('mdr', 2), item('capa', 5)], count: 2 } : SURVEILLANCE));
    const { getByTestId } = mount();
    await waitFor(() => expect(getByTestId('pm-mdr-due').textContent).toBe('1'));
    expect(toneOf(getByTestId('pm-mdr-due'))).toBe('err');
    expect(getByTestId('pm-capas').textContent).toBe('1');
    expect(toneOf(getByTestId('pm-capas'))).toBe('warn');
  });
});

describe('UDI and labeling: the signature tile', () => {
  const PROJECT = '11111111-1111-4111-8111-111111111111';
  const LABEL = { id: 'lbl-1', device: 'Aurora pump', kind: 'IFU', region: 'US', lang: 'en', ver: '1', size: '—', status: 'draft', updated: '2026-10-01' };

  it('no label awaiting a signature shows 0 with no status colour, and the tile is still drawn', async () => {
    serve(() => ({ data: { devices: [], labels: [LABEL], symbols: [], issues: [], mri: [] }, meta: { scope: 'program' } }));
    render(<UdiSurface programId={PROJECT} onAskAna={() => {}} />);
    await waitFor(() => expect(document.body.textContent).toContain('Aurora pump — IFU (en)'));
    const tile = tileLabelled('Awaiting signature');
    expect(tile.querySelector('.metric-val')?.textContent).toBe('0');
    expect(tile.getAttribute('data-tone') ?? '').toBe('');
    expect(tile.querySelector('.metric-meta')?.textContent).toBe('Pending Part 11 e-signature');
  });
});
