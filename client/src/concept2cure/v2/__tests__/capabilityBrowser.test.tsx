// @vitest-environment jsdom
/**
 * Home's capability discovery converges on the existing Workflows surface.
 *
 * The former overlay rendered every segment module, including deferred and
 * duplicate destinations, without the live catalog's access explanations.
 * The replacement is Home -> apps -> the existing live catalog. Discovery
 * remains available before a project exists and when the portfolio read fails;
 * opening it must not create a project, seed a conversation or run a workflow.
 * Feature reachability and access decisions belong to the catalog's component
 * tests, rather than a second segment-wide list with a different policy.
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

function openDiscovery(segment: string) {
  const onNav = vi.fn();
  const onAsk = vi.fn();
  render(<Home segment={segment} onNav={onNav} onAsk={onAsk} />);
  fireEvent.click(screen.getByRole('button', { name: 'Explore workflows' }));
  return { onNav, onAsk };
}

describe('Home reaches the existing Workflows destination', () => {
  it.each(SEGMENT_IDS)('%s uses the same live discovery path without inventing project context', (segment) => {
    const { onNav, onAsk } = openDiscovery(segment);

    expect(onNav).toHaveBeenCalledTimes(1);
    expect(onNav).toHaveBeenCalledWith('apps');
    expect(onAsk).not.toHaveBeenCalled();
    expect(window.C2C_PROJECT).toBeUndefined();
    expect(window.C2C_CONVO).toBeUndefined();
    expect(screen.queryByRole('dialog', { name: /Browse all capabilities/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Browse all capabilities' })).toBeNull();
  });

  it('an unknown client type reaches the same destination instead of a biopharma module fallback', () => {
    const { onNav } = openDiscovery('__unrecognized-client-type__');
    expect(onNav).toHaveBeenCalledWith('apps');
    expect(document.querySelector('.capbrowser')).toBeNull();
    expect(window.C2C_PROJECT).toBeUndefined();
  });

  it('remains reachable while the portfolio read is pending', () => {
    apiRequest.mockImplementation(() => new Promise<Response>(() => {}));
    const { onNav } = openDiscovery('biotech');
    expect(screen.getByText('Loading your programs…')).toBeTruthy();
    expect(onNav).toHaveBeenCalledWith('apps');
    expect(window.C2C_PROJECT).toBeUndefined();
  });

  it('remains reachable when the portfolio read fails without turning the failure into an empty portfolio', async () => {
    apiRequest.mockRejectedValue(new Error('Portfolio unavailable'));
    const { onNav } = openDiscovery('diagnostics');
    expect(await screen.findByText(/Couldn.t load your programs/)).toBeTruthy();
    expect(screen.queryByText('No programs yet')).toBeNull();
    expect(onNav).toHaveBeenCalledWith('apps');
    expect(window.C2C_PROJECT).toBeUndefined();
  });

  it('uses the canonical Workflows label without changing the routable surface id', () => {
    expect(getSurfaceMeta('apps').label).toBe('Workflows');
    const views = fs.readFileSync(path.join(REPO_ROOT, 'client/src/concept2cure/v2/surfaceViews.ts'), 'utf8');
    expect(views).toMatch(/\bapps:\s*\{\s*component:\s*Apps\s*\}/);
  });
});

describe('the duplicate discovery presentation is retired', () => {
  it('removes the overlay implementation and its Home integration after converging on Workflows', () => {
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
    { id: 'part11-console', query: '21 CFR Part 11 console', label: /^21 CFR Part 11 console/ },
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
});
