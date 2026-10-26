// @vitest-environment jsdom
/**
 * The PMA surface states the phase the project's record holds, and no other.
 *
 * Slice 0 of the placement map (`device-pma` row: "it states only the recorded
 * stage, and none when none is recorded"), second pass after audit.
 *
 * What a project records is a generic project phase (planning, evidence
 * collection, authoring, review, submission, post-market). `derivePhases` took
 * the kit `stageIdx` that useMdxPrograms derives from it and mapped that onto
 * the ten PMA phases through a table its own comment calls an approximation,
 * and the header stated the result as the project's position:
 *
 *   recorded `authoring`              → "Phase 4 of 10 — Manufacturing validation"
 *   status `submitted` (filed, at FDA) → "Phase 9 of 10 — Approval"
 *   no phase recorded, 0% progress     → "Phase 2 of 10 — Preclinical"
 *
 * The last one is the hook, not the table: deriveStageIdx invents a stage from
 * progress bands when no phase is recorded. A first pass of this test reached
 * "no phase" only by handing the surface stageIdx -1, which no production path
 * produces. This file mounts the real host and the real useMdxPrograms, so the
 * stage the surface used to read is the one production computes.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, renderHook, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { MdxSurfaceHost } from '../../MdxSurfaceHost';
import { useRecordedPhaseLine } from '../PmaSurface';
import { clearShellProject, publishShellProject } from '../../../v2/shellProject';
import type { SurfaceViewProps } from '../../../v2/surfaceViews';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

const ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

/** A `/api/regulatory-programs` row, as the route returns it. */
const pmaRow = (over: Record<string, unknown> = {}) => ({
  id: ID,
  name: 'CV-1 Implantable Monitor',
  code: 'CV-1',
  description: null,
  programType: 'PMA',
  productType: 'device',
  deviceClass: 'III',
  regulatoryPath: 'pma',
  primaryAgency: 'FDA',
  productName: 'CV-1 Implantable Monitor',
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

/** The list and the project's own row answer with `row`; everything else is empty. */
function stubFetch(row: Record<string, unknown>, opts: { detailStatus?: number } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (/\/api\/regulatory-programs$/.test(url)) return json({ data: [row] });
      if (/\/api\/regulatory-programs\/[^/?]+$/.test(url)) {
        return opts.detailStatus ? json({ error: 'unavailable' }, opts.detailStatus) : json({ data: row });
      }
      return json({ data: [] });
    }),
  );
}

function mount() {
  publishShellProject({ id: ID });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const props = { surface: { id: 'device-pma' }, onAsk: vi.fn(), onNav: vi.fn(), segment: 'medtech' } as unknown as SurfaceViewProps;
  return render(
    <QueryClientProvider client={client}>
      <MdxSurfaceHost {...props} nav="device-pma" />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  clearShellProject();
  sessionStorage.clear();
});

/** The sentence under "PMA pathway · …" — the surface's statement of position. */
function phaseLine(container: HTMLElement): string {
  const title = Array.from(container.querySelectorAll('.section-title')).find((el) =>
    (el.textContent ?? '').startsWith('PMA pathway'),
  );
  return title?.parentElement?.querySelector('.section-sub')?.textContent ?? '';
}

function grid(container: HTMLElement) {
  return Array.from(container.querySelectorAll('.phases .phase')).map((el) => ({
    label: el.querySelector('.phase-label')?.textContent ?? '',
    pct: el.querySelector('.phase-pct')?.textContent ?? '',
    cls: el.className,
  }));
}

async function settle(container: HTMLElement, expected: RegExp) {
  await waitFor(() => expect(container.querySelectorAll('.phases .phase').length).toBe(10));
  await waitFor(() => expect(phaseLine(container)).toMatch(expected));
}

function expectNoPmaPosition(container: HTMLElement) {
  const rows = grid(container);
  // No PMA phase is recorded for a project, so none is lit, ticked or blocked.
  expect(rows.filter((r) => /\b(active|blocked|complete)\b/.test(r.cls))).toEqual([]);
  // progress_percent is the project's, not any one phase's.
  expect(rows.filter((r) => /\d+%/.test(r.pct))).toEqual([]);
}

