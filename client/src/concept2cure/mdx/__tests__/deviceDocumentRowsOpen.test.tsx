// @vitest-environment jsdom
/**
 * A device screen's document row opens the record it names, or is not a button.
 *
 * The MDX journey study (.design/client-journey/MDX_JOURNEY_2026-11-01.md, M1),
 * 2026-11-01: Engineering said "Tap any row to open in the editor" and UDI "Tap
 * any row to open in the label editor", and every row was a focusable button
 * that did nothing. MdxSurfaceHost passed no `onOpenEditor` to either screen,
 * so DocumentsPanel's `onOpenEditor?.(d.id)` was a no-op on every click.
 *
 * The rows name three kinds of record (server/routes/mdx-engineering.ts,
 * mdx-udi.ts), and each opens where that record already lives:
 *   - `art-<id>`, a governed artifact: the one editor, through the canonical
 *     `authoring.open-document` action by title, as Vault and the Artifacts
 *     center open one;
 *   - `swl-<id>`, an IEC 62304 software item: the Software screen;
 *   - a labeling document: the Labeling screen.
 * A panel given no handler draws no row button, so no dead control can return.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Program } from '../data/programs';
import type { SurfaceViewProps } from '../../v2/surfaceViews';

const H = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest: (...a: unknown[]) => H.apiRequest(...a),
}));
const programs = vi.hoisted(() => ({ programs: [] as Program[], loading: false, error: null as string | null, refresh: () => {} }));
vi.mock('../hooks/useMdxPrograms', () => ({ useMdxPrograms: () => programs }));

import { DEVICE_SCREEN_ACTIONS, MdxSurfaceHost } from '../MdxSurfaceHost';
import { DocumentsPanel, type KitDocument } from '../components/DocumentsPanel';
import { clearShellProject, publishShellProject } from '../../v2/shellProject';
import { __resetSurfaceActionBus } from '../../v2/surfaceActions';
import { endCompanySession, seedCompanySession } from '../../v2/__tests__/_company-session-fixture';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const answer = (status: number, json: unknown) => ({ ok: status < 300, status, json: async () => json, text: async () => JSON.stringify(json) });
const doc = (id: string, title: string): KitDocument => ({
  id, title, ver: 'v1', status: 'draft', completion: 0, owner: '—', lastEdit: 'today', sections: 0, sectionsComplete: 0,
});

/** GET /api/mdx/engineering/:programId with the project's documents keyed to it. */
const ENGINEERING = {
  data: {
    summary: { dhfCompletion: 0, openEcrs: 0, openRisks: 0, openIssues: 0, riskLastUpdated: null },
    dhf: [], trace: [], risks: [], ecrs: [], issues: [],
    documents: [
      { ...doc('art-41', 'Design verification protocol'), framework: 'cfr820', dhfRef: '4.1' },
      { ...doc('swl-7', 'Software requirements specification'), framework: 'iec62304' },
    ],
  },
  meta: { scopes: { risks: 'program', trace: 'program', dhf: 'organization', ecrs: 'organization', issues: 'organization', documents: 'program' }, unavailable: [] },
};
/** GET /api/mdx/udi?program_id=… with one labeling document. */
const UDI = {
  data: {
    devices: [], symbols: [], translations: [],
    labels: [{ id: 'lab-3', device: 'Aurora pump', kind: 'IFU', lang: 'en', ver: 'v2', status: 'draft', updated: 'today' }],
  },
  meta: { scope: 'program', programId: A, unavailable: [] },
};

function renderHost(nav: string) {
  const onNav = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const props = { surface: { id: nav }, onAsk: () => {}, onNav, segment: 'medtech' } as unknown as SurfaceViewProps;
  render(
    <QueryClientProvider client={client}>
      <MdxSurfaceHost {...props} nav={nav as never} />
    </QueryClientProvider>,
  );
  return onNav;
}

beforeEach(() => {
  seedCompanySession({ organizationId: '7', displayName: 'E. Editor', firstName: 'E.', lastName: 'Editor' }, 'device-document-rows');
  programs.programs = [{ id: A, code: 'ENG-A', title: 'Aurora pump', pathway: 'k510', productType: 'device' } as unknown as Program];
  H.apiRequest.mockReset().mockImplementation(async (_method: string, path: string) => {
    if (path.startsWith('/api/mdx/udi')) return answer(200, UDI);
    return answer(200, { data: [], meta: { count: 0, scope: 'program', programId: A } });
  });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) =>
    answer(200, String(input).startsWith('/api/mdx/udi') ? UDI : ENGINEERING)));
  (window as unknown as { C2C?: unknown }).C2C = { setContext: vi.fn() };
  publishShellProject({ id: A });
});
afterEach(() => {
  cleanup();
  endCompanySession();
  vi.unstubAllGlobals();
  clearShellProject();
  __resetSurfaceActionBus();
  delete (window as unknown as { C2C?: unknown }).C2C;
});

