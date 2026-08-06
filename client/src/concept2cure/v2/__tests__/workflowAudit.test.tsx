// @vitest-environment jsdom
/**
 * Workflow click-through audit — mounts every registered surface through the
 * real V2 provider tree (QueryClient + Auth + Project), the same context the
 * running shell gives each surface, and records for each one:
 *   - mounted        did it render without throwing
 *   - contentChars   size of rendered text (a blank render is suspicious)
 *   - consoleErrors  React/runtime errors emitted during mount
 *   - dataState      'live' | 'sample' | 'n/a'  (the honest data pill)
 *
 * Offline (no backend in the sandbox) every wired surface must fail closed to
 * 'sample' — this audit is where that guarantee is observed end-to-end. Results
 * are written to workflow-audit-results.json for reporting.
 */
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getSurface, UI_SURFACES, type UiSurface } from '@shared/constants/ui-surface-registry';
import { AuthProvider } from '@/services/portal/authService';
import { SURFACE_VIEWS } from '../surfaceViews';

function Providers({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
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
    window.matchMedia = ((q: string) => ({
      matches: false, media: q, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
  const Noop = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
  const g = globalThis as Record<string, unknown>;
  g.ResizeObserver ??= Noop;
  g.IntersectionObserver ??= Noop;
  if (!window.scrollTo) window.scrollTo = (() => {}) as typeof window.scrollTo;
});

afterEach(() => cleanup());

function stub(id: string): UiSurface {
  return {
    id, label: id, navTier: 'specialist', layoutMode: id, group: 'workspace',
    uiKit: null, apiPrefixes: [], anaToolFamilies: [], sharedContract: null,
    discoveryCatalog: null, readiness: 'routes-ready', compliance: [],
  };
}

const noop = () => {};

interface Row {
  id: string;
  label: string;
  kit: string;
  mounted: boolean;
  contentChars: number;
  consoleErrors: number;
  dataState: 'live' | 'sample' | 'n/a';
  note: string;
}

const results: Row[] = [];
const ids = Object.keys(SURFACE_VIEWS).sort();

// Some surfaces guard on the active segment (e.g. IvdCompleteness renders its
// full IVDR framework only under 'diagnostics', a short guard otherwise).
// Rendering under each candidate segment and keeping the fullest result audits
// every surface in the context where it actually renders its workflow.
const SEGMENTS = ['medical-device', 'diagnostics', 'biotech'] as const;

describe('workflow click-through audit', () => {
  it.each(ids)('audit %s', (id) => {
    const surfaceMeta = getSurface(id);
    const View = SURFACE_VIEWS[id].component;
    const surface = getSurface(id) ?? stub(id);

    // A console error in ANY segment is a defect — accumulate across all of
    // them, independent of which segment rendered the most content.
    const errs: string[] = [];
    let best = { mounted: false, chars: 0, text: '', note: '' };
    for (const seg of SEGMENTS) {
      const spy = vi.spyOn(console, 'error').mockImplementation((...a) => {
        const s = a.map(String).join(' ');
        if (!s.includes('not wrapped in act')) errs.push(s);
      });
      let mounted = false;
      let chars = 0;
      let text = '';
      let note = '';
      try {
        const { container, unmount } = render(
          <Providers>
            <View surface={surface} onAsk={noop} onNav={noop} segment={seg} />
          </Providers>,
        );
        mounted = container.firstChild != null;
        text = container.textContent ?? '';
        chars = text.length;
        unmount();
      } catch (e) {
        note = e instanceof Error ? e.message : String(e);
      } finally {
        spy.mockRestore();
      }
      // Keep the render with the most content (the surface's natural segment).
      if (chars > best.chars || (mounted && !best.mounted)) {
        best = { mounted: mounted || best.mounted, chars, text, note: note || best.note };
      }
    }
    const { mounted, chars, text, note } = best;
    // The honest data pill: SampleTag renders "Sample data" (offline) or "Live".
    const dataState: Row['dataState'] = /Sample data|\bsample\b/i.test(text)
      ? 'sample'
      : /\bLive\b/.test(text)
        ? 'live'
        : 'n/a';
    results.push({
      id,
      label: surfaceMeta?.label ?? id,
      kit: surfaceMeta?.uiKit ?? 'core',
      mounted,
      contentChars: chars,
      consoleErrors: errs.length,
      dataState,
      note: note || (errs[0] ? errs[0].slice(0, 120) : ''),
    });
    expect(mounted, `${id} did not mount: ${note}`).toBe(true);
    expect(errs, `${id} console errors: ${errs[0] ?? ''}`).toHaveLength(0);
  });

  it('writes the audit report', () => {
    const outDir = path.resolve('docs/reports');
    fs.mkdirSync(outDir, { recursive: true });
    const summary = {
      total: results.length,
      mounted: results.filter((r) => r.mounted).length,
      withErrors: results.filter((r) => r.consoleErrors > 0).length,
      sample: results.filter((r) => r.dataState === 'sample').length,
      live: results.filter((r) => r.dataState === 'live').length,
    };
    fs.writeFileSync(
      path.join(outDir, 'workflow-audit-results.json'),
      JSON.stringify({ summary, surfaces: results.sort((a, b) => a.kit.localeCompare(b.kit) || a.id.localeCompare(b.id)) }, null, 2),
    );
    // eslint-disable-next-line no-console
    console.log('AUDIT SUMMARY', JSON.stringify(summary));
    expect(summary.mounted).toBe(summary.total);
    expect(summary.withErrors).toBe(0);
  });
});
