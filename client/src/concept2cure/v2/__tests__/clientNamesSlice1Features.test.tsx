// @vitest-environment jsdom
/**
 * Slice A.1 (names a client reads), Subscription & features: the page says "features" and
 * "subscription", in every state, and each slice 1 feature's card carries its section 9 name.
 * Split from clientNamesSlice1.test.tsx, which holds the rest of the slice's guard.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({
    user: { firstName: 'Ada', lastName: 'Rowe', displayName: 'Ada Rowe', roles: ['admin', 'user'] },
    logout: vi.fn(),
  }),
}));
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant: null, organizationId: 7, currentOrganization: null }),
}));

import { type UiSurface } from '@shared/constants/ui-surface-registry';
import { getSurfaceMeta } from '../registryModel';
import { Apps } from '../surfaces/WorkflowCatalog';
import { norm, offending, SLICE1_LABELS } from './clientNamesSlice1.shared';

const REPO = path.resolve(__dirname, '../../../../..');
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async () => ok({ data: [] }));
});
afterEach(cleanup);

/* ── Subscription & features ─────────────────────────────────────────────── */

const SURFACE = { ...getSurfaceMeta('apps'), id: 'apps' } as unknown as UiSurface;
const CATALOG = '/api/module-subscriptions/catalog';
const LICENSE = '/api/module-subscriptions/license';
const LICENCE = { tier: 'professional', industryMode: 'biotech', usage: { projects: { currentCount: 3, maxAllowed: 25 }, users: { currentCount: 9, maxAllowed: 50 } } };
const moduleRow = (moduleId: string, name: string, sortOrder: number) => ({
  moduleId, name, sortOrder, description: `${name}.`, category: 'Projects', isEnabled: true,
  subscriptionState: 'enabled', isAvailable: true, requiredTier: 'free', launchScope: 'launch',
});
/** Rows named as section 9 names them, so this block reads the page's own words, not catalogue names. */
const NAMED_ROWS = Object.entries(SLICE1_LABELS)
  .filter(([id]) => !['apps', 'licensing', 'master-licensing'].includes(id))
  .map(([id, label], i) => moduleRow(id, label, (i + 1) * 10));

function serveCatalog(catalog: () => Promise<Response>, license: () => Promise<Response> = async () => ok(LICENCE)) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === CATALOG) return catalog();
    if (method === 'GET' && url === LICENSE) return license();
    return ok({ data: [] });
  });
}

/** Text a person reads or hears on the page; catalogue descriptions (`.launch-desc`) are the database's. */
function pageWords(root: HTMLElement): string[] {
  const entries: Array<[string, string]> = [];
  const walker = document.createTreeWalker(root, window.NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if ((node.parentElement as HTMLElement | null)?.closest('.launch-desc')) continue;
    entries.push(['text', node.textContent ?? '']);
  }
  root.querySelectorAll('[aria-label], [title], [placeholder]').forEach((el) => {
    for (const attr of ['aria-label', 'title', 'placeholder']) {
      const value = el.getAttribute(attr);
      if (value) entries.push([attr, value]);
    }
  });
  return [...new Set(offending(entries))];
}

function mountFeatures() {
  return render(<Apps surface={SURFACE} onAsk={() => {}} onNav={() => {}} segment="biopharma" />);
}

describe('A.1 · Subscription & features says "features" and "subscription"', () => {
  it('its heading, licence band, cards and administrator controls', async () => {
    serveCatalog(async () => ok({ modules: NAMED_ROWS, launchScope: { enforced: true } }));
    const { container } = mountFeatures();
    await screen.findByText('The review board', { selector: '.launch-title' });
    fireEvent.click(screen.getByTitle('Toggle admin controls'));
    expect({
      heading: screen.getByRole('heading', { level: 1 }).textContent,
      words: pageWords(container),
    }).toEqual({ heading: 'Subscription & features', words: [] });
  });

  it('while loading', () => {
    serveCatalog(() => new Promise<Response>(() => {}), () => new Promise<Response>(() => {}));
    const { container } = mountFeatures();
    expect(pageWords(container)).toEqual([]);
  });

  it('when the catalogue cannot be read, or the licence cannot', async () => {
    serveCatalog(async () => { throw Object.assign(new Error('Server error'), { status: 500 }); },
      async () => { throw Object.assign(new Error('Server error'), { status: 500 }); });
    const { container } = mountFeatures();
    await waitFor(() => expect(container.textContent).toMatch(/could not be loaded|unavailable right now/));
    await waitFor(() => expect(container.querySelector('[data-testid="admin-manage-plan-fallback"]')).not.toBeNull());
    expect(pageWords(container)).toEqual([]);
  });

  it('when the catalogue is empty', async () => {
    serveCatalog(async () => ok({ modules: [], launchScope: { enforced: true } }));
    const { container } = mountFeatures();
    await waitFor(() => expect(container.textContent).toMatch(/No features are listed/));
    expect(pageWords(container)).toEqual([]);
  });

  it('when nothing matches a search', async () => {
    serveCatalog(async () => ok({ modules: NAMED_ROWS, launchScope: { enforced: true } }));
    const { container } = mountFeatures();
    await screen.findByText('The review board', { selector: '.launch-title' });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a feature' }), { target: { value: 'zzzz no such feature' } });
    await waitFor(() => expect(container.textContent).toMatch(/clear the search/));
    expect(pageWords(container)).toEqual([]);
  });

  /* The cards show the catalogue's own name before the registry label (`a.name || surf.label`), and
     the deployed catalogue is the seed db/migrations/20260810_reconcile_module_catalog.sql re-asserts
     on every deploy (Rule 1). So the cards are drawn here from that seed: either the seed carries
     section 9's names, or the card reads the registry label. Submission Readiness stays the
     catalogue's name for dispatch-readiness (P-33). */
  it("each slice 1 feature's card carries its section 9 name, from the catalogue as deployed", async () => {
    const sql = readFileSync(path.join(REPO, 'db/migrations/20260810_reconcile_module_catalog.sql'), 'utf8');
    const seed = sql.slice(sql.indexOf('INSERT INTO available_modules'), sql.indexOf('ON CONFLICT (module_id)'));
    const seeded = new Map([...seed.matchAll(/^\s*\('([a-z0-9-]+)', '((?:[^']|'')*)',/gm)].map((m) => [m[1], m[2].replace(/''/g, "'")]));
    const rows = Object.keys(SLICE1_LABELS).filter((id) => seeded.has(id)).map((id, i) => moduleRow(id, seeded.get(id)!, (i + 1) * 10));
    expect(rows.length, 'the seed names the slice 1 features').toBeGreaterThan(10);
    serveCatalog(async () => ok({ modules: rows, launchScope: { enforced: true } }));
    const { container } = mountFeatures();
    await waitFor(() => expect(container.querySelectorAll('.launch-title').length).toBeGreaterThanOrEqual(rows.length));
    const titles = [...container.querySelectorAll('.launch-title')].map((el) => norm(el.textContent ?? ''));
    const wrong = rows.flatMap(({ moduleId, name }) => {
      const want = moduleId === 'dispatch-readiness' ? [SLICE1_LABELS[moduleId], 'Submission Readiness'] : [SLICE1_LABELS[moduleId]];
      const shown = titles.includes(norm(name)) && !want.includes(norm(name));
      return [
        ...(shown ? [`${moduleId}: the card reads "${name}"`] : []),
        ...(want.some((w) => titles.includes(w)) ? [] : [`${moduleId}: no card reads "${want.join('" or "')}"`]),
      ];
    });
    expect(wrong).toEqual([]);
  });
});
