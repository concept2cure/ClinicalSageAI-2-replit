/**
 * @vitest-environment jsdom
 *
 * Runtime smoke tests for every new Concept2Cure design-system surface
 * ported in this session. Verifies each surface:
 *   1. Mounts without throwing
 *   2. Renders its page-title h1
 *   3. Doesn't log any unexpected errors to the console
 *
 * These are NOT exhaustive — they're a smoke test that catches:
 *   - import path errors that escaped tsc
 *   - data-shape mismatches at runtime (DocumentsPanel adapter casts)
 *   - hook errors during initial fixture-fallback render
 *   - missing icon refs
 *   - JSX intrinsic prop errors
 *
 * Mock context:
 *   - `fetch` returns 404 for every /api/* call, forcing every hook into
 *     fixture-fallback mode. This is also the realistic dev state since
 *     the new endpoints aren't wired yet.
 *   - `localStorage` resets between tests so view-mode preferences don't bleed.
 *   - onAskAna / onOpenEditor are no-op spies.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import * as React from 'react';

// ─── Component imports (all new surfaces + shared components from this session) ─
import { DocumentsPanel } from '../../client/src/concept2cure/mdx/components/DocumentsPanel';
import { EsignModal } from '../../client/src/concept2cure/mdx/components/EsignModal';
import { EngineeringSurface } from '../../client/src/concept2cure/mdx/surfaces/EngineeringSurface';
import { UdiSurface } from '../../client/src/concept2cure/mdx/surfaces/UdiSurface';
import { PostmarketSurface } from '../../client/src/concept2cure/mdx/surfaces/PostmarketSurface';
import { AnalyticsSurface } from '../../client/src/concept2cure/mdx/surfaces/AnalyticsSurface';
import { MemorySurface } from '../../client/src/concept2cure/mdx/surfaces/MemorySurface';
import { AdminSurface } from '../../client/src/concept2cure/mdx/surfaces/AdminSurface';
import { VaultSurface } from '../../client/src/concept2cure/mdx/surfaces/VaultSurface';
import { NotificationsSurface } from '../../client/src/concept2cure/mdx/surfaces/NotificationsSurface';
import { TemplatesSurface } from '../../client/src/concept2cure/mdx/surfaces/TemplatesSurface';
import { QualitySurface } from '../../client/src/concept2cure/mdx/surfaces/QualitySurface';
import { IvdSurface } from '../../client/src/concept2cure/mdx/surfaces/IvdSurface';
import { IvdrSurface } from '../../client/src/concept2cure/mdx/surfaces/IvdrSurface';
import { CdxSurface } from '../../client/src/concept2cure/mdx/surfaces/CdxSurface';
import { LdtSurface } from '../../client/src/concept2cure/mdx/surfaces/LdtSurface';
import { SearchSurface } from '../../client/src/concept2cure/mdx/surfaces/SearchSurface';
import { OnboardingSurface } from '../../client/src/concept2cure/mdx/surfaces/OnboardingSurface';
import { ConversationsSurface } from '../../client/src/concept2cure/mdx/surfaces/ConversationsSurface';

import type { Program } from '../../client/src/concept2cure/mdx/data/programs';

const MOCK_PROGRAM: Program = {
  id: 'p-test',
  title: 'BX-204 CGM',
  code: 'BX-204',
  pathway: 'k510',
  stage: 'Verification',
  stageIdx: 5,
  readiness: 64,
  status: 'active',
  lead: 'Jordan Chen',
  owners: ['JC'],
  nextBlocker: null,
  dueLabel: 'Filing · Q3 2026',
  dueTone: 'ok',
  lastActivity: '3h ago',
  meta: 'Continuous glucose monitor',
};

const askAna = vi.fn();
const openEditor = vi.fn();

const errorLog: unknown[] = [];
let origError: typeof console.error;
let origWarn: typeof console.warn;

beforeEach(() => {
  cleanup();
  askAna.mockClear();
  openEditor.mockClear();
  errorLog.length = 0;
  // jsdom doesn't ship a fetch polyfill in older versions — provide one.
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 404,
    text: async () => 'Not Found',
    json: async () => ({ data: null }),
  }) as unknown as typeof fetch;

  // Capture React/JSX warnings as errors so we surface things like
  // "function components cannot have refs" or invalid prop types.
  origError = console.error;
  origWarn = console.warn;
  console.error = (...args: unknown[]) => {
    errorLog.push(['error', ...args]);
  };
  console.warn = (...args: unknown[]) => {
    // Most React warnings (key prop, ref issues) come through console.error,
    // but capture warn too just in case.
    errorLog.push(['warn', ...args]);
  };

  // Reset localStorage so view-mode prefs don't bleed between tests.
  try {
    window.localStorage.clear();
  } catch {
    /* jsdom may not implement localStorage in some configs — ignore */
  }
});

