// @vitest-environment jsdom
/**
 * The New project picker offers only what the market verdict offers, and labels
 * author-only filings (FILING_SPINE F19b; WORKFLOW_DECISION_2026-10-08 §4 Q2).
 *
 * Before: RegistryPicker listed every catalog filing, 234 of them, Health
 * Canada, an MHRA "IND", a new Japanese application and agencies with no
 * outline included, and none said what the platform would do with it.
 *
 * The server's answer is produced here by the server's own function
 * (services/regulatory/market-support.ts `marketSupport`), so this test also
 * pins that the picker and project creation read one verdict: for every
 * catalog row, the picker offers it exactly when that function does.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { RegistryPicker } from '../surfaces/AnaVerbs';
import { GLOBAL_REGISTRY, REG_SEGMENTS } from '../surfaces/RegistryBridge';
import { programTypeFor } from '../surfaces/Projects';
import { marketSupport, type ActiveRulePacks } from '../../../../../server/services/regulatory/market-support';
import { REGION_IDENTITY } from '@shared/regulatory/region-identity';

/** The packs live on trunk, as server/services/regulatory/__tests__/market-support.test.ts lists them, plus mod3:ich. */
const LIVE_PACKS = new Set([
  'ind:fda', 'nda:fda', 'bla:fda', 'anda:fda', 'ide:fda', 'k510:fda', 'pma:fda', 'denovo:fda',
  'cta:ema', 'maa:ema', 'mdr:ema', 'ivdr:ema', 'cer:ema', 'jnda:pmda', 'ind:mhra', 'mod3:ich',
]);
const packs: ActiveRulePacks = {
  find: (d, a) => (LIVE_PACKS.has(`${d}:${a}`) ? { version: 'v-test', label: `${d}:${a}` } : null),
};
const ASOF = '2026-10-08';
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

/** GET /api/submissions/market-support, as server/routes/submissions.ts answers it. */
function serverAnswer(_m: string, raw: unknown) {
  const url = new URL(String(raw), 'http://x');
  const applicationType = url.searchParams.get('applicationType') ?? '';
  const market = url.searchParams.get('market');
  const markets = (market ? [market] : Object.keys(REGION_IDENTITY))
    .map((m) => marketSupport({ applicationType, market: m }, packs, ASOF));
  return Promise.resolve(ok({ applicationType, asOf: ASOF, markets }));
}

const typeOf = (e: { id: string; pathwayKey?: string | null }) =>
  programTypeFor({ id: e.id, label: e.id, pathway: e.pathwayKey || 'ctd' }, 'biotech');

function renderPicker(onChange = vi.fn(), value = '') {
  return render(<RegistryPicker value={value} onChange={onChange} applicationTypeOf={typeOf} initialSegment="pharma_biotech" />);
}

const tiles = () => Array.from(document.querySelectorAll('button.rpk-type')).map((b) => ({
  name: b.querySelector('.rpk-type-n')?.textContent ?? '',
  agency: b.querySelector('.rpk-chip-agency')?.textContent ?? '',
  authorOnly: Array.from(b.querySelectorAll('.rpk-chip')).some((c) => c.textContent === 'Author documents for this market'),
}));

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(serverAnswer);
});
afterEach(() => cleanup());

describe('RegistryPicker offers what the market verdict offers', () => {
  it('for every catalog row, a tile is shown exactly when the server offers the filing, and author-only ones say so', async () => {
    renderPicker();
    await waitFor(() => expect(document.querySelectorAll('button.rpk-type').length).toBeGreaterThan(0));
    let seen = 0;
    for (const seg of Object.keys(REG_SEGMENTS)) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(REG_SEGMENTS[seg].label) }));
      const shown = tiles();
      const want = GLOBAL_REGISTRY.filter((e) => e.segment === seg).map((e) => ({
        e, offer: marketSupport({ applicationType: typeOf(e), market: e.agency }, packs, ASOF).offer,
      }));
      const expected = want.filter((w) => w.offer.tier !== 'not_offered');
      expect(shown.map((t) => `${t.name}|${t.agency}`).sort(), seg)
        .toEqual(expected.map((w) => `${w.e.displayName}|${w.e.agency}`).sort());
      expect(shown.filter((t) => t.authorOnly).length, `${seg} author-only labels`)
        .toBe(expected.filter((w) => w.offer.tier === 'author_only').length);
      seen += want.length;
    }
    expect(seen).toBe(GLOBAL_REGISTRY.length);
  });

  it('offers no Health Canada filing, and a search for one says why, in the server\'s words', async () => {
    renderPicker();
    await waitFor(() => expect(document.querySelectorAll('button.rpk-type').length).toBeGreaterThan(0));
    expect(tiles().some((t) => /Health Canada/.test(t.agency))).toBe(false);
    fireEvent.change(screen.getByRole('textbox', { name: /search filing types/i }), { target: { value: 'Health Canada' } });
    const section = screen.getByTestId('rpk-not-offered');
    expect(within(section).getAllByText(/Health Canada has no governed [A-Z]+ outline here, so a project would have nothing to author/).length).toBeGreaterThan(0);
    expect(screen.getByText(/not offered, listed below with the reason/)).toBeTruthy();
  });

  it('a filing whose agency the server names no market for is not offered, and its reason is the server\'s', async () => {
    renderPicker();
    await waitFor(() => expect(document.querySelectorAll('button.rpk-type').length).toBeGreaterThan(0));
    fireEvent.change(screen.getByRole('textbox', { name: /search filing types/i }), { target: { value: 'Notified Body' } });
    const section = screen.getByTestId('rpk-not-offered');
    await waitFor(() => expect(within(section).getAllByText(/Refused at creation: /).length).toBeGreaterThan(0));
  });

  it('the chosen filing states its offer as text', async () => {
    renderPicker(vi.fn(), 'eu_maa');
    await waitFor(() => expect(screen.getByTestId('rpk-chosen-offer')).toBeTruthy());
    expect(screen.getByTestId('rpk-chosen-offer').textContent).toMatch(/^Author documents for this market\. Author the documents here\./);
  });

  it('lists nothing while the verdict is pending', () => {
    apiRequest.mockImplementation(() => new Promise(() => {}));
    renderPicker();
    expect(screen.getByRole('status').textContent).toMatch(/Checking which filing types the platform can carry/);
    expect(document.querySelectorAll('button.rpk-type')).toHaveLength(0);
  });

  it('a failed read is an error with Retry, never an empty or a full list', async () => {
    apiRequest.mockImplementation(async () => { throw new TypeError('Failed to fetch'); });
    renderPicker();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/could not be read, so none is offered yet/);
    expect(document.querySelectorAll('button.rpk-type')).toHaveLength(0);
    apiRequest.mockImplementation(serverAnswer);
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(document.querySelectorAll('button.rpk-type').length).toBeGreaterThan(0));
  });
});

