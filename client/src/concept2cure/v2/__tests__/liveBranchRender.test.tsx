// @vitest-environment jsdom
/**
 * Every surface renders with no data yet, without a crash.
 *
 * WHAT THIS USED TO BE. A "live-branch" gate: the offline crash gate proved
 * every surface renders when `useLiveList` / `useLive` / `liveGet` fell back to
 * a shipped fixture with `sample:true`, and this one forced the OTHER branch by
 * stubbing those hooks to return the same fixture with `sample:false` — same
 * data, opposite provenance flag.
 *
 * Both branches are gone. Ledger L72 deleted the `live ?? fixture` helpers, so
 * no read hook can hand a surface a fixture and call it live, and there is no
 * sample flag to flip. The stub that forced the branch stubbed three symbols
 * that no longer exist, which made it a no-op dressed as a control.
 *
 * WHAT IT PROVES NOW. Every registered surface mounts and renders on the
 * fixture-free contract before any data arrives — the state a real first user
 * sees for the first paint — and fails on any crash-class console.error. That
 * is a narrower claim than the name "live branch" made, and it is the one the
 * test can actually support.
 */
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getSurface, type UiSurface } from '@shared/constants/ui-surface-registry';
import { AuthProvider } from '@/services/portal/authService';

// No dataConnect stub. The hooks it used to force are deleted (L72), and a
// mock of absent symbols is a control that controls nothing.
const { SURFACE_VIEWS } = await import('../surfaceViews');

function Providers({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        {children}
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

describe('every surface renders with no data yet, without crashing', () => {
  const ids = Object.keys(SURFACE_VIEWS).sort();

  it.each(ids)('%s renders its no-data-yet state without a crash-class error', (id) => {
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