function assertNoReactErrors() {
  // Filter to React-specific complaints — ignore expected fetch-loading
  // info-level traffic. React errors all go through console.error.
  const reactErrors = errorLog.filter((entry) => {
    const [, ...rest] = entry as [string, unknown];
    const text = rest.map((x) => String(x)).join(' ');
    if (text.includes('not wrapped in act')) return false; // common test-mode noise
    if (text.includes('jsdom')) return false;
    return true;
  });
  // Restore console first so any failure assertion message prints.
  console.error = origError;
  console.warn = origWarn;
  if (reactErrors.length > 0) {
    throw new Error(
      `React surface logged ${reactErrors.length} error/warning(s):\n` +
        reactErrors
          .map((e) => JSON.stringify(e).slice(0, 240))
          .join('\n'),
    );
  }
}

describe('design-system surface smoke tests', () => {
  it('DocumentsPanel renders an empty doc list without error', () => {
    const { container } = render(<DocumentsPanel docs={[]} />);
    expect(container.querySelector('section.section')).toBeTruthy();
    assertNoReactErrors();
  });

  it('EsignModal renders open state without throwing', () => {
    render(
      <EsignModal
        open={true}
        action="Approve CAPA-0042"
        target="capa-0042"
        onCancel={() => {}}
        onConfirm={() => Promise.resolve()}
      />,
    );
    assertNoReactErrors();
  });

  it('EsignModal renders nothing when closed', () => {
    const { container } = render(
      <EsignModal
        open={false}
        action="—"
        target="—"
        onCancel={() => {}}
        onConfirm={() => Promise.resolve()}
      />,
    );
    expect(container.querySelector('.esig-backdrop')).toBeNull();
    assertNoReactErrors();
  });

  // ─── Phase 4 ─────────────────────────────────────────────────────────
  it('EngineeringSurface renders with program context', () => {
    const { getByText } = render(
      <EngineeringSurface
        program={MOCK_PROGRAM}
        onAskAna={askAna}
        onOpenEditor={openEditor}
      />,
    );
    expect(getByText('Device engineering')).toBeTruthy();
    assertNoReactErrors();
  });

  it('EngineeringSurface renders with null program', () => {
    render(
      <EngineeringSurface program={null} onAskAna={askAna} onOpenEditor={openEditor} />,
    );
    assertNoReactErrors();
  });

  it('UdiSurface renders', () => {
    const { getByText } = render(<UdiSurface onAskAna={askAna} onOpenEditor={openEditor} />);
    expect(getByText('UDI and labeling')).toBeTruthy();
    assertNoReactErrors();
  });

  it('PostmarketSurface renders', () => {
    const { getByText } = render(
      <PostmarketSurface onAskAna={askAna} onOpenEditor={openEditor} />,
    );
    expect(getByText('Post-market vigilance')).toBeTruthy();
    assertNoReactErrors();
  });

  it('AnalyticsSurface renders', () => {
    const { getByText } = render(<AnalyticsSurface onAskAna={askAna} />);
    expect(getByText('Analytics')).toBeTruthy();
    assertNoReactErrors();
  });

  it('MemorySurface renders', () => {
    const { getByText } = render(<MemorySurface onAskAna={askAna} />);
    expect(getByText('AnA memory')).toBeTruthy();
    assertNoReactErrors();
  });

  it('AdminSurface renders members tab by default', () => {
    const { getByText } = render(<AdminSurface onAskAna={askAna} />);
    expect(getByText('Admin and access')).toBeTruthy();
    assertNoReactErrors();
  });

  // ─── Phase 5 ─────────────────────────────────────────────────────────
  it('VaultSurface renders', () => {
    const { getByText } = render(
      <VaultSurface onAskAna={askAna} onOpenEditor={openEditor} />,
    );
    expect(getByText('Document vault')).toBeTruthy();
    assertNoReactErrors();
  });

  it('NotificationsSurface renders', () => {
    const { getByText } = render(<NotificationsSurface onAskAna={askAna} />);
    expect(getByText('Notifications')).toBeTruthy();
    assertNoReactErrors();
  });

  it('TemplatesSurface renders', () => {
    const { container } = render(
      <TemplatesSurface onAskAna={askAna} onOpenEditor={openEditor} />,
    );
    /* "Templates" appears in the h1 + section header; assert the page
       title h1 specifically. */
    const h1 = container.querySelector('h1.page-title');
    expect(h1?.textContent).toBe('Templates');
    assertNoReactErrors();
  });

  it('QualitySurface renders', () => {
    const { getByText } = render(
      <QualitySurface onAskAna={askAna} onOpenEditor={openEditor} />,
    );
    expect(getByText('Quality system')).toBeTruthy();
    assertNoReactErrors();
  });

  // ─── Phase 6 ─────────────────────────────────────────────────────────
  it('IvdSurface renders', () => {
    const { getByText } = render(
      <IvdSurface program={MOCK_PROGRAM} onAskAna={askAna} onOpenEditor={openEditor} />,
    );
    expect(getByText('IVD pathway')).toBeTruthy();
    assertNoReactErrors();
  });

  it('IvdrSurface renders', () => {
    const { getByText } = render(
      <IvdrSurface program={MOCK_PROGRAM} onAskAna={askAna} onOpenEditor={openEditor} />,
    );
    expect(getByText('EU IVDR')).toBeTruthy();
    assertNoReactErrors();
  });

  it('CdxSurface renders', () => {
    const { getByText } = render(
      <CdxSurface program={MOCK_PROGRAM} onAskAna={askAna} onOpenEditor={openEditor} />,
    );
    expect(getByText('Companion diagnostic co-development')).toBeTruthy();
    assertNoReactErrors();
  });

  it('LdtSurface renders', () => {
    const { getByText } = render(
      <LdtSurface onAskAna={askAna} onOpenEditor={openEditor} />,
    );
    expect(getByText('LDT compliance — FDA 2024 rule')).toBeTruthy();
    assertNoReactErrors();
  });

  // ─── Phase 8 ─────────────────────────────────────────────────────────
  it('SearchSurface renders', () => {
    const { getByText } = render(
      <SearchSurface program={MOCK_PROGRAM} onAskAna={askAna} />,
    );
    expect(getByText('Global search')).toBeTruthy();
    assertNoReactErrors();
  });

  it('OnboardingSurface renders', () => {
    const { getByText } = render(<OnboardingSurface onAskAna={askAna} />);
    expect(getByText('Migration importer')).toBeTruthy();
    assertNoReactErrors();
  });

  it('ConversationsSurface renders', () => {
    const { getByText } = render(
      <ConversationsSurface program={MOCK_PROGRAM} onAskAna={askAna} />,
    );
    expect(getByText('AnA conversation history')).toBeTruthy();
    assertNoReactErrors();
  });
});