describe('PmaSurface — states the recorded project phase, through the real host', () => {
  it('a recorded `authoring` reads as the project phase, not "Manufacturing validation"', async () => {
    stubFetch(pmaRow());
    const { container } = mount();
    await settle(container, /^Project phase: Authoring · No target set$/);
    expect(phaseLine(container)).not.toMatch(/Phase \d+ of 10|Manufacturing validation/);
    expectNoPmaPosition(container);
  });

  it('no recorded phase states none — the hook\'s progress-band stage is not one', async () => {
    stubFetch(pmaRow({ phase: null, progressPercent: 0 }));
    const { container } = mount();
    await settle(container, /^No project phase recorded · No target set$/);
    expect(phaseLine(container)).not.toMatch(/Phase \d+ of 10|Preclinical/);
    expectNoPmaPosition(container);
  });

  it('a filed PMA is not in the Approval phase', async () => {
    stubFetch(pmaRow({ status: 'submitted', phase: 'submission' }));
    const { container } = mount();
    await settle(container, /^Project phase: Submission · /);
    expect(phaseLine(container)).not.toMatch(/Approval/);
    expectNoPmaPosition(container);
  });

  it('a failed read of the project row says so — it is not "no phase recorded"', async () => {
    stubFetch(pmaRow(), { detailStatus: 500 });
    const { container } = mount();
    await settle(container, /^The project phase could not be read · No target set$/);
    expectNoPmaPosition(container);
  });
});

/* Audit 2 [0]: a 200 whose body carries no row of this project's left
   useRecordedPhaseLine on "Reading the project phase" for as long as the screen
   stayed open — a finished read shown as one in flight. The detail response is
   held, so the test sees the read start ("Reading…") before it lets it settle. */
describe('PmaSurface — a read that settles with no row of this project is not "Reading"', () => {
  const unusable: Array<[string, unknown]> = [
    ['an empty object', {}],
    ['a null row', { data: null }],
    ['another project\'s row', { data: pmaRow({ id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', phase: 'review' }) }],
  ];

  it.each(unusable)('%s', async (_name, body) => {
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (/\/api\/regulatory-programs$/.test(url)) return json({ data: [pmaRow()] });
        if (/\/api\/regulatory-programs\/[^/?]+$/.test(url)) {
          await held;
          return json(body);
        }
        return json({ data: [] });
      }),
    );
    const { container } = mount();
    // The read has started and is reported as in flight.
    await settle(container, /^Reading the project phase · No target set$/);
    release();
    // Once it settles the line stops claiming a read is in progress …
    await waitFor(() => expect(phaseLine(container)).not.toMatch(/^Reading the project phase/));
    // … and says the read failed: neither "none recorded" nor another project's phase.
    expect(phaseLine(container)).toBe('The project phase could not be read · No target set');
    expectNoPmaPosition(container);
  });
});

/* Audit 2 [0], the related effect: on the render after a switch of project the
   hook still held the previous project's error (useFetchJson clears it only in
   its effect), so project B read "The project phase could not be read" before
   any read of B had started. Every value the hook returns is recorded, so a
   one-render line is seen. The stale-row half is pinned beside it: project A's
   phase is never stated for B. */
describe('useRecordedPhaseLine — a switch of project states nothing of the previous one', () => {
  const A = '11111111-1111-4111-8111-111111111111';
  const B = '22222222-2222-4222-8222-222222222222';

  function stubDetails(answers: Record<string, () => Promise<Response>>) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const id = String(input).match(/\/api\/regulatory-programs\/([^/?]+)$/)?.[1];
        return id && answers[id] ? answers[id]() : json({ data: [] });
      }),
    );
  }

  function track(initial: string) {
    const seen: Array<{ id: string; line: string | null }> = [];
    const hook = renderHook(({ id }: { id: string }) => {
      const line = useRecordedPhaseLine(id);
      seen.push({ id, line });
      return line;
    }, { initialProps: { id: initial } });
    return { hook, seen };
  }

  it('B does not inherit A\'s failed read', async () => {
    stubDetails({ [A]: async () => json({ error: 'unavailable' }, 500), [B]: () => new Promise<Response>(() => {}) });
    const { hook, seen } = track(A);
    await waitFor(() => expect(hook.result.current).toBe('The project phase could not be read'));
    hook.rerender({ id: B });
    await waitFor(() => expect(hook.result.current).toBe('Reading the project phase'));
    expect(seen.filter((s) => s.id === B).map((s) => s.line)).not.toContain('The project phase could not be read');
  });

  it('B never shows A\'s recorded phase', async () => {
    stubDetails({
      [A]: async () => json({ data: pmaRow({ id: A, phase: 'authoring' }) }),
      [B]: () => new Promise<Response>(() => {}),
    });
    const { hook, seen } = track(A);
    await waitFor(() => expect(hook.result.current).toBe('Project phase: Authoring'));
    hook.rerender({ id: B });
    await waitFor(() => expect(hook.result.current).toBe('Reading the project phase'));
    expect(seen.filter((s) => s.id === B).map((s) => s.line)).not.toContain('Project phase: Authoring');
  });
});
