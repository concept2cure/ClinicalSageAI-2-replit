// @vitest-environment jsdom
/**
 * What the CRL library tells AnA DURING a refetch.
 *
 * useLiveData keeps the previous query's `data` while a new fetch is in flight,
 * and this surface rebuilds its request path from the committed filters on every
 * Search. So the instant a person narrows the filters and searches, the old
 * results are still in `res.data` while the summary's filter list is the NEW
 * query. Gating the AnA channel on `res.loading && !res.data` let the memo fall
 * through and publish the PRIOR search's count as the answer to the new filters
 * (and a prior genuine zero as a false "no findings for these constraints").
 *
 * This pins that a search in progress is reported as in-progress, not as an
 * answer — the memo gates on res.loading alone, like every sibling surface.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { useActiveSurfaceContext, type SurfaceContext } from '../surfaceContext';
import type { SurfaceViewProps } from '../surfaceViews';
import { CrlLibrary } from '../surfaces/CrlLibrary';
import type { FindingSearchView, RegulatoryFindingView } from '../fixtures/clinical-regulatory-evidence';

function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => ({ success: true, data }) } as Response;
}

const FINDING: RegulatoryFindingView = {
  findingId: 'f-1', severity: 'critical', discipline: 'clinical', category: 'endpoint validity',
  finding: 'Primary endpoint does not establish clinically meaningful benefit.',
  requestedAction: 'Provide anchor-based validation', applicability: 'study',
  epistemicStatus: 'explicit', verification: 'source_verified', reviewedAt: '2026-05-14',
  conflict: false, mappings: [],
  source: {
    sourceId: 's-1', applicationType: 'NDA', applicationNumber: '000000', letterDate: '2023-04-11',
    page: null, locator: null, excerpt: null, officialUrl: null, checksum: 'sha256:test', version: 1,
  },
};
const RESULT: FindingSearchView = {
  findings: [FINDING, { ...FINDING, findingId: 'f-2', discipline: 'facility', applicability: 'facility' }],
  coverage: { scanned: 412, eligible: 96, structured: 31, verified: 18, cited: 11, exclusionNote: null, freshness: '2026-07-19' },
};

let seen: SurfaceContext | null = null;
function Probe() {
  seen = useActiveSurfaceContext('crl-library');
  return null;
}

const props = () => ({
  surface: { id: 'crl-library', label: 'FDA CRL library' } as unknown as SurfaceViewProps['surface'],
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biotech',
});

function renderLib() {
  return render(
    <>
      <CrlLibrary {...props()} />
      <Probe />
    </>,
  );
}

beforeEach(() => { seen = null; apiRequest.mockReset(); });
afterEach(cleanup);

describe('CRL library reports an in-flight search as in-flight, never a stale count', () => {
  it('does not publish the previous search’s count as the new filters’ answer during a refetch', async () => {
    let calls = 0;
    apiRequest.mockImplementation(() => {
      calls += 1;
      // First search resolves with 2 findings; the refetch after Search never
      // settles, holding the in-flight window open for the assertion.
      return calls === 1 ? Promise.resolve(ok(RESULT)) : new Promise<Response>(() => {});
    });
    renderLib();
    await waitFor(() => expect(seen?.summary).toMatch(/2 regulatory finding\(s\) match/));

    fireEvent.change(screen.getByPlaceholderText('e.g. clinically meaningful endpoint'), {
      target: { value: 'sterility assurance' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Search/ }));

    // The new search is in flight: AnA must be told so, NOT handed the prior 2.
    await waitFor(() => expect(seen?.summary).toMatch(/still being searched/i));
    expect(seen!.summary).not.toMatch(/2 regulatory finding\(s\) match/);
  });
});
