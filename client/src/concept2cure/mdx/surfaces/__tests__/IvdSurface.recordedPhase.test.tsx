// @vitest-environment jsdom
/**
 * The IVDR stage strip states the phase the project's record holds, and ticks
 * nothing the record does not say is done.
 *
 * Slice 0 of the placement map (`device-diagnostics` row), second pass after
 * audit. The same defect the `device-pma` row names, on its sibling: the strip
 * took the kit `stageIdx` that useMdxPrograms derives from the generic project
 * phase (or, with none recorded, from progress bands), re-labelled it as one of
 * the seven IVDR stages, and marked every stage before it complete with a tick.
 *
 *   recorded `authoring` → "Stage 4 of 7 — Clinical evidence", with Intake,
 *                          Classification and Analytical validation ticked
 *   status `approved`    → stageIdx 7, clamped by Math.min to
 *                          "Stage 7 of 7 — Submit"
 *   no phase recorded    → "Stage 2 of 7 — Classification", Intake ticked
 *
 * Nothing in a project's record says any IVDR stage is done. This mounts the
 * real host and the real useMdxPrograms, so the stage the strip used to read is
 * the one production computes.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { MdxSurfaceHost } from '../../MdxSurfaceHost';
import { clearShellProject, publishShellProject } from '../../../v2/shellProject';
import type { SurfaceViewProps } from '../../../v2/surfaceViews';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

const ID = '44444444-4444-4444-8444-444444444444';

/** A `/api/regulatory-programs` row for an IVDR project, as the route returns it. */
const ivdRow = (over: Record<string, unknown> = {}) => ({
  id: ID,
  name: 'Dx-1 Assay',
  code: 'DX-1',
  description: null,
  programType: 'IVDR',
  productType: 'ivd',
  deviceClass: 'C',
  regulatoryPath: 'ivdr',
  primaryAgency: 'EMA',
  productName: 'Dx-1 Assay',
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
  ...over,
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function stubFetch(row: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (/\/api\/regulatory-programs$/.test(url)) return json({ data: [row] });
      if (/\/api\/regulatory-programs\/[^/?]+$/.test(url)) return json({ data: row });
      return json({ data: [] });
    }),
  );
}

function mount() {
  publishShellProject({ id: ID });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const props = { surface: { id: 'device-diagnostics' }, onAsk: vi.fn(), onNav: vi.fn(), segment: 'medtech' } as unknown as SurfaceViewProps;
  return render(
    <QueryClientProvider client={client}>
      <MdxSurfaceHost {...props} nav="device-diagnostics" />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  clearShellProject();
  sessionStorage.clear();
});

/** The sentence under "IVDR pathway · …" — the surface's statement of position. */
function phaseLine(container: HTMLElement): string {
  const title = Array.from(container.querySelectorAll('.section-title')).find((el) =>
    (el.textContent ?? '').startsWith('IVDR pathway'),
  );
  return title?.parentElement?.querySelector('.section-sub')?.textContent ?? '';
}

/** The strip first (it is drawn as soon as the project is known), then the
    sentence, which waits on the project's own row. */
async function settle(container: HTMLElement, expected: RegExp) {
  await waitFor(() => expect(container.querySelectorAll('.stage-strip .stage-node').length).toBe(7));
  const nodes = Array.from(container.querySelectorAll('.stage-strip .stage-node'));
  // No IVDR stage is recorded for a project: none is ticked, lit or blocked.
  expect(nodes.filter((n) => /\b(complete|active|blocked)\b/.test(n.className)).map((n) => n.textContent)).toEqual([]);
  // Every dot carries its number; a tick (an svg) claims a stage done.
  expect(container.querySelectorAll('.stage-strip .stage-dot svg').length).toBe(0);
  await waitFor(() => expect(phaseLine(container)).toMatch(expected));
  expect(phaseLine(container)).not.toMatch(/Stage \d+ of 7/);
}

describe('IvdSurface — states the recorded project phase, through the real host', () => {
  it('a recorded `authoring` ticks no IVDR stage and names none', async () => {
    stubFetch(ivdRow());
    const { container } = mount();
    await settle(container, /^Project phase: Authoring · No target set$/);
    expect(phaseLine(container)).not.toMatch(/Clinical evidence/);
  });

  it('an approved IVD is not clamped to "Stage 7 of 7 — Submit"', async () => {
    stubFetch(ivdRow({ status: 'approved', phase: 'post_market' }));
    const { container } = mount();
    await settle(container, /^Project phase: Post-market · Complete$/);
    expect(phaseLine(container)).not.toMatch(/Submit/);
  });

  it('no recorded phase states none — the hook\'s progress-band stage is not one', async () => {
    stubFetch(ivdRow({ phase: null, progressPercent: 0 }));
    const { container } = mount();
    await settle(container, /^No project phase recorded · No target set$/);
  });
});
