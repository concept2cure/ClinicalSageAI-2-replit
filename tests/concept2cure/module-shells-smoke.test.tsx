/**
 * @vitest-environment jsdom
 *
 * Smoke tests for every top-level Claude Design module shell — the
 * default-export Route components that ZenApp.tsx lazy-loads. The MDX
 * surfaces are covered by sibling suites; this one guards the OTHER ten
 * route shells that have no smoke coverage today:
 *
 *   PDEV · CMC · Risk · Biopharma · Authoring · Labeling · Tasking ·
 *   Submission · Intelligence · ProjectDetail
 *
 * Each must mount without throwing and produce DOM. ProjectDetail asserts
 * its graceful loading state (it needs a real backend to render data) so
 * a regression that hard-crashes the route fails CI.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';

import PdevRoute         from '../../client/src/concept2cure/pdev/PdevRoute';
import CmcRoute          from '../../client/src/concept2cure/cmc/CmcRoute';
import RiskRoute         from '../../client/src/concept2cure/risk/RiskRoute';
import BiopharmaRoute    from '../../client/src/concept2cure/biopharma/BiopharmaRoute';
import AuthoringRoute    from '../../client/src/concept2cure/authoring/AuthoringRoute';
import LabelingRoute     from '../../client/src/concept2cure/labeling/LabelingRoute';
import TaskingRoute      from '../../client/src/concept2cure/tasking/TaskingRoute';
import SubmissionRoute   from '../../client/src/concept2cure/submission/SubmissionRoute';
import IntelligenceRoute from '../../client/src/concept2cure/intelligence/IntelligenceRoute';
import ProjectDetailRoute from '../../client/src/concept2cure/projects/ProjectDetailRoute';

beforeEach(() => {
  cleanup();
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 404,
    text: async () => 'Not Found',
    json: async () => ({ data: null }),
  }) as unknown as typeof fetch;
  try { window.localStorage.clear(); } catch { /* ignore */ }
});

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

function expectAlive(c: HTMLElement) {
  expect((c.textContent || '').trim().length).toBeGreaterThan(0);
  expect(c.querySelectorAll('*').length).toBeGreaterThan(3);
}

describe('Claude Design module shells — mount smoke', () => {
  it('PDEV route mounts and paints',          () => expectAlive(wrap(<PdevRoute />).container));
  it('CMC route mounts and paints',           () => expectAlive(wrap(<CmcRoute />).container));
  it('Risk route mounts and paints',          () => expectAlive(wrap(<RiskRoute />).container));
  it('Biopharma route mounts and paints',     () => expectAlive(wrap(<BiopharmaRoute />).container));
  it('Authoring route mounts and paints',     () => expectAlive(wrap(<AuthoringRoute />).container));
  it('Labeling route mounts and paints',      () => expectAlive(wrap(<LabelingRoute />).container));
  it('Tasking route mounts and paints',       () => expectAlive(wrap(<TaskingRoute />).container));
  it('Submission route mounts and paints',    () => expectAlive(wrap(<SubmissionRoute />).container));
  it('Intelligence route mounts and paints',  () => expectAlive(wrap(<IntelligenceRoute />).container));

  it('ProjectDetail route renders its graceful loading state', () => {
    const { container } = wrap(<ProjectDetailRoute projectId="demo" onBack={() => {}} />);
    // No backend in jsdom → the route must show its loading copy, not crash.
    expect(container.textContent || '').toMatch(/Loading project/i);
  });
});
