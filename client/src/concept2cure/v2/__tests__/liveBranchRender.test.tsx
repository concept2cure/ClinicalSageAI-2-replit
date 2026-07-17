// @vitest-environment jsdom
/**
 * Live-branch render gate — "the seeded first user's view renders too".
 *
 * The crash gate (surfaceRender.test) proves every surface renders in its
 * OFFLINE state: no backend reachable, so useLiveList/useLive/liveGet all fall
 * back to the shipped fixture with sample:true. But a first human on a seeded
 * org hits the OTHER branch — the backend answers, the surface adopts the live
 * payload, and sample flips to false. Surfaces sometimes render differently in
 * that branch (a "Live" pill instead of "Sample data", live-only affordances,
 * roll-ups computed off adopted rows), and nothing exercises it.
 *
 * This forces the live branch for every surface by stubbing the dataConnect
 * read hooks to return { sample:false } with the surface's OWN fixture as the
 * adopted payload — a shape-matching, non-fabricated stand-in for what the
 * backend would return. Then it renders every surface and fails on any
 * crash-class console.error, exactly like the offline gate. Same data, opposite
 * provenance flag: this closes the branch the offline gate can't reach.
 */
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getSurface, type UiSurface } from '@shared/constants/ui-surface-registry';
import { AuthProvider } from '@/services/portal/authService';
import { ProjectProvider } from '../../context/ProjectContext';

// Force the live-adopted branch: every read hook reports sample:false and hands
// back the fixture the surface passed in (its own display shape). liveGet is
// async and returns the raw-envelope fixture unchanged. Everything else in
// dataConnect (SampleTag, matchesShape, unwrapList) stays real.
vi.mock('../dataConnect', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../dataConnect')>();
  return {
    ...actual,
    useLiveList: (_path: string | null, fixture: unknown[]) => ({
      data: fixture,
      loading: false,
      sample: false,
    }),
    useLive: (_path: string | null, fixture: unknown) => ({
      data: fixture,
      loading: false,
      sample: false,
    }),
    liveGet: async (_path: string, fixture: unknown) => ({
      data: fixture,
      sample: false,
    }),
  };
});

// Imported after the mock is registered so the surfaces bind to the stubbed hooks.
const { SURFACE_VIEWS } = await import('../surfaceViews');

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

function stubSurface(id: string): UiSurface {
  return {
    id,
    label: id,
    navTier: 'specialist',
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

/** True when a console.error call looks like a real crash, not a style warning. */
function isCrash(args: unknown[]): boolean {
  if (args.some((a) => a instanceof Error)) return true;
  const msg = args.map((a) => (typeof a === 'string' ? a : '')).join(' ');
  if (/not wrapped in act|inside a test was not wrapped/i.test(msg)) return false;
  if (/^Warning:/.test(msg) && !/error occurred in the/i.test(msg)) return false;
  return /error occurred in the|Cannot read propert|is not a function|is not iterable|undefined is not|Maximum update depth/i.test(
    msg,
  );
}

describe('every surface renders its live (sample:false) branch without crashing', () => {
  const ids = Object.keys(SURFACE_VIEWS).sort();

  // Guard against a vacuous pass: if the dataConnect mock silently failed to
  // apply, every surface would fall back to sample:true (the offline branch the
  // crash gate already covers) and this suite would prove nothing. dossier-map
  // renders <SampleTag sample={sample} />, so the real pill must read "Live"
  // here — confirming the mock actually put the surface in the live branch.
  it('the mock genuinely forces the live branch (SampleTag reads "Live")', () => {
    const { container } = render(
      <Providers>
        {React.createElement(SURFACE_VIEWS['dossier-map'].component, {
          surface: getSurface('dossier-map') ?? stubSurface('dossier-map'),
          ...commonProps,
        })}
      </Providers>,
    );
    const pill = container.querySelector('.c2c-sample-tag');
    expect(pill, 'dossier-map did not render its SampleTag pill').not.toBeNull();
    expect(pill?.textContent).toContain('Live');
    expect(pill?.className).toContain('is-live');
  });

  it.each(ids)('%s renders live-adopted data without a crash-class error', (id) => {
    const surface = getSurface(id) ?? stubSurface(id);
    const View = SURFACE_VIEWS[id].component;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(
        <Providers>
          <View surface={surface} {...commonProps} />
        </Providers>,
      );
      const crashes = spy.mock.calls.filter(isCrash);
      expect(
        crashes,
        `${id} crashed in live branch: ${crashes.map((c) => String(c[0])).join(' | ')}`,
      ).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  });
});