// ── Added 2026-10-08 (F19b review) ──────────────────────────────────────────
describe('RegistryPicker states only what the verdict states for that filing', () => {
  it('a filing that creates an NDA without being one (a Type A meeting) states no tier; the NDA itself says Build and sequence', async () => {
    renderPicker(vi.fn(), 'us_type_a_meeting');
    await waitFor(() => expect(screen.getByTestId('rpk-chosen-offer')).toBeTruthy());
    const meeting = screen.getByTestId('rpk-chosen-offer').textContent ?? '';
    expect(meeting).toMatch(/^No tier is stated for this filing\./);
    expect(meeting).toMatch(/New Drug Application/);
    expect(meeting).not.toMatch(/Authored, built and frozen here/);
    cleanup();
    renderPicker(vi.fn(), 'us_nda');
    await waitFor(() => expect(screen.getByTestId('rpk-chosen-offer')).toBeTruthy());
    expect(screen.getByTestId('rpk-chosen-offer').textContent).toMatch(/^Build and sequence\. Authored, built and frozen here as an eCTD sequence for FDA\./);
  });

  it('the EU MDR/IVDR lane at a Notified Body is offered for authoring, asked of the server by its own market', async () => {
    renderPicker();
    await waitFor(() => expect(document.querySelectorAll('button.rpk-type').length).toBeGreaterThan(0));
    fireEvent.change(screen.getByRole('textbox', { name: /search filing types/i }), { target: { value: 'Notified Body' } });
    const nb = tiles().filter((t) => t.agency === 'EU / Notified Body');
    expect(nb.length).toBeGreaterThan(0);
    expect(nb.every((t) => t.authorOnly)).toBe(true);
    expect(apiRequest.mock.calls.some((c) => /market=EU\+%2F\+Notified\+Body/.test(String(c[1])))).toBe(true);
  });

  it('a search lists not-offered filings by the same fields as offered ones (an eCTD search finds Health Canada)', async () => {
    renderPicker();
    await waitFor(() => expect(document.querySelectorAll('button.rpk-type').length).toBeGreaterThan(0));
    fireEvent.change(screen.getByRole('textbox', { name: /search filing types/i }), { target: { value: 'eCTD' } });
    expect(within(screen.getByTestId('rpk-not-offered')).getAllByText(/Health Canada/).length).toBeGreaterThan(0);
  });

  it('the not-offered note counts the tab it is shown on', async () => {
    renderPicker();
    await waitFor(() => expect(document.querySelectorAll('button.rpk-type').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(REG_SEGMENTS.medical_devices.label) }));
    const want = GLOBAL_REGISTRY.filter((e) => e.segment === 'medical_devices' &&
      marketSupport({ applicationType: typeOf(e), market: e.agency }, packs, ASOF).offer.tier === 'not_offered').length;
    expect(screen.getByText(new RegExp(`^${want} filing types? in ${REG_SEGMENTS.medical_devices.label} (is|are) not offered`))).toBeTruthy();
  });

  it('Retry stays mounted and busy while it reads again, and focus lands on the search box when the list arrives', async () => {
    apiRequest.mockImplementation(async () => { throw new TypeError('Failed to fetch'); });
    renderPicker();
    const alert = await screen.findByRole('alert');
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    apiRequest.mockImplementation(async (m: string, u: unknown) => { await gate; return serverAnswer(m, u); });
    const button = within(alert).getByRole('button', { name: 'Retry' });
    button.focus();
    fireEvent.click(button);
    await waitFor(() => expect(within(screen.getByRole('alert')).getByRole('button').getAttribute('aria-busy')).toBe('true'));
    expect(document.activeElement).toBe(within(screen.getByRole('alert')).getByRole('button'));
    release();
    await waitFor(() => expect(document.querySelectorAll('button.rpk-type').length).toBeGreaterThan(0));
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: /search filing types/i }));
  });
});
