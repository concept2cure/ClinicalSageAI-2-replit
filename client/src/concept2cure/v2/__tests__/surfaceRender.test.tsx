// @vitest-environment jsdom
/**
 * Surface render smoke test — "installed, loaded and operational".
 *
 * Every id in the surface registry (canonical + ui-v2) must resolve to a real
 * SURFACE_VIEWS component, and every one of those components must render
 * without throwing when handed the same props V2App gives it. This is the
 * operational proof behind the parity verification: a green build proves the
 * surfaces compile; this proves they actually mount.
 *
 * Surfaces render under the same provider tree the live shell gives them
 * (main.tsx QueryClientProvider + ZenRouter AuthProvider/ProjectProvider);
 * offline, their queries degrade to the fixtures each surface already ships.
 */
import React from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  getSurface,
  UI_SURFACES,
  type UiSurface,
} from '@shared/constants/ui-surface-registry';
import { AuthProvider } from '@/services/portal/authService';
import { ProjectProvider } from '../../context/ProjectContext';
import { SURFACE_VIEWS } from '../surfaceViews';
import { Home } from '../surfaces/Surfaces';

/** The provider tree V2App runs under. Rendering surfaces under the same
 *  providers is what makes this a faithful stand-in for the live shell. */
function Providers({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ProjectProvider>{children}</ProjectProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

/** jsdom lacks these browser APIs that interactive surfaces reach for. */
beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
  const NoopObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };
  const g = globalThis as Record<string, unknown>;
  g.ResizeObserver ??= NoopObserver;
  g.IntersectionObserver ??= NoopObserver;
  if (!window.scrollTo) window.scrollTo = (() => {}) as typeof window.scrollTo;
});

afterEach(() => cleanup());

/** A minimal, schema-complete UiSurface for ids that are SURFACE_VIEWS-only
 *  aliases (e.g. device-510k, task-board) and so aren't in the registry. */
function stubSurface(id: string): UiSurface {
  return {
    id,
    label: id,
    navTier: 'workspace',
    layoutMode: id,
    group: 'workspace',
    uiKit: null,
    apiPrefixes: [],
    anaToolFamilies: [],
    sharedContract: null,
    discoveryCatalog: null,
    readiness: 'routes-ready',
    compliance: [],
  };
}

const noop = () => {};
const commonProps = { onAsk: noop, onNav: noop, segment: 'medical-device' };

/** Infrastructure ids that are not user-facing surfaces and so have no view. */
const INFRA_IDS = new Set([
  'auth-session',
  'tenant-org',
  'feature-flags',
  'ana-rail',
  'esign-modal',
]);
const surfaceEntries = UI_SURFACES.filter((s) => !INFRA_IDS.has(s.id));

describe('surface registry ↔ SURFACE_VIEWS coverage', () => {
  it('every registry surface resolves to a real component (no scaffold fallback)', () => {
    const missing = surfaceEntries
      .filter((s) => !SURFACE_VIEWS[s.id])
      .map((s) => s.id);
    expect(
      missing,
      `registry surfaces with no SURFACE_VIEWS component: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  // "All surfaces installed across all kits" — proven per kit, so a whole kit
  // can never silently regress to scaffolds. Every design kit (home, mdx,
  // authoring, biopharma, cmc, pdev, submission, tasking, intelligence, risk,
  // labeling, ectd_coauthor) plus the kit-agnostic surfaces must be 100%
  // installed.
  const kits = [...new Set(surfaceEntries.map((s) => s.uiKit ?? 'core'))].sort();

  it.each(kits)('kit "%s" is fully installed', (kit) => {
    const inKit = surfaceEntries.filter((s) => (s.uiKit ?? 'core') === kit);
    const uninstalled = inKit.filter((s) => !SURFACE_VIEWS[s.id]).map((s) => s.id);
    expect(inKit.length).toBeGreaterThan(0);
    expect(
      uninstalled,
      `kit ${kit}: ${uninstalled.length}/${inKit.length} surfaces have no component`,
    ).toEqual([]);
  });
});

describe('every SURFACE_VIEWS surface mounts without throwing', () => {
  const ids = Object.keys(SURFACE_VIEWS).sort();

  it.each(ids)('renders %s', (id) => {
    const surface = getSurface(id) ?? stubSurface(id);
    const View = SURFACE_VIEWS[id].component;
    const { container } = render(
      <Providers>
        <View surface={surface} {...commonProps} />
      </Providers>,
    );
    expect(container.firstChild, `${id} rendered empty`).not.toBeNull();
  });

  it('renders the home hub', () => {
    const { container } = render(
      <Providers>
        <Home onNav={noop} onAsk={noop} segment="medical-device" />
      </Providers>,
    );
    expect(container.firstChild).not.toBeNull();
  });
});
