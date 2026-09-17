// @vitest-environment jsdom
/**
 * The 510(k) and overview surfaces show a tenant its OWN state, or nothing.
 *
 * Four fixture leaks survived the sample-mode gate because they never went
 * through it (docs/reports/device-market-readiness-2026-09-07.md §3):
 *
 *   - with no program selected, the 510(k) header read "BX-204 Continuous
 *     Glucose Monitor · Stage 5 of 7 · FDA filing · 41 days", and "BX-204 CGM"
 *     travelled into the SE matrix header and the AnA prompts;
 *   - the eSTAR panel's blocker count fell back to the fixture ungated, so an
 *     empty tenant read "0 sections · 1 blocker";
 *   - the shadow-service banner promised "canonical example data" below it that
 *     the gate correctly withheld;
 *   - the overview's health strip rendered MDX_HEALTH ("Active programs 14",
 *     "Down 3 pts vs last week", "FDA review cycle 87d") for an empty tenant.
 *
 * Sample mode is off here, as it always is in production.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { K510Surface } from '../surfaces/K510Surface';
import { Overview } from '../surfaces/Overview';
import type { Program } from '../data/programs';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubFetch(status: (url: string) => number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const code = status(url);
      return new Response(code === 200 ? JSON.stringify({ data: [] }) : '', {
        status: code,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
}

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const PROGRAM: Program = {
  id: 'a2b4c6d8-0000-0000-0000-000000000001',
  title: 'Acme Pulse Oximeter',
  code: 'AP-1',
  pathway: 'k510',
  stage: 'Testing',
  stageIdx: 2,
  readiness: 30,
  status: 'active',
  lead: 'R. Lee',
  owners: ['RL'],
  nextBlocker: null,
  dueLabel: 'FDA filing · 120 days',
  dueTone: 'ok',
  lastActivity: '1d ago',
  meta: '',
  productType: 'device',
};

describe('510(k) surface with no program selected (sample mode off)', () => {
  it('renders no fixture device, stage, clock or subject name', () => {
    stubFetch(() => 200);
    const { container } = wrap(<K510Surface program={null} onAskAna={() => {}} />);
    const text = container.textContent ?? '';
    expect(text).not.toContain('BX-204');
    expect(text).not.toMatch(/Stage \d+ of \d+/);
    expect(text).not.toContain('41 days');
    expect(text).toContain('No program selected');
  });

  it('reports zero blockers when it has zero sections', () => {
    stubFetch(() => 200);
    const { container } = wrap(<K510Surface program={null} onAskAna={() => {}} />);
    expect(container.textContent).toContain('0 sections · 0 blockers');
  });
});

describe('510(k) surface with a program whose predicate service is unreachable', () => {
  it('shows its own stage and clock, and a banner that does not promise example rows', async () => {
    stubFetch((url) => (url.includes('predicate') || url.includes('se-matrix') ? 503 : 200));
    const { container } = wrap(<K510Surface program={PROGRAM} onAskAna={() => {}} />);
    const text = () => container.textContent ?? '';
    expect(text()).toContain('Acme Pulse Oximeter');
    expect(text()).toMatch(/Stage 3 of \d+/);
    expect(text()).toContain('FDA filing · 120 days');
    await waitFor(() => expect(text()).toContain('Predicate intelligence'));
    expect(text()).not.toContain('canonical example data');
    expect(text()).not.toContain('BX-204');
  });
});

describe('overview with an empty tenant (sample mode off)', () => {
  it('derives the health strip from the empty list, never from MDX_HEALTH', () => {
    stubFetch(() => 200);
    const { container } = wrap(<Overview programs={[]} onOpenProgram={() => {}} onAskAna={() => {}} />);
    const text = container.textContent ?? '';
    expect(text).not.toContain('Down 3 pts');
    expect(text).not.toContain('9 510(k) · 4 PMA');
    expect(text).not.toContain('Current cohort');
    expect(text).not.toContain('DX-102');
    expect(text).toContain('Active programs');
  });
});
