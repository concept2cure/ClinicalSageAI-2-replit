// @vitest-environment jsdom
/**
 * Capture EVERY registered v2 surface, not just the converged kit ones.
 *
 * The first capture covered the 24 surfaces the shell convergence moved, because
 * those were the ones the PR put at risk. That left 94 of the 118 entries in
 * SURFACE_VIEWS unexamined — the bulk of the product, including the surfaces a
 * customer actually spends the day in.
 *
 * The two bugs the 24-surface run found (device-presub, and all eight PDEV navs)
 * were both the same shape: an adapter dereferencing a server payload it did not
 * check, crashing during render, and leaving a blank screen where an honest empty
 * state was already written. There is no reason to believe that pattern stopped
 * at the kit boundary, and every reason to check.
 *
 * This mounts each surface the way the shell does — through its registry entry,
 * with the props its `ownsConversation` flag says it gets — and serializes what
 * it draws. `check-surface-styling.mjs` then puts that markup under the real
 * shipped stylesheets in real Chromium.
 *
 * A surface that CRASHES fails here rather than being written out as zero bytes:
 * `settled()` requires rendered markup, because an unmounted tree has no spinner
 * and no aria-busy and would otherwise read as "finished loading".
 *
 * ── What this adds over `v2/__tests__/surfaceRender.test.tsx` ─────────────────
 * That file already mounts every registered surface under this same provider
 * tree and asserts it renders without throwing. It passes 251/251.
 *
 * It asserts SYNCHRONOUSLY — at the moment of mount, which is before any request
 * resolves. Nine surfaces mount cleanly and then throw when their data lands, and
 * that test cannot see it: by the time the component unwinds, nothing is looking.
 *
 * This is the third instance of one lesson in this codebase. The PR that this
 * work belongs to documents `MdxSurfaceHost` building its output and never
 * returning it — sixteen surfaces rendering `undefined`, with every guard green
 * because they all read STRUCTURE instead of mounting. The 24-surface capture
 * then found `device-presub` and all eight PDEV navs crashing after load. Now
 * nine more. A guard that reads the wrong MOMENT is as blind as one that reads
 * the wrong thing, and "it mounts" is a much weaker claim than it looks.
 *
 * Which of the nine are product defects and which are artifacts of the empty
 * `{ data: [] }` mock below is a separate question, under investigation. The
 * mock is right for a list endpoint and wrong for one returning an object, so a
 * surface may be crashing on a shape its server never sends. This file's job is
 * to SURFACE the difference, not to adjudicate it.
 */

import { describe, it, beforeEach, afterEach, vi, expect } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import fs from 'node:fs';
import path from 'node:path';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest }));

import { AuthProvider } from '../../client/src/services/portal/authService';
import { SURFACE_VIEWS } from '../../client/src/concept2cure/v2/surfaceViews';

const OUT = path.resolve(__dirname, '../../.visual-qa/markup');

/**
 * The kit surfaces already have their own capture with a mock tuned to them
 * (a seeded IND program, a 404 program view). Re-capturing them here with a
 * different mock would overwrite that with a weaker fixture.
 */
const ALREADY_COVERED = new Set<string>([
  'device-workstream', 'device-510k', 'device-pma', 'device-cer', 'device-diagnostics',
  'device-clinical-studies', 'device-software', 'device-engineering', 'device-udi',
  'device-postmarket', 'device-presub', 'device-vault', 'device-tasks',
  'device-validation', 'device-submission', 'device-analytics',
  'protocol-dev', 'pdev-cmc', 'pdev-nonclinical', 'pdev-clinical',
  'pdev-regulatory', 'pdev-ind-assembly', 'pdev-contradictions', 'pdev-fda-interactions',
]);

/** Every request resolves to an empty-but-well-formed envelope. */
const emptyBody = () => ({ data: [] });

beforeEach(() => {
  cleanup();
  fs.mkdirSync(OUT, { recursive: true });
  apiRequest.mockReset();
  apiRequest.mockImplementation(async () => ({
    ok: true,
    status: 200,
    json: async () => emptyBody(),
    text: async () => JSON.stringify(emptyBody()),
  }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(emptyBody()), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })),
  );
  // Runtime channels the shell populates before a surface mounts.
  (window as unknown as Record<string, unknown>).C2C_PROJECT = { id: 'proj-vqa', code: 'BX204' };
  (window as unknown as Record<string, unknown>).C2C_CONVO = { id: 'new' };
  try { window.localStorage.clear(); } catch { /* ignore */ }
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (window as unknown as Record<string, unknown>).C2C_PROJECT;
  delete (window as unknown as Record<string, unknown>).C2C_CONVO;
});

async function settled(container: HTMLElement, name: string) {
  await waitFor(
    () => {
      const busy = container.querySelector('[aria-busy="true"]');
      const loading = /Loading[^]{0,40}…/.test(container.textContent ?? '');
      const drew = (container.innerHTML ?? '').trim().length > 0;
      expect(
        busy === null && !loading && drew,
        `${name} did not settle into rendered markup ` +
          `(busy=${busy !== null} loading=${loading} drew=${drew}). ` +
          'An empty container means the surface THREW — that is not an empty state.',
      ).toBe(true);
    },
    { timeout: 8000 },
  );
}

const ENTRIES = Object.entries(SURFACE_VIEWS)
  .filter(([id]) => !ALREADY_COVERED.has(id))
  .sort(([a], [b]) => a.localeCompare(b));

describe('capture every registered v2 surface', () => {
  it('the registry is non-trivial (guards the enumeration itself)', () => {
    // If SURFACE_VIEWS changes shape, this file would silently capture nothing
    // and every downstream check would pass on an empty set.
    expect(ENTRIES.length).toBeGreaterThan(50);
  });

  it.each(ENTRIES.map(([id]) => id))('%s', async (id) => {
    const entry = (SURFACE_VIEWS as Record<string, {
      component: React.ComponentType<Record<string, unknown>>;
      ownsConversation?: boolean;
    }>)[id];
    const Surface = entry.component;

    // `ownsConversation: true` narrows the component to OwnedSurfaceViewProps —
    // everything except the shell's `onAsk`. Passing onAsk to one of those is
    // the exact mistake the union exists to prevent, so do not.
    const props: Record<string, unknown> = {
      surface: { id, label: id, navTier: 'global' },
      onNav: () => {},
      segment: 'biotech',
    };
    if (!entry.ownsConversation) props.onAsk = () => {};

    // The same provider tree the live shell gives a surface, and the same one
    // `v2/__tests__/surfaceRender.test.tsx` uses — QueryClientProvider from
    // main.tsx, AuthProvider from ZenRouter. Rendering under anything less
    // produces failures that belong to the harness, not the product.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { container } = render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <Surface {...props} />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await settled(container, id);
    fs.writeFileSync(path.join(OUT, `v2__${id}.html`), container.innerHTML, 'utf8');
  });
});
