// @vitest-environment jsdom
/**
 * An IVD program that files a 510(k) is produced on the IVD eSTAR.
 *
 * Its pathway is k510 (regulatory_path '510k'), so the host routes it to the
 * 510(k) surface — which used to mount the official-eSTAR panel with a literal
 * variant="device". Every IVD 510(k) would have been previewed and filled on
 * the nIVD form. The variant now follows the program's product type; this
 * mounts the real host and the real surface to prove the wiring, not the pure
 * function alone.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { MdxSurfaceHost } from '../MdxSurfaceHost';
import type { SurfaceViewProps } from '../../v2/surfaceViews';

const IVD_510K_ROW = {
  id: 'a2b4c6d8-0000-0000-0000-00000000ivd1',
  name: 'DX-102 IVD Cartridge',
  code: 'DX-102',
  description: null,
  programType: '510K',
  productType: 'ivd',
  deviceClass: 'II',
  regulatoryPath: '510k',
  primaryAgency: 'FDA',
  productName: 'DX-102 IVD Cartridge',
  status: 'active',
  phase: 'authoring',
  priority: null,
  targetSubmissionDate: null,
  progressPercent: 40,
  completedMilestones: 0,
  totalMilestones: 0,
  leadUserId: null,
  leadUserName: null,
  teamMembers: null,
  metadata: null,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-02T00:00:00Z',
};

function stubFetch(programs: unknown[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes('/api/regulatory-programs') ? { data: programs } : { data: [] };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
}

const props = {
  surface: { id: 'device-510k' },
  onAsk: () => {},
  onNav: () => {},
  segment: 'medtech',
} as unknown as SurfaceViewProps;

function renderK510() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MdxSurfaceHost {...props} nav="device-510k" />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('510(k) surface — the official eSTAR family follows the program', () => {
  it('an IVD program on the 510(k) surface is produced on the IVD eSTAR', async () => {
    stubFetch([IVD_510K_ROW]);
    renderK510();
    await waitFor(() =>
      expect(screen.getByText(/Official eSTAR · administrative data · IVD eSTAR/)).toBeTruthy(),
    );
    expect(screen.queryByText(/administrative data · nIVD eSTAR/)).toBeNull();
  });

  it('a device program on the 510(k) surface is produced on the nIVD eSTAR', async () => {
    stubFetch([{ ...IVD_510K_ROW, id: 'a2b4c6d8-0000-0000-0000-00000000dev1', productType: 'device', productName: 'BX-204 CGM' }]);
    renderK510();
    await waitFor(() =>
      expect(screen.getByText(/Official eSTAR · administrative data · nIVD eSTAR/)).toBeTruthy(),
    );
  });
});
