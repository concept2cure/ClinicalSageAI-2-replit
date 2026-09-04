// @vitest-environment jsdom
/**
 * The official eSTAR's family AND pathway follow the program, not the surface.
 *
 * Family: an IVD program that files a 510(k) has pathway k510 (regulatory_path
 * '510k'), so the host routes it to the 510(k) surface — which used to mount
 * the official-eSTAR panel with a literal variant="device". Every IVD 510(k)
 * would have been previewed and filled on the nIVD form. The variant now
 * follows the program's product type.
 *
 * Pathway: the kit folds De Novo into k510, so a De Novo program ALSO lands on
 * the 510(k) surface — which used to mount the panel with the default type
 * '510k'. Every De Novo would have been previewed and filled on the 510(k)
 * field map. The type now follows the program's regulatory path, and the PMA
 * surface mounts the panel as a PMA.
 *
 * This mounts the real host and the real surfaces to prove the wiring, not the
 * pure functions alone.
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

function renderHost(nav: 'device-510k' | 'device-pma') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MdxSurfaceHost {...props} nav={nav} />
    </QueryClientProvider>,
  );
}

const renderK510 = () => renderHost('device-510k');
const renderPma = () => renderHost('device-pma');

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('510(k) surface — the official eSTAR family follows the program', () => {
  it('an IVD program on the 510(k) surface is produced on the IVD eSTAR', async () => {
    stubFetch([IVD_510K_ROW]);
    renderK510();
    await waitFor(() =>
      expect(screen.getByText('Official eSTAR · 510(k) · IVD eSTAR')).toBeTruthy(),
    );
    expect(screen.queryByText(/· nIVD eSTAR/)).toBeNull();
  });

  it('a device program on the 510(k) surface is produced on the nIVD eSTAR', async () => {
    stubFetch([{ ...IVD_510K_ROW, id: 'a2b4c6d8-0000-0000-0000-00000000dev1', productType: 'device', productName: 'BX-204 CGM' }]);
    renderK510();
    await waitFor(() =>
      expect(screen.getByText('Official eSTAR · 510(k) · nIVD eSTAR')).toBeTruthy(),
    );
  });
});

describe('the official eSTAR pathway follows the program, not the surface', () => {
  it('a De Novo program on the 510(k) surface is produced as a De Novo, on its family', async () => {
    stubFetch([
      {
        ...IVD_510K_ROW,
        id: 'a2b4c6d8-0000-0000-0000-0000000dnov1',
        programType: 'DE_NOVO',
        regulatoryPath: 'de_novo',
        productType: 'ivd',
      },
    ]);
    renderK510();
    await waitFor(() =>
      expect(screen.getByText('Official eSTAR · De Novo · IVD eSTAR')).toBeTruthy(),
    );
    expect(screen.queryByText(/Official eSTAR · 510\(k\)/)).toBeNull();
    // The reads made FOR THIS PROGRAM carry its pathway, not the surface's
    // default. The field read needs the ident, so it only ever fires once the
    // row has resolved; the readiness probe also runs on the pre-load frame
    // (no program yet ⇒ 510k), so the one that matters is the last.
    const fetchSpy = globalThis.fetch as unknown as { mock: { calls: unknown[][] } };
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    const fieldReads = urls.filter((u) => u.includes('/estar/official-fields'));
    const readinessReads = urls.filter((u) => u.includes('/estar/readiness'));
    expect(fieldReads.length).toBeGreaterThan(0);
    expect(fieldReads.every((u) => u.includes('type=de_novo') && u.includes('variant=ivd'))).toBe(true);
    expect(readinessReads[readinessReads.length - 1]).toContain('type=de_novo');
  });

  it('a PMA program on the PMA surface is produced as a PMA, on its family', async () => {
    stubFetch([
      {
        ...IVD_510K_ROW,
        id: 'a2b4c6d8-0000-0000-0000-000000000pma1',
        name: 'CV-330 Implantable Monitor',
        code: 'CV-330',
        productName: 'CV-330 Implantable Monitor',
        programType: 'PMA',
        regulatoryPath: 'pma',
        productType: 'device',
        deviceClass: 'III',
      },
    ]);
    renderPma();
    // The PMA surface's pathway word is fixed, so the header reads "PMA" from
    // the first frame; wait for the PROGRAM to resolve (its title in the
    // surface header) and for the field read that needs its ident.
    await waitFor(() => expect(screen.getByText(/PMA pathway · CV-330 Implantable Monitor/)).toBeTruthy());
    expect(screen.getByText('Official eSTAR · PMA · nIVD eSTAR')).toBeTruthy();
    // The draft package control stays — it is the authored-content ZIP, not
    // the official eSTAR — and the one Generate control sits beside it.
    expect(screen.getByRole('button', { name: /Export PMA package \(draft\)/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Generate official eSTAR \(PDF\)/ })).toBeTruthy();
    const fetchSpy = globalThis.fetch as unknown as { mock: { calls: unknown[][] } };
    const urls = () => fetchSpy.mock.calls.map((c) => String(c[0]));
    await waitFor(() =>
      expect(urls().filter((u) => u.includes('/estar/official-fields')).length).toBeGreaterThan(0),
    );
    const fieldReads = urls().filter((u) => u.includes('/estar/official-fields'));
    const readinessReads = urls().filter((u) => u.includes('/estar/readiness'));
    expect(fieldReads.every((u) => u.includes('type=pma') && u.includes('variant=device'))).toBe(true);
    // The PMA surface's type is fixed, so every readiness probe — including
    // the pre-load frame — already says pma.
    expect(readinessReads.length).toBeGreaterThan(0);
    expect(readinessReads.every((u) => u.includes('type=pma'))).toBe(true);
  });

  it('an IVD PMA program on the PMA surface is produced as a PMA on the IVD eSTAR', async () => {
    stubFetch([
      {
        ...IVD_510K_ROW,
        id: 'a2b4c6d8-0000-0000-0000-000000000pma2',
        programType: 'PMA',
        regulatoryPath: 'pma',
        productType: 'ivd',
        deviceClass: 'III',
      },
    ]);
    renderPma();
    await waitFor(() =>
      expect(screen.getByText('Official eSTAR · PMA · IVD eSTAR')).toBeTruthy(),
    );
  });
});
