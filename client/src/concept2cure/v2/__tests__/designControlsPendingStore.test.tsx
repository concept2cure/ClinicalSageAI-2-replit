// @vitest-environment jsdom
/**
 * A design history file that DOES NOT EXIST is not a design history file that is
 * empty.
 *
 * `GET /api/design-controls` fails closed on SQLSTATE 42P01 to
 * `{ data: [], meta: { count: 0, pendingStore: true } }`
 * (server/routes/design-controls.routes.ts:59) — the honest "this environment
 * has no c2c_design_controls table" signal, pinned server-side by
 * server/routes/__tests__/design-controls-read.test.ts:73.
 *
 * The surface reads through `useLiveRows`, which unwraps the envelope to the
 * array and drops `meta` on the floor. So the unprovisioned store and the empty
 * store render the SAME pixels — "No design inputs defined yet · Add your first
 * with New design input above" — and the eyebrow says "live" over both. The
 * instruction is false in the first case: the POST it points at answers 503
 * PENDING_STORE.
 *
 * Vault.tsx:952 and rbmBoard.ts:254 already branch on this exact flag. This
 * surface is the deviation.
 *
 * 2026-10-29 (D2, fold F1c): the Design controls screen folded into Engineering
 * evidence, which mounts the same trace (v2/surfaces/DesignControlsTrace.tsx)
 * for the open project and hands its AnA context to the host. These cases run
 * against the trace as Engineering mounts it (./engineeringPanels.harness.tsx),
 * over the route's bodies for an admitted project. The old screen's header and
 * its "live" eyebrow went with it; the panel is pinned to claim no live store
 * over one that does not exist.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { EngineeringDesignControlsPanel, keyedToPanelProject } from './engineeringPanels.harness';

/** What the panel hands the host for AnA, as the last report. */
let published: unknown = null;

/** The bodies server/routes/design-controls.routes.ts answers for an admitted project. */
const PENDING = keyedToPanelProject([], { pendingStore: true });   // 42P01
const EMPTY = keyedToPanelProject([]);                              // zero rows

function respond(body: unknown) {
  apiRequest.mockImplementation(async () => ({ ok: true, status: 200, json: async () => body }));
}
function mount() {
  const view = render(<EngineeringDesignControlsPanel onContext={(ctx) => { published = ctx; }} />);
  return { ...view, ctx: () => JSON.stringify(published) };
}
const settled = (el: HTMLElement) =>
  waitFor(() => expect(el.textContent ?? '').not.toMatch(/Loading design inputs/));

beforeEach(() => { apiRequest.mockReset(); published = null; });
afterEach(() => cleanup());

describe('Design controls — an unprovisioned store is not an empty DHF', () => {
  it('says the store is not provisioned, instead of "no design inputs defined yet"', async () => {
    respond(PENDING);
    const { container } = mount();
    await settled(container);
    const t = container.textContent ?? '';

    expect(t, 'the user must be told the store does not exist here').toMatch(/not provisioned/i);
    expect(
      /Add your first with/i.test(t),
      'the CTA points at a POST that answers 503 PENDING_STORE — it cannot be offered as the way to fix this',
    ).toBe(false);
  });

  it('does not claim a live connection to a store that does not exist', async () => {
    respond(PENDING);
    const { container } = mount();
    await settled(container);
    expect(/\blive\b/i.test(container.textContent ?? ''), 'a "live" claim asserts a connected store').toBe(false);
  });

  it('renders differently from a provisioned-but-empty store', async () => {
    respond(PENDING);
    const a = mount();
    await settled(a.container);
    const pendingHtml = a.container.innerHTML;
    cleanup();

    respond(EMPTY);
    const b = mount();
    await settled(b.container);
    expect(
      b.container.innerHTML === pendingHtml,
      'an absent store and an empty store paint byte-identical DOM',
    ).toBe(false);
  });

  it('does not publish an 820.30 completeness claim over a store that does not exist', async () => {
    respond(PENDING);
    const { container, ctx: readCtx } = mount();
    await settled(container);
    const ctx = readCtx();
    expect(ctx, 'the panel handed its context up').toMatch(/"summary"/);

    // This string goes on the wire to AnA as `module_context` on every turn
    // (V2App.tsx:370-372), and is what she answers a DHF question from.
    expect(
      /completeness 0%/.test(ctx),
      'AnA is told the org is 0% complete on 820.30 when nothing has been assessed and no store exists',
    ).toBe(false);
    expect(
      /"state":"absent"/.test(ctx),
      'five 820.30 elements are asserted ABSENT — a positive have-not claim — with no store to have evidenced them',
    ).toBe(false);
  });

  it('announces a refused write as a failure, not with the success tick', async () => {
    // `.c2c-v2 .de-toast .ico{color:var(--success)}` (journey-v2.css:478); only
    // `[data-tone="error"]` turns it. `fire` defaults to 'ok', so omitting the
    // tone draws the green tick over a REFUSED 21 CFR 820.30 controlled write —
    // the defect toast.tsx's two-argument signature exists to prevent.
    const { ApiRequestError } = await vi.importActual<typeof import('@/lib/queryClient')>('@/lib/queryClient');
    // Sequenced deliberately: read succeeds, the write is REFUSED. It must be
    // `mockRejectedValueOnce` and not `mockImplementation(async () => {throw})`
    // — Vitest only suppresses unhandled-rejection tracking for the former, so
    // the latter fails the test on a rejection the component demonstrably
    // catches. Trailing `mockResolvedValue` keeps any re-read after the failed
    // write on the same honest empty body.
    apiRequest
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => EMPTY })
      .mockRejectedValueOnce(new (ApiRequestError as any)(
        'Design controls store is not provisioned yet.', 503,
        { error: { code: 'PENDING_STORE', message: 'Design controls store is not provisioned yet.' } }, 'PENDING_STORE'))
      .mockResolvedValue({ ok: true, status: 200, json: async () => EMPTY });
    const { container } = mount();
    await settled(container);

    fireEvent.click(Array.from(container.querySelectorAll('button')).find(b => /New design input/.test(b.textContent || ''))!);
    fireEvent.change(container.querySelector('input[type="text"]') as HTMLInputElement, { target: { value: 'Battery lasts 14 days' } });
    fireEvent.change(container.querySelector('select') as HTMLSelectElement, { target: { value: 'performance' } });
    fireEvent.click(Array.from(container.querySelectorAll('button')).find(b => /Add design input/.test(b.textContent || ''))!);

    await waitFor(() => expect(container.querySelector('.de-toast')?.textContent).toMatch(/Could not add design input/));
    const t = container.querySelector('.de-toast') as HTMLElement;
    expect(t.getAttribute('data-tone'), 'a refused governed write must not wear the success styling').toBe('error');
    expect(t.getAttribute('role'), 'a failure is announced assertively').toBe('alert');
    expect(t.querySelector('.ico svg')?.getAttribute('class')).not.toMatch(/circle-check/);
  });

  it('still shows the ordinary empty state when the store IS provisioned and holds nothing', async () => {
    // Over-correction guard: the honest empty state must survive.
    respond(EMPTY);
    const { container } = mount();
    await settled(container);
    expect(container.textContent).toMatch(/No design inputs defined yet/);
    expect(/not provisioned/i.test(container.textContent ?? '')).toBe(false);
  });
});
