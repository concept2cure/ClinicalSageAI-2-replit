// @vitest-environment jsdom
/**
 * `device-diagnostics` with no project open says no project is selected.
 *
 * Second pass, after audit: the leaf now fails closed by itself as well (the
 * last describe), and the positive control proves the reads matcher sees the
 * real hook URLs, so "no IVDR read" can fail.
 *
 * Slice 0 of the placement map (`device-diagnostics` row) names
 * `IvdSurface.tsx:48,133-163`: mounted with `program={null}` the leaf reads
 * "Stage 4 of 7 — Clinical evidence · Notified body review" with three stages
 * ticked, and its panels read the whole organisation. That branch is real (the
 * red log for this file shows it, mounting the leaf directly), but a client
 * does not reach it: MdxSurfaceHost mounts no device leaf without the shell's
 * selected project (62a8d5e7f, before the map's base f8e0d3210) and renders
 * "Open a project to continue" with a way to Projects instead.
 *
 * This file pins that reachable path with the REAL IvdSurface (not a mock), so
 * a host that ever mounted the leaf without a project fails here on the stage
 * text, the ticked strip and the organisation-wide reads. The positive case
 * proves the same selectors see the leaf when a project is open.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Program } from '../../data/programs';
import type { SurfaceViewProps } from '../../../v2/surfaceViews';

vi.mock('@/utils/authToken', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/utils/authToken')>(),
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

const state = vi.hoisted(() => ({ programs: [] as Program[], loading: false, error: null as string | null, refresh: vi.fn() }));
// The list is mocked; the project's own row (useProgramDetail) is the real hook.
vi.mock('../../hooks/useMdxPrograms', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../hooks/useMdxPrograms')>()),
  useMdxPrograms: () => state,
}));

import { MdxSurfaceHost } from '../../MdxSurfaceHost';
import { IvdSurface } from '../IvdSurface';
import { clearShellProject, publishShellProject } from '../../../v2/shellProject';

const A = '11111111-1111-4111-8111-111111111111';
const IVD = {
  id: A,
  title: 'Dx-1 Assay',
  code: 'IVDR',
  pathway: 'ivdr',
  productType: 'ivd',
  stageIdx: 2,
  status: 'active',
  dueLabel: 'No target set',
} as unknown as Program;

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  state.programs = [IVD];
  state.loading = false;
  state.error = null;
  fetchMock = vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    text: async () => '',
    json: async () =>
      /\/api\/regulatory-programs\/[^/?]+$/.test(String(url)) ? { data: { id: A, phase: 'evidence_collection' } } : { data: [] },
  }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
  clearShellProject();
  sessionStorage.clear();
});

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const props = { surface: { id: 'device-diagnostics' }, onAsk: vi.fn(), onNav: vi.fn(), segment: 'medtech' } as unknown as SurfaceViewProps;
  return render(
    <QueryClientProvider client={client}>
      <MdxSurfaceHost {...props} nav="device-diagnostics" />
    </QueryClientProvider>,
  );
}

function ivdReads(): string[] {
  return fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => /\/api\/(mdx\/)?(ivdr|cdx|clia)/.test(u));
}

function expectNoInventedStage(container: HTMLElement) {
  const text = container.textContent ?? '';
  expect(text).not.toMatch(/Stage \d+ of 7/);
  expect(text).not.toMatch(/Notified body review/);
  expect(container.querySelector('.stage-strip')).toBeNull();
}

describe('device-diagnostics with no project open', () => {
  it('says no project is selected and states no stage', () => {
    const { container } = mount();
    expect(screen.getByTestId('mdx-project-required')).toBeTruthy();
    expect(screen.getByText('Open a project to continue')).toBeTruthy();
    expectNoInventedStage(container);
    // No organisation-wide IVDR, CDx or CLIA read was made on the way.
    expect(ivdReads()).toEqual([]);
  });

  it('says the selection is unavailable, not another stage, when the open project is not readable', () => {
    publishShellProject({ id: '33333333-3333-4333-8333-333333333333' });
    const { container } = mount();
    expect(screen.getByText('The selected device or diagnostic project is unavailable')).toBeTruthy();
    expectNoInventedStage(container);
    expect(ivdReads()).toEqual([]);
  });

  it('positive control: with the project open the leaf mounts, states its recorded phase and reads', async () => {
    publishShellProject({ id: A });
    const { container } = mount();
    expect(container.querySelector('.stage-strip')).not.toBeNull();
    await waitFor(() => expect(container.textContent ?? '').toMatch(/Project phase: Evidence collection · No target set/));
    // The matcher the two cases above rely on sees the real hooks' URLs.
    expect(ivdReads().length).toBeGreaterThan(0);
  });
});

/* Audit [4]: the host's guard was the only thing between a client and the
   leaf's own null branch — a default stage of 3, "IVD device", "Notified body
   review" and four organisation-wide reads. The leaf now refuses by itself. */
describe('IvdSurface mounted with no project', () => {
  it('fails closed by itself: no stage, no subject, no read', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        <IvdSurface program={null} onAskAna={vi.fn()} onOpenEditor={vi.fn()} />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId('ivd-project-required')).toBeTruthy();
    expect(screen.getByText('No project is selected')).toBeTruthy();
    expectNoInventedStage(container);
    expect(container.textContent ?? '').not.toMatch(/IVD device/);
    expect(ivdReads()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
