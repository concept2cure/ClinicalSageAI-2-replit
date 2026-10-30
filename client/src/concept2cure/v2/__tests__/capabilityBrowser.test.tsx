// @vitest-environment jsdom
/**
 * Home does not send a client to the feature catalog.
 *
 * The former overlay rendered every segment module, including deferred and
 * duplicate destinations, without the live catalog's access explanations; on
 * 2026-10-23 it was replaced by Home -> apps ("Explore workflows"). On
 * 2026-10-25 the founder tested the product as a client and found that catalog
 * read as dozens of separate apps (docs/design/CLIENT_JOURNEY_2026-10-25.md).
 * Home now leads with the client's projects, and the catalog is "Plan &
 * features", an administrator's licensing view reached from the account menu
 * (shellNav.test.tsx). Nothing on Home opens it, in any client type, whether
 * the portfolio read is pending or failed; and Home opening must not create a
 * project or seed a conversation.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { firstName: 'Dana' } }),
}));
vi.mock('@/hooks/useGlobalRiCatalog', () => ({
  useGlobalRiCatalog: () => ({ catalog: null, loading: false, error: undefined }),
}));

import { Home } from '../surfaces/Surfaces';
import { SEGMENTS, getSurfaceMeta } from '../registryModel';
import { CmdK } from '../Shell';
import { NavEntitlementsProvider, useNavEntitlements } from '../navEntitlements';
import { NAVIGATION_TARGETS } from '@shared/navigation';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const SEGMENT_IDS = [...new Set([...SEGMENTS.map((segment) => segment.id), 'biotech', 'pharma'])];
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockResolvedValue(ok({ data: [] }));
  delete window.C2C_PROJECT;
  delete window.C2C_CONVO;
});
afterEach(() => {
  cleanup();
  delete window.C2C_PROJECT;
  delete window.C2C_CONVO;
});

/** Press every button Home renders and return every destination it asked for. */
function pressEverything(segment: string) {
  const onNav = vi.fn();
  const onAsk = vi.fn();
  render(<Home segment={segment} onNav={onNav} onAsk={onAsk} />);
  for (const b of screen.queryAllByRole('button')) fireEvent.click(b);
  return { onNav, onAsk };
}

describe('Home does not open the feature catalog', () => {
  it.each(SEGMENT_IDS)('%s: no control on Home leads to the catalog, and Home invents no project or conversation', async (segment) => {
    const { onNav, onAsk } = pressEverything(segment);
    expect(screen.queryByRole('button', { name: /Explore workflows|Plan & features|Subscription & features|Workflows/ })).toBeNull();
    expect(onNav).not.toHaveBeenCalledWith('apps');
    expect(onAsk).not.toHaveBeenCalled();
    expect(window.C2C_PROJECT).toBeUndefined();
    expect(window.C2C_CONVO).toBeUndefined();
    expect(screen.queryByRole('dialog', { name: /Browse all capabilities/i })).toBeNull();
  });

  it('nor while the portfolio read is pending', () => {
    apiRequest.mockImplementation(() => new Promise<Response>(() => {}));
    const { onNav } = pressEverything('biotech');
    expect(screen.getByText('Loading your projects…')).toBeTruthy();
    expect(onNav).not.toHaveBeenCalledWith('apps');
  });

  it('nor when the portfolio read fails, which is said and not shown as an empty portfolio', async () => {
    apiRequest.mockRejectedValue(new Error('Portfolio unavailable'));
    render(<Home segment="diagnostics" onNav={vi.fn()} onAsk={vi.fn()} />);
    expect(await screen.findByText(/Couldn.t load your projects/)).toBeTruthy();
    expect(screen.queryByTestId('home-first-project')).toBeNull();
    expect(screen.queryByRole('button', { name: /Explore workflows|Plan & features|Subscription & features/ })).toBeNull();
  });

  it('the catalog is named Subscription & features, at its unchanged routable id', () => {
    expect(getSurfaceMeta('apps').label).toBe('Subscription & features');
    const views = fs.readFileSync(path.join(REPO_ROOT, 'client/src/concept2cure/v2/surfaceViews.ts'), 'utf8');
    expect(views).toMatch(/\bapps:\s*\{\s*component:\s*Apps\s*\}/);
  });
});

describe('the duplicate discovery presentation is retired', () => {
  it('removes the overlay implementation and its Home integration', () => {
    const home = fs.readFileSync(path.join(REPO_ROOT, 'client/src/concept2cure/v2/surfaces/Surfaces.tsx'), 'utf8');
    expect(home).not.toMatch(/\bCapabilityBrowser\b|\bbrowseOpen\b|\bsetBrowseOpen\b/);
    expect(fs.existsSync(path.join(REPO_ROOT, 'client/src/concept2cure/v2/surfaces/CapabilityBrowser.tsx'))).toBe(false);
  });
});

function AccessReadState() {
  const access = useNavEntitlements();
  return <output>{access.resolved ? 'Access resolved' : 'Access pending'}</output>;
}

describe('nonlicensable records keep their existing command-palette replacement', () => {
  it.each([
    { id: 'audit-trail', query: 'Audit trail', label: /^Audit trail/ },
    // part11-console folded into audit-trail on 2026-10-29 (foldPart11Console.test.ts): no ⌘K entry of its own.
  ])('$id stays reachable without a subscribable catalog row', async ({ id, query, label }) => {
    apiRequest.mockImplementation(async (_method: string, url: string) => {
      if (url === '/api/module-subscriptions/navigation') return ok({
        organizationId: 7, tier: 'standard', industryMode: 'biotech', masterAdmin: false,
        resolved: true, launchScope: { enforced: true }, surfaces: [],
      });
      throw new Error(`Unexpected read: ${url}`);
    });
    const onNav = vi.fn();
    const onAsk = vi.fn();
    const onAct = vi.fn();
    const onClose = vi.fn();
    render(<NavEntitlementsProvider>
      <AccessReadState />
      <CmdK open onClose={onClose} onNav={onNav} onAsk={onAsk} onAct={onAct} />
    </NavEntitlementsProvider>);
    await screen.findByText('Access resolved');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: query } });
    const destination = screen.getByRole('button', { name: label });
    expect(destination.getAttribute('data-locked')).toBeNull();
    fireEvent.click(destination);
    expect(onNav).toHaveBeenCalledWith(id);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAsk).not.toHaveBeenCalled();
    expect(onAct).not.toHaveBeenCalled();
    expect(NAVIGATION_TARGETS.find((target) => target.id === id)?.scope).toBe('global');
    expect(window.C2C_PROJECT).toBeUndefined();
  });

  it('the folded Part 11 console has no command-palette entry of its own', async () => {
    apiRequest.mockImplementation(async (_method: string, url: string) => {
      if (url === '/api/module-subscriptions/navigation') return ok({
        organizationId: 7, tier: 'standard', industryMode: 'biotech', masterAdmin: false,
        resolved: true, launchScope: { enforced: true }, surfaces: [],
      });
      throw new Error(`Unexpected read: ${url}`);
    });
    render(<NavEntitlementsProvider>
      <AccessReadState />
      <CmdK open onClose={vi.fn()} onNav={vi.fn()} onAsk={vi.fn()} onAct={vi.fn()} />
    </NavEntitlementsProvider>);
    await screen.findByText('Access resolved');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '21 CFR Part 11 console' } });
    expect(screen.queryByRole('button', { name: /^21 CFR Part 11 console/ })).toBeNull();
  });
});
