// @vitest-environment jsdom
/**
 * Every surface keeps its accessible names. A ratchet, at zero.
 *
 * ── Why this is a test and not a script ───────────────────────────────────────
 * A one-off audit found 21 violations across the product: four icon-only send
 * buttons that announced as "button" and nothing else, and seventeen fields
 * whose only name was a placeholder — which is not a label, is not exposed as
 * the accessible name by every AT, and vanishes the moment the user types.
 *
 * All 21 were fixed. Without something holding the line, the 22nd arrives with
 * the next icon button, and nobody notices until a customer's accessibility
 * review does. Enterprise and government buyers ask for a VPAT before they
 * sign; "we fixed it once" is not an answer to that question.
 *
 * ── Why it can run here at all ────────────────────────────────────────────────
 * These criteria need only the DOM — no layout, no cascade, no computed style —
 * so jsdom answers them exactly as Chromium does. That is what lets this be an
 * ordinary CI test with no browser and no build step. Contrast is the opposite:
 * it needs real rendering, so it stays in `scripts/visual-qa/check-contrast.mjs`
 * and is run deliberately.
 *
 * The rules live in `scripts/visual-qa/a11y-rules.mjs` and are shared with the
 * Chromium script rather than duplicated. They encode judgement calls — alt=""
 * is correct, a missing alt is not; an SVG <title> names its button — and two
 * copies of a judgement call is two places for it to drift.
 *
 * ── What this does NOT prove ──────────────────────────────────────────────────
 * React event handlers exist on the mounted tree, but a `<div onClick>` still
 * carries no role and no tabindex, and this rule set does not yet flag that
 * shape. Keyboard operability and focus order are NOT covered. A green run here
 * means "every control has a name", not "the product is accessible".
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';

import type { A11yFinding } from '../../../../../scripts/visual-qa/a11y-rules.mjs';
import {
  auditA11y,
  SELF_CHECK_HTML,
  SELF_CHECK_EXPECTED,
  SELF_CHECK_MUST_NOT_FLAG,
} from '../../../../../scripts/visual-qa/a11y-rules.mjs';
import { bodyFor } from '../../../../../scripts/visual-qa/api-fixtures.mjs';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest }));

import { AuthProvider } from '@/services/portal/authService';
import { SURFACE_VIEWS } from '../surfaceViews';

/*
 * There is no exclusion list, and there was almost a nine-entry one.
 *
 * Nine surfaces appeared to crash after their data resolved, and were about to
 * be excluded here as known-broken. Triaging all nine found ZERO product
 * defects: the harness had been answering every request with `{ data: [] }`,
 * which `unwrapEnvelope` collapses to a TRUTHY `[]` — walking past every
 * `if (!data)` guard while satisfying no shape, so the first `.map` threw.
 *
 * An exclusion list would have permanently hidden nine surfaces from this
 * ratchet to accommodate a bug in the ratchet's own fixtures. Worth recording,
 * because that is how a guard quietly stops guarding most of what it names.
 */
beforeEach(() => {
  cleanup();
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => ({
    ok: true, status: 200,
    json: async () => bodyFor(String(url)), text: async () => JSON.stringify(bodyFor(String(url))),
  }));
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : String((input as Request).url ?? input);
    return new Response(JSON.stringify(bodyFor(url)), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  }));
  (window as unknown as Record<string, unknown>).C2C_PROJECT = { id: 'proj-a11y', code: 'BX204' };
  (window as unknown as Record<string, unknown>).C2C_CONVO = { id: 'new' };
  try { window.localStorage.clear(); } catch { /* ignore */ }
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (window as unknown as Record<string, unknown>).C2C_PROJECT;
  delete (window as unknown as Record<string, unknown>).C2C_CONVO;
});

const ALL = Object.keys(SURFACE_VIEWS).sort();
const AUDITABLE = ALL;

describe('the audit measures what it claims', () => {
  it('detects every seeded failure and flags none of the correct forms', () => {
    const host = document.createElement('div');
    host.innerHTML = SELF_CHECK_HTML;
    document.body.appendChild(host);

    const found = auditA11y(host, document);
    const rules = found.map((f: A11yFinding) => f.rule);

    for (const expected of SELF_CHECK_EXPECTED) {
      expect(rules, `the audit failed to detect: ${expected}`).toContain(expected);
    }
    // The half that matters more. A tool that flags correct markup trains
    // people to ignore it, and then it protects nothing.
    for (const pattern of SELF_CHECK_MUST_NOT_FLAG) {
      const fp = found.filter((f: A11yFinding) => pattern.test(f.html));
      expect(fp, `false positive on correct markup ${pattern}: ${fp.map((f: A11yFinding) => f.rule).join(', ')}`)
        .toEqual([]);
    }
    host.remove();
  });
});

describe('every surface names its controls and fields', () => {
  it('the registry is non-trivial (guards the enumeration itself)', () => {
    expect(AUDITABLE.length).toBeGreaterThan(100);
  });

  it.each(AUDITABLE)('%s', async (id) => {
    const entry = (SURFACE_VIEWS as Record<string, {
      component: React.ComponentType<Record<string, unknown>>;
      ownsConversation?: boolean;
    }>)[id];
    const Surface = entry.component;

    const props: Record<string, unknown> = {
      surface: { id, label: id, navTier: 'global' },
      onNav: () => {},
      segment: 'biotech',
    };
    // ownsConversation:true narrows the component to OwnedSurfaceViewProps.
    if (!entry.ownsConversation) props.onAsk = () => {};

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

    // Audit the SETTLED tree. Auditing mid-load would miss every control that
    // only appears once data arrives — the same wrong-moment blind spot that
    // let nine post-load crashes pass a 251-test smoke suite.
    await waitFor(() => {
      expect(container.querySelector('[aria-busy="true"]')).toBeNull();
      expect((container.innerHTML ?? '').trim().length).toBeGreaterThan(0);
    }, { timeout: 8000 });

    const findings = auditA11y(container, document);
    expect(
      findings,
      findings.length
        ? `${id} has ${findings.length} accessibility violation(s):\n` +
          findings.map((f: A11yFinding) => `  · ${f.rule}\n    ${f.detail}\n    ${f.html}`).join('\n')
        : '',
    ).toEqual([]);
  });

});