describe('Engineering: each document row opens the record it names', () => {
  it('a software item opens the Software screen', async () => {
    const onNav = renderHost('device-engineering');
    fireEvent.click(await screen.findByRole('button', { name: /Software requirements specification/ }));
    expect(onNav, 'the software row did nothing').toHaveBeenCalledWith('device-software');
  });

  it('a governed artifact opens in the one editor', async () => {
    const onNav = renderHost('device-engineering');
    fireEvent.click(await screen.findByRole('button', { name: /Design verification protocol/ }));
    // `authoring` is the action's surface id; the shell's nav() resolves it to
    // the editor (registryModel.ts DEEP_LINK_ALIASES, authoring → document-authoring),
    // exactly as for Vault's "Open in editor".
    await waitFor(() => expect(onNav, 'the artifact row did nothing').toHaveBeenCalledWith('authoring'));
  });

  it('says where a row opens, not "the editor" for all of them', async () => {
    renderHost('device-engineering');
    await screen.findByRole('button', { name: /Design verification protocol/ });
    expect(document.body.textContent).not.toMatch(/Tap any row to open in the editor/);
  });
});

describe('UDI: a labeling document opens Labeling', () => {
  it('the label row opens the Labeling screen', async () => {
    const onNav = renderHost('device-udi');
    fireEvent.click(await screen.findByRole('button', { name: /Aurora pump — IFU/ }));
    expect(onNav, 'the label row did nothing').toHaveBeenCalledWith('labeling');
  });
});

describe('DocumentsPanel draws no dead row control', () => {
  it('with no handler a row is not a button', () => {
    render(<DocumentsPanel docs={[doc('art-1', 'Risk management plan')]} />);
    expect(screen.queryByRole('button', { name: /Risk management plan/ }), 'a row that opens nothing is still a button').toBeNull();
    expect(screen.getByText('Risk management plan')).toBeTruthy();
  });

  it('with a handler, a click passes the row\'s id and the row itself', () => {
    const open = vi.fn();
    const d = doc('swl-2', 'Software architecture');
    render(<DocumentsPanel docs={[d]} onOpenEditor={open} />);
    fireEvent.click(screen.getByRole('button', { name: /Software architecture/ }));
    expect(open).toHaveBeenCalledWith('swl-2', d);
  });
});

/* M2: AnA was told the device screens have no controls for signatures, uploads
   or profile changes ("never through screen controls"), and repeated it. They
   have all three. And nothing on them sends a filing to an agency. */
describe('what AnA is told about the device screens is true', () => {
  it('names the screens\' own controls, and does not claim they are absent', () => {
    const said = DEVICE_SCREEN_ACTIONS.join(' | ');
    expect(said).not.toMatch(/never through screen controls/);
    expect(said).toMatch(/Sign and file/);
    expect(said).toMatch(/password/);
    expect(said).toMatch(/[Uu]pload/);
    expect(said).toMatch(/device profile/);
  });

  it('says that nothing here sends a filing to an agency', () => {
    expect(DEVICE_SCREEN_ACTIONS.join(' | ')).toMatch(/Nothing on these screens sends a filing to an agency/);
  });
});

/* M17, found walking the journey in the running app (2026-11-02): UDI's empty
   labeling list said "IFUs, package and on-device labels appear here once
   labeling documents are created." and offered only "Check again". A labeling
   document starts in Labeling (M8), so that is the empty state's door. */
describe('UDI with no labeling document opens Labeling', () => {
  it('offers Open Labeling, and it opens the Labeling screen', async () => {
    const empty = { ...UDI, data: { ...UDI.data, labels: [] } };
    vi.stubGlobal('fetch', vi.fn(async () => answer(200, empty)));
    H.apiRequest.mockImplementation(async () => answer(200, empty));
    const onNav = renderHost('device-udi');
    const open = await screen.findByRole('button', { name: 'Open Labeling' }).catch(() => null);
    expect(open, 'the empty labeling list offered no way to where a labeling document starts').not.toBeNull();
    fireEvent.click(open!);
    expect(onNav).toHaveBeenCalledWith('labeling');
  });
});
